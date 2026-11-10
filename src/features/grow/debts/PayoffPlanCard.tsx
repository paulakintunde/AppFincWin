// 06-35 (D-30 Option B, D-32, D-33, D-34): the payoff plan card. It matches the prototype (G07): the minimum date on top, the
// order (a greyed switch with one debt; two equal columns with 2+ debts and no default pick), then three rows: Minimum only,
// Extra each month, Once, today. A tap opens one row, closing the others; the open row holds its own control (the stepper or
// the one-off chips) and shows the date and the interest against the minimum. The button follows the open row and names its
// start date. Every figure comes from the read model (06-24 scenarios); this card only formats ("about" = aboutTens).
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PayoffOrder } from '@/engine/payoff';
import { Stepper } from '@/features/grow/ui/Stepper';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Text } from '@/ui/Text';
import { aboutTens, soonerSpan } from './debtLineModel';
import type { DebtFormat } from './debtScreenData';
import { minimumOnlyFor, type Compare, type PlanScenarios, type WhatIf } from './useDebtsRead';

export const EXTRA_STEP = 2500;
/** The one-off chips: $500, $1,000, $2,500 (minor units). */
export const ONCE_CHIPS = [50000, 100000, 250000] as const;
export type ScenarioKey = 'minimum' | 'extra' | 'once';
/** One debt: the greyed order switch (D4). */
const GREYED_OPACITY = 0.6;

type T = (key: string, options?: Record<string, string | number>) => string;

export interface PayoffPlanCardProps {
  /** Plan-wide what-ifs for each order, worked at the stepper's extra and the chosen one-off (06-24). */
  scenarios: { rate: PlanScenarios; balance: PlanScenarios };
  oneDebt: boolean;
  /** The first debt cleared in each order at the stepper's extra; null with one debt or none cleared. */
  firstCleared: { rate: string | null; balance: string | null };
  /** The user's pick or the saved order; null before either. Nothing is picked for the user. */
  order: PayoffOrder | null;
  onOrder: (order: PayoffOrder) => void;
  open: ScenarioKey;
  onOpen: (key: ScenarioKey) => void;
  /** The stepper's extra a month, minor units. */
  extra: number;
  onExtra: (next: number) => void;
  /** The one-off amount, minor units (0 while the typed field is empty). */
  lump: number;
  onLump: (next: number) => void;
  /** The extra a month already saved (0 when none). */
  savedExtra: number;
  /** The debt a one-off goes to first, in the shown order; null when there is none yet. */
  lumpDebt: { name: string; balance: number } | null;
  /** YYYY-MM-DD: when a saved (or stopped) extra starts, and the date of a one-off. */
  startDates: { extra: string; once: string };
  onUseExtra: () => void;
  onStopExtra: () => void;
  onUseOnce: () => void;
  /** What is left each month, minor units; null hides the note. */
  left: number | null;
  fmt: DebtFormat;
  currency: string;
}

/** "4 years sooner", "3 years 2 months sooner", "11 months sooner"; "Same as the minimum" at 0; null without a figure. */
export function soonerText(t: T, months: number | null): string | null {
  if (months === null) return null;
  if (months === 0) return t('grow.debts.revealSame');
  const span = soonerSpan(months);
  const years = span.years > 0 ? t('grow.debts.yearsPart', { count: span.years }) : null;
  const rest = span.months > 0 ? t('grow.debts.monthsPart', { count: span.months }) : null;
  const text = years !== null && rest !== null ? t('grow.debts.spanYearsMonths', { years, months: rest }) : years ?? rest ?? '';
  return t('grow.debts.sooner', { span: text });
}

export function PayoffPlanCard(props: PayoffPlanCardProps) {
  const { scenarios, oneDebt, firstCleared, order, onOrder, open, onOpen, extra, onExtra, lump, onLump, savedExtra, lumpDebt } = props;
  const { startDates, onUseExtra, onStopExtra, onUseOnce, left, fmt, currency } = props;
  const t = useT() as T;
  const { colors, pairing } = useTheme();
  const [typing, setTyping] = useState(false);
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const strong = { ...textRole(pairing, 'bodyStrong'), color: colors.ink };

  // One debt: both orders give the same answer, so either serves. 2+ debts and no order: the rows wait for one (D-34).
  const shown: PayoffOrder | null = order ?? (oneDebt ? 'rate' : null);
  const gated = shown === null;
  const plan = shown === null ? null : scenarios[shown];
  const minimum = minimumOnlyFor(scenarios, shown);

  const dateOf = (w: WhatIf): string => (w.payoffDate === null ? '—' : fmt.monthYear(w.payoffDate));
  const aboutOf = (w: WhatIf): string => (w.totalInterest === null ? '—' : fmt.money(aboutTens(w.totalInterest), currency));
  const closedSub = (w: WhatIf): string => t('grow.debts.scenarioClosed', { date: dateOf(w), interest: aboutOf(w) });
  const lessText = (c: Compare): string | null =>
    c.lessInterest === null ? null : c.lessInterest === 0 ? t('grow.debts.revealSame') : t('grow.debts.revealLess', { amount: fmt.money(aboutTens(c.lessInterest), currency) });

  const rows: { key: ScenarioKey; title: string; w: (WhatIf & Partial<Compare>) | null }[] = [
    { key: 'minimum', title: t('grow.debts.scenarioMinimum'), w: plan?.minimumOnly ?? null },
    { key: 'extra', title: t('grow.debts.scenarioExtraTitle'), w: plan?.withExtra ?? null },
    { key: 'once', title: t('grow.debts.scenarioOnceTitle'), w: plan?.withLump ?? null },
  ];

  const reveal = (w: WhatIf & Compare) => {
    const sooner = soonerText(t, w.soonerMonths);
    const less = lessText(w);
    return (
      <View testID="payoff-reveal" style={styles.reveal}>
        <View style={styles.revealLine}>
          <Text style={[label, styles.revealLabel]}>{t('grow.debts.revealDebtFree')}</Text>
          <View style={styles.flex}>
            <Text style={strong}>{dateOf(w)}</Text>
            {sooner === null ? null : <Text style={label}>{sooner}</Text>}
          </View>
          <Text style={[label, styles.revealWas]}>{t('grow.debts.revealWas', { value: dateOf(minimum) })}</Text>
        </View>
        <View style={styles.revealLine}>
          <Text style={[label, styles.revealLabel]}>{t('grow.debts.revealInterest')}</Text>
          <View style={styles.flex}>
            <Text style={strong}>{w.totalInterest === null ? '—' : t('grow.debts.revealAbout', { amount: aboutOf(w) })}</Text>
            {less === null ? null : <Text style={label}>{less}</Text>}
          </View>
          <Text style={[label, styles.revealWas]}>{t('grow.debts.revealWas', { value: aboutOf(minimum) })}</Text>
        </View>
      </View>
    );
  };

  const revealA11y = (w: WhatIf & Compare): string | null => {
    const sooner = soonerText(t, w.soonerMonths);
    const less = lessText(w);
    if (w.payoffDate === null || w.totalInterest === null || sooner === null || less === null) return null;
    return t('grow.debts.revealA11y', { date: fmt.monthYearLong(w.payoffDate), sooner, interest: aboutOf(w), less });
  };

  const control = (key: ScenarioKey) => {
    if (key === 'extra') {
      return (
        <View style={styles.control}>
          <Text style={body}>{t('grow.debts.extraLabel')}</Text>
          <Stepper
            value={extra}
            step={EXTRA_STEP}
            min={0}
            onChange={onExtra}
            valueText={fmt.money(extra, currency)}
            accessibilityLabel={t('grow.debts.extraA11y', { amount: fmt.spoken(extra, currency) })}
            decrementLabel={t('grow.debts.less')}
            incrementLabel={t('grow.debts.more')}
          />
        </View>
      );
    }
    if (key === 'once') {
      return (
        <View style={styles.control}>
          <View style={styles.chips}>
            {ONCE_CHIPS.map((amount) => (
              <Chip
                key={amount}
                label={fmt.money(amount, currency)}
                selected={!typing && lump === amount}
                onPress={() => {
                  setTyping(false);
                  onLump(amount);
                }}
              />
            ))}
            <Chip label={t('grow.debts.onceTypeChip')} selected={typing} onPress={() => setTyping(true)} />
          </View>
          {typing ? (
            <MoneyInput
              value={lump > 0 ? lump : null}
              currency={currency}
              onChange={(v) => onLump(v ?? 0)}
              label={t('grow.debts.onceAmountLabel')}
              accessibilityLabel={t('grow.debts.onceAmountLabel')}
              boxed
            />
          ) : null}
        </View>
      );
    }
    return null;
  };

  // The button follows the open row (D3) and names its start date (D-30).
  const extraDate = fmt.dayMonth(startDates.extra);
  const onceDate = fmt.dayMonth(startDates.once);
  const overOwed = lumpDebt !== null && lump > lumpDebt.balance;
  let action: React.ReactNode;
  if (open === 'minimum') {
    action =
      savedExtra > 0 ? (
        <Pill label={t('grow.debts.stopExtraFrom', { date: extraDate })} variant="secondary" disabled={gated} onPress={onStopExtra} />
      ) : (
        <Text style={label}>{t('grow.debts.minimumIsPlan')}</Text>
      );
  } else if (open === 'extra') {
    action =
      extra <= 0 && savedExtra > 0 ? (
        <Pill label={t('grow.debts.stopExtraFrom', { date: extraDate })} variant="secondary" disabled={gated} onPress={onStopExtra} />
      ) : (
        <Pill
          label={t('grow.debts.useExtraFrom', { amount: fmt.money(extra, currency), date: extraDate })}
          variant="primary"
          disabled={gated || extra <= 0}
          onPress={onUseExtra}
        />
      );
  } else {
    action = (
      <>
        {overOwed && lumpDebt !== null ? (
          <Text style={label}>
            {t('grow.debts.onceMoreThanOwed', { amount: fmt.money(lump, currency), owed: fmt.money(lumpDebt.balance, currency), name: lumpDebt.name })}
          </Text>
        ) : null}
        <Pill
          label={t('grow.debts.useOnceOn', { amount: fmt.money(lump, currency), date: onceDate })}
          variant="primary"
          disabled={gated || lump <= 0 || lumpDebt === null || overOwed}
          onPress={onUseOnce}
        />
      </>
    );
  }

  const orders: { key: PayoffOrder; titleKey: string }[] = [
    { key: 'rate', titleKey: 'grow.debts.orderRate' },
    { key: 'balance', titleKey: 'grow.debts.orderBalance' },
  ];

  return (
    <View testID="grow-payoff-plan" style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('grow.debts.planTitle')}
      </Text>
      {minimum.payoffDate === null ? null : <Text style={body}>{t('grow.debts.planDebtFree', { date: fmt.monthYear(minimum.payoffDate) })}</Text>}

      {oneDebt ? (
        <>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('grow.debts.orderLabel')}
            accessibilityState={{ disabled: true }}
            style={[styles.switch, { backgroundColor: colors.fill1, opacity: GREYED_OPACITY }]}
          >
            {orders.map((o) => (
              <Pressable
                key={o.key}
                testID={`payoff-order-${o.key}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: false, disabled: true }}
                disabled
                style={styles.switchPart}
              >
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim, textAlign: 'center' }}>{t(o.titleKey)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={label}>{t('grow.debts.oneDebt')}</Text>
        </>
      ) : (
        <>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('grow.debts.orderLabel')} style={styles.columns}>
            {orders.map((o) => {
              const w = scenarios[o.key].withExtra;
              const first = firstCleared[o.key];
              const picked = order === o.key;
              return (
                <Pressable
                  key={o.key}
                  testID={`payoff-order-${o.key}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: picked }}
                  onPress={() => onOrder(o.key)}
                  style={({ pressed }) => [
                    styles.column,
                    { borderColor: picked ? colors.ink : colors.line1, opacity: pressed ? PRESSED_OPACITY : 1 },
                  ]}
                >
                  <View style={styles.columnHead}>
                    <RadioDot selected={picked} />
                    <Text style={[strong, styles.flex]}>{t(o.titleKey)}</Text>
                  </View>
                  <Text style={label}>{t('grow.debts.revealDebtFree')}</Text>
                  <Text style={body}>{dateOf(w)}</Text>
                  <Text style={label}>{t('grow.debts.revealInterest')}</Text>
                  <Text style={body}>{w.totalInterest === null ? '—' : t('grow.debts.revealAbout', { amount: aboutOf(w) })}</Text>
                  {first === null ? null : (
                    <>
                      <Text style={label}>{t('grow.debts.firstCleared')}</Text>
                      <Text style={body}>{fmt.monthYear(first)}</Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Text style={label}>{t('grow.debts.choiceIsYours')}</Text>
        </>
      )}

      <View accessibilityRole="radiogroup" style={styles.rows}>
        {rows.map((row) => {
          const isOpen = open === row.key;
          const w = row.w;
          const compare = w !== null && row.key !== 'minimum' ? (w as WhatIf & Compare) : null;
          const sub = w === null ? null : closedSub(w);
          const a11y = isOpen && compare !== null ? revealA11y(compare) : null;
          return (
            <View
              key={row.key}
              testID={`payoff-row-${row.key}`}
              style={[styles.row, { borderColor: isOpen ? colors.ink : colors.line1, borderWidth: isOpen ? 2 : 1 }]}
            >
              <Pressable
                testID={`payoff-scenario-${row.key}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isOpen, expanded: isOpen }}
                accessibilityLabel={a11y !== null ? `${row.title}. ${a11y}` : sub === null ? row.title : `${row.title}, ${sub}`}
                onPress={() => onOpen(row.key)}
                style={({ pressed }) => [styles.rowHead, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <RadioDot selected={isOpen} />
                <View style={styles.flex}>
                  <Text style={strong}>{row.title}</Text>
                  {sub === null || (isOpen && compare !== null) ? null : <Text style={label}>{sub}</Text>}
                </View>
              </Pressable>
              {isOpen ? control(row.key) : null}
              {isOpen && compare !== null ? reveal(compare) : null}
              {isOpen && row.key === 'once' && !oneDebt && lumpDebt !== null && !gated ? (
                <Text style={label}>{t('grow.debts.onceGoesTo', { name: lumpDebt.name })}</Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {gated ? <Text style={label}>{t('grow.debts.pickOrderFirst')}</Text> : null}

      {left === null ? null : <Text style={label}>{t('grow.debts.leftNote', { amount: fmt.money(Math.max(0, left), currency) })}</Text>}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  switch: { flexDirection: 'row', borderRadius: radii.pill, padding: 2 },
  switchPart: { flex: 1, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gapSm },
  columns: { flexDirection: 'row', gap: space.gapMd },
  column: { flex: 1, borderWidth: 2, borderRadius: radii.card, padding: space.cardPad, gap: 2, minHeight: space.touchMin },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, marginBottom: space.gapSm },
  rows: { gap: space.gapSm },
  row: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin },
  control: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  reveal: { gap: space.gapMd },
  revealLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gapMd },
  revealLabel: { flex: 1 },
  revealWas: { flex: 1, textAlign: 'right' },
  flex: { flex: 1, gap: 2 },
});
