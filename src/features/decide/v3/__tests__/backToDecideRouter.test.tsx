/**
 * 05.3-114 (UAT gap 33): router-level proof on the REAL (app) and (tabs) layouts that one Back on an answer lands on Decide
 * home with exactly one (tabs), and that a later Back leaves Decide instead of re-opening the answer. The answer route is a
 * stub that runs the real useBackToDecide; the old router.navigate('/decide') pushed a second (tabs) here.
 */
import React from 'react';
import { BackHandler, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetShellStores } from '@/shell/__tests__/testUtils';
import { useBackToDecide } from '../nav/useBackToDecide';
import AppLayout from '../../../../../app/(app)/_layout';
import TabsLayout from '../../../../../app/(app)/(tabs)/_layout';
import IndexRoute from '../../../../../app/index';

jest.setTimeout(120000);

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
jest.mock('@/features/record/entry/ShellEntryHost', () => ({ ShellEntryHost: () => null }));
// The v3 routes are guarded by the per-account switch; this account has it on.
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true, testAccount: false }) }));
jest.mock('@/features/decide/DecideShellHost', () => ({ DecideShellHost: () => null }));
jest.mock('@/features/decide/notifications/useNotificationObserver', () => ({ useNotificationObserver: () => undefined }));
jest.mock('@/features/record/useDeviceHomeCurrencyDefault', () => ({ DeviceHomeCurrencyDefault: () => null }));
jest.mock('@/features/record/samples/SampleBanner', () => ({ SampleBanner: () => null }));
jest.mock('@/features/record/samples/SampleClearPrompts', () => ({ SampleClearPrompts: () => null }));
jest.mock('../../../../../app/_layout', () => {
  const R = require('react');
  return { RouteContext: R.createContext('app') };
});

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};

const listeners: (() => boolean)[] = [];
/** React Native's dispatch: newest listener first, the first to return true consumes the press. */
function dispatchBack(): boolean {
  for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i]!()) return true;
  return false;
}
async function pressBack(): Promise<boolean> {
  let consumed = false;
  await act(async () => {
    consumed = dispatchBack();
  });
  return consumed;
}

function leaf(label: string) {
  return function Leaf() {
    return <Text>{label}</Text>;
  };
}

const ANSWER_LABEL = 'answer-root';
function AnswerLeaf() {
  useBackToDecide(true);
  return <Text>{ANSWER_LABEL}</Text>;
}

type RouteNode = { name: string; index?: number; state?: { index?: number; routes: RouteNode[] } };
type NavNode = { index?: number; routes: RouteNode[] };
function appStack(n: NavNode | undefined): NavNode | undefined {
  for (const route of n?.routes ?? []) {
    if (route.name === '(app)') return route.state;
    const hit = appStack(route.state);
    if (hit) return hit;
  }
  return undefined;
}
function countRoutes(state: NavNode | undefined, name: string): number {
  let n = 0;
  for (const r of state?.routes ?? []) {
    if (r.name === name) n++;
    n += countRoutes(r.state, name);
  }
  return n;
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

async function mountRouter(initialUrl: string) {
  const pending = renderRouter(
    {
      index: IndexRoute,
      '(app)/_layout': AppLayout,
      '(app)/(tabs)/_layout': TabsLayout,
      '(app)/(tabs)/home': leaf('home-root'),
      '(app)/(tabs)/activity': leaf('activity-root'),
      '(app)/(tabs)/decide': leaf('decide-root'),
      '(app)/decide/answer/[id]': AnswerLeaf,
      '(app)/setup/account': leaf('setup-account'),
      '(app)/consent': leaf('consent-root'),
      '(app)/you': leaf('you-root'),
    },
    { initialUrl, wrapper: Wrapper } as never,
  );
  await pending;
  // RNTL 14's render is async; renderRouter attaches getPathname/getRouterState to the pending object, so keep that one.
  return { handle: pending as unknown as { getPathname(): string; getRouterState(): unknown } };
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
afterEach(() => jest.restoreAllMocks());

async function openAnswer(): Promise<void> {
  await act(async () => router.push('/decide/answer/c1' as never));
  expect(await screen.findByText(ANSWER_LABEL)).toBeTruthy();
}

describe('Back from an answer on the real stack (UAT gap 33)', () => {
  it('answer opened over Activity: one Back -> Decide home with one (tabs); Back again does not show the answer', async () => {
    const { handle: r } = await mountRouter('/activity');
    await screen.findByText('activity-root');
    await openAnswer();
    expect(r.getPathname()).toBe('/decide/answer/c1');

    expect(await pressBack()).toBe(true);
    expect(r.getPathname()).toBe('/decide');
    const outer = appStack(r.getRouterState() as never);
    expect(outer?.routes.map((x) => x.name)).toEqual(['(tabs)']);
    expect(countRoutes(r.getRouterState() as never, '(tabs)')).toBe(1);

    await pressBack();
    expect(r.getPathname()).not.toBe('/decide/answer/c1');
    expect(r.getPathname()).not.toBe('/decide');
    expect(screen.queryByText(ANSWER_LABEL)).toBeNull();
  });

  it('answer opened from Decide: one Back -> Decide home with one (tabs)', async () => {
    const { handle: r } = await mountRouter('/decide');
    await screen.findByText('decide-root');
    await openAnswer();
    expect(await pressBack()).toBe(true);
    expect(r.getPathname()).toBe('/decide');
    expect(appStack(r.getRouterState() as never)?.routes.map((x) => x.name)).toEqual(['(tabs)']);
  });

  it('two Backs in the same tick navigate once; a Back after the answer is focused again is honoured at once', async () => {
    const { handle: r } = await mountRouter('/activity');
    await screen.findByText('activity-root');
    await openAnswer();
    await act(async () => {
      dispatchBack();
      dispatchBack();
    });
    expect(r.getPathname()).toBe('/decide');
    expect(countRoutes(r.getRouterState() as never, '(tabs)')).toBe(1);

    // No time window: the answer is opened again straight away and its first Back works.
    await openAnswer();
    expect(await pressBack()).toBe(true);
    expect(r.getPathname()).toBe('/decide');
    expect(countRoutes(r.getRouterState() as never, '(tabs)')).toBe(1);
  });
});
