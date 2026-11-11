// 06.1-24 (D33E, D33A): "Change a bill" and "Add a bill it missed". One form, two modes. The sheets hand the figures back and write
// nothing; the Regular bills screen saves them to the bill in Activity.
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useT } from '@/i18n';
import type { RecurringFreq } from '@/engine/recurring';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { space } from '@/theme/layout';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Field, FieldLabel, Note } from '@/features/decide/screens/sheets/sheetUi';
import { DayField, FreqChips, dayFromText } from './itemFields';

export const BILL_NAME_MAX = 40;

const validAmount = (minor: number | null): minor is number => minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR;

export interface BillValues {
  name: string;
  amount: number;
  day: number;
  freq: RecurringFreq;
}

export interface BillSheetProps {
  visible: boolean;
  /** 'edit' changes a bill that is shown (its name is fixed); 'add' makes a new one. */
  mode: 'edit' | 'add';
  currency: string;
  initial?: { name: string; amount: number; day: number; freq: RecurringFreq };
  onSave: (values: BillValues) => void;
  onDismiss: () => void;
}

export function BillSheet(props: BillSheetProps) {
  return props.visible ? <BillForm {...props} /> : null;
}

function BillForm({ mode, currency, initial, onSave, onDismiss }: BillSheetProps) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? null);
  const [dayText, setDayText] = useState(initial === undefined ? '' : String(initial.day));
  const [freq, setFreq] = useState<RecurringFreq | null>(initial?.freq ?? 'monthly');
  const day = dayFromText(dayText);
  const adding = mode === 'add';
  const title = t(adding ? 'decide.screens.setupPayBills.billAdd.title' : 'decide.screens.setupPayBills.billEdit.title');
  const ready = name.trim() !== '' && validAmount(amount) && day !== null && freq !== null;
  const dirty = adding
    ? name !== '' || amount !== null || dayText !== ''
    : amount !== initial?.amount || day !== initial?.day || freq !== initial?.freq;
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Note>{t(adding ? 'decide.screens.setupPayBills.billAdd.sub' : 'decide.screens.setupPayBills.billEdit.sub')}</Note>
        {adding ? (
          <>
            <FieldLabel>{t('decide.screens.common.name')}</FieldLabel>
            <Field value={name} onChangeText={(v) => setName(v.slice(0, BILL_NAME_MAX))} accessibilityLabel={t('decide.screens.common.name')} maxLength={BILL_NAME_MAX} />
          </>
        ) : (
          <Note>{name}</Note>
        )}
        <MoneyInput
          value={amount}
          currency={currency}
          onChange={(minor) => setAmount(validAmount(minor) ? minor : null)}
          label={t('decide.screens.common.amount')}
          accessibilityLabel={t('decide.screens.common.amount')}
          boxed
        />
        <DayField label={t('decide.screens.setupPayBills.billEdit.day')} text={dayText} onChange={setDayText} />
        <FreqChips label={t('decide.screens.common.howOften')} value={freq} onChange={setFreq} />
        <Pill
          variant="primary"
          label={t(adding ? 'decide.screens.setupPayBills.billAdd.add' : 'decide.screens.setupPayBills.billEdit.save')}
          disabled={!ready}
          onPress={() => {
            if (!validAmount(amount) || day === null || freq === null || name.trim() === '') return;
            hapticLight();
            onSave({ name: name.trim(), amount, day, freq });
          }}
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
});
