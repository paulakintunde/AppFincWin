/** D-34: the goal progress bar. Never the only signal: caption and accessibilityValue carry it too. */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { minorUnits } from '@/engine/money';
import type { CurrencyCode } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, size, space } from '@/theme/layout';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { fontSize, textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface GoalProgressProps {
  /** Saved so far in minor units; null while a tagged line waits for a rate. */
  saved: number | null;
  /** Target in minor units; null or 0 or less gives an empty bar. */
  target: number | null;
  /** Whole currency units formatter (UI-SPEC assumption 12). */
  whole: MoneyFormatter;
  currency: CurrencyCode;
}

/** Whole percent with integer maths, capped at 100. Unsafe integers cannot be scaled exactly, so they fall back to full or empty. */
export function wholePercent(saved: number | null, target: number | null): number {
  if (saved === null || target === null || target <= 0 || saved <= 0) return 0;
  if (saved >= target) return 100;
  if (!Number.isSafeInteger(saved * 100)) return 0;
  return Math.min(100, Math.floor((saved * 100) / target));
}

export function GoalProgress({ saved, target, whole, currency }: GoalProgressProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const pct = wholePercent(saved, target);
  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = reduced ? pct : withTiming(pct, { duration: DURATION.progress, easing: EASING });
  }, [pct, reduced, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const fmt = (n: number) => whole.formatMoney({ amount: minorUnits(n), currency });
  const caption =
    saved === null
      ? t('decide.depth.goal.waitingRate')
      : t('decide.depth.goal.caption', { saved: fmt(saved), target: fmt(target ?? 0) });
  return (
    <View>
      <View
        testID="goal-track"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={caption}
        accessibilityValue={{ text: t('decide.depth.goal.a11y', { pct }) }}
        style={[styles.track, { backgroundColor: colors.fill1 }]}
      >
        <Animated.View testID="goal-fill" style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
      </View>
      <Text
        scale="capped"
        style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim, marginTop: space.gapSm }}
      >
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: size.homeBarHeight, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: size.homeBarHeight, borderRadius: radii.pill },
});
