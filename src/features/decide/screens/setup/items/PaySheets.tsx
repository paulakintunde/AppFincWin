// 06.1-24 (D32E, D32I): the two sheets on the Pay and payday item. "Change your pay" and "Add other income". Both hand the figures
// back through a callback and write nothing; the item screen saves them to Activity.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import type { RecurringFreq } from '@/engine/recurring';
import type { AccountRow } from '@/db/rows';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { space } from '@/theme/layout';
import { Chip } from '@/ui/Chip';
import { hapticLight, hapticSelection } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Field, FieldLabel, Note } from '@/features/decide/screens/sheets/sheetUi';
import { DayGrid, FreqChips } from './itemFields';

export const OTHER_INCOME_NAME_MAX = 40;

const validAmount = (minor: number | null): minor is number => minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR;

export interface PayEditValues {
  amount: number;
  day: number;
  accountId: string;
}

export interface PayEditSheetProps {
  visible: boolean;
  amount: number | null;
  day: number | null;
  accountId: string | null;
  accounts: readonly AccountRow[];
  currency: string;
  onSave: (values: PayEditValues) => void;
  onDismiss: () => void;
}

export function PayEditSheet(props: PayEditSheetProps) {
  return props.visible ? <PayEditForm {...props} /> : null;
}

function PayEditForm({ amount, day, accountId, accounts, currency, onSave, onDismiss }: PayEditSheetProps) {
  const t = useT();
  const [amountMinor, setAmountMinor] = useState<number | null>(amount);
  // 06.1-54 (A-SU-4): the payday is picked from 1 to 31, never typed.
  const [parsedDay, setParsedDay] = useState<number | null>(day);
  const [account, setAccount] = useState<string | null>(accountId ?? accounts[0]?.id ?? null);
  const ready = validAmount(amountMinor) && parsedDay !== null && account !== null;
  const title = t('decide.screens.setupPayBills.payEdit.title');
  const dirty = amountMinor !== amount || parsedDay !== day || account !== (accountId ?? accounts[0]?.id ?? null);
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Note>{t('decide.screens.setupPayBills.payEdit.sub')}</Note>
        <MoneyInput
          value={amountMinor}
          currency={currency}
          onChange={(minor) => setAmountMinor(validAmount(minor) ? minor : null)}
          label={t('decide.screens.setupPayBills.payEdit.amount')}
          accessibilityLabel={t('decide.screens.setupPayBills.payEdit.amount')}
          boxed
        />
        <FieldLabel>{t('decide.screens.setupPayBills.payEdit.day')}</FieldLabel>
        <DayGrid label={t('decide.screens.setupPayBills.payEdit.day')} day={parsedDay} onPick={setParsedDay} />
        {accounts.length > 1 ? (
          <View style={styles.column}>
            <FieldLabel>{t('decide.screens.setupPayBills.payEdit.account')}</FieldLabel>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.setupPayBills.payEdit.account')} style={styles.chips}>
              {accounts.map((a) => (
                <Chip
                  key={a.id}
                  label={a.name}
                  selected={account === a.id}
                  onPress={() => {
                    hapticSelection();
                    setAccount(a.id);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Pill
          variant="primary"
          label={t('decide.screens.setupPayBills.payEdit.save')}
          disabled={!ready}
          onPress={() => {
            if (!validAmount(amountMinor) || parsedDay === null || account === null) return;
            hapticLight();
            onSave({ amount: amountMinor, day: parsedDay, accountId: account });
          }}
        />
      </SheetScroll>
    </Sheet>
  );
}

export interface OtherIncomeValues {
  name: string;
  amount: number;
  freq: RecurringFreq;
  counts: 'available' | 'kept';
}

export interface OtherIncomeSheetProps {
  visible: boolean;
  currency: string;
  onAdd: (values: OtherIncomeValues) => void;
  onDismiss: () => void;
}

export function OtherIncomeSheet(props: OtherIncomeSheetProps) {
  return props.visible ? <OtherIncomeForm {...props} /> : null;
}

function OtherIncomeForm({ currency, onAdd, onDismiss }: OtherIncomeSheetProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [freq, setFreq] = useState<RecurringFreq | null>(null);
  const [counts, setCounts] = useState<'available' | 'kept' | null>(null);
  const title = t('decide.screens.setupPayBills.otherIncome.title');
  const ready = name.trim() !== '' && validAmount(amount) && freq !== null && counts !== null;
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={name !== '' || amount !== null || freq !== null || counts !== null}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Note>{t('decide.screens.setupPayBills.otherIncome.sub')}</Note>
        <FieldLabel>{t('decide.screens.common.name')}</FieldLabel>
        <Field value={name} onChangeText={(v) => setName(v.slice(0, OTHER_INCOME_NAME_MAX))} accessibilityLabel={t('decide.screens.common.name')} maxLength={OTHER_INCOME_NAME_MAX} />
        <MoneyInput
          value={amount}
          currency={currency}
          onChange={(minor) => setAmount(validAmount(minor) ? minor : null)}
          label={t('decide.screens.common.amount')}
          accessibilityLabel={t('decide.screens.common.amount')}
          boxed
        />
        <FreqChips label={t('decide.screens.common.howOften')} value={freq} onChange={setFreq} />
        <FieldLabel>{t('decide.screens.setupPayBills.otherIncome.counts')}</FieldLabel>
        <SegmentedToggle
          options={[
            { key: 'available', label: t('decide.screens.setupPayBills.pay.spendIt') },
            { key: 'kept', label: t('decide.screens.setupPayBills.pay.keptIt') },
          ]}
          value={counts ?? ''}
          onChange={(key) => setCounts(key === 'kept' ? 'kept' : 'available')}
          accessibilityLabel={t('decide.screens.setupPayBills.otherIncome.counts')}
        />
        <Pill
          variant="primary"
          label={t('decide.screens.setupPayBills.otherIncome.add')}
          disabled={!ready}
          onPress={() => {
            if (!validAmount(amount) || freq === null || counts === null || name.trim() === '') return;
            hapticLight();
            onAdd({ name: name.trim(), amount, freq, counts });
          }}
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
