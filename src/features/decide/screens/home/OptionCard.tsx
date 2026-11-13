// 06.1-58 (A-SH-3, D50, D53): the prototype's radio options: one grouped card, rows split by a hairline rule, the chosen row drawn
// with the accent tint (the picked accent at ACCENT_TINT_OPACITY, as Chip and StateBadge draw it) as well as the filled dot, so the
// choice never rests on colour alone. Radio rows choose in place, so they carry no chevron; rows that open something do.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { RadioDot } from '@/ui/RadioDot';
import { Text } from '@/ui/Text';

export function OptionCard({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
      {children}
    </View>
  );
}

export interface OptionRowProps {
  title: string;
  sub?: string | null;
  /** A figure at the right (a bill's amount). */
  right?: string | null;
  selected: boolean;
  onPress: () => void;
  /** The first row draws no rule above it. */
  first?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function OptionRow({ title, sub = null, right = null, selected, onPress, first = false, disabled = false, accessibilityLabel, testID }: OptionRowProps) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line2 }, { opacity: disabled ? 0.4 : 1 }]}
    >
      {selected ? <View testID={testID === undefined ? undefined : `${testID}-tint`} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY }]} /> : null}
      <RadioDot selected={selected} />
      <View style={styles.grow}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{title}</Text>
        {sub === null ? null : <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>}
      </View>
      {right === null ? null : <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{right}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1.5, overflow: 'hidden' },
  row: { minHeight: space.touchMin, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  grow: { flex: 1, gap: 2 },
});
