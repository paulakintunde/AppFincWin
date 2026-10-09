// The Activity month screen (ACT-01, ACT-02, REC-03, REC-06): a month's transactions grouped
// as Still to come / Paid / Skipped, a month switcher, a totals line, overdue flags, one-tap
// Mark paid and the entry points into the transaction sheet. The list is the visual anchor;
// Shell's FAB replaces the Add button in Phase 3. Search (this month or every month),
// filters and bulk select layer on top (ACT-03, ACT-04, ACT-05); the list keeps visual priority.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useBulkDelete, useBulkMarkPaid, useBulkMarkUnpaid } from '@/data/mutations/patches';
import { EditScopePrompt } from '@/features/record/entry/EditScopePrompt';
import { PasteSheet } from '@/features/record/import/PasteSheet';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import type { Direction } from '@/features/record/entry/transactionForm';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { ActivityRow, ProjectionRow, type CardPosition } from './ActivityRow';
import { ActivityHeader } from './ActivityHeader';
import { getActivityItemType, type ActivityItem } from './activitySections';
import { BulkBar } from './BulkBar';
import { CloneMonthSheet } from './CloneMonthSheet';
import { FilterSheet } from './FilterSheet';
import { GroupHeader } from './GroupHeader';
import { formatMonthLabel } from './MonthSwitcher';
import { RecurringReviewSheet } from './RecurringReviewSheet';
import { SeriesOfferCard } from './SeriesOfferCard';
import { TransactionDetailSheet } from './TransactionDetailSheet';
import { CalendarView } from './views/CalendarView';
import { SearchBar } from './SearchBar';
import { useActivityViewModel, useRowFlow, type ActivityView } from './useActivityViewModel';
import { useRowActions } from './useRowActions';

const SUPPORTED_VIEWS: readonly ActivityView[] = ['list', 'week', 'split', 'balance', 'calendar'];

export interface ActivityScreenProps {
  onOpenAccounts: () => void;
  onOpenHistory: () => void;
  onOpenYou: () => void;
  initialMonth?: string;
}

type BulkHint = 'selectFirst' | 'nothingToMarkPaid' | 'nothingToMarkUnpaid' | 'tooMany';

const BULK_HINT_KEYS = {
  selectFirst: 'activity.selectFirst',
  nothingToMarkPaid: 'activity.bulkNothingToMarkPaid',
  nothingToMarkUnpaid: 'activity.bulkNothingToMarkUnpaid',
  tooMany: 'activity.bulkTooMany',
} as const satisfies Record<BulkHint, string>;

export function ActivityScreen({ onOpenAccounts, onOpenHistory, onOpenYou, initialMonth }: ActivityScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const vm = useActivityViewModel({ initialMonth, supportedViews: SUPPORTED_VIEWS });
  const { rc, formatter, month, items, positions, itemRows, selection, filter, filtering, searching, flat, search } = vm;
  const accountsData = vm.accounts;
  const accountName = useCallback(
    (id: string): string => (accountsData ?? []).find((a) => a.id === id)?.name ?? '',
    [accountsData]
  );
  const rowActions = useRowActions({
    householdId: rc.householdId,
    ownerId: rc.userId,
    today: rc.today,
    selectionActive: selection.active,
    rows: itemRows,
    accountName,
  });
  const flow = useRowFlow(rowActions, month);
  const [addOpen, setAddOpen] = useState(false);

  const categories = useCategoryLookup(rc.userId ?? undefined);
  const { remove: bulkRemove } = useBulkDelete();
  const { markPaid: bulkMarkPaid } = useBulkMarkPaid();
  const { markUnpaid: bulkMarkUnpaid } = useBulkMarkUnpaid();

  const [filterOpen, setFilterOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // S-WR-02: why the last bulk action did nothing, shown whatever the selected count.
  const [hint, setHint] = useState<BulkHint | null>(null);

  const selectedRows = itemRows.filter((r) => selection.isSelected(r.id));
  const bulkCtx = rc.householdId !== null && rc.userId !== null ? { householdId: rc.householdId, ownerId: rc.userId } : null;

  const onToggleSelect = useCallback(
    (row: ActivityRowView) => {
      setHint(null);
      selection.toggle(row.id);
    },
    [selection]
  );

  const onBulkDelete = () => {
    if (selectedRows.length === 0) return setHint('selectFirst');
    setConfirmOpen(true);
  };

  const confirmBulkDelete = () => {
    setConfirmOpen(false);
    if (bulkCtx === null || selectedRows.length === 0) return;
    const n = selectedRows.length;
    try {
      // Selected legs carry transfer_id, so the hook adds each transfer's partner leg (D-51).
      const stepId: string | null = bulkRemove(selectedRows, bulkCtx);
      // Review item 7: a null step id means there is no honest before-state, so no Undo.
      setHint(null);
      showToast({ kind: 'destructive', text: undoLabelText('deletedMany', { n }), stepId });
      selection.exit();
    } catch (error) {
      // A selection beyond the bulk limit is refused (RangeError) before anything is sent.
      if (!(error instanceof RangeError)) throw error;
      setHint('tooMany');
    }
  };

  const onBulkMarkPaid = () => {
    if (selectedRows.length === 0) return setHint('selectFirst');
    const targets = selectedRows.filter((r) => r.status === 'pending' && r.transfer_id === null);
    if (bulkCtx === null) return undefined;
    if (targets.length === 0) return setHint('nothingToMarkPaid');
    setHint(null);
    const stepId: string | null = bulkMarkPaid(targets, bulkCtx, rc.today);
    showToast({ kind: 'ordinary', text: undoLabelText('markedPaidMany', { n: targets.length }), stepId });
    selection.clear();
  };

  const onBulkMarkUnpaid = () => {
    if (selectedRows.length === 0) return setHint('selectFirst');
    const targets = selectedRows.filter((r) => r.status === 'paid' && r.transfer_id === null);
    if (bulkCtx === null) return undefined;
    if (targets.length === 0) return setHint('nothingToMarkUnpaid');
    setHint(null);
    const stepId: string | null = bulkMarkUnpaid(targets, bulkCtx);
    showToast({ kind: 'ordinary', text: undoLabelText('markedUnpaidMany', { n: targets.length }), stepId });
    selection.clear();
  };


  const openNew = (direction: Direction) => {
    setAddOpen(false);
    flow.setEntryMode({ kind: 'new', direction });
  };

  const renderActivityRow = (row: ActivityRowView, cardPosition: CardPosition) => (
    <ActivityRow
      row={row}
      categories={categories}
      accountName={accountName}
      formatter={formatter}
      homeCurrency={rc.homeCurrency}
      today={rc.today}
      selectable={selection.active}
      selected={selection.isSelected(row.id)}
      onToggleSelect={onToggleSelect}
      onPress={flow.openDetail}
      onMarkPaid={rowActions.pay}
      onSwipePay={() => rowActions.pay(row)}
      onSwipeUnpay={() => rowActions.unpay(row)}
      onSwipeDelete={() => flow.requestDelete(row)}
      cardPosition={cardPosition}
      balanceNote={vm.balanceNotes.get(row.id)}
    />
  );

  const renderItem = ({ item, index }: { item: ActivityItem; index: number }) => {
    const cardPosition = positions[index] ?? 'only';
    if (item.type === 'header') {
      return (
        <Text
          style={[
            styles.sectionHeader,
            // 2026-10-07 colour amendment: Paid reads green; the header's words carry the meaning.
            { ...textRole(pairing, 'label'), color: item.section === 'paid' ? colors.accent : colors.inkMuted },
          ]}
        >
          {t(`activity.section.${item.section}`)}
        </Text>
      );
    }
    if (item.type === 'group') {
      return <GroupHeader item={item} month={month} homeCurrency={rc.homeCurrency} formatter={formatter} />;
    }
    if (item.type === 'projection') {
      return (
        <ProjectionRow
          projection={item.projection}
          categories={categories}
          accountName={accountName}
          formatter={formatter}
          homeCurrency={rc.homeCurrency}
          cardPosition={cardPosition}
        />
      );
    }
    return renderActivityRow(item.row, cardPosition);
  };

  const calendar = vm.view === 'calendar';

  const links: { label: string; onPress: () => void }[] = [
    { label: t('activity.accounts'), onPress: onOpenAccounts },
    { label: t('activity.history'), onPress: onOpenHistory },
    { label: t('activity.you'), onPress: onOpenYou },
  ];

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('activity.title')}
        </Text>
        <Pill label={t('activity.add')} variant="primary" onPress={() => setAddOpen(true)} />
      </View>
      <ActivityHeader
        month={month}
        months={vm.months}
        onMonthChange={vm.setMonth}
        totals={vm.totals}
        showTotals={!flat}
        homeCurrency={rc.homeCurrency}
        formatter={formatter}
        views={SUPPORTED_VIEWS}
        view={vm.view}
        onViewChange={vm.setView}
        sort={vm.sort}
        onSortChange={vm.setSort}
        counts={vm.monthTools.counts}
        addMonth={vm.monthTools.addMonth}
        onAddMonth={vm.monthTools.onAddMonth}
        prevMonthName={vm.monthTools.prevMonthName}
        onMore={(key) => (key === 'clone' ? vm.monthTools.openClone() : vm.monthTools.openPaste())}
      />
      {vm.balanceHeader === undefined ? null : (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {vm.balanceHeader.inexact
            ? t('activity.balance.waiting')
            : vm.balanceHeader.allAccounts
              ? t('activity.balance.allAccounts')
              : ''}
        </Text>
      )}
      {/* Equal-width links on their own row: they shrink and ellipsise rather than overflow at 320pt. */}
      <View testID="activity-nav-links" style={styles.links}>
        {links.map((l) => (
          <Pressable key={l.label} accessibilityRole="link" accessibilityLabel={l.label} onPress={l.onPress} style={styles.link}>
            <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {l.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <SearchBar
        term={vm.term}
        scope={vm.scope}
        monthLabel={formatMonthLabel(month, formatter.locale)}
        onTermChange={vm.setTerm}
        onScopeChange={vm.setScope}
      />
      <View testID="activity-tools-row" style={[styles.header, styles.wrapRow]}>
        <Chip label={t('activity.filter.title')} selected={filtering} onPress={() => setFilterOpen(true)} />
        {selection.active ? (
          <View style={styles.links}>
            <Pill label={t('activity.selectAll')} variant="secondary" onPress={() => { setHint(null); selection.selectAll(itemRows.map((r) => r.id)); }} />
            <Pill label={t('activity.selectNone')} variant="secondary" onPress={() => { setHint(null); selection.clear(); }} />
          </View>
        ) : null}
        {calendar ? null : (
          <Pill
            label={selection.active ? t('activity.done') : t('activity.select')}
            variant="secondary"
            onPress={() => {
              setHint(null);
              if (selection.active) selection.exit();
              else selection.enter();
            }}
          />
        )}
      </View>
      <View style={styles.list}>
        {calendar ? (
          <CalendarView
            month={month}
            weekStart={rc.weekStart ?? 1}
            rows={vm.itemRows}
            today={rc.today}
            onRowPress={flow.openDetail}
            renderRow={(row) => renderActivityRow(row, 'only')}
          />
        ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={getActivityItemType}
          renderItem={renderItem}
          ListHeaderComponent={
            vm.offers.length > 0 ? (
              <SeriesOfferCard offers={vm.offers} rowsById={vm.rowsById} onReview={() => vm.setReviewOpen(true)} />
            ) : null
          }
          ListEmptyComponent={
            flat && !search.isSuccess ? (
              // S-IN-04 / I-03: only a server search that succeeded can say "Nothing matches.";
              // one in flight, paused offline or failed says which.
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                {search.isPending && search.fetchStatus === 'paused'
                  ? t('activity.searchOffline')
                  : search.isError
                    ? t('activity.searchFailed')
                    : t('activity.searching')}
              </Text>
            ) : searching || filtering ? (
              <EmptyState heading={t('activity.noMatchHeading')} body={t('activity.noMatchBody')} />
            ) : (
              <View style={styles.emptyBlock}>
                <EmptyState
                  heading={t('activity.emptyHeading', { month: formatMonthLabel(month, formatter.locale) })}
                  body={
                    vm.monthTools.hasEarlier
                      ? t('activity.empty.withClone', { month: vm.monthTools.prevMonthName })
                      : t('activity.empty.noClone')
                  }
                />
                <View style={styles.links}>
                  {vm.monthTools.hasEarlier ? (
                    <Pill
                      label={t('activity.empty.cloneAction', { month: vm.monthTools.prevMonthName })}
                      variant="secondary"
                      onPress={vm.monthTools.openClone}
                    />
                  ) : null}
                  <Pill label={t('activity.empty.pasteAction')} variant="secondary" onPress={vm.monthTools.openPaste} />
                </View>
              </View>
            )
          }
        />
        )}
      </View>
      {selection.active ? (
        <BulkBar
          count={selection.count}
          hint={hint === null ? null : t(BULK_HINT_KEYS[hint])}
          onMarkPaid={onBulkMarkPaid}
          onMarkUnpaid={onBulkMarkUnpaid}
          onDelete={onBulkDelete}
        />
      ) : null}
      <ConfirmSheet
        visible={confirmOpen}
        body={
          // S-IN-05: a selected transfer leg takes its partner with it (expandTransferIds).
          selectedRows.some((r) => r.transfer_id !== null)
            ? `${t('activity.bulkDeleteConfirm', { count: selectedRows.length })} ${t('activity.bulkDeleteTransfers')}`
            : t('activity.bulkDeleteConfirm', { count: selectedRows.length })
        }
        cancelLabel={t('activity.bulkDeleteCancel')}
        confirmLabel={t('activity.bulkDeleteProceed')}
        destructive
        onConfirm={confirmBulkDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <FilterSheet
        visible={filterOpen}
        value={filter}
        homeCurrency={rc.homeCurrency}
        categories={categories.active}
        accounts={(accountsData ?? []).filter((a) => a.archived_at === null)}
        region={rc.region}
        onApply={(f) => {
          vm.setFilter(f);
          setFilterOpen(false);
        }}
        onClose={() => setFilterOpen(false)}
      />
      <Sheet visible={addOpen} onDismiss={() => setAddOpen(false)} accessibilityLabel={t('activity.add')}>
        <Row label={t('record.sheet.directionOut')} onPress={() => openNew('out')} />
        <Row label={t('record.sheet.directionIn')} onPress={() => openNew('in')} />
        <Row label={t('record.sheet.directionTransfer')} onPress={() => openNew('transfer')} />
      </Sheet>
      <TransactionDetailSheet {...flow.detail} today={rc.today} />
      <RecurringReviewSheet
        visible={vm.reviewOpen}
        offers={vm.offers}
        rowsById={vm.rowsById}
        onClose={() => vm.setReviewOpen(false)}
      />
      <EditScopePrompt
        visible={flow.pendingDelete?.prompt === 'scope'}
        onThisOne={() => flow.answerDelete('one')}
        onThisAndFuture={() => flow.answerDelete('future')}
        onCancel={() => flow.answerDelete('cancel')}
      />
      <ConfirmSheet
        visible={flow.pendingDelete?.prompt === 'transferDelete'}
        body={t('record.sheet.transferDeleteConfirm', {
          from: accountName(flow.pendingDelete?.row.account_id ?? ''),
          to: accountName(flow.pendingDelete?.row.counterpartAccountId ?? ''),
        })}
        cancelLabel={t('activity.bulkDeleteCancel')}
        confirmLabel={t('activity.bulkDeleteProceed')}
        destructive
        onConfirm={() => flow.answerDelete('transfer')}
        onCancel={() => flow.answerDelete('cancel')}
      />
      <CloneMonthSheet visible={vm.monthTools.cloneOpen} targetMonth={month} onClose={vm.monthTools.closeClone} />
      <PasteSheet visible={vm.monthTools.pasteOpen} month={month} onClose={vm.monthTools.closePaste} />
      <TransactionSheet
        visible={flow.entryMode !== null}
        mode={flow.entryMode ?? { kind: 'new', direction: 'out' }}
        onClose={() => flow.setEntryMode(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapMd,
  },
  wrapRow: {
    flexWrap: 'wrap',
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
  link: {
    flex: 1,
    minWidth: 0,
    minHeight: space.touchMin,
    paddingHorizontal: space.gapSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  emptyBlock: {
    alignItems: 'center',
    gap: space.groupGap,
  },
  sectionHeader: {
    paddingTop: space.groupGap,
    paddingBottom: space.gapSm,
  },
});
