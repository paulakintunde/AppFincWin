// 06-09: Grow's progress bar. Thin (4) for list rows, thick (8) for hero figures. Fill is drawn in 0.55 s on first view only;
// with Reduce Motion it is drawn at its final width at once. Never the only signal: the owning row carries the words.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { categorySwatch } from '@/theme/tokens';

export type ProgressTone = 'accent' | 'blue' | 'ink';

export interface ProgressBarProps {
  /** Whole percent, clamped to 0..100. */
  percent: number;
  variant?: 'thin' | 'thick';
  tone?: ProgressTone;
  /** Draws from empty on mount. Screens pass false after the first view. */
  animate?: boolean;
  accessibilityLabel?: string;
  /** Optional tick (0..100), e.g. the 36 rule on the debt-payments bar. */
  tickPercent?: number;
}

export const PROGRESS_HEIGHT = { thin: 4, thick: 8 } as const;

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

export function ProgressBar({ percent, variant = 'thin', tone = 'accent', animate = true, accessibilityLabel, tickPercent }: ProgressBarProps) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const now = clampPercent(percent);
  const width = useSharedValue(animate && !reduced ? 0 : now);
  useEffect(() => {
    width.value = animate && !reduced ? withTiming(now, { duration: DURATION.progress, easing: EASING }) : now;
  }, [now, animate, reduced, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const height = PROGRESS_HEIGHT[variant];
  const fill = tone === 'blue' ? categorySwatch.blue.color : tone === 'ink' ? colors.ink : colors.accent;
  return (
    <View
      testID="grow-progress"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: colors.fill1 }]}
    >
      <Animated.View testID="grow-progress-fill" style={[styles.fill, { height, borderRadius: height / 2, backgroundColor: fill }, fillStyle]} />
      {tickPercent !== undefined ? (
        <View testID="grow-progress-tick" style={[styles.tick, { left: `${clampPercent(tickPercent)}%`, backgroundColor: colors.ink }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', borderRadius: radii.pill },
  fill: { position: 'absolute', left: 0, top: 0 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2 },
});
