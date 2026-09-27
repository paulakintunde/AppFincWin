/**
 * UI-SPEC Design System: the shared filter chip -- fill1 inactive, accentTint1
 * background + accent text when selected. Used by Activity's filter row and any other
 * multi-choice filter surface in Record.
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Chip({ label, selected = false, onPress, accessibilityLabel }: ChipProps) {
  const { colors, pairing } = useTheme();
  const backgroundColor = selected ? colors.accentTint1 : colors.fill1;
  const textColor = selected ? colors.accent : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={[styles.chip, { backgroundColor }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: textColor }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: space.touchMin,
    paddingHorizontal: space.gapMd,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
