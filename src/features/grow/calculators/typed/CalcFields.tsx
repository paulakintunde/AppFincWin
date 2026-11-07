// 06-13: the small shared pieces of the four typed calculators: the labelled rate / whole-number fields, a label-value row,
// the footer note, and the formatting hook. Tokens only; no maths (the figures come from calcModels already worked out).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { currencyCode, minorUnits } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { firstOfNextMonth } from './useCalcInput';
import type { WorkedLine, WorkedValue } from './calcModels';

export interface CalcFormat {
  currency: string;
  /** An amount to the cent, whatever the Show cents setting says (a calculator works to the cent). */
  money(minor: number): string;
  /** "May 2028" for a YYYY-MM-DD date, in the device language. */
  monthYear(date: string): string;
  /** The first day of next month: the date of the first deposit or payment. */
  start: string;
}

export function useCalcFormat(): CalcFormat {
  const rc = useRecordContext();
  const fmt = useMoneyFormatter(true, rc.homeCurrency);
  const money = (minor: number) => fmt.formatMoney({ amount: minorUnits(minor), currency: currencyCode(rc.homeCurrency) });
  const monthYear = (date: string) => {
    const [y, m] = date.split('-').map(Number);
    return new Intl.DateTimeFormat(fmt.locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y!, m! - 1, 1));
  };
  return { currency: rc.homeCurrency, money, monthYear, start: firstOfNextMonth(rc.today) };
}

/** The worked-out lines of a result, translated: money and dates in a line's values are formatted here. */
export function useWorkedLines(lines: readonly WorkedLine[], f: CalcFormat): string[] {
  const t = useT();
  const shown = (v: WorkedValue): string | number => {
    if (typeof v === 'object') return 'money' in v ? f.money(v.money) : f.monthYear(v.date);
    return v;
  };
  return lines.map((line) => {
    const values: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(line.values)) values[k] = shown(v);
    return (t as (key: string, options: Record<string, string | number>) => string)(line.key, values);
  });
}

export function CalcPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <DetailScreen title={title}>
      <View style={styles.page}>{children}</View>
    </DetailScreen>
  );
}

export interface TypedFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Shown after the typed text: "%", "months", "years". */
  suffix?: string;
  keyboardType?: 'decimal-pad' | 'number-pad';
  testID?: string;
  /** Spoken label when it must say more than the visible one ("Debt 1, Rate"). */
  accessibilityLabel?: string;
}

/** A labelled number field (rate, months, years). The text is parsed by calcModels / wholeFromText, never here. */
export function TypedField({ label, value, onChangeText, suffix, keyboardType = 'decimal-pad', testID, accessibilityLabel }: TypedFieldProps) {
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.cell}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>{label}</Text>
      <View style={[styles.box, { minHeight: space.touchMin, borderColor: colors.line2, backgroundColor: colors.surface }]}>
        <TextInput
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholderTextColor={colors.inkFaint}
          style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1, minHeight: space.touchMin, padding: 0 }}
        />
        {suffix ? <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function ValueRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.valueRow, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 }]}>
      <Text style={[styles.valueLabel, { ...textRole(pairing, 'body'), color: colors.inkDim }]}>{label}</Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]}>{children}</View>;
}

export function FooterNote({ text }: { text: string }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.label, color: colors.inkMuted }}>{text}</Text>;
}

export const calcStyles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.gapMd },
});

const styles = StyleSheet.create({
  page: { gap: space.gapMd, paddingTop: space.gapSm },
  cell: { flex: 1, gap: 4 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radii.glyphTile + 3, paddingHorizontal: 12 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd, paddingVertical: 10 },
  valueLabel: { flex: 1 },
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: 4 },
});
