// 06.1-18 (D-17): the padlock that opens or closes once (220 ms) when the safety net is unlocked or locked. react-native-svg plus
// Reanimated, no Lottie. It runs only on a change of `locked`, never on first draw, and with Reduce Motion the end state is drawn at
// once. The glyph is a shape: no text lives in it.
// 06.1-58 (A-SN-1, T-06.1-58-01): the device showed an OPEN padlock while the net was locked, because the shackle's state lived only
// in an animated rotation. The shape is now chosen from `locked` itself: a closed shackle (both feet in the body) when locked, an
// open one (lifted, left foot out) when unlocked, each with its own testID. The motion only fades the new shackle in, so whatever
// the animation does, the drawn shape always matches the state.
import React, { useEffect, useRef } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';

const AnimatedG = Animated.createAnimatedComponent(G);

const SOFT = 0.45;
const STROKE = 2;
/** Both feet in the body. */
export const CLOSED_SHACKLE = 'M7 9.5V7.2a4 4 0 0 1 8 0v2.3';
/** Lifted: the right foot stays in the body, the left foot stands clear of it. */
export const OPEN_SHACKLE = 'M15 9.5V5.7a4 4 0 0 0-8 0v1';

export interface LockGlyphAnimatedProps {
  locked: boolean;
  color: string;
  size?: number;
  testID?: string;
}

export function LockGlyphAnimated({ locked, color, size = 28, testID }: LockGlyphAnimatedProps): React.JSX.Element {
  const reduced = useReduceMotion();
  // 1 = the shackle fully drawn. The first value is the end state, so a first draw never animates.
  const shown = useSharedValue(1);
  const last = useRef(locked);
  useEffect(() => {
    if (last.current === locked) return; // nothing changed (first draw, or a re-render): no motion
    last.current = locked;
    if (reduced) {
      shown.value = 1;
      return;
    }
    shown.value = 0;
    shown.value = withTiming(1, { duration: DURATION.entrance, easing: EASING });
  }, [locked, reduced, shown]);
  const shackle = useAnimatedProps(() => ({ opacity: shown.value }));
  const line = { fill: 'none', stroke: color, strokeWidth: STROKE, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const id = testID ?? 'lock-glyph';
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 22 22" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={4} y={9.5} width={14} height={9.5} rx={2.6} fill={color} opacity={SOFT} />
      <AnimatedG animatedProps={shackle}>
        {locked ? <Path testID={`${id}-closed`} d={CLOSED_SHACKLE} {...line} /> : <Path testID={`${id}-open`} d={OPEN_SHACKLE} {...line} />}
      </AnimatedG>
      <Circle cx={11} cy={14.2} r={1.3} fill={color} />
    </Svg>
  );
}
