/**
 * UI-SPEC Design System: Slider row (Step 2 deposit, Step 4 cheaper ratio, Step 5 wait amount).
 * Accessible adjustable slider: every value handed to onChange is min + k x step, or max itself (WR-D06: the one value
 * allowed off the grid, so a price that is not a multiple of the step can still be reached), so a money slider passes
 * minor-unit steps. No slider package; a Gesture.Pan snaps to the step.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { hapticSelection } from '@/ui/haptics';

/** UI-SPEC slider: 4px track, 28px visual thumb inside a 44px hit area. */
const TRACK_HEIGHT = 4;
const THUMB_SIZE = 28;

export interface StepSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** Spoken value, e.g. "20 percent". */
  valueText?: string;
}

/**
 * Snaps v to min + k x step within [min, max], or to max when v is nearer max than the last grid point below it
 * (WR-D06). A step that is not above zero, or an empty range, gives min rather than NaN or Infinity.
 */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  if (!(step > 0) || !(max > min)) return min;
  const maxSteps = Math.floor((max - min) / step);
  const last = min + maxSteps * step;
  if (last < max && v >= (last + max) / 2) return max;
  const k = Math.min(Math.max(Math.round((v - min) / step), 0), maxSteps);
  return min + k * step;
}

/** One notch up or down from value: the next grid point (or max past the last one), never skipping one. */
export function stepFrom(value: number, dir: 1 | -1, min: number, max: number, step: number): number {
  if (!(step > 0)) return min;
  const at = (value - min) / step;
  const k = dir > 0 ? Math.floor(at) + 1 : Math.ceil(at) - 1;
  return snapToStep(min + k * step, min, max, step);
}

export function StepSlider({ value, min, max, step, onChange, accessibilityLabel, valueText }: StepSliderProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const span = max - min;
  const frac = span > 0 ? Math.min(Math.max((value - min) / span, 0), 1) : 0;

  const commit = useCallback(
    (next: number) => {
      if (next === value) return;
      hapticSelection();
      onChange(next);
    },
    [onChange, value],
  );

  const fromX = useCallback(
    (x: number) => {
      if (width <= 0 || span <= 0) return;
      // UI position to value; the result is snapped so it is always min + k x step.
      const raw = min + (Math.min(Math.max(x, 0), width) / width) * span;
      commit(snapToStep(raw, min, max, step));
    },
    [width, span, min, max, step, commit],
  );

  // WR-D02: nothing moves on touch-down. The value follows the finger only once the pan is horizontal (a vertical scroll
  // that lands on the row fails it), and a plain tap sets the touched value.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-10, 10])
    .withTestId('step-slider-pan')
    .onStart((e) => fromX(e.x))
    .onUpdate((e) => fromX(e.x));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(10)
    .withTestId('step-slider-tap')
    .onEnd((e, success) => {
      if (success) fromX(e.x);
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    const dir = name === 'increment' ? 1 : name === 'decrement' ? -1 : 0;
    if (dir === 0) return;
    commit(stepFrom(value, dir, min, max, step));
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.hit}>
          <View style={[styles.track, { backgroundColor: colors.line3 }]}>
            <View style={[styles.fill, { backgroundColor: colors.accent, width: `${frac * 100}%` }]} />
          </View>
          <View
            pointerEvents="none"
            style={[styles.thumb, { backgroundColor: colors.accent, left: frac * width - THUMB_SIZE / 2 }]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: space.touchMin, justifyContent: 'center' },
  track: { height: TRACK_HEIGHT, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: TRACK_HEIGHT },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: (space.touchMin - THUMB_SIZE) / 2,
  },
});
