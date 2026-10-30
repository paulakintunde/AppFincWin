// 05.3-40 (DSV-06, UI-SPEC Payment plan card): how often, loan length, rate, down payment, fees and an optional quoted payment.
// M-08: the down payment is written to pay.deposit and nowhere else. T-05.3-40-01: the rate is never defaulted; an empty rate
// stays null (the engine asks for it), a typed 0 is 0%. T-05.3-40-04: a rate over 100% a year is refused and the last valid
// value stays. Every write goes through the 05.3-17 edits.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardEligibility } from '@/engine/decide/v3';
import type { ItemType } from '@/engine/decide/v3';
import type { Cadence, CheckV2, Evaluation, V3PresetItemType } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { CustomValueChips } from '@/features/decide/ui/CustomValueChips';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { RateInput } from '@/features/decide/ui/RateInput';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useLooseT } from '../check/useLooseT';
import { withDeposit, withPlan } from '../model/checkEdits';
import { percentToText, textToPercent } from '../model/percentText';
import { planHref } from '../nav/hrefs';
import { useV3Format } from '../shared/useV3Format';
import { LayerCard } from './LayerCard';

export interface PaymentPlanCardProps {
  check: CheckV2;
  evaluation: Evaluation | null;
  edit(next: CheckV2): void;
  checkId: string;
  currency: string;
  readOnly?: boolean;
}

const TERM_CHIPS = [12, 24, 36, 48, 60, 72, 84] as const;
const MIN_TERM = 1;
const MAX_TERM = 120;
const MAX_RATE = '100';
const CADENCES: readonly { key: 'weekly' | 'biweekly' | 'monthly'; cadence: Cadence }[] = [
  { key: 'weekly', cadence: { unit: 'week', every: 1 } },
  { key: 'biweekly', cadence: { unit: 'week', every: 2 } },
  { key: 'monthly', cadence: { unit: 'month', every: 1 } },
];

const ITEM_TYPE_FOR_RULE = new Set<string>(['vehicle', 'rent_bill', 'loan_repayment', 'tax', 'insurance_premium', 'general', 'property', 'cash_equivalent', 'tuition']);

/** The card-rule note key for the item type, or null when the rule has no honest one-line note (blocked without a property reason). */
export function cardNoteKey(itemType: V3PresetItemType): string | null {
  const rule = cardEligibility((ITEM_TYPE_FOR_RULE.has(itemType) ? itemType : 'general') as ItemType, null);
  if (rule.eligibility === 'capped') return 'decide.v3.ui.layers.cardVehicle';
  if (rule.eligibility === 'permitted') return rule.note === null ? 'decide.v3.ui.layers.cardNone' : null;
  return itemType === 'property' ? 'decide.v3.ui.layers.cardProperty' : null;
}

function cadenceIs(a: Cadence, b: Cadence): boolean {
  return a.unit === b.unit && a.every === b.every;
}

function summaryKey(c: Cadence): string | null {
  if (c.unit === 'month' && c.every === 1) return 'decide.v3.ui.layers.summaryMonth';
  if (c.unit === 'week' && c.every === 1) return 'decide.v3.ui.layers.summaryWeek';
  if (c.unit === 'week' && c.every === 2) return 'decide.v3.ui.layers.summaryBiweek';
  return null;
}

interface DisclosureProps {
  label: string;
  open: boolean;
  onPress(): void;
}

function Disclosure({ label, open, onPress }: DisclosureProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.ink, textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}

export function PaymentPlanCard({ check, evaluation, edit, checkId, currency, readOnly = false }: PaymentPlanCardProps): React.JSX.Element | null {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const fmt = useV3Format();
  const pay = check.pay;
  const [rateText, setRateText] = useState(() => (pay.mode === 'plan' ? percentToText(pay.apr) : ''));
  const [moreFees, setMoreFees] = useState(false);
  const [quoted, setQuoted] = useState(() => pay.mode === 'plan' && pay.quotedPayment !== null);
  if (pay.mode !== 'plan') return null;

  const schedule = evaluation?.purchase?.schedule ?? null;
  const card = evaluation?.planCard ?? null;
  const itemType: V3PresetItemType = check.itemType.kind === 'preset' ? check.itemType.value : 'general';
  const noteKey = cardNoteKey(itemType);
  const lengthMissing = pay.termMonths === null && pay.count === null;
  const cell = stacked ? styles.cellFull : styles.cell;
  const set = (patch: Parameters<typeof withPlan>[1]): void => edit(withPlan(check, patch));
  const money = (n: number | null): number | null => (n === null || n === 0 ? null : n);
  const summaryText = schedule === null ? null : summaryKey(schedule.cadence);

  const onRate = (text: string): void => {
    setRateText(text);
    // An empty field is "no rate yet" (never 0%); an unfinished entry like "5." keeps the last valid value.
    if (text.trim() === '') set({ apr: null });
    else {
      const p = textToPercent(text);
      if (p !== null) set({ apr: p });
    }
  };

  return (
    <LayerCard eyebrowKey="decide.v3.ui.layers.planEyebrow" testID="payment-plan-card">
      <View style={styles.group}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.v3.ui.layers.howOften')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.layers.howOften')} style={styles.wrap}>
          {CADENCES.map((c) => (
            <Chip
              key={c.key}
              label={t(`decide.v3.ui.layers.${c.key}`)}
              selected={cadenceIs(pay.cadence, c.cadence)}
              onPress={readOnly ? undefined : () => set({ cadence: c.cadence })}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.v3.ui.layers.length')}</Text>
        <CustomValueChips
          presets={TERM_CHIPS}
          value={pay.termMonths}
          onChange={(n) => set({ termMonths: n, count: null })}
          groupLabel={t('decide.v3.ui.layers.length')}
          min={MIN_TERM}
          max={MAX_TERM}
          rangeText={t('decide.custom.range.months')}
          unitWord={t('decide.custom.unit.months')}
          readOnly={readOnly}
        />
        {schedule === null ? null : (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
            {t('decide.v3.ui.layers.payments', { count: schedule.count })}
          </Text>
        )}
        {lengthMissing ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{t('decide.v3.ui.layers.lengthNeeded')}</Text>
        ) : null}
      </View>

      <View style={styles.grid}>
        <View style={cell}>
          <RateInput
            value={rateText}
            onChange={onRate}
            label={t('decide.v3.ui.layers.rate')}
            accessibilityLabel={t('decide.v3.ui.layers.rate')}
            max={MAX_RATE}
            rangeText={t('decide.v3.ui.layers.rateTooHigh')}
            readOnly={readOnly}
          />
        </View>
        <View style={cell}>
          <MoneyInput
            value={money(pay.deposit)}
            currency={currency}
            onChange={(m) => edit(withDeposit(check, minorUnits(m ?? 0)))}
            label={t('decide.v3.ui.layers.deposit')}
            zeroHint
            accessibilityLabel={t('decide.v3.ui.layers.deposit')}
            readOnly={readOnly}
          />
        </View>
        <View style={cell}>
          <MoneyInput
            value={money(pay.fees.setup)}
            currency={currency}
            onChange={(m) => set({ fees: { ...pay.fees, setup: minorUnits(m ?? 0) } })}
            label={t('decide.v3.ui.layers.fees')}
            zeroHint
            accessibilityLabel={t('decide.v3.ui.layers.fees')}
            readOnly={readOnly}
          />
        </View>
      </View>

      <Disclosure label={t('decide.v3.ui.layers.moreFees')} open={moreFees} onPress={() => setMoreFees((o) => !o)} />
      {moreFees ? (
        <View style={styles.grid}>
          <View style={cell}>
            <MoneyInput
              value={money(pay.fees.perPeriod)}
              currency={currency}
              onChange={(m) => set({ fees: { ...pay.fees, perPeriod: minorUnits(m ?? 0) } })}
              label={t('decide.v3.ui.layers.perPeriodFee')}
              zeroHint
              accessibilityLabel={t('decide.v3.ui.layers.perPeriodFee')}
              readOnly={readOnly}
            />
          </View>
          <View style={cell}>
            <MoneyInput
              value={money(pay.fees.end)}
              currency={currency}
              onChange={(m) => set({ fees: { ...pay.fees, end: minorUnits(m ?? 0) } })}
              label={t('decide.v3.ui.layers.endFee')}
              zeroHint
              accessibilityLabel={t('decide.v3.ui.layers.endFee')}
              readOnly={readOnly}
            />
          </View>
        </View>
      ) : null}

      <Disclosure label={t('decide.v3.ui.layers.quotedToggle')} open={quoted} onPress={() => setQuoted((o) => !o)} />
      {quoted ? (
        <MoneyInput
          value={pay.quotedPayment}
          currency={currency}
          onChange={(m) => set({ quotedPayment: m === null ? null : minorUnits(m) })}
          label={t('decide.v3.ui.layers.quoted')}
          accessibilityLabel={t('decide.v3.ui.layers.quoted')}
          readOnly={readOnly}
        />
      ) : null}

      {schedule === null ? null : (
        <View testID="plan-summary" style={[styles.summary, stacked && styles.summaryStacked, { backgroundColor: colors.accentTint3 }]}>
          <View style={styles.summaryText}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
              {summaryText === null ? t('decide.v3.ui.layers.payments', { count: schedule.count }) : t(summaryText, { count: schedule.count })}
            </Text>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{fmt.money(schedule.payment)}</Text>
          </View>
          <View style={stacked ? styles.summaryText : styles.summaryRight}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.v3.ui.layers.about')}</Text>
            <Text style={{ ...textRole(pairing, 'label'), fontWeight: '700', color: colors.ink }}>
              {t('decide.v3.ui.layers.perMonth', { amount: fmt.money(schedule.monthlyEquivalent) })}
            </Text>
          </View>
        </View>
      )}
      {card === null ? null : (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('decide.v3.ui.layers.wholePlanLink', { total: fmt.money(card.total) })}
          onPress={() => pushOnce(planHref(checkId))}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.ink, textDecorationLine: 'underline' }}>
            {t('decide.v3.ui.layers.wholePlanLink', { total: fmt.money(card.total) })}
          </Text>
        </Pressable>
      )}
      {noteKey === null ? null : (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{t(noteKey)}</Text>
      )}
    </LayerCard>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.gapSm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.gapMd, rowGap: space.gapMd },
  cell: { flexBasis: '47%', flexGrow: 1 },
  cellFull: { flexBasis: '100%', flexGrow: 1 },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.gapMd, borderRadius: space.cardPad, paddingVertical: 12, paddingHorizontal: 14 },
  summaryStacked: { flexDirection: 'column' },
  summaryText: { flexShrink: 1, gap: 2 },
  summaryRight: { alignItems: 'flex-end', gap: 2 },
});
