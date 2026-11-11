// 06.1-19 (D10, UX-41): the three-segment progress bar. 4 px bars with 4 px gaps, each inside a 44 px hit area; done segments are
// buttons that jump back. The group carries the progressbar role and a value text such as "Step 2 of 3, Price".
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import type { StepNumber } from './useStepCheck';

export interface SegmentBarProps {
  step: StepNumber;
  /** The three segment names, in order. A done segment may carry a longer name ("Kind: Car"). */
  names: readonly [string, string, string];
  onJump: (step: StepNumber) => void;
}

const SEGMENT = 4;

export function SegmentBar({ step, names, onJump }: SegmentBarProps) {
  const t = useT();
  const { colors } = useTheme();
  const text = t('decide.screens.common.a11y.stepProgress', { step, stepName: names[step - 1] ?? '' });
  return (
    <View testID="segment-bar" accessibilityRole="progressbar" accessibilityLabel={text} accessibilityValue={{ min: 1, max: 3, now: step, text }} style={styles.row}>
      {([1, 2, 3] as const).map((n) => {
        const done = n < step;
        const bar = <View style={[styles.bar, { backgroundColor: n <= step ? colors.accent : colors.fill1 }]} />;
        return done ? (
          <Pressable key={n} testID={`segment-${n}`} accessibilityRole="button" accessibilityLabel={names[n - 1]} onPress={() => onJump(n)} style={styles.hit}>
            {bar}
          </Pressable>
        ) : (
          <View key={n} testID={`segment-${n}`} style={styles.hit}>
            {bar}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SEGMENT },
  hit: { flex: 1, minHeight: space.touchMin, justifyContent: 'center' },
  bar: { minHeight: SEGMENT, borderRadius: SEGMENT / 2 },
});
