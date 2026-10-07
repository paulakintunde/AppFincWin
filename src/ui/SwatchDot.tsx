/**
 * UI-SPEC Design System: the category colour-picker dot. D-35: colours come only from
 * the 7 fixed category swatch pairs, no free colour picker.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { categorySwatch, type CategorySwatchKey } from '@/theme/tokens';

export interface SwatchDotProps {
  colorKey: CategorySwatchKey;
  selected?: boolean;
  onPress?: () => void;
}

const DOT_SIZE = 24;

export function SwatchDot({ colorKey, selected = false, onPress }: SwatchDotProps) {
  const t = useT();
  const { colors } = useTheme();
  const label = t('a11y.swatch', { colour: t(`categories.swatch.${colorKey}`) });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.touchTarget}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: categorySwatch[colorKey].color,
            borderColor: selected ? colors.accent : 'transparent',
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    width: space.touchMin,
    height: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
  },
});
