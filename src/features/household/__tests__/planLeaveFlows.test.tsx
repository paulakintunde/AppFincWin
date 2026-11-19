/* eslint-disable @typescript-eslint/no-require-imports */
// 09-20 (D-14, D-41..D-44): the leave lines, "Leave and continue on Solo", "Start your own plan" and "Move to Solo", against
// the fake store. The plan view, the household and the server calls are mocked; prices are the fake store's strings.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { PlanView } from '@/features/plans/types';
import { formatPlanDate } from '@/features/plans/formatPlanDate';
import { fakeStoreState, resetFakeStore } from '@/features/plans/store/fakeStore';
import { MoveToSoloSheet } from '@/features/plans/MoveToSoloSheet';
import { LeaveScreen } from '../leave/LeaveScreen';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockLoadOffers = jest.fn();
jest.mock('@/features/plans/store/purchasesClient', () => {
  const fake = require('@/features/plans/store/fakeStore');
  return { ...fake, loadOffers: (...a: unknown[]) => mockLoadOffers(...a) };
});
jest.mock('@/features/plans/PlanHost', () => ({ requestPlanRefresh: jest.fn(() => Promise.resolve()) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    navigate: (...a: unknown[]) => mockNavigate(...a),
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
  },
}));
const mockGoBack = jest.fn();
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: mockGoBack, history: [] }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null }),
}));
jest.mock('@/data/queries/householdBalances', () => ({
  useHouseholdBalances: () => ({ data: { pairs: [], owedToMe: 0 } }),
  useSettlements: () => ({ data: [] }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
const mockReset = jest.fn();
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'h' }),
  useHousehold: () => ({ data: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'sam', version: 1 } }),
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
  resetHouseholdScope: (...a: unknown[]) => mockReset(...a),
}));
const calls: string[] = [];
const mockLeave = jest.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => {
  calls.push('leave');
  return { ok: true, new_household_id: 'h2', open_balances: [] };
});
jest.mock('@/db/householdDeparture', () => ({
  leaveHousehold: (...a: unknown[]) => mockLeave(...a),
  removeMember: jest.fn(),
  transferOwnership: jest.fn(),
}));
let mockPlan: PlanView;
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));

let mockMembers: Record<string, unknown>[] = [];
function member(id: string, name: string, colour: number, extra: Record<string, unknown> = {}) {
  return {
    household_id: 'h',
    user_id: id,
    is_owner: false,
    role_label: 'Flatmate',
    weight: 50,
    colour_key: colour,
    display_name: name,
    name_hidden: false,
    version: 1,
    created_at: '2026-11-01',
    ...extra,
  };
}
function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'active',
    kind: 'active',
    writable: true,
    householdId: 'h',
    planKey: 'duo',
    planSize: 2,
    period: 'year',
    seats: 2,
    members: 2,
    payerId: 'sam',
    payerIsMe: false,
    payerName: 'Sam',
    store: 'APP_STORE',
    productId: 'fincwin.duo.year',
    willRenew: true,
    coveredUntil: '2027-03-01T00:00:00Z',
    trialEndsAt: null,
    graceUntil: null,
    promoKind: null,
    prelaunch: false,
    leftGrace: false,
    trialAvailable: false,
    billingIssueAt: null,
    loading: false,
    isError: false,
    ...over,
  };
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{node}</ThemeProvider>
    </QueryClientProvider>
  );
}

const SOLO_BODY =
  'You leave Flat 4B and keep your own records. Solo covers one person: $40.99 a year. Access returns when the purchase goes through.';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetFakeStore();
  calls.length = 0;
  [mockNavigate, mockReplace, mockPush, mockGoBack, mockReset, mockLeave].forEach((m) => m.mockClear());
  mockLoadOffers.mockImplementation((args: { platform: 'ios' | 'android'; trialAvailable: boolean }) => {
    const { loadOffers } = jest.requireActual('@/features/plans/store/fakeStore') as { loadOffers: (a: typeof args) => Promise<unknown> };
    return loadOffers(args);
  });
  mockMembers = [member('me', 'Paul', 0), member('sam', 'Sam', 1, { is_owner: true })];
  mockPlan = view();
});

describe('LeaveScreen plan lines', () => {
  it('tells a member of a covered home what happens to access, with a Continue on Solo link, and keeps the confirm danger', async () => {
    await render(wrap(<LeaveScreen />));
    const line = await screen.findByTestId('leave-plan-member');
    expect(line).toBeTruthy();
    expect(screen.getByText(/You will have full access for 7 days after leaving/)).toBeTruthy();
    expect(screen.getByText('Continue on Solo')).toBeTruthy();
    expect(screen.queryByTestId('leave-plan-payer')).toBeNull();
    expect(screen.getByText('Leave household')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeTruthy();
  });

  it('tells the payer that leaving does not cancel the subscription', async () => {
    mockPlan = view({ payerIsMe: true, payerId: 'me', payerName: 'Paul' });
    mockMembers = [member('me', 'Paul', 0), member('sam', 'Sam', 1, { is_owner: true })];
    await render(wrap(<LeaveScreen />));
    expect(await screen.findByTestId('leave-plan-payer')).toBeTruthy();
    expect(screen.getByText(/Leaving does not cancel your subscription/)).toBeTruthy();
    expect(screen.queryByTestId('leave-plan-member')).toBeNull();
  });

  it('shows no plan line when no plan covers the home', async () => {
    mockPlan = view({ status: 'tester', kind: 'prelaunch', planKey: null, planSize: 0 });
    await render(wrap(<LeaveScreen />));
    await screen.findByText('Leave household');
    expect(screen.queryByTestId('leave-plan-member')).toBeNull();
    expect(screen.queryByTestId('leave-plan-payer')).toBeNull();
  });
});

describe('Leave and continue on Solo', () => {
  it('opens the 8d sheet in mode solo with the store price and the two labels', async () => {
    await render(wrap(<LeaveScreen mode="solo" />));
    await waitFor(() => expect(screen.getByText(SOLO_BODY)).toBeTruthy());
    expect(screen.getAllByText('Leave and continue on Solo').length).toBeGreaterThan(0);
    expect(screen.getByText('Leave and subscribe')).toBeTruthy();
    expect(screen.getByText('Stay in Flat 4B')).toBeTruthy();
    // the trial is a first-plan offer: this flow asks the store for the no-trial offer
    expect(mockLoadOffers).toHaveBeenCalledWith(expect.objectContaining({ trialAvailable: false }));
  });

  it('leaves first, then buys Solo without a trial, then waits for the server', async () => {
    await render(wrap(<LeaveScreen mode="solo" />));
    await waitFor(() => expect(screen.getByText(SOLO_BODY)).toBeTruthy());
    await fireEvent.press(screen.getByText('Leave and subscribe'));
    await waitFor(() => expect(mockLeave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fakeStoreState.purchases).toHaveLength(1));
    expect(fakeStoreState.purchases[0]!.packageId).toBe('solo_year');
    expect(mockReset).toHaveBeenCalled();
    expect(await screen.findByTestId('leave-buying')).toBeTruthy();
    // access has not returned until the server says so
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('lands on the lock explainer when the purchase fails after the leave', async () => {
    fakeStoreState.nextPurchase = { kind: 'failed', notCharged: true };
    await render(wrap(<LeaveScreen mode="solo" />));
    await waitFor(() => expect(screen.getByText(SOLO_BODY)).toBeTruthy());
    await fireEvent.press(screen.getByText('Leave and subscribe'));
    await waitFor(() => expect(mockLeave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/plan-ended'));
  });

  it('stays in the home on "Stay in Flat 4B" and does not leave', async () => {
    await render(wrap(<LeaveScreen mode="solo" />));
    await waitFor(() => expect(screen.getByText('Stay in Flat 4B')).toBeTruthy());
    await fireEvent.press(screen.getByText('Stay in Flat 4B'));
    expect(mockLeave).not.toHaveBeenCalled();
    expect(mockGoBack).toHaveBeenCalled();
    expect(fakeStoreState.purchases).toHaveLength(0);
  });

  it('opens the sheet from the Continue on Solo link on the normal leave screen', async () => {
    await render(wrap(<LeaveScreen />));
    await fireEvent.press(await screen.findByTestId('leave-continue-solo'));
    await waitFor(() => expect(screen.getByText(SOLO_BODY)).toBeTruthy());
  });

  it('asks "Start your own plan" first, with the exact short body, then shows the 8d sheet', async () => {
    await render(wrap(<LeaveScreen mode="own" />));
    await waitFor(() => expect(screen.getByText('Solo covers one person. Starting it means leaving Flat 4B.')).toBeTruthy());
    expect(screen.getByText('Start your own plan')).toBeTruthy();
    expect(mockLeave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText(SOLO_BODY)).toBeTruthy());
    expect(mockLeave).not.toHaveBeenCalled();
  });
});

describe('MoveToSoloSheet', () => {
  const onClose = jest.fn();
  beforeEach(() => {
    onClose.mockClear();
  });

  it('asks to remove the other members first and has no confirm while others remain', async () => {
    mockPlan = view({ payerIsMe: true, members: 2 });
    await render(wrap(<MoveToSoloSheet visible onClose={onClose} />));
    expect(screen.getByText('To move to Solo, remove other members first.')).toBeTruthy();
    expect(screen.getAllByText('Move to Solo')).toHaveLength(1);
    await fireEvent.press(screen.getByText('See members'));
    expect(mockPush).toHaveBeenCalledWith('/household');
    expect(fakeStoreState.purchases).toHaveLength(0);
  });

  it('says Solo starts at the next renewal and moves the plan with the deferred timing', async () => {
    mockPlan = view({ payerIsMe: true, payerId: 'me', payerName: 'Paul', members: 1 });
    await render(wrap(<MoveToSoloSheet visible onClose={onClose} />));
    const date = formatPlanDate('2027-03-01T00:00:00Z');
    expect(screen.getByText(`Solo takes effect at your next renewal on ${date}. Until then you keep the spare places.`)).toBeTruthy();
    expect(screen.getByText('Keep my plan')).toBeTruthy();
    await waitFor(() => expect(mockLoadOffers).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    await fireEvent.press(screen.getAllByText('Move to Solo').at(-1)!);
    await waitFor(() => expect(fakeStoreState.purchases.map((p) => p.packageId)).toEqual(['solo_year']));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('closes on "Keep my plan" without any store call', async () => {
    mockPlan = view({ payerIsMe: true, payerId: 'me', payerName: 'Paul', members: 1 });
    await render(wrap(<MoveToSoloSheet visible onClose={onClose} />));
    await fireEvent.press(screen.getByText('Keep my plan'));
    expect(onClose).toHaveBeenCalled();
    expect(fakeStoreState.purchases).toHaveLength(0);
  });
});
