/**
 * 08.1-24 (owner caution sign, 2026-11-21): a Fits answer whose 12-month path goes below $0 later carries a caution sign before the
 * verdict word. Q1 A: one row, the caution icon, then the verdict badge (children), then "· dips below $0 on 14 Jun" in the tight
 * colour; the row wraps with large text. The icon is decorative; the words carry the meaning (never colour alone). The spoken form
 * is part of the verdict card's one summary label, so this row adds nothing for a screen reader.
 * Q4 A: two slow breaths, about 12% bigger, 0.6 s each way, starting once the card has risen in (DURATION.sheetUp), then still.
 * 06.2 D-01: a finite withSequence of withTiming steps, never withRepeat or withSpring. Scale only: no colour, opacity or haptic.
 * T-08.1-71: nothing starts until Reduce Motion is known to be off; turning it on mid-breath cancels and rests the icon at 1.
 * Q3 A: the saved view passes `still`, and the icon never moves there.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { step } from '@/theme/layout';
import { DURATION, EASING, useReduceMotionKnown } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Glyph } from '@/ui/icons/Glyph';
import { Text } from '@/ui/Text';

/** Q4 A: two breaths, 12% bigger, 600 ms each way (about 2.4 s in all). */
export const BREATHS = 2;
export const BREATH_PEAK = 1.12;
export const BREATH_MS = 600;

export interface BreathStep {
  readonly to: number;
  readonly ms: number;
}

/** The scale targets of the breathing: peak then rest, `count` times; none with Reduce Motion on. Ends at rest (1). */
export function breathSteps(count: number, reduced: boolean): readonly BreathStep[] {
  if (reduced || count <= 0) return [];
  const steps: BreathStep[] = [];
  for (let i = 0; i < count; i++) steps.push({ to: BREATH_PEAK, ms: BREATH_MS }, { to: 1, ms: BREATH_MS });
  return steps;
}

export interface CautionSignProps {
  /** The visible words after the badge, "· dips below $0 on Jun 14". */
  text: string;
  /** The saved "as checked" view: the icon never moves. */
  still?: boolean;
  /** The dip date: a changed answer breathes once more, an unchanged re-render does not. */
  animateKey?: string;
  /** The verdict badge, placed between the icon and the words. */
  children?: React.ReactNode;
}

/** The caution icon, breathing per Q4 unless still or Reduce Motion is on (or not yet known). */
export function CautionIcon({ still = false, animateKey }: { still?: boolean; animateKey?: string }) {
  const known = useReduceMotionKnown();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (known === true || still) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }
    if (known !== false) return;
    const steps = breathSteps(BREATHS, false);
    scale.value = withDelay(DURATION.sheetUp, withSequence(...steps.map((s) => withTiming(s.to, { duration: s.ms, easing: EASING }))));
  }, [known, still, animateKey, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View testID="answer-caution-icon" style={style}>
      <Glyph name="caution" size={16} color={stateColors.tight.color} />
    </Animated.View>
  );
}

/** The caution words in the tight colour. */
export function CautionWords({ text }: { text: string }) {
  const { pairing } = useTheme();
  return (
    <Text testID="answer-caution-words" scale="capped" style={{ ...textRole(pairing, 'label'), color: stateColors.tight.color }}>
      {text}
    </Text>
  );
}

/** Q1 A: icon, then the badge (children), then the words, in one wrapping row. */
export function CautionSign({ text, still = false, animateKey, children }: CautionSignProps) {
  return (
    <View testID="answer-caution" style={styles.row}>
      <CautionIcon still={still} animateKey={animateKey} />
      {children}
      <CautionWords text={text} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: step.hair },
});
