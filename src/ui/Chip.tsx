/**
 * UI-SPEC Design System: the shared filter chip -- fill1 inactive; selected is accent at
 * ACCENT_TINT_OPACITY over fill1 (following the picked accent) with accent text. Used by Activity's filter row and any other
 * multi-choice filter surface in Record.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';
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
  /** User text under Decide rule T: wrap to this many lines, then a tail ellipsis. */
  numberOfLines?: number;
  /** D-95 (R17.13): 'dark' sits on the ink card -- unselected surface at .12 with inkSoft1 text, selected a surface fill with ink text. */
  tone?: 'light' | 'dark';
}

/** UI-SPEC Color: surface at .12 over the ink card (the same derivation as the card's own controls). */
export const SURFACE_ON_INK_OPACITY = 0.12;

export function Chip({ label, selected = false, onPress, accessibilityLabel, pressableRef, numberOfLines, tone = 'light' }: ChipProps) {
  const { colors, pairing } = useTheme();
  const readOnly = useReadOnlyScope();
  const dark = tone === 'dark';
  const textColor = dark ? (selected ? colors.ink : colors.inkSoft1) : selected ? colors.accent : colors.ink;

  return (
    <Pressable
      ref={pressableRef}
      accessibilityRole="button"
      accessibilityState={readOnly ? { selected, disabled: true } : { selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={readOnly}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: dark ? (selected ? colors.surface : 'transparent') : colors.fill1 }]}
    >
      {dark && !selected ? (
        <View
          testID="dark-tint"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
        />
      ) : null}
      {!dark && selected ? (
        <View
          testID="accent-tint"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill },
          ]}
        />
      ) : null}
      <Text
        {...(numberOfLines !== undefined ? { numberOfLines, ellipsizeMode: 'tail' as const } : {})}
        style={{ ...textRole(pairing, 'label'), color: textColor }}
      >
        {label}
      </Text>
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
