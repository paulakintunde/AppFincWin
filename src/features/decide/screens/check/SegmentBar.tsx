// 06.1-19 (D10, UX-41): the three-segment progress bar. 4 px bars with 4 px gaps, each inside a 44 px hit area; done segments are
// buttons that jump back. The group carries the progressbar role and a value text such as "Step 2 of 3, Price".
// 06.1-57 (A-ST-2, DB-9): each segment shows its name under the bar, as the prototype does (D10 stepBar). A done segment shows its
// crumb ("✓ Kind: Car") as visible text, and the whole column is the button that opens that step. Without onJump a done segment is
// plain text with no button role, so nothing looks tappable that does nothing.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';
import type { StepNumber } from './useStepCheck';

export interface SegmentBarProps {
  step: StepNumber;
  /** The three segment names, in order. A done segment may carry a longer name ("Kind: Car"). */
  names: readonly [string, string, string];
  /** The three visible labels: a done segment's crumb ("✓ Kind: Car"), else the plain name ("Price"). */
  labels: readonly [string, string, string];
  /** Opens a done step. Absent: done segments are not buttons. */
  onJump?: (step: StepNumber) => void;
}

const SEGMENT = 4;

export function SegmentBar({ step, names, labels, onJump }: SegmentBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const press = usePressFeedback('row');
  const text = t('decide.screens.common.a11y.stepProgress', { step, stepName: names[step - 1] ?? '' });
  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };
  return (
    <View testID="segment-bar" accessibilityRole="progressbar" accessibilityLabel={text} accessibilityValue={{ min: 1, max: 3, now: step, text }} style={styles.row}>
      {([1, 2, 3] as const).map((n) => {
        const done = n < step;
        const now = n === step;
        const inner = (
          <>
            <View style={[styles.bar, { backgroundColor: n <= step ? colors.accent : colors.fill1 }]} />
            <Text testID={done ? `crumb-${n}` : `segment-label-${n}`} style={{ ...label, fontWeight: now ? '800' : '600', color: done || now ? colors.ink : colors.inkMuted }}>
              {labels[n - 1]}
            </Text>
          </>
        );
        return done && onJump !== undefined ? (
          <Pressable
            key={n}
            testID={`segment-${n}`}
            accessibilityRole="button"
            accessibilityLabel={t('decide.screens.stepper.crumb.a11y', { step: n, name: names[n - 1] ?? '' })}
            onPress={() => onJump(n)}
            android_ripple={press.android_ripple}
            style={({ pressed }) => [styles.hit, press.pressedStyle(pressed)]}
          >
            {inner}
          </Pressable>
        ) : (
          <View key={n} testID={`segment-${n}`} style={styles.hit}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SEGMENT },
  // Labels wrap (no clamp) and the column grows; the bar sits at the top so every label starts on the same line.
  hit: { flex: 1, minWidth: 0, minHeight: space.touchMin, gap: space.gapSm, paddingTop: space.gapSm },
  bar: { minHeight: SEGMENT, borderRadius: SEGMENT / 2 },
});
