// 06-21: allocation bar. One row of segments whose whole-percent widths sum to 100, a legend line from props and one
// chart-level label. Drawn once with react-native-svg; no animation. Tokens only (categorySwatch).
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { categorySwatch, type CategorySwatchKey } from '@/theme/tokens';
import { fontSize } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface StackedSegment {
  key: string;
  value: number;
  swatch: CategorySwatchKey;
}

export interface StackedBarProps {
  segments: readonly StackedSegment[];
  /** Legend text, e.g. "Retirement 84% · Brokerage 16%". */
  legend: string;
  accessibilityLabel: string;
}

export const STACKED_BAR_HEIGHT = 14;
const DEFAULT_WIDTH = 330;

/** Largest-remainder rounding so the whole-percent shares always sum to exactly 100. */
export function wholePercents(values: readonly number[]): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return clean.map(() => 0);
  const exact = clean.map((v) => (v * 100) / total);
  const floors = exact.map((e) => Math.floor(e));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

export function StackedBar({ segments, legend, accessibilityLabel }: StackedBarProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const percents = wholePercents(segments.map((s) => s.value));
  const offsets = percents.map((_, i) => percents.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <View
      testID="stacked-bar"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
    >
      <View style={{ width, height: STACKED_BAR_HEIGHT, borderRadius: radii.pill, overflow: 'hidden' }}>
      <Svg width={width} height={STACKED_BAR_HEIGHT} importantForAccessibility="no-hide-descendants">
        <Rect x={0} y={0} width={width} height={STACKED_BAR_HEIGHT} fill={colors.fill1} />
        {segments.map((s, i) => {
          const w = ((percents[i] ?? 0) * width) / 100;
          const x = ((offsets[i] ?? 0) * width) / 100;
          return (
            <Rect key={s.key} testID={`stacked-seg-${s.key}`} x={x} y={0} width={w} height={STACKED_BAR_HEIGHT} fill={categorySwatch[s.swatch].color} />
          );
        })}
      </Svg>
      </View>
      <Text importantForAccessibility="no" accessibilityElementsHidden style={[styles.legend, { color: colors.inkMuted }]}>
        {legend}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { marginTop: space.gapSm, fontSize: fontSize.meta },
});
