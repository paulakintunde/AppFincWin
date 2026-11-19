// 09-15: the Subscription model, one case per variant in the plan's behaviour list. Pure: no store, no React.
import { dateIn, subscriptionModel, timeIn, variantFor, type SubscriptionCtx } from '../subscriptionModel';
import type { PlanView } from '../types';

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'sample', kind: 'none', writable: false, householdId: 'h1', planKey: null, planSize: 0, period: null, seats: 0,
    members: 1, payerId: null, payerIsMe: false, payerName: null, store: null, productId: null, willRenew: false,
    coveredUntil: null, trialEndsAt: null, graceUntil: null, promoKind: null, prelaunch: false, leftGrace: false,
    trialAvailable: true, billingIssueAt: null, loading: false, isError: false, ...over,
  };
}

const ctx = (over: Partial<SubscriptionCtx> = {}): SubscriptionCtx => ({
  platform: 'android', offerPrice: '$69.99', homeName: 'The Flat', planName: 'Duo', tz: 'UTC', locale: 'en', now: 0, ...over,
});

const trial = view({
  status: 'trial', kind: 'trial', payerIsMe: true, planKey: 'duo', planSize: 2, period: 'year', seats: 2, members: 2,
  trialEndsAt: '2026-12-04T18:42:00Z', coveredUntil: '2026-12-04T18:42:00Z', store: 'PLAY_STORE', productId: 'fincwin.duo.year',
});

describe('subscriptionModel', () => {
  it('payer on trial: Manage first with the store named, plan, paid by, trial end with zone, first charge', () => {
    const m = subscriptionModel(trial, ctx());
    expect(m.variant).toBe('payer');
    expect(m.showManage).toBe(true);
    expect(m.manageSubParams).toEqual({ store: 'Google Play' });
    expect(m.badge).toBe('trial');
    expect(m.rows.map((r) => r.id)).toEqual(['plan', 'paidBy', 'trialEnds', 'firstCharge', 'places']);
    expect(m.rows[0]?.params).toEqual({ plan: 'Duo', count: 2 });
    expect(m.rows[2]?.params).toEqual({ date: 'Dec 4, 2026', time: '6:42 PM UTC' });
    expect(m.rows[3]?.params).toEqual({ price: '$69.99', period: 'year' });
    expect(m.rows[4]?.params).toEqual({ used: 2, count: 2 });
    expect(m.rows[4]?.seeMembers).toBe(true);
  });

  it('names the App Store on iOS and shows ... for a price still loading', () => {
    const m = subscriptionModel(trial, ctx({ platform: 'ios', offerPrice: null }));
    expect(m.manageSubParams).toEqual({ store: 'App Store' });
    expect(m.rows.find((r) => r.id === 'firstCharge')?.params.price).toBe('...');
  });

  it('formats the trial end in the person timezone', () => {
    expect(timeIn('2026-12-04T18:42:00Z', 'America/New_York', 'en')).toMatch(/1:42\s?PM/);
    expect(dateIn('2026-12-04T03:00:00Z', 'America/Los_Angeles', 'en')).toBe('Dec 3, 2026');
    expect(dateIn(null, 'UTC', 'en')).toBe('');
  });

  it('payer active: Renews with date and price; not renewing says Ends and Not renewing', () => {
    const active = view({ ...trial, status: 'active', kind: 'active', willRenew: true, coveredUntil: '2027-01-09T10:00:00Z', trialEndsAt: null });
    const renew = subscriptionModel(active, ctx());
    expect(renew.badge).toBe('planActive');
    const row = renew.rows.find((r) => r.id === 'renews');
    expect(row?.valueKey).toBe('plans.subscription.row.renewsValue');
    expect(row?.params).toEqual({ date: 'Jan 9, 2027', price: '$69.99' });
    const ending = subscriptionModel({ ...active, willRenew: false }, ctx());
    const end = ending.rows.find((r) => r.id === 'ends');
    expect(end?.valueKey).toBe('plans.subscription.row.endsNotRenewing');
    expect(end?.params).toEqual({ date: 'Jan 9, 2027' });
    expect(ending.rows.some((r) => r.id === 'renews')).toBe(false);
  });

  it('payer in grace gets the payment failed badge', () => {
    expect(subscriptionModel(view({ ...trial, status: 'grace', kind: 'grace' }), ctx()).badge).toBe('paymentFailed');
  });

  it('member of a covered home: no Manage, card params, Restore and the own-plan link data', () => {
    const member = view({ status: 'active', kind: 'active', payerIsMe: false, payerName: 'Sam', seats: 4, planKey: 'household', coveredUntil: '2027-03-01T00:00:00Z' });
    const m = subscriptionModel(member, ctx());
    expect(m.variant).toBe('member');
    expect(m.showManage).toBe(false);
    expect(m.showRestore).toBe(true);
    expect(m.planStatusCard).toBe(false);
    expect(m.memberBodyParams).toEqual({ payer: 'Sam', count: 4, date: 'Mar 1, 2027' });
  });

  it('tester: Free access, free-until row and note, no Manage; owner: Free access with no date', () => {
    const tester = view({ status: 'tester', kind: 'promo', promoKind: 'tester', coveredUntil: '2027-02-01T00:00:00Z' });
    const m = subscriptionModel(tester, ctx());
    expect(m.variant).toBe('tester');
    expect(m.badge).toBe('freeAccess');
    expect(m.showManage).toBe(false);
    expect(m.rows).toEqual([expect.objectContaining({ id: 'freeUntil', raw: 'Feb 1, 2027' })]);
    expect(m.noteKey).toBe('plans.subscription.tester.note');
    expect(m.noteParams).toEqual({ date: 'Feb 1, 2027' });
    const owner = subscriptionModel(view({ status: 'tester', kind: 'promo', promoKind: 'owner' }), ctx());
    expect(owner.variant).toBe('owner');
    expect(owner.badge).toBe('freeAccess');
    expect(owner.rows).toEqual([]);
    expect(owner.noteKey).toBeNull();
  });

  it('no plan yet: the entry card, no status card, no Manage', () => {
    const m = subscriptionModel(view(), ctx());
    expect(m.variant).toBe('none');
    expect(m.showEntry).toBe(true);
    expect(m.planStatusCard).toBe(false);
    expect(m.showManage).toBe(false);
  });

  it('locked: Read-only badge and Change plan, no Manage', () => {
    const m = subscriptionModel(view({ status: 'locked', kind: 'lapsed', payerIsMe: true, planKey: 'solo', planSize: 1 }), ctx({ planName: 'Solo' }));
    expect(variantFor(view({ status: 'locked' }))).toBe('locked');
    expect(m.badge).toBe('readOnly');
    expect(m.showChangePlan).toBe(true);
    expect(m.showManage).toBe(false);
  });
});
