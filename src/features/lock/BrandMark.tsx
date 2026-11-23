// 10-21: the FincWin mark at 48 tile scale, from the artwork expo-splash-screen already uses. Decorative.
import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { radii, tile } from '@/theme/layout';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MARK = require('../../../assets/splash-icon.png') as number;

export function BrandMark(): React.JSX.Element {
  return (
    <Image
      testID="brand-mark"
      source={MARK}
      resizeMode="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.mark}
    />
  );
}

const styles = StyleSheet.create({
  mark: { width: tile.big, height: tile.big, borderRadius: radii.glyphTile },
});
