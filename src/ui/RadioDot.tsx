import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

// Component geometry, as Dropdown's DOT_SIZE / DOT_INNER.
const RING = 18;
const FILL = 8;

/** Decorative selection dot; the owning Row carries the selected state. */
export function RadioDot({ selected }: { selected: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      testID="radio-dot"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.radio, { borderColor: selected ? colors.accent : colors.inkFaint }]}
    >
      {selected ? (
        <View testID="radio-dot-fill" style={[styles.radioFill, { backgroundColor: colors.accent }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  radio: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: { width: FILL, height: FILL, borderRadius: FILL / 2 },
});
