// ANL-02/FND-07: a custom on/off switch. The thumb's slide is a Reanimated withTiming
// animation driven by useMotion()'s reduce-motion-aware duration, so it collapses to an
// instant snap under reduce-motion rather than being skipped outright (accessibilityState
// still reports the change either way).
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { useMotion, DURATION, EASING } from '@/theme/motion';

export interface AnalyticsToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 22;
const THUMB_INSET = 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

export function AnalyticsToggle({ value, onChange, accessibilityLabel }: AnalyticsToggleProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: motion.duration(DURATION.entrance),
      easing: EASING,
    });
  }, [value, motion, progress]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!value)}
      style={[styles.track, { backgroundColor: value ? colors.accent : colors.fill1 }]}
    >
      <Animated.View style={[styles.thumb, { backgroundColor: colors.surface }, thumbStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: THUMB_INSET,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});
