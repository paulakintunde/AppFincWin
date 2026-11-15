/**
 * 06.2 L02 save moment: a row saved a moment ago fades in, and its card shows a short green wash (the fits tint
 * clearing to the card's white), once. Board L02: `.lf-wash` 1.4 s with a 0.35 s hold, ease-out, fits tint -> white surface.
 * Here: the row fades in over DURATION.appear; the tint holds 0.35 s then clears over 1.0 s (inside the 1.4 s budget).
 *
 * Two parts so the tint sits under the row's text, never over it:
 *   NewRowWash   wraps the row: the fade-in, and a context that says "wash this card".
 *   WashUnderlay drawn by ActivityRow as the first child of its card, so the content paints on top of the tint.
 *
 * Nothing waits for the wash (D-15): no pointerEvents change on the row, the tint layer itself never takes touches,
 * and it is hidden from screen readers. The tint is a layer of stateColors.fits.tint whose opacity goes 1 -> 0 over
 * the card's own colors.surface, which is the same as a background moving from the tint to the surface (no new colour).
 * Reduce Motion (D-17): the row appears at once with no fade, and the tint clears with a quick plain fade of
 * DURATION.press (the root ReducedMotionConfig would already collapse the longer one; this makes it explicit).
 */
import React, { createContext, useContext, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn as ReanimatedFadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { stateColors } from '@/theme/tokens';

/** L02: the tint holds this long before it starts to clear. */
export const WASH_HOLD_MS = 350;
/** L02: how long the tint takes to clear (hold + clear stays inside the board's 1.4 s). */
export const WASH_CLEAR_MS = 1000;

const WashContext = createContext<{ reduced: boolean } | null>(null);

export interface NewRowWashProps {
  children: React.ReactNode;
  testID?: string;
}

export function NewRowWash({ children, testID = 'new-row-wash' }: NewRowWashProps) {
  const { reduced } = useMotion();
  const value = { reduced };
  if (reduced) {
    return (
      <WashContext.Provider value={value}>
        <View testID={testID}>{children}</View>
      </WashContext.Provider>
    );
  }
  return (
    <WashContext.Provider value={value}>
      <Animated.View testID={testID} entering={ReanimatedFadeIn.duration(DURATION.appear).easing(EASING)}>
        {children}
      </Animated.View>
    </WashContext.Provider>
  );
}

/** True inside a NewRowWash (a row that should draw the tint under its card). */
export function useInWash(): boolean {
  return useContext(WashContext) !== null;
}

export interface WashUnderlayProps {
  /** The card's corner radii, so the tint follows the card's shape. */
  style?: StyleProp<ViewStyle>;
}

/** The tint layer. Renders nothing outside a NewRowWash. */
export function WashUnderlay({ style }: WashUnderlayProps) {
  const wash = useContext(WashContext);
  if (wash === null) return null;
  return <WashLayer reduced={wash.reduced} style={style} />;
}

function WashLayer({ reduced, style }: { reduced: boolean; style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = reduced
      ? withTiming(0, { duration: DURATION.press, reduceMotion: ReduceMotion.Never })
      : withDelay(WASH_HOLD_MS, withTiming(0, { duration: WASH_CLEAR_MS, easing: Easing.out(Easing.ease) }));
  }, [reduced, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      testID="new-row-wash-tint"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, style, { backgroundColor: stateColors.fits.tint }, animated]}
    />
  );
}
