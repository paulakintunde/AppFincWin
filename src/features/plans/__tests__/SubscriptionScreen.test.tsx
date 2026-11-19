// 09-15: You > Subscription, rendered against the fake store (never the real SDK). Plan view, scope and router are mocked.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { PlanView } from '../types';
import { fakeStoreState, resetFakeStore } from '../store/fakeStore';

jest.mock('@/features/plans/store/purchasesClient', () => require('@/features/plans/store/fakeStore'));
jest.mock('@/features/plans/PlanHost', () => ({ requestPlanRefresh: jest.fn(() => Promise.resolve()) }));
let mockPlan: PlanView;
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/shell/header/BackButton', () => ({ BackButton: () => null }));
jest.mock('@/features/plans/notices/PlanNoticeSlot', () => {
  const { View } = require('react-native');
  return { PlanNoticeList: () => <View testID="plan-notice-list" /> };
});
jest.mock('@/features/household/useHouseholdScope', () => ({ useHouseholdScope: () => ({ name: 'The Flat' }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../ui/Sheet', () => {
  const { View } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});

import { SubscriptionScreen } from '../SubscriptionScreen';

jest.setTimeout(30000);

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'sample', kind: 'none', writable: false, householdId: 'h1', planKey: null, planSize: 0, period: null, seats: 0,
    members: 1, payerId: null, payerIsMe: false, payerName: null, store: null, productId: null, willRenew: false,
    coveredUntil: null, trialEndsAt: null, graceUntil: null, promoKind: null, prelaunch: false, leftGrace: false,
    trialAvailable: true, billingIssueAt: null, loading: false, isError: false, ...over,
  };
}

const payerTrial = view({
  status: 'trial', kind: 'trial', writable: true, payerIsMe: true, planKey: 'duo', planSize: 2, period: 'year', seats: 2, members: 2,
  trialEndsAt: '2026-12-04T18:42:00Z', coveredUntil: '2026-12-04T18:42:00Z', store: 'PLAY_STORE', productId: 'fincwin.duo.year',
});

async function open() {
  return render(
    <ThemeProvider>
      <SubscriptionScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  resetFakeStore();
  mockPush.mockClear();
  mockPlan = view();
});

describe('SubscriptionScreen', () => {
  it('payer on trial: Manage is the first button, then Change plan and Restore; trial end and first charge show', async () => {
    mockPlan = payerTrial;
    await open();
    expect(await screen.findByText('Manage subscription')).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]?.props.accessibilityLabel ?? '').toContain('Manage subscription');
    const names = buttons.map((b) => String(b.props.accessibilityLabel ?? ''));
    expect(names.findIndex((n) => n.includes('Change plan'))).toBeGreaterThan(0);
    expect(names.findIndex((n) => n.includes('Restore purchases'))).toBeGreaterThan(names.findIndex((n) => n.includes('Change plan')));
    expect(screen.getByText('Opens App Store')).toBeTruthy();
    expect(screen.getByText('Free trial')).toBeTruthy();
    expect(screen.getByText('Duo · 2 people')).toBeTruthy();
    expect(screen.getByText(/\(your time\)/)).toBeTruthy();
    expect(await screen.findByText('$70.99 a year')).toBeTruthy();
    expect(screen.getByText('2 of 2 in use')).toBeTruthy();
    expect(screen.getByText('When a plan ends, FincWin becomes read-only. You can still export your data.')).toBeTruthy();
  });

  it('Manage subscription opens the store page through the client and never cancels in the app', async () => {
    mockPlan = payerTrial;
    await open();
    await fireEvent.press(await screen.findByText('Manage subscription'));
    expect(fakeStoreState.manageOpened).toBe(1);
  });

  it('member of a covered home: the card, Restore, no Manage; Start your own plan asks first, then opens leave as Solo', async () => {
    mockPlan = view({ status: 'active', kind: 'active', writable: true, payerName: 'Sam', seats: 4, planKey: 'household', coveredUntil: '2027-03-01T12:00:00Z' });
    await open();
    expect(await screen.findByText('Your home already has a plan')).toBeTruthy();
    expect(screen.getByText('Sam pays for it. It covers up to 4 people until Mar 1, 2027.')).toBeTruthy();
    expect(screen.queryByText('Manage subscription')).toBeNull();
    expect(screen.getByText('Restore purchases')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start your own plan'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Solo covers one person. Starting it means leaving The Flat.')).toBeTruthy();
    expect(screen.getByText('Stay in The Flat')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/household/leave', params: { mode: 'solo' } });
  });

  it('tester sees Free access with the end date and no Manage', async () => {
    mockPlan = view({ status: 'tester', kind: 'promo', promoKind: 'tester', writable: true, coveredUntil: '2027-02-01T12:00:00Z' });
    await open();
    expect(await screen.findByText('Free access')).toBeTruthy();
    expect(screen.getByText('Feb 1, 2027')).toBeTruthy();
    expect(screen.getByText('Free access for testers ends on Feb 1, 2027. After that, the normal plans apply.')).toBeTruthy();
    expect(screen.queryByText('Manage subscription')).toBeNull();
  });

  it('the owner sees Free access with no date', async () => {
    mockPlan = view({ status: 'tester', kind: 'promo', promoKind: 'owner', writable: true });
    await open();
    expect(await screen.findByText('Free access')).toBeTruthy();
    expect(screen.queryByText('Free until')).toBeNull();
  });

  it('no plan yet: the entry card offers the trial', async () => {
    await open();
    expect(await screen.findByText('No plan yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start 14-day free trial'));
    expect(mockPush).toHaveBeenCalled();
  });

  it('locked: Read-only badge and Change plan opens the locked paywall', async () => {
    mockPlan = view({ status: 'locked', kind: 'lapsed', payerIsMe: true, planKey: 'solo', planSize: 1 });
    await open();
    expect(await screen.findByText('Read-only')).toBeTruthy();
    await fireEvent.press(screen.getByText('Change plan'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/plans', params: { mode: 'locked', trigger: 'change_plan' } });
  });

  it('always shows the pledge with Terms and Privacy links', async () => {
    await open();
    expect(await screen.findByText(/won’t go up while your subscription stays active/)).toBeTruthy();
    expect(screen.getByText('Terms of use')).toBeTruthy();
    expect(screen.getByText('Privacy policy')).toBeTruthy();
  });
});
