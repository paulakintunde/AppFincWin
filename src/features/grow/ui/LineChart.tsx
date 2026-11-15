// 06-21: value-over-time line. One path through the points (integer minor units, scaled to the box), a dot for a single
// point, nothing for none. One chart-level label (which carries the end value). Tokens only.
// 06.2-21 (D-15, Specifics: Grow): the line draws itself once per session (a stroke reveal over DURATION.fill); later views,
// and Reduce Motion, show it already drawn. No loop, no bounce, nothing moves after the reveal.
import React, { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { useOncePerSession } from '@/ui/motion/useOncePerSession';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface LineChartProps {
  points: readonly number[];
  accessibilityLabel: string;
  height?: number;
  /** Once-per-session key for the draw. Defaults to one key per chart content (its label), so each chart draws once. */
  sessionKey?: string;
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

/** The drawn length of linePath's polyline, for the stroke reveal's dash. */
export function lineLength(points: readonly number[], width: number, height: number): number {
  const d = linePath(points, width, height);
  if (d === '') return 0;
  const xy = d.split(/[ML]/).filter((p) => p !== '').map((p) => p.trim().split(' ').map(Number) as [number, number]);
  let total = 0;
  for (let i = 1; i < xy.length; i++) total += Math.hypot(xy[i]![0] - xy[i - 1]![0], xy[i]![1] - xy[i - 1]![1]);
  return Math.ceil(total);
}

export function LineChart({ points, accessibilityLabel, height = 140, sessionKey }: LineChartProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const first = useOncePerSession(sessionKey ?? `line-chart:${accessibilityLabel}`);
  // 1 = fully drawn. Only the first view in a session, with Reduce Motion off, starts at 0 and draws.
  const drawn = useSharedValue(first ? 0 : 1);
  const draws = first && !motion.reduced && points.length > 1;
  useEffect(() => {
    if (!draws) {
      drawn.value = 1;
      return;
    }
    drawn.value = withTiming(1, { duration: DURATION.fill, easing: EASING, reduceMotion: ReduceMotion.System });
  }, [draws, drawn]);
  const length = lineLength(points, width, height);
  const reveal = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.value) }));
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
          draws ? (
            <AnimatedPath
              testID="line-chart-path"
              d={linePath(points, width, height)}
              stroke={colors.accent}
              strokeWidth={LINE_WIDTH}
              fill="none"
              strokeDasharray={[length, length]}
              animatedProps={reveal}
            />
          ) : (
            <Path testID="line-chart-path" d={linePath(points, width, height)} stroke={colors.accent} strokeWidth={LINE_WIDTH} fill="none" />
          )
        )}
      </Svg>
    </View>
  );
}
