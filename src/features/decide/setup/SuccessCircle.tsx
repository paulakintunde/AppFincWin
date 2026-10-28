/** Plan 05.2-32: the 56 dp success circle on the setup Summary (accentTint1 fill, accent check, decorative). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

const SIZE = 56;
const GLYPH = 28;

export function SuccessCircle(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { backgroundColor: colors.accentTint1 }]}
    >
      <Svg width={GLYPH} height={GLYPH} viewBox="0 0 16 16">
        <Path d="M3 8.5l3.2 3.2L13 4.8" stroke={colors.accent} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
});
