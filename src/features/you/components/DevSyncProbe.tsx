// SYN-02: a development-build-only row that queues a real, foreign-currency test
// transaction through the offline write queue (creating a 'Sync test' cash account first if
// none exists yet), so the queue/pause/replay/sync-status flow can be exercised on a real
// device before Record (Phase 2) ships any screen that writes for real. Gated to __DEV__ by
// the caller (YouScreen) -- release builds never mount this component.
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/typography';
import { useAuth } from '@/features/auth/AuthProvider';
import { useHouseholdId } from '@/data/queries/household';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useAccounts } from '@/data/queries/accounts';
import { useAddAccount } from '@/data/mutations/accounts';
import { useAddTransaction } from '@/data/mutations/transactions';
import { minorUnits } from '@/engine/money';

const PROBE_ACCOUNT_NAME = 'Sync test';

export function DevSyncProbe() {
  const t = useT();
  const { colors, fonts } = useTheme();
  const { user } = useAuth();
  const { data: householdId } = useHouseholdId(user?.id);
  const { prefs } = useMoneyPrefs(user?.id);
  const { data: accounts } = useAccounts(householdId ?? undefined);
  const { add: addAccount } = useAddAccount();
  const { add: addTransaction } = useAddTransaction();

  const handlePress = useCallback(() => {
    if (!user || !householdId) return;

    const existing = accounts?.find((account) => account.name === PROBE_ACCOUNT_NAME);
    const accountId =
      existing?.id ??
      addAccount({
        household_id: householdId,
        name: PROBE_ACCOUNT_NAME,
        kind: 'cash',
        currency: prefs.home_currency,
        opening_balance: 0,
      });

    // A foreign-currency amount is deliberate: it exercises the provisional-FX-stamp path
    // (not just a same-currency write) on a real device.
    const currency = prefs.home_currency === 'EUR' ? 'USD' : 'EUR';

    addTransaction({
      householdId,
      accountId,
      amount: minorUnits(-1000),
      currency,
      homeCurrency: prefs.home_currency,
      userId: user.id,
      note: 'sync probe',
    });
  }, [user, householdId, accounts, prefs, addAccount, addTransaction]);

  return (
    <Pressable accessibilityRole="button" onPress={handlePress}>
      <Text style={[styles.label, { fontFamily: fonts.body[500], color: colors.ink }]}>
        {t('dev.syncProbe.label')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.body,
  },
});
