// 06.1-39 (D-17, D38): the setup-done tick. One stroke drawn once over 800 ms with react-native-svg plus Reanimated, no Lottie.
// With Reduce Motion the tick is drawn at once. The tick is a shape: no text lives in it.
import React, { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { EASING_CURVE, useReduceMotion } from '@/theme/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** D-17: the tick draws in 0.8 s. */
export const TICK_DRAW_MS = 800;
// The stroke's length in viewBox units (12.7 + 24.8, rounded up), used as the dash length.
const TICK_LENGTH = 40;
const STROKE = 3.5;

/** How much of the tick is drawn on first paint: all of it under Reduce Motion, none otherwise (the draw then runs). */
export function tickStartProgress(reduced: boolean): number {
  return reduced ? 1 : 0;
}

export interface TickDrawAnimatedProps {
  color: string;
  size?: number;
  testID?: string;
}

export function TickDrawAnimated({ color, size = 96, testID }: TickDrawAnimatedProps): React.JSX.Element {
  const reduced = useReduceMotion();
  // 0 = not drawn, 1 = drawn. With Reduce Motion the first value is the end state.
  const drawn = useSharedValue(tickStartProgress(reduced));
  useEffect(() => {
    if (reduced) {
      drawn.value = 1;
      return;
    }
    drawn.value = withTiming(1, { duration: TICK_DRAW_MS, easing: Easing.bezier(...EASING_CURVE) });
  }, [reduced, drawn]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: TICK_LENGTH * (1 - drawn.value) }));
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AnimatedPath
        testID={testID ? `${testID}-stroke` : undefined}
        d="M12 25L21 34L37 15"
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${TICK_LENGTH} ${TICK_LENGTH}`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
