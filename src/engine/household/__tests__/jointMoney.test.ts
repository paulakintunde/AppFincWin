import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { jointSlices, withoutJointSlices } from '../jointMoney';
import type { JointAccountFacts } from '../jointMoney';

const mu = minorUnits;
const acct = (o: Partial<JointAccountFacts> = {}): JointAccountFacts => ({
  id: 'j1', purpose: 'everyday', spendable: false, balance: mu(350_000), monthIn: mu(500_000), monthOut: mu(300_000), carried: mu(100_000), billsDueBeforeNextIn: mu(0),
  paidInBy: [mu(300_000), mu(200_000)], viewerBalance: mu(0), viewerOwnMonth: mu(0), ...o,
});
const even = { kind: 'shares', weights: [50, 50] } as const;

describe('08.1-22 jointSlices', () => {
  it('JA-01: $5,000 carried from before splits equally under every rule, so two members cannot both count it', () => {
    const a = acct({ balance: mu(500_000), monthIn: mu(200_000), monthOut: mu(200_000), carried: mu(500_000), paidInBy: [mu(100_000), mu(100_000)] });
    for (const split of ['paidIn', even] as const) {
      const x = jointSlices([a], split, null, 0, 2);
      const y = jointSlices([a], split, null, 1, 2);
      expect(x.cash).toBe(250_000);
      expect(x.cash + y.cash).toBe(500_000);
    }
  });
  it('JA-02: an even rule gives $1,000 of month money and $1,750 of cash each', () => {
    const x = jointSlices([acct()], even, null, 0, 2);
    expect([x.month, x.cash]).toEqual([100_000, 175_000]);
  });
  it('JA-02b: bring splits this month by what each paid in and carried money equally', () => {
    const a = jointSlices([acct()], 'paidIn', null, 0, 2);
    const b = jointSlices([acct()], 'paidIn', null, 1, 2);
    expect([a.month, b.month]).toEqual([120_000, 80_000]);
    expect([a.cash, b.cash]).toEqual([200_000, 150_000]);
  });
  it('bring with no pay-in totals counts equally, and so does a bring-split with every total zero', () => {
    const none = acct({ paidInBy: undefined });
    expect(jointSlices([none], 'paidIn', null, 0, 2).month).toBe(100_000);
    expect(jointSlices([acct({ paidInBy: [mu(0), mu(0)] })], 'paidIn', null, 1, 2).month).toBe(100_000);
    expect(jointSlices([acct({ paidInBy: [mu(1)] })], 'paidIn', null, 1, 2).month).toBe(100_000); // wrong length: equal
  });
  it('a bring-split with only the viewer paying in gives the viewer all of the month money (HH-11)', () => {
    const a = acct({ balance: mu(140_000), monthIn: mu(300_000), monthOut: mu(200_000), carried: mu(40_000), paidInBy: [mu(300_000), mu(0)] });
    expect(jointSlices([a], 'paidIn', null, 0, 2).month).toBe(100_000);
    expect(jointSlices([a], 'paidIn', null, 1, 2).month).toBe(0);
    expect(jointSlices([a], 'paidIn', null, 1, 2).cash).toBe(20_000); // only the carried $400 is shared equally
  });
  it('a negative month (more out than in) is split too', () => {
    const a = acct({ monthIn: mu(100_000), monthOut: mu(300_000) });
    expect(jointSlices([a], even, null, 0, 2).month).toBe(-100_000);
    expect(jointSlices([a], 'paidIn', null, 0, 2).month).toBe(-120_000);
  });
  it('a missing purpose counts as everyday', () => {
    expect(jointSlices([acct({ purpose: null })], even, null, 0, 2).cash).toBe(175_000);
  });
  it('JA-03: a bills account counts only the money above the bills due', () => {
    const a = acct({ purpose: 'bills', balance: mu(120_000), monthIn: mu(200_000), monthOut: mu(180_000), carried: mu(40_000), billsDueBeforeNextIn: mu(60_000), paidInBy: [mu(100_000), mu(100_000)] });
    const x = jointSlices([a], 'paidIn', [50, 50], 0, 2);
    expect([x.month, x.cash]).toEqual([30_000, 30_000]);
  });
  it('JA-04: a bills account short of its bills takes the gap from each member by the bill split', () => {
    const a = acct({ purpose: 'bills', balance: mu(50_000), billsDueBeforeNextIn: mu(60_000) });
    expect(jointSlices([a], 'paidIn', [50, 50], 0, 2).cash).toBe(-5_000);
    expect(jointSlices([a], 'paidIn', [75, 25], 1, 2).cash).toBe(-2_500);
    expect(jointSlices([a], 'paidIn', null, 0, 2).cash).toBe(-5_000);
  });
  it('a bills account with exactly its bills counts nothing', () => {
    const a = acct({ purpose: 'bills', balance: mu(60_000), billsDueBeforeNextIn: mu(60_000) });
    expect(jointSlices([a], even, null, 0, 2)).toMatchObject({ month: 0, cash: 0 });
  });
  it('a bills account above its bills but with no month money splits the rest equally', () => {
    const a = acct({ purpose: 'bills', balance: mu(100_000), monthIn: mu(0), monthOut: mu(50_000), carried: mu(100_000), billsDueBeforeNextIn: mu(0) });
    expect(jointSlices([a], 'paidIn', null, 0, 2).cash).toBe(50_000);
  });
  it('JA-06: a joint savings account never counts, and as the shared net it is the net saved amount', () => {
    const s = acct({ purpose: 'savings', balance: mu(1_000_000) });
    expect(jointSlices([s], even, null, 0, 2)).toMatchObject({ month: 0, cash: 0, netSaved: null });
    const net = jointSlices([{ ...s, safetyNet: true, spendable: true }], even, null, 0, 2);
    expect(net).toMatchObject({ month: 0, cash: 0, netSaved: 1_000_000 });
  });
  it('a savings account the group marked spendable counts as cash only, split by the rule', () => {
    const s = acct({ purpose: 'savings', spendable: true, balance: mu(1_000_000) });
    expect(jointSlices([s], even, null, 0, 2)).toMatchObject({ month: 0, cash: 500_000 });
    expect(jointSlices([s], 'paidIn', null, 1, 2)).toMatchObject({ month: 0, cash: 500_000 });
  });
  it('the deltas lay my slice over what the viewer holds today', () => {
    const a = acct({ viewerBalance: mu(150_000), viewerOwnMonth: mu(150_000) });
    const x = jointSlices([a], even, null, 0, 2);
    expect([x.monthDelta, x.cashDelta]).toEqual([-50_000, 25_000]);
    expect(x.perAccount).toEqual([{ id: 'j1', month: 100_000, cash: 175_000 }]);
  });
  it('withoutJointSlices takes the joint money out and keeps the net amount', () => {
    const a = acct({ viewerBalance: mu(150_000), viewerOwnMonth: mu(100_000) });
    expect(withoutJointSlices([a])).toMatchObject({ month: 0, cash: 0, netSaved: null, monthDelta: -100_000, cashDelta: -150_000 });
    const net = withoutJointSlices([acct({ purpose: 'savings', safetyNet: true, balance: mu(40_000) })]);
    expect(net.netSaved).toBe(40_000);
  });
  it('no joint accounts gives zeros', () => {
    expect(jointSlices([], even, null, 0, 2)).toEqual({ month: 0, cash: 0, netSaved: null, perAccount: [], monthDelta: 0, cashDelta: 0 });
  });

  it('property: members\' slices add up to the money counted, for every purpose and rule', () => {
    const purposes = fc.constantFrom('bills', 'savings', 'everyday', null);
    const money = fc.integer({ min: 0, max: 5_000_000 });
    const acctArb = fc.record({
      purpose: purposes, spendable: fc.boolean(), safetyNet: fc.boolean(), balance: money, monthIn: money, monthOut: money, carried: money, due: money,
      paid: fc.array(money, { minLength: 3, maxLength: 3 }),
    });
    const splitArb = fc.oneof(
      fc.constant('paidIn' as const),
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 3 }).map((weights) => ({ kind: 'shares' as const, weights })),
    );
    fc.assert(
      fc.property(acctArb, splitArb, fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 3 }), (r, split, bw) => {
        const a: JointAccountFacts = {
          id: 'j', purpose: r.purpose, spendable: r.spendable, safetyNet: r.safetyNet, balance: mu(r.balance), monthIn: mu(r.monthIn), monthOut: mu(r.monthOut), carried: mu(r.carried),
          billsDueBeforeNextIn: mu(r.due), paidInBy: r.paid.map(mu), viewerBalance: mu(0), viewerOwnMonth: mu(0),
        };
        const slices = [0, 1, 2].map((i) => jointSlices([a], split, bw, i, 3));
        const cash = slices.reduce((s, x) => s + x.cash, 0);
        const month = slices.reduce((s, x) => s + x.month, 0);
        const purpose = a.purpose ?? 'everyday';
        let counted = a.balance as number;
        if (purpose === 'savings') counted = a.safetyNet === true || !a.spendable ? 0 : a.balance;
        if (purpose === 'bills') counted = Math.max(0, a.balance - a.billsDueBeforeNextIn) - Math.max(0, a.billsDueBeforeNextIn - a.balance);
        expect(cash).toBe(counted);
        if (purpose === 'everyday') expect(month).toBe(a.monthIn - a.monthOut);
        else expect(month).toBe(purpose === 'bills' ? counted : 0);
      }),
      { numRuns: 300, seed: 0x2201 },
    );
  });
});
