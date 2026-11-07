// 06-16 (G04, GRW-02, GRW-03, criterion 7): the safety net. It is the one flagged, always-locked goal: size, saved, the monthly
// amount and where it is kept, what it covers, Add money / Take some out (06-22's MoneyMoveSheet, with the Decide-effect confirm),
// History. No Remove action: the net is never removed here. With no flagged goal (or one with no size yet) the screen invites the
// user to set a size; that is the only way this screen makes a net. Every figure comes from useGoalsRead, the same connection
// point Decide reads, so Grow and Decide show one number.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useConfirmGoalContribution } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useGoalLines, useSavingsGoalRows } from '@/data/queries/growGoals';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { TransactionRow } from '@/db/rows';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { goalSeriesOf } from '@/features/grow/goals/GoalPlanEditSheet';
import { MoneyMoveSheet, type MoneyMovedEvent, type MoveKind } from '@/features/grow/goals/MoneyMoveSheet';
import { planFromMonthly } from '@/features/grow/goals/goalPlanModel';
import { useGoalToast } from '@/features/grow/goals/useGoalToast';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { goalPercent } from '@/features/grow/home/GoalRow';
import { useGoalMoney } from '@/features/grow/home/GoalsSegment';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { categorySwatch, shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { NetMonthSheet } from './NetMonthSheet';
import { NetSizeSheet } from './NetSizeSheet';
import { coverWeeks, essentialMonthOf } from './netPreview';

interface HistoryItem {
  key: string;
  date: string;
  amount: number;
  kind: 'paid' | 'expected' | 'start';
  line: TransactionRow | null;
}

/** The net's lines newest first, then the starting amount. Pure. */
function historyOf(lines: readonly TransactionRow[] | undefined, netId: string | null, openingSaved: number, createdOn: string): HistoryItem[] {
  if (netId === null) return [];
  const items: HistoryItem[] = [];
  for (const l of lines ?? []) {
    if (l.goal_id !== netId || l.status === 'skipped' || l.deleted_at !== null) continue;
    items.push({
      key: l.id,
      date: l.local_date,
      amount: l.transfer_id === null ? Math.abs(l.original_amount) : l.original_amount,
      kind: l.status === 'pending' ? 'expected' : 'paid',
      line: l,
    });
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (openingSaved > 0) items.push({ key: 'start', date: createdOn, amount: openingSaved, kind: 'start', line: null });
  return items;
}

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
  const history = historyOf(lineRows, netId, openingSaved, createdOn);

  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];
  const eyebrow = { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted };
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

  const onConfirmLine = () => {
    const item = confirming;
    setConfirming(null);
    if (item === null || item.line === null || userId === null || row === null) return;
    const stepId = confirm({ ownerId: userId, line: item.line, goal: { id: row.id, name: row.name, currency: row.currency, account_id: row.account_id ?? null } });
    toast({ key: 'undo.label.goalContributionConfirmed', stepId, undoLabel: 'goalContributionConfirmed', name: row.name, userId, householdId });
  };

  const historyText = (h: HistoryItem): string => {
    const params = { date: formatDate(h.date), amount: money.amount(h.amount) };
    return t(h.kind === 'expected' ? 'grow.goals.detail.historyExpected' : h.kind === 'start' ? 'grow.goals.detail.historyStart' : 'grow.goals.detail.historyRow', params);
  };

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
              <Row label={t('grow.safetyNet.keptIn')} value={account === null ? '—' : account.name} dense />
            </View>
            {savedWeeks !== null && targetWeeks !== null && monthlyGoingOut !== null ? (
              <View style={card} testID="net-covers">
                <Text accessibilityRole="header" style={eyebrow}>
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
              <Pill label={t('grow.safetyNet.addMoney')} variant="primary" onPress={() => setMove('add')} />
            </View>
            <View style={styles.buttonCell}>
              <Pill label={t('grow.safetyNet.takeOut')} variant="secondary" onPress={() => setMove('take')} />
            </View>
          </View>
        ) : null}

        {row !== null ? (
          <View style={card} testID="net-history">
            <Text accessibilityRole="header" style={eyebrow}>
              {t('grow.safetyNet.history')}
            </Text>
            {history.length === 0 ? (
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.detail.historyEmptyTitle')}</Text>
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
      <MoneyMoveSheet visible={move !== null} goal={row} kind={move ?? 'add'} onClose={() => setMove(null)} onMoved={onMoved} />
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
  center: { alignItems: 'center' },
  buttons: { flexDirection: 'row', gap: space.gapMd },
  buttonCell: { flex: 1 },
  historyRow: { gap: 2 },
});
