/**
 * Plan 05.2-23 / 05.2-50: the five-segment section rail. Decoration only: hidden from assistive tech (the header text
 * carries "Section {n} of 5, {name}"). Passed sections and the current one are accent, later ones line3; on the Summary
 * (`complete`) all five are accent. A fill is a static accent View, never an animated opacity value (F-01); when it
 * first mounts it may fade in once through a layout `entering` animation. Reduced motion draws it at once.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RISE_IN_ANIMATED } from '@/features/decide/ui/RiseIn';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useMotion } from '@/theme/motion';
import type { SetupSection } from './setupFlow';

export const SETUP_SECTIONS: readonly SetupSection[] = ['income', 'regular', 'spending', 'money', 'answers'];
const SEGMENT_HEIGHT = 4;
const SEGMENT_GAP = 8;

export function SetupRail({
  current,
  complete = false,
  hidden = false,
  animated = RISE_IN_ANIMATED,
}: {
  current: SetupSection | null;
  /** The Summary: every section is done. */
  complete?: boolean;
  hidden?: boolean;
  /** Defaults to RISE_IN_ANIMATED; a prop so both branches are testable. */
  animated?: boolean;
}) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const index = current === null ? -1 : SETUP_SECTIONS.indexOf(current);
  const filled = complete ? SETUP_SECTIONS.length - 1 : index;
  const animate = animated && !reduced;

  if (hidden) return null;
  return (
    <View testID="setup-rail" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.row}>
      {SETUP_SECTIONS.map((section, i) => {
        const fillStyle = [StyleSheet.absoluteFill, { backgroundColor: colors.accent }];
        return (
          <View key={section} testID={`rail-segment-${i + 1}`} style={[styles.segment, { backgroundColor: colors.line3 }]}>
            {i > filled ? null : animate ? (
              <Animated.View testID={`rail-fill-${i + 1}`} style={fillStyle} entering={FadeIn.duration(DURATION.progress)} />
            ) : (
              <View testID={`rail-fill-${i + 1}`} style={fillStyle} />
            )}
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
