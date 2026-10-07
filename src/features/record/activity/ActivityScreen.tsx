// The Activity month screen (ACT-01, ACT-02, REC-03, REC-06): a month's transactions grouped
// as Still to come / Paid / Skipped, a month switcher, a totals line, overdue flags, one-tap
// Mark paid and the entry points into the transaction sheet. The list is the visual anchor;
// Shell's FAB replaces the Add button in Phase 3. Search (this month or every month),
// filters and bulk select layer on top (ACT-03, ACT-04, ACT-05); the list keeps visual priority.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAccounts } from '@/data/queries/accounts';
import {
  useMonthView,
  useTransactionMonths,
  useTransactionsSearch,
  type ActivityRowView,
} from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useBulkDelete, useBulkMarkPaid, useBulkMarkUnpaid } from '@/data/mutations/patches';
import { useMarkPaid } from '@/data/mutations/transactions';
import { EMPTY_FILTER, filterRows, isFilterActive, matchesSearch, type ActivityFilter } from '@/engine/activity/filters';
import { monthOf } from '@/engine/time';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import type { Direction, EntryMode } from '@/features/record/entry/transactionForm';
import { useRecordContext } from '@/features/record/useRecordContext';
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
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow, ProjectionRow } from './ActivityRow';
import { buildActivityItems, buildFlatItems, getActivityItemType, type ActivityItem } from './activitySections';
import { BulkBar } from './BulkBar';
import { FilterSheet } from './FilterSheet';
import { formatMonthLabel, MonthSwitcher } from './MonthSwitcher';
import { MonthTotalsBar } from './MonthTotalsBar';
import { SearchBar, type SearchScope } from './SearchBar';
import { useActivitySelection } from './useActivitySelection';

export interface ActivityScreenProps {
  onOpenAccounts: () => void;
  onOpenHistory: () => void;
  onOpenYou: () => void;
  initialMonth?: string;
}

export function ActivityScreen({ onOpenAccounts, onOpenHistory, onOpenYou, initialMonth }: ActivityScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const [month, setMonth] = useState(() => initialMonth ?? monthOf(rc.today));
  const [sheetMode, setSheetMode] = useState<EntryMode | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const view = useMonthView({ householdId: rc.householdId, homeCurrency: rc.homeCurrency, today: rc.today }, month);
  const { months } = useTransactionMonths(rc.householdId, rc.today);
  const accountsData = useAccounts(rc.householdId ?? undefined).data;
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const { markPaid } = useMarkPaid();
  const { remove: bulkRemove } = useBulkDelete();
  const { markPaid: bulkMarkPaid } = useBulkMarkPaid();
  const { markUnpaid: bulkMarkUnpaid } = useBulkMarkUnpaid();

  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<SearchScope>('month');
  const [filter, setFilter] = useState<ActivityFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hint, setHint] = useState(false);

  const accountName = useCallback(
    (id: string): string => (accountsData ?? []).find((a) => a.id === id)?.name ?? '',
    [accountsData]
  );

  // ACT-03: a 2+ character term in Every month scope is a server search; shorter terms leave
  // the month list alone. Month scope narrows the loaded month instantly.
  const search = useTransactionsSearch(rc.householdId, scope === 'all' ? term : '', rc.homeCurrency, rc.today);
  const flat = scope === 'all' && search.enabled;
  const searching = scope === 'month' ? term.trim() !== '' : flat;
  const filtering = isFilterActive(filter);
  const narrowed = useMemo(() => {
    let base: ActivityRowView[] = flat ? search.rows : view.rows;
    if (scope === 'month' && term.trim() !== '') base = base.filter((r) => matchesSearch(r, term));
    return filterRows(base, filter);
  }, [flat, search.rows, view.rows, scope, term, filter]);

  const items = useMemo(
    () =>
      flat
        ? buildFlatItems(narrowed)
        : buildActivityItems(narrowed, searching || filtering ? [] : view.projections),
    [flat, narrowed, searching, filtering, view.projections]
  );
  const itemRows = useMemo(() => items.flatMap((i) => (i.type === 'row' ? [i.row] : [])), [items]);
  const selection = useActivitySelection(useMemo(() => itemRows.map((r) => r.id), [itemRows]));
  const selectedRows = useMemo(() => itemRows.filter((r) => selection.isSelected(r.id)), [itemRows, selection]);
  const bulkCtx = rc.householdId !== null && rc.userId !== null ? { householdId: rc.householdId, ownerId: rc.userId } : null;

  const onMarkPaid = useCallback(
    (row: ActivityRowView) => {
      if (rc.userId === null) return;
      const stepId = markPaid(row, rc.userId, rc.today);
      // Item 7: a null step means there was no honest before-state, so no Undo is offered.
      showToast({ kind: 'ordinary', text: undoLabelText('markedPaid', { name: row.name ?? undefined }), stepId });
    },
    [markPaid, rc.userId, rc.today]
  );

  const onToggleSelect = useCallback(
    (row: ActivityRowView) => {
      setHint(false);
      selection.toggle(row.id);
    },
    [selection]
  );

  const onBulkDelete = () => {
    if (selectedRows.length === 0) return setHint(true);
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
      showToast({ kind: 'destructive', text: undoLabelText('deletedMany', { n }), stepId });
      selection.exit();
    } catch {
      // A selection beyond the bulk limit is refused before anything is sent.
      setHint(true);
    }
  };

  const onBulkMarkPaid = () => {
    const targets = selectedRows.filter((r) => r.status === 'pending' && r.transfer_id === null);
    if (bulkCtx === null || targets.length === 0) return setHint(true);
    const stepId: string | null = bulkMarkPaid(targets, bulkCtx, rc.today);
    showToast({ kind: 'ordinary', text: undoLabelText('markedPaidMany', { n: targets.length }), stepId });
    selection.clear();
  };

  const onBulkMarkUnpaid = () => {
    const targets = selectedRows.filter((r) => r.status === 'paid' && r.transfer_id === null);
    if (bulkCtx === null || targets.length === 0) return setHint(true);
    const stepId: string | null = bulkMarkUnpaid(targets, bulkCtx);
    showToast({ kind: 'ordinary', text: undoLabelText('markedUnpaidMany', { n: targets.length }), stepId });
    selection.clear();
  };

  const onPressRow = useCallback((row: ActivityRowView) => setSheetMode({ kind: 'edit', row }), []);

  const openNew = (direction: Direction) => {
    setAddOpen(false);
    setSheetMode({ kind: 'new', direction });
  };

  const renderItem = ({ item }: { item: ActivityItem }) => {
    if (item.type === 'header') {
      return (
        <Text style={[styles.sectionHeader, { ...textRole(pairing, 'label'), color: colors.inkMuted }]}>
          {t(`activity.section.${item.section}`)}
        </Text>
      );
    }
    if (item.type === 'projection') {
      return (
        <ProjectionRow
          projection={item.projection}
          categories={categories}
          accountName={accountName}
          formatter={formatter}
          homeCurrency={rc.homeCurrency}
        />
      );
    }
    return (
      <ActivityRow
        row={item.row}
        categories={categories}
        accountName={accountName}
        formatter={formatter}
        homeCurrency={rc.homeCurrency}
        selectable={selection.active}
        selected={selection.isSelected(item.row.id)}
        onToggleSelect={onToggleSelect}
        onPress={onPressRow}
        onMarkPaid={onMarkPaid}
      />
    );
  };

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
      <View style={styles.header}>
        <MonthSwitcher month={month} months={months} locale={formatter.locale} onChange={setMonth} />
        <View style={styles.links}>
          {links.map((l) => (
            <Pressable key={l.label} accessibilityRole="link" accessibilityLabel={l.label} onPress={l.onPress} style={styles.link}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {flat ? null : <MonthTotalsBar totals={view.totals} homeCurrency={rc.homeCurrency} formatter={formatter} />}
      <SearchBar
        term={term}
        scope={scope}
        monthLabel={formatMonthLabel(month, formatter.locale)}
        onTermChange={setTerm}
        onScopeChange={setScope}
      />
      <View style={styles.header}>
        <Chip label={t('activity.filter.title')} selected={filtering} onPress={() => setFilterOpen(true)} />
        <Pill
          label={selection.active ? t('activity.done') : t('activity.select')}
          variant="secondary"
          onPress={() => {
            setHint(false);
            if (selection.active) selection.exit();
            else selection.enter();
          }}
        />
      </View>
      <View style={styles.list}>
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={getActivityItemType}
          renderItem={renderItem}
          ListEmptyComponent={
            searching || filtering ? (
              <EmptyState heading={t('activity.noMatchHeading')} body={t('activity.noMatchBody')} />
            ) : (
              <EmptyState
                heading={t('activity.emptyHeading', { month: formatMonthLabel(month, formatter.locale) })}
                body={t('activity.emptyBody')}
              />
            )
          }
        />
      </View>
      {selection.active ? (
        <BulkBar
          count={selection.count}
          hint={hint && selection.count === 0 ? t('activity.selectFirst') : null}
          onMarkPaid={onBulkMarkPaid}
          onMarkUnpaid={onBulkMarkUnpaid}
          onDelete={onBulkDelete}
        />
      ) : null}
      <ConfirmSheet
        visible={confirmOpen}
        body={t('activity.bulkDeleteConfirm', { count: selectedRows.length })}
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
          setFilter(f);
          setFilterOpen(false);
        }}
        onClose={() => setFilterOpen(false)}
      />
      <Sheet visible={addOpen} onDismiss={() => setAddOpen(false)} accessibilityLabel={t('activity.add')}>
        <Row label={t('record.sheet.directionOut')} onPress={() => openNew('out')} />
        <Row label={t('record.sheet.directionIn')} onPress={() => openNew('in')} />
        <Row label={t('record.sheet.directionTransfer')} onPress={() => openNew('transfer')} />
      </Sheet>
      <TransactionSheet
        visible={sheetMode !== null}
        mode={sheetMode ?? { kind: 'new', direction: 'out' }}
        onClose={() => setSheetMode(null)}
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
  links: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  link: {
    minHeight: space.touchMin,
    paddingHorizontal: space.gapSm,
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  sectionHeader: {
    paddingTop: space.groupGap,
    paddingBottom: space.gapSm,
  },
});
