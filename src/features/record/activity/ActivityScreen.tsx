// The Activity month screen (ACT-01, ACT-02, REC-03, REC-06): a month's transactions grouped
// as Still to come / Paid / Skipped, a month switcher, a totals line, overdue flags, one-tap
// Mark paid and the entry points into the transaction sheet. The list is the visual anchor;
// Shell's FAB replaces the Add button in Phase 3. Search, filters and bulk select are added
// by plan 02-23 at the marked slot below.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAccounts } from '@/data/queries/accounts';
import { useMonthView, useTransactionMonths, type ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useMarkPaid } from '@/data/mutations/transactions';
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
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow, ProjectionRow } from './ActivityRow';
import { buildActivityItems, getActivityItemType, type ActivityItem } from './activitySections';
import { formatMonthLabel, MonthSwitcher } from './MonthSwitcher';
import { MonthTotalsBar } from './MonthTotalsBar';

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

  const accountName = useCallback(
    (id: string): string => (accountsData ?? []).find((a) => a.id === id)?.name ?? '',
    [accountsData]
  );

  const items = useMemo(() => buildActivityItems(view.rows, view.projections), [view.rows, view.projections]);

  const onMarkPaid = useCallback(
    (row: ActivityRowView) => {
      if (rc.userId === null) return;
      const stepId = markPaid(row, rc.userId, rc.today);
      // Item 7: a null step means there was no honest before-state, so no Undo is offered.
      showToast({ kind: 'ordinary', text: undoLabelText('markedPaid', { name: row.name ?? undefined }), stepId });
    },
    [markPaid, rc.userId, rc.today]
  );

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
        selectable={false}
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
      <MonthTotalsBar totals={view.totals} homeCurrency={rc.homeCurrency} formatter={formatter} />
      {/* 02-23: search, filters and bulk bar mount here */}
      <View style={styles.list}>
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={getActivityItemType}
          renderItem={renderItem}
          ListEmptyComponent={
            <EmptyState
              heading={t('activity.emptyHeading', { month: formatMonthLabel(month, formatter.locale) })}
              body={t('activity.emptyBody')}
            />
          }
        />
      </View>
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
