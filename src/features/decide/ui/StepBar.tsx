/** UI-SPEC Check flow shell: the five-segment step bar. Reached steps are tappable; steps past
 * `furthest` are disabled; a reached step that fails `canEnter` (steps 3+ need steps 1-2 done, D-08)
 * reports through `onBlocked` instead of jumping. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { hapticSelection } from '@/ui/haptics';
import type { StepNumber } from '../check/stepTypes';

const STEPS: readonly StepNumber[] = [1, 2, 3, 4, 5];
const SEGMENT_HEIGHT = 4; // UI-SPEC step bar segment thickness
const SEGMENT_GAP = 6; // UI-SPEC step bar segment gap

export interface StepBarProps {
  current: StepNumber;
  furthest: StepNumber;
  titles: readonly [string, string, string, string, string];
  canEnter: (step: StepNumber) => boolean;
  onJump: (step: StepNumber) => void;
  onBlocked?: (step: StepNumber) => void;
}

export function StepBar({ current, furthest, titles, canEnter, onJump, onBlocked }: StepBarProps) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {STEPS.map((step) => {
        const reached = step <= furthest;
        const press = () => {
          if (!reached) return;
          hapticSelection();
          if (canEnter(step)) onJump(step);
          else onBlocked?.(step);
        };
        return (
          <Pressable
            key={step}
            accessibilityRole="button"
            accessibilityLabel={t('decide.flow.stepA11y', { n: step, title: titles[step - 1] ?? '' })}
            accessibilityState={{ disabled: !reached, selected: step === current }}
            disabled={!reached}
            onPress={press}
            style={styles.hit}
          >
            <View
              testID={`step-segment-${step}`}
              style={[styles.segment, { backgroundColor: reached ? colors.ink : colors.line3 }]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SEGMENT_GAP },
  hit: { flex: 1, minHeight: space.touchMin, justifyContent: 'center' },
  segment: { height: SEGMENT_HEIGHT, borderRadius: SEGMENT_HEIGHT / 2 },
});
