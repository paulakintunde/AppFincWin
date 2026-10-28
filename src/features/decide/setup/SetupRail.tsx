/**
 * Plan 05.2-23: the five-segment section rail. Decoration only: hidden from assistive tech (the header text carries
 * "Section {n} of 5, {name}"). Passed sections and the current one are accent, later ones line3. The fill animates once
 * over DURATION.progress; reduced motion collapses it.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useMotion } from '@/theme/motion';
import type { SetupSection } from './setupFlow';

export const SETUP_SECTIONS: readonly SetupSection[] = ['income', 'regular', 'spending', 'money', 'answers'];
const SEGMENT_HEIGHT = 4;
const SEGMENT_GAP = 8;

function SegmentFill({ index, progress, color }: { index: number; progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [index - 1, index], [0, 1], Extrapolation.CLAMP) }));
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}

export function SetupRail({ current, hidden = false }: { current: SetupSection | null; hidden?: boolean }) {
  const { colors } = useTheme();
  const motion = useMotion();
  const index = current === null ? -1 : SETUP_SECTIONS.indexOf(current);
  const progress = useSharedValue(index);
  useEffect(() => {
    progress.value = withTiming(index, { duration: motion.duration(DURATION.progress), easing: Easing.bezier(0.2, 0.8, 0.3, 1) });
    // the animated value is stable; only the target matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (hidden) return null;
  return (
    <View testID="setup-rail" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.row}>
      {SETUP_SECTIONS.map((section, i) => {
        return (
          <View key={section} testID={`rail-segment-${i + 1}`} style={[styles.segment, { backgroundColor: colors.line3 }]}>
            <SegmentFill index={i} progress={progress} color={colors.accent} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SEGMENT_GAP },
  segment: { flex: 1, height: SEGMENT_HEIGHT, borderRadius: SEGMENT_HEIGHT / 2, overflow: 'hidden' },
});
