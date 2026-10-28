// The Activity month screen (ACT-01, ACT-02, REC-03, REC-06): a month's transactions grouped
// as Still to come / Paid / Skipped, a month switcher, a totals line, overdue flags, one-tap
// Mark paid and the entry points into the transaction sheet. The list is the visual anchor;
// Shell (03-15): Activity is a tab root; the FAB and its quick menu replace the Add button and
// sheet (D-11); the header avatar replaces the You link (D-04). Search (this month or every month),
// filters and bulk select layer on top (ACT-03, ACT-04, ACT-05); the list keeps visual priority.
// 03.1 D-43: the header is four bands (title row, month row with Search/Filter/More, summary card,
// Display row) rendered by ActivityHeaderBands; Display and More live in their own sheets.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { FlashList } from '@shopify/flash-list';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useIncomePayerPrompts } from '@/data/queries/incomePayerPrompts';
import { refundTotals } from '@/data/mutations/refundLinkModel';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { useBulkDelete, useBulkMarkPaid, useBulkMarkUnpaid } from '@/data/mutations/patches';
import { EditScopePrompt } from '@/features/record/entry/EditScopePrompt';
import { PasteSheet } from '@/features/record/import/PasteSheet';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import { ProjectionDetailSheet } from '@/features/home/ProjectionDetailSheet';
import { FAB_CLEARANCE } from '@/shell/fab/useShellPositions';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useHideFab } from '@/shell/fab/FabProvider';
import { useTabRootChrome } from '@/shell/screen/useTabRootChrome';
import { useTheme } from '@/theme/ThemeProvider';
import { monthOf } from '@/engine/time';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { focusAccessibility } from '@/shell/a11yFocus';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { ActivityRow, ProjectionRow, type CardPosition } from './ActivityRow';
import { getActivityItemType, type ActivityItem } from './activitySections';
import { BulkBar } from './BulkBar';
import { CloneMonthSheet } from './CloneMonthSheet';
import { FilterSheet } from './FilterSheet';
import { GroupHeader } from './GroupHeader';
import { monthRefreshKeys } from './refreshKeys';
import { formatMonthLabel } from './MonthSwitcher';
import { RecurringReviewSheet } from './RecurringReviewSheet';
import { HowArePaidCard } from './HowArePaidCard';
import { incomeChipState, isIncomeRow, rulesByPayer } from './IncomeTagChip';
import { IncomeTagSheet } from './IncomeTagSheet';
import { refundTagFor } from './RefundTag';
import { SeriesOfferCard } from './SeriesOfferCard';
import { TransactionDetailSheet } from './TransactionDetailSheet';
import { CalendarView } from './views/CalendarView';
import { ActivityHeaderBands } from './header/ActivityHeaderBands';
import { ActivityMoreMenu, type MoreAction } from './header/ActivityMoreMenu';
import { DisplaySheet } from './header/DisplaySheet';
import { HeaderIconCluster } from './header/HeaderIconCluster';
import { clearAllExceptUnpaid, clearOne, countActiveFilters, filterChipModels } from './header/activeFilters';
import { compactMonthLabel } from './header/monthLayout';
import { useActivityViewModel, useRowFlow, type ActivityView } from './useActivityViewModel';
import { useRowActions } from './useRowActions';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as typeof FlashList<ActivityItem>;

const SUPPORTED_VIEWS: readonly ActivityView[] = ['list', 'week', 'split', 'balance', 'calendar'];

export interface ActivityScreenProps {
  onOpenAccounts: () => void;
  onOpenHistory: () => void;
  initialMonth?: string;
}

type BulkHint = 'selectFirst' | 'nothingToMarkPaid' | 'nothingToMarkUnpaid' | 'tooMany';

const BULK_HINT_KEYS = {
  selectFirst: 'activity.selectFirst',
  nothingToMarkPaid: 'activity.bulkNothingToMarkPaid',
  nothingToMarkUnpaid: 'activity.bulkNothingToMarkUnpaid',
  tooMany: 'activity.bulkTooMany',
} as const satisfies Record<BulkHint, string>;

export function ActivityScreen({ onOpenAccounts, onOpenHistory, initialMonth }: ActivityScreenProps) {
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
  // 05.2-30 (D-01): income chips, the income sheet and the refund tags exist only with the Decide switch on.
  const { v3 } = useDecideAccess();
  const payerRules = useIncomePayerPrompts(v3 ? (rc.householdId ?? undefined) : undefined);
  const rulesByKey = useMemo(() => rulesByPayer(payerRules.data ?? []), [payerRules.data]);
  const rowsByIdOnScreen = useMemo(() => new Map(itemRows.map((r) => [r.id, r] as const)), [itemRows]);
  const refundSums = useMemo(() => (v3 ? refundTotals(itemRows) : new Map<string, number>()), [v3, itemRows]);
  const [incomeSheet, setIncomeSheet] = useState<{ row: ActivityRowView; newPayer: boolean } | null>(null);
  // D-10: the FAB steps aside while rows are being selected.
  useHideFab('bulkSelect', selection.active);

  const categories = useCategoryLookup(rc.userId ?? undefined);
  const { remove: bulkRemove } = useBulkDelete();
  const { markPaid: bulkMarkPaid } = useBulkMarkPaid();
  const { markUnpaid: bulkMarkUnpaid } = useBulkMarkUnpaid();

  const [filterOpen, setFilterOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const searchIconRef = useRef<View>(null);
  const displayChipRef = useRef<View>(null);
  // D-42: the expected row whose read-only detail is open.
  const [projection, setProjection] = useState<ProjectionView | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // S-WR-02: why the last bulk action did nothing, shown whatever the selected count.
  const [hint, setHint] = useState<BulkHint | null>(null);

  const activeFilterCount = countActiveFilters(filter);
  const chips = filterChipModels(filter, {
    categoryName: (id) => {
      const c = categories.byId.get(id);
      return c === undefined ? '' : categoryName(c, t);
    },
    accountName,
    formatAmount: (minor) => formatter.formatMoney(money(minor, rc.homeCurrency)),
    t,
  });

  // D-59..D-61: Search opens on This month; Cancel clears the term and returns focus to the icon.
  // Review WR-08: only a user Cancel returns focus. The HOME-01 intent also closes search, and
  // there the tab change owns focus (Phase 3 D-20), so the close it causes must not move it.
  const focusIconOnClose = useRef(false);
  const openSearch = () => vm.setSearchOpen(true);
  const cancelSearch = () => {
    focusIconOnClose.current = true;
    vm.setTerm('');
    vm.setScope('month');
    vm.setSearchOpen(false);
  };
  const wasSearchOpen = useRef(vm.searchOpen);
  useEffect(() => {
    if (wasSearchOpen.current && !vm.searchOpen && focusIconOnClose.current) {
      focusAccessibility(searchIconRef.current);
    }
    if (!vm.searchOpen) focusIconOnClose.current = false;
    wasSearchOpen.current = vm.searchOpen;
  }, [vm.searchOpen]);

  // D-58, D-44: compact header 'Activity · {short month}' with the three icons and no avatar.
  const chrome = useTabRootChrome({
    title: t('shell.title.activity'),
    refreshKeys: monthRefreshKeys(rc.householdId, month),
    compactTitle: t('activity.compactTitle', { month: compactMonthLabel(month, monthOf(rc.today), formatter.locale) }),
    compactTitleRole: 'sheetTitle',
    compactTrailing: ({ scrollToTop }) => (
      <HeaderIconCluster
        testIDPrefix="compact"
        activeFilterCount={activeFilterCount}
        onSearch={() => {
          scrollToTop();
          openSearch();
        }}
        onFilter={() => setFilterOpen(true)}
        onMore={() => setMoreOpen(true)}
      />
    ),
  });

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

  const renderActivityRow = (row: ActivityRowView, cardPosition: CardPosition, allowLongPress = true) => (
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
      onLongPress={
        allowLongPress
          ? (r) => {
              setHint(null);
              selection.enter();
              selection.toggle(r.id);
            }
          : undefined
      }
      onPress={flow.openDetail}
      onMarkPaid={rowActions.pay}
      onSwipePay={() => rowActions.pay(row)}
      onSwipeUnpay={() => rowActions.unpay(row)}
      onSwipeDelete={() => flow.requestDelete(row)}
      cardPosition={cardPosition}
      balanceNote={vm.balanceNotes.get(row.id)}
      incomeChip={v3 && isIncomeRow(row) ? incomeChipState(row, rulesByKey) : null}
      onIncomeChipPress={(r) => setIncomeSheet({ row: r, newPayer: incomeChipState(r, rulesByKey).state === 'new' })}
      refundTag={v3 ? refundTagFor(row, rowsByIdOnScreen, refundSums) : null}
      onRefundTagPress={(purchaseId) => {
        const purchase = rowsByIdOnScreen.get(purchaseId);
        if (purchase !== undefined) flow.openDetail(purchase);
      }}
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
          onPress={setProjection}
        />
      );
    }
    return renderActivityRow(item.row, cardPosition);
  };

  const calendar = vm.view === 'calendar';

  const onMoreSelect = (a: MoreAction) => {
    if (a === 'select') {
      setHint(null);
      selection.enter();
    } else if (a === 'clone') vm.monthTools.openClone();
    else if (a === 'paste') vm.monthTools.openPaste();
    else if (a === 'accounts') onOpenAccounts();
    else onOpenHistory();
  };

  // D-68: Calendar has no select mode, so choosing it leaves any active selection.
  const onViewChange = (v: ActivityView) => {
    if (v === 'calendar' && selection.active) selection.exit();
    vm.setView(v);
  };

  const listHeader = (
    <>
      {chrome.largeHeader}
      <View style={styles.pad}>
        <ActivityHeaderBands
          month={month}
          months={vm.months}
          locale={formatter.locale}
          onMonthChange={vm.setMonth}
          counts={vm.monthTools.counts}
          addMonth={vm.monthTools.addMonth}
          onAddMonth={vm.monthTools.onAddMonth}
          activeFilterCount={activeFilterCount}
          onOpenFilters={() => setFilterOpen(true)}
          onOpenMore={() => setMoreOpen(true)}
          searchIconRef={searchIconRef}
          searchOpen={vm.searchOpen}
          onOpenSearch={openSearch}
          onCancelSearch={cancelSearch}
          term={vm.term}
          scope={vm.scope}
          onTermChange={vm.setTerm}
          onScopeChange={vm.setScope}
          // Review WR-03: count the rows the results list shows (transfers and skipped included).
          resultsCount={searching ? itemRows.length : null}
          monthEmpty={vm.monthEmpty}
          loading={vm.monthLoading}
          card={{
            position: vm.position,
            unconvertedCount: vm.monthView.totals.unconvertedCount,
            entryCount: vm.entryCount,
            balanceNote: vm.balanceHeader,
            unavailable: vm.monthUnavailable,
            formatter,
            homeCurrency: rc.homeCurrency,
          }}
          view={vm.view}
          sort={vm.sort}
          onOpenDisplay={() => setDisplayOpen(true)}
          displayChipRef={displayChipRef}
          filterChips={chips}
          onRemoveFilter={(k) => vm.setFilter(clearOne(filter, k))}
          onClearAllFilters={() => vm.setFilter(clearAllExceptUnpaid(filter))}
          selectionActive={selection.active}
          selectionCount={selection.count}
          onSelectAll={() => {
            setHint(null);
            selection.selectAll(itemRows.map((r) => r.id));
          }}
          onSelectNone={() => {
            setHint(null);
            selection.clear();
          }}
          onSelectDone={() => {
            setHint(null);
            selection.exit();
          }}
          unpaidOnly={filter.unpaidOnly}
          onClearUnpaid={() => vm.setFilter({ ...filter, unpaidOnly: false })}
          offerCard={
            <>
              <HowArePaidCard />
              {vm.offers.length > 0 ? (
                <SeriesOfferCard offers={vm.offers} rowsById={vm.rowsById} onReview={() => vm.setReviewOpen(true)} />
              ) : null}
            </>
          }
        />
      </View>
    </>
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.canvas }]}>
      <View style={styles.list}>
        {calendar ? (
          <Animated.ScrollView
            // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
            ref={chrome.scrollRef}
            testID="calendar-scroll"
            keyboardShouldPersistTaps="handled"
            // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
            onScroll={chrome.onScroll}
            // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
            scrollEventThrottle={chrome.scrollEventThrottle}
            // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
            refreshControl={chrome.refreshControl}
            contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
          >
          {listHeader}
          <View style={styles.pad}>
          <CalendarView
            onDetailLayout={(y) =>
              (chrome.scrollRef.current as unknown as ScrollView | null)?.scrollTo({ y, animated: true })
            }
            month={month}
            weekStart={rc.weekStart ?? 1}
            rows={vm.itemRows}
            today={rc.today}
            onRowPress={flow.openDetail}
            renderRow={(row) => renderActivityRow(row, 'only', false)}
          />
          </View>
          </Animated.ScrollView>
        ) : (
        <AnimatedFlashList
          // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
          ref={chrome.scrollRef as never}
          data={items}
          keyExtractor={(item: ActivityItem) => item.key}
          getItemType={getActivityItemType}
          renderItem={(info: { item: ActivityItem; index: number }) => (
            <View style={styles.pad}>{renderItem(info)}</View>
          )}
          // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
          onScroll={chrome.onScroll}
          // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
          scrollEventThrottle={chrome.scrollEventThrottle}
          // eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render
          refreshControl={chrome.refreshControl}
          contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.pad}>{flat && !search.isSuccess ? (
              // S-IN-04 / I-03: only a server search that succeeded can say "Nothing matches.";
              // one in flight, paused offline or failed says which.
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                {search.isPending && search.fetchStatus === 'paused'
                  ? t('activity.searchOffline')
                  : search.isError
                    ? t('activity.searchFailed')
                    : t('activity.searching')}
              </Text>
            ) : vm.monthUnavailable !== null ? (
              // CR-01 / T-03-22-01: a failed or offline-uncached read is never an empty month. The
              // card carries Home's copy; while search hides the card, the list says it instead.
              vm.searchOpen ? (
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                  {t(vm.monthUnavailable === 'error' ? 'home.state.monthError' : 'home.state.monthOffline')}
                </Text>
              ) : null
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
            )}</View>
          }
        />
        )}
      </View>
      {/* eslint-disable-next-line react-hooks/refs -- the chrome object carries the animated scroll ref to the list; nothing reads .current during render */}
      {chrome.compactHeader}
      {selection.active ? (
        <View style={styles.pad}>
          <BulkBar
            hint={hint === null ? null : t(BULK_HINT_KEYS[hint])}
            onMarkPaid={onBulkMarkPaid}
            onMarkUnpaid={onBulkMarkUnpaid}
            onDelete={onBulkDelete}
          />
        </View>
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
      <DisplaySheet
        visible={displayOpen}
        onClose={() => setDisplayOpen(false)}
        views={SUPPORTED_VIEWS}
        view={vm.view}
        onViewChange={onViewChange}
        sort={vm.sort}
        onSortChange={vm.setSort}
      />
      <ActivityMoreMenu
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        calendar={calendar}
        prevMonthName={vm.monthTools.prevMonthName}
        onSelect={onMoreSelect}
      />
      <TransactionDetailSheet {...flow.detail} today={rc.today} />
      <IncomeTagSheet
        visible={v3 && incomeSheet !== null}
        tx={incomeSheet?.row ?? null}
        newPayer={incomeSheet?.newPayer ?? false}
        formatter={formatter}
        onClose={() => setIncomeSheet(null)}
      />
      <ProjectionDetailSheet
        projection={projection}
        visible={projection !== null}
        onDismiss={() => setProjection(null)}
        formatter={formatter}
        homeCurrency={rc.homeCurrency}
        categories={categories}
        accountName={accountName}
      />
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: space.screenH },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
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
