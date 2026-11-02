import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useShellRefresh } from '@/shell/refresh/useShellRefresh';
import { TabRootScreen } from '../TabRootScreen';

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

// Reanimated's worklet runtime is not driven in jest, so the scroll handler and the mockReaction are
// replaced by plain functions: a scroll event updates the handler, and tick() runs the mockReaction once.
let mockReaction: { prepare: () => boolean; react: (now: boolean, prev: boolean | null) => void; prev: boolean | null } | undefined;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useAnimatedRef: () => ({
      get current() {
        return { scrollTo: mockScrollTo };
      },
      set current(_v: unknown) {},
    }),
    useAnimatedScrollHandler: (fn: (e: unknown) => void) => (ev: { nativeEvent: unknown }) => fn(ev.nativeEvent),
    useAnimatedReaction: (prepare: () => boolean, react: (now: boolean, prev: boolean | null) => void) => {
      mockReaction = { prepare, react, prev: mockReaction?.prev ?? null };
    },
  };
});
async function tick() {
  await act(async () => {
    // run to a fixed point, as the real mockReaction re-runs when the shared values it reads change
    for (let i = 0; i < 3; i++) {
      const now = mockReaction!.prepare();
      if (now === mockReaction!.prev) break;
      const prev = mockReaction!.prev;
      mockReaction!.prev = now;
      mockReaction!.react(now, prev);
    }
  });
}

jest.setTimeout(30000);

const TOP = 47; // renderWithShellProviders safe-area top inset
const HEADER_H = 60;
const LARGE_H = 400; // threshold = 400 - (47 + touchMin + 2 * gapSm); hide band = threshold - HEADER_H
// compactThreshold(LARGE_H, TOP) = 200 - (47 + 44 + 2 * 8) is whatever the layout tokens give; scroll far past it.
const FAR = 500;

const mockScrollTo = jest.fn();
const scrollTo = mockScrollTo;

function scrollView() {
  let n = screen.getByTestId('first-row').parent as { type: unknown; parent: unknown } | null;
  while (n && n.type !== 'RCTScrollView') n = n.parent as never;
  return n as never as ReturnType<typeof screen.getByTestId>;
}

async function setup(props: { compactInFlow?: boolean } = {}) {
  const r = await renderWithShellProviders(
    <TabRootScreen title="Decide" {...props}>
      <RNText testID="first-row">{'row'}</RNText>
    </TabRootScreen>,
  );
  return r;
}

async function layoutLarge() {
  const heading = screen.getAllByRole('header', { name: 'Decide', includeHiddenElements: true })[0]!;
  type N = { parent: N | null; props: { onLayout?: unknown } };
  let n: N | null = heading as unknown as N;
  while (n && !n.props.onLayout) n = n.parent;
  await act(async () => {
    (n!.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { height: LARGE_H, width: 400, x: 0, y: 0 } } });
  });
}

async function scrollTo_(y: number) {
  await act(async () => {
    fireEvent.scroll(scrollView(), { nativeEvent: { contentOffset: { x: 0, y } } });
  });
  await tick();
}

beforeEach(() => {
  jest.clearAllMocks();
  (useSyncStatus as jest.Mock).mockReturnValue({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null });
  resetShellStores();
  (useShellRefresh as jest.Mock).mockReturnValue({ refreshing: false, refresh: jest.fn() });
  mockReaction = undefined;
});

describe('TabRootScreen compactInFlow', () => {
  it('renders a status-bar backdrop the height of the top inset and no compact header at rest', async () => {
    await setup({ compactInFlow: true });
    const backdrop = screen.getByTestId('status-backdrop');
    expect(StyleSheet.flatten(backdrop.props.style).height).toBe(TOP);
    expect(screen.queryByTestId('compact-header', { includeHiddenElements: true })).toBeNull();
  });

  it('without the option nothing changes: no backdrop, absolute compact header always mounted', async () => {
    await setup();
    expect(screen.queryByTestId('status-backdrop')).toBeNull();
    const compact = screen.getByTestId('compact-header', { includeHiddenElements: true });
    expect(StyleSheet.flatten(compact.props.style).position).toBe('absolute');
  });

  it('shows the compact header in flow, outside the scroll view and not absolute, once scrolled past the threshold', async () => {
    await setup({ compactInFlow: true });
    await layoutLarge();
    await scrollTo_(FAR);
    const compact = screen.getByTestId('compact-header');
    const flat = StyleSheet.flatten(compact.props.style);
    expect(flat.position).not.toBe('absolute');
    expect(flat.position).toBe('relative');
    expect(flat.paddingTop).toBeLessThan(TOP); // no status-bar inset: the backdrop owns it
    type T = { parent: T | null; type: unknown };
    let n: T | null = compact as unknown as T;
    let insideScroll = false;
    while (n) {
      if (n.type === 'RCTScrollView') insideScroll = true;
      n = n.parent;
    }
    expect(insideScroll).toBe(false);
    expect(compact.props.pointerEvents).toBe('auto');
  });

  it('compensates the scroll offset by the measured height on show and on hide, with hysteresis', async () => {
    await setup({ compactInFlow: true });
    await layoutLarge();
    await scrollTo_(FAR);
    const compact = screen.getByTestId('compact-header');
    await act(async () => {
      (compact.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { height: HEADER_H, width: 400, x: 0, y: 0 } } });
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: FAR + HEADER_H, animated: false });
    // back to just under the threshold but inside the hysteresis band: stays shown
    await scrollTo_(260);
    expect(screen.queryByTestId('compact-header')).toBeTruthy();
    // far below threshold - height: removed
    await scrollTo_(200);
    expect(screen.queryByTestId('compact-header', { includeHiddenElements: true })).toBeNull();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 200 - HEADER_H, animated: false });
  });
});
