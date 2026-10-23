import React from 'react';
import { Text as RNText } from 'react-native';
import { screen } from '@testing-library/react-native';
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

type Json = { type: string; children?: unknown[] | null } | string | null | unknown[];
function hasType(node: Json | undefined, type: string): boolean {
  if (!node || typeof node === 'string') return false;
  if (Array.isArray(node)) return node.some((n) => hasType(n as Json, type));
  return node.type === type || (node.children ?? []).some((c) => hasType(c as Json, type));
}

beforeEach(() => {
  jest.clearAllMocks();
  (useSyncStatus as jest.Mock).mockReturnValue({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null });
  resetShellStores();
  (useShellRefresh as jest.Mock).mockReturnValue({ refreshing: false, refresh: jest.fn() });
});

describe('TabRootScreen', () => {
  it('renders the title as a header, the hidden compact header and children', async () => {
    await renderWithShellProviders(
      <TabRootScreen title="Overview" refreshKeys={[['k']]}>
        <RNText>{'body'}</RNText>
      </TabRootScreen>,
    );
    expect(screen.getAllByRole('header', { name: 'Overview', includeHiddenElements: true }).length).toBe(2);
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.getByTestId('compact-header', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it('gives the scroll view a refreshControl only with refreshKeys', async () => {
    const first = await renderWithShellProviders(<TabRootScreen title="A" refreshKeys={[['k']]} />);
    expect(hasType(first.toJSON(), 'RCTRefreshControl')).toBe(true);
    await first.unmount();
    const second = await renderWithShellProviders(<TabRootScreen title="A" />);
    expect(hasType(second.toJSON(), 'RCTRefreshControl')).toBe(false);
  });

  it('reserves FAB clearance at the bottom and shows the sync line once when offline', async () => {
    (useSyncStatus as jest.Mock).mockReturnValue({ isOnline: false, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null });
    const r = await renderWithShellProviders(<TabRootScreen title="Overview" />);
    expect(screen.getAllByTestId('sync-problem-line').length).toBe(1);
    expect(JSON.stringify(r.toJSON())).toContain('"paddingBottom":82');
  });

  it('D-93 a tab root never shows a back control after a push and pop', async () => {
    // After a push and pop the app history is non-empty, so canGoBack is true; a tab root ignores it.
    await renderWithShellProviders(<TabRootScreen title="Decide" />, {
      backHistory: { canGoBack: true, history: [{ kind: 'tab', tab: 'decide' } as never] },
    });
    expect(screen.queryByLabelText('Back', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /back/i, includeHiddenElements: true }).length).toBe(0);
  });

  it('renders the overlay outside the scroll view', async () => {
    await renderWithShellProviders(
      <TabRootScreen title="Overview" overlay={<RNText testID="ov">{'sheet'}</RNText>}>
        <RNText testID="inner">{'body'}</RNText>
      </TabRootScreen>,
    );
    const ov = screen.getByTestId('ov');
    const inner = screen.getByTestId('inner');
    const within = (node: { parent: unknown }, pred: (n: any) => boolean): boolean => {
      let n = node as { parent: any } | null;
      while (n) {
        if (pred(n)) return true;
        n = n.parent;
      }
      return false;
    };
    const isScroll = (n: any) => typeof n.type === 'string' && n.type === 'RCTScrollView';
    expect(within(inner, isScroll)).toBe(true);
    expect(within(ov, isScroll)).toBe(false);
  });
});
