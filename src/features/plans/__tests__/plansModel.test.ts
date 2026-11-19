import { act, renderHook } from '@testing-library/react-native';
import type { PlanOffer, PlanView } from '../types';
import { fakeStoreState, resetFakeStore, loadOffers } from '../store/fakeStore';

const mockRefresh = jest.fn(() => Promise.resolve());
jest.mock('@/features/plans/PlanHost', () => ({ requestPlanRefresh: (...a: unknown[]) => (mockRefresh as (...x: unknown[]) => Promise<void>)(...a) }));
jest.mock('@/features/plans/store/purchasesClient', () => require('@/features/plans/store/fakeStore'));
let mockPlan: PlanView;
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));

import { plansModel, type PlansModelInput } from '../plansModel';
import { usePurchaseFlow, SLOW_AFTER_MS } from '../usePurchaseFlow';

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'sample', kind: 'none', writable: false, householdId: 'h1', planKey: null, planSize: 0, period: null, seats: 0,
    members: 1, payerId: null, payerIsMe: false, payerName: null, store: null, productId: null, willRenew: false,
    coveredUntil: null, trialEndsAt: null, graceUntil: null, promoKind: null, prelaunch: false, leftGrace: false,
    trialAvailable: true, billingIssueAt: null, loading: false, isError: false, ...over,
  };
}

let offers: PlanOffer[];
beforeEach(async () => {
  resetFakeStore();
  offers = await loadOffers({ platform: 'ios', trialAvailable: true });
  mockRefresh.mockClear();
  mockTrack.mockClear();
  mockPlan = view();
});

function model(over: Partial<PlansModelInput> = {}, plan: Partial<PlanView> = {}) {
  return plansModel({ plan: view(plan), offers, offersError: false, mode: 'first_run', selected: null, platform: 'ios', now: Date.UTC(2026, 10, 19), ...over });
}

describe('plansModel', () => {
  it('uses the trial heading at first run when a trial is available', () => {
    const m = model();
    expect(m.heading).toBe('plans.paywall.heading.trial');
    expect(m.startLine).toBe('plans.paywall.startLine');
  });
  it('uses the locked heading when locked', () => {
    expect(model({ mode: 'locked' }).heading).toBe('plans.paywall.heading.locked');
  });
  it('uses Choose a plan and drops the first sentence when no trial is available', () => {
    const m = model({}, { trialAvailable: false });
    expect(m.heading).toBe('plans.paywall.heading.choose');
    expect(m.startLine).toBe('plans.paywall.startLineNoTrial');
    expect(m.showTrialUsed).toBe(true);
  });
  it('shows only Household and Extended for three members, with the hidden-plans count', () => {
    const m = model({}, { members: 3 });
    expect(m.cards.map((c) => c.planKey)).toEqual(['household', 'extended']);
    expect(m.hiddenPlansCount).toBe(3);
  });
  it('shows all four plans for one member and no hidden line', () => {
    const m = model();
    expect(m.cards.map((c) => c.planKey)).toEqual(['solo', 'duo', 'household', 'extended']);
    expect(m.hiddenPlansCount).toBeNull();
  });
  it('puts the trial chip on Solo and Duo only, and No free trial on Household and Extended', () => {
    const m = model();
    expect(m.cards.map((c) => c.chip)).toEqual([true, true, false, false]);
    expect(m.cards.map((c) => c.noTrial)).toEqual([false, false, true, true]);
  });
  it('drops the chip when the trial is used, and never gives a reason', () => {
    const m = model({}, { trialAvailable: false });
    expect(m.cards.some((c) => c.chip)).toBe(false);
    expect(JSON.stringify(m)).not.toMatch(/device|apple id|email|fraud/i);
  });
  it('selects Yearly by default and prints store prices only', () => {
    const m = model();
    expect(m.selection.period).toBe('year');
    expect(m.cards[0]?.priceMain).toEqual({ key: 'plans.paywall.priceYear', price: offers.find((o) => o.planKey === 'solo' && o.period === 'year')!.priceString });
    expect(m.cards[0]?.priceOther?.key).toBe('plans.paywall.priceOtherMonth');
  });
  it('marks the held plan, disables its button, and says whether other plans take effect now or at renewal', () => {
    const m = model({ selected: { plan: 'duo', period: 'month' } }, { status: 'active', planKey: 'duo', period: 'month', members: 2, coveredUntil: '2027-01-09T00:00:00Z' });
    const duo = m.cards.find((c) => c.planKey === 'duo')!;
    const household = m.cards.find((c) => c.planKey === 'household')!;
    expect(duo.current).toBe(true);
    expect(m.cta.labelKey).toBe('plans.paywall.currentPlan');
    expect(m.cta.disabled).toBe(true);
    expect(household.changeLine?.key).toBe('plans.paywall.takesEffectNow');
  });
  it('says a smaller plan takes effect at renewal, with the date', () => {
    const m = model({ selected: { plan: 'duo', period: 'month' } }, { status: 'active', planKey: 'household', period: 'month', members: 2, coveredUntil: '2027-01-09T00:00:00Z' });
    expect(m.cards.find((c) => c.planKey === 'duo')?.changeLine).toEqual({ key: 'plans.paywall.takesEffectRenewal', date: '2027-01-09T00:00:00Z' });
  });
  it('uses Start 14-day free trial for a trial-able selection', () => {
    const m = model({ selected: { plan: 'solo', period: 'year' } });
    expect(m.cta.labelKey).toBe('plans.paywall.cta.startTrial');
    expect(m.cta.requiresConfirm).toBe(false);
    expect(m.disclosure[0]?.key).toBe('plans.paywall.disclosure.trial');
    expect(m.disclosure[0]?.params?.date).toBe(new Date(Date.UTC(2026, 10, 19) + 14 * 86_400_000).toISOString());
  });
  it('uses Subscribe to {Plan} for a plan with no trial', () => {
    const m = model({ selected: { plan: 'household', period: 'year' } });
    expect(m.cta.labelKey).toBe('plans.paywall.cta.subscribe');
    expect(m.cta.params.plan).toBe('household');
    expect(m.disclosure[0]?.key).toBe('plans.paywall.disclosure.noTrial');
  });
  it('asks for a confirmation on a change from an active plan', () => {
    const m = model({ selected: { plan: 'household', period: 'month' } }, { status: 'active', planKey: 'duo', period: 'month', members: 2 });
    expect(m.cta.labelKey).toBe('plans.paywall.cta.change');
    expect(m.cta.requiresConfirm).toBe(true);
    expect(m.cta.timing).toBe('now');
    expect(m.cta.disabled).toBe(false);
  });
  it('blocks a change while a payment is failing', () => {
    const m = model({ selected: { plan: 'household', period: 'month' } }, { status: 'grace', planKey: 'duo', period: 'month', members: 2, billingIssueAt: '2026-11-01T00:00:00Z' });
    expect(m.blocked).toBe('fixPaymentFirst');
    expect(m.cta.disabled).toBe(true);
  });
  it('reports storeError with no prices when the store failed', () => {
    const m = model({ offers: [], offersError: true });
    expect(m.state).toBe('storeError');
    expect(m.cards.every((c) => c.priceMain === null && c.priceOther === null)).toBe(true);
    expect(m.cta.disabled).toBe(true);
    expect(m.disclosure.map((d) => d.key)).not.toContain('plans.paywall.disclosure.trial');
  });
  it('is loading while offers are null', () => {
    const m = model({ offers: null });
    expect(m.state).toBe('loading');
    expect(m.cta.disabled).toBe(true);
  });
  it('always carries the every-plan, cancel and pledge lines', () => {
    expect(model().disclosure.map((d) => d.key)).toEqual(
      expect.arrayContaining(['plans.paywall.disclosure.everyPlan', 'plans.paywall.disclosure.cancel', 'plans.paywall.pledge']),
    );
  });
});

describe('usePurchaseFlow', () => {
  const solo = () => offers.find((o) => o.planKey === 'solo' && o.period === 'year')!;

  it('asks the server to re-sync after a purchase, then waits and finishes when the plan is writable', async () => {
    const { result, rerender } = await renderHook(() => usePurchaseFlow());
    await act(async () => {
      await result.current.start({ offer: solo(), timing: 'now' });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith({ force: true });
    expect(result.current.state).toBe('waitingServer');
    expect(mockTrack).toHaveBeenCalledWith('trial_started', { plan: 'solo', period: 'year' });
    mockPlan = view({ status: 'trial', writable: true, planKey: 'solo', period: 'year' });
    await rerender({});
    expect(result.current.state).toBe('done');
  });

  it('says slow after 60 seconds of waiting', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => usePurchaseFlow());
      await act(async () => {
        await result.current.start({ offer: solo(), timing: 'now' });
      });
      expect(result.current.state).toBe('waitingServer');
      await act(async () => {
        jest.advanceTimersByTime(SLOW_AFTER_MS + 1);
      });
      expect(result.current.state).toBe('slow');
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns quietly to idle when the person cancels', async () => {
    fakeStoreState.nextPurchase = { kind: 'cancelled' };
    const { result } = await renderHook(() => usePurchaseFlow());
    await act(async () => {
      await result.current.start({ offer: solo(), timing: 'now' });
    });
    expect(result.current.state).toBe('idle');
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('reports a failed purchase and whether the person was charged', async () => {
    fakeStoreState.nextPurchase = { kind: 'failed', notCharged: true };
    const { result } = await renderHook(() => usePurchaseFlow());
    await act(async () => {
      await result.current.start({ offer: solo(), timing: 'now' });
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.notCharged).toBe(true);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('re-syncs the server after a restore that found something, and returns no toast', async () => {
    fakeStoreState.nextRestore = 'restored';
    const { result } = await renderHook(() => usePurchaseFlow());
    let toast: unknown;
    await act(async () => {
      toast = await result.current.restore();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith({ force: true });
    expect(toast).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('plan_restored', { result: 'restored' });
  });

  it('re-syncs even when nothing is found, and returns the nothing toast', async () => {
    const { result } = await renderHook(() => usePurchaseFlow());
    let toast: unknown;
    await act(async () => {
      toast = await result.current.restore();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(toast).toBe('plans.paywall.states.restoreNone');
  });

  it('does not re-sync after a failed restore', async () => {
    fakeStoreState.nextRestore = 'failed';
    const { result } = await renderHook(() => usePurchaseFlow());
    let toast: unknown;
    await act(async () => {
      toast = await result.current.restore();
    });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(toast).toBe('plans.paywall.states.restoreFailed');
  });
});
