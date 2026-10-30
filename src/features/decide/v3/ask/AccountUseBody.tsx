/**
 * 05.3-32 (D-07, D-08): the in-place account-use question. The four choices live inside the question card; Everyday and
 * Savings save at once, A mix and Kept for one thing open the 05.2 second view in the same card (Back / Save account use).
 * The fund variant ("Which account holds your emergency fund?") is a radio list of accounts and "Save fund account".
 * Saves go through the 05.2 undoable mutations; the card shows the Undo toast from the step id passed to onSaved.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pill } from '@/ui/Pill';
import { useT } from '@/i18n';
import { useAccounts } from '@/data/queries/accounts';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { useEmergencyFundForm } from '@/features/decide/setup/EmergencyFundFields';
import { AccountUseFields } from '@/features/decide/setup/AccountUseSheet';
import type { AskBodyProps } from '@/features/decide/v3/model/ask';
import { useNoWrapMoney } from '@/features/income/steps/shared';
import { space } from '@/theme/layout';

const noop = (): void => undefined;

export function AccountUseBody(props: AskBodyProps): React.JSX.Element | null {
  return props.question.variant === 'fund' ? <FundAccountBody {...props} /> : <UseBody {...props} />;
}

function UseBody({ question, householdId, onSaved }: AskBodyProps): React.JSX.Element | null {
  const accounts = useAccounts(householdId).data;
  const id = question.params.accountId;
  const account = accounts?.find((a) => a.id === id) ?? null;
  if (account === null) return null;
  return <AccountUseFields inline account={account} balance={null} onSaved={onSaved} onCancel={noop} />;
}

function FundAccountBody({ onSaved }: AskBodyProps): React.JSX.Element {
  const t = useT();
  const form = useEmergencyFundForm('sheet');
  const noWrap = useNoWrapMoney(form.currency);
  const chosen = form.value.mode === 'account' ? form.value.accountId : null;
  return (
    <View style={styles.column}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.ask.saveFundAccount')} style={styles.options}>
        {form.accounts.map(({ account, balance }) => (
          <ChoiceCard
            key={account.id}
            selected={chosen === account.id}
            title={balance === null ? account.name : `${account.name}, ${noWrap(balance)}`}
            accessibilityLabel={balance === null ? account.name : `${account.name}, ${noWrap(balance)}`}
            onPress={() => form.set({ mode: 'account', accountId: account.id, holdsSpending: false })}
          />
        ))}
      </View>
      <Pill
        label={t('decide.v3.ui.ask.saveFundAccount')}
        variant="primary"
        disabled={chosen === null || !form.valid}
        onPress={() => {
          const result = form.save();
          onSaved(result === null ? null : result.stepId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  options: { gap: space.gapSm },
});
