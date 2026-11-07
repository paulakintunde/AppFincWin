// 06-22 (G02): one goal. What is saved of the target, the two-way plan rows (change one and the other follows), where the money
// is kept and its monthly record, Add money / Take some out, history with Expected lines the user confirms (nothing moves by
// itself, D-25), the Decide effect of the lock, "Use as my safety net" (D-29), and Remove. Every figure comes from the same
// connection points Decide reads (useGoalsRead), so Grow and Decide show one number.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useConfirmGoalContribution, useEditGoal } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useGoalLines, useSavingsGoalRows } from '@/data/queries/growGoals';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { TransactionRow } from '@/db/rows';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { checkHref } from '@/features/decide/home/checkHref';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { goalPercent } from '@/features/grow/home/GoalRow';
import { useGoalMoney } from '@/features/grow/home/GoalsSegment';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { GoalPlanEditSheet, goalSeriesOf, type PlanEditMode } from './GoalPlanEditSheet';
import { MoneyMoveSheet, type MoneyMovedEvent, type MoveKind } from './MoneyMoveSheet';
import { NewGoalSheet } from './NewGoalSheet';
import { ReachedMoment } from './ReachedMoment';
import { UseAsSafetyNetSheet } from './UseAsSafetyNetSheet';
import { planFromMonthly } from './goalPlanModel';
import { useGoalToast } from './useGoalToast';
import { useGoalsRead } from './useGoalsRead';

/** "16th" for 16 (English suffixes; the surrounding sentence is the localised part). */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

interface HistoryItem {
  key: string;
  date: string;
  amount: number;
  kind: 'paid' | 'expected' | 'start';
  line: TransactionRow | null;
}

export function GoalDetailScreen({ id }: { id: string }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { userId, householdId, today, formatDate } = usePastContext();
  const money = useGoalMoney();
  const calc = useCalcFormat();
  const read = useGoalsRead();
  const rowsQ = useSavingsGoalRows(userId ?? undefined, householdId ?? undefined);
  const linesQ = useGoalLines(householdId, [id]);
  const seriesQ = useRecurringSeries(householdId ?? undefined);
  const accountsQ = useAccounts(householdId ?? undefined);
  const { edit, remove } = useEditGoal();
  const { confirm } = useConfirmGoalContribution();
  const toast = useGoalToast();

  const [move, setMove] = useState<MoveKind | null>(null);
  const [planMode, setPlanMode] = useState<PlanEditMode | null>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [netAsk, setNetAsk] = useState(false);
  const [confirming, setConfirming] = useState<HistoryItem | null>(null);
  const [justReached, setJustReached] = useState(false);

  const rows = rowsQ.data;
  const row = rows?.find((r) => r.id === id && r.deleted_at === null) ?? null;
  const net = rows?.find((r) => r.is_safety_net === true && r.deleted_at === null) ?? null;
  const isNet = row !== null && row.is_safety_net === true;
  const point = isNet ? read.model.safetyNet : (read.model.goals.find((g) => g.id === id) ?? null);
  const series = goalSeriesOf(seriesQ.data, id);
  const account = row === null ? null : ((accountsQ.data ?? []).find((a) => a.id === row.account_id) ?? null);

  const history = useMemo<HistoryItem[]>(() => {
    if (row === null) return [];
    const items: HistoryItem[] = [];
    for (const l of linesQ.data ?? []) {
      if (l.goal_id !== id || l.status === 'skipped' || l.deleted_at !== null) continue;
      items.push({
        key: l.id,
        date: l.local_date,
        amount: l.transfer_id === null ? Math.abs(l.original_amount) : l.original_amount,
        kind: l.status === 'pending' ? 'expected' : 'paid',
        line: l,
      });
    }
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (row.opening_saved > 0) items.push({ key: 'start', date: row.created_at.slice(0, 10), amount: row.opening_saved, kind: 'start', line: null });
    return items;
  }, [linesQ.data, row, id]);

  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];

  if (rowsQ.isError) {
    return (
      <DetailScreen title="">
        <View testID="goal-error" style={[...card, styles.center]}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.common.loadErrorTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.common.loadErrorBody')}</Text>
          <Pill label={t('grow.common.tryAgain')} variant="secondary" onPress={() => void rowsQ.refetch()} />
        </View>
      </DetailScreen>
    );
  }
  if (row === null || point === null) {
    return (
      <DetailScreen title="">
        <View testID="goal-loading" accessibilityLabel={t('grow.home.loading')} style={styles.stack}>
          <View style={[styles.block, { height: 96, backgroundColor: colors.fill1 }]} />
          <View style={[styles.block, { height: 128, backgroundColor: colors.fill1 }]} />
        </View>
      </DetailScreen>
    );
  }

  const saved = point.saved;
  const target = row.target;
  const percent = goalPercent(saved, target);
  const reached = target !== null && saved >= target;
  const locked = isNet || row.locked === true;
  const eachMonth = row.monthly_amount ?? 0;
  const reachesOn = target === null ? null : planFromMonthly({ saved, target, monthly: eachMonth, today }).reachesOn;
  const accountName = account === null ? t('grow.goals.move.pickAccount') : account.name;

  const onMoved = (e: MoneyMovedEvent) => {
    if (e.reachedTarget && target !== null) {
      setJustReached(true);
      toast({ key: 'grow.goals.reachedToast', params: { target: money.amount(target) }, stepId: e.stepId, undoLabel: 'goalMoneyMoved', name: row.name, userId, householdId });
    } else {
      toast({ key: 'undo.label.goalMoneyMoved', stepId: e.stepId, undoLabel: 'goalMoneyMoved', name: row.name, userId, householdId });
    }
  };

  const onLockChange = (next: boolean) => {
    if (userId === null || isNet) return;
    const stepId = edit(row, { locked: next }, userId, saved);
    hapticLight();
    toast({ key: 'undo.label.goalEdited', stepId, undoLabel: 'goalEdited', name: row.name, userId, householdId });
  };

  const onRemove = () => {
    if (userId === null) return;
    const stepId = remove(row, userId);
    setRemoving(false);
    toast({ key: 'grow.goals.removedToast', stepId, undoLabel: 'goalRemoved', name: row.name, userId, householdId });
    router.back();
  };

  const onConfirmLine = () => {
    const item = confirming;
    setConfirming(null);
    if (item === null || item.line === null || userId === null) return;
    const stepId = confirm({ ownerId: userId, line: item.line, goal: { id: row.id, name: row.name, currency: row.currency, account_id: row.account_id ?? null } });
    toast({ key: 'undo.label.goalContributionConfirmed', stepId, undoLabel: 'goalContributionConfirmed', name: row.name, userId, householdId });
  };

  const historyText = (h: HistoryItem): string => {
    const params = { date: formatDate(h.date), amount: money.amount(h.amount) };
    return t(h.kind === 'expected' ? 'grow.goals.detail.historyExpected' : h.kind === 'start' ? 'grow.goals.detail.historyStart' : 'grow.goals.detail.historyRow', params);
  };

  const editAction = (
    <Pressable testID="goal-edit" accessibilityRole="button" accessibilityLabel={t('grow.goals.detail.edit')} onPress={() => setEditing(true)} style={styles.editButton}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('grow.goals.detail.edit')}</Text>
    </Pressable>
  );

  return (
    <DetailScreen title={row.name} right={editAction}>
      <View style={styles.stack}>
        <View style={[...card, styles.figureCard]}>
          <View style={styles.figureRow}>
            <Text testID="goal-saved" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>
              {money.amount(saved)}
            </Text>
            {target !== null ? (
              <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('grow.goals.detail.of', { target: money.amount(target) })}</Text>
            ) : null}
          </View>
          {target !== null ? <ProgressBar percent={percent} variant="thick" accessibilityLabel={`${percent}%`} /> : null}
          <View style={styles.badges}>
            {justReached ? <ReachedMoment /> : reached ? <StateBadge tone="accent" shape="sCheck" label={t('grow.goals.detail.reached')} /> : null}
            {locked ? <StateBadge tone="slate" shape="lock" label={t('grow.goals.detail.locked')} accessibilityLabel={t('grow.goals.detail.lockedA11y')} /> : null}
          </View>
          {locked ? (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.detail.lockedLine', { amount: money.amount(saved) })}</Text>
          ) : null}
        </View>

        <View style={card} testID="goal-plan">
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
            {t('grow.goals.detail.planGroup')}
          </Text>
          <Row
            label={t('grow.goals.detail.eachMonth')}
            value={eachMonth > 0 ? calc.money(eachMonth) : '—'}
            dense
            chevron
            onPress={() => setPlanMode('monthly')}
          />
          {target !== null ? (
            <Row
              label={t('grow.goals.detail.reaches', { target: money.amount(target) })}
              value={reachesOn === null ? '—' : calc.monthYear(reachesOn)}
              dense
              chevron
              onPress={() => setPlanMode('by')}
            />
          ) : null}
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.detail.planNote')}</Text>
          {target !== null && !isNet && row.currency === calc.currency ? (
            <Pressable
              testID="goal-try-other"
              accessibilityRole="button"
              accessibilityLabel={t('grow.goals.detail.tryOther')}
              onPress={() => pushOnce(`/grow/calculators/goal/${id}` as Href)}
              style={[styles.editButton, { alignItems: 'flex-start' }]}
            >
              <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.goals.detail.tryOther')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={card} testID="goal-line-card">
          <Row label={t('grow.goals.detail.keptIn')} value={accountName} dense />
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {series === null
              ? t('grow.goals.detail.lineManual')
              : t('grow.goals.detail.lineAuto', { amount: money.amount(Math.abs(series.amount)), day: ordinal(Number(series.anchor_date.slice(8, 10))) })}
          </Text>
        </View>

        {row.check_id ? (
          <Pressable
            testID="goal-from-check"
            accessibilityRole="button"
            accessibilityLabel={t('grow.goals.detail.fromCheckTitle')}
            onPress={() => pushOnce(checkHref(row.check_id as string))}
            style={[...card, styles.checkCard]}
          >
            <GrowGlyph name="checkbuy" color={colors.accent} size={22} />
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1 }}>{t('grow.goals.detail.fromCheckTitle')}</Text>
            <GrowGlyph name="chev" color={colors.inkFaint} size={16} />
          </Pressable>
        ) : null}

        <View style={styles.buttons}>
          <View style={styles.buttonCell}>
            <Pill label={t('grow.goals.detail.addMoney')} variant="primary" onPress={() => setMove('add')} />
          </View>
          <View style={styles.buttonCell}>
            <Pill label={t('grow.goals.detail.takeOut')} variant="secondary" onPress={() => setMove('take')} />
          </View>
        </View>

        <View style={card} testID="goal-history">
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
            {t('grow.goals.detail.history')}
          </Text>
          {history.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('grow.goals.detail.historyEmptyTitle')}</Text>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.detail.historyEmptyBody')}</Text>
            </View>
          ) : (
            history.map((h) => (
              <View key={h.key} style={styles.historyRow}>
                <Row
                  label={historyText(h)}
                  dense
                  chevron={h.kind === 'expected'}
                  onPress={h.kind === 'expected' ? () => setConfirming(h) : undefined}
                  accessibilityLabel={historyText(h)}
                />
                {h.kind === 'expected' ? <StateBadge tone="slate" shape="sClock" label={t('grow.goals.detail.expected')} /> : null}
              </View>
            ))
          )}
        </View>

        {!isNet && row.kind === 'pot' && (row.bucket ?? null) === null ? (
          <View style={card}>
            <ToggleRow label={t('grow.goals.create.lockSwitch')} value={row.locked === true} onChange={onLockChange} />
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {row.locked === true ? t('grow.goals.create.lockHelper') : t('grow.goals.detail.unlockedNote', { amount: money.amount(saved) })}
            </Text>
            <Row label={t('grow.goals.useAsSafetyNet.row')} dense chevron onPress={() => setNetAsk(true)} accessibilityLabel={t('grow.goals.useAsSafetyNet.row')} />
          </View>
        ) : null}

        {isNet ? null : (
          <Pressable testID="goal-remove" accessibilityRole="button" accessibilityLabel={t('grow.goals.detail.remove')} onPress={() => setRemoving(true)} style={styles.removeButton}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('grow.goals.detail.remove')}</Text>
          </Pressable>
        )}
      </View>

      <MoneyMoveSheet visible={move !== null} goal={row} kind={move ?? 'add'} onClose={() => setMove(null)} onMoved={onMoved} />
      <GoalPlanEditSheet
        mode={planMode}
        goal={row}
        saved={saved}
        today={today}
        series={series}
        ownerId={userId}
        onClose={() => setPlanMode(null)}
        onSaved={(stepId) => toast({ key: 'undo.label.goalPlanChanged', stepId, undoLabel: 'goalPlanChanged', name: row.name, userId, householdId })}
      />
      <NewGoalSheet visible={editing} goal={row} saved={saved} onClose={() => setEditing(false)} />
      <UseAsSafetyNetSheet
        visible={netAsk}
        goal={row}
        currentNet={net}
        ownerId={userId}
        savedText={money.amount(saved)}
        netSavedText={money.amount(read.model.safetyNet?.saved ?? 0)}
        onClose={() => setNetAsk(false)}
        onSet={(stepId) =>
          toast({ key: 'grow.goals.useAsSafetyNet.toast', stepId, undoLabel: 'safetyNetChanged', name: row.name, userId, householdId })
        }
      />
      <ConfirmSheet
        visible={removing}
        title={t('grow.goals.removeTitle', { name: row.name })}
        body={t('grow.goals.removeBody', { amount: money.amount(saved), account: accountName })}
        cancelLabel={t('grow.goals.removeKeep')}
        confirmLabel={t('grow.goals.removeConfirm')}
        destructive
        onCancel={() => setRemoving(false)}
        onConfirm={onRemove}
      />
      <ConfirmSheet
        visible={confirming !== null}
        title={confirming === null ? undefined : historyText(confirming)}
        cancelLabel={t('grow.common.cancel')}
        confirmLabel={t('grow.goals.detail.confirm')}
        onCancel={() => setConfirming(null)}
        onConfirm={onConfirmLine}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap, paddingTop: space.groupGap },
  block: { borderRadius: radii.card },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  figureCard: { gap: space.gapMd },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.gapSm },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, flexWrap: 'wrap' },
  center: { alignItems: 'center', gap: space.gapSm },
  buttons: { flexDirection: 'row', gap: space.gapMd },
  buttonCell: { flex: 1 },
  historyRow: { gap: 2 },
  checkCard: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin },
  editButton: { minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center', alignItems: 'center' },
  removeButton: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
