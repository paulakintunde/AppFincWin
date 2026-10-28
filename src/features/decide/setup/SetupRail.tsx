/**
 * Plan 05.2-23: the five-segment section rail. Decoration only: hidden from assistive tech (the header text carries
 * "Section {n} of 5, {name}"). Passed sections and the current one are accent, later ones line3. The fill animates once
 * over DURATION.progress; reduced motion collapses it.
 */
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useMotion } from '@/theme/motion';
import type { SetupSection } from './setupFlow';

export const SETUP_SECTIONS: readonly SetupSection[] = ['income', 'regular', 'spending', 'money', 'answers'];
const SEGMENT_HEIGHT = 4;
const SEGMENT_GAP = 8;

export function SetupRail({ current, hidden = false }: { current: SetupSection | null; hidden?: boolean }) {
  const { colors } = useTheme();
  const motion = useMotion();
  const index = current === null ? -1 : SETUP_SECTIONS.indexOf(current);
  const [progress] = useState(() => new Animated.Value(index));
  useEffect(() => {
    Animated.timing(progress, { toValue: index, duration: motion.duration(DURATION.progress), useNativeDriver: false }).start();
    // the animated value is stable; only the target matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (hidden) return null;
  return (
    <View testID="setup-rail" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.row}>
      {SETUP_SECTIONS.map((section, i) => {
        const opacity = progress.interpolate({ inputRange: [i - 1, i], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <View key={section} testID={`rail-segment-${i + 1}`} style={[styles.segment, { backgroundColor: colors.line3 }]}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.segment, { backgroundColor: colors.accent, opacity }]} />
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
