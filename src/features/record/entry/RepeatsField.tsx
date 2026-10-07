// The Repeats row (REC-05, D-04, D-09): shows the current choice and opens a sheet with the
// frequency list and the "Ends" options (never, on a date, after a number of times). The
// value is a plain RepeatsValue; turning it into a schedule is recurringForm.ts's job.
import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { RECURRING_FREQS, type RecurringFreq } from '@/engine/recurring';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { DateField } from './pickers/DateField';
import { defaultEndDate, MAX_OCCURRENCE_COUNT, type RepeatsEnd, type RepeatsValue } from './recurringForm';

export interface RepeatsFieldProps {
  value: RepeatsValue;
  onChange: (value: RepeatsValue) => void;
  /** Formats a 'YYYY-MM-DD' date for display. */
  formatDate: (localDate: string) => string;
  today: string;
  /** S-CR-03: the entry's own date (the series anchor). "On a date" defaults to and may not precede it. */
  entryDate: string;
}

const DIGITS = /^\d+$/;

export function RepeatsField({ value, onChange, formatDate, today, entryDate }: RepeatsFieldProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [open, setOpen] = useState(false);
  const [countText, setCountText] = useState(value.freq !== 'never' && value.end.kind === 'count' ? String(value.end.count) : '');

  const summary = (): string => {
    if (value.freq === 'never') return t('record.repeats.never');
    const base = t(`record.repeats.${value.freq}`);
    if (value.end.kind === 'date') return `${base} · ${formatDate(value.end.date)}`;
    if (value.end.kind === 'count' && Number.isInteger(value.end.count) && value.end.count >= 1) {
      return `${base} · ${t('record.repeats.endCount', { count: value.end.count })}`;
    }
    return base;
  };

  const setEnd = (end: RepeatsEnd) => {
    if (value.freq !== 'never') onChange({ freq: value.freq, end });
  };

  const chooseFreq = (freq: RecurringFreq) => {
    onChange({ freq, end: value.freq === 'never' ? { kind: 'never' } : value.end });
  };

  const endKind = value.freq === 'never' ? null : value.end.kind;
  const inputStyle = [
    textRole(pairing, 'body'),
    styles.input,
    { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 },
  ];
  const mark = (selected: boolean): string | undefined => (selected ? '✓' : undefined);

  return (
    <>
      <Row label={t('record.sheet.field.repeats')} value={summary()} dense chevron onPress={() => setOpen(true)} />
      <Sheet visible={open} onDismiss={() => setOpen(false)} accessibilityLabel={t('record.sheet.field.repeats')}>
        <SheetHeader
          title={t('record.sheet.field.repeats')}
          cancelLabel={t('record.repeats.done')}
          onCancel={() => setOpen(false)}
        />
        <Row
          label={t('record.repeats.never')}
          dense
          value={mark(value.freq === 'never')}
          onPress={() => onChange({ freq: 'never' })}
        />
        {RECURRING_FREQS.map((freq) => (
          <Row
            key={freq}
            label={t(`record.repeats.${freq}`)}
            dense
            value={mark(value.freq === freq)}
            onPress={() => chooseFreq(freq)}
          />
        ))}
        {value.freq !== 'never' ? (
          <>
            <Row label={t('record.repeats.endNever')} dense value={mark(endKind === 'never')} onPress={() => setEnd({ kind: 'never' })} />
            <Row
              label={t('record.repeats.endOnDate')}
              dense
              value={mark(endKind === 'date')}
              onPress={() => setEnd({ kind: 'date', date: value.end.kind === 'date' ? value.end.date : defaultEndDate(today, entryDate) })}
            />
            {value.end.kind === 'date' ? (
              <DateField
                label={t('record.repeats.endLabel')}
                value={value.end.date}
                display={formatDate(value.end.date)}
                onChange={(date) => setEnd({ kind: 'date', date })}
                minDate={entryDate}
              />
            ) : null}
            <Row
              label={t('record.repeats.endAfterCount')}
              dense
              value={mark(endKind === 'count')}
              onPress={() => setEnd({ kind: 'count', count: DIGITS.test(countText) ? Number(countText) : Number.NaN })}
            />
            {value.end.kind === 'count' ? (
              <TextInput
                accessibilityLabel={t('record.repeats.countField')}
                keyboardType="number-pad"
                value={countText}
                onChangeText={(text) => {
                  setCountText(text);
                  setEnd({ kind: 'count', count: DIGITS.test(text) ? Number(text) : Number.NaN });
                }}
                maxLength={String(MAX_OCCURRENCE_COUNT).length}
                style={inputStyle}
                placeholderTextColor={colors.inkFaint}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    paddingVertical: space.gapSm,
  },
});
