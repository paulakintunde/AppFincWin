import fc from 'fast-check';
import { minorUnits, type MinorUnits } from '../../money/types';
import { ZERO_PERCENT, percent } from '../../payoff/types';
import { affordablePrice, bisectLargest } from '../bisect';
import { assessPlan, prepareContext } from '../assess';
import { resolvePlanStrict, withPrice } from '../plan';
import { myPart } from '../share';
import type { AssessContext, BuyCheck, DecideSnapshot } from '../types';
import { USD, buyCash, income, monthsOf, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`expected ok, got ${r.reasons.join(',')}`);
  return r.context;
}

function fitsOf(context: AssessContext, check: BuyCheck): (p: number) => boolean {
  return (p) => {
    const c = withPrice(check, mu(p));
    return assessPlan(context, c, resolvePlanStrict(c)).state === 'fits';
  };
}

const LIMITS_CASH = {
  reserve: mu(600_000),
  dsrLine: null,
  unsecuredIncomeMultiple: null,
  investingFloor: null,
  savingFloor: null,
  spareFloor: null,
};

describe('bisectLargest (DEC-09, D-20)', () => {
  it('finds the exact threshold', () => {
    expect(bisectLargest(mu(50_000), (p) => p <= 12_345)).toEqual({ kind: 'found', price: 12_345 });
  });

  it('reports nothing_affordable when price 0 does not fit and full_price_fits when the whole price does', () => {
    expect(bisectLargest(mu(100), () => false)).toEqual({ kind: 'nothing_affordable' });
    expect(bisectLargest(mu(100), () => true)).toEqual({ kind: 'full_price_fits', price: 100 });
    expect(bisectLargest(mu(0), () => true)).toEqual({ kind: 'full_price_fits', price: 0 });
  });

  it('returns found 0 when only price 0 fits', () => {
    expect(bisectLargest(mu(10), (p) => p <= 0)).toEqual({ kind: 'found', price: 0 });
  });

  it('calls the predicate at most ceil(log2(upper)) + 2 times', () => {
    let calls = 0;
    const upper = 1_000_000_000_000;
    const r = bisectLargest(mu(upper), (p) => {
      calls += 1;
      return p <= 777_777_777_777;
    });
    expect(r).toEqual({ kind: 'found', price: 777_777_777_777 });
    expect(calls).toBeLessThanOrEqual(Math.ceil(Math.log2(upper)) + 2);
  });

  it('rejects a negative upper bound', () => {
    expect(() => bisectLargest(-1 as MinorUnits, () => true)).toThrow(/^bisectLargest: /);
  });

  it('matches the threshold for any threshold and upper', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000_000 }), fc.integer({ min: 0, max: 10_000_000_000 }), (t, upper) => {
        const r = bisectLargest(mu(upper), (p) => p <= t);
        if (t >= upper) {
          expect(r).toEqual({ kind: 'full_price_fits', price: upper });
        } else {
          expect(r).toEqual({ kind: 'found', price: t });
        }
      })
    );
  });
});

describe('affordablePrice (DEC-09)', () => {
  const cashSnapshot = snapshotOf({ cashOnHand: mu(2_000_000), limits: LIMITS_CASH });

  it('finds the cash-bound price exactly (cashAfter = reserve is allowed)', () => {
    const check = buyCash(1_500_000);
    expect(affordablePrice(ctxOf(cashSnapshot), check)).toEqual({ kind: 'found', price: 1_400_000 });
  });

  it('returns full_price_fits when the price already fits and nothing_affordable when nothing does', () => {
    expect(affordablePrice(ctxOf(cashSnapshot), buyCash(100_000))).toEqual({ kind: 'full_price_fits', price: 100_000 });
    const poor = snapshotOf({ cashOnHand: mu(500_000), limits: LIMITS_CASH });
    expect(affordablePrice(ctxOf(poor), buyCash(100_000))).toEqual({ kind: 'nothing_affordable' });
  });

  it('boundary: fits(p) and not fits(p + 1) for the found price', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_400_001, max: 5_000_000 }), (price) => {
        const check = buyCash(price);
        const ctx = ctxOf(cashSnapshot);
        const r = affordablePrice(ctx, check);
        expect(r.kind).toBe('found');
        if (r.kind === 'found') {
          const fits = fitsOf(ctx, check);
          expect(fits(r.price)).toBe(true);
          expect(fits(r.price + 1)).toBe(false);
        }
      }),
      { numRuns: 40 }
    );
  });
});

describe('fits is monotone in price (Pitfall 4, D-44, D-48)', () => {
  function monotone(context: AssessContext, check: BuyCheck, max: number): void {
    const fits = fitsOf(context, check);
    fc.assert(
      fc.property(fc.integer({ min: 0, max }), fc.integer({ min: 0, max }), (a, b) => {
        const [p1, p2] = a <= b ? [a, b] : [b, a];
        if (fits(p2)) expect(fits(p1)).toBe(true);
      }),
      { numRuns: 120 }
    );
  }

  const vehicle = (price: number): BuyCheck =>
    buyCash(price, {
      itemType: 'vehicle',
      payment: {
        method: 'card',
        card: { id: 'c1', apr: percent('19.9'), minimumTerms: null, currency: USD },
        payoff: { kind: 'months', months: 12 },
        dealerCap: mu(500_000),
      },
    });

  it('holds across the vehicle dealer-cap discontinuity (personal)', () => {
    monotone(ctxOf(snapshotOf({ limits: LIMITS_CASH })), vehicle(1_500_000), 1_500_000);
  });

  it('holds for a 2-member even household', () => {
    const s = snapshotOf({
      limits: LIMITS_CASH,
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
      householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    });
    monotone(ctxOf(s), vehicle(1_500_000), 1_500_000);
  });

  it('holds for a loan with a 0% deferred-interest promotional period (D-48)', () => {
    const check = buyCash(2_000_000, {
      payment: {
        method: 'loan',
        deposit: mu(0),
        termMonths: 36,
        apr: percent('9.9'),
        promo: { apr: ZERO_PERCENT, months: 12, deferredInterest: true },
      },
    });
    monotone(ctxOf(snapshotOf({ limits: LIMITS_CASH })), check, 2_000_000);
  });

  it('holds on a snapshot with a confirmed pay series (D-44 cash path)', () => {
    const PAY = income({
      seriesId: 'pay',
      freq: 'monthly',
      anchorDate: '2026-01-25',
      lastPaidDate: '2026-06-25',
      latestAmount: 600_000,
    });
    monotone(ctxOf(snapshotOf({ limits: LIMITS_CASH, incomeSeries: [PAY] })), buyCash(2_500_000), 2_500_000);
  });
});

describe('bisection on a 3-member [3,5,7] household where fits is not monotone', () => {
  const share = { weights: [3, 5, 7], myIndex: 0 };
  const snap = snapshotOf({
    cashOnHand: mu(600_001),
    limits: LIMITS_CASH,
    scope: { kind: 'household', memberCount: 3, myIndex: 0, rule: { kind: 'weight', weights: [3, 5, 7] } },
    householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    months: monthsOf([
      [3_000_000, 300_000],
      [3_000_000, 300_000],
      [3_000_000, 300_000],
    ]),
  });

  it('finds 6 although 8 also fits, within the documented bounds', () => {
    const ctx = ctxOf(snap);
    const check = buyCash(13);
    const fits = fitsOf(ctx, check);
    expect(fits(6)).toBe(true);
    expect(fits(7)).toBe(false);
    expect(fits(8)).toBe(true);
    const r = affordablePrice(ctx, check);
    expect(r).toEqual({ kind: 'found', price: 6 });
    let trueMax = 0;
    for (let p = 0; p <= 13; p++) if (fits(p)) trueMax = p;
    expect(trueMax).toBe(8);
    expect(trueMax - 6).toBeLessThanOrEqual(Math.ceil(15 / 3));
    expect(myPart(mu(8), share) - myPart(mu(6), share)).toBeLessThanOrEqual(1);
  });
});

describe('bisection error is bounded for 3+ unequal household weights', () => {
  it('bisection error is bounded for 3+ unequal household weights', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 3, maxLength: 5 }),
        fc.nat(4),
        fc.integer({ min: 0, max: 100 }),
        (weights, idx, T) => {
          fc.pre(new Set(weights).size > 1);
          const myIndex = idx % weights.length;
          const W = weights.reduce((a, b) => a + b, 0);
          const wMe = weights[myIndex]!;
          const upper = Math.ceil(((T + 2) * W) / wMe);
          const snap = snapshotOf({
            cashOnHand: mu(600_000 + T),
            limits: LIMITS_CASH,
            scope: { kind: 'household', memberCount: weights.length, myIndex, rule: { kind: 'weight', weights } },
            householdSpending: { rule: { kind: 'even' }, byCategory: [] },
            months: monthsOf([
              [3_000_000, 300_000],
              [3_000_000, 300_000],
              [3_000_000, 300_000],
            ]),
          });
          const ctx = ctxOf(snap);
          const check = buyCash(upper);
          const fits = fitsOf(ctx, check);
          let bruteMax = -1;
          for (let p = 0; p <= upper; p++) if (fits(p)) bruteMax = p;
          const r = affordablePrice(ctx, check);
          expect(['found', 'full_price_fits']).toContain(r.kind);
          if (r.kind === 'nothing_affordable') return;
          const p = r.price;
          expect(fits(p)).toBe(true);
          expect(p === upper || !fits(p + 1)).toBe(true);
          expect(bruteMax - p).toBeGreaterThanOrEqual(0);
          const share = ctx.purchaseShare;
          expect(myPart(mu(bruteMax), share) - myPart(mu(p), share)).toBeLessThanOrEqual(1);
          expect(bruteMax - p).toBeLessThanOrEqual(Math.ceil(W / wMe));
        }
      ),
      { numRuns: 50 }
    );
  }, 30_000);
});
