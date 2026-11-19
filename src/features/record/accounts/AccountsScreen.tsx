// The account list (REC-08): active accounts with kind, currency, balance and standing line,
// an Archived section beneath, and Add account. Tapping an account opens its detail.
// 06.2 (D-10, ranked change 9): each card leads with a 36 IconTile carrying the account-type icon in the accent on the
// accent tint and ends in the set's arrow, as Home's Accounts card does. The card keeps its own layout rather than Row
// because the balance block is two lines (figure plus the one short standing / home line, D-39). D-14: a negative
// figure is spoken "minus ...". D-24: no accounts shows the 48 tile, one sentence and one button that opens Add.
// 08 UI-SPEC 4b: a joint account (is_shared, never a tombstone) carries the same Shared badge AccountSheet shows.
import { useWriteGate } from '@/features/plans/useWriteGate';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { AccountRow } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances, type AccountBalanceView } from '@/data/queries/activity';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSize, radii, space, step, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { EmptyState, accentTintOver } from '@/ui/EmptyState';
import { Glyph } from '@/ui/icons/Glyph';
import { IconTile } from '@/ui/icons/IconTile';
import { iconForAccountKind } from '@/ui/icons/iconFor';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { SharedBadge } from '@/features/household/components/SharedBadge';
import { AccountBalanceBlock, useCompactBalance } from './AccountBalanceBlock';
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
  const compact = useCompactBalance(account, balance, homeCurrency);
  const shared = account.is_shared === true && !account.tombstone_of;
  const label = [account.name, kindLine, shared ? t('household.sharing.badge') : null, compact.spokenLabel]
    .filter((p): p is string => p !== null && p !== '')
    .join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={balance ? label : shared ? `${account.name}, ${t('household.sharing.badge')}` : account.name}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <IconTile
        icon={iconForAccountKind(account.kind)}
        size={tile.row}
        color={colors.accent}
        tint={accentTintOver(colors.fill1, colors.accent)}
        testID={`account-tile-${account.id}`}
      />
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{account.name}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{kindLine}</Text>
        {shared ? <SharedBadge testID={`account-shared-${account.id}`} /> : null}
      </View>
      {balance ? <AccountBalanceBlock account={account} balance={balance} homeCurrency={homeCurrency} compact /> : null}
      <Glyph name="arrowRight" size={iconSize.inline} color={colors.inkFaint} />
    </Pressable>
  );
}

export function AccountsScreen({ onOpenAccount }: AccountsScreenProps) {
  const t = useT();
  const gate = useWriteGate('addAccount'); // 09-17 (TIER-09)
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
      <SyncProblemLine inset={false} />
      <View style={styles.header}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('accounts.title')}
        </Text>
        <Pill label={t('accounts.add')} variant="primary" locked={gate.gated} onPress={() => gate.run(() => setAdding(true))} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {active.length === 0 && archived.length === 0 ? (
          <EmptyState
            testID="accounts-empty"
            icon="accounts"
            heading={t('appLife.empty.accounts.heading')}
            body={t('appLife.empty.accounts.body')}
            actionLabel={t('appLife.empty.accounts.action')}
            onAction={() => setAdding(true)}
          />
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.cardPad,
    borderRadius: radii.card,
    gap: step.row,
    minHeight: space.touchMin,
  },
  text: { flex: 1, minWidth: 0 },
});
