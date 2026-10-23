// Shared harness for tests that render ActivityScreen as a shell tab root (03-15): the screen now
// uses the shell chrome (header, avatar, refresh, scroll-to-top) and the FAB provider. Import this
// file BEFORE the screen. It stubs only the native/navigation edges; the chrome itself is real.
import React from 'react';
import { Text } from 'react-native';
import { FabProvider, useFab, useProvideDefaultFabAction } from '@/shell/fab/FabProvider';
import { ShellTestProviders } from '@/shell/__tests__/testUtils';

jest.mock('expo-router', () => ({
  useScrollToTop: jest.fn(),
  useFocusEffect: jest.fn(),
  useSegments: () => [],
  router: { push: jest.fn(), navigate: jest.fn() },
}));
jest.mock('@/shell/a11yFocus', () => ({
  useScreenTitleFocus: jest.fn(),
  focusAccessibility: jest.fn(),
}));
jest.mock('@/shell/refresh/useShellRefresh', () => ({
  useShellRefresh: () => ({ refreshing: false, refresh: jest.fn().mockResolvedValue('updated') }),
}));
jest.mock('@/features/you/useProfile', () => ({
  useProfile: () => ({ profile: { full_name: 'Paul', email: 'p@x.com' } }),
}));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn' }) }));
// A plain map keeps the list deterministic; FlashList's own layout needs a native measure pass.
// Unlike the old per-file mocks it renders the header, because the screen's controls live there.
jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
      refreshControl,
      onScroll,
    }: {
      data: { key: string }[];
      renderItem: (info: { item: { key: string }; index: number }) => React.ReactElement;
      ListHeaderComponent?: React.ReactElement;
      ListEmptyComponent?: React.ReactElement;
      refreshControl?: unknown;
      onScroll?: unknown;
    }) => (
      <View testID="activity-list" accessibilityHint={`refresh:${refreshControl !== undefined};scroll:${onScroll !== undefined}`}>
        {ListHeaderComponent}
        {data.length === 0 ? ListEmptyComponent : null}
        {data.map((item, index) => (
          <View key={item.key}>{renderItem({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

/** Gives the FAB an action so `fab-hidden` reflects only the hide reasons the screen holds. */
function FabProbe(): React.JSX.Element {
  const noop = React.useCallback(() => undefined, []);
  useProvideDefaultFabAction(noop);
  const { hidden } = useFab();
  return <Text testID="fab-hidden">{String(hidden)}</Text>;
}

export function ActivityShellProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ShellTestProviders>
      <FabProvider>
        <FabProbe />
        {children}
      </FabProvider>
    </ShellTestProviders>
  );
}
