// 06-16 (G04, GRW-02, GRW-03, criterion 7): the safety net. It is the one flagged, always-locked goal: size, saved, the monthly
// amount and where it is kept, what it covers, Add money / Take some out (06-22's MoneyMoveSheet, with the Decide-effect confirm),
// History. No Remove action: the net is never removed here. With no flagged goal (or one with no size yet) the screen invites the
// user to set a size; that is the only way this screen makes a net. Every figure comes from useGoalsRead, the same connection
// point Decide reads, so Grow and Decide show one number.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useConfirmGoalContribution } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useGoalLines, useSavingsGoalRows } from '@/data/queries/growGoals';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/screens/past/data/usePastDecisions';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { GoalHistoryCard, goalHistoryOf, type HistoryItem } from '@/features/grow/goals/GoalHistory';
import { goalSeriesOf } from '@/features/grow/goals/GoalPlanEditSheet';
import { MoneyMoveSheet, type MoneyMovedEvent, type MoveKind } from '@/features/grow/goals/MoneyMoveSheet';
import { planFromMonthly } from '@/features/grow/goals/goalPlanModel';
import { useGoalRecordDetail } from '@/features/grow/goals/useGoalRecordDetail';
import { useGoalToast } from '@/features/grow/goals/useGoalToast';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { useSentConfirms } from '@/features/grow/goals/useSentConfirms';
import { goalPercent } from '@/features/grow/home/GoalRow';
import { useGoalMoney } from '@/features/grow/home/useGoalMoney';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { categorySwatch, shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { NetAccountSheet } from './NetAccountSheet';
import { NetMonthSheet } from './NetMonthSheet';
import { NetSizeSheet } from './NetSizeSheet';
import { coverWeeks, essentialMonthOf } from './netPreview';

export function SafetyNetScreen() {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { userId, householdId, today, formatDate } = usePastContext();
  const money = useGoalMoney();
  const calc = useCalcFormat();
  const read = useGoalsRead();
  const rowsQ = useSavingsGoalRows(userId ?? undefined, householdId ?? undefined);
  const v3 = useDecideV3();
  const seriesQ = useRecurringSeries(householdId ?? undefined);
  const accountsQ = useAccounts(householdId ?? undefined);
  const row = rowsQ.data?.find((r) => r.is_safety_net === true && r.deleted_at === null) ?? null;
  const linesQ = useGoalLines(householdId, row === null ? [] : [row.id]);
  const { confirm } = useConfirmGoalContribution();
  const toast = useGoalToast();

  const [sizeOpen, setSizeOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [move, setMove] = useState<MoveKind | null>(null);
  const [confirming, setConfirming] = useState<HistoryItem | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const point = read.model.safetyNet;
  const hasSize = point !== null && point.size !== null && point.size > 0;
  const saved = point === null ? 0 : point.saved;
  const size = hasSize ? (point.size as number) : null;
  const series = row === null ? null : goalSeriesOf(seriesQ.data, row.id);
  const account = row === null ? null : ((accountsQ.data ?? []).find((a) => a.id === row.account_id) ?? null);
  const eachMonth = row?.monthly_amount ?? 0;
  const reachesOn = size === null || eachMonth <= 0 ? null : planFromMonthly({ saved, target: size, monthly: eachMonth, today }).reachesOn;

  const monthlyGoingOut = useMemo(() => {
    if (v3.source == null) return null;
    try {
      return essentialMonthOf(v3.source, v3.v3 ?? null);
    } catch {
      return null;
    }
  }, [v3.source, v3.v3]);

  const netId = row === null ? null : row.id;
  const openingSaved = row === null ? 0 : row.opening_saved;
  const createdOn = row === null ? '' : row.created_at.slice(0, 10);
  const lineRows = linesQ.data;
  const history = goalHistoryOf(lineRows, netId, openingSaved, createdOn, today);
  const record = useGoalRecordDetail({ householdId, ownerId: userId, today, allLines: lineRows, goalId: netId });
  const { sent, markSent } = useSentConfirms(lineRows);
  // CRUD #8: the kept-in account's rate, edited on the account's own screen.
  const rate = account?.interest_rate ?? null;
  const hasRate = rate !== null && rate !== '';

  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];
  const title = t('grow.safetyNet.title');

  if (read.status === 'error' || rowsQ.isError) {
    return (
      <DetailScreen title={title}>
        <View testID="net-error" style={[...card, styles.center]}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.common.loadErrorTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.common.loadErrorBody')}</Text>
          <Pill label={t('grow.common.tryAgain')} variant="secondary" onPress={read.refetch} />
        </View>
      </DetailScreen>
    );
  }
  if (read.status === 'loading') {
    return (
      <DetailScreen title={title}>
        <View testID="net-loading" accessibilityLabel={t('grow.home.loading')} style={styles.stack}>
          <View style={[styles.block, { height: 96, backgroundColor: colors.fill1 }]} />
          <View style={[styles.block, { height: 128, backgroundColor: colors.fill1 }]} />
        </View>
      </DetailScreen>
    );
  }

  const weeks = (amount: number): string | null => {
    const w = coverWeeks(amount, monthlyGoingOut);
    if (w === null) return null;
    if (Number.isInteger(w)) return t('grow.safetyNet.coversWeeks', { count: w });
    const whole = Math.floor(w);
    return whole === 0 ? t('grow.safetyNet.coversHalfWeek') : t('grow.safetyNet.coversWeeksHalf', { whole });
  };
  const savedWeeks = weeks(saved);
  const targetWeeks = size === null ? null : weeks(size);

  const onMoved = (e: MoneyMovedEvent) => {
    if (row === null) return;
    toast({ key: 'undo.label.goalMoneyMoved', stepId: e.stepId, undoLabel: 'goalMoneyMoved', name: row.name, userId, householdId });
  };

  // One confirm path for the inline Confirm and the confirm sheet (D-25, T-06-32-01).
  const confirmLine = (item: HistoryItem | null) => {
    if (item === null || item.line === null || userId === null || row === null || sent.has(item.line.id)) return;
    markSent(item.line); // P4-WR-05: one Confirm per line until the lines catch up
    const stepId = confirm({ ownerId: userId, line: item.line, goal: { id: row.id, name: row.name, currency: row.currency, account_id: row.account_id ?? null } });
    toast({ key: 'undo.label.goalContributionConfirmed', stepId, undoLabel: 'goalContributionConfirmed', name: row.name, userId, householdId });
  };
  const onConfirmLine = () => {
    const item = confirming;
    setConfirming(null);
    confirmLine(item);
  };
  const confirmTitle = (h: HistoryItem): string => t('grow.goals.detail.confirmA11y', { amount: money.amount(h.amount), date: formatDate(h.date) });
  const keptInName = account === null ? t('grow.goals.move.pickAccount') : account.name;

  return (
    <DetailScreen title={title}>
      <View style={styles.stack}>
        <View style={[...card, styles.figureCard]}>
          <StateBadge tone="blue" shape="lock" label={t('grow.safetyNet.locked')} accessibilityLabel={t('grow.safetyNet.lockedA11y')} />
          <View style={styles.figureRow}>
            <Text testID="net-saved" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>
              {money.amount(saved)}
            </Text>
            {size !== null ? (
              <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('grow.safetyNet.figureOf', { target: money.amount(size) })}</Text>
            ) : null}
          </View>
          {size !== null ? <ProgressBar percent={goalPercent(saved, size)} variant="thick" tone="blue" accessibilityLabel={`${goalPercent(saved, size)}%`} /> : null}
        </View>

        {size === null ? (
          <View testID="net-empty" style={[...card, styles.center]}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.safetyNet.emptyBody')}</Text>
            <Pill label={t('grow.safetyNet.emptyAction')} variant="primary" onPress={() => setSizeOpen(true)} />
          </View>
        ) : (
          <>
            <View style={[styles.card, { borderWidth: 1, backgroundColor: categorySwatch.blue.tint, borderColor: categorySwatch.blue.color }]}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('grow.safetyNet.explainer')}</Text>
            </View>
            <View style={card} testID="net-rows">
              <Row label={t('grow.safetyNet.size')} value={money.amount(size)} dense chevron onPress={() => setSizeOpen(true)} accessibilityLabel={`${t('grow.safetyNet.size')}, ${money.amount(size)}`} />
              <Row
                label={t('grow.safetyNet.eachMonth')}
                value={
                  eachMonth > 0
                    ? reachesOn === null
                      ? money.amount(eachMonth)
                      : t('grow.safetyNet.eachMonthValue', { amount: money.amount(eachMonth), date: calc.monthYear(reachesOn) })
                    : t('grow.safetyNet.noEachMonth')
                }
                dense
                chevron
                onPress={() => setMonthOpen(true)}
              />
              <Row
                label={t('grow.safetyNet.keptIn')}
                value={account === null ? '—' : account.name}
                dense
                chevron
                onPress={() => setAccountOpen(true)}
                accessibilityLabel={t('grow.goals.detail.keptInA11y', { account: keptInName })}
              />
              {hasRate && account !== null ? (
                <Row
                  label={t('grow.goals.detail.interestRow')}
                  value={t('grow.goals.detail.interestValue', { rate: rate as string })}
                  dense
                  chevron
                  onPress={() => pushOnce(`/accounts/${account.id}` as Href)}
                />
              ) : null}
            </View>
            {savedWeeks !== null && targetWeeks !== null && monthlyGoingOut !== null ? (
              <View style={card} testID="net-covers">
                <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
                  {t('grow.safetyNet.coversTitle')}
                </Text>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
                  {t('grow.safetyNet.coversBody', {
                    saved: money.amount(saved),
                    savedWeeks,
                    monthly: money.amount(monthlyGoingOut),
                    target: money.amount(size),
                    targetWeeks,
                  })}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {row !== null ? (
          <View style={styles.buttons}>
            <View style={styles.buttonCell}>
              <Pill label={t('grow.safetyNet.addMoney')} variant="secondary" onPress={() => setMove('add')} />
            </View>
            <View style={styles.buttonCell}>
              <Pill label={t('grow.safetyNet.takeOut')} variant="secondary" onPress={() => setMove('take')} />
            </View>
          </View>
        ) : null}

        {row !== null ? (
          <GoalHistoryCard
            items={history}
            today={today}
            testID="net-history"
            formatDate={formatDate}
            amount={money.amount}
            partnerOf={record.partnerOf}
            accountName={record.accountName}
            onOpenPaid={record.open}
            onConfirm={confirmLine}
            onOpenExpected={setConfirming}
            onAddMoney={() => setMove('add')}
            sentIds={sent}
          />
        ) : null}

        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.safetyNet.footer')}</Text>
      </View>

      <NetSizeSheet visible={sizeOpen} net={row} saved={saved} onClose={() => setSizeOpen(false)} />
      {row !== null ? (
        <NetMonthSheet
          visible={monthOpen}
          net={row}
          series={series}
          saved={saved}
          onClose={() => setMonthOpen(false)}
          onSaved={(stepId) => toast({ key: 'undo.label.goalPlanChanged', stepId, undoLabel: 'goalPlanChanged', name: row.name, userId, householdId })}
        />
      ) : null}
      <MoneyMoveSheet
        visible={move !== null}
        goal={row}
        kind={move ?? 'add'}
        onClose={() => setMove(null)}
        onMoved={onMoved}
        onChooseAccount={() => setAccountOpen(true)}
      />
      <ConfirmSheet
        visible={confirming !== null}
        title={confirming === null ? undefined : confirmTitle(confirming)}
        cancelLabel={t('grow.common.cancel')}
        confirmLabel={t('grow.goals.detail.confirm')}
        onCancel={() => setConfirming(null)}
        onConfirm={onConfirmLine}
      />
      {row !== null ? (
        <NetAccountSheet
          visible={accountOpen}
          net={row}
          saved={saved}
          ownerId={userId}
          householdId={householdId}
          onClose={() => setAccountOpen(false)}
          onSaved={(stepId, name) =>
            toast({ key: 'grow.goals.detail.accountSavedToast', params: { account: name }, stepId, undoLabel: 'goalEdited', name: row.name, userId, householdId })
          }
        />
      ) : null}
      {record.element}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap, paddingTop: space.groupGap },
  block: { borderRadius: radii.card },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  figureCard: { gap: space.gapMd },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.gapSm },
  center: { alignItems: 'center' },
  buttons: { flexDirection: 'row', gap: space.gapMd },
  buttonCell: { flex: 1 },
});
