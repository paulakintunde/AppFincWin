import { minorUnits } from '../../money/types';
import type { JointAccountFacts } from '../jointMoney';
import { householdPlan } from '../plan';
import type { HouseholdPlanArgs } from '../plan';
import { resolveSpendRule } from '../spendRule';
import type { ResolvedSpendRule, SpendRuleSetting } from '../spendRule';
import { zeroShareMembers } from '../zeroShare';

// 08.1-25 (owner one-earner fix 2026-11-21, Q1 A): a member is flagged when the group's rule gives them a $0 share of the joint money
// and they paid nothing into a joint account this month. OE-05 / OE-07 from 08.12-RESEARCH-ARRANGEMENTS.md section 4.1.
const mu = minorUnits;
const acct = (o: Partial<JointAccountFacts> = {}): JointAccountFacts => ({
  id: 'j1', purpose: 'everyday', spendable: false, balance: mu(100_000), monthIn: mu(500_000), monthOut: mu(400_000), carried: mu(0),
  billsDueBeforeNextIn: mu(0), paidInBy: [mu(500_000), mu(0)], viewerBalance: mu(0), viewerOwnMonth: mu(0), ...o,
});
const rule = (setting: SpendRuleSetting | null, keys: readonly string[], bill: Record<string, number> | null): ResolvedSpendRule =>
  resolveSpendRule(setting, keys, bill, 'separate');
const BRING: SpendRuleSetting = { rule: 'bring', setup: null, shares: null };
const BILL: SpendRuleSetting = { rule: 'bill', setup: null, shares: null };
const keys2 = ['a', 'b'];
const run = (o: { resolved?: ResolvedSpendRule; joint?: readonly JointAccountFacts[]; billWeights?: readonly number[] | null; memberCount?: number } = {}) =>
  zeroShareMembers({
    resolved: o.resolved ?? rule(BRING, keys2, null),
    joint: o.joint ?? [acct()],
    billWeights: o.billWeights === undefined ? null : o.billWeights,
    memberCount: o.memberCount ?? 2,
  });

describe('08.1-25 zeroShareMembers', () => {
  it('OE-05: What each person brings, Sam paid in $5,000, Alex nothing, nothing carried: Alex is flagged', () => {
    expect(run()).toEqual([1]);
  });
  it('OE-07: Same as the bill split at 100/0 flags the 0% member', () => {
    expect(run({ resolved: rule(BILL, keys2, { a: 100, b: 0 }), billWeights: [100, 0] })).toEqual([1]);
  });
  it('money carried from before splits equally, so nobody is at $0', () => {
    expect(run({ joint: [acct({ balance: mu(160_000), carried: mu(60_000) })] })).toEqual([]);
  });
  it('a member who paid in $50 is not flagged, even when their slice rounds small', () => {
    expect(run({ joint: [acct({ paidInBy: [mu(500_000), mu(5_000)] })] })).toEqual([]);
  });
  it('paid in on a second joint account counts too', () => {
    expect(run({ joint: [acct(), acct({ id: 'j2', balance: mu(0), monthIn: mu(1), monthOut: mu(1), paidInBy: [mu(0), mu(1)] })] })).toEqual([]);
  });
  it('a set split the group chose (100/0) is a deliberate choice: never flagged', () => {
    const custom = rule({ rule: 'custom', setup: null, shares: { a: 100, b: 0 } }, keys2, null);
    expect(custom.rule).toBe('custom');
    expect(run({ resolved: custom })).toEqual([]);
  });
  it('set shares out of date: the Update shares line covers it, so no flag', () => {
    const stale = rule({ rule: 'custom', setup: null, shares: { a: 100 } }, keys2, null);
    expect(stale.sharesOutOfDate).toBe(true);
    expect(run({ resolved: stale })).toEqual([]);
  });
  it('the bill split with all-zero weights resolves to bring and behaves as bring', () => {
    const r = rule(BILL, keys2, { a: 0, b: 0 });
    expect(r.rule).toBe('bring');
    expect(run({ resolved: r, billWeights: [0, 0] })).toEqual([1]);
  });
  it('the bill split flags only a member whose weight is 0, not a member with weight above 0 who paid nothing', () => {
    expect(run({ resolved: rule(BILL, keys2, { a: 0, b: 100 }), billWeights: [0, 100], joint: [acct({ paidInBy: [mu(0), mu(0)] })] })).toEqual([0]);
    expect(run({ resolved: rule(BILL, keys2, { a: 100, b: 0 }), billWeights: null })).toEqual([1]);
  });
  it('joint savings not marked spendable, or the safety net, is no counted joint money: no flag', () => {
    expect(run({ joint: [acct({ purpose: 'savings', spendable: false })] })).toEqual([]);
    expect(run({ joint: [acct({ purpose: 'savings', spendable: true, safetyNet: true })] })).toEqual([]);
    expect(run({ resolved: rule(BILL, keys2, { a: 100, b: 0 }), billWeights: [100, 0], joint: [acct({ purpose: 'savings', spendable: false })] })).toEqual([]);
  });
  it('a short joint bills pot (negative slices) flags nobody', () => {
    expect(run({ joint: [acct({ purpose: 'bills', balance: mu(50_000), billsDueBeforeNextIn: mu(60_000) })] })).toEqual([]);
  });
  it('a bills pot exactly at its dues has no counted money: no flag', () => {
    expect(run({ joint: [acct({ purpose: 'bills', balance: mu(60_000), billsDueBeforeNextIn: mu(60_000) })] })).toEqual([]);
  });
  it('no joint accounts, or a household of one, flags nobody', () => {
    expect(run({ joint: [] })).toEqual([]);
    expect(run({ memberCount: 1, joint: [acct({ paidInBy: [mu(500_000)] })] })).toEqual([]);
  });
  it('three members under bring: one with no pay-ins is flagged; two with none are both flagged', () => {
    const k3 = ['a', 'b', 'c'];
    expect(run({ resolved: rule(BRING, k3, null), memberCount: 3, joint: [acct({ paidInBy: [mu(300_000), mu(200_000), mu(0)] })] })).toEqual([2]);
    expect(run({ resolved: rule(BRING, k3, null), memberCount: 3, joint: [acct({ paidInBy: [mu(500_000), mu(0), mu(0)] })] })).toEqual([1, 2]);
  });
  it('the member who paid in is never flagged', () => {
    expect(run()).not.toContain(0);
  });
  it('pay-ins recorded for a different member count count equally (no flag)', () => {
    expect(run({ joint: [acct({ paidInBy: [mu(500_000)] })] })).toEqual([]);
  });
});

describe('08.1-25 householdPlan zeroShare', () => {
  const base = (o: Partial<HouseholdPlanArgs> = {}): HouseholdPlanArgs => ({
    scope: 'me', memberKeys: keys2, myIndex: 1, setting: BRING, billWeights: null, inferred: 'separate', others: [null, null], joint: [acct()], ...o,
  });
  it('the viewer flagged under bring gives { rule: bring }', () => {
    expect(householdPlan(base()).zeroShare).toEqual({ rule: 'bring' });
    expect(householdPlan(base({ scope: 'household' })).zeroShare).toEqual({ rule: 'bring' });
  });
  it('the viewer flagged under the bill split gives { rule: bill }, using the plan\'s own bill weights', () => {
    expect(householdPlan(base({ setting: BILL, billWeights: { a: 100, b: 0 } })).zeroShare).toEqual({ rule: 'bill' });
  });
  it('the viewer who paid in, or no joint money, gives null; the rest of the plan is unchanged', () => {
    expect(householdPlan(base({ myIndex: 0 })).zeroShare).toBeNull();
    const none = householdPlan(base({ joint: [] }));
    expect(none.zeroShare).toBeNull();
    expect(none.joint).toBeNull();
  });
  it('a set split never carries the flag', () => {
    expect(householdPlan(base({ setting: { rule: 'custom', setup: null, shares: { a: 100, b: 0 } } })).zeroShare).toBeNull();
  });
});
