/**
 * UI-SPEC Design System: the shared filter chip -- fill1 inactive; selected is accent at
 * ACCENT_TINT_OPACITY over fill1 (following the picked accent) with accent text. Used by Activity's filter row and any other
 * multi-choice filter surface in Record.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { textRole } from '@/theme/typography';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Host Pressable ref, so a caller can move screen-reader focus to the chip. */
  pressableRef?: React.Ref<View>;
}

export function Chip({ label, selected = false, onPress, accessibilityLabel, pressableRef }: ChipProps) {
  const { colors, pairing } = useTheme();
    const textColor = selected ? colors.accent : colors.ink;

  return (
    <Pressable
      ref={pressableRef}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: colors.fill1 }]}
    >
      {selected ? (
        <View
          testID="accent-tint"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill },
          ]}
        />
      ) : null}
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
    overflow: 'hidden',
  },
});
