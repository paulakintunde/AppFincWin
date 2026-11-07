// 06-22 (G02): the two quick edits on goal detail. "Each month" takes an amount and previews when the target is reached; "Reaches"
// takes a month and previews the amount needed each month (rounded UP to the cent, so the goal is reached, never missed by a
// cent). Both save through useSaveGoalPlan and hand the goal's existing monthly record back, so an edit never stops it.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSaveGoalPlan } from '@/data/mutations/growGoals';
import type { GoalPlanSeries } from '@/db/goalPlan';
import type { RecurringSeriesRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { lastDayOfMonth } from '@/features/decide/pots/potsModel';
import { MonthField } from '@/features/decide/pots/MonthField';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { useGoalMoney } from '@/features/grow/home/GoalsSegment';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { planAnchor, planFromBy, planFromMonthly } from './goalPlanModel';

export type PlanEditMode = 'monthly' | 'by';

/** The goal's live monthly record (its saving series), or null. */
export function goalSeriesOf(rows: readonly RecurringSeriesRow[] | undefined, goalId: string): RecurringSeriesRow | null {
  return (rows ?? []).find((s) => s.goal_id === goalId && s.deleted_at === null && s.end_date === null) ?? null;
}

/** The save_goal_plan series payload for an existing record at a new monthly amount (the amount is positive; the record is money out). */
export function seriesPayload(existing: RecurringSeriesRow, amount: number): GoalPlanSeries {
  return {
    id: existing.id,
    account_id: existing.account_id,
    amount,
    anchor_date: existing.anchor_date,
    time_zone: existing.time_zone,
    name: existing.name,
    category_id: existing.category_id,
  };
}

export interface GoalPlanEditSheetProps {
  mode: PlanEditMode | null;
  goal: SavingsGoalRow;
  /** Saved so far, home currency minor units. */
  saved: number;
  today: string;
  series: RecurringSeriesRow | null;
  ownerId: string | null;
  onClose: () => void;
  onSaved: (stepId: string) => void;
}

export function GoalPlanEditSheet(props: GoalPlanEditSheetProps) {
  return props.mode === null ? null : <PlanForm {...props} mode={props.mode} />;
}

function PlanForm({ mode, goal, saved, today, series, ownerId, onClose, onSaved }: GoalPlanEditSheetProps & { mode: PlanEditMode }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const calc = useCalcFormat();
  const whole = useGoalMoney();
  const { save } = useSaveGoalPlan();
  const [monthly, setMonthly] = useState<number | null>(goal.monthly_amount);
  const [byMonth, setByMonth] = useState<string | null>(null);

  const target = goal.target;
  const anchorMonth = planAnchor(today).slice(0, 7);
  const lastMonth = `${Number(anchorMonth.slice(0, 4)) + 50}-${anchorMonth.slice(5, 7)}`;

  let preview = '';
  let value: number | null = null;
  if (mode === 'monthly') {
    value = monthly !== null && monthly > 0 ? monthly : null;
    if (value !== null && target !== null) {
      const { reachesOn } = planFromMonthly({ saved, target, monthly: value, today });
      if (reachesOn !== null) preview = t('grow.goals.detail.setEachMonthPreview', { target: whole.amount(target), date: calc.monthYear(reachesOn) });
    }
  } else if (byMonth !== null && target !== null) {
    const needed = planFromBy({ saved, target, byMonthStart: `${byMonth}-01`, today });
    if (needed !== null && needed > 0) {
      value = needed;
      preview = t('grow.goals.detail.setByPreview', { amount: calc.money(needed) });
    }
  }

  const canSave = ownerId !== null && value !== null && (mode === 'monthly' || byMonth !== null);
  const title = t(mode === 'monthly' ? 'grow.goals.detail.setEachMonthTitle' : 'grow.goals.detail.setByTitle');

  const onSave = () => {
    if (!canSave || value === null || ownerId === null) return;
    const fields = mode === 'monthly' ? { monthly_amount: value } : { monthly_amount: value, ready_by: lastDayOfMonth(byMonth as string) };
    const { stepId } = save({ ownerId, existing: goal, fields, series: series === null ? null : seriesPayload(series, value) });
    hapticLight();
    onClose();
    onSaved(stepId);
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.body}>
          {mode === 'monthly' ? (
            <MoneyInput value={monthly} currency={goal.currency} onChange={setMonthly} label={title} accessibilityLabel={title} large boxed zeroHint />
          ) : (
            <MonthField
              label={title}
              value={byMonth}
              minMonth={anchorMonth}
              maxMonth={lastMonth}
              empty={t('grow.goals.move.pickDate')}
              format={(m) => calc.monthYear(`${m}-01`)}
              onChange={setByMonth}
            />
          )}
          <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {preview}
          </Text>
          <Pill label={t('grow.goals.detail.save')} variant="primary" disabled={!canSave} onPress={onSave} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
});
