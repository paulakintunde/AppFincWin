/**
 * D-105 (R18.2): the "By" row of the pot sheet. A pot is ready by a month, not a day, so this is a month choice: a row that
 * opens a list of months, earliest allowed first. The chosen value is the first of that month; the caller stores the last day
 * (lastDayOfMonth). Nothing earlier than `minMonth` is offered, so the picker never opens on a past date.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';

export interface MonthFieldProps {
  label: string;
  /** 'YYYY-MM' or null before one is chosen. */
  value: string | null;
  /** 'YYYY-MM': the earliest month offered. */
  minMonth: string;
  /** 'YYYY-MM': the latest month offered. */
  maxMonth: string;
  /** Shown while no month is chosen. */
  empty: string;
  format: (month: string) => string;
  onChange: (month: string) => void;
}

/** Every 'YYYY-MM' from `min` to `max` inclusive. String and integer maths only. */
export function monthsBetween(min: string, max: string): string[] {
  const out: string[] = [];
  let y = parseInt(min.slice(0, 4), 10);
  let m = parseInt(min.slice(5, 7), 10);
  const endY = parseInt(max.slice(0, 4), 10);
  const endM = parseInt(max.slice(5, 7), 10);
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function MonthField({ label, value, minMonth, maxMonth, empty, format, onChange }: MonthFieldProps) {
  const t = useT();
  const readOnly = useReadOnlyScope();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row label={label} value={value === null ? empty : format(value)} dense chevron disabled={readOnly} onPress={() => setOpen(true)} />
      {open ? (
        <Sheet visible onDismiss={() => setOpen(false)} accessibilityLabel={label}>
          <SheetHeader title={label} cancelLabel={t('record.sheet.cancel')} onCancel={() => setOpen(false)} />
          <SheetScroll>
            <View>
              {monthsBetween(minMonth, maxMonth).map((m) => (
                <Row
                  key={m}
                  label={format(m)}
                  dense
                  selected={m === value}
                  onPress={() => {
                    setOpen(false);
                    onChange(m);
                  }}
                />
              ))}
            </View>
          </SheetScroll>
        </Sheet>
      ) : null}
    </>
  );
}
