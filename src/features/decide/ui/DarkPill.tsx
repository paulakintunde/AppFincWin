/**
 * D-95 (R17.3): the pill used on the dark card. 'solid' is a surface fill with ink text (the one primary action, because
 * every accent fails 3:1 on ink); 'tint' is surface at .12 over the ink card with surface text (secondary actions).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { SURFACE_ON_INK_OPACITY } from '@/ui/Chip';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface DarkPillProps {
  label: string;
  onPress?: () => void;
  variant: 'solid' | 'tint';
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Fill the row (the "Run the full check" button). */
  grow?: boolean;
  minHeight?: number;
}

export function DarkPill({ label, onPress, variant, accessibilityLabel, disabled = false, grow = false, minHeight = space.touchMin }: DarkPillProps) {
  const { colors, pairing } = useTheme();
  const solid = variant === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        grow && styles.grow,
        { minHeight, backgroundColor: solid ? colors.surface : 'transparent', opacity: disabled ? 0.5 : pressed ? PRESSED_OPACITY : 1 },
      ]}
    >
      {solid ? null : (
        <View
          testID="dark-pill-tint"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
        />
      )}
      <Text style={{ ...textRole(pairing, 'label'), color: solid ? colors.ink : colors.surface }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grow: { flex: 1 },
});
