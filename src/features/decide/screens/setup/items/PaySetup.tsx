// 06.1-24 (D32, D32V, D32E, D32I): setup item 1, Pay and payday. Pay and other income are series in Activity, written through the
// existing series mutations; the "does pay change" answer and the way Decide counts it go to the income profile through the existing
// setup save. Nothing is stored twice in Decide (ENG-26).
//
//  - Pay found (a live salary series, or a payer found in the records): a card with That's right / Change. Change on a saved series
//    saves at once (one Undo); on a found payer it only changes what Save pay details will create.
//  - No pay found: amount and day fields.
//  - "It changes" / "It changes with the seasons": four ways to count it, none chosen for the person.
//  - Other money coming in: rows with I spend it / It's kept, and + Add other income.
//  - Save pay details creates the pay series when there is none, saves the answers that changed, and returns to the checklist.
//  - Save and close returns without saving what is still on screen; what a sheet already saved stays.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useT } from '@/i18n';
import type { RecurringFreq } from '@/engine/recurring';
import type { RecurringSeriesPatch } from '@/db/recurringSeries';
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
import { DayField, RadioRow, dayFromText, useFreqWord, useSetupFormat } from './itemFields';
import { OtherIncomeSheet, PayEditSheet, type OtherIncomeValues, type PayEditValues } from './PaySheets';
import { SETUP_HOME, SetupItemFrame } from './SetupItemFrame';
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
const SPREAD_CHOICES = [1, 2, 3, 6, 12] as const;
const HOLD_CHOICES: readonly Hold[] = [1, 2, 3];

const validAmount = (minor: number | null): minor is number => minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR;

interface PayBasis {
  amount: number;
  day: number;
  accountId: string | null;
  currency: string;
}

export function PaySetup({ editSeriesFrom }: { editSeriesFrom: EditSeriesFrom }) {
  const t = useT();
  const router = useRouter();
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
  const salary = useMemo(() => liveSeriesOfKind(ctx.series, 'salary')[0] ?? null, [ctx.series]);
  const others = useMemo(
    () => ctx.series.filter((s) => s.deleted_at === null && s.income_kind != null && s.income_kind !== 'salary' && s.amount > 0 && seriesStatusOf(s).kind === 'live'),
    [ctx.series],
  );

  // What a found payer would become when Save pay details runs (a series is only made on save).
  const [draftPay, setDraftPay] = useState<PayEditValues | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [emptyAmount, setEmptyAmount] = useState<number | null>(null);
  const [emptyDay, setEmptyDay] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);

  const stored = ctx.settings;
  const [pattern, setPattern] = useState<Pattern | null>(stored?.income_pattern ?? null);
  const [method, setMethod] = useState<Method | null>(stored?.variable_method ?? null);
  const [spread, setSpread] = useState<number | null>(stored?.spread_months ?? null);
  const [steady, setSteady] = useState<number | null>(stored?.steady_amount ?? null);
  const [hold, setHold] = useState<Hold | null>(stored?.hold_months ?? null);
  // 06.1-29 FIN-20: the tax set-aside share, empty by default and never pre-filled; only for a profile that includes freelance.
  const showsAside = showsSetAside(stored?.income_types);
  const [asideText, setAsideTextValue] = useState(setAsideText(stored?.tax_set_aside_bp));
  const asideBad = showsAside && setAsideFromText(asideText).kind === 'bad';

  const accountId = accounts[0]?.id ?? null;
  const basis: PayBasis | null = useMemo(() => {
    if (salary !== null) return { amount: salary.amount, day: dayOf(salary.anchor_date), accountId: salary.account_id, currency: salary.currency };
    if (draftPay !== null) return { amount: draftPay.amount, day: draftPay.day, accountId: draftPay.accountId, currency: accounts.find((a) => a.id === draftPay.accountId)?.currency ?? ctx.homeCurrency };
    if (ctx.found !== null) return { amount: ctx.found.amount, day: ctx.found.day, accountId, currency: ctx.found.currency };
    return null;
  }, [salary, draftPay, ctx.found, accountId, accounts, ctx.homeCurrency]);

  const emptyDayValue = dayFromText(emptyDay);
  const emptyPay: PayEditValues | null = validAmount(emptyAmount) && emptyDayValue !== null && accountId !== null ? { amount: emptyAmount, day: emptyDayValue, accountId } : null;
  // The pay Save pay details would create: the found or edited one, or the typed fields.
  const toCreate: PayEditValues | null =
    salary !== null
      ? null
      : basis !== null && basis.accountId !== null
        ? { amount: basis.amount, day: basis.day, accountId: basis.accountId }
        : emptyPay;
  const hasPay = salary !== null || toCreate !== null;

  const changes = pattern === 'variable' || pattern === 'seasonal';
  const followUpDone =
    method === 'match' || (method === 'spread' && spread !== null) || (method === 'steady' && validAmount(steady)) || (method === 'balance' && hold !== null);
  const countDone = !changes || (method !== null && followUpDone);
  const canSave = canWrite && hasPay && countDone && !asideBad;

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

  const save = (): void => {
    if (!canSave) return;
    const stepIds: string[] = [];
    if (toCreate !== null) {
      const id = createSalary(toCreate);
      if (id !== null) stepIds.push(id);
    }
    const patch: Record<string, unknown> = {};
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
    router.replace(SETUP_HOME);
  };

  const leave = (): void => router.replace(SETUP_HOME);
  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const heading = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };

  return (
    <SetupItemFrame
      title={t('decide.screens.setupPayBills.pay.title')}
      why={t('decide.screens.setupPayBills.pay.why')}
      primaryLabel={t('decide.screens.setupPayBills.pay.save')}
      primaryDisabled={!canSave}
      onPrimary={save}
      onBack={leave}
      onSaveAndClose={leave}
    >
      {basis !== null && (salary !== null || basis.accountId !== null) ? (
        <View testID="pay-found" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          <Text style={label}>{t('decide.screens.setupPayBills.pay.found')}</Text>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
            {t('decide.screens.setupPayBills.pay.takeHome')} {t('decide.screens.setupPayBills.pay.foundLine', { amount: fmt.money(basis.amount, basis.currency), ordinal: fmt.ordinal(basis.day), account: accountName(basis.accountId) })}
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
          />
          <DayField label={t('decide.screens.setupPayBills.pay.emptyDay')} text={emptyDay} onChange={setEmptyDay} />
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
            return (
              <View key={m.value} style={styles.column}>
                <ChoiceCard selected={selected} onPress={() => setMethod(m.value)} title={title} accessibilityLabel={title} />
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
