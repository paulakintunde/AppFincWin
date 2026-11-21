import { minorUnits } from '../../money/types';
import { householdPlan, jointFactsOf } from '../plan';
import type { HouseholdPlanArgs, JointRaw } from '../plan';

const mu = minorUnits;
const raw = (o: Partial<JointRaw> = {}): JointRaw => ({
  id: 'j1', purpose: 'everyday', spendable: false, balance: mu(350_000), monthIn: mu(500_000), monthOut: mu(300_000), carried: mu(100_000), billsDueBeforeNextIn: mu(0),
  paidInBy: [mu(300_000), mu(200_000)], ...o,
});
const keys = ['a', 'b'];
const args = (o: Partial<HouseholdPlanArgs> = {}): HouseholdPlanArgs => ({
  scope: 'household', memberKeys: keys, myIndex: 0, setting: null, billWeights: { a: 50, b: 50 }, inferred: 'separate', others: [null, mu(400_000)], joint: [], ...o,
});

describe('08.1-22 jointFactsOf', () => {
  it('adds the viewer\'s own balance when its use counts it, and their pay-ins less their bill share of the money out', () => {
    const [f] = jointFactsOf([raw()], [{ id: 'j1', balance: mu(150_000), use: { kind: 'everyday' } }], 0, 0.5);
    expect(f).toMatchObject({ viewerBalance: 150_000, viewerOwnMonth: 150_000 });
    expect((f as unknown as { ownMonth?: unknown }).ownMonth).toBeUndefined();
  });
  it('an account the viewer does not count as spending money (dedicated, untouched, no use, not in the inputs) adds no balance', () => {
    for (const use of [{ kind: 'untouched' }, { kind: 'dedicated' }, null]) {
      expect(jointFactsOf([raw()], [{ id: 'j1', balance: mu(9), use }], 0, 0.5)[0]?.viewerBalance).toBe(0);
    }
    expect(jointFactsOf([raw()], [], 0, 0.5)[0]?.viewerBalance).toBe(0);
    expect(jointFactsOf([raw()], [{ id: 'j1', balance: mu(9), use: { kind: 'mixed' } }], 0, 0.5)[0]?.viewerBalance).toBe(9);
  });
  it('an explicit own month wins; with no pay-ins recorded the own month is minus the bill share of the money out', () => {
    expect(jointFactsOf([raw({ ownMonth: mu(7) })], [], 1, 0.5)[0]?.viewerOwnMonth).toBe(7);
    expect(jointFactsOf([raw({ paidInBy: undefined })], [], 1, 0.5)[0]?.viewerOwnMonth).toBe(-150_000);
  });
});

describe('08.1-22 householdPlan', () => {
  it('no joint accounts and What each person brings: nothing to lay', () => {
    const p = householdPlan(args());
    expect(p.joint).toBeNull();
    expect(p.personalDelta).toBeNull();
    expect(p.resolved.rule).toBe('bring');
  });
  it('a set split with a partner who counts gives a personal delta that is my slice less my own money', () => {
    const p = householdPlan(args({ setting: { rule: 'custom', setup: null, shares: { a: 50, b: 50 } } }));
    expect(p.personalDelta?.(mu(100_000))).toBe(150_000); // 50% of $5,000 is $2,500, less my $1,000
  });
  it('no delta in Just me, and none when no partner counts', () => {
    const custom = { rule: 'custom' as const, setup: null, shares: { a: 50, b: 50 } };
    expect(householdPlan(args({ scope: 'me', setting: custom })).personalDelta).toBeNull();
    expect(householdPlan(args({ setting: custom, others: [null, null] })).personalDelta).toBeNull();
    expect(householdPlan(args({ setting: custom, others: [mu(5), null] })).personalDelta).toBeNull(); // only my own slot
  });
  it('joint accounts give the slice laid over the viewer\'s records and the same with everything taken out', () => {
    const facts = jointFactsOf([raw()], [{ id: 'j1', balance: mu(150_000), use: { kind: 'everyday' } }], 0, 0.5);
    const p = householdPlan(args({ setting: { rule: 'bill', setup: null, shares: null }, joint: facts }));
    expect(p.joint?.applied).toEqual({ monthDelta: -50_000, cashDelta: 25_000, balances: { j1: 175_000 } });
    expect(p.joint?.without).toEqual({ monthDelta: -150_000, cashDelta: -150_000, balances: { j1: 0 } });
  });
  it('a short bills account takes the gap by the bill weights; "mine only" (no weights) splits it equally', () => {
    const short = jointFactsOf([raw({ purpose: 'bills', balance: mu(50_000), billsDueBeforeNextIn: mu(60_000) })], [], 0, 0.5);
    expect(householdPlan(args({ joint: short })).joint?.applied.balances).toEqual({ j1: -5_000 });
    expect(householdPlan(args({ joint: short, billWeights: null })).joint?.applied.balances).toEqual({ j1: -5_000 });
    expect(householdPlan(args({ joint: short, billWeights: { a: 75 } })).joint?.applied.balances).toEqual({ j1: -10_000 }); // a missing member weighs 0
  });
});
