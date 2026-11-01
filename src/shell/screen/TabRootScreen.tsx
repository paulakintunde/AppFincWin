// D-14/D-17/D-08/D-20: the scaffold every tab root uses: large title that scrolls into a compact
// header, optional pull-to-refresh and an `overlay` slot for sheets,
// which sit outside the ScrollView. The tab bar owns the home-indicator inset, so no bottom
// safe-area padding here.
import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { FAB_CLEARANCE } from '@/shell/fab/useShellPositions';
import { useTheme } from '@/theme/ThemeProvider';
import { useScreenInsets } from '@/theme/layout';
import { useTabRootChrome, type TabRootChromeOptions } from './useTabRootChrome';

export interface TabRootScreenProps extends TabRootChromeOptions {
  overlay?: React.ReactNode;
  children?: React.ReactNode;
}

export function TabRootScreen({ overlay, children, ...options }: TabRootScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const chrome = useTabRootChrome(options);
  /* eslint-disable react-hooks/refs -- the chrome object carries the animated scroll ref to the ScrollView; nothing reads .current during render */
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {chrome.compactInFlow ? <View testID="status-backdrop" style={{ height: insets.top, backgroundColor: colors.canvas }} /> : null}
      {chrome.compactInFlow && chrome.compactVisible ? chrome.compactHeader : null}
      <Animated.ScrollView
        ref={chrome.scrollRef}
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
        refreshControl={chrome.refreshControl}
        contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
      >
        {chrome.largeHeader}
        {children}
      </Animated.ScrollView>
      {chrome.compactInFlow ? null : chrome.compactHeader}
      {overlay}
    </View>
  );
  /* eslint-enable react-hooks/refs */
}
