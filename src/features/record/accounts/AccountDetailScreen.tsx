// One account (REC-08, D-22, D-39): balance block with standing line, Import statement for this
// account, Edit account, and this month's lines for the account.
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances, useMonthView, type ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { useMarkPaid } from '@/data/mutations/transactions';
import { EMPTY_FILTER, filterRows } from '@/engine/activity';
import { monthOf } from '@/engine/time';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import type { EntryMode } from '@/features/record/entry/transactionForm';
import { useRecordContext } from '@/features/record/useRecordContext';
import { ActivityRow } from '@/features/record/activity/ActivityRow';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AccountBalanceBlock } from './AccountBalanceBlock';
import { AccountSheet } from './AccountSheet';

export interface AccountDetailScreenProps {
  accountId: string;
  onImport: (accountId: string) => void;
}

export function AccountDetailScreen({ accountId, onImport }: AccountDetailScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const accountsData = useAccounts(rc.householdId ?? undefined).data;
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);
  const account = accounts.find((a) => a.id === accountId);
  const { balances } = useAccountBalances(rc.householdId, accounts);
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const view = useMonthView(
    { householdId: rc.householdId, homeCurrency: rc.homeCurrency, today: rc.today },
    monthOf(rc.today)
  );
  const { markPaid } = useMarkPaid();
  const [editing, setEditing] = useState(false);
  const [sheetMode, setSheetMode] = useState<EntryMode | null>(null);

  const lines = useMemo(
    () => filterRows(view.rows, { ...EMPTY_FILTER, accountIds: [accountId] }),
    [view.rows, accountId]
  );
  const accountName = useCallback((id: string): string => accounts.find((a) => a.id === id)?.name ?? '', [accounts]);

  const onMarkPaid = useCallback(
    (row: ActivityRowView) => {
      if (rc.userId === null) return;
      const stepId = markPaid(row, rc.userId, rc.today);
      // Follow-up item 7: a null step id shows the toast with no Undo.
      showToast({ kind: 'ordinary', text: undoLabelText('markedPaid', { name: row.name ?? undefined }), stepId });
    },
    [markPaid, rc.userId, rc.today]
  );

  if (!account) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.column}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {account.name}
        </Text>
        <AccountBalanceBlock account={account} balance={balances.get(account.id)} homeCurrency={rc.homeCurrency} />
        <View style={styles.actions}>
          <Pill label={t('accounts.importCsv')} variant="secondary" onPress={() => onImport(account.id)} />
          <Pill label={t('accounts.sheet.titleEdit')} variant="secondary" onPress={() => setEditing(true)} />
        </View>
        {lines.map((row) => (
          <ActivityRow
            key={row.id}
            row={row}
            categories={categories}
            accountName={accountName}
            formatter={formatter}
            homeCurrency={rc.homeCurrency}
            onPress={(r) => setSheetMode({ kind: 'edit', row: r })}
            onMarkPaid={onMarkPaid}
          />
        ))}
      </ScrollView>
      <AccountSheet visible={editing} mode={{ kind: 'edit', account }} onClose={() => setEditing(false)} />
      <TransactionSheet
        visible={sheetMode !== null}
        mode={sheetMode ?? { kind: 'new', direction: 'out' }}
        onClose={() => setSheetMode(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.gapMd,
    paddingBottom: space.gapMd,
  },
  actions: {
    flexDirection: 'row',
    gap: space.gapSm,
  },
});
