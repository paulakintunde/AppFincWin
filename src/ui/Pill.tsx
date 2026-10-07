/**
 * UI-SPEC Design System: the shared pill primitive reused for entry-sheet primary CTAs,
 * status toggles, filter actions and ConfirmSheet's two actions. Variants: 'primary'
 * (accent background, surface text), 'secondary' (fill1 background, ink text), 'danger'
 * (danger text on dangerTint1). A 'selected' pill gets an accent border. Colour and size
 * are resolved only through the theme/layout tokens (DSG-02).
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export type PillVariant = 'primary' | 'secondary' | 'danger';

export interface PillProps {
  label: string;
  variant: PillVariant;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Pill({ label, variant, selected = false, disabled = false, onPress, accessibilityLabel, accessibilityHint }: PillProps) {
  const { colors, pairing } = useTheme();

  const backgroundColor =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.dangerTint1 : colors.fill1;
  const textColor = variant === 'primary' ? colors.surface : variant === 'danger' ? colors.danger : colors.ink;
  const borderColor = selected ? colors.accent : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pill, { backgroundColor, borderColor, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: textColor }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: space.touchMin,
    paddingVertical: space.pillPadV,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
