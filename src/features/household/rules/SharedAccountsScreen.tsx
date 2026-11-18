// Screen 4b (D-13): the household's joint accounts with their full balance. A joint account's new lines start shared and every
// member sees its balance, including lines personal to one member. An account that only holds a departed member's shared lines
// (tombstone_of) is never listed. Names go through the member resolver (D-32).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Screen } from '@/ui/Screen';
import { Row } from '@/ui/Row';
import { Pill } from '@/ui/Pill';
import { EmptyState, accentTintOver } from '@/ui/EmptyState';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { IconTile } from '@/ui/icons/IconTile';
import { iconForAccountKind } from '@/ui/icons/iconFor';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, step, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { money } from '@/engine/money';
import { useAccounts } from '@/data/queries/accounts';
import type { AccountRow } from '@/db/rows';
import { AccountSheet } from '@/features/record/accounts/AccountSheet';
import { useRecordContext } from '@/features/record/useRecordContext';
import { householdIcons } from '../glyphs';
import { SharedBadge } from '../components/SharedBadge';
import { useMemberLabel } from '../useMemberLabel';
import { useHouseholdScope } from '../useHouseholdScope';
import { jointBalanceOf, useJointAccountBalances } from './jointAccounts';

/** The joint accounts a list may show: shared, live, and not a departed member's tombstone home. */
export function jointAccountsOf(accounts: readonly AccountRow[] | undefined): AccountRow[] {
  return (accounts ?? []).filter((a) => a.is_shared === true && !a.tombstone_of && !a.deleted_at);
}

export function SharedAccountsScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const rc = useRecordContext();
  const { householdId } = useHouseholdScope();
  const label = useMemberLabel(householdId);
  const formatter = useMoneyFormatter(rc.showCents);
  const accounts = jointAccountsOf(useAccounts(householdId ?? undefined).data);
  const balances = useJointAccountBalances(householdId);
  const [creating, setCreating] = useState(false);

  const make = () => setCreating(true);
  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.rules.shared.title')}
      </Text>
      {accounts.length === 0 ? (
        <EmptyState
          heading={t('household.sharing.joint.emptyTitle')}
          body={t('household.sharing.joint.emptyBody')}
          icon={householdIcons.people}
          actionLabel={t('household.sharing.joint.emptyAction')}
          onAction={make}
          testID="shared-accounts-empty"
        />
      ) : (
        <View style={styles.column}>
          {balances.isError ? (
            <Text testID="shared-balances-failed" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {t('household.rules.shared.loadFailed')}
            </Text>
          ) : null}
          {accounts.map((a) => (
            <Row
              key={a.id}
              label={a.name}
              sublabel={t('household.rules.shared.madeBy', { name: label(a.created_by) })}
              leading={<IconTile icon={iconForAccountKind(a.kind)} size={tile.row} color={colors.accent} tint={accentTintOver(colors.fill1, colors.accent)} />}
              amount={balances.data ? formatter.formatMoney(money(jointBalanceOf(a.opening_balance, a.currency, balances.data, a.id), a.currency)) : undefined}
              status={<SharedBadge testID={`shared-badge-${a.id}`} />}
            />
          ))}
          <Pill label={t('household.sharing.joint.emptyAction')} variant="secondary" onPress={make} />
        </View>
      )}
      {creating ? <AccountSheet visible mode={{ kind: 'new', context: 'later', joint: true }} onClose={() => setCreating(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  column: { marginTop: step.section, gap: step.tight },
});
