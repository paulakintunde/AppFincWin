// The account list (REC-08): active accounts with kind, currency, balance and standing line,
// an Archived section beneath, and Add account. Tapping an account opens its detail.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances } from '@/data/queries/activity';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { AccountBalanceBlock } from './AccountBalanceBlock';
import { AccountSheet } from './AccountSheet';

export interface AccountsScreenProps {
  onOpenAccount: (id: string) => void;
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
    <Pressable
      key={a.id}
      accessibilityRole="button"
      accessibilityLabel={a.name}
      onPress={() => onOpenAccount(a.id)}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{a.name}</Text>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {`${t(`accounts.kind.${a.kind}`)} · ${a.currency}`}
      </Text>
      {showBalance ? <AccountBalanceBlock account={a} balance={balances.get(a.id)} homeCurrency={rc.homeCurrency} compact /> : null}
    </Pressable>
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
