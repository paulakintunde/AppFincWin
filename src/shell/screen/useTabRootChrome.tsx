// D-08/D-14/D-17/D-20/D-21: everything a tab root needs around its scroll content: the large title
// that scrolls away, the compact header that fades in (200ms) once it has, the accent-tinted
// pull-to-refresh, scroll-to-top on a tap of the active tab and screen-reader focus on the title.
// Screens with their own list (Activity's FlashList) take these pieces directly; TabRootScreen
// wraps them for plain scrolling screens. The large header carries the problem-only sync line (D-15),
// so every tab root shows it at rest. Refresh logic itself lives in useShellRefresh (03-20).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  RefreshControl,
  View,
  type HostInstance,
  type LayoutChangeEvent,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  type AnimatedRef,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useScrollToTop } from 'expo-router';
import type { QueryKey } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import * as a11yFocus from '@/shell/a11yFocus';
import { useShellRefresh } from '@/shell/refresh/useShellRefresh';
import { CompactHeader } from '@/shell/header/CompactHeader';
import { TabHeader } from '@/shell/header/TabHeader';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { DURATION } from '@/theme/motion';

type TextRef = React.ComponentRef<typeof Text>;

/** Scroll offset at which the large title has gone under the compact header. */
export function compactThreshold(largeHeaderHeight: number, insetsTop: number): number {
  return Math.max(0, largeHeaderHeight - (insetsTop + space.touchMin + 2 * space.gapSm));
}

// Calls a function-form compactTrailing inside its own component so the hook's render never
// invokes consumer code with a ref-backed callback (react-hooks/refs).
function TrailingSlot({
  render,
  scrollToTop,
}: {
  render: (api: { scrollToTop: () => void }) => React.ReactNode;
  scrollToTop: () => void;
}): React.JSX.Element {
  return <>{render({ scrollToTop })}</>;
}

export interface TabRootChromeOptions {
  title: string;
  eyebrow?: string;
  trailing?: React.ReactNode;
  /** Passing keys makes the screen refreshable (D-17); omit on roots that are not (Decide). */
  refreshKeys?: readonly QueryKey[];
  /** 03.1 D-58: compact-only title (defaults to title). */
  compactTitle?: string;
  compactTitleRole?: 'heading' | 'sheetTitle';
  /** 03.1 D-58: compact-only trailing controls; when given, the compact header drops the avatar. */
  compactTrailing?: React.ReactNode | ((api: { scrollToTop: () => void }) => React.ReactNode);
  /** 05-117 (D-96): Decide home folds the sync problem into its notice row, so this screen alone drops the header line. */
  hideSyncLine?: boolean;
}

export interface TabRootChrome {
  scrollToTop: () => void;
  scrollRef: AnimatedRef<Animated.ScrollView>;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  scrollEventThrottle: 16;
  largeHeader: React.ReactElement;
  compactHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps> | undefined;
}

// D-93: every screen built from this hook is a tab root (under (tabs)). Whether to show the back
// control follows that, never the app history or router.canGoBack(), which is non-empty after a
// push and pop, a reload onto a tab or returning from Android Settings.
const isTabRoot = true;

export function useTabRootChrome(options: TabRootChromeOptions): TabRootChrome {
  const { title, eyebrow, trailing, refreshKeys, compactTitle, compactTitleRole, compactTrailing, hideSyncLine = false } = options;
  const { colors } = useTheme();
  const insets = useScreenInsets();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const threshold = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [compactVisible, setCompactVisible] = useState(false);

  const largeTitleRef = useRef<TextRef>(null);
  const compactTitleRef = useRef<TextRef>(null);
  const visibleRef = useRef(false);
  useEffect(() => {
    visibleRef.current = compactVisible;
  }, [compactVisible]);

  // The focus target follows whichever title is on screen.
  const focusRef = useMemo(
    () =>
      ({
        get current(): HostInstance | null {
          return (visibleRef.current ? compactTitleRef.current : largeTitleRef.current) as HostInstance | null;
        },
      }) as React.RefObject<HostInstance | null>,
    [],
  );

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  useAnimatedReaction(
    () => scrollY.value > threshold.value,
    (now, prev) => {
      if (now !== prev) {
        opacity.value = withTiming(now ? 1 : 0, { duration: DURATION.fade });
        scheduleOnRN(setCompactVisible, now);
      }
    },
  );
  const opacityStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Works for a ScrollView (scrollTo) and a FlashList (scrollToOffset); reads the ref only on call.
  const scrollToTop = useCallback(() => {
    const node = scrollRef.current as unknown as {
      scrollToOffset?: (o: { offset: number; animated: boolean }) => void;
      scrollTo?: (o: { y: number; animated: boolean }) => void;
    } | null;
    if (node?.scrollToOffset) node.scrollToOffset({ offset: 0, animated: true });
    else node?.scrollTo?.({ y: 0, animated: true });
  }, [scrollRef]);
  const trailingNode =
    typeof compactTrailing === 'function' ? <TrailingSlot render={compactTrailing} scrollToTop={scrollToTop} /> : compactTrailing;

  useScrollToTop(scrollRef as never);
  a11yFocus.useScreenTitleFocus(focusRef);

  const { refreshing, refresh } = useShellRefresh(refreshKeys ?? []);
  const onRefresh = useCallback(async () => {
    await refresh();
    if (await AccessibilityInfo.isScreenReaderEnabled()) a11yFocus.focusAccessibility(focusRef.current);
  }, [refresh, focusRef]);

  const onLargeLayout = useCallback(
    (e: LayoutChangeEvent) => {
      threshold.set(compactThreshold(e.nativeEvent.layout.height, insets.top));
    },
    [threshold, insets.top],
  );

  const largeHeader = (
    <View onLayout={onLargeLayout}>
      <TabHeader title={title} eyebrow={eyebrow} trailing={trailing} titleRef={largeTitleRef} showBack={!isTabRoot} />
      {hideSyncLine ? null : <SyncProblemLine />}
    </View>
  );
  const compactHeader = (
    <CompactHeader
      title={compactTitle ?? title}
      titleRole={compactTitleRole}
      trailing={trailingNode}
      showAvatar={compactTrailing === undefined}
      showBack={!isTabRoot}
      hideSyncLine={hideSyncLine}
      visible={compactVisible}
      animatedStyle={opacityStyle as unknown as StyleProp<ViewStyle>}
      titleRef={compactTitleRef}
    />
  );
  const refreshControl = refreshKeys ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surface}
    />
  ) : undefined;

  return { scrollRef, onScroll, scrollEventThrottle: 16, largeHeader, compactHeader, refreshControl, scrollToTop };
}
