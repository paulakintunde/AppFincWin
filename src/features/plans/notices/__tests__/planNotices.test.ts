// 09-19: the plan notice model, one case per behaviour in the plan. Pure: no React, no store.
import type { HouseholdEventRow } from '@/db/householdEvents';
import type { PlanView } from '../../types';
import {
  NOTICE_ORDER,
  dismissValue,
  hasPaymentNoticeToday,
  needsDismissLink,
  planNotices,
  takeoverToast,
  type DoubleCoverState,
  type PlanNoticeInput,
} from '../planNotices';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0); // Nov 19 2026, 12:00 UTC
const ME = 'u-me';
const BEA = 'u-bea';
const ALEX = 'u-alex';

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'active', kind: 'active', writable: true, householdId: 'h1', planKey: 'household', planSize: 6, period: 'month', seats: 6,
    members: 3, payerId: ME, payerIsMe: true, payerName: 'Me', store: 'APP_STORE', productId: 'p', willRenew: true,
    coveredUntil: '2026-12-09T12:00:00Z', trialEndsAt: null, graceUntil: null, promoKind: null, prelaunch: false, leftGrace: false,
    trialAvailable: false, billingIssueAt: null, loading: false, isError: false, ...over,
  };
}

let n = 0;
function ev(kind: string, params: Record<string, unknown> = {}, over: Partial<HouseholdEventRow> = {}): HouseholdEventRow {
  n += 1;
  return { id: `e${n}`, household_id: 'h1', kind, actor_id: null, subject_id: null, ref_id: null, params, created_at: `2026-11-1${n % 10}T10:00:00Z`, ...over };
}

const NAMES: Record<string, string> = { [ME]: 'Me', [BEA]: 'Bea', [ALEX]: 'Alex' };

function input(over: Partial<PlanNoticeInput> = {}): PlanNoticeInput {
  return {
    plan: view(),
    events: [],
    offlineCount: 0,
    existingCard: null,
    dismissed: {},
    now: NOW,
    tz: 'UTC',
    locale: 'en',
    price: '$14.99',
    period: 'month',
    userId: ME,
    doubleCover: null,
    homeName: 'The Flat',
    nameOf: (id) => (id ? NAMES[id] ?? '' : ''),
    planNameOf: (k) => k[0]!.toUpperCase() + k.slice(1),
    periodWord: (p) => p,
    priceFor: (k) => (k === 'duo' ? '$9.99' : null),
    inviteeName: 'Someone you invited',
    ...over,
  };
}

const ids = (i: PlanNoticeInput) => planNotices(i).map((x) => x.id);
const one = (i: PlanNoticeInput, id: string) => planNotices(i).find((x) => x.id === id);

const dc = (over: Partial<DoubleCoverState> = {}): DoubleCoverState => ({
  householdId: 'h1', since: '2026-11-18T10:00:00Z', chooseBy: '2026-11-25T10:00:00Z', chosenPayer: null, chosenBy: null,
  newSide: { payerId: BEA, planKey: 'household', fits: true }, oldSide: { payerId: ALEX, planKey: 'household', fits: true }, ...over,
});

const trialIn = (ms: number) => view({ status: 'trial', planKey: 'duo', planSize: 2, members: 2, trialEndsAt: new Date(NOW + ms).toISOString() });

describe('planNotices', () => {
  it('trial ending in 2.5 days: trialEndsSoon with date, time, price and period', () => {
    const x = one(input({ plan: trialIn(2.5 * DAY) }), 'trialEndsSoon');
    expect(x?.params).toEqual({ date: 'Nov 22, 2026', time: '12:00 AM UTC', price: '$14.99', period: 'month' });
    expect(x?.dismissible).toBe(true);
    expect(x?.actions.map((a) => a.labelKey)).toEqual(['plans.notices.trialReminder.actions.manage', 'plans.notices.trialReminder.actions.change']);
    expect(needsDismissLink(x!)).toBe(true);
  });

  it('a trial reminder dismissed today stays hidden until tomorrow', () => {
    const base = input({ plan: trialIn(2.5 * DAY) });
    const n0 = one(base, 'trialEndsSoon')!;
    const dismissed = { trialEndsSoon: dismissValue(n0, NOW, 'UTC') };
    expect(ids({ ...base, dismissed })).not.toContain('trialEndsSoon');
    expect(ids({ ...base, dismissed, now: NOW + DAY, plan: trialIn(1.5 * DAY) })).toContain('trialEndsSoon');
  });

  it('trial ends today: trialEndsToday, not dismissible, Manage only', () => {
    const x = one(input({ plan: trialIn(6 * 3600_000) }), 'trialEndsToday');
    expect(x?.dismissible).toBe(false);
    expect(x?.params).toEqual({ time: '6:00 PM UTC', price: '$14.99', period: 'month' });
    expect(x?.actions.map((a) => a.kind)).toEqual(['manage']);
    expect(ids(input({ plan: trialIn(6 * 3600_000), dismissed: { trialEndsToday: 'ever', trialEndsSoon: 'ever' } }))).toContain('trialEndsToday');
  });

  it('a trial that will not renew shows no charge notice', () => {
    expect(ids(input({ plan: { ...trialIn(DAY), willRenew: false } }))).toEqual([]);
  });

  it('grace with a billing issue: payer sees Fix payment, not dismissible', () => {
    const x = one(input({ plan: view({ status: 'grace', graceUntil: '2026-11-30T12:00:00Z', billingIssueAt: '2026-11-18T00:00:00Z' }) }), 'paymentFailed');
    expect(x?.bodyKey).toBe('plans.notices.paymentFailed.bodyPayer');
    expect(x?.badge).toBe('paymentFailed');
    expect(x?.dismissible).toBe(false);
    expect(x?.actions.map((a) => a.labelKey)).toEqual(['plans.notices.paymentFailed.actions.fix']);
  });

  it('plan_grace event: a member sees the payer name, Take over the plan and Not now', () => {
    const plan = view({ status: 'grace', payerId: BEA, payerIsMe: false, payerName: 'Bea', graceUntil: '2026-11-30T12:00:00Z' });
    const x = one(input({ plan, events: [ev('plan_grace', { grace_until: '2026-11-30T12:00:00Z' })] }), 'paymentFailed');
    expect(x?.params).toEqual({ name: 'Bea', date: 'Nov 30, 2026' });
    expect(x?.actions.map((a) => a.labelKey)).toEqual(['plans.notices.paymentFailed.actions.takeOver', 'plans.notices.paymentFailed.actions.notNow']);
  });

  it('plan_payer_left: payerLeft with the grace date', () => {
    const plan = view({ status: 'grace', payerId: null, payerIsMe: false, graceUntil: '2026-11-26T12:00:00Z' });
    const x = one(input({ plan, events: [ev('plan_payer_left', { grace_until: '2026-11-26T12:00:00Z' }, { subject_id: BEA })] }), 'payerLeft');
    expect(x?.params).toEqual({ name: 'Bea', date: 'Nov 26, 2026' });
    expect(x?.actions[0]?.labelKey).toBe('plans.notices.payerLeft.actions.takeOver');
  });

  it('plan_takeover newer than last seen: a one-time toast with the payer name', () => {
    const e = ev('plan_takeover', { previous_payer: ALEX, payer: BEA });
    const nameOf = (id: string | null) => (id ? NAMES[id] ?? '' : '');
    const toast = takeoverToast([e], null, ME, nameOf);
    expect(toast).toEqual({ key: 'plans.notices.takeoverDone.toast', params: { name: 'Bea' }, seenAt: e.created_at });
    expect(takeoverToast([e], e.created_at, ME, nameOf)).toBeNull();
    expect(takeoverToast([e], null, BEA, nameOf)).toBeNull();
  });

  it('payer alone on a bigger plan after a real leave: payerAfterLeaving with Manage and Move to Solo', () => {
    const x = one(input({ plan: view({ members: 1, leftAt: '2026-11-18T10:00:00Z', leftHomeName: null }) }), 'payerAfterLeaving');
    expect(x?.params).toEqual({ home: 'The Flat' });
    expect(x?.actions.map((a) => a.kind)).toEqual(['manage', 'moveSolo']);
  });

  it('payerAfterLeaving names the home they left', () => {
    const x = one(input({ plan: view({ members: 1, leftAt: '2026-11-18T10:00:00Z', leftHomeName: 'Maple' }) }), 'payerAfterLeaving');
    expect(x?.params).toEqual({ home: 'Maple' });
  });

  it('payerAfterLeaving still shows with no leftAt (a payer whose partner left keeps the Manage / Move to Solo offer)', () => {
    const x = one(input({ plan: view({ members: 1, leftAt: null }) }), 'payerAfterLeaving');
    expect(x?.params).toEqual({ home: 'The Flat' });
    expect(x?.actions.map((a) => a.kind)).toEqual(['manage', 'moveSolo']);
  });

  it('double cover, nobody picked, I am a payer: two choose buttons, not dismissible, default line', () => {
    const x = one(input({ userId: BEA, doubleCover: dc() }), 'doubleCover');
    expect(x).toMatchObject({ titleKey: 'plans.doubleCover.title', bodyKey: 'plans.doubleCover.body', footKey: 'plans.doubleCover.defaultLine', dismissible: false });
    expect(x?.actions).toEqual([
      { kind: 'choose', style: 'primary', labelKey: 'plans.doubleCover.choiceNew', params: { plan: 'Household', name: 'Bea' }, keepPayer: BEA },
      { kind: 'choose', style: 'primary', labelKey: 'plans.doubleCover.choiceOld', params: { plan: 'Household', name: 'Alex' }, keepPayer: ALEX },
    ]);
    expect(ids(input({ userId: ALEX, doubleCover: dc() }))).toContain('doubleCover');
  });

  it('double cover leaves out a side whose plan does not fit', () => {
    const x = one(input({ userId: BEA, doubleCover: dc({ oldSide: { payerId: ALEX, planKey: 'duo', fits: false } }) }), 'doubleCover');
    expect(x?.actions.map((a) => (a.kind === 'choose' ? a.keepPayer : ''))).toEqual([BEA]);
  });

  it('double cover already picked, or not a payer: no notice', () => {
    expect(ids(input({ userId: BEA, doubleCover: dc({ chosenPayer: BEA, chosenBy: 'payer' }) }))).not.toContain('doubleCover');
    expect(ids(input({ userId: ME, doubleCover: null }))).not.toContain('doubleCover');
    expect(ids(input({ userId: ME, doubleCover: dc() }))).not.toContain('doubleCover');
  });

  it('plan_recovered_after_takeover (payer or default): oldPlanRecovered with notChosen copy and Manage', () => {
    for (const chosen_by of ['payer', 'default']) {
      const x = one(input({ events: [ev('plan_recovered_after_takeover', { payer: BEA, chosen_by })] }), 'oldPlanRecovered');
      expect(x).toMatchObject({ titleKey: 'plans.doubleCover.notChosen.title', bodyKey: 'plans.doubleCover.notChosen.body', params: { name: 'Bea', home: 'The Flat' } });
      expect(x?.actions.map((a) => a.kind)).toEqual(['manage']);
    }
  });

  it('plan_double_cover mode extra gives oldPlanRecovered; mode choose never does', () => {
    const x = one(input({ events: [ev('plan_double_cover', { mode: 'extra', payer: BEA })] }), 'oldPlanRecovered');
    expect(x?.titleKey).toBe('plans.notices.oldPlanRecovers.title');
    expect(x?.params).toEqual({ name: 'Bea', home: 'The Flat' });
    expect(ids(input({ events: [ev('plan_double_cover', { mode: 'choose', new_payer: BEA, old_payer: ALEX })] }))).not.toContain('oldPlanRecovered');
  });

  it('grace after leaving: memberLeft with Continue on Solo and Not now', () => {
    const plan = view({ status: 'grace', leftGrace: true, payerId: null, payerIsMe: false, planKey: null, planSize: 1, members: 1, coveredUntil: '2026-11-26T12:00:00Z' });
    const x = one(input({ plan }), 'memberLeft');
    expect(x?.params).toEqual({ date: 'Nov 26, 2026' });
    expect(x?.actions[0]).toMatchObject({ kind: 'navigate', href: { pathname: '/plans', params: { mode: 'change', trigger: 'notice', plan: 'solo' } } });
    expect(ids(input({ plan }))).not.toContain('paymentFailed');
  });

  it('plan_approval_needed for the payer: approvalWaiting linking the approval screen with the request id', () => {
    const x = one(input({ events: [ev('plan_approval_needed', { needed_plan_size: 12 }, { ref_id: 'req-1' })] }), 'approvalWaiting');
    expect(x?.params).toEqual({ name: 'Someone you invited', home: 'The Flat' });
    expect(x?.actions[0]).toMatchObject({ kind: 'navigate', href: { pathname: '/household/approve', params: { request: 'req-1' } } });
    expect(ids(input({ plan: view({ payerIsMe: false }), events: [ev('plan_approval_needed', {}, { ref_id: 'req-1' })] }))).not.toContain('approvalWaiting');
  });

  it('plan_downgrade_offer: Switch at renewal to the smaller plan, Not now; gone once the plan is that small', () => {
    const plan = view({ members: 2 });
    const x = one(input({ plan, events: [ev('plan_downgrade_offer', { plan_size: 2 })] }), 'downgradeOffer');
    expect(x?.params).toEqual({ count: 2, plan: 'Duo', price: '$9.99', period: 'month', date: 'Dec 9, 2026' });
    expect(x?.actions[0]).toMatchObject({ href: { pathname: '/plans', params: { mode: 'change', trigger: 'notice', plan: 'duo' } } });
    expect(ids(input({ plan: view({ members: 2, planSize: 2, planKey: 'duo' }), events: [ev('plan_downgrade_offer', { plan_size: 2 })] }))).not.toContain('downgradeOffer');
  });

  it('existingCard pending: Run setup (rerun) and the permanent Not now', () => {
    const x = one(input({ existingCard: 'pending' }), 'existingUser');
    expect(x?.actions[0]).toMatchObject({ kind: 'navigate', href: { pathname: '/onboarding', params: { mode: 'rerun' } } });
    expect(x?.actions[1]?.kind).toBe('existingDismiss');
    expect(ids(input({ existingCard: 'dismissed' }))).not.toContain('existingUser');
  });

  it('tester within 30 days of the end: testerEnding; further out, nothing', () => {
    const plan = view({ status: 'tester', promoKind: 'tester', payerIsMe: false, coveredUntil: new Date(NOW + 20 * DAY).toISOString() });
    expect(one(input({ plan }), 'testerEnding')?.params).toEqual({ date: 'Dec 9, 2026' });
    expect(ids(input({ plan: { ...plan, coveredUntil: new Date(NOW + 40 * DAY).toISOString() } }))).not.toContain('testerEnding');
  });

  it('offline saves show outside the sample state', () => {
    expect(ids(input({ offlineCount: 2 }))).toContain('offlineSaves');
    expect(ids(input({ offlineCount: 2, plan: view({ status: 'sample', payerIsMe: false }) }))).not.toContain('offlineSaves');
  });

  it('orders by priority: doubleCover after paymentFailed and before trialEndsToday', () => {
    const plan = view({ status: 'grace', billingIssueAt: '2026-11-18T00:00:00Z', graceUntil: '2026-11-30T12:00:00Z' });
    const got = ids(input({ plan, doubleCover: dc({ newSide: { payerId: ME, planKey: 'household', fits: true } }), existingCard: 'pending', offlineCount: 1 }));
    expect(got).toEqual(['paymentFailed', 'doubleCover', 'offlineSaves', 'existingUser']);
    expect(NOTICE_ORDER.indexOf('doubleCover')).toBeLessThan(NOTICE_ORDER.indexOf('trialEndsToday'));
    expect(NOTICE_ORDER.indexOf('oldPlanRecovered')).toBe(NOTICE_ORDER.indexOf('doubleCover') + 1);
    expect(NOTICE_ORDER.indexOf('testerEnding')).toBe(NOTICE_ORDER.indexOf('downgradeOffer') + 1);
  });

  it('hasPaymentNoticeToday is true with a trial or payment notice and false otherwise', () => {
    expect(hasPaymentNoticeToday(planNotices(input({ plan: trialIn(DAY) })))).toBe(true);
    expect(hasPaymentNoticeToday(planNotices(input({ existingCard: 'pending' })))).toBe(false);
  });
});
