// D-09/D-10/D-11/D-16/D-18/D-21: the floating action button (prototype html 1880-1888). Right 16,
// 50px accent pill, plus glyph + label; rises in on mount (fw-rise), lifts above a visible
// app-layer toast and settles back; light haptic on press, medium on the long-press quick menu,
// and the same quick entries as named screen-reader actions.
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { hapticLight, hapticMedium } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize } from '@/theme/typography';
import { DURATION, EASING } from '@/theme/motion';
import { radii, size, space } from '@/theme/layout';
import { useFab } from './FabProvider';
import { useFabOffsets } from './useShellPositions';

const RISE_DISTANCE = 14;
const BAR_RADIUS = 2;

export function Fab(): React.JSX.Element | null {
  const { config, hidden, quickActions, openQuickMenu } = useFab();
  if (hidden || !config) return null;
  return <FabButton config={config} quickActions={quickActions} openQuickMenu={openQuickMenu} />;
}

function FabButton({
  config,
  quickActions,
  openQuickMenu,
}: Pick<ReturnType<typeof useFab>, 'config' | 'quickActions' | 'openQuickMenu'> & {
  config: NonNullable<ReturnType<typeof useFab>['config']>;
}): React.JSX.Element {
  const { colors, fonts } = useTheme();
  const { bottom, lift } = useFabOffsets();

  // fw-rise uses plain ease: translateY 14 -> 0 with a fade, 220ms.
  const rise = useSharedValue(1);
  const liftY = useSharedValue(0);

  useEffect(() => {
    rise.value = withTiming(0, { duration: DURATION.entrance, easing: Easing.ease });
  }, [rise]);

  useEffect(() => {
    liftY.value = withTiming(-lift, { duration: DURATION.entrance, easing: EASING });
  }, [lift, liftY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: rise.value * RISE_DISTANCE + liftY.value }],
  }));

  const barOffset = (size.fabIcon - size.fabBarLong) / 2;
  const thinOffset = (size.fabIcon - size.fabBarThin) / 2;

  return (
    <Animated.View
      testID="fab-wrapper"
      style={[styles.wrapper, { right: space.fabInset, bottom }, animatedStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={config.accessibilityLabel}
        accessibilityActions={quickActions.map((a) => ({ name: a.id, label: a.label }))}
        onAccessibilityAction={(e) =>
          quickActions.find((a) => a.id === e.nativeEvent.actionName)?.run()
        }
        onPress={() => {
          hapticLight();
          config.onPress();
        }}
        onLongPress={
          quickActions.length
            ? () => {
                hapticMedium();
                openQuickMenu();
              }
            : undefined
        }
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: pressed ? colors.ink : colors.accent },
          shadows.fab,
        ]}
      >
        <View style={styles.icon} importantForAccessibility="no-hide-descendants">
          <View
            style={[
              styles.bar,
              {
                backgroundColor: colors.surface,
                left: barOffset,
                top: thinOffset,
                width: size.fabBarLong,
                height: size.fabBarThin,
              },
            ]}
          />
          <View
            style={[
              styles.bar,
              {
                backgroundColor: colors.surface,
                left: thinOffset,
                top: barOffset,
                width: size.fabBarThin,
                height: size.fabBarLong,
              },
            ]}
          />
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.body[600],
            fontSize: fontSize.s13_5,
            letterSpacing: fontSize.s13_5 * -0.01,
            color: colors.surface,
          }}
        >
          {config.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: size.fab,
    minWidth: space.touchMin,
    paddingLeft: space.fabPadL,
    paddingRight: space.fabPadR,
    gap: space.fabGap,
    borderRadius: radii.pill,
  },
  icon: { width: size.fabIcon, height: size.fabIcon },
  bar: { position: 'absolute', borderRadius: BAR_RADIUS },
});
