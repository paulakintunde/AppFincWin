// REC-06, D-05..D-08: what can be done with a pending occurrence from its sheet -- mark it
// paid (planned values, or adjusted first), skip it, or end the series. Nothing here runs
// without an explicit tap (T-02-21-02); ending asks for a destructive confirmation first
// (T-02-21-03). Undo is offered only for a step the hook actually recorded.
// 06-37 (06-34 follow-up): a goal's Expected line is marked paid only through confirm_goal_contribution, the same
// confirm Grow and Activity use, never by a plain status patch; "Adjust, then mark paid" is not offered for it.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { RecurringSeriesRow, TransactionRow } from '@/db/rows';
import { useEndSeries } from '@/data/mutations/recurringSeries';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { useGoalLineRoute } from '@/features/record/activity/goalLineRoute';
import { useGoalLinePay } from '@/features/grow/goals/useGoalLinePay';
import { openSeriesStatus } from './seriesStatusHost';
import { useMarkPaid, useSkipOccurrence } from '@/data/mutations/transactions';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface OccurrenceActionsProps {
  row: TransactionRow;
  /** The row's series, when loaded (needed to end it, stop it or pause it). */
  series: RecurringSeriesRow | undefined;
  /** "Adjust, then mark paid": the sheet sets the form to Paid and stays open. */
  onAdjust: () => void;
  /** An action finished its write; the sheet closes. */
  onDone: () => void;
}

export function OccurrenceActions({ row, series, onAdjust, onDone }: OccurrenceActionsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const { markPaid } = useMarkPaid();
  const { skip } = useSkipOccurrence();
  const { end } = useEndSeries();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { v3 } = useDecideAccess();
  const { pay: payGoalLine } = useGoalLinePay(rc.userId, rc.householdId);
  const routeOf = useGoalLineRoute(rc.userId, rc.householdId);

  if (row.status !== 'pending' || !rc.userId || !rc.householdId) return null;
  const ownerId = rc.userId;
  const overdue = row.local_date < rc.today;
  const name = row.name ?? undefined;
  const statusStyle = [textRole(pairing, 'label'), { color: overdue ? colors.danger : colors.inkMuted }];

  const route =
    row.transfer_id == null ? routeOf(row, series === undefined ? undefined : new Map([[series.id, series]])) : null;
  const goalId = route?.kind === 'goal' ? route.goalId : null;

  const doMarkPaid = () => {
    if (goalId !== null) {
      // Not loaded yet: nothing is written, the hint shows and the sheet stays open.
      if (payGoalLine(row, goalId)) onDone();
      return;
    }
    // P5-CR-01: a removed goal's line is marked paid as a plain line, and the toast says why.
    const stepId = markPaid(row, ownerId, rc.today);
    const text = route?.kind === 'goalGone' ? { key: 'record.sheet.goalGoneMarkedPaid' } : undoLabelText('markedPaid', { name });
    showToast({ kind: 'ordinary', text, stepId });
    onDone();
  };

  const doSkip = () => {
    const stepId = skip(row, ownerId);
    showToast({ kind: 'ordinary', text: undoLabelText('skipped', { name }), stepId });
    onDone();
  };

  const doEnd = () => {
    setConfirmEnd(false);
    if (!series) return;
    const stepId = end({
      id: series.id,
      householdId: row.household_id,
      expectedVersion: series.version,
      endDate: rc.today,
      ownerId,
      name: series.name,
    });
    showToast({ kind: 'destructive', text: undoLabelText('seriesEnded', { name: series.name }), stepId });
    onDone();
  };

  return (
    <View style={styles.column}>
      <Text style={statusStyle}>
        {overdue ? t('record.recurring.overdue') : t('record.recurring.dueOn', { date: formatter.formatDate(row.local_date) })}
      </Text>
      <Pill label={t('record.recurring.markPaid')} variant="primary" onPress={doMarkPaid} />
      {goalId === null ? <Pill label={t('record.recurring.adjustThenMarkPaid')} variant="secondary" onPress={onAdjust} /> : null}
      {row.recurring_series_id ? <Pill label={t('record.recurring.skip')} variant="secondary" onPress={doSkip} /> : null}
      {row.recurring_series_id && series && v3 ? (
        <Pill
          label={t('record.seriesStatus.action')}
          variant="secondary"
          onPress={() => {
            openSeriesStatus(series);
            onDone();
          }}
        />
      ) : null}
      {row.recurring_series_id && series && !v3 ? (
        <Pill label={t('record.recurring.end')} variant="danger" onPress={() => setConfirmEnd(true)} />
      ) : null}
      <ConfirmSheet
        visible={confirmEnd}
        body={t('record.recurring.endConfirm', { name: series?.name ?? '', date: formatter.formatDate(rc.today) })}
        cancelLabel={t('record.recurring.endCancel')}
        confirmLabel={t('record.recurring.endProceed')}
        destructive
        onConfirm={doEnd}
        onCancel={() => setConfirmEnd(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.gapSm,
  },
});
