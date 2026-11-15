// 06-15 (G01): one goal row. 36 px tile, name, "saved of target · monthly · date", a thin bar underneath, and a plum
// "Linked to a check" badge when a Decide check made the goal. The spoken label carries every figure (the bar is never the only signal).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { DeletableRow } from '@/ui/DeletableRow';
import type { GoalPoint } from '@/features/grow/connect';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface GoalRowMoney {
  /** Display amount, e.g. "$640". */
  amount(minor: number): string;
  /** Spoken amount, e.g. "640 dollars". */
  spoken(minor: number): string;
  /** "Oct 2028" for a YYYY-MM-DD date. */
  monthYear(date: string): string;
  /** Spoken month, e.g. "October 2028". */
  monthYearLong(date: string): string;
}

export interface GoalRowProps {
  goal: GoalPoint;
  /** The month the monthly amount reaches the target (YYYY-MM-DD), or null when it does not. */
  reachesOn: string | null;
  money: GoalRowMoney;
  animate?: boolean;
  /** Expected lines waiting for a confirm (D-32). */
  pending?: number;
  /** Swipe and the more menu (D-32). Absent: a plain tappable row. */
  actions?: GoalRowActions;
  /** P4-IN-02: the icon the user picked for the goal; absent, the calendar (or the check glyph for a check's goal). */
  icon?: SavingsGoalRow['icon'];
}

export interface GoalRowActions {
  onAddMoney: () => void;
  /** Absent: no Edit in the menu (P4-WR-02: a Wait goal's plan is its Decide check's). */
  onEdit?: () => void;
  onRemove: () => void;
  /** The remove confirm sheet's words. */
  confirm: { title: string; body: string };
}

export function goalHref(id: string): Href {
  return `/grow/goal/${id}` as Href;
}

export function goalPercent(saved: number, target: number | null): number {
  if (target === null || target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((saved / target) * 100)));
}

export function GoalRow({ goal, reachesOn, money, animate = true, pending = 0, actions, icon = null }: GoalRowProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const percent = goalPercent(goal.saved, goal.target);
  const monthly = goal.monthlyAmount !== null && goal.monthlyAmount > 0 ? goal.monthlyAmount : null;
  const date = reachesOn ?? goal.readyBy;
  // The engine's never-reached signal (monthsToReach caps at 600): a monthly amount, a target not yet reached, and no reach month.
  const notReached = monthly !== null && goal.target !== null && goal.saved < goal.target && reachesOn === null;

  let sub: string;
  let spoken: string;
  if (goal.target === null) {
    sub = t('grow.home.goalRowNoTarget', { saved: money.amount(goal.saved) });
    spoken = `${goal.name}, ${sub}`;
  } else if (notReached && monthly !== null) {
    sub = t('grow.home.goalRowNotReached', { saved: money.amount(goal.saved), target: money.amount(goal.target), monthly: money.amount(monthly) });
    spoken = `${goal.name}, ${sub}, ${percent}%`;
  } else if (monthly === null || date === null) {
    sub = t('grow.home.goalRowNoMonthly', { saved: money.amount(goal.saved), target: money.amount(goal.target) });
    spoken = `${goal.name}, ${sub}, ${percent}%`;
  } else {
    sub = t('grow.home.goalRow', {
      saved: money.amount(goal.saved),
      target: money.amount(goal.target),
      monthly: money.amount(monthly),
      date: money.monthYear(date),
    });
    spoken = t('grow.home.goalRowA11y', {
      name: goal.name,
      saved: money.spoken(goal.saved),
      target: money.spoken(goal.target),
      percent,
      monthly: money.spoken(monthly),
      date: money.monthYearLong(date),
    });
  }
  if (goal.linkedCheckId !== null) spoken = `${spoken}, ${t('grow.home.linkedToCheck')}`;
  if (pending > 0) spoken = `${spoken}, ${t('grow.home.toConfirmA11y', { count: pending })}`;

  const content = (
    <View testID={`grow-goal-row-${goal.id}`} style={styles.row}>
      <View style={styles.top}>
        <View style={[styles.tile, { backgroundColor: colors.fill1 }]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.glyphTile }]} />
          <GrowGlyph name={icon ?? (goal.linkedCheckId !== null ? 'checkbuy' : 'calendar')} color={colors.accent} size={22} />
        </View>
        <View style={styles.text}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{goal.name}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text>
          {goal.linkedCheckId !== null ? <StateBadge tone="plum" shape="sHalf" label={t('grow.home.linkedToCheck')} /> : null}
          {pending > 0 ? <StateBadge tone="slate" shape="sClock" label={t('grow.home.toConfirm', { count: pending })} /> : null}
        </View>
        {actions === undefined ? <GrowGlyph name="chev" color={colors.inkFaint} size={16} /> : null}
      </View>
      {goal.target !== null ? <ProgressBar percent={percent} variant="thin" animate={animate} /> : null}
    </View>
  );

  if (actions === undefined) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={() => pushOnce(goalHref(goal.id))}>
        {content}
      </Pressable>
    );
  }
  return (
    <DeletableRow
      name={goal.name}
      accessibilityLabel={spoken}
      onOpen={() => pushOnce(goalHref(goal.id))}
      menu={[
        { key: 'add', label: t('grow.goals.detail.addMoney'), onSelect: actions.onAddMoney },
        ...(actions.onEdit === undefined ? [] : [{ key: 'edit', label: t('grow.goals.detail.edit'), onSelect: actions.onEdit }]),
      ]}
      confirm={actions.confirm}
      onDelete={actions.onRemove}
      actionWord={t('grow.home.rowRemove')}
    >
      {content}
    </DeletableRow>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, justifyContent: 'center', gap: space.gapSm, paddingVertical: space.gapMd },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  tile: { width: 36, height: 36, borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { flex: 1, gap: 2, alignItems: 'flex-start' },
});
