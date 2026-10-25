/**
 * E7 (D-102; UI-SPEC R18.3): the total cost of ownership, from figures the check already holds.
 */
import { minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { assess } from '../assess';
import { DEFAULT_PROJECTION_HORIZON_MONTHS } from '../constants';
import { myPart } from '../share';
import { totalCost } from '../ownership';
import type { Assessment, BuyCheck, CardRecord, DecideSnapshot, InvestCheck, PurchaseCheck, TotalCostInput, Verdict } from '../types';
import { USD, buyCash, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;
const ADVERTISED = 1_450_000;
const loan = (over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(ADVERTISED, { payment: { method: 'loan', deposit: mu(300_000), termMonths: 48, apr: percent('9.4') }, ...over });
const input = (over: Partial<TotalCostInput> = {}): TotalCostInput => ({
  horizonMonths: null,
  advertised: mu(ADVERTISED),
  lossMonthly: mu(0),
  ...over,
});
function resolved(c: PurchaseCheck, s: DecideSnapshot = snapshotOf()): Assessment {
  const v = assess(s, c);
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
}

describe('D-102 total cost of ownership (E7)', () => {
  it('D-102 total is price plus interest and fees plus running x H minus resale', () => {
    const check = loan({ runningCostsNet: mu(5_000) });
    const a = resolved(check);
    const r = totalCost(check, a, input({ lossMonthly: mu(2_000) }))!;
    const resale = ADVERTISED - 2_000 * 48;
    expect(r.horizonMonths).toBe(48);
    expect(r.running).toBe(5_000 * 48);
    expect(r.resale).toBe(resale);
    expect(r.interestAndFees).toBe(a.plan.total! - a.plan.price);
    expect(r.interestAndFees).toBeGreaterThan(0);
    expect(r.total).toBe(a.plan.total! + 5_000 * 48 - resale);
    expect(r.trivial).toBe(false);
  });

  it('D-102 a null plan total hides the row', () => {
    const card: CardRecord = {
      id: 'c1',
      apr: percent('22.9'),
      currency: USD,
      minimumTerms: { minimumPercent: percent('1'), interestAdded: false, floor: mu(2_500) },
    };
    const check = buyCash(500_000, { payment: { method: 'card', card, payoff: { kind: 'minimum' }, dealerCap: null } });
    const a = resolved(check);
    expect(a.plan.total).toBeNull();
    expect(totalCost(check, a, input())).toBeNull();
  });

  it('D-102 an investment check has no total cost', () => {
    const invest: InvestCheck = { kind: 'invest', currency: USD, amount: mu(100_000), payment: { method: 'monthly', termMonths: 12 } };
    const a = resolved(invest);
    expect(totalCost(invest, a, input())).toBeNull();
  });

  it('D-102 a missing verdict has no total cost', () => {
    const check = loan();
    const v: Verdict = assess(snapshotOf({ months: [] }), check); // no logged month: the context cannot be built
    expect(v.state).toBe('missing');
    expect(totalCost(check, v, input())).toBeNull();
  });

  it('D-102 the horizon is never below the plan term', () => {
    const check = loan();
    const a = resolved(check);
    expect(totalCost(check, a, input({ horizonMonths: 12 }))!.horizonMonths).toBe(48);
    expect(totalCost(check, a, input({ horizonMonths: 48 }))!.horizonMonths).toBe(48);
    expect(totalCost(check, a, input({ horizonMonths: 72 }))!.horizonMonths).toBe(72);
  });

  it('D-102 the horizon of a purchase with no term is the chosen one, else 60', () => {
    const check = buyCash(100_000, { runningCostsNet: mu(1_000) });
    const a = resolved(check);
    expect(totalCost(check, a, input({ advertised: mu(100_000) }))!.horizonMonths).toBe(DEFAULT_PROJECTION_HORIZON_MONTHS);
    expect(totalCost(check, a, input({ advertised: mu(100_000), horizonMonths: 24 }))!.horizonMonths).toBe(24);
  });

  it('D-102 an invalid chosen horizon throws, as the investing views do', () => {
    const check = buyCash(100_000);
    const a = resolved(check);
    for (const n of [0, 601, 1.5, -1]) {
      expect(() => totalCost(check, a, input({ horizonMonths: n }))).toThrow(/^totalCost: /);
    }
  });

  it('D-102 resale is capped at the price and never negative', () => {
    const check = buyCash(100_000);
    const a = resolved(check);
    const big = totalCost(check, a, input({ advertised: mu(100_000), lossMonthly: mu(10_000) }))!;
    expect(big.resale).toBe(0); // 10_000 x 60 > 100_000
    expect(big.total).toBe(100_000);
    const exact = totalCost(check, a, input({ advertised: mu(120_000), lossMonthly: mu(2_000), horizonMonths: 60 }))!;
    expect(exact.resale).toBe(0); // loss exactly equals the advertised price
    const small = totalCost(check, a, input({ advertised: mu(100_000), lossMonthly: mu(100) }))!;
    expect(small.resale).toBe(100_000 - 100 * 60);
    expect(small.total).toBe(100_000 - small.resale);
    expect(small.trivial).toBe(false);
  });

  it('D-102 a cash purchase with nothing else is trivial', () => {
    const check = buyCash(100_000);
    const r = totalCost(check, resolved(check), input({ advertised: mu(100_000) }))!;
    expect(r).toMatchObject({ total: 100_000, interestAndFees: 0, running: 0, resale: 0, trivial: true });
  });

  it('D-102 a negative net running cost counts as 0', () => {
    const check = buyCash(100_000, { runningCostsNet: mu(-3_000) });
    const r = totalCost(check, resolved(check), input({ advertised: mu(100_000) }))!;
    expect(r.running).toBe(0);
    expect(r.total).toBe(100_000);
    expect(r.trivial).toBe(true);
  });

  it('D-102 each component takes my half-up part once in a household', () => {
    const s = snapshotOf({
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
      householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    });
    const check = buyCash(100_001, { runningCostsNet: mu(1_001) });
    const a = resolved(check, s);
    const share = a.context.purchaseShare;
    const r = totalCost(check, a, input({ advertised: mu(100_001), lossMonthly: mu(101), horizonMonths: 10 }))!;
    const resale = myPart(mu(100_001), share) - myPart(mu(101), share) * 10;
    expect(r.running).toBe(a.mineRunning * 10);
    expect(r.resale).toBe(resale);
    expect(r.total).toBe(myPart(a.plan.total!, share) + a.mineRunning * 10 - resale);
  });

  it('D-102 a figure past the safe range hides the row instead of throwing', () => {
    const check = buyCash(100_000);
    const a = resolved(check);
    const over: Assessment = { ...a, mineRunning: mu(Number.MAX_SAFE_INTEGER) };
    expect(totalCost(check, over, input({ horizonMonths: 600 }))).toBeNull();
  });
});
