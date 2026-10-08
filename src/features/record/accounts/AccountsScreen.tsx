// The account list (REC-08): active accounts with kind, currency, balance and standing line,
// an Archived section beneath, and Add account. Tapping an account opens its detail.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AccountRow } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances, type AccountBalanceView } from '@/data/queries/activity';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { AccountBalanceBlock, useBalanceSummary } from './AccountBalanceBlock';
import { AccountSheet } from './AccountSheet';

export interface AccountsScreenProps {
  onOpenAccount: (id: string) => void;
}

/**
 * S-WR-14: one account card. Its accessibility label is built from what it shows -- name, kind
 * and currency, balance and standing -- since a label replaces the children for a screen reader.
 */
function AccountCard({
  account,
  balance,
  homeCurrency,
  onPress,
}: {
  account: AccountRow;
  balance: AccountBalanceView | undefined;
  homeCurrency: string;
  onPress: () => void;
}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const kindLine = `${t(`accounts.kind.${account.kind}`)} · ${account.currency}`;
  const summary = useBalanceSummary(account, balance);
  const label = [account.name, kindLine, summary].filter((p): p is string => p !== null && p !== '').join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={balance ? label : account.name}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{account.name}</Text>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{kindLine}</Text>
      {balance ? <AccountBalanceBlock account={account} balance={balance} homeCurrency={homeCurrency} compact /> : null}
    </Pressable>
  );
}

export function AccountsScreen({ onOpenAccount }: AccountsScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const accountsData = useAccounts(rc.householdId ?? undefined).data;
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);
  const { balances } = useAccountBalances(rc.householdId, accounts);
  const [adding, setAdding] = useState(false);

  const active = accounts.filter((a) => a.archived_at === null);
  const archived = accounts.filter((a) => a.archived_at !== null);

  const renderAccount = (a: (typeof accounts)[number], showBalance: boolean) => (
    <AccountCard
      key={a.id}
      account={a}
      balance={showBalance ? balances.get(a.id) : undefined}
      homeCurrency={rc.homeCurrency}
      onPress={() => onOpenAccount(a.id)}
    />
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('accounts.title')}
        </Text>
        <Pill label={t('accounts.add')} variant="primary" onPress={() => setAdding(true)} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {active.length === 0 && archived.length === 0 ? (
          <EmptyState heading={t('accounts.emptyHeading')} body={t('accounts.emptyBody')} />
        ) : (
          active.map((a) => renderAccount(a, true))
        )}
        {archived.length > 0 ? (
          <>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('accounts.archived')}</Text>
            {archived.map((a) => renderAccount(a, false))}
          </>
        ) : null}
      </ScrollView>
      <AccountSheet visible={adding} mode={{ kind: 'new', context: 'later' }} onClose={() => setAdding(false)} />
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
  list: {
    gap: space.gapMd,
    paddingBottom: space.gapMd,
  },
  card: {
    padding: space.cardPad,
    borderRadius: radii.card,
    gap: space.gapSm / 2,
    minHeight: space.touchMin,
  },
});
