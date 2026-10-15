// Mounted once per tab route through the JS Tabs `screenLayout` prop (03-13); fw-slideL/fw-slideR
// (html 26-27); D-21 via useMotion.
import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { slideStartX } from './direction';
import { takeSlideFor } from './tabSlide';
import type { TabId } from './tabs';

export function TabSlideIn({
  tab,
  navigation,
  children,
}: {
  tab: TabId;
  navigation: { addListener(type: 'focus', cb: () => void): () => void };
  children: React.ReactNode;
}): React.JSX.Element {
  const { reduced } = useMotion();
  const x = useSharedValue(0);
  const o = useSharedValue(1);

  useEffect(
    () =>
      navigation.addListener('focus', () => {
        const dir = takeSlideFor(tab);
        if (reduced || dir === 'none') {
          x.value = 0;
          o.value = 1;
          return;
        }
        x.value = slideStartX(dir);
        o.value = 0;
        x.value = withTiming(0, { duration: DURATION.tabSlide, easing: EASING });
        o.value = withTiming(1, { duration: DURATION.tabSlide, easing: EASING });
      }),
    [navigation, tab, reduced, x, o],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateX: x.value }],
  }));

  return (
    <Animated.View testID="tab-slide" style={[{ flex: 1 }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
