// 06.1-24 (D33E, D33A): "Change a bill" and "Add a bill it missed". One form, two modes. The sheets hand the figures back and write
// nothing; the Regular bills screen saves them to the bill in Activity.
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useT } from '@/i18n';
import type { RecurringFreq } from '@/engine/recurring';
import { space } from '@/theme/layout';
import { hapticTap } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Note, dayFromText } from '@/features/record/forms/formFields';
import { BillForm, billFormDirty, type BillFormValues } from '@/features/record/forms/BillForm';
import { BILL_NAME_MAX, validAmount } from '@/features/record/forms/limits';

export { BILL_NAME_MAX };

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
  /** 06.1-75 (OQ-75-1 A, DC-6): edit mode on a saved bill only. Stops it from today; past entries stay in Activity. */
  onStop?: () => void;
}

export function BillSheet(props: BillSheetProps) {
  return props.visible ? <BillSheetForm {...props} /> : null;
}

function BillSheetForm({ mode, currency, initial, onSave, onDismiss, onStop }: BillSheetProps) {
  const t = useT();
  const [values, setValues] = useState<BillFormValues>({
    name: initial?.name ?? '',
    amount: initial?.amount ?? null,
    dayText: initial === undefined ? '' : String(initial.day),
    freq: initial?.freq ?? 'monthly',
  });
  const adding = mode === 'add';
  const title = t(adding ? 'decide.screens.setupPayBills.billAdd.title' : 'decide.screens.setupPayBills.billEdit.title');
  const dirty = billFormDirty(adding, values, initial);
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <BillForm
          adding={adding}
          currency={currency}
          values={values}
          onChange={setValues}
          copy={{
            note: t(adding ? 'decide.screens.setupPayBills.billAdd.sub' : 'decide.screens.setupPayBills.billEdit.sub'),
            name: t('decide.screens.common.name'),
            amount: t('decide.screens.common.amount'),
            day: t('decide.screens.setupPayBills.billEdit.day'),
            howOften: t('decide.screens.common.howOften'),
          }}
          primaryLabel={t(adding ? 'decide.screens.setupPayBills.billAdd.add' : 'decide.screens.setupPayBills.billEdit.save')}
          onPrimary={() => {
            const day = dayFromText(values.dayText);
            if (!validAmount(values.amount) || day === null || values.freq === null || values.name.trim() === '') return;
            onSave({ name: values.name.trim(), amount: values.amount, day, freq: values.freq });
          }}
          footer={
            !adding && onStop !== undefined ? (
              <>
                <Pill
                  variant="secondary"
                  label={t('decide.screens.setupPayBills.bills.stopped')}
                  accessibilityHint={t('decide.screens.setupPayBills.bills.stoppedNote')}
                  onPress={() => {
                    hapticTap();
                    onStop();
                  }}
                />
                <Note>{t('decide.screens.setupPayBills.bills.stoppedNote')}</Note>
              </>
            ) : null
          }
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
});
