// 05.5-17 (D-18): the small pieces the shared pay and bill forms are made of. Moved from Decide's sheetUi and setup itemFields; those
// files re-export them, so Decide imports keep working and Decide's look is unchanged.
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { formatOrdinal } from '@/i18n/ordinal';
import { money } from '@/engine/money';
import type { RecurringFreq } from '@/engine/recurring';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticTick } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { parseWholeInRange } from '@/ui/wholeNumberField';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{children}</Text>;
}

export function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) {
  const { colors, pairing } = useTheme();
  return (
    <Text
      accessibilityRole={tone === 'warn' ? 'alert' : undefined}
      style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: tone === 'warn' ? colors.warn1 : colors.inkMuted }}
    >
      {children}
    </Text>
  );
}

export interface FieldProps {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  maxLength?: number;
  numeric?: boolean;
  decimal?: boolean;
  readOnly?: boolean;
  /** 06.1-57 (A-ST-1, A-ST-7): a short word after the text, such as '%'. */
  suffix?: string;
  /** 06.1-57 (A-ST-7): the whole text is selected on focus, so typing replaces a shown example. */
  selectTextOnFocus?: boolean;
}

export function Field({ value, onChangeText, accessibilityLabel, placeholder, maxLength, numeric = false, decimal = false, readOnly = false, suffix, selectTextOnFocus }: FieldProps) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.box, suffix === undefined ? null : styles.adorned, { backgroundColor: colors.fill6 }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        maxLength={maxLength}
        inputMode={decimal ? 'decimal' : numeric ? 'numeric' : undefined}
        editable={!readOnly}
        selectTextOnFocus={selectTextOnFocus}
        style={[styles.input, suffix === undefined ? null : styles.grow, { ...textRole(pairing, 'body'), color: colors.ink }]}
      />
      {suffix === undefined ? null : (
        <Text testID="field-suffix" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {suffix}
        </Text>
      )}
    </View>
  );
}

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
              hapticTick();
              onPick(d);
            }}
          />
        </View>
      ))}
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
              hapticTick();
              onChange(f.value);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
  adorned: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  grow: { flex: 1 },
  column: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  cell: { minWidth: space.touchMin },
});
