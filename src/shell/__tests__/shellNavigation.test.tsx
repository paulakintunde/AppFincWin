// 03-13: router-level proof on the REAL (app) and (tabs) layouts: landing on Home, D-02 tab
// visibility, D-05/D-06 back order, D-22 details covering the tabs, the D-07 SwipeBack exclusion
// and the D-38 first-account gate. Leaves are stubs; only the shell wiring is under test.
import React from 'react';
import { BackHandler, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { isSwipeBackRoute } from '@/features/navigation/swipeBackGesture';
import { resetShellStores } from './testUtils';
import AppLayout from '../../../app/(app)/_layout';
import TabsLayout from '../../../app/(app)/(tabs)/_layout';
import IndexRoute from '../../../app/index';

let mockAccounts: { data?: { archived_at: string | null }[]; isLoading: boolean; isError: boolean };
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', user: { id: 'u1' } }),
}));
jest.mock('@/features/consent/useConsent', () => ({
  useConsent: () => ({ loading: false, needsPrompt: false }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, householdId: 'h1', userId: 'u1', today: '2026-10-14' }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockAccounts }));
jest.mock('@/features/record/history/UndoToastHost', () => ({
  UndoToastHost: () => null,
  SheetToastOverlay: () => null,
}));
// Leaf stub: the entry host pulls in the whole transaction sheet (and the Supabase client).
jest.mock('@/features/record/entry/ShellEntryHost', () => ({ ShellEntryHost: () => null }));
jest.mock('@/features/record/useDeviceHomeCurrencyDefault', () => ({ DeviceHomeCurrencyDefault: () => null }));
jest.mock('@/features/record/samples/SampleBanner', () => ({ SampleBanner: () => null }));
jest.mock('@/features/record/samples/SampleClearPrompts', () => ({ SampleClearPrompts: () => null }));
jest.mock('../../../app/_layout', () => {
  const R = require('react');
  return { RouteContext: R.createContext('app') };
});

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};

const listeners: (() => boolean)[] = [];
// Mirrors React Native's dispatch: newest listener first, the first to return true consumes it.
// React Navigation registers its own listener too, so "newest" alone would not be ours.
async function pressHardwareBack(): Promise<boolean> {
  let consumed = false;
  await act(async () => {
    for (let i = listeners.length - 1; i >= 0; i--) {
      if (listeners[i]!()) {
        consumed = true;
        break;
      }
    }
  });
  return consumed;
}

function leaf(label: string) {
  return function Leaf() {
    return <Text>{label}</Text>;
  };
}

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

// RNTL 14's render is async; renderRouter attaches getPathname/getRouterState to the pending render
// object, so tests keep that object (not the awaited result) for the pathname matchers.
async function mountRouter(initialUrl: string) {
  const pending = renderRouter(
    {
      index: IndexRoute,
      '(app)/_layout': AppLayout,
      '(app)/(tabs)/_layout': TabsLayout,
      '(app)/(tabs)/home': leaf('home-root'),
      '(app)/(tabs)/activity': leaf('activity-root'),
      '(app)/accounts/[id]': leaf('account-detail'),
      '(app)/accounts/index': leaf('accounts-root'),
      '(app)/categories': leaf('categories-root'),
      '(app)/category-rules': leaf('category-rules-root'),
      '(app)/history': leaf('history-root'),
      '(app)/import': leaf('import-root'),
      '(app)/setup/history': leaf('setup-history'),
      '(app)/you': leaf('you-root'),
      '(app)/setup/account': leaf('setup-account'),
      '(app)/consent': leaf('consent-root'),
    },
    { initialUrl, wrapper: Wrapper } as never,
  );
  await pending;
  return { handle: pending };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
  listeners.length = 0;
  mockAccounts = { data: [{ archived_at: null }], isLoading: false, isError: false };
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_: string, fn: () => boolean) => {
    listeners.push(fn);
    return {
      remove: () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
  }) as never);
});

describe('shell navigation on the real layouts', () => {
  it('lands on Home from the root and shows only Home and Activity tabs (D-02, D-30)', async () => {
    const { handle: r } = await mountRouter('/');
    expect(r.getPathname()).toBe('/home');
    expect(await screen.findByText('home-root')).toBeTruthy();
    expect(screen.getByLabelText('Home, tab, 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Activity, tab, 2 of 2')).toBeTruthy();
    expect(screen.queryByLabelText(/Decide, tab/)).toBeNull();
  });

  it('pressing the Activity tab navigates to /activity', async () => {
    const { handle: r } = await mountRouter('/home');
    await fireEvent.press(await screen.findByLabelText('Activity, tab, 2 of 2'));
    expect(r.getPathname()).toBe('/activity');
    expect(await screen.findByText('activity-root')).toBeTruthy();
  });

  it('hardware back from Activity (history [home]) returns to Home and is consumed (D-06 step 2)', async () => {
    const { handle: r } = await mountRouter('/home');
    await fireEvent.press(await screen.findByLabelText('Activity, tab, 2 of 2'));
    expect(r.getPathname()).toBe('/activity');
    expect(await pressHardwareBack()).toBe(true);
    expect(r.getPathname()).toBe('/home');
  });

  it('hardware back on Home with empty history is not consumed (D-06 step 4)', async () => {
    const { handle: r } = await mountRouter('/home');
    await screen.findByText('home-root');
    expect(await pressHardwareBack()).toBe(false);
    expect(r.getPathname()).toBe('/home');
  });

  it('hardware back on a freshly opened Activity goes to Home (D-06 step 3)', async () => {
    const { handle: r } = await mountRouter('/activity');
    await screen.findByText('activity-root');
    expect(await pressHardwareBack()).toBe(true);
    expect(r.getPathname()).toBe('/home');
  });

  it('a detail pushed from Home is an outer-stack route covering the tabs, and back returns (D-22, D-05)', async () => {
    const { handle: r } = await mountRouter('/home');
    await screen.findByText('home-root');
    await act(async () => router.push('/accounts/a1'));
    expect(r.getPathname()).toBe('/accounts/a1');
    type NavNode = { index?: number; routes: { name: string; state?: NavNode }[] };
    const findApp = (n: NavNode | undefined): NavNode | undefined => {
      for (const route of n?.routes ?? []) {
        if (route.name === '(app)') return route.state;
        const hit = findApp(route.state);
        if (hit) return hit;
      }
      return undefined;
    };
    const outer = findApp(r.getRouterState() as NavNode);
    expect(outer?.routes[outer.index ?? outer.routes.length - 1]?.name).toBe('accounts/[id]');
    expect(await pressHardwareBack()).toBe(true);
    expect(r.getPathname()).toBe('/home');
  });

  it('back from You pushed on Activity returns to Activity', async () => {
    const { handle: r } = await mountRouter('/activity');
    await screen.findByText('activity-root');
    await act(async () => router.push('/you'));
    expect(r.getPathname()).toBe('/you');
    expect(await pressHardwareBack()).toBe(true);
    expect(r.getPathname()).toBe('/activity');
  });

  it('SwipeBack is enabled for details and disabled for the tab group (D-07)', () => {
    expect(isSwipeBackRoute('accounts/[id]')).toBe(true);
    expect(isSwipeBackRoute('you')).toBe(true);
    expect(isSwipeBackRoute('(tabs)')).toBe(false);
  });

  it('redirects Home to /setup/account when there is no active account (D-38)', async () => {
    mockAccounts = { data: [], isLoading: false, isError: false };
    const { handle: r } = await mountRouter('/home');
    expect(await screen.findByText('setup-account')).toBeTruthy();
    expect(r.getPathname()).toBe('/setup/account');
  });
});
