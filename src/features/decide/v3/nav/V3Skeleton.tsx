// 05.3: the loading shape for a v3 route (card-shaped bars, no text, no animation).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { radii, space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';

export function V3Skeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  return (
    <View
      accessibilityState={{ busy: true }}
      style={[styles.root, { backgroundColor: colors.canvas, paddingTop: insets.top + space.groupGap }]}
    >
      <View style={[styles.bar, styles.tall, { backgroundColor: colors.fill1 }]} />
      <View style={[styles.bar, styles.mid, { backgroundColor: colors.fill1 }]} />
      <View style={[styles.bar, styles.mid, { backgroundColor: colors.fill1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.screenH, gap: space.gapMd },
  bar: { borderRadius: radii.card },
  tall: { height: 120 },
  mid: { height: 72 },
});
