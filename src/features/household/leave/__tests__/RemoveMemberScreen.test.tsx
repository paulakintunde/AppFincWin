// 08-24 (HH-13, D-28): the owner removes a member after a clear confirm; the toast offers Undo (reinvite for 24 hours).
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { RemoveMemberScreen, undoRemoval } from '../RemoveMemberScreen';
import { onReinvite, resetReinviteForTests } from '../reinviteRequest';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
const mockGoBack = jest.fn();
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: mockGoBack, history: [] }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));

let mockPairs: Record<string, unknown>[] = [];
jest.mock('@/data/queries/householdBalances', () => ({
  useHouseholdBalances: () => ({ data: { pairs: mockPairs, owedToMe: 0 } }),
  useSettlements: () => ({ data: [] }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));

let mockMembers: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'h' }),
  useHousehold: () => ({ data: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 } }),
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
}));

const mockRemove = jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ ok: true, departure_id: 'd1' }));
jest.mock('@/db/householdDeparture', () => ({
  leaveHousehold: jest.fn(),
  removeMember: (...a: unknown[]) => mockRemove(...a),
  transferOwnership: jest.fn(),
}));
const mockReinvite = jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({
  ok: true, invite_id: 'i1', code: 'ABCD-EFGH', expires_at: '2026-11-17T10:00:00Z',
}));
jest.mock('@/db/memberDepartures', () => ({
  fetchOpenDepartures: jest.fn(async () => []),
  reinviteRemoved: (...a: unknown[]) => mockReinvite(...a),
}));

function member(id: string, name: string | null, colour: number, extra: Record<string, unknown> = {}) {
  return {
    household_id: 'h', user_id: id, is_owner: false, role_label: 'Flatmate', weight: 50, colour_key: colour,
    display_name: name, name_hidden: false, version: 1, created_at: '2026-11-01', ...extra,
  };
}

async function setup(userId: string | null = 'sam') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RemoveMemberScreen userId={userId} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGoBack.mockClear();
  mockRemove.mockClear();
  mockReinvite.mockClear();
  mockPairs = [];
  mockMembers = [member('me', 'Paul', 0, { is_owner: true }), member('sam', 'Sam', 1)];
  resetReinviteForTests();
  resetToastForTests();
});

describe('RemoveMemberScreen', () => {
  it('confirms with the plain body, removes, and the toast offers Undo', async () => {
    await setup();
    expect(screen.getByText('Remove Sam from Flat 4B?')).toBeTruthy();
    expect(screen.getByText(/you can undo this for 24 hours by inviting Sam again/)).toBeTruthy();
    expect(screen.getByText('Keep Sam')).toBeTruthy();
    await fireEvent.press(screen.getByText('Remove Sam'));
    expect(mockRemove).toHaveBeenCalledWith(expect.anything(), 'sam');
    const toast = getToast();
    expect(toast?.text).toEqual({ key: 'household.leave.removed', params: { name: 'Sam' } });
    expect(typeof toast?.onUndo).toBe('function');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('Undo asks for a reinvite and hands the code to the Household home', async () => {
    const got = jest.fn();
    const off = onReinvite(got);
    await undoRemoval('d1');
    expect(mockReinvite).toHaveBeenCalledWith(expect.anything(), 'd1');
    expect(got).toHaveBeenCalledWith({ code: 'ABCD-EFGH', expiresAt: '2026-11-17T10:00:00Z' });
    off();
  });

  it('shows no balance warning without an open balance', async () => {
    await setup();
    expect(screen.queryByTestId('remove-balance-warning')).toBeNull();
  });

  it('shows the owner-side balance warning with an open balance', async () => {
    mockPairs = [{ otherKey: 'sam', net: 4000, pending: 0, lineIds: ['l1'] }];
    await setup();
    expect(screen.getByText('Sam owes you $40.00. It stays as “Sam (left)”.')).toBeTruthy();
  });

  it('a member who is not the owner cannot remove anyone', async () => {
    mockMembers = [member('me', 'Paul', 0), member('sam', 'Sam', 1, { is_owner: true }), member('ana', 'Ana', 2)];
    await setup('ana');
    expect(screen.getByTestId('remove-unavailable')).toBeTruthy();
    expect(screen.queryByText('Remove Ana')).toBeNull();
  });
});
