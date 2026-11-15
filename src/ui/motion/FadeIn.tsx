/**
 * 06.2 D-15 / D-17: a card or block fades in over DURATION.appear. With a `once` key it fades only on the first view
 * of this session (useOncePerSession); later mounts draw at full opacity at once.
 *
 * Built on a Reanimated layout `entering` animation, never on an animated opacity style (the 05.2 F-01 lesson in
 * RiseIn: a resting style without opacity cannot be left at 0). Content is tappable from the first frame: no
 * pointerEvents change, nothing waits for the fade (D-15). With Reduce Motion on, it is a quick plain-opacity fade of
 * DURATION.press and never moves (D-17).
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn as ReanimatedFadeIn, ReduceMotion } from 'react-native-reanimated';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { useOncePerSession } from './useOncePerSession';

export interface FadeInProps {
  /** A session key: the fade plays only for the first mount with this key in this app session. */
  once?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function FadeIn({ once, children, style, testID }: FadeInProps) {
  const motion = useMotion();
  // Older suites mock useMotion without `fade`; fall back to the same rule.
  const fade = motion.fade ?? ((ms: number) => (motion.reduced ? DURATION.press : ms));
  const first = useOncePerSession(once ?? '');
  if (once !== undefined && !first) {
    return (
      <View style={style} testID={testID}>
        {children}
      </View>
    );
  }
  // Under Reduce Motion fade() gives DURATION.press; the fade is opacity only, so it is kept (ReduceMotion.Never)
  // rather than skipped by the root ReducedMotionConfig.
  return (
    <Animated.View
      style={style}
      testID={testID}
      entering={ReanimatedFadeIn.duration(fade(DURATION.appear)).easing(EASING).reduceMotion(ReduceMotion.Never)}
    >
      {children}
    </Animated.View>
  );
}
