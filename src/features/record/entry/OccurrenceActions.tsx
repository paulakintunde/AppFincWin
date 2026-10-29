// REC-06, D-05..D-08: what can be done with a pending occurrence from its sheet -- mark it
// paid (planned values, or adjusted first), skip it, or end the series. Nothing here runs
// without an explicit tap (T-02-21-02); ending asks for a destructive confirmation first
// (T-02-21-03). Undo is offered only for a step the hook actually recorded.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { RecurringSeriesRow, TransactionRow } from '@/db/rows';
import { useEndSeries } from '@/data/mutations/recurringSeries';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
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

  if (row.status !== 'pending' || !rc.userId || !rc.householdId) return null;
  const ownerId = rc.userId;
  const overdue = row.local_date < rc.today;
  const name = row.name ?? undefined;
  const statusStyle = [textRole(pairing, 'label'), { color: overdue ? colors.danger : colors.inkMuted }];

  const doMarkPaid = () => {
    const stepId = markPaid(row, ownerId, rc.today);
    showToast({ kind: 'ordinary', text: undoLabelText('markedPaid', { name }), stepId });
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
      <Pill label={t('record.recurring.adjustThenMarkPaid')} variant="secondary" onPress={onAdjust} />
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
