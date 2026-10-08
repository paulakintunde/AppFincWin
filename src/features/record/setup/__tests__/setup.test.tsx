// 02-30: the first-account gate, the two onboarding setup screens (D-22) and the routing that
// makes Activity the signed-in landing. Hooks, router and analytics are mocked; this checks wiring.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { needsFirstAccount } from '../firstAccountGate';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockRedirectHref: unknown = null;
jest.mock('expo-router', () => {
  const R = require('react');
  return {
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

let mockCtx = { ready: true, householdId: 'h1' as string | null };
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));
let mockAccounts: { data?: { archived_at: string | null }[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockAccounts }));

jest.mock('../../../../../app/_layout', () => {
  const R = require('react');
  return { RouteContext: R.createContext('app') };
});
jest.mock('@/features/record/activity/ActivityScreen', () => ({ ActivityScreen: () => null }));

import { SetupAccountScreen } from '../SetupAccountScreen';
import { SetupHistoryScreen } from '../SetupHistoryScreen';
import ActivityRoute from '../../../../../app/(app)/activity';
import IndexRoute from '../../../../../app/index';
import { RouteContext } from '../../../../../app/_layout';

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockRedirectHref = null;
  mockSheetProps = null;
  mockCtx = { ready: true, householdId: 'h1' };
  mockAccounts = { data: [], isLoading: false, isError: false };
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
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/setup/history', params: { accountId: 'acc-new' } });
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
    expect(getByText('This file is read on your device and never uploaded.')).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toMatch(/CSV/);
  });

  it('Bring your history tracks the choice and opens the onboarding import for the account', async () => {
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    fireEvent.press(getByText('Bring your history'));
    expect(mockTrack).toHaveBeenCalledWith('onboarding_history_choice', { choice: 'import' });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/import', params: { entry: 'onboarding', accountId: 'acc-1' } });
  });

  it('Start fresh tracks the choice and replaces to Activity', async () => {
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    fireEvent.press(getByText('Start fresh'));
    expect(mockTrack).toHaveBeenCalledWith('onboarding_history_choice', { choice: 'fresh' });
    expect(mockReplace).toHaveBeenCalledWith('/activity');
  });

  it('sends no amounts or names in the event', async () => {
    const { getByText } = await render(wrap(<SetupHistoryScreen accountId="acc-1" />));
    fireEvent.press(getByText('Start fresh'));
    expect(Object.keys(mockTrack.mock.calls[0]![1] as object)).toEqual(['choice']);
  });
});

describe('Activity route first-account gate', () => {
  it('redirects to /setup/account when the household has no active account', async () => {
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBe('/setup/account');
  });
  it('renders Activity when an account exists', async () => {
    mockAccounts = { data: [{ archived_at: null }], isLoading: false, isError: false };
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBeNull();
  });
  it('does not redirect while loading, on a read error or before the context is ready', async () => {
    mockAccounts = { data: undefined, isLoading: true, isError: false };
    await render(wrap(<ActivityRoute />));
    mockAccounts = { data: undefined, isLoading: false, isError: true };
    await render(wrap(<ActivityRoute />));
    mockCtx = { ready: false, householdId: null };
    mockAccounts = { data: [], isLoading: false, isError: false };
    await render(wrap(<ActivityRoute />));
    expect(mockRedirectHref).toBeNull();
  });
});

describe('signed-in landing', () => {
  it('sends a signed-in user to /activity', async () => {
    await render(
      <RouteContext.Provider value="app">
        <IndexRoute />
      </RouteContext.Provider>,
    );
    expect(mockRedirectHref).toBe('/activity');
  });
});
