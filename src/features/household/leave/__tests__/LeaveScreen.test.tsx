// 08-24 (HH-13, D-25..D-28): leave with the owner pick step and the balance warning, and the one-time removed-member sheet.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LeaveScreen } from '../LeaveScreen';
import { RemovedNoticeHost, removedSeenKey } from '../RemovedNoticeHost';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigate = jest.fn();
let mockPath = '/home';
jest.mock('expo-router', () => ({
  router: { navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn() },
  usePathname: () => mockPath,
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
const mockGoBack = jest.fn();
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: mockGoBack, history: [] }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
let mockOnline = true;
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: mockOnline, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));

let mockPairs: Record<string, unknown>[] = [];
let mockSettlements: Record<string, unknown>[] = [];
jest.mock('@/data/queries/householdBalances', () => ({
  useHouseholdBalances: () => ({ data: { pairs: mockPairs, owedToMe: 0 } }),
  useSettlements: () => ({ data: mockSettlements }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));

const mockReset = jest.fn();
let mockMembers: Record<string, unknown>[] = [];
let mockEvents: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'h' }),
  useHousehold: () => ({ data: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 } }),
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
  useHouseholdEvents: () => ({ events: mockEvents, unreadCount: 0, isLoading: false }),
  resetHouseholdScope: (...a: unknown[]) => mockReset(...a),
}));

const mockLeave = jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ ok: true, new_household_id: 'h2', open_balances: [] }));
jest.mock('@/db/householdDeparture', () => ({
  leaveHousehold: (...a: unknown[]) => mockLeave(...a),
  removeMember: jest.fn(),
  transferOwnership: jest.fn(),
}));

function member(id: string, name: string | null, colour: number, extra: Record<string, unknown> = {}) {
  return {
    household_id: 'h', user_id: id, is_owner: false, role_label: 'Flatmate', weight: 50, colour_key: colour,
    display_name: name, name_hidden: false, version: 1, created_at: '2026-11-01', ...extra,
  };
}

async function setup(ui: React.ReactElement = <LeaveScreen />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockReset.mockClear();
  mockLeave.mockClear();
  mockOnline = true;
  mockPath = '/home';
  mockPairs = [];
  mockSettlements = [];
  mockEvents = [];
  mockMembers = [member('me', 'Paul', 0), member('sam', 'Sam', 1, { is_owner: true })];
  await AsyncStorage.clear();
});

describe('LeaveScreen', () => {
  it('a non-owner never sees the pick step and leaves after the confirm', async () => {
    await setup();
    expect(screen.queryByTestId('owner-pick')).toBeNull();
    expect(screen.getByText('Leave Flat 4B?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Leave household'));
    expect(mockLeave).toHaveBeenCalledWith(expect.anything(), null);
    expect(mockReset).toHaveBeenCalledWith(expect.anything(), 'me', 'h');
    expect(await screen.findByTestId('leave-done')).toBeTruthy();
    expect(screen.getByText('You’re no longer in Flat 4B')).toBeTruthy();
  });

  it('an owner must pick the new owner before the confirm', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true }), member('sam', 'Sam', 1), member('ana', 'Ana', 2)];
    await setup();
    expect(screen.getByTestId('owner-pick')).toBeTruthy();
    expect(screen.queryByText('Leave Flat 4B?')).toBeNull();
    // Nothing chosen: the primary cannot go on.
    await fireEvent.press(screen.getByText('Pick someone to continue'));
    expect(screen.queryByText('Leave Flat 4B?')).toBeNull();

    await fireEvent.press(screen.getByTestId('owner-pick-ana'));
    await fireEvent.press(screen.getByText('Make Ana the owner and leave'));
    expect(screen.getByText('Leave Flat 4B?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Leave household'));
    expect(mockLeave).toHaveBeenCalledWith(expect.anything(), 'ana');
  });

  it('shows no balance warning without an open balance', async () => {
    await setup();
    expect(screen.queryByTestId('leave-balance-warning')).toBeNull();
  });

  it('shows the balance warning with an open balance', async () => {
    mockPairs = [{ otherKey: 'sam', net: -4000, pending: 0, lineIds: ['l1'] }];
    await setup();
    expect(screen.getByTestId('leave-balance-warning')).toBeTruthy();
    expect(screen.getByText(/You owe Sam \$40\.00\. It stays on both sides as “Paul \(left\)”/)).toBeTruthy();
  });

  it('says a waiting settle-up will be cancelled', async () => {
    mockSettlements = [
      { id: 's1', status: 'pending', expires_at: null, payer_id: 'me', receiver_id: 'sam', payer_former_key: null, receiver_former_key: null },
    ];
    await setup();
    expect(screen.getByText('Your waiting settle-up with Sam will be cancelled. The balance stays.')).toBeTruthy();
  });

  it('a household of one has nothing to leave', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true })];
    await setup();
    expect(screen.getByTestId('leave-alone')).toBeTruthy();
    expect(screen.queryByText('Leave household')).toBeNull();
  });

  it('offline: the leave button is disabled with the helper', async () => {
    mockOnline = false;
    await setup();
    expect(screen.getByText('Needs a connection. Try again when you’re back online.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Leave household'));
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it('a pick_new_owner refusal goes back to the pick step', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true }), member('sam', 'Sam', 1)];
    mockLeave.mockResolvedValueOnce({ ok: false, reason: 'pick_new_owner' });
    await setup();
    await fireEvent.press(screen.getByTestId('owner-pick-sam'));
    await fireEvent.press(screen.getByText('Make Sam the owner and leave'));
    await fireEvent.press(screen.getByText('Leave household'));
    expect(screen.getByTestId('owner-pick')).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });
});

describe('RemovedNoticeHost', () => {
  const removal = {
    id: 'e1', household_id: 'h', kind: 'removed', actor_id: null, subject_id: 'me', ref_id: 'd1',
    params: { household_name: 'Flat 4B' }, created_at: '2026-11-16T10:00:00Z',
  };

  it('shows "You’re no longer in" once and marks it seen', async () => {
    mockEvents = [removal];
    await setup(<RemovedNoticeHost />);
    expect(await screen.findByText('You’re no longer in Flat 4B')).toBeTruthy();
    await fireEvent.press(screen.getByText('Got it'));
    await waitFor(async () => expect(await AsyncStorage.getItem(removedSeenKey('e1'))).toBe('1'));
  });

  it('stays quiet once seen, and for removals of someone else', async () => {
    await AsyncStorage.setItem(removedSeenKey('e1'), '1');
    mockEvents = [removal, { ...removal, id: 'e2', subject_id: 'sam' }];
    await setup(<RemovedNoticeHost />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('You’re no longer in Flat 4B')).toBeNull();
  });

  it('replaces an open Household screen with Home first', async () => {
    mockPath = '/household';
    mockEvents = [removal];
    await setup(<RemovedNoticeHost />);
    expect(await screen.findByText('You’re no longer in Flat 4B')).toBeTruthy();
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });
});
