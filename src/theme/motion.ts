import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing } from 'react-native-reanimated';

/** BUILD-PROMPT.md §2 standard easing: `cubic-bezier(.2,.8,.3,1)`. */
export const EASING_CURVE = [0.2, 0.8, 0.3, 1] as const;
export const EASING = Easing.bezier(...EASING_CURVE);

/** BUILD-PROMPT.md §2 durations, in ms: `.55s` progress bars, `.22s` entrances,
 * `.26s` tab slide (fw-slideL/R) and sheet rise (fw-up), `.24s` detail push (fw-push) and drag
 * slide-out / snap-back, `.18s` backdrop fade (D-24, 03-UI-SPEC Animations),
 * `.15s` Activity search cross-fade (03.1 D-62). */
export const DURATION = {
  entrance: 220,
  progress: 550,
  fade: 200,
  tabSlide: 260,
  push: 240,
  sheetUp: 260,
  backdrop: 180,
  sheetDrag: 240,
  searchFade: 150,
  // 06.2 D-15 motion steps (the app-life timing table):
  //   press    100  press, switch, chip
  //   swap     180  fade or value swap (0.15-0.2 s)
  //   appear   240  card or sheet appears (0.22-0.26 s)
  //   fill     550  bar or ring fill, first view per session only
  //   icon    1200  animated icon (1-1.3 s), plays once
  //   toastOut 150  toast leaves (a fade, 0.15 s)
  press: 100,
  swap: 180,
  appear: 240,
  fill: 550,
  icon: 1200,
  toastOut: 150,
} as const;

/**
 * The root layout (00-17) also mounts `<ReducedMotionConfig mode={ReduceMotion.System} />`
 * from react-native-reanimated, so Reanimated worklets collapse to near-zero duration
 * globally regardless of this hook. `useMotion` exists for any duration computed in
 * plain JS (outside a worklet), which ReducedMotionConfig does not reach.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
      setReduced(value);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

export interface Motion {
  reduced: boolean;
  duration: (ms: number) => number;
  easing: typeof EASING;
  /**
   * 06.2 D-17: a fade length. With Reduce Motion on, movement becomes a quick plain-opacity fade of
   * DURATION.press; otherwise the given length.
   */
  fade: (ms: number) => number;
}

export function useMotion(): Motion {
  const reduced = useReduceMotion();
  return {
    reduced,
    duration: (ms: number) => (reduced ? 0 : ms),
    easing: EASING,
    fade: (ms: number) => (reduced ? DURATION.press : ms),
  };
}
