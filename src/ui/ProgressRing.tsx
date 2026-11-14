/**
 * 06.2 D-24: the shared progress ring. Two sizes: 36 (as a row tile, may hold a Glyph) and 124 (large, may hold a
 * value). The arc fills over DURATION.fill (0.55 s) on the first view in a session only (D-15, keyed by `sessionKey`);
 * every later mount, a ring with no `sessionKey`, and any ring under Reduce Motion (D-17) is drawn at its value at once.
 * D-19: nothing happens at 25/50/75%: no tick, no sound, no haptic. Reaching 100% just closes the ring; a milestone
 * icon is the caller's. The ring is one accessible progressbar; the caller supplies the spoken label
 * (appLife.grow.ringA11y, "{{percent}}% of {{target}}").
 */
import React, { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { clampPercent } from '@/ui/ProgressBar';
import { useOncePerSession as useFirstView } from '@/ui/motion/useOncePerSession';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingSize = 36 | 124;

/** Stroke width per ring size (D-24). */
export const RING_STROKE: Readonly<Record<ProgressRingSize, number>> = { 36: 4, 124: 10 };

export interface ProgressRingProps {
  /** Whole percent, clamped to 0..100. */
  percent: number;
  size?: ProgressRingSize;
  /** Arc colour; defaults to the accent. */
  color?: string;
  /** Session key: the fill sweeps only for the first mount with this key in this app session. */
  sessionKey?: string;
  /** Spoken label, e.g. appLife.grow.ringA11y. */
  accessibilityLabel: string;
  children?: ReactNode;
  testID?: string;
}

/** Ring geometry for a size: radius and circumference of the stroke's centre line. */
export function ringGeometry(size: ProgressRingSize): { stroke: number; radius: number; circumference: number } {
  const stroke = RING_STROKE[size];
  const radius = (size - stroke) / 2;
  return { stroke, radius, circumference: 2 * Math.PI * radius };
}

/** True when the arc should sweep from empty: a session key seen for the first time, with motion allowed. */
export function ringSweeps({ sessionKey, firstView, reduced }: { sessionKey?: string; firstView: boolean; reduced: boolean }): boolean {
  return sessionKey !== undefined && firstView && !reduced;
}

export function ProgressRing({ percent, size = 36, color, sessionKey, accessibilityLabel, children, testID }: ProgressRingProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  // Keyless rings never sweep, so their key is a private one that does not use up a caller's key.
  const firstView = useFirstView(sessionKey !== undefined ? `ring:${sessionKey}` : 'ring:(none)');
  const sweep = ringSweeps({ sessionKey, firstView, reduced });
  const now = clampPercent(percent);
  const { stroke, radius, circumference } = ringGeometry(size);
  const centre = size / 2;

  const drawn = useSharedValue(sweep ? 0 : now);
  useEffect(() => {
    drawn.value = sweep ? withTiming(now, { duration: DURATION.fill, easing: EASING }) : now;
    // `sweep` is fixed for this mount except when Reduce Motion resolves on, which snaps the arc to its value.
  }, [now, sweep, drawn]);
  // A round cap at 0% would still paint a dot, so an empty arc is not drawn at all.
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - drawn.value / 100),
    strokeOpacity: drawn.value > 0 ? 1 : 0,
  }));

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now }}
      style={[styles.box, { width: size, height: size }]}
    >
      <Svg
        testID="progress-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={[StyleSheet.absoluteFill, styles.rotated]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Circle testID="progress-ring-track" cx={centre} cy={centre} r={radius} stroke={colors.line2} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          testID="progress-ring-arc"
          cx={centre}
          cy={centre}
          r={radius}
          stroke={color ?? colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={arcProps}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  rotated: { transform: [{ rotate: '-90deg' }] },
});
