// 06.1-78 (H-15, DN-1, DN-2): the tabs navigator must not be remounted by a cache change. A remount starts the Tabs again at
// their first tab (Home), which is how "Check it" and "Edit the check" landed on Home and Decide home lost what was typed.
// The real (app) and (tabs) layouts run here with stub leaves; the record context and the accounts read are driven from the
// test, and each flip is one a refetch or a write can cause while Decide is open.
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetShellStores } from '../../__tests__/testUtils';
import AppLayout from '../../../../app/(app)/_layout';
import TabsLayout from '../../../../app/(app)/(tabs)/_layout';
import IndexRoute from '../../../../app/index';

type Accounts = { data?: { archived_at: string | null }[]; isLoading: boolean; isFetching: boolean; isError: boolean };
type Rc = { ready: boolean; householdId: string | null; userId: string; today: string };

// A tiny external store, so a change re-renders the layouts the way a query cache update does.
const mockStore = {
  rc: { ready: true, householdId: 'h1', userId: 'u1', today: '2026-11-13' } as Rc,
  accounts: { data: [{ archived_at: null }], isLoading: false, isFetching: false, isError: false } as Accounts,
  listeners: new Set<() => void>(),
  version: 0,
};
function mockSet(patch: { rc?: Partial<Rc>; accounts?: Partial<Accounts> }): void {
  if (patch.rc) mockStore.rc = { ...mockStore.rc, ...patch.rc };
  if (patch.accounts) mockStore.accounts = { ...mockStore.accounts, ...patch.accounts };
  mockStore.version += 1;
  mockStore.listeners.forEach((l) => l());
}
function mockUseStore<T>(pick: () => T): T {
  const R = require('react') as typeof React;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- called only from the mocked useRecordContext and useAccounts hooks
  R.useSyncExternalStore(
    (l: () => void) => {
      mockStore.listeners.add(l);
      return () => mockStore.listeners.delete(l);
    },
    () => mockStore.version,
  );
  return pick();
}

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'u1' } }) }));
jest.mock('@/features/consent/useConsent', () => ({ useConsent: () => ({ loading: false, needsPrompt: false }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockUseStore(() => mockStore.rc) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockUseStore(() => mockStore.accounts) }));
jest.mock('@/data/queries/decideV3', () => ({ DecideV3Scope: ({ children }: { children: unknown }) => children }));
jest.mock('@/features/record/history/UndoToastHost', () => ({ UndoToastHost: () => null, SheetToastOverlay: () => null }));
jest.mock('@/features/record/entry/ShellEntryHost', () => ({ ShellEntryHost: () => null }));
jest.mock('@/features/decide/DecideShellHost', () => ({ DecideShellHost: () => null }));
jest.mock('@/features/decide/shadow/DecideShadowHost', () => ({ DecideShadowHost: () => null }));
jest.mock('@/features/decide/notifications/useNotificationObserver', () => ({ useNotificationObserver: () => undefined }));
jest.mock('@/features/record/useDeviceHomeCurrencyDefault', () => ({ DeviceHomeCurrencyDefault: () => null }));
jest.mock('@/features/record/samples/SampleBanner', () => ({ SampleBanner: () => null }));
jest.mock('@/features/record/samples/SampleClearPrompts', () => ({ SampleClearPrompts: () => null }));
jest.mock('../../../../app/_layout', () => {
  const R = require('react');
  return { RouteContext: R.createContext('app') };
});

const INITIAL_METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } };

const mounts = { home: 0, decide: 0 };
function counted(name: 'home' | 'decide') {
  return function Leaf() {
    useEffect(() => {
      mounts[name] += 1;
    }, []);
    return <Text>{`${name}-root`}</Text>;
  };
}
const leaf = (label: string) =>
  function Leaf() {
    return <Text>{label}</Text>;
  };

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return (
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <ThemeProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

async function mountAt(url: string) {
  const pending = renderRouter(
    {
      index: IndexRoute,
      '(app)/_layout': AppLayout,
      '(app)/(tabs)/_layout': TabsLayout,
      '(app)/(tabs)/home': counted('home'),
      '(app)/(tabs)/activity': leaf('activity-root'),
      '(app)/(tabs)/decide': counted('decide'),
      '(app)/(tabs)/grow': leaf('grow-root'),
      '(app)/setup/account': leaf('setup-account'),
      '(app)/you': leaf('you-root'),
      '(app)/consent': leaf('consent-root'),
    },
    { initialUrl: url, wrapper: Wrapper } as never,
  );
  await pending;
  // RNTL 14: getPathname lives on the pending render object, so it is returned wrapped (an async function would unwrap it).
  return { handle: pending };
}

const step = async (patch: Parameters<typeof mockSet>[0]) => {
  await act(async () => mockSet(patch));
};

let warn: jest.SpyInstance;
beforeEach(() => {
  resetShellStores();
  mounts.home = 0;
  mounts.decide = 0;
  mockStore.rc = { ready: true, householdId: 'h1', userId: 'u1', today: '2026-11-13' };
  mockStore.accounts = { data: [{ archived_at: null }], isLoading: false, isFetching: false, isError: false };
  mockStore.listeners.clear();
  warn = jest.spyOn(console, 'warn');
});
afterEach(() => warn.mockRestore());

const layoutWarnings = () => warn.mock.calls.filter((c) => String(c[0]).includes('Layout children must be of type Screen'));

describe('tabs layout stays mounted through cache changes (06.1-78)', () => {
  it('keeps Decide and the navigator through accounts and record-context flips', async () => {
    const { handle: r } = await mountAt('/decide');
    expect(await screen.findByText('decide-root')).toBeTruthy();
    expect(r.getPathname()).toBe('/decide');

    // A refetch: fetching on, then a new array with the same rows.
    await step({ accounts: { isFetching: true } });
    await step({ accounts: { isFetching: false, data: [{ archived_at: null }] } });
    // A reset read: loading with no data, then settled again.
    await step({ accounts: { isLoading: true, data: undefined } });
    await step({ accounts: { isLoading: false, data: [{ archived_at: null }] } });
    // The record context drops ready (a prefs refetch) and the household id for a moment.
    await step({ rc: { ready: false } });
    await step({ rc: { ready: true } });
    await step({ rc: { householdId: null } });
    await step({ rc: { householdId: 'h1' } });
    // An errored refetch keeps the last rows.
    await step({ accounts: { isError: true } });
    await step({ accounts: { isError: false } });
    // A transient empty list while loading again (a household switch or a reset): the last settled decision holds.
    await step({ accounts: { isLoading: true, data: [] } });
    await step({ accounts: { isLoading: false, data: [{ archived_at: null }] } });

    expect(r.getPathname()).toBe('/decide');
    expect(screen.getByText('decide-root')).toBeTruthy();
    expect(mounts.decide).toBe(1);
    expect(mounts.home).toBe(0);
    expect(screen.queryByText('setup-account')).toBeNull();
  });

  it('passes only Screen elements to the Tabs, so expo-router logs no layout warning on any render', async () => {
    await mountAt('/decide');
    await screen.findByText('decide-root');
    await step({ accounts: { isFetching: true } });
    await step({ accounts: { isFetching: false } });
    expect(layoutWarnings()).toEqual([]);
  });

  it('still sends a user with no active account to the first-account screen once the read has settled (T-06.1-78-02)', async () => {
    mockStore.accounts = { data: [{ archived_at: '2026-01-01T00:00:00Z' }], isLoading: false, isFetching: false, isError: false };
    const { handle: r } = await mountAt('/home');
    expect(await screen.findByText('setup-account')).toBeTruthy();
    expect(r.getPathname()).toBe('/setup/account');
  });

  it('sends the user to the first-account screen when a settled read loses its last active account', async () => {
    const { handle: r } = await mountAt('/decide');
    await screen.findByText('decide-root');
    await step({ accounts: { data: [{ archived_at: '2026-01-01T00:00:00Z' }] } });
    expect(await screen.findByText('setup-account')).toBeTruthy();
    expect(r.getPathname()).toBe('/setup/account');
  });
});
