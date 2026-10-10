// Android-only left-edge swipe-back for inner screens (261010-kpe). iOS keeps its native
// swipe. Sheets and Modals render in separate windows, so this pan cannot fire under an open
// sheet. No visual overlay. Self-contained so Phase 3 can wrap each tab stack with it and
// swap router.back for its BackHistory goBack.
import React, { useMemo, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SWIPE_BACK_EDGE_WIDTH, shouldSwipeBack } from './swipeBackGesture';

export interface SwipeBackProps {
  enabled: boolean;
  children: ReactNode;
}

export function SwipeBack({ enabled, children }: SwipeBackProps) {
  const active = Platform.OS === 'android' && enabled;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .hitSlop({ left: 0, width: SWIPE_BACK_EDGE_WIDTH })
        .activeOffsetX(12)
        .failOffsetY([-20, 20])
        .withTestId('swipe-back')
        .onEnd((e) => {
          const startX = e.absoluteX - e.translationX;
          const sample = { startX, translationX: e.translationX, translationY: e.translationY, velocityX: e.velocityX };
          if (shouldSwipeBack(sample) && router.canGoBack()) {
            router.back();
          }
        }),
    []
  );
  if (!active) return <>{children}</>;
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
