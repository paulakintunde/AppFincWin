// 09-14: the paywall, rendered against the fake store (never the real SDK). The plan view and the server refresh are mocked.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { PlanOffer, PlanView } from '../types';
import { fakeStoreState, resetFakeStore } from '../store/fakeStore';

const mockLoadOffers = jest.fn();
jest.mock('@/features/plans/store/purchasesClient', () => {
  const fake = require('@/features/plans/store/fakeStore');
  return { ...fake, loadOffers: (...a: unknown[]) => mockLoadOffers(...a) };
});
jest.mock('@/features/plans/PlanHost', () => ({ requestPlanRefresh: jest.fn(() => Promise.resolve()) }));
let mockPlan: PlanView;
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../ui/Sheet', () => ({ Sheet: () => null }));

import { PlansScreen } from '../PlansScreen';

jest.setTimeout(30000);

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'sample', kind: 'none', writable: false, householdId: 'h1', planKey: null, planSize: 0, period: null, seats: 0,
    members: 1, payerId: null, payerIsMe: false, payerName: null, store: null, productId: null, willRenew: false,
    coveredUntil: null, trialEndsAt: null, graceUntil: null, promoKind: null, prelaunch: false, leftGrace: false,
    trialAvailable: true, billingIssueAt: null, loading: false, isError: false, ...over,
  };
}

async function open(props: React.ComponentProps<typeof PlansScreen> = { mode: 'first_run' }) {
  return render(
    <ThemeProvider>
      <PlansScreen {...props} />
    </ThemeProvider>,
  );
}

const PLEDGE = /won’t go up while your subscription stays active/;

beforeEach(() => {
  resetFakeStore();
  mockReplace.mockClear();
  mockPlan = view();
  const { loadOffers } = jest.requireActual('../store/fakeStore') as { loadOffers: (a: { platform: 'ios' | 'android'; trialAvailable: boolean }) => Promise<PlanOffer[]> };
  mockLoadOffers.mockImplementation(loadOffers);
});

describe('PlansScreen', () => {
  it('renders four plan cards for a one-person home with Yearly selected', async () => {
    await open();
    for (const name of ['Solo', 'Duo', 'Household', 'Extended']) {
      expect(await screen.findByText(name)).toBeTruthy();
    }
    expect(screen.getByRole('tab', { name: 'Yearly' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('tab', { name: 'Monthly' }).props.accessibilityState.selected).toBe(false);
    expect(screen.getByText('Try everything free for 14 days')).toBeTruthy();
    expect(screen.getByText('Start 14-day free trial')).toBeTruthy();
    expect(screen.getAllByText('14 days free')).toHaveLength(2);
    expect(screen.getAllByText('No free trial')).toHaveLength(2);
    expect(screen.getAllByText('Charged in full even if not every place is filled.')).toHaveLength(4);
  });

  it('hides Solo and Duo for three members and says so', async () => {
    mockPlan = view({ members: 3 });
    await open();
    expect(await screen.findByText('Household')).toBeTruthy();
    expect(screen.queryByText('Solo')).toBeNull();
    expect(screen.queryByText('Duo')).toBeNull();
    expect(screen.getByText('Plans for fewer than 3 people are not shown. To choose a smaller plan, remove members first.')).toBeTruthy();
    expect(screen.getByText('See members')).toBeTruthy();
  });

  it('shows no chip, no trial heading and never says which check fired when the trial is used', async () => {
    mockPlan = view({ trialAvailable: false });
    await open();
    expect(await screen.findByText('Solo')).toBeTruthy();
    expect(screen.queryByText('14 days free')).toBeNull();
    expect(screen.queryByText('Try everything free for 14 days')).toBeNull();
    expect(screen.getByText('Choose a plan')).toBeTruthy();
    expect(screen.getByText('A free trial has already been used for this account or home.')).toBeTruthy();
    expect(screen.getByText('Subscribe to Solo')).toBeTruthy();
  });

  it('shows the pledge and the cancel and every-plan lines, with Restore purchases, once ready', async () => {
    await open();
    expect(await screen.findByText(PLEDGE)).toBeTruthy();
    expect(screen.getByText('Every plan includes everything. Plans differ only in how many people they cover.')).toBeTruthy();
    expect(screen.getByText(/Cancel in You > Subscription/)).toBeTruthy();
    expect(screen.getByText(/Renews automatically until cancelled/)).toBeTruthy();
    expect(screen.getByText('Terms of use')).toBeTruthy();
    expect(screen.getByText('Privacy policy')).toBeTruthy();
    expect(screen.getByText('Restore purchases')).toBeTruthy();
  });

  it('shows Restore purchases and the pledge while prices load', async () => {
    mockLoadOffers.mockImplementation(() => new Promise(() => undefined));
    await open();
    expect(await screen.findByText('Restore purchases')).toBeTruthy();
    expect(screen.getByText(PLEDGE)).toBeTruthy();
    expect(screen.getAllByText('...').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Subscribe to|Start 14-day/ }).props.accessibilityState.disabled).toBe(true);
  });

  it('shows the store error, no prices, and Restore purchases when the store fails', async () => {
    mockLoadOffers.mockRejectedValue(new Error('offline'));
    await open();
    expect(await screen.findByText('Plans could not load. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByText('Restore purchases')).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('starts the purchase through the fake store and waits for the server before the lock lifts', async () => {
    const { rerender } = await open();
    const start = await screen.findByText('Start 14-day free trial');
    await act(async () => {
      fireEvent.press(start);
    });
    expect(fakeStoreState.purchases).toHaveLength(1);
    expect(fakeStoreState.purchases[0]?.packageId).toBe('solo_year');
    expect(await screen.findByText('Your purchase went through. Updating your plan...')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    mockPlan = view({ status: 'trial', writable: true, planKey: 'solo', period: 'year' });
    await rerender(
      <ThemeProvider>
        <PlansScreen mode="first_run" />
      </ThemeProvider>,
    );
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
