// 05.5-17 (D-12, D-18): the shared bill form body: name (fixed when editing), amount, day of month, how often. Fields, order and
// validation live here; the host owns the frame, the primary label, the Stop line, close, navigation and toasts. Controlled.
import React from 'react';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { hapticLight } from '@/ui/haptics';
import type { RecurringFreq } from '@/engine/recurring';
import { DayField, Field, FieldLabel, FreqChips, Note, dayFromText } from './formFields';
import { BILL_NAME_MAX, validAmount } from './limits';

export interface BillFormValues {
  name: string;
  amount: number | null;
  dayText: string;
  freq: RecurringFreq | null;
}

/** True when the values differ from where the form started. An added bill is dirty once anything is typed. */
export function billFormDirty(adding: boolean, values: BillFormValues, initial: { amount: number; day: number; freq: RecurringFreq } | undefined): boolean {
  if (adding) return values.name !== '' || values.amount !== null || values.dayText !== '';
  return values.amount !== initial?.amount || dayFromText(values.dayText) !== initial?.day || values.freq !== initial?.freq;
}

/** True when a bill can be saved: a name, an amount in range, a day 1 to 31 and a frequency. */
export const billFormReady = (values: BillFormValues): boolean =>
  values.name.trim() !== '' && validAmount(values.amount) && dayFromText(values.dayText) !== null && values.freq !== null;

export interface BillFormProps {
  adding: boolean;
  currency: string;
  values: BillFormValues;
  onChange: (values: BillFormValues) => void;
  copy: { note: string; name: string; amount: string; day: string; howOften: string };
  primaryLabel: string;
  onPrimary: () => void;
  /** Host-owned lines after the button (Decide's Stop line). */
  footer?: React.ReactNode;
}

export function BillForm({ adding, currency, values, onChange, copy, primaryLabel, onPrimary, footer }: BillFormProps) {
  return (
    <>
      <Note>{copy.note}</Note>
      {adding ? (
        <>
          <FieldLabel>{copy.name}</FieldLabel>
          <Field value={values.name} onChangeText={(v) => onChange({ ...values, name: v.slice(0, BILL_NAME_MAX) })} accessibilityLabel={copy.name} maxLength={BILL_NAME_MAX} />
        </>
      ) : (
        <Note>{values.name}</Note>
      )}
      <MoneyInput
        value={values.amount}
        currency={currency}
        onChange={(minor) => onChange({ ...values, amount: validAmount(minor) ? minor : null })}
        label={copy.amount}
        accessibilityLabel={copy.amount}
        boxed
      />
      <DayField label={copy.day} text={values.dayText} onChange={(dayText) => onChange({ ...values, dayText })} />
      <FreqChips label={copy.howOften} value={values.freq} onChange={(freq) => onChange({ ...values, freq })} />
      <Pill
        variant="primary"
        label={primaryLabel}
        disabled={!billFormReady(values)}
        onPress={() => {
          if (!billFormReady(values)) return;
          hapticLight();
          onPrimary();
        }}
      />
      {footer}
    </>
  );
}
