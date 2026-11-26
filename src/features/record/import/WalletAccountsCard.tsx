// The new-accounts card at the top of a wallet preview (IMP-06, D-22). A file can hold several
// currencies; each currency with no account of its own is offered one. Every switch starts off:
// nothing is created without a tap, and the accounts exist only after "Create selected accounts".
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAddAccount } from '@/data/mutations/accounts';
import { newStepId } from '@/data/mutations/undoCapture';
import { useAccounts } from '@/data/queries/accounts';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { Dropdown } from '@/ui/Dropdown';
import { Pill } from '@/ui/Pill';
import { ToggleRow } from '@/ui/ToggleRow';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { Actions, T } from './importUi';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

/** "EUR and GBP", "EUR, GBP and USD" in the file's own order. */
function joinWords(items: readonly string[], and: string): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1] as string}`;
}

export function WalletAccountsCard({ state }: { state: ImportState }) {
  const t = useT();
  const rc = useRecordContext();
  const { colors } = useTheme();
  const { add } = useAddAccount();
  const accounts = (useAccounts(rc.householdId ?? undefined).data ?? []).filter((a) => a.archived_at === null);
  const plan = state.walletPlan;
  if (plan === null) return null;

  const open = plan.targets.filter((x) => x.accountId === null);
  if (open.length === 0) return null;

  const on = open.filter((x) => x.create);
  const and = t('system.ownData.walletImport.and');
  const title = t('system.ownData.walletImport.newAccountsTitle', {
    currencies: joinWords(open.map((x) => x.currency), and),
    names: joinWords(open.map((x) => `'${x.createName ?? x.currency}'`), and),
  });

  // The only place accounts are made: one per switched-on currency, then the import continues (D-22).
  const createSelected = (): void => {
    const householdId = rc.householdId;
    const ownerId = rc.userId;
    if (householdId === null || ownerId === null) return;
    for (const target of on) {
      const stepId = newStepId();
      const id = add(
        {
          household_id: householdId,
          name: target.createName ?? target.currency,
          kind: 'checking',
          currency: target.currency,
          opening_balance: 0,
        },
        { stepId, ownerId },
        target.currency !== rc.homeCurrency ? { homeCurrency: rc.homeCurrency, openingDate: rc.today, userId: ownerId } : undefined
      );
      state.linkWalletAccount(target.currency, id);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="wallet-accounts-card">
      <T role="bodyStrong">{title}</T>
      {open.map((target) => {
        const options = accounts.filter((a) => a.currency === target.currency).map((a) => ({ key: a.id, label: a.name }));
        return (
          <View key={target.currency}>
            <ToggleRow
              label={target.createName ?? target.currency}
              value={target.create}
              onChange={(next) => state.setWalletCreate(target.currency, next)}
            />
            {options.length > 0 ? (
              <Dropdown
                title={t('system.ownData.walletImport.useExisting')}
                options={options}
                triggerLabel={t('system.ownData.walletImport.useExisting')}
                triggerA11yLabel={`${t('system.ownData.walletImport.useExisting')}, ${target.currency}`}
                onSelect={(id) => state.linkWalletAccount(target.currency, id)}
              />
            ) : null}
          </View>
        );
      })}
      <Actions>
        <Pill label={t('system.ownData.walletImport.createSelected')} variant="primary" disabled={on.length === 0} onPress={createSelected} />
        <Pill label={t('system.ownData.walletImport.skipLines')} variant="secondary" onPress={state.skipWalletLines} />
      </Actions>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
