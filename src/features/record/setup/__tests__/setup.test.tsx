// 02-30: the first-account gate, the two onboarding setup screens (D-22) and the routing that
// makes Home the signed-in landing. Hooks, router and analytics are mocked; this checks wiring.
import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { needsFirstAccount } from '../firstAccountGate';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockRedirectHref: unknown = null;
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('expo-router', () => {
  const R = require('react');
  return {
    useSegments: () => [],
    router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a) },
    Redirect: ({ href }: { href: unknown }) => {
      mockRedirectHref = href;
      return R.createElement(R.Fragment);
    },
  };
});

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

let mockSheetProps: { mode: unknown; visible: boolean; onClose: () => void; onSaved?: (id: string) => void } | null = null;
jest.mock('@/features/record/accounts/AccountSheet', () => {
  const R = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    AccountSheet: (props: { mode: unknown; visible: boolean; onClose: () => void; onSaved?: (id: string) => void }) => {
      mockSheetProps = props;
      if (!props.visible) return null;
      return R.createElement(
        View,
        null,
        R.createElement(Pressable, { onPress: () => props.onSaved?.('acc-new') }, R.createElement(Text, null, 'sheet')),
        R.createElement(Pressable, { onPress: () => props.onClose() }, R.createElement(Text, null, 'sheet-cancel'))
      );
    },
  };
});

let mockCtx = { ready: true, householdId: 'h1' as string | null, userId: 'u1' as string | null, today: '2026-10-09' };
const mockSeed = jest.fn();
let mockSeedPending = false;
jest.mock('@/data/mutations/sampleData', () => ({
  useSampleData: () => ({ seed: mockSeed, clear: jest.fn(), declinePrompt: jest.fn(), pending: mockSeedPending }),
}));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));
let mockAccounts: { data?: { archived_at: string | null }[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
// 06.1-72: the app layouts wrap Decide screens in DecideV3Scope; here it only passes its children through.
jest.mock('@/data/queries/decideV3', () => ({ DecideV3Scope: ({ children }: { children: unknown }) => children }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockAccounts }));
// 09: the plan shell (lock host, lock banner, write gate) reads plan_state through React Query; these suites test the shell
// layout, so the plan is a writable tester household and the plan hosts render nothing (like PlanHost).
jest.mock('@/features/plans/LockHost', () => ({ LockHost: () => null }));
// 09-23: the root entry reads the signed-in user, the setup row and the household before landing; a finished setup in a
// home of one lands on Home.
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'u1' } }) }));
jest.mock('@/data/queries/userSetup', () => ({
  useUserSetupQuery: () => ({ data: { completedAt: '2026-11-01T00:00:00Z', level: 4, partnerVersion: false }, isError: false }),
  useFeatureSwitches: () => ({ data: {} }),
}));
jest.mock('@/data/queries/household', () => ({
  ...jest.requireActual('@/data/queries/household'),
  useHousehold: () => ({ data: null, isLoading: false, isError: false }),
}));
jest.mock('@/features/plans/LockBanner', () => ({ LockBanner: () => null }));
jest.mock('@/features/plans/usePlanState', () => ({
  usePlanState: () => ({ status: 'tester', writable: true, prelaunch: true, loading: false, isError: false }),
}));

jest.mock('../../../../../app/_layout', () => {
  const R = require('react');
  return { RouteContext: R.createContext('app') };
});
jest.mock('@/features/record/activity/ActivityScreen', () => ({ ActivityScreen: () => null }));
jest.mock('@/shell/tabBar/TabBar', () => ({ TabBar: () => null }));
jest.mock('@/shell/fab/Fab', () => ({ Fab: () => null }));
jest.mock('@/shell/fab/FabQuickMenu', () => ({ FabQuickMenu: () => null }));
jest.mock('@/features/record/entry/ShellEntryHost', () => ({ ShellEntryHost: () => null }));
jest.mock('@/features/decide/DecideShellHost', () => ({ DecideShellHost: () => null }));
jest.mock('@/features/decide/shadow/DecideShadowHost', () => ({ DecideShadowHost: () => null }));
jest.mock('@/shell/fab/FabProvider', () => ({ FabProvider: ({ children }: { children: React.ReactNode }) => children }));
// 09-24: the gate reads the plan; a paid plan keeps the first-account redirect, 'sample' (the pre-trial look-around) skips it.
let mockPlan: { status: string; loading: boolean; writable?: boolean } = { status: 'trial', loading: false, writable: true };
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
jest.mock('@/features/plans/LockBanner', () => ({ LockBanner: () => null }));
jest.mock('@/features/onboarding/SampleBar', () => ({ SampleBar: () => null }));
jest.mock('@/features/onboarding/SampleHost', () => ({ SampleHost: () => null }));
jest.mock('expo-router/js-tabs', () => ({ Tabs: Object.assign(() => null, { Screen: () => null }) }));

import { setPlanWriteState } from '@/data/sync/planWriteGuard';
import { SetupAccountScreen } from '../SetupAccountScreen';
import { SetupHistoryScreen } from '../SetupHistoryScreen';
import ActivityRoute from '../../../../../app/(app)/(tabs)/_layout';
import IndexRoute from '../../../../../app/index';
import { RouteContext } from '../../../../../app/_layout';

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockRedirectHref = null;
  mockSheetProps = null;
  mockCtx = { ready: true, householdId: 'h1', userId: 'u1', today: '2026-10-09' };
  mockSeedPending = false;
  mockSeed.mockResolvedValue(true);
  mockAccounts = { data: [], isLoading: false, isError: false };
  mockPlan = { status: 'trial', loading: false, writable: true };
});

describe('needsFirstAccount', () => {
  it('never fires while loading or on a read error', () => {
    expect(needsFirstAccount({ loading: true })).toBe(false);
    expect(needsFirstAccount({ loading: false, isError: true, accounts: [] })).toBe(false);
    expect(needsFirstAccount({ loading: false })).toBe(false);
  });
  it('fires for no accounts or only archived accounts', () => {
    expect(needsFirstAccount({ loading: false, accounts: [] })).toBe(true);
    expect(needsFirstAccount({ loading: false, accounts: [{ archived_at: '2026-01-01T00:00:00Z' }] })).toBe(true);
  });
  it('does not fire with any active account', () => {
    expect(
      needsFirstAccount({ loading: false, accounts: [{ archived_at: '2026-01-01T00:00:00Z' }, { archived_at: null }] }),
    ).toBe(false);
  });
});

describe('SetupAccountScreen', () => {
  it('shows the heading and body, opens the sheet in onboarding context and moves on when saved', async () => {
    const { getByText } = await render(wrap(<SetupAccountScreen />));
    expect(getByText('Your first account')).toBeTruthy();
    expect(getByText('Add the account you use most. More can be added later.')).toBeTruthy();
    expect(mockSheetProps!.mode).toEqual({ kind: 'new', context: 'onboarding' });
    fireEvent.press(getByText('sheet'));
    // Owner 2026-11-11: onboarding order is account -> quick estimates -> import history (the estimates return to /setup/history).
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/decide/setup/quick-estimates',
      params: { returnTo: '/setup/history?accountId=acc-new' },
    });
  });

  it('S-WR-11: Cancel closes the sheet and offers a way to You (sign out or delete) and back to the sheet', async () => {
    const { getByText, queryByText, getByRole } = await render(wrap(<SetupAccountScreen />));
    await fireEvent.press(getByText('sheet-cancel'));
    expect(queryByText('sheet')).toBeNull();
    await fireEvent.press(getByRole('button', { name: 'Sign out or delete your account' }));
    expect(mockPush).toHaveBeenCalledWith('/you');
    await fireEvent.press(getByRole('button', { name: 'Add an account' }));
    expect(getByText('sheet')).toBeTruthy();
  });

  it('S-WR-11: You stays reachable for an account-less user (the gate is only on Activity)', async () => {
    mockAccounts = { data: [], isLoading: false, isError: false };
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBe('/setup/account');
  });
});

describe('SetupHistoryScreen', () => {
  it('shows the statement copy and never the word CSV', async () => {
    const { getByText, toJSON } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    expect(getByText('Bring your history?')).toBeTruthy();
    expect(getByText('Import a statement from your bank, or start with an empty month.')).toBeTruthy();
    expect(getByText('PDF statements are read on our server in the United States and deleted straight after. CSV and OFX files never leave your phone.')).toBeTruthy();
    // The privacy line names CSV/OFX deliberately (it must be true wherever a statement can be picked); the rest must not.
    expect(JSON.stringify(toJSON()).replace(/CSV and OFX files never leave your phone./, '')).not.toMatch(/CSV/);
  });

  it('Bring your history tracks the choice and opens the onboarding import for the account', async () => {
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    fireEvent.press(getByText('Bring your history'));
    expect(mockTrack).toHaveBeenCalledWith('onboarding_history_choice', { choice: 'import' });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/import', params: { entry: 'onboarding', accountId: 'acc-1' } });
  });

  it('Start fresh tracks the choice and replaces to Home', async () => {
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    fireEvent.press(getByText('Start fresh'));
    expect(mockTrack).toHaveBeenCalledWith('onboarding_history_choice', { choice: 'fresh' });
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('Explore with sample figures tracks the choice, seeds and opens Home', async () => {
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    await fireEvent.press(getByText('Explore with sample figures'));
    expect(mockTrack).toHaveBeenCalledWith('onboarding_history_choice', { choice: 'sample' });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
    expect(mockSeed).toHaveBeenCalledTimes(1);
  });

  it('a failed seed shows the message and stays on the screen', async () => {
    mockSeed.mockResolvedValue(false);
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    await fireEvent.press(getByText('Explore with sample figures'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'samples.seedFailed' } }));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('the Explore button is disabled while seeding', async () => {
    mockSeedPending = true;
    const { getByLabelText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    expect(getByLabelText('Explore with sample figures').props.accessibilityState.disabled).toBe(true);
  });

  it('sends no amounts or names in the event', async () => {
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    fireEvent.press(getByText('Start fresh'));
    expect(Object.keys(mockTrack.mock.calls[0]![1] as object)).toEqual(['choice']);
  });
});

describe('Tabs layout first-account gate', () => {
  it('redirects to /setup/account when the household has no active account', async () => {
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBe('/setup/account');
  });
  it('renders the tabs when an account exists', async () => {
    mockAccounts = { data: [{ archived_at: null }], isLoading: false, isError: false };
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBeNull();
  });
  it('does not redirect while loading, on a read error or before the context is ready', async () => {
    mockAccounts = { data: undefined, isLoading: true, isError: false };
    await render(wrap(<ActivityRoute />));
    mockAccounts = { data: undefined, isLoading: false, isError: true };
    await render(wrap(<ActivityRoute />));
    mockCtx = { ready: false, householdId: null, userId: null, today: '2026-10-09' };
    mockAccounts = { data: [], isLoading: false, isError: false };
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBeNull();
  });
  it('09-24: does not redirect in the pre-trial look-around (plan status sample) or while the plan is unknown', async () => {
    mockPlan = { status: 'sample', loading: false };
    await render(wrap(<ActivityRoute />));
    mockPlan = { status: 'sample', loading: true };
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBeNull();
  });
  it('09-25 A5-3: a locked (read-only) home with no account reads its tabs and is never sent to /setup/account', async () => {
    mockPlan = { status: 'locked', loading: false, writable: false };
    mockAccounts = { data: [], isLoading: false, isError: false };
    const view = await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBeNull();
    expect(view.toJSON()).not.toBeNull();
  });
  it('09-25 A5-3: draws nothing while the plan is unknown, so neither path is taken on a guess', async () => {
    mockPlan = { status: 'sample', loading: true, writable: false };
    const view = await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBeNull();
    expect(view.toJSON()).toBeNull();
  });
});

describe('09-25 A5-3: SetupAccountScreen in a locked home', () => {
  afterEach(async () => {
    await act(() => setPlanWriteState(null));
  });
  it('goes on to Activity and never opens the new-account sheet', async () => {
    setPlanWriteState({ status: 'locked', writable: false, loading: false });
    await render(wrap(<SetupAccountScreen />));
    expect(mockRedirectHref).toBe('/activity');
    expect(mockSheetProps).toBeNull();
  });
  it('a writable plan still gets the first-account sheet', async () => {
    setPlanWriteState({ status: 'trial', writable: true, loading: false });
    await render(wrap(<SetupAccountScreen />));
    expect(mockRedirectHref).toBeNull();
    expect(mockSheetProps!.visible).toBe(true);
  });
});

describe('signed-in landing', () => {
  it('sends a signed-in user to /home', async () => {
    await render(
      <RouteContext.Provider value="app">
        <IndexRoute />
      </RouteContext.Provider>,
    );
    expect(mockRedirectHref).toBe('/home');
  });
});
