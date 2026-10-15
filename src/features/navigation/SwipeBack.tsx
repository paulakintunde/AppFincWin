// Android-only left-edge swipe-back for inner screens (261010-kpe). iOS keeps its native
// swipe. Sheets and Modals render in separate windows, so this pan cannot fire under an open
// sheet.
// D-40: 40dp start zone, follows the finger, completes or snaps back on release; reduced motion:
// no follow, instant (D-21). Behind the moving layer the canvas shows (the native stack detaches
// the screen underneath).
import React, { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { SWIPE_BACK_EDGE_WIDTH, dragOffset, shouldSwipeBack } from './swipeBackGesture';

export interface SwipeBackProps {
  enabled: boolean;
  children: ReactNode;
}

export function SwipeBack({ enabled, children }: SwipeBackProps) {
  const active = Platform.OS === 'android' && enabled;
  const translateX = useSharedValue(0);
  const { width } = useWindowDimensions();
  const reduced = useReduceMotion();
  const { colors } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .hitSlop({ left: 0, width: SWIPE_BACK_EDGE_WIDTH })
        .activeOffsetX(12)
        .failOffsetX(-12)
        .failOffsetY([-20, 20])
        .withTestId('swipe-back')
        .onUpdate((e) => {
          if (!reduced) translateX.set(dragOffset(e.translationX, e.translationY));
        })
        // Gesture callbacks run after render; the timer ref is only touched from them and the unmount cleanup.
        // eslint-disable-next-line react-hooks/refs
        .onEnd((e, success) => {
          const startX = e.absoluteX - e.translationX;
          // WR-05: a gesture the system cancelled after activation is a snap-back, never a back.
          const go =
            success &&
            shouldSwipeBack({
              startX,
              translationX: e.translationX,
              translationY: e.translationY,
              velocityX: e.velocityX,
            }) && router.canGoBack();
          if (!go) {
            translateX.set(reduced ? 0 : withTiming(0, { duration: DURATION.sheetDrag, easing: EASING }));
            return;
          }
          if (reduced) {
            router.back();
            return;
          }
          if (timer.current) return;
          translateX.set(withTiming(width, { duration: DURATION.push, easing: EASING }));
          timer.current = setTimeout(() => {
            timer.current = null;
            router.back();
          }, DURATION.push);
        })
        // eslint-disable-next-line react-hooks/refs
        .onFinalize(() => {
          // WR-05: whatever ended the gesture, do not leave the layer displaced unless the
          // completion slide (timer pending) is running.
          if (!timer.current) translateX.set(0);
        }),
    [translateX, reduced, width]
  );
  if (!active) return <>{children}</>;
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1, backgroundColor: colors.canvas }} collapsable={false}>
        <Animated.View testID="swipe-back-layer" style={[{ flex: 1 }, layerStyle]}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
