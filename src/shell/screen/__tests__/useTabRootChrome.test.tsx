import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import { screen, within } from '@testing-library/react-native';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useShellRefresh } from '@/shell/refresh/useShellRefresh';
import { useTabRootChrome, type TabRootChrome, type TabRootChromeOptions } from '../useTabRootChrome';

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
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: jest.fn() }));

// The first render in a file pays the cold module-load cost of the shell providers.
jest.setTimeout(30000);

let captured: TabRootChrome | undefined;
function Probe(options: TabRootChromeOptions) {
  const chrome = useTabRootChrome(options);
  React.useEffect(() => {
    captured = chrome;
  });
  return (
    <>
      {chrome.largeHeader}
      {chrome.compactHeader}
    </>
  );
}

function compact() {
  return within(screen.getByTestId('compact-header', { includeHiddenElements: true }));
}

beforeEach(() => {
  jest.clearAllMocks();
  captured = undefined;
  (useSyncStatus as jest.Mock).mockReturnValue({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null });
  resetShellStores();
  (useShellRefresh as jest.Mock).mockReturnValue({ refreshing: false, refresh: jest.fn() });
});

describe('useTabRootChrome compact options', () => {
  it('keeps the same title and an avatar with no new options', async () => {
    await renderWithShellProviders(<Probe title="Overview" />);
    const title = compact().getByText('Overview', { includeHiddenElements: true });
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(26);
    expect(compact().getByRole('button', { name: 'Profile', includeHiddenElements: true })).toBeTruthy();
  });

  it('uses compactTitle only in the compact header', async () => {
    await renderWithShellProviders(<Probe title="Activity" compactTitle="Activity · Oct" />);
    expect(compact().getByText('Activity · Oct', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
  });

  it('applies the sheetTitle role to the compact title', async () => {
    await renderWithShellProviders(<Probe title="Activity" compactTitleRole="sheetTitle" />);
    const title = compact().getByText('Activity', { includeHiddenElements: true });
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(16);
  });

  it('renders a node compactTrailing and drops the compact avatar only', async () => {
    await renderWithShellProviders(<Probe title="Activity" compactTrailing={<RNText>{'icons'}</RNText>} />);
    expect(compact().getByText('icons', { includeHiddenElements: true })).toBeTruthy();
    expect(compact().queryByRole('button', { name: 'Profile', includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
  });

  it('passes scrollToTop to a function compactTrailing', async () => {
    const seen = jest.fn();
    await renderWithShellProviders(
      <Probe
        title="Activity"
        compactTrailing={(api) => {
          seen(typeof api.scrollToTop);
          return <RNText>{'fn-icons'}</RNText>;
        }}
      />,
    );
    expect(seen).toHaveBeenCalledWith('function');
    expect(compact().getByText('fn-icons', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('useTabRootChrome scrollToTop', () => {
  type Handle = { scrollToOffset?: jest.Mock; scrollTo?: jest.Mock };
  const Stub = React.forwardRef<Handle, { handle: Handle }>(function Stub({ handle }, ref) {
    React.useImperativeHandle(ref, () => handle);
    return null;
  });
  function WithRef({ handle }: { handle: Handle | null }) {
    const chrome = useTabRootChrome({ title: 'Activity' });
    React.useEffect(() => {
      captured = chrome;
    });
    // eslint-disable-next-line react-hooks/refs
    return handle ? <Stub ref={chrome.scrollRef as unknown as React.Ref<Handle>} handle={handle} /> : null;
  }

  it('calls scrollToOffset for a FlashList-like ref', async () => {
    const handle = { scrollToOffset: jest.fn() };
    await renderWithShellProviders(<WithRef handle={handle} />);
    captured?.scrollToTop();
    expect(handle.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('calls scrollTo for a ScrollView-like ref', async () => {
    const handle = { scrollTo: jest.fn() };
    await renderWithShellProviders(<WithRef handle={handle} />);
    captured?.scrollToTop();
    expect(handle.scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it('does not throw when the ref is empty', async () => {
    await renderWithShellProviders(<WithRef handle={null} />);
    expect(() => captured?.scrollToTop()).not.toThrow();
  });
});
