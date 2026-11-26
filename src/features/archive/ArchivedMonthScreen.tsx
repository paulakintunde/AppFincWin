// 10-24 (UI-SPEC 4c, D-14, D-15): an archived month, read-only for the person who archived it. The write buttons stay in place
// with a lock glyph and open the restore sheet (ArchivedMonthGateProvider -> useWriteGate). A line shared with a partner stays
// editable and says so. Restore is instant: toast, then the normal Activity month. A client promise, not a database rule.
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { useAccounts } from '@/data/queries/accounts';
import { useMonthView, type ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { ActivityRow, type CardPosition } from '@/features/record/activity/ActivityRow';
import { TransactionDetailSheet } from '@/features/record/activity/TransactionDetailSheet';
import { useRowActions } from '@/features/record/activity/useRowActions';
import { useRowFlow } from '@/features/record/activity/useActivityViewModel';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import { useRecordContext } from '@/features/record/useRecordContext';
import { i18n, useT } from '@/i18n';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { setSelectedMonth } from '@/state/activityFocus';
import { showToast } from '@/state/undoToast';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { ArchivedMonthGateProvider, useArchivedMonthGate } from './archivedMonthGate';
import { monthLabel } from './monthLabel';
import { useArchiveState } from './useArchiveState';

type Translate = (key: string, params?: Record<string, string | number>) => string;

function positionOf(index: number, count: number): CardPosition {
  if (count === 1) return 'only';
  return index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';
}

export interface ArchivedMonthScreenProps {
  /** 'YYYY-MM', already validated by the route. */
  month: string;
}

/** The list inside the archive scope, so a quick Mark paid on a personal line explains the restore step like every other write. */
function ArchivedRows(props: {
  rows: readonly ActivityRowView[];
  onOpen: (row: ActivityRowView) => void;
  onSharedMarkPaid: (row: ActivityRowView) => void;
}): React.JSX.Element {
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const gate = useArchivedMonthGate();
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const accountName = useCallback((id: string): string => (accounts ?? []).find((a) => a.id === id)?.name ?? '', [accounts]);
  const { rows, onOpen, onSharedMarkPaid } = props;
  return (
    <View testID="archived-rows">
      {rows.map((row, i) => (
        <React.Fragment key={row.id}>
          <ActivityRow
            row={row}
            categories={categories}
            accountName={accountName}
            formatter={formatter}
            homeCurrency={rc.homeCurrency}
            today={rc.today}
            cardPosition={positionOf(i, rows.length)}
            onPress={onOpen}
            onMarkPaid={(r) => (r.is_shared === true ? onSharedMarkPaid(r) : gate?.openRestore())}
          />
          {row.is_shared === true ? (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }} testID={`archived-shared-${row.id}`}>
              {t('system.archive.sharedRow')}
            </Text>
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

export function ArchivedMonthScreen({ month }: ArchivedMonthScreenProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const rc = useRecordContext();
  const archive = useArchiveState();
  const view = useMonthView(rc, month);
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const accountName = useCallback((id: string): string => (accounts ?? []).find((a) => a.id === id)?.name ?? '', [accounts]);
  const rows = view.rows;
  const rowActions = useRowActions({
    householdId: rc.householdId,
    ownerId: rc.userId,
    today: rc.today,
    selectionActive: false,
    rows,
    accountName,
  });
  const flow = useRowFlow(rowActions, month);
  const label = monthLabel(month, i18n.language || 'en');
  const sharedDetail = flow.detail.row?.is_shared === true;

  const restore = useCallback((): void => {
    archive.restore(month);
    showToast({ kind: 'ordinary', text: { key: 'system.archive.restoredToast', params: { month: label } } });
    setSelectedMonth(month);
    router.replace('/activity' as Href);
  }, [archive, month, label]);

  // Below level 4 (or switched off) there is no archive; a month that is not archived is a normal month.
  if (!archive.enabled || !archive.archived.has(month)) {
    return <Redirect href={'/activity' as Href} />;
  }

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="archived-month-screen">
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
            {label}
          </Text>
          <StatusBadge status="archived" label={t('system.archive.badge')} />
        </View>
        <View style={[styles.notice, { backgroundColor: colors.fill1 }]} testID="archived-notice">
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('system.archive.viewNotice')}</Text>
          <Pill label={t('system.archive.restoreMonth')} variant="primary" onPress={restore} />
        </View>
        <ArchivedMonthGateProvider month={month} onRestore={restore}>
          <ArchivedRows rows={rows} onOpen={flow.openDetail} onSharedMarkPaid={(r) => rowActions.pay(r)} />
          <TransactionDetailSheet {...flow.detail} visible={flow.detail.visible && !sharedDetail} today={rc.today} />
        </ArchivedMonthGateProvider>
      </View>
      {/* A shared line stays editable (D-15): its detail sheet sits outside the archive scope. */}
      <TransactionDetailSheet {...flow.detail} visible={flow.detail.visible && sharedDetail} today={rc.today} />
      <TransactionSheet
        visible={flow.entryMode !== null}
        mode={flow.entryMode ?? { kind: 'new', direction: 'out' }}
        onClose={() => flow.setEntryMode(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  notice: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
