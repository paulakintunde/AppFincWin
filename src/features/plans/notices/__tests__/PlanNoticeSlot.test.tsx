// 09-19: Home shows one plan notice, Subscription shows all; dismissals, the existing-user card and the takeover toast.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { HouseholdEventRow } from '@/db/householdEvents';
import type { PlanView } from '../../types';

let mockPlan: PlanView;
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u-me' } }) }));
let mockEvents: HouseholdEventRow[] = [];
jest.mock('@/data/queries/household', () => ({ useHouseholdEvents: () => ({ events: mockEvents, unreadCount: 0, isLoading: false }) }));
jest.mock('@/features/plans/notices/doubleCover', () => ({ useDoubleCover: () => ({ data: null }) }));
jest.mock('@/features/plans/notices/DoubleCoverNotice', () => ({ DoubleCoverNotice: () => null }));
let mockCount = 0;
jest.mock('@/features/plans/OfflineSavesNotice', () => {
  const { View } = require('react-native');
  return { useOfflineSavesCount: () => mockCount, OfflineSavesNotice: () => <View testID="offline-probe" /> };
});
let mockSetup: { existingCard: string | null; version: number } | null = null;
jest.mock('@/features/levels/useUserSetup', () => ({ useUserSetup: () => ({ data: mockSetup, loading: false }) }));
const mockSave = jest.fn();
jest.mock('@/data/mutations/userSetup', () => ({ useSaveUserSetup: () => ({ saveUserSetup: (...a: unknown[]) => mockSave(...a) }) }));
jest.mock('@/features/household/useHouseholdScope', () => ({ useHouseholdScope: () => ({ name: 'The Flat' }) }));
jest.mock('@/features/household/useMemberLabel', () => ({ useMemberLabel: () => (id: string | null) => (id === 'u-bea' ? 'Bea' : 'Someone') }));
const mockManage = jest.fn(() => Promise.resolve());
jest.mock('@/features/plans/store/purchasesClient', () => ({
  loadOffers: () => Promise.resolve([{ planKey: 'duo', period: 'month', productId: 'p', priceString: '$9.99', packageId: 'x', hasTrial: false, trialDays: null, currencyCode: 'USD' }]),
  openManageSubscription: () => mockManage(),
}));
jest.mock('@/features/plans/MoveToSoloSheet', () => {
  const { View } = require('react-native');
  return { MoveToSoloSheet: () => <View testID="move-solo-probe" /> };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { NOTICE_DISMISS_STORAGE_KEY, PlanNoticeList, PlanNoticeSlot, TAKEOVER_SEEN_STORAGE_KEY } from '../PlanNoticeSlot';

jest.setTimeout(30000);

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'active', kind: 'active', writable: true, householdId: 'h1', planKey: 'duo', planSize: 2, period: 'month', seats: 2,
    members: 2, payerId: 'u-me', payerIsMe: true, payerName: null, store: 'APP_STORE', productId: 'p', willRenew: true,
    coveredUntil: '2026-12-09T12:00:00Z', trialEndsAt: null, graceUntil: null, promoKind: null, prelaunch: false, leftGrace: false,
    trialAvailable: false, billingIssueAt: null, loading: false, isError: false, ...over,
  };
}

const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;
const memberGrace = () =>
  view({ status: 'grace', payerId: 'u-bea', payerIsMe: false, payerName: 'Bea', graceUntil: '2099-11-30T12:00:00Z', billingIssueAt: '2099-11-18T00:00:00Z' });

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPlan = view();
  mockEvents = [];
  mockCount = 0;
  mockSetup = null;
  mockSave.mockReset();
  mockPush.mockReset();
  mockToast.mockReset();
  mockManage.mockClear();
});

describe('PlanNoticeSlot', () => {
  it('Home shows only the first notice by priority', async () => {
    mockPlan = memberGrace();
    mockSetup = { existingCard: 'pending', version: 3 };
    mockCount = 2;
    await render(wrap(<PlanNoticeSlot />));
    expect(await screen.findByText('Payment failed')).toBeTruthy();
    expect(screen.queryByText('Run setup to simplify the app')).toBeNull();
    expect(screen.queryByTestId('offline-probe')).toBeNull();
  });

  it('Subscription lists every notice in order, the offline notice included', async () => {
    mockPlan = memberGrace();
    mockSetup = { existingCard: 'pending', version: 3 };
    mockCount = 2;
    await render(wrap(<PlanNoticeList />));
    expect(await screen.findByText('Payment failed')).toBeTruthy();
    expect(screen.getByTestId('offline-probe')).toBeTruthy();
    expect(screen.getByText('Run setup to simplify the app')).toBeTruthy();
  });

  it('Not now hides a dismissible notice and remembers it on the phone', async () => {
    mockPlan = memberGrace();
    await render(wrap(<PlanNoticeSlot />));
    await screen.findByText('Payment failed');
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    await waitFor(() => expect(screen.queryByText('Payment failed')).toBeNull());
    const stored = JSON.parse((await AsyncStorage.getItem(NOTICE_DISMISS_STORAGE_KEY))!) as Record<string, string>;
    expect(Object.keys(stored)).toEqual(['paymentFailed']);
  });

  it('existing-user Not now writes the dismissed flag; Run setup opens the rerun', async () => {
    mockSetup = { existingCard: 'pending', version: 3 };
    await render(wrap(<PlanNoticeSlot />));
    await screen.findByText('Run setup to simplify the app');
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    expect(mockSave).toHaveBeenCalledWith({ userId: 'u-me', patch: { existingCard: 'dismissed' }, baseVersion: 3 });
    await act(async () => {
      fireEvent.press(screen.getByText('Run setup'));
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding', params: { mode: 'rerun' } });
  });

  it('payer alone on Duo: Manage opens the store page, Move to Solo opens the sheet', async () => {
    mockPlan = view({ members: 1 });
    await render(wrap(<PlanNoticeSlot />));
    await screen.findByText('Manage subscription');
    await act(async () => {
      fireEvent.press(screen.getByText('Manage subscription'));
    });
    expect(mockManage).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(screen.getByText('Move to Solo'));
    });
    expect(screen.getByTestId('move-solo-probe')).toBeTruthy();
  });

  it('shows the takeover toast once on Home', async () => {
    mockEvents = [
      { id: 'e1', household_id: 'h1', kind: 'plan_takeover', actor_id: null, subject_id: null, ref_id: null, params: { payer: 'u-bea', previous_payer: 'u-x' }, created_at: '2026-11-19T10:00:00Z' },
    ];
    const first = await render(wrap(<PlanNoticeSlot />));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'plans.notices.takeoverDone.toast', params: { name: 'Bea' } } }));
    await waitFor(async () => expect(await AsyncStorage.getItem(TAKEOVER_SEEN_STORAGE_KEY)).toBe('2026-11-19T10:00:00Z'));
    first.unmount();
    await render(wrap(<PlanNoticeSlot />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockToast).toHaveBeenCalledTimes(1);
  });
});
