// 06-15 (G01): the Goals segment. Hero (saved across goals), the safety net card first, goal rows, "+ New goal".
// Everything is read through useGoalsRead (06-12), the same connection points Decide uses, so the figures match Decide's.
// `basics` draws only the safety net card (level Basics: goals off). Loading is grey blocks with no loop; an error is the
// generic card with Try again.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEditGoal } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideSettings } from '@/data/queries/decide';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { minorUnits } from '@/engine/money';
import { goalPlanByMonthly } from '@/engine/grow';
import { useT } from '@/i18n';
import { firstOfNextMonth } from '@/features/grow/calculators/typed/useCalcInput';
import { MoneyMoveSheet, type MoneyMovedEvent } from '@/features/grow/goals/MoneyMoveSheet';
import { NewGoalSheet } from '@/features/grow/goals/NewGoalSheet';
import { useGoalToast } from '@/features/grow/goals/useGoalToast';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { GoalRow } from './GoalRow';
import { useGoalMoney } from './useGoalMoney';
import { SafetyNetCard } from './SafetyNetCard';

export interface GoalsSegmentProps {
  /** Level Basics: only the safety net card. */
  basics?: boolean;
  /** FAB and "+ New goal": plan 06-22 mounts the sheet this opens. */
  onNewGoal: () => void;
  /** Basics only: "Choose what to track". */
  onChooseTrack?: () => void;
}

export { useGoalMoney };

export function GoalsSegment({ basics = false, onNewGoal, onChooseTrack }: GoalsSegmentProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const read = useGoalsRead();
  const money = useGoalMoney();
  const rowsQ = useSavingsGoalRows(read.userId ?? undefined, read.householdId ?? undefined);
  const accountsQ = useAccounts(read.householdId ?? undefined);
  const { remove } = useEditGoal();
  const toast = useGoalToast();
  const [sheet, setSheet] = useState<{ id: string; kind: 'add' | 'edit' } | null>(null);
  const settings = useDecideSettings(read.userId ?? undefined).data ?? null;
  const rule = settings === null ? null : settings.saving_floor;
  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];

  if (read.status === 'loading') {
    return (
      <View testID="grow-goals-loading" accessibilityLabel={t('grow.home.loading')} style={styles.stack}>
        <View style={[styles.block, { height: 96, backgroundColor: colors.fill1 }]} />
        <View style={[styles.block, { height: 112, backgroundColor: colors.fill1 }]} />
        <View style={[styles.block, { height: 128, backgroundColor: colors.fill1 }]} />
      </View>
    );
  }
  if (read.status === 'error') {
    return (
      <View testID="grow-goals-error" style={[...card, styles.center]}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.common.loadErrorTitle')}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.common.loadErrorBody')}</Text>
        <Pill label={t('grow.common.tryAgain')} variant="secondary" onPress={read.refetch} />
      </View>
    );
  }

  const { model } = read;
  const pendingOf = (id: string): number => (model.pendingByGoal ?? {})[id] ?? 0;
  const net = (
    <SafetyNetCard
      net={model.safetyNet}
      money={money}
      pending={model.safetyNet === null ? 0 : pendingOf(model.safetyNet.goalId)}
      monthly={model.netMonthly ?? null}
      reachesOn={model.netReachesOn ?? null}
    />
  );
  if (basics) {
    return (
      <View style={styles.stack}>
        {net}
        <View testID="grow-basics-card" style={[...card, styles.center]}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.home.basicsBody')}</Text>
          <Pill label={t('grow.home.basicsButton')} variant="secondary" onPress={onChooseTrack} />
        </View>
      </View>
    );
  }

  const goalCount = model.goalCount ?? model.goals.length;
  const netCounted = model.netCounted ?? model.safetyNet !== null;
  const heroLabel =
    netCounted && goalCount === 0
      ? t('grow.home.goalsHeroLabelNetOnly')
      : t(netCounted ? 'grow.home.goalsHeroLabelNet' : 'grow.home.goalsHeroLabel', { count: goalCount });
  const rows = rowsQ.data;
  const sheetRow = sheet === null ? null : (rows?.find((r) => r.id === sheet.id && r.deleted_at === null) ?? null);
  const sheetSaved = sheet === null ? 0 : (model.goals.find((g) => g.id === sheet.id)?.saved ?? 0);
  const accountName = (accountId: string | null): string => {
    const a = (accountsQ.data ?? []).find((x) => x.id === accountId);
    return a === undefined ? t('grow.goals.move.pickAccount') : a.name;
  };
  const removeGoal = (id: string) => {
    const row = rows?.find((r) => r.id === id && r.deleted_at === null);
    if (row === undefined || read.userId === null) return;
    const stepId = remove(row, read.userId);
    toast({ key: 'grow.goals.removedToast', stepId, undoLabel: 'goalRemoved', name: row.name, userId: read.userId, householdId: read.householdId });
  };
  const onMoved = (e: MoneyMovedEvent) => {
    if (sheetRow === null) return;
    toast({ key: 'undo.label.goalMoneyMoved', stepId: e.stepId, undoLabel: 'goalMoneyMoved', name: sheetRow.name, userId: read.userId, householdId: read.householdId });
  };
  const anchor = firstOfNextMonth(read.today);
  const reaches = (saved: number, target: number | null, add: number | null): string | null => {
    if (target === null || add === null || add <= 0 || saved >= target) return null;
    return goalPlanByMonthly({ have: minorUnits(saved), target: minorUnits(target), add: minorUnits(add), anchor }).reachesOn;
  };

  return (
    <View style={styles.stack}>
      <View testID="grow-goals-hero" style={card}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{heroLabel}</Text>
        <Text scale="capped" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>
          {money.amount(model.totalSaved)}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {rule === null
            ? t('grow.home.goalsHeroNoteNoRule', { amount: money.amount(model.monthlyIntoGoals) })
            : t('grow.home.goalsHeroNote', { amount: money.amount(model.monthlyIntoGoals), rule: money.amount(rule) })}
        </Text>
      </View>
      {net}
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
        {t('grow.home.goalsSection')}
      </Text>
      {model.goals.length === 0 ? (
        <View testID="grow-goals-empty" style={[...card, styles.center]}>
          <GrowGlyph name="savings" color={colors.accent} size={28} />
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.goals.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.goals.emptyBody')}</Text>
          <Pill label={t('grow.goals.emptyAction')} variant="primary" onPress={onNewGoal} />
        </View>
      ) : (
        <View style={card}>
          {model.goals.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              reachesOn={reaches(g.saved, g.target, g.monthlyAmount)}
              money={money}
              pending={pendingOf(g.id)}
              actions={{
                onAddMoney: () => setSheet({ id: g.id, kind: 'add' }),
                onEdit: () => setSheet({ id: g.id, kind: 'edit' }),
                onRemove: () => removeGoal(g.id),
                confirm: {
                  title: t('grow.goals.removeTitle', { name: g.name }),
                  body: t('grow.goals.removeBody', {
                    amount: money.amount(g.saved),
                    account: accountName(rows?.find((r) => r.id === g.id)?.account_id ?? null),
                  }),
                },
              }}
            />
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={t('grow.home.newGoal')} onPress={onNewGoal} style={styles.newGoal}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.home.newGoal')}</Text>
          </Pressable>
        </View>
      )}
      <MoneyMoveSheet visible={sheet?.kind === 'add'} goal={sheetRow} kind="add" onClose={() => setSheet(null)} onMoved={onMoved} />
      <NewGoalSheet visible={sheet?.kind === 'edit' && sheetRow !== null} goal={sheetRow ?? undefined} saved={sheetSaved} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.cardPad, gap: space.gapSm },
  center: { alignItems: 'center' },
  block: { borderRadius: radii.card },
  newGoal: { minHeight: space.touchMin, justifyContent: 'center' },
});
