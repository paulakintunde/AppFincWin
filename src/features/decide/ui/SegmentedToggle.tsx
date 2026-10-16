/** UI-SPEC Quick check toggle: a radiogroup of 44px segments. Selected is ink on surface text
 * (surface on ink when dark). */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';

export interface SegmentOption {
  key: string;
  label: string;
  a11yLabel?: string;
}

export interface SegmentedToggleProps {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  accessibilityLabel: string;
  dark?: boolean;
}

export function SegmentedToggle({ options, value, onChange, accessibilityLabel, dark = false }: SegmentedToggleProps) {
  const { colors, pairing } = useTheme();
  const selectedBg = dark ? colors.surface : colors.ink;
  const selectedText = dark ? colors.ink : colors.surface;
  const idleText = dark ? colors.inkSoft1 : colors.inkDim;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.row, { backgroundColor: dark ? colors.inkDim : colors.fill1 }]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.a11yLabel ?? option.label}
            onPress={() => {
              if (selected) return;
              hapticSelection();
              onChange(option.key);
            }}
            style={[styles.segment, { backgroundColor: selected ? selectedBg : 'transparent' }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: selected ? selectedText : idleText }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: radii.pill, padding: 2 },
  segment: {
    flex: 1,
    height: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: space.gapMd,
  },
});
