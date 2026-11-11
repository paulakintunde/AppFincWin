// 06.1-18 (D-17): the padlock that opens or closes once (220 ms) when the safety net is unlocked or locked. react-native-svg plus
// Reanimated, no Lottie. The shackle lifts and swings about its left foot; the body stays put. It runs only on a change of `locked`,
// never on first draw, and with Reduce Motion the end state is drawn at once. The glyph is a shape: no text lives in it.
import React, { useEffect, useRef } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';

const AnimatedG = Animated.createAnimatedComponent(G);

const SOFT = 0.45;
const STROKE = 2;
// How far the open shackle lifts (viewBox units) and swings (degrees) about its left foot.
const LIFT = 1.6;
const SWING = -28;
const FOOT_X = 7;
const FOOT_Y = 9.5;

export interface LockGlyphAnimatedProps {
  locked: boolean;
  color: string;
  size?: number;
  testID?: string;
}

export function LockGlyphAnimated({ locked, color, size = 28, testID }: LockGlyphAnimatedProps): React.JSX.Element {
  const reduced = useReduceMotion();
  // 0 = closed (locked), 1 = open (unlocked). The first value is the end state, so a first draw never animates.
  const open = useSharedValue(locked ? 0 : 1);
  const shown = useRef(locked);
  useEffect(() => {
    if (shown.current === locked) return; // nothing changed (first draw, or a re-render): no motion
    shown.current = locked;
    const to = locked ? 0 : 1;
    open.value = reduced ? to : withTiming(to, { duration: DURATION.entrance, easing: EASING });
  }, [locked, reduced, open]);
  const shackle = useAnimatedProps(() => ({
    rotation: open.value * SWING,
    originX: FOOT_X,
    originY: FOOT_Y,
    y: -open.value * LIFT,
  }));
  const line = { fill: 'none', stroke: color, strokeWidth: STROKE, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 22 22" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={4} y={9.5} width={14} height={9.5} rx={2.6} fill={color} opacity={SOFT} />
      <AnimatedG animatedProps={shackle}>
        <Path d="M7 9.5V7.2a4 4 0 0 1 8 0v2.3" {...line} />
      </AnimatedG>
      <Circle cx={11} cy={14.2} r={1.3} fill={color} />
    </Svg>
  );
}
