// 06-21: value-over-time line. One path through the points (integer minor units, scaled to the box), a dot for a single
// point, nothing for none. One chart-level label (which carries the end value). Drawn once; no animation. Tokens only.
import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

export interface LineChartProps {
  points: readonly number[];
  accessibilityLabel: string;
  height?: number;
}

const DEFAULT_WIDTH = 330;
const PAD = 8;
const LINE_WIDTH = 2;

export function linePath(points: readonly number[], width: number, height: number): string {
  if (points.length < 2) return '';
  const min = Math.min(...points, 0);
  const max = Math.max(...points);
  const span = max - min || 1;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  return points
    .map((v, i) => {
      const x = PAD + (innerW * i) / (points.length - 1);
      const y = PAD + innerH - (innerH * (v - min)) / span;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function LineChart({ points, accessibilityLabel, height = 140 }: LineChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  if (points.length === 0) return null;
  const only = points[0] ?? 0;
  return (
    <View
      testID="line-chart"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
    >
      <Svg width={width} height={height} importantForAccessibility="no-hide-descendants">
        <Line x1={PAD} x2={width - PAD} y1={height - PAD} y2={height - PAD} stroke={colors.line3} strokeWidth={1} />
        {points.length === 1 ? (
          <Circle testID="line-chart-dot" cx={PAD} cy={height - PAD - (only > 0 ? height - PAD * 2 : 0)} r={4} fill={colors.accent} />
        ) : (
          <Path testID="line-chart-path" d={linePath(points, width, height)} stroke={colors.accent} strokeWidth={LINE_WIDTH} fill="none" />
        )}
      </Svg>
    </View>
  );
}
