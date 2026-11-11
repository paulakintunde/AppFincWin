// 06-22 (G02a): the one success moment when a deposit carries a goal to its target. A green Reached badge (check + word, never
// colour alone), a tick drawn once, and one success haptic. With Reduce Motion the tick is simply there. Mounted only when a
// deposit reached the target, so the haptic fires once per reaching, never on a normal deposit.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { space } from '@/theme/layout';
import { hapticSuccess } from '@/ui/haptics';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const TICK_PATH = 'M5 13 L10 18 L19 7';
const TICK_LENGTH = 24;
const TICK_SIZE = 28;

export function ReachedMoment() {
  const t = useT();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const drawn = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    hapticSuccess();
  }, []);
  useEffect(() => {
    if (reduceMotion) {
      drawn.value = 1;
      return;
    }
    drawn.value = withTiming(1, { duration: DURATION.entrance, easing: Easing.out(Easing.ease) });
  }, [reduceMotion, drawn]);

  const props = useAnimatedProps(() => ({ strokeDashoffset: TICK_LENGTH * (1 - drawn.value) }));

  return (
    <View testID="goal-reached" style={styles.row}>
      <StateBadge tone="accent" shape="sCheck" label={t('grow.goals.detail.reached')} />
      <Svg testID="goal-reached-tick" width={TICK_SIZE} height={TICK_SIZE} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <AnimatedPath
          d={TICK_PATH}
          stroke={colors.accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={TICK_LENGTH}
          animatedProps={props}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
});
