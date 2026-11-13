/**
 * 06.1-15 (D42, ARC-25, CMP-F07, CMP-F11): the installment plan sheet. Cash down, amount borrowed (read-only: price, tax and fees
 * less the cash down), length, how often, rate, fees and when the first payment lands; a result card from the engine's own
 * schedule. The example rate (decide.v3.tax.exampleRate) is shown only as a hint and in the card, and is NEVER written to pay.apr:
 * a rate is saved only when the user typed it. "Use this plan" writes CheckV2.pay (mode 'plan') through onUse; nothing applies
 * before that. Home buying stays hidden (D-02).
 * 06.1-53 (C-12..C-14): Use stays off until the first payment lands on or after today, and while the cash down covers the whole
 * price (nothing is borrowed); the line under it says which. The length note waits until Use is tried or a length is cleared.
 * 06.1-57 (A-ST-7, T-06.1-57-02): a Plan name field (optional, handed to onUse as its second argument); the currency sign on the
 * money fields and '%' on the rate; length chips 12 / 24 / 36 / 48 for a car and for any other kind (shorter sets stay for tech
 * and small items); the example rate shows as the rate field's value with an "example" tag beside it until the user types, and
 * typing replaces it (the text is selected on focus). The example is still never written to pay.apr.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  buildSchedule,
  planCard,
  salesTaxOf,
  type Cadence,
  type CheckV2,
  type FirstPayment,
  type LocalDate,
  type PayV2,
} from '@/engine/decide/v3';
import { percent, type Percent } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { parseWholeInRange } from '@/ui/wholeNumberField';
import { PLAN_NAME_MAX, planNameOf } from '../check/planName';
import { NeedLine } from '../ui/NeedLine';
import { addDaysTo, addMonthsTo } from './dateMath';
import { Field, FieldLabel, Note } from './sheetUi';

export type PlanItemKind = 'car' | 'laptop' | 'camera' | 'headphones' | 'phone' | 'other';
type CadenceKey = 'month' | 'twoWeeks' | 'week';
type FirstKey = 'next' | 'month' | 'pick';

export interface InstallmentPlanSheetProps {
  visible: boolean;
  check: CheckV2;
  currency: string;
  today: LocalDate;
  /** The next payday after today, when one is known; hides "Next payday" otherwise. */
  nextPayday?: LocalDate | null;
  itemKind?: PlanItemKind;
  /** True when a saved plan is being changed ("Save plan"). */
  editing?: boolean;
  formatMoney: (minor: number) => string;
  formatDate: (date: LocalDate) => string;
  onPickDate: (current: LocalDate | null, set: (date: LocalDate) => void) => void;
  /** planName: the typed name, trimmed, or null when none was typed. Callers may ignore it. */
  onUse: (pay: Extract<PayV2, { mode: 'plan' }>, planName: string | null) => void;
  onDismiss: () => void;
}

/** ARC-25: shown, never stored. Only used to size the example result card while the rate field is empty. */
const EXAMPLE_APR: Percent = percent('9.9');
const MAX_MONTHS = 120;
const MAX_RATE = 30;
const RATE_TEXT = /^\d{1,2}(\.\d{0,2})?$/;

const LENGTHS: Record<PlanItemKind, readonly number[]> = {
  car: [12, 24, 36, 48],
  laptop: [6, 12, 24],
  camera: [6, 12, 24],
  headphones: [3, 6, 12],
  phone: [12, 24, 36],
  other: [12, 24, 36, 48],
};

const CADENCES: Record<CadenceKey, { cadence: Cadence; key: 'aMonth' | 'every2Weeks' | 'aWeek' }> = {
  month: { cadence: { unit: 'month', every: 1 }, key: 'aMonth' },
  twoWeeks: { cadence: { unit: 'week', every: 2 }, key: 'every2Weeks' },
  week: { cadence: { unit: 'week', every: 1 }, key: 'aWeek' },
};
const CADENCE_ORDER: readonly CadenceKey[] = ['month', 'twoWeeks', 'week'];

const PERIODS_PER_YEAR: Record<CadenceKey, number> = { month: 12, twoWeeks: 26, week: 52 };

interface Draft {
  name: string;
  cashDown: number | null;
  months: number | null;
  other: boolean;
  otherText: string;
  cadence: CadenceKey;
  rateText: string;
  setup: number | null;
  perPeriod: number | null;
  end: number | null;
  first: FirstKey;
  picked: LocalDate | null;
  pause: boolean | null;
  quoted: number | null;
}

function cadenceKeyOf(c: Cadence): CadenceKey {
  return c.unit === 'month' ? 'month' : c.every === 2 ? 'twoWeeks' : 'week';
}

export function InstallmentPlanSheet(props: InstallmentPlanSheetProps) {
  return props.visible ? <PlanForm {...props} /> : null;
}

function PlanForm({ check, currency, today, nextPayday = null, itemKind = 'other', editing = false, formatMoney, formatDate, onPickDate, onUse, onDismiss }: InstallmentPlanSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const saved = check.pay.mode === 'plan' ? check.pay : null;
  const chips = LENGTHS[itemKind];
  const hasNext = nextPayday !== null && nextPayday >= today;

  const [initial] = useState<Draft>(() => {
    const months = saved?.termMonths ?? null;
    const fp = saved?.firstPayment ?? null;
    return {
      name: planNameOf(check) ?? '',
      cashDown: saved !== null && saved.deposit > 0 ? saved.deposit : null,
      months,
      other: months !== null && !chips.includes(months),
      otherText: months !== null && !chips.includes(months) ? String(months) : '',
      cadence: saved === null ? 'month' : cadenceKeyOf(saved.cadence),
      // ARC-25: the saved apr is a typed one (the example is never stored), so it can seed the field.
      rateText: saved?.apr != null ? percentText(saved.apr) : '',
      setup: saved !== null && saved.fees.setup > 0 ? saved.fees.setup : null,
      perPeriod: saved !== null && saved.fees.perPeriod > 0 ? saved.fees.perPeriod : null,
      end: saved !== null && saved.fees.end > 0 ? saved.fees.end : null,
      first: fp === null ? (hasNext ? 'next' : 'month') : fp.kind === 'deferred' ? (hasNext && fp.firstDate === nextPayday ? 'next' : 'pick') : 'month',
      picked: fp?.kind === 'deferred' ? fp.firstDate : null,
      pause: fp?.kind === 'deferred' ? fp.interestDuringPause : false,
      quoted: saved?.quotedPayment ?? null,
    };
  });
  const [d, setD] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  // C-14: the length note is not shown on open; only once Use was tried with no length, or a length was cleared.
  const [lengthAsked, setLengthAsked] = useState(false);
  const dirty = useIsDirty(initial, d);

  const price = check.price ?? 0;
  const tax = check.taxIncluded === true ? 0 : Number(salesTaxOf(minorUnits(price), check.taxPercent));
  const fees1 = check.oneOffFees;
  const cashDown = d.cashDown ?? 0;
  const borrowed = Math.max(0, price + tax + fees1 - cashDown);

  const other = parseWholeInRange(d.otherText, 1, MAX_MONTHS);
  const months = d.other ? (other.kind === 'ok' ? other.value : null) : d.months;
  const periods = months === null ? null : Math.min(600, Math.max(1, Math.round((months * PERIODS_PER_YEAR[d.cadence]) / 12)));

  const typedRate: Percent | null = useMemo(() => {
    if (d.rateText === '' || !RATE_TEXT.test(d.rateText) || d.rateText.endsWith('.')) return null;
    return Number(d.rateText) <= MAX_RATE ? percent(d.rateText) : null;
  }, [d.rateText]);
  const rateBad = d.rateText !== '' && typedRate === null && !d.rateText.endsWith('.');

  const firstPayment: FirstPayment | null = useMemo(() => {
    if (d.first === 'month') return { kind: 'one_period' };
    const firstDate = d.first === 'next' ? nextPayday : d.picked;
    return firstDate === null || firstDate < today ? null : { kind: 'deferred', firstDate, interestDuringPause: d.pause };
  }, [d.first, d.picked, d.pause, nextPayday, today]);

  const fees = useMemo(() => ({ setup: minorUnits(d.setup ?? 0), perPeriod: minorUnits(d.perPeriod ?? 0), end: minorUnits(d.end ?? 0) }), [d.setup, d.perPeriod, d.end]);
  const usingExample = typedRate === null;
  // T-06.1-57-02: until the user types a rate, the field shows the example and says so; once typed, the field is theirs (even empty).
  const [rateTyped, setRateTyped] = useState(initial.rateText !== '');
  const showExample = !rateTyped && d.rateText === '';

  const card = useMemo(() => {
    if (periods === null || borrowed <= 0 || firstPayment === null) return null;
    try {
      const out = buildSchedule({ asOf: today, financed: minorUnits(borrowed), apr: typedRate ?? EXAMPLE_APR, cadence: CADENCES[d.cadence].cadence, count: periods, firstPayment, fees });
      if (!out.ok) return null;
      return planCard({ price: minorUnits(price), tax: minorUnits(tax), oneOffFees: minorUnits(fees1), schedule: out.schedule, runningMonthly: minorUnits(0) });
    } catch {
      return null;
    }
  }, [periods, borrowed, firstPayment, today, typedRate, d.cadence, fees, price, tax, fees1]);

  const resultLine =
    card === null || months === null ? '' : t('decide.screens.sheetsInput.plan.result', { count: months, monthly: formatMoney(card.monthlyEquivalent) });
  const settledResult = useSettledLabel(resultLine, d.cadence, 600);

  // C-13: the cash down covers price, tax and fees, so there is nothing to borrow and no plan to use.
  const covered = cashDown > 0 && borrowed <= 0;
  // C-12: firstPayment is null when the chosen date is missing or before today (plain LocalDate string compare above).
  const canUse = !rateBad && !covered && firstPayment !== null;
  const need = covered ? t('decide.screens.sheetsInput.plan.coveredByCash') : firstPayment === null ? t('decide.screens.sheetsInput.plan.need.firstPayment') : null;
  const title = t('decide.screens.sheetsInput.plan.title');
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  const use = () => {
    if (!canUse) return;
    if (months === null || periods === null) {
      setLengthAsked(true);
      return;
    }
    onUse({
      mode: 'plan',
      cadence: CADENCES[d.cadence].cadence,
      count: periods,
      termMonths: months,
      apr: typedRate, // ARC-25: null unless the user typed a rate; the example is never stored
      fees,
      deposit: minorUnits(cashDown),
      tradeIn: saved?.tradeIn ?? minorUnits(0),
      quotedPayment: d.quoted === null ? null : minorUnits(d.quoted),
      firstPayment,
      deferredInterestTerm: saved?.deferredInterestTerm ?? false,
    }, d.name.trim() === '' ? null : d.name.trim());
  };

  const firstDateMonth = CADENCES[d.cadence].cadence.unit === 'month' ? addMonthsTo(today, 1) : addDaysTo(today, 7 * CADENCES[d.cadence].cadence.every);
  const firstOptions: { key: FirstKey; label: string }[] = [
    ...(hasNext && nextPayday !== null ? [{ key: 'next' as const, label: t('decide.screens.sheetsInput.plan.firstNext', { date: formatDate(nextPayday) }) }] : []),
    { key: 'month', label: t('decide.screens.sheetsInput.plan.firstMonth', { date: formatDate(firstDateMonth) }) },
    { key: 'pick', label: d.picked === null ? t('decide.screens.common.pickDate') : `${t('decide.screens.common.pickDate')}: ${formatDate(d.picked)}` },
  ];

  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Note>{t('decide.screens.sheetsInput.plan.sub')}</Note>

        <FieldLabel>{t('decide.screens.sheetsInput.plan.name')}</FieldLabel>
        <Field value={d.name} onChangeText={(name) => set({ name })} accessibilityLabel={t('decide.screens.sheetsInput.plan.name')} maxLength={PLAN_NAME_MAX} />

        <MoneyInput
          value={d.cashDown}
          currency={currency}
          onChange={(cashDown) => set({ cashDown })}
          label={t('decide.screens.sheetsInput.plan.cashDown')}
          accessibilityLabel={t('decide.screens.sheetsInput.plan.cashDown')}
          prefix="symbol"
        />
        <Note>{t('decide.v3.plan.feesVary')}</Note>

        <View accessible accessibilityLabel={`${t('decide.screens.sheetsInput.plan.borrowed')}, ${formatMoney(borrowed)}`} style={styles.readOnly}>
          <FieldLabel>{t('decide.screens.sheetsInput.plan.borrowed')}</FieldLabel>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{formatMoney(borrowed)}</Text>
          <Note>{t('decide.screens.sheetsInput.plan.borrowedSub')}</Note>
        </View>

        <FieldLabel>{t('decide.screens.sheetsInput.plan.length')}</FieldLabel>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.sheetsInput.plan.length')} style={styles.chips}>
          {chips.map((m) => (
            <Chip
              key={m}
              label={t('decide.screens.sheetsInput.plan.lengthMonths', { count: m })}
              selected={!d.other && d.months === m}
              onPress={() => set({ months: m, other: false })}
            />
          ))}
          <Chip
            label={t('decide.screens.sheetsInput.plan.lengthOther')}
            selected={d.other}
            onPress={() => {
              if (!d.other && d.months !== null) setLengthAsked(true);
              set({ other: true, months: null });
            }}
          />
        </View>
        {d.other ? (
          <>
            <Field
              value={d.otherText}
              onChangeText={(text) => {
                const otherText = text.replace(/\D/g, '');
                if (otherText === '' && d.otherText !== '') setLengthAsked(true);
                set({ otherText });
              }}
              accessibilityLabel={t('decide.screens.sheetsInput.plan.lengthOtherField')}
              placeholder={t('decide.screens.sheetsInput.plan.lengthOtherField')}
              numeric
              maxLength={3}
            />
            {d.otherText !== '' && other.kind !== 'ok' ? <Note tone="warn">{t('decide.screens.common.fieldError.lengthRange')}</Note> : null}
          </>
        ) : null}
        {months === null && lengthAsked ? <Note>{t('decide.screens.sheetsInput.plan.lengthError')}</Note> : null}

        <FieldLabel>{t('decide.screens.sheetsInput.plan.often')}</FieldLabel>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.sheetsInput.plan.often')} style={styles.chips}>
          {CADENCE_ORDER.map((k) => (
            <Chip key={k} label={t(`decide.screens.sheetsInput.plan.${CADENCES[k].key}`)} selected={d.cadence === k} onPress={() => set({ cadence: k })} />
          ))}
        </View>

        <FieldLabel>{t('decide.screens.sheetsInput.plan.rate')}</FieldLabel>
        <View style={styles.rateRow}>
          <View style={styles.rateField}>
            <Field
              value={showExample ? percentText(EXAMPLE_APR) : d.rateText}
              onChangeText={(text) => {
                setRateTyped(true);
                set({ rateText: text });
              }}
              accessibilityLabel={t('decide.screens.sheetsInput.plan.rate')}
              suffix="%"
              selectTextOnFocus={showExample}
              decimal
              maxLength={5}
            />
          </View>
          {showExample ? (
            <Text testID="rate-example-tag" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
              {t('decide.screens.sheetsInput.plan.exampleTag')}
            </Text>
          ) : null}
        </View>
        {rateBad ? <Note tone="warn">{t('decide.screens.common.fieldError.rateRange')}</Note> : null}
        {usingExample ? <Note>{t('decide.v3.tax.exampleRate')}</Note> : null}

        <FieldLabel>{t('decide.screens.sheetsInput.plan.fees')}</FieldLabel>
        <MoneyInput value={d.setup} currency={currency} onChange={(setup) => set({ setup })} label={t('decide.screens.sheetsInput.plan.feeSetup')} accessibilityLabel={t('decide.screens.sheetsInput.plan.feeSetup')} prefix="symbol" />
        <MoneyInput value={d.perPeriod} currency={currency} onChange={(perPeriod) => set({ perPeriod })} label={t('decide.screens.sheetsInput.plan.feeEach')} accessibilityLabel={t('decide.screens.sheetsInput.plan.feeEach')} prefix="symbol" />
        <MoneyInput value={d.end} currency={currency} onChange={(end) => set({ end })} label={t('decide.screens.sheetsInput.plan.feeEnd')} accessibilityLabel={t('decide.screens.sheetsInput.plan.feeEnd')} prefix="symbol" />

        <FieldLabel>{t('decide.screens.sheetsInput.plan.first')}</FieldLabel>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.sheetsInput.plan.first')} style={styles.column}>
          {firstOptions.map((o) => {
            const selected = d.first === o.key;
            return (
              <Pressable
                key={o.key}
                accessibilityRole="radio"
                accessibilityLabel={o.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  set({ first: o.key });
                  if (o.key === 'pick') onPickDate(d.picked, (picked) => set({ first: 'pick', picked }));
                }}
                style={styles.radio}
              >
                <RadioDot selected={selected} />
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {d.first !== 'month' ? (
          <>
            <FieldLabel>{t('decide.screens.sheetsInput.plan.pauseQ')}</FieldLabel>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.sheetsInput.plan.pauseQ')} style={styles.chips}>
              <Chip label={t('decide.screens.sheetsInput.plan.yes')} selected={d.pause === true} onPress={() => set({ pause: true })} />
              <Chip label={t('decide.screens.sheetsInput.plan.no')} selected={d.pause === false} onPress={() => set({ pause: false })} />
              <Chip label={t('decide.screens.sheetsInput.plan.dontKnow')} selected={d.pause === null} onPress={() => set({ pause: null })} />
            </View>
          </>
        ) : null}

        <MoneyInput
          value={d.quoted}
          currency={currency}
          onChange={(quoted) => set({ quoted })}
          label={t('decide.screens.sheetsInput.plan.quoted')}
          accessibilityLabel={t('decide.screens.sheetsInput.plan.quoted')}
          prefix="symbol"
        />
        <Note>{t('decide.screens.sheetsInput.plan.quotedNote')}</Note>

        {card !== null && months !== null ? (
          <View style={[styles.card, { backgroundColor: colors.fill6 }]}>
            <View accessibilityLiveRegion="polite" accessible accessibilityLabel={settledResult === '' ? undefined : settledResult}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{resultLine}</Text>
            </View>
            <Text style={small}>
              {t('decide.screens.sheetsInput.plan.resultSub', { interest: formatMoney(card.interest), date: formatDate(card.firstDate), until: formatDate(card.endDate) })}
            </Text>
            {Number(card.interest) > 0 ? (
              <Text style={small}>{t('decide.v3.fact.interest_is_a_cost', { interest: formatMoney(card.interest), total: formatMoney(card.total) })}</Text>
            ) : null}
            {usingExample ? <Text style={small}>{t('decide.v3.plan.estimatedRate')}</Text> : null}
          </View>
        ) : null}

        <Text style={small}>{t('legal.decideAnswer.footer')}</Text>
        <Pill label={t(editing ? 'decide.screens.sheetsInput.plan.save' : 'decide.screens.sheetsInput.plan.use')} variant="primary" disabled={!canUse} onPress={use} />
        <NeedLine text={need} />
      </SheetScroll>
    </Sheet>
  );
}

/** A stored typed rate back to its field text ('7.9'): Percent is a scaled bigint, so go through the engine's own scale by string. */
function percentText(p: Percent): string {
  const s = p.toString();
  const scale = 10; // RATE_SCALE (engine/money/rates) digits after the point; trailing zeros are dropped below
  const padded = s.padStart(scale + 1, '0');
  const whole = padded.slice(0, padded.length - scale);
  const frac = padded.slice(padded.length - scale).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  readOnly: { gap: 2 },
  card: { borderRadius: space.cardPad, padding: space.cardPad, gap: space.gapSm },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  rateField: { flex: 1 },
});
