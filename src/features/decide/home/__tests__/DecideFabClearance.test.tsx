// D-107 (05-140): the FAB is back on Decide home, so the real TabRootScreen must keep its bottom inset. No mock of the screen
// or of FAB_CLEARANCE.
import React from 'react';
import { Text as RNText } from 'react-native';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useShellRefresh } from '@/shell/refresh/useShellRefresh';
import { FAB_CLEARANCE } from '@/shell/fab/useShellPositions';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({
  useScrollToTop: jest.fn(),
  useFocusEffect: jest.fn(),
  router: { push: jest.fn() },
}));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('@/shell/refresh/useShellRefresh', () => ({ useShellRefresh: jest.fn() }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: { full_name: 'Paul', email: 'p@x.com' } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (useSyncStatus as jest.Mock).mockReturnValue({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null });
  resetShellStores();
  (useShellRefresh as jest.Mock).mockReturnValue({ refreshing: false, refresh: jest.fn() });
});

describe('Decide home FAB clearance', () => {
  it('D-107 the scroll content keeps the FAB clearance so the last row is not covered', async () => {
    const view = await renderWithShellProviders(
      <TabRootScreen title="Can I afford it" hideSyncLine>
        <RNText>{'last row'}</RNText>
      </TabRootScreen>
    );
    const paddings = [...JSON.stringify(view.toJSON()).matchAll(/"paddingBottom":(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...paddings)).toBeGreaterThanOrEqual(FAB_CLEARANCE);
  });
});
