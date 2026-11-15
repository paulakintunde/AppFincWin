/**
 * 06.2 D-15 / D-16: a soft value swap. When `value` changes, the child dips to 0.35 opacity and comes back to 1 over
 * DURATION.swap. No count-up, no spinning numbers, no movement; nothing on first mount. The lowest opacity is 0.35,
 * never 0, so the new value is readable throughout. With Reduce Motion on, the swap lasts DURATION.press (D-17).
 */
import React, { useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASING, useMotion } from '@/theme/motion';

export const SWAP_FROM_OPACITY = 0.35;

export interface FadeSwapProps {
  value: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function FadeSwap({ value, children, style, testID }: FadeSwapProps) {
  const motion = useMotion();
  // Older suites mock useMotion without `fade`; fall back to the same rule.
  const fade = motion.fade ?? ((ms: number) => (motion.reduced ? DURATION.press : ms));
  const opacity = useSharedValue(1);
  const last = useRef(value);
  const duration = fade(DURATION.swap);

  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    opacity.value = SWAP_FROM_OPACITY;
    opacity.value = withTiming(1, { duration, easing: EASING, reduceMotion: ReduceMotion.Never });
  }, [value, duration, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[style, animated]} testID={testID}>
      {children}
    </Animated.View>
  );
}
