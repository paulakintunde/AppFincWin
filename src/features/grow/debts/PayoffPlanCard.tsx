// 06-17 (G05, D-13, GRW-08, GRW-09): the payoff plan card. The two payoff orders sit side by side with equal weight and no
// default: neither is marked until the user taps one, and the card says "The choice is yours." The extra stepper and the three
// what-ifs read the engine figures in the read model; nothing here is worked out beyond the "about" rounding and date lookup.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PayoffOrder } from '@/engine/payoff';
import { dueDateOf } from '@/features/grow/connect/debtPoint';
import { Stepper } from '@/features/grow/ui/Stepper';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Text } from '@/ui/Text';
import { aboutTens, firstClearedDate } from './debtLineModel';
import type { DebtFormat } from './debtScreenData';
import type { DebtsModel, OrderPlan, PlanOutcome, Scenario } from './useDebtsRead';

export const EXTRA_STEP = 2500;
export type ScenarioKey = 'minimum' | 'extra' | 'once';

export interface PayoffPlanCardProps {
  /** The saved plan (columns). */
  model: DebtsModel;
  /** The same debts worked with the stepper's extra (the three what-ifs). */
  whatIf: DebtsModel;
  currency: string;
  today: string;
  /** The what-if extra a month and the one-off lump, minor units. */
  extra: number;
  lump: number;
  onExtra: (next: number) => void;
  /** The user's pick, or null before they tap one. */
  order: PayoffOrder | null;
  onOrder: (order: PayoffOrder) => void;
  scenario: ScenarioKey;
  onScenario: (key: ScenarioKey) => void;
  /** What is left each month, minor units; null hides the note. */
  left: number | null;
  fmt: DebtFormat;
  onUseExtra: () => void;
}

function outcomeShown(plan: OrderPlan, extra: number): PlanOutcome {
  return extra > 0 ? plan.withExtra : plan.withoutExtra;
}

export function PayoffPlanCard({
  model,
  whatIf,
  currency,
  today,
  extra,
  lump,
  onExtra,
  order,
  onOrder,
  scenario,
  onScenario,
  left,
  fmt,
  onUseExtra,
}: PayoffPlanCardProps) {
  const t = useT() as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const plan = model.plan;
  if (plan === null) return null;
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const strong = { ...textRole(pairing, 'label'), color: colors.ink };

  const columns: { key: PayoffOrder; titleKey: string; plan: OrderPlan }[] = [
    { key: 'rate', titleKey: 'grow.debts.orderRate', plan: plan.rate },
    { key: 'balance', titleKey: 'grow.debts.orderBalance', plan: plan.balance },
  ];

  const focus = whatIf.focus;
  const focusDebt = focus === null ? null : whatIf.debts.find((d) => d.id === focus.id) ?? null;
  const dateOfMonths = (s: Scenario): string => {
    if (s.outcome !== 'cleared' || focusDebt === null || focusDebt.point.dueDay === null || s.months < 1) return '—';
    return fmt.monthYear(dueDateOf(today, focusDebt.point.dueDay, s.months - 1));
  };
  const interestOf = (s: Scenario): string => (s.totalInterest === null ? '—' : fmt.money(aboutTens(s.totalInterest), currency));

  const scenarios: { key: ScenarioKey; title: string; s: Scenario }[] =
    focus === null
      ? []
      : [
          { key: 'minimum', title: t('grow.debts.scenarioMinimum'), s: focus.minimumOnly },
          { key: 'extra', title: t('grow.debts.scenarioExtra', { amount: fmt.money(extra, currency) }), s: focus.withExtra },
          { key: 'once', title: t('grow.debts.scenarioOnce', { amount: fmt.money(lump, currency) }), s: focus.withLump },
        ];

  return (
    <View testID="grow-payoff-plan" style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('grow.debts.planTitle')}
      </Text>

      <View accessibilityRole="radiogroup" accessibilityLabel={t('grow.debts.orderLabel')} style={styles.columns}>
        {columns.map((c) => {
          const shown = outcomeShown(c.plan, model.extra);
          const first = firstClearedDate(model.debts, model.extra, c.key, today);
          const picked = order === c.key;
          return (
            <Pressable
              key={c.key}
              testID={`payoff-order-${c.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked, disabled: model.oneDebt }}
              disabled={model.oneDebt}
              onPress={() => onOrder(c.key)}
              style={({ pressed }) => [
                styles.column,
                { borderColor: picked ? colors.accent : colors.line1, opacity: pressed ? PRESSED_OPACITY : 1 },
              ]}
            >
              <View style={styles.columnHead}>
                <RadioDot selected={picked} />
                <Text style={[strong, styles.flex]}>{t(c.titleKey)}</Text>
              </View>
              <Text style={label}>{t('grow.debts.payoffDate')}</Text>
              <Text style={body}>{shown.payoffDate === null ? '—' : fmt.monthYear(shown.payoffDate)}</Text>
              <Text style={label}>{t('grow.debts.totalInterest')}</Text>
              <Text style={body}>{shown.totalInterest === null ? '—' : fmt.money(shown.totalInterest, currency)}</Text>
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
      <Text style={label}>{model.oneDebt ? t('grow.debts.oneDebt') : t('grow.debts.choiceIsYours')}</Text>
      {model.oneDebt ? <Text style={label}>{t('grow.debts.choiceIsYours')}</Text> : null}

      <View style={styles.extraRow}>
        <Text style={[body, styles.flex]}>{t('grow.debts.extraLabel')}</Text>
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

      <View accessibilityRole="radiogroup" style={styles.scenarios}>
        {scenarios.map((row) => {
          const selected = scenario === row.key;
          const sooner = focus === null ? 0 : focus.minimumOnly.months - row.s.months;
          const sub =
            row.key === 'extra' && sooner > 0 && row.s.outcome === 'cleared'
              ? t('grow.debts.scenarioRowSooner', {
                  date: dateOfMonths(row.s),
                  interest: interestOf(row.s),
                  months: t('grow.calc.payoff.debtFreeValue', { count: sooner }),
                })
              : t('grow.debts.scenarioRow', { date: dateOfMonths(row.s), interest: interestOf(row.s) });
          return (
            <Pressable
              key={row.key}
              testID={`payoff-scenario-${row.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${row.title}, ${sub}`}
              onPress={() => onScenario(row.key)}
              style={({ pressed }) => [
                styles.scenario,
                { borderColor: selected ? colors.ink : colors.line1, opacity: pressed ? PRESSED_OPACITY : 1 },
              ]}
            >
              <RadioDot selected={selected} />
              <View style={styles.flex}>
                <Text style={strong}>{row.title}</Text>
                <Text style={label}>{sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {left === null ? null : <Text style={label}>{t('grow.debts.leftNote', { amount: fmt.money(Math.max(0, left), currency) })}</Text>}
      <Pill
        label={t('grow.debts.useExtra', { amount: fmt.money(extra, currency) })}
        variant="primary"
        disabled={extra <= 0}
        onPress={onUseExtra}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  columns: { flexDirection: 'row', gap: space.gapMd },
  column: { flex: 1, borderWidth: 2, borderRadius: radii.card, padding: space.cardPad, gap: 2, minHeight: space.touchMin },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, marginBottom: space.gapSm },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  scenarios: { gap: space.gapSm },
  scenario: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderWidth: 1, borderRadius: radii.card, padding: space.cardPad, minHeight: 64 },
  flex: { flex: 1 },
});

