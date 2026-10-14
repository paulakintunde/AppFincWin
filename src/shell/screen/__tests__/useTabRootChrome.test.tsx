import React, { useEffect } from 'react';
import { AccessibilityInfo, ScrollView } from 'react-native';
import { act } from '@testing-library/react-native';
import { useScrollToTop } from 'expo-router';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { focusAccessibility, useScreenTitleFocus } from '@/shell/a11yFocus';
import { useShellRefresh } from '@/shell/refresh/useShellRefresh';
import { useTheme } from '@/theme/ThemeProvider';
import {
  compactThreshold,
  useTabRootChrome,
  type TabRootChrome,
  type TabRootChromeOptions,
} from '../useTabRootChrome';

jest.mock('expo-router', () => ({
  useScrollToTop: jest.fn(),
  useFocusEffect: jest.fn(),
  router: { push: jest.fn() },
}));
jest.mock('@/shell/a11yFocus', () => ({
  useScreenTitleFocus: jest.fn(),
  focusAccessibility: jest.fn(),
}));
jest.mock('@/shell/refresh/useShellRefresh', () => ({ useShellRefresh: jest.fn() }));
jest.mock('@/features/you/useProfile', () => ({
  useProfile: () => ({ profile: { full_name: 'Paul', email: 'p@x.com' } }),
}));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));

const refresh = jest.fn();
const seen: { chrome?: TabRootChrome; colors?: ReturnType<typeof useTheme>['colors'] } = {};
const rcProps = (): Record<string, unknown> & { onRefresh: () => Promise<void> } =>
  seen.chrome?.refreshControl?.props as never;

function Probe(props: TabRootChromeOptions) {
  const colors = useTheme().colors;
  const chrome = useTabRootChrome(props);
  useEffect(() => {
    seen.chrome = chrome;
    seen.colors = colors;
  });
  return (
    <>
      {chrome.largeHeader}
      <ScrollView refreshControl={chrome.refreshControl} />
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
  seen.chrome = undefined;
  refresh.mockResolvedValue('updated');
  (useShellRefresh as jest.Mock).mockReturnValue({ refreshing: false, refresh });
});

describe('compactThreshold', () => {
  it('subtracts the compact header height from the large one', () => {
    expect(compactThreshold(120, 47)).toBe(13);
    expect(compactThreshold(50, 47)).toBe(0);
  });
});

describe('useTabRootChrome', () => {
  it('builds an accent-tinted RefreshControl when refreshKeys are given', async () => {
    await renderWithShellProviders(<Probe title="Overview" refreshKeys={[['k']]} />);
    const props = rcProps();
    expect(props.tintColor).toBe(seen.colors!.accent);
    expect(props.colors).toEqual([seen.colors!.accent]);
    expect(props.progressBackgroundColor).toBe(seen.colors!.surface);
  });

  it('has no refresh control without refreshKeys', async () => {
    await renderWithShellProviders(<Probe title="Decide" />);
    expect(seen.chrome?.refreshControl).toBeUndefined();
  });

  it('refreshes once on pull, then focuses the title when a screen reader is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await renderWithShellProviders(<Probe title="Overview" refreshKeys={[['k']]} />);
    await act(async () => {
      await rcProps().onRefresh();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(focusAccessibility).toHaveBeenCalledTimes(1);
  });

  it('does not move focus after a refresh when no screen reader is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    await renderWithShellProviders(<Probe title="Overview" refreshKeys={[['k']]} />);
    await act(async () => {
      await rcProps().onRefresh();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(focusAccessibility).not.toHaveBeenCalled();
  });

  it('registers scroll-to-top on the scroll ref and title focus', async () => {
    await renderWithShellProviders(<Probe title="Overview" />);
    expect(useScrollToTop).toHaveBeenCalledWith(seen.chrome?.scrollRef);
    expect(useScreenTitleFocus).toHaveBeenCalled();
  });
});
