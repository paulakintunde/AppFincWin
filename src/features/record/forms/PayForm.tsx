// 05.5-17 (D-12, D-18): the shared pay form body. Fields, order and validation live here; the host owns the frame (a Decide setup sheet or an
// Activity screen), the primary label, close, navigation, toasts and prefill. Controlled: the host holds the values and writes them.
// Parts a host does not use are left out: no `onDay` hides the day grid, no `accounts` hides the account chips, no `onPrimary` hides the button.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import type { AccountRow } from '@/db/rows';
import { space } from '@/theme/layout';
import { Chip } from '@/ui/Chip';
import { hapticTap, hapticTick } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { DayGrid, FieldLabel, Note } from './formFields';
import { validAmount } from './limits';

export interface PayFormValues {
  amount: number | null;
  day: number | null;
  accountId: string | null;
}

/** True when the values differ from where the form started; hosts pass it to their frame's `dirty`. */
export const payFormDirty = (values: PayFormValues, initial: PayFormValues): boolean =>
  values.amount !== initial.amount || values.day !== initial.day || values.accountId !== initial.accountId;

/** True when the figures a host asked for are all valid. `needsDay` and `needsAccount` follow which parts the host shows. */
export const payFormReady = (values: PayFormValues, needs: { day?: boolean; account?: boolean } = {}): boolean =>
  validAmount(values.amount) && (needs.day !== true || values.day !== null) && (needs.account !== true || values.accountId !== null);

export interface PayFormProps {
  currency: string;
  amount: number | null;
  onAmount: (minor: number | null) => void;
  amountLabel: string;
  /** A line above the fields. */
  note?: string;
  /** Host-owned fields that sit between the amount and the day (Activity's how often and next date). */
  children?: React.ReactNode;
  large?: boolean;
  day?: number | null;
  onDay?: (day: number) => void;
  dayLabel?: string;
  accounts?: readonly AccountRow[];
  accountId?: string | null;
  onAccount?: (id: string) => void;
  accountLabel?: string;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
}

export function PayForm(props: PayFormProps) {
  const { currency, amount, onAmount, amountLabel, note, children, large, day = null, onDay, dayLabel = '', accounts, accountId = null, onAccount, accountLabel = '' } = props;
  return (
    <>
      {note === undefined ? null : <Note>{note}</Note>}
      <MoneyInput
        value={amount}
        currency={currency}
        onChange={(minor) => onAmount(validAmount(minor) ? minor : null)}
        label={amountLabel}
        accessibilityLabel={amountLabel}
        boxed
        {...(large === true ? { large: true } : {})}
      />
      {children}
      {onDay === undefined ? null : (
        <>
          <FieldLabel>{dayLabel}</FieldLabel>
          <DayGrid label={dayLabel} day={day} onPick={onDay} />
        </>
      )}
      {accounts !== undefined && accounts.length > 1 && onAccount !== undefined ? (
        <View style={styles.column}>
          <FieldLabel>{accountLabel}</FieldLabel>
          <View accessibilityRole="radiogroup" accessibilityLabel={accountLabel} style={styles.chips}>
            {accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={accountId === a.id}
                onPress={() => {
                  hapticTick();
                  onAccount(a.id);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      {props.onPrimary === undefined || props.primaryLabel === undefined ? null : (
        <PrimaryButton label={props.primaryLabel} disabled={props.primaryDisabled === true} onPress={props.onPrimary} />
      )}
    </>
  );
}

function PrimaryButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pill
      variant="primary"
      label={label}
      disabled={disabled}
      onPress={() => {
        hapticTap();
        onPress();
      }}
    />
  );
}

/** The wording Decide's frame uses for the pay form, so a host does not repeat the keys. */
export function usePayFormCopy() {
  const t = useT();
  return {
    note: t('decide.screens.setupPayBills.payEdit.sub'),
    amount: t('decide.screens.setupPayBills.payEdit.amount'),
    day: t('decide.screens.setupPayBills.payEdit.day'),
    account: t('decide.screens.setupPayBills.payEdit.account'),
    save: t('decide.screens.setupPayBills.payEdit.save'),
  };
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
