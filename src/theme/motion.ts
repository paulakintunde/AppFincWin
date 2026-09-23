import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing } from 'react-native-reanimated';

/** BUILD-PROMPT.md §2 standard easing: `cubic-bezier(.2,.8,.3,1)`. */
export const EASING = Easing.bezier(0.2, 0.8, 0.3, 1);

/** BUILD-PROMPT.md §2 durations, in ms: `.55s` progress bars, `.22s` entrances. */
export const DURATION = {
  entrance: 220,
  progress: 550,
  fade: 200,
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
}

export function useMotion(): Motion {
  const reduced = useReduceMotion();
  return {
    reduced,
    duration: (ms: number) => (reduced ? 0 : ms),
    easing: EASING,
  };
}
