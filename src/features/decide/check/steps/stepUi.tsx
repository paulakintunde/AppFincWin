/**
 * 05-14: small presentational pieces shared by steps 1 and 2 (white card, label, text box, money formatting).
 * No engine imports beyond the money brand; nothing here decides anything.
 */
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { ReadOnlyScope, useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { minorUnits } from '@/engine/money';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { CurrencyCode } from '@/engine/decide';

/** A minor-unit formatter bound to one currency. */
export type Money = (minor: number) => string;

export function moneyFn(f: MoneyFormatter, currency: CurrencyCode): Money {
  return (n) => f.formatMoney({ amount: minorUnits(n), currency });
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface }, shadows.card, style]}>{children}</View>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  const { colors, pairing } = useTheme();
  return (
    <Text
      style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}
    >
      {children}
    </Text>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{children}</Text>;
}

export function Meta({ children, tone = 'faint' }: { children: React.ReactNode; tone?: 'faint' | 'muted' | 'danger' | 'accent' | 'warn' }) {
  const { colors, pairing } = useTheme();
  const color =
    tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : tone === 'warn' ? colors.warn1 : tone === 'muted' ? colors.inkMuted : colors.inkFaint;
  return <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color }}>{children}</Text>;
}

export interface BoxProps {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  numeric?: boolean;
  readOnly?: boolean;
  role?: 'body' | 'sheetTitle' | 'heading';
  onBlur?: () => void;
}

/** A filled text box (fill6, 16 radius, 44 high); read-only renders the same box with editing off. */
export function Box({ value, onChangeText, accessibilityLabel, placeholder, maxLength, multiline = false, numeric = false, readOnly = false, role = 'body', onBlur }: BoxProps) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.fill6 }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        maxLength={maxLength}
        multiline={multiline}
        numberOfLines={multiline ? 2 : 1}
        inputMode={numeric ? 'numeric' : undefined}
        editable={!readOnly}
        style={[styles.input, multiline && styles.multi, { ...textRole(pairing, role), color: colors.ink }]}
      />
    </View>
  );
}

/**
 * Wraps a control so a decided (read-only) check cannot edit it. The region is a ReadOnlyScope: every control inside
 * (inputs, chips, pills, switches, radio cards, check rows, sliders, pickers) is announced disabled and ignores touch and
 * a screen reader's activation, while labels stay readable. D-70: the region does not block touch itself, because that
 * would also block the ⓘ buttons, which explain a term on a decided check too.
 */
export function Lock({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  const outer = useReadOnlyScope();
  return (
    <ReadOnlyScope.Provider value={locked || outer}>
      <View style={locked ? styles.locked : undefined}>{children}</View>
    </ReadOnlyScope.Provider>
  );
}

const READ_ONLY_OPACITY = 0.6; // same dimming idea as a disabled Pill (0.5), a little lighter for read-only content

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  box: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
  multi: { minHeight: 72, textAlignVertical: 'top', paddingTop: space.gapMd },
  locked: { opacity: READ_ONLY_OPACITY },
});
