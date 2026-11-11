/**
 * Plan 05.2-50 (F-01): the Decide setup entrance (fw-rise). A short rise and fade on mount, built on a Reanimated layout
 * `entering` animation, never on an animated opacity style. The resting style has no opacity, so a toast, keyboard
 * close or native dialog close cannot leave the body at opacity 0. Reduced motion draws the body at once.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { DURATION, useMotion } from '@/theme/motion';

// 05.2 F-01 contingency: set false if the device still loses the step body; then RiseIn and the rail fills are plain Views
export const RISE_IN_ANIMATED = true;

const RISE_PX = 8;

export function RiseIn({
  children,
  style,
  animated = RISE_IN_ANIMATED,
  duration = DURATION.entrance,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Defaults to RISE_IN_ANIMATED; a prop so both branches are testable. */
  animated?: boolean;
  /** Milliseconds; the verdict card rises at DURATION.sheetUp (06.1-14, D-17). */
  duration?: number;
}) {
  const { reduced } = useMotion();
  if (reduced || !animated) return <View style={style}>{children}</View>;
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.duration(duration)
        .easing(Easing.bezier(0.2, 0.8, 0.3, 1))
        .withInitialValues({ opacity: 0, transform: [{ translateY: RISE_PX }] })}
    >
      {children}
    </Animated.View>
  );
}
