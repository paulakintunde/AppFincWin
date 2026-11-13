// 06.1-24: small pieces items 1 and 2 (and the item screens of plan 25) share: money and ordinal words, the day-of-month field,
// and the how-often chips. 06.1-54 (A-SU-4): the day picker (1 to 31 as chips in a sheet) for Pay's "Which day?".
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { formatOrdinal } from '@/i18n/ordinal';
import { money } from '@/engine/money';
import type { RecurringFreq } from '@/engine/recurring';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { Chip } from '@/ui/Chip';
import { hapticSelection } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { parseWholeInRange } from '@/ui/wholeNumberField';
import { Field, FieldLabel, Note } from '@/features/decide/screens/sheets/sheetUi';

export interface SetupFormat {
  money(minor: number, currency: string): string;
  ordinal(day: number): string;
  date(iso: string): string;
  /** The locale the words are formatted in (month names). */
  locale: string;
}

/** Money, ordinal day and date words from the same formatters the rest of the app uses. */
export function useSetupFormat(): SetupFormat {
  const t = useT();
  const fmt = useMoneyFormatter(false);
  const ordinal = useCallback(
    (day: number) => formatOrdinal(day, fmt.locale, t as (key: string, options?: Record<string, unknown>) => string),
    [fmt.locale, t],
  );
  return {
    money: (minor, currency) => fmt.formatMoney(money(minor, currency)),
    ordinal,
    date: (iso) => fmt.formatDate(iso, 'medium'),
    locale: fmt.locale,
  };
}

/** The day-of-month text field with its range line. `text` is what the person typed; `day` is the parsed value or null. */
export function dayFromText(text: string): number | null {
  const p = parseWholeInRange(text, 1, 31);
  return p.kind === 'ok' ? p.value : null;
}

export function DayField({ label, text, onChange }: { label: string; text: string; onChange: (text: string) => void }) {
  const t = useT();
  const bad = text !== '' && dayFromText(text) === null;
  return (
    <View style={styles.column}>
      <FieldLabel>{label}</FieldLabel>
      <Field value={text} onChangeText={(v) => onChange(v.replace(/\D/g, ''))} accessibilityLabel={label} numeric maxLength={2} />
      {bad ? <Note tone="warn">{t('decide.screens.common.fieldError.dayRange')}</Note> : null}
    </View>
  );
}

const DAYS: readonly number[] = Array.from({ length: 31 }, (_, i) => i + 1);

/** 06.1-54 (A-SU-4): the days 1 to 31 as a grid of chips, each at least 44 square. Read out as ordinals ("15th"). */
export function DayGrid({ label, day, onPick }: { label: string; day: number | null; onPick: (day: number) => void }) {
  const fmt = useSetupFormat();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.grid}>
      {DAYS.map((d) => (
        <View key={d} style={styles.cell}>
          <Chip
            label={String(d)}
            accessibilityLabel={fmt.ordinal(d)}
            selected={day === d}
            onPress={() => {
              hapticSelection();
              onPick(d);
            }}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * 06.1-54 (A-SU-4): a boxed field that shows the picked day and opens a sheet of day chips; never free text. `emptyText` is said
 * when no day is picked yet.
 */
export function DayPicker({ label, day, emptyText, onChange }: { label: string; day: number | null; emptyText: string; onChange: (day: number) => void }) {
  const t = useT();
  const fmt = useSetupFormat();
  const { colors, pairing } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = day === null ? emptyText : fmt.ordinal(day);
  return (
    <View style={styles.column}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        testID="day-picker"
        accessibilityRole="button"
        accessibilityLabel={`${label} ${shown}`}
        onPress={() => {
          hapticSelection();
          setOpen(true);
        }}
        style={[styles.box, { backgroundColor: colors.fill6 }]}
      >
        <Text style={{ ...textRole(pairing, 'body'), color: day === null ? colors.inkMuted : colors.ink }}>{shown}</Text>
      </Pressable>
      {open ? (
        <Sheet visible onDismiss={() => setOpen(false)} accessibilityLabel={label}>
          <SheetHeader title={label} cancelLabel={t('decide.screens.common.cancel')} onCancel={() => setOpen(false)} />
          <SheetScroll contentContainerStyle={styles.column}>
            <DayGrid
              label={label}
              day={day}
              onPick={(d) => {
                setOpen(false);
                onChange(d);
              }}
            />
          </SheetScroll>
        </Sheet>
      ) : null}
    </View>
  );
}

const FREQS: readonly { value: RecurringFreq; key: string }[] = [
  { value: 'monthly', key: 'income.other.freqMonthly' },
  { value: 'weekly', key: 'income.other.freqWeekly' },
  { value: 'fortnightly', key: 'income.other.freqFortnightly' },
  { value: 'quarterly', key: 'income.other.freqQuarterly' },
  { value: 'yearly', key: 'income.other.freqYearly' },
];

/** The words for a frequency (Monthly, Weekly, Every 2 weeks, ...). */
export function useFreqWord(): (freq: RecurringFreq) => string {
  const t = useT() as unknown as (key: string) => string;
  return (freq) => t(FREQS.find((f) => f.value === freq)?.key ?? 'income.other.freqMonthly');
}

export function FreqChips({ label, value, onChange }: { label: string; value: RecurringFreq | null; onChange: (freq: RecurringFreq) => void }) {
  const word = useFreqWord();
  return (
    <View style={styles.column}>
      <FieldLabel>{label}</FieldLabel>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {FREQS.map((f) => (
          <Chip
            key={f.value}
            label={word(f.value)}
            selected={value === f.value}
            onPress={() => {
              hapticSelection();
              onChange(f.value);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  cell: { minWidth: space.touchMin },
  box: { minHeight: space.touchMin, borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
});

/** A one-choice row with a radio dot, 44 high at least. Rows of one question sit in a `radiogroup` view. */
export function RadioRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={styles.radio}
    >
      <RadioDot selected={selected} />
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}
