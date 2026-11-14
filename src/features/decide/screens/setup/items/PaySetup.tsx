// 06.1-24 (D32, D32V, D32E, D32I): setup item 1, Pay and payday. Pay and other income are series in Activity, written through the
// existing series mutations; the "does pay change" answer and the way Decide counts it go to the income profile through the existing
// setup save. Nothing is stored twice in Decide (ENG-26).
//
//  - Pay found (a live salary series, or a payer found in the records): a card with That's right / Change. Change on a saved series
//    saves at once (one Undo); on a found payer it only changes what Save pay details will create.
//  - No pay found: amount and day fields.
//  - "It changes" / "It changes with the seasons": four ways to count it, none chosen for the person.
//  - Other money coming in: rows with I spend it / It's kept, and + Add other income.
//  - Save pay details creates the pay series when there is none, saves the answers that changed, and goes back to where Pay was
//    opened from (06.1-65 FQ1).
//  - 06.1-65 (FQ4): Save and close runs the same save when something on the page changed; what a sheet already saved stays.
//
// 06.1-54 (G-6, C-3, A-SU-4, C-21, DC-8): "How are you paid?" (the six D-17 answers as chips) sits first; "Salary or wages" is
// pre-picked only when a steady pay series or payer was found and nothing is stored (owner GQ4). Save pay details writes
// income_types whenever the picked set differs from the stored one, so Pay ticks as soon as the save lands, including the no-edit
// path where the found pay is accepted as is. A live income series with no income kind (made in Activity, never marked as pay) is
// shown as found pay too, and is marked as pay on save. The amount is a boxed money field with the currency symbol; the day is a
// picker. A disabled Save says the first missing part (NeedLine).
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useT } from '@/i18n';
import type { RecurringFreq } from '@/engine/recurring';
import type { RecurringSeriesPatch } from '@/db/recurringSeries';
import type { RecurringSeriesRow } from '@/db/rows';
import { useConfirmRegularCandidate, usePatchSeriesAttributes } from '@/data/mutations/seriesAttributes';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { liveSeriesOfKind, payableAccounts } from '@/features/income/seriesHelpers';
import { useIncomeContext } from '@/features/income/useIncomeContext';
import { seriesStatusOf } from '@/features/record/entry/seriesStatus';
import { showToast } from '@/state/undoToast';
import { space, radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { ChoiceCard } from '@/ui/ChoiceCard';
import { Chip } from '@/ui/Chip';
import { hapticLight, hapticSelection } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
import { Text } from '@/ui/Text';
import { Field, FieldLabel, Note } from '@/features/decide/screens/sheets/sheetUi';
import { setAsideFromText, setAsidePatch, setAsideText, showsSetAside } from '@/features/decide/screens/logic/taxSetAside';
import { DayPicker, RadioRow, useFreqWord, useSetupFormat } from './itemFields';
import { OtherIncomeSheet, PayEditSheet, type OtherIncomeValues, type PayEditValues } from './PaySheets';
import { SetupItemFrame, useLeaveItem } from './SetupItemFrame';
import { anchorWithDay, dayOf, nextDateOnDay, type EditSeriesFrom } from './itemLogic';

type Pattern = 'steady' | 'variable' | 'seasonal';
type Method = 'match' | 'spread' | 'steady' | 'balance';
type Hold = 1 | 2 | 3;

const PATTERNS: readonly { value: Pattern; key: 'same' | 'changes' | 'seasons' }[] = [
  { value: 'steady', key: 'same' },
  { value: 'variable', key: 'changes' },
  { value: 'seasonal', key: 'seasons' },
];
const METHODS: readonly { value: Method; key: 'countMatch' | 'countSpread' | 'countSteady' | 'countBalance' }[] = [
  { value: 'match', key: 'countMatch' },
  { value: 'spread', key: 'countSpread' },
  { value: 'steady', key: 'countSteady' },
  { value: 'balance', key: 'countBalance' },
];
// D-17: the six answers, in the order and words of the income profile's "How are you paid?" step (income/steps/PaidStep.tsx).
// Listed here, not imported, so this page does not pull that step's reads in.
const PAID_OPTIONS = [
  { value: 'salary_or_wages', labelKey: 'income.paid.optionSalary' },
  { value: 'commission_or_tips', labelKey: 'income.paid.optionCommission' },
  { value: 'freelance', labelKey: 'income.paid.optionFreelance' },
  { value: 'own_business', labelKey: 'income.paid.optionBusiness' },
  { value: 'pension_or_benefits', labelKey: 'income.paid.optionPension' },
  { value: 'none', labelKey: 'income.paid.optionNone' },
] as const;
const PAID_ORDER: readonly string[] = PAID_OPTIONS.map((o) => o.value);

/** The D-17 answers in display order; "none" stands alone. */
export function toggledTypes(chosen: readonly string[], value: string): string[] {
  const has = chosen.includes(value);
  if (value === 'none') return has ? [] : ['none'];
  const next = has ? chosen.filter((v) => v !== value) : [...chosen.filter((v) => v !== 'none'), value];
  return PAID_ORDER.filter((v) => next.includes(v));
}

/** Two answer sets hold the same values (order does not matter). */
export function sameTypes(a: readonly string[], b: readonly string[] | null | undefined): boolean {
  return b != null && a.length === b.length && a.every((v) => b.includes(v));
}

/**
 * 06.1-54 (A-SU-4): a live income series with no income kind. Activity makes these when a person accepts a regular payment in;
 * Decide already counts it as pay (buildV3Inputs), but it was never shown here because only income_kind 'salary' was looked for,
 * and its arrivals are linked to it so the records scan skips them. The largest one is taken.
 */
export function unmarkedPaySeries(series: readonly RecurringSeriesRow[]): RecurringSeriesRow | null {
  let best: RecurringSeriesRow | null = null;
  for (const s of series) {
    if (s.deleted_at !== null || (s.income_kind ?? null) !== null || s.amount <= 0 || (s.saving_mode ?? null) !== null || (s.goal_id ?? null) !== null) continue;
    if (seriesStatusOf(s).kind !== 'live') continue;
    if (best === null || s.amount > best.amount) best = s;
  }
  return best;
}
const SPREAD_CHOICES = [1, 2, 3, 6, 12] as const;
const HOLD_CHOICES: readonly Hold[] = [1, 2, 3];

const validAmount = (minor: number | null): minor is number => minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR;

type NeedPart = 'howPaid' | 'amount' | 'day' | 'account' | 'count';

/** C-21: the first part Save pay details still waits for, in page order; null when none of these holds it. */
export function firstNeed(f: { types: readonly string[]; hasPay: boolean; hasBasis: boolean; amount: number | null; day: number | null; countDone: boolean }): NeedPart | null {
  if (f.types.length === 0) return 'howPaid';
  // 06.1-81: "No fixed income right now" needs no amount, day or account.
  if (!f.hasPay && !f.types.includes('none')) {
    if (f.hasBasis) return 'account';
    if (!validAmount(f.amount)) return 'amount';
    return f.day === null ? 'day' : 'account';
  }
  return f.countDone ? null : 'count';
}

interface PayBasis {
  amount: number;
  day: number;
  accountId: string | null;
  currency: string;
}

export function PaySetup({ editSeriesFrom }: { editSeriesFrom: EditSeriesFrom }) {
  const t = useT();
  const leave = useLeaveItem();
  const { colors, pairing } = useTheme();
  const fmt = useSetupFormat();
  const freqWord = useFreqWord();
  const ctx = useIncomeContext();
  const householdId = ctx.householdId ?? '';
  const userId = ctx.userId ?? '';
  const confirmer = useConfirmRegularCandidate(householdId, userId);
  const patcher = usePatchSeriesAttributes(householdId, userId);
  const saver = useSaveSetupStep(userId);
  const canWrite = ctx.householdId !== undefined && ctx.userId !== undefined;

  const accounts = useMemo(() => payableAccounts(ctx.accounts), [ctx.accounts]);
  const marked = useMemo(() => liveSeriesOfKind(ctx.series, 'salary')[0] ?? null, [ctx.series]);
  const unmarked = useMemo(() => (marked === null ? unmarkedPaySeries(ctx.series) : null), [marked, ctx.series]);
  // The pay series in Activity: one marked as salary, else an unmarked income series (marked as pay on save).
  const salary = marked ?? unmarked;
  const others = useMemo(
    () => ctx.series.filter((s) => s.deleted_at === null && s.income_kind != null && s.income_kind !== 'salary' && s.amount > 0 && seriesStatusOf(s).kind === 'live'),
    [ctx.series],
  );

  // What a found payer would become when Save pay details runs (a series is only made on save).
  const [draftPay, setDraftPay] = useState<PayEditValues | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [emptyAmount, setEmptyAmount] = useState<number | null>(null);
  const [emptyDay, setEmptyDay] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);

  const stored = ctx.settings;
  const [pattern, setPattern] = useState<Pattern | null>(stored?.income_pattern ?? null);
  const [method, setMethod] = useState<Method | null>(stored?.variable_method ?? null);
  const [spread, setSpread] = useState<number | null>(stored?.spread_months ?? null);
  const [steady, setSteady] = useState<number | null>(stored?.steady_amount ?? null);
  const [hold, setHold] = useState<Hold | null>(stored?.hold_months ?? null);
  const [asideText, setAsideTextValue] = useState(setAsideText(stored?.tax_set_aside_bp));
  const [pickedTypes, setPickedTypes] = useState<string[] | null>(null);

  const accountId = accounts[0]?.id ?? null;
  const basis: PayBasis | null = useMemo(() => {
    if (salary !== null) return { amount: salary.amount, day: dayOf(salary.anchor_date), accountId: salary.account_id, currency: salary.currency };
    if (draftPay !== null) return { amount: draftPay.amount, day: draftPay.day, accountId: draftPay.accountId, currency: accounts.find((a) => a.id === draftPay.accountId)?.currency ?? ctx.homeCurrency };
    if (ctx.found !== null) return { amount: ctx.found.amount, day: ctx.found.day, accountId, currency: ctx.found.currency };
    return null;
  }, [salary, draftPay, ctx.found, accountId, accounts, ctx.homeCurrency]);

  // GQ4: "Salary or wages" is pre-picked only when steady pay was found and nothing is stored; otherwise nothing is.
  const steadyFound = salary !== null || ctx.found !== null;
  const types: readonly string[] = pickedTypes ?? stored?.income_types ?? (steadyFound ? ['salary_or_wages'] : []);
  // 06.1-29 FIN-20: the tax set-aside share, empty by default and never pre-filled; only for a profile that includes freelance
  // (06.1-54: read from the live chip selection).
  const showsAside = showsSetAside(types);
  const asideBad = showsAside && setAsideFromText(asideText).kind === 'bad';

  const emptyPay: PayEditValues | null = validAmount(emptyAmount) && emptyDay !== null && accountId !== null ? { amount: emptyAmount, day: emptyDay, accountId } : null;
  // The pay Save pay details would create: the found or edited one, or the typed fields.
  const toCreate: PayEditValues | null =
    salary !== null
      ? null
      : basis !== null && basis.accountId !== null
        ? { amount: basis.amount, day: basis.day, accountId: basis.accountId }
        : emptyPay;
  const hasPay = salary !== null || toCreate !== null;
  // 06.1-81 (review items 1, 2): "No fixed income right now" saves with no pay, and no series is made or marked as pay. An
  // unmarked income series is marked as pay only when "Salary or wages" is among the picks.
  const noPay = types.includes('none');
  const marksPay = types.includes('salary_or_wages');

  const changes = pattern === 'variable' || pattern === 'seasonal';
  const followUpDone =
    method === 'match' || (method === 'spread' && spread !== null) || (method === 'steady' && validAmount(steady)) || (method === 'balance' && hold !== null);
  const countDone = !changes || (method !== null && followUpDone);
  const canSave = canWrite && types.length > 0 && (hasPay || noPay) && countDone && !asideBad;
  // C-21: the first part still missing, in the order the page asks for them. The set-aside range has its own line by the field.
  const showsFound = basis !== null && (salary !== null || basis.accountId !== null);
  const need: NeedPart | null = canSave || !canWrite ? null : firstNeed({ types, hasPay, hasBasis: basis !== null, amount: emptyAmount, day: emptyDay, countDone });

  // The found pay's name: the series name, or the payer the records show; the generic words for a typed change.
  const foundName = salary?.name ?? (draftPay === null ? ctx.found?.payer : undefined) ?? t('decide.screens.setupPayBills.pay.takeHome');
  const accountName = (id: string | null): string => accounts.find((a) => a.id === id)?.name ?? ctx.accounts.find((a) => a.id === id)?.name ?? '';

  const createSalary = (v: PayEditValues): string | null => {
    const account = accounts.find((a) => a.id === v.accountId);
    if (account === undefined) return null;
    return confirmer.confirm({
      series: {
        id: Crypto.randomUUID(),
        household_id: householdId,
        account_id: account.id,
        name: t('income.pay.defaultName'),
        amount: v.amount,
        currency: account.currency,
        category_id: null,
        payment_type: null,
        freq: 'monthly',
        anchor_date: nextDateOnDay(ctx.today, v.day),
        time_zone: ctx.timeZone,
        end_date: null,
        occurrence_count: null,
        is_automatic: false,
      },
      direction: 'in',
      linkTransactionIds: [],
      attributes: { income_kind: 'salary', counts_as: 'available' },
    }).stepId;
  };

  const savePayEdit = (v: PayEditValues): void => {
    setEditOpen(false);
    if (salary === null) {
      setDraftPay(v);
      setAgreed(true);
      return;
    }
    const patch: RecurringSeriesPatch = {};
    if (salary.amount !== v.amount) patch.amount = v.amount;
    if (dayOf(salary.anchor_date) !== v.day) patch.anchor_date = anchorWithDay(salary.anchor_date, v.day);
    if (salary.account_id !== v.accountId) patch.account_id = v.accountId;
    if (Object.keys(patch).length === 0) return;
    const stepId = editSeriesFrom({ id: salary.id, householdId, expectedVersion: salary.version, patch, effectiveFrom: ctx.today, ownerId: userId, name: salary.name });
    showToast({
      kind: 'ordinary',
      text: { key: 'decide.screens.setupPayBills.payEdit.toast', params: { amount: fmt.money(v.amount, salary.currency), ordinal: fmt.ordinal(v.day) } },
      stepId,
    });
  };

  const addOther = (v: OtherIncomeValues): void => {
    setOtherOpen(false);
    const account = accounts.find((a) => a.id === (basis?.accountId ?? accountId)) ?? accounts[0];
    if (account === undefined) return;
    const { stepId } = confirmer.confirm({
      series: {
        id: Crypto.randomUUID(),
        household_id: householdId,
        account_id: account.id,
        name: v.name,
        amount: v.amount,
        currency: account.currency,
        category_id: null,
        payment_type: null,
        freq: v.freq,
        anchor_date: ctx.today,
        time_zone: ctx.timeZone,
        end_date: null,
        occurrence_count: null,
        is_automatic: false,
      },
      direction: 'in',
      linkTransactionIds: [],
      attributes: { income_kind: 'other', counts_as: v.counts },
    });
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupPayBills.otherIncome.toast' }, stepId });
  };

  const setCounts = (series: (typeof others)[number], counts: 'available' | 'kept'): void => {
    if ((series.counts_as ?? null) === counts) return;
    patcher.patch([{ series, attributes: { counts_as: counts } }]);
  };

  // 06.1-65 (FQ4): the person changed something on this page that is not stored yet, so "Save and close" saves it first. Only
  // answers the person touched count (a figure still at its stored value, or never picked, is not a change).
  const dirty =
    draftPay !== null ||
    emptyAmount !== null ||
    emptyDay !== null ||
    (pickedTypes !== null && !sameTypes(pickedTypes, stored?.income_types)) ||
    (pattern !== null && pattern !== (stored?.income_pattern ?? null)) ||
    (method !== null && method !== (stored?.variable_method ?? null)) ||
    (spread !== null && spread !== (stored?.spread_months ?? null)) ||
    (steady !== null && steady !== (stored?.steady_amount ?? null)) ||
    (hold !== null && hold !== (stored?.hold_months ?? null)) ||
    (showsAside && (asideBad || setAsidePatch(asideText, stored?.tax_set_aside_bp) !== undefined));

  const save = (): boolean => {
    if (!canSave) return false;
    const stepIds: string[] = [];
    if (toCreate !== null && !noPay) {
      const id = createSalary(toCreate);
      if (id !== null) stepIds.push(id);
    }
    if (unmarked !== null && marksPay) {
      const marking = patcher.patch([{ series: unmarked, attributes: { income_kind: 'salary', counts_as: unmarked.counts_as ?? 'available' } }]);
      if (marking !== null) stepIds.push(marking.stepId);
    }
    const patch: Record<string, unknown> = {};
    // C-3 / DC-8: the income profile exists only once income_types is stored; without it Pay can never tick.
    if (!sameTypes(types, stored?.income_types)) patch.income_types = [...types];
    if (pattern !== null && pattern !== (stored?.income_pattern ?? null)) {
      patch.income_pattern = pattern;
      patch.income_pattern_confirmed = true;
    }
    if (changes && method !== null) {
      if (method !== (stored?.variable_method ?? null)) patch.variable_method = method;
      if (method === 'spread' && spread !== (stored?.spread_months ?? null)) patch.spread_months = spread;
      if (method === 'steady' && steady !== (stored?.steady_amount ?? null)) patch.steady_amount = steady;
      if (method === 'balance' && hold !== (stored?.hold_months ?? null)) patch.hold_months = hold;
    }
    const aside = showsAside ? setAsidePatch(asideText, stored?.tax_set_aside_bp) : undefined;
    if (aside !== undefined) patch.tax_set_aside_bp = aside;
    if (Object.keys(patch).length > 0) {
      const saved = saver.save({ stepTitle: t('decide.screens.setupPayBills.pay.title'), patch });
      if (saved !== null) stepIds.push(saved.stepId);
    }
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupPayBills.pay.toast' }, stepIds });
    return true;
  };

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const heading = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };

  return (
    <SetupItemFrame
      title={t('decide.screens.setupPayBills.pay.title')}
      why={t('decide.screens.setupPayBills.pay.why')}
      primaryLabel={t('decide.screens.setupPayBills.pay.save')}
      primaryDisabled={!canSave}
      onSave={save}
      onLeave={leave}
      dirty={dirty}
      need={need === null ? null : t(`decide.screens.setupPayBills.pay.need.${need}`)}
    >
      <Text style={heading}>{t('income.paid.title')}</Text>
      <View testID="pay-types" accessibilityLabel={t('income.paid.title')} style={styles.row}>
        {PAID_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={t(o.labelKey)}
            selected={types.includes(o.value)}
            onPress={() => {
              hapticSelection();
              setPickedTypes(toggledTypes(types, o.value));
            }}
          />
        ))}
      </View>

      {showsFound && basis !== null ? (
        <View testID="pay-found" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          <Text style={label}>{t('decide.screens.setupPayBills.pay.found')}</Text>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
            {t('decide.screens.setupPayBills.pay.foundLine', { name: foundName, amount: fmt.money(basis.amount, basis.currency) })}
          </Text>
          <Text style={label}>
            {t('decide.screens.setupPayBills.pay.foundWhen', { ordinal: fmt.ordinal(basis.day), account: accountName(basis.accountId) })}
          </Text>
          <View style={styles.row}>
            <Chip
              label={t('decide.screens.setupPayBills.pay.right')}
              selected={agreed || salary !== null}
              onPress={() => {
                hapticSelection();
                setAgreed(true);
              }}
            />
            <Chip label={t('decide.screens.common.change')} onPress={() => setEditOpen(true)} />
          </View>
        </View>
      ) : (
        <View testID="pay-empty" style={styles.column}>
          <MoneyInput
            value={emptyAmount}
            currency={ctx.homeCurrency}
            onChange={(minor) => setEmptyAmount(validAmount(minor) ? minor : null)}
            label={t('decide.screens.setupPayBills.pay.emptyAmount')}
            accessibilityLabel={t('decide.screens.setupPayBills.pay.emptyAmount')}
            boxed
            prefix="symbol"
          />
          <DayPicker
            label={t('decide.screens.setupPayBills.pay.emptyDay')}
            day={emptyDay}
            emptyText={t('decide.screens.setupPayBills.pay.dayNone')}
            onChange={setEmptyDay}
          />
          {accounts.length === 0 ? <Note tone="warn">{t('decide.screens.setupPayBills.pay.noAccount')}</Note> : null}
        </View>
      )}

      <Text style={heading}>{t('decide.screens.setupPayBills.pay.changesQ')}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.setupPayBills.pay.changesQ')}>
        {PATTERNS.map((p) => (
          <RadioRow key={p.value} label={t(`decide.screens.setupPayBills.pay.${p.key}`)} selected={pattern === p.value} onPress={() => setPattern(p.value)} />
        ))}
      </View>

      {changes ? (
        <View testID="pay-count" style={styles.column}>
          <Text style={heading}>{t('decide.screens.setupPayBills.pay.countQ')}</Text>
          <Text style={label}>{t('decide.screens.setupPayBills.pay.countNote')}</Text>
          {METHODS.map((m) => {
            const selected = method === m.value;
            const title = t(`decide.screens.setupPayBills.pay.${m.key}`);
            const sub = t(`decide.screens.setupPayBills.pay.${m.key}Sub`);
            return (
              <View key={m.value} style={styles.column}>
                <ChoiceCard selected={selected} onPress={() => setMethod(m.value)} title={title} accessibilityLabel={title} />
                <Text style={label}>{sub}</Text>
                {selected && m.value === 'spread' ? (
                  <View style={styles.column}>
                    <FieldLabel>{t('income.method.spreadQuestion')}</FieldLabel>
                    <View accessibilityRole="radiogroup" accessibilityLabel={t('income.method.spreadQuestion')} style={styles.row}>
                      {SPREAD_CHOICES.map((n) => (
                        <Chip key={n} label={t('income.method.months', { count: n })} selected={spread === n} onPress={() => { hapticSelection(); setSpread(n); }} />
                      ))}
                    </View>
                  </View>
                ) : null}
                {selected && m.value === 'steady' ? (
                  <MoneyInput
                    value={steady}
                    currency={ctx.homeCurrency}
                    onChange={(minor) => setSteady(validAmount(minor) ? minor : null)}
                    label={t('income.method.steadyCaption')}
                    accessibilityLabel={t('income.method.steadyCaption')}
                    boxed
                  />
                ) : null}
                {selected && m.value === 'balance' ? (
                  <View style={styles.column}>
                    <FieldLabel>{t('income.method.balanceQuestion')}</FieldLabel>
                    <View accessibilityRole="radiogroup" accessibilityLabel={t('income.method.balanceQuestion')} style={styles.row}>
                      {HOLD_CHOICES.map((n) => (
                        <Chip key={n} label={t('income.method.months', { count: n })} selected={hold === n} onPress={() => { hapticSelection(); setHold(n); }} />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {showsAside ? (
        <View testID="pay-tax-set-aside" style={styles.column}>
          <FieldLabel>{t('decide.screens.setupPayBills.pay.setAsideLabel')}</FieldLabel>
          <Field
            value={asideText}
            onChangeText={(v) => setAsideTextValue(v.replace(/\D/g, ''))}
            accessibilityLabel={t('decide.screens.setupPayBills.pay.setAsideLabel')}
            numeric
            maxLength={2}
          />
          <Text style={label}>{t('decide.screens.setupPayBills.pay.setAsideNote')}</Text>
          {asideBad ? <Note tone="warn">{t('decide.screens.setupPayBills.pay.setAsideRange')}</Note> : null}
        </View>
      ) : null}

      <Text style={heading}>{t('decide.screens.setupPayBills.pay.otherQ')}</Text>
      <Text style={label}>{t('decide.screens.setupPayBills.pay.otherSub')}</Text>
      {others.map((s) => (
        <View
          key={s.id}
          accessible={false}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}
        >
          <Text
            accessibilityLabel={t('decide.screens.setupPayBills.pay.otherRowA11y', { name: s.name, amount: fmt.money(s.amount, s.currency), frequency: freqWord(s.freq as RecurringFreq) })}
            style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}
          >
            {s.name} · {fmt.money(s.amount, s.currency)} · {freqWord(s.freq as RecurringFreq)}
          </Text>
          <SegmentedToggle
            options={[
              { key: 'available', label: t('decide.screens.setupPayBills.pay.spendIt') },
              { key: 'kept', label: t('decide.screens.setupPayBills.pay.keptIt') },
            ]}
            value={s.counts_as ?? ''}
            onChange={(key) => setCounts(s, key === 'kept' ? 'kept' : 'available')}
            accessibilityLabel={`${s.name}, ${t('decide.screens.setupPayBills.otherIncome.counts')}`}
          />
        </View>
      ))}
      <Pill
        variant="secondary"
        label={t('decide.screens.setupPayBills.pay.addOther')}
        disabled={!canWrite || accounts.length === 0}
        onPress={() => {
          hapticLight();
          setOtherOpen(true);
        }}
      />

      <PayEditSheet
        visible={editOpen}
        amount={basis?.amount ?? null}
        day={basis?.day ?? null}
        accountId={basis?.accountId ?? null}
        accounts={accounts}
        currency={basis?.currency ?? ctx.homeCurrency}
        onSave={savePayEdit}
        onDismiss={() => setEditOpen(false)}
      />
      <OtherIncomeSheet visible={otherOpen} currency={basis?.currency ?? ctx.homeCurrency} onAdd={addOther} onDismiss={() => setOtherOpen(false)} />
    </SetupItemFrame>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapSm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  column: { gap: space.gapSm },
});
