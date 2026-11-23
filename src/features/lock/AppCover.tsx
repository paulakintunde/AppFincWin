// 10-21 (DSG-08, D-04): the app-switcher cover. The page tint and the FincWin mark, nothing else: no text, no numbers,
// no blur, no gradient. Shown whenever the app is inactive or in the background, even with the lock off.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { BrandMark } from './BrandMark';

export function AppCover({ visible }: { visible: boolean }): React.JSX.Element | null {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <View
      testID="app-cover"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.canvas }]}
    >
      <BrandMark />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
});
