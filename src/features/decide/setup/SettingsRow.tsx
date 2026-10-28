/**
 * Plan 05.2-34 (UI-SPEC "Decide settings"): one settings row. Label (sheetTitle), value (body, inkDim, wraps), the effect
 * line (s13_5, inkMuted, wraps, never truncated) and a decorative chevron. Unanswered: "Not set" (inkMuted); a needed
 * one also says "Needed" (label, warn1) in words, so colour never carries it alone. At least 64 high, and tall enough at
 * large text because nothing is clipped.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

const ROW_MIN_HEIGHT = 64;

export interface SettingsRowProps {
  label: string;
  /** The value text, or null when the answer is not set. */
  value: string | null;
  notSetLabel: string;
  effect: string;
  needed: boolean;
  neededLabel: string;
  onPress: () => void;
  /** The screen-reader label; defaults to "label, value". */
  accessibilityLabel?: string;
}

export function SettingsRow({ label, value, notSetLabel, effect, needed, neededLabel, onPress, accessibilityLabel }: SettingsRowProps) {
  const { colors, pairing } = useTheme();
  const shown = value ?? notSetLabel;
  const spoken = accessibilityLabel ?? [label, shown, needed ? neededLabel : null, effect].filter((x): x is string => x !== null).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{label}</Text>
        <View style={styles.valueLine}>
          <Text style={[styles.value, { ...textRole(pairing, 'body'), color: value === null ? colors.inkMuted : colors.inkDim }]}>{shown}</Text>
          {needed ? <Text style={{ ...textRole(pairing, 'label'), color: colors.warn1 }}>{neededLabel}</Text> : null}
        </View>
        <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkMuted }}>{effect}</Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: colors.inkFaint }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: ROW_MIN_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.rowPad },
  text: { flex: 1, gap: 2 },
  valueLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.gapMd },
  value: { flexShrink: 1 },
  chevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
