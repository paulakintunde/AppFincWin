// 06-21: put-in vs growth bars. Each bar stacks the amount put in (inkMuted) under the growth (accent). Legend from props,
// one chart-level label carrying the end figure and the put-in amount. Drawn once; no animation. Tokens only.
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface BarDatum {
  key: string;
  /** Minor units put in. */
  putIn: number;
  /** Minor units of growth on top. */
  growth: number;
}

export interface BarChartProps {
  bars: readonly BarDatum[];
  putInLegend: string;
  growthLegend: string;
  /** Includes the end figure and the put-in amount. */
  accessibilityLabel: string;
  height?: number;
}

const DEFAULT_WIDTH = 330;
const GAP = 6;
const SWATCH = 10;

export function BarChart({ bars, putInLegend, growthLegend, accessibilityLabel, height = 140 }: BarChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  if (bars.length === 0) return null;
  const top = Math.max(...bars.map((b) => Math.max(0, b.putIn) + Math.max(0, b.growth)), 1);
  const barW = Math.max(2, (width - GAP * (bars.length - 1)) / bars.length);
  return (
    <View
      testID="bar-chart"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
    >
      <Svg width={width} height={height} importantForAccessibility="no-hide-descendants">
        {bars.map((b, i) => {
          const x = i * (barW + GAP);
          const putH = (Math.max(0, b.putIn) * height) / top;
          const growH = (Math.max(0, b.growth) * height) / top;
          return (
            <React.Fragment key={b.key}>
              <Rect testID={`bar-putin-${b.key}`} x={x} y={height - putH} width={barW} height={putH} fill={colors.inkMuted} />
              <Rect testID={`bar-growth-${b.key}`} x={x} y={height - putH - growH} width={barW} height={growH} fill={colors.accent} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.legend} importantForAccessibility="no" accessibilityElementsHidden>
        <View style={styles.item}>
          <View style={[styles.swatch, { backgroundColor: colors.inkMuted }]} />
          <Text style={{ fontSize: fontSize.meta, color: colors.inkMuted }}>{putInLegend}</Text>
        </View>
        <View style={styles.item}>
          <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
          <Text style={{ fontSize: fontSize.meta, color: colors.inkMuted }}>{growthLegend}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: space.gapMd, marginTop: space.gapSm, flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: 2 },
});
