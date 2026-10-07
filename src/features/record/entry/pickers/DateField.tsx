// The Date row: shows the formatted local date and opens the native date picker. The chosen
// day is read from the picker's local year/month/day -- never toISOString(), which would
// shift the day across a time-zone boundary (MON-14).
import React, { useState } from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useT } from '@/i18n';

export interface DateFieldProps {
  label: string;
  /** 'YYYY-MM-DD'. */
  value: string;
  display: string;
  onChange: (localDate: string) => void;
  /** 'YYYY-MM-DD': the earliest day the picker offers (S-CR-03). */
  minDate?: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromLocalDateString(value: string): Date {
  const [y = 1970, m = 1, d = 1] = value.split('-').map((part) => parseInt(part, 10));
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function DateField({ label, value, display, onChange, minDate }: DateFieldProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const handle = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && date) onChange(toLocalDateString(date));
  };

  const picker = open ? (
    <DateTimePicker
      testID="date-picker"
      value={fromLocalDateString(value)}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      minimumDate={minDate ? fromLocalDateString(minDate) : undefined}
      onChange={handle}
    />
  ) : null;

  return (
    <>
      <Row label={label} value={display} dense chevron onPress={() => setOpen(true)} />
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onDismiss={() => setOpen(false)} accessibilityLabel={label}>
          <SheetHeader title={label} cancelLabel={t('record.sheet.cancel')} onCancel={() => setOpen(false)} />
          {picker}
        </Sheet>
      ) : (
        picker
      )}
    </>
  );
}
