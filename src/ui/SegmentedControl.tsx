// 06.1-08: Grow/Decide segmented control. A tablist of 44 px tabs; the selected tab is surface with accent text.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';

export interface SegmentedControlOption {
  key: string;
  label: string;
  a11yLabel?: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentedControlOption[];
  value: string;
  onChange: (key: string) => void;
  accessibilityLabel: string;
}

export function SegmentedControl({ options, value, onChange, accessibilityLabel }: SegmentedControlProps) {
  const { colors, pairing } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.row, { backgroundColor: colors.fill1 }]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.a11yLabel ?? option.label}
            onPress={() => {
              if (selected) return;
              hapticSelection();
              onChange(option.key);
            }}
            style={[styles.segment, { backgroundColor: selected ? colors.surface : 'transparent' }]}
          >
            <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: selected ? colors.accent : colors.inkDim }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: radii.pill, padding: 2 },
  segment: { flex: 1, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, paddingHorizontal: space.gapMd },
});
