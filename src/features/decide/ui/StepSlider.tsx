/**
 * UI-SPEC Design System: Slider row (Step 2 deposit, Step 4 cheaper ratio, Step 5 wait amount).
 * Accessible adjustable slider: every value handed to onChange is min + k x step, so a money
 * slider passes minor-unit steps. No slider package; a Gesture.Pan snaps to the step.
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

/** Snaps v to min + k x step within [min, max]. */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  const steps = Math.round((v - min) / step);
  const maxSteps = Math.floor((max - min) / step);
  const k = Math.min(Math.max(steps, 0), maxSteps);
  return min + k * step;
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

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .onBegin((e) => fromX(e.x))
    .onUpdate((e) => fromX(e.x));

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    const dir = name === 'increment' ? 1 : name === 'decrement' ? -1 : 0;
    if (dir === 0) return;
    commit(snapToStep(value + dir * step, min, max, step));
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
      <GestureDetector gesture={pan}>
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
