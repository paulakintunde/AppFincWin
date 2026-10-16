import fc from 'fast-check';
import { divideHalfUp } from '../../money/rounding';
import { minorUnits, type MinorUnits } from '../../money/types';
import { amortise } from '../amortise';
import {
  amortiseSchedule,
  assertValidSchedule,
  promoMonthsOf,
  simulateMinimumSchedule,
  singleRate,
  type RateSchedule,
} from '../rateSchedule';
import { simulateMinimum } from '../simulateMinimum';
import { MONTHLY_RATE_DENOMINATOR as D, ZERO_PERCENT, percent, type CardMinimumTerms, type Percent } from '../types';

const m = minorUnits;
const pct = percent;

const PROMO: RateSchedule = {
  segments: [
    { fromMonth: 1, apr: ZERO_PERCENT },
    { fromMonth: 13, apr: pct('9.9') },
  ],
  deferredInterest: false,
};
const DEFERRED: RateSchedule = { ...PROMO, deferredInterest: true };

const PROTO: CardMinimumTerms = { minimumPercent: pct('1'), interestAdded: true, floor: m(2_500) };
const NO_INTEREST_1PCT: CardMinimumTerms = { minimumPercent: pct('1'), interestAdded: false, floor: m(2_500) };

const num = (v: MinorUnits | bigint): number => Number(v);
const max = (xs: readonly number[]): number => xs.reduce((a, b) => (b > a ? b : a), 0);

describe('schedule helpers', () => {
  it('singleRate builds one segment without deferred interest', () => {
    expect(singleRate(pct('9.4'))).toEqual({ segments: [{ fromMonth: 1, apr: pct('9.4') }], deferredInterest: false });
  });

  it('promoMonthsOf is the last segment start minus one', () => {
    expect(promoMonthsOf(singleRate(pct('9.4')))).toBe(0);
    expect(promoMonthsOf(PROMO)).toBe(12);
  });

  const seg = (fromMonth: number, apr: Percent = ZERO_PERCENT) => ({ fromMonth, apr });
  it.each([
    ['no segments', { segments: [], deferredInterest: false }],
    ['first segment not at month 1', { segments: [seg(2)], deferredInterest: false }],
    ['non-integer start', { segments: [seg(1), seg(1.5)], deferredInterest: false }],
    ['non-ascending starts', { segments: [seg(1), seg(13), seg(13)], deferredInterest: false }],
    ['negative APR', { segments: [seg(1), seg(13, -1n as Percent)], deferredInterest: false }],
    ['deferred with one segment', { segments: [seg(1)], deferredInterest: true }],
    ['deferred with a charged promo', { segments: [seg(1, pct('1')), seg(13)], deferredInterest: true }],
  ])('assertValidSchedule rejects %s', (_label, schedule) => {
    expect(() => assertValidSchedule(schedule as RateSchedule, 'amortiseSchedule')).toThrow(
      new RegExp('^amortiseSchedule: ')
    );
  });

  it('assertValidSchedule accepts a valid deferred schedule', () => {
    expect(() => assertValidSchedule(DEFERRED, 'x')).not.toThrow();
  });
});

describe('amortiseSchedule', () => {
  it('0% promo then 9.9%: promo payment is an even split rounded up (D-64), then a recast', () => {
    const r = amortiseSchedule(m(1_200_000), PROMO, 36);
    // D-64: 12,000.00 / 36 = 333.333..., rounded up to 333.34 (half-up was 333.33 and left 8,000.04 at promo end)
    for (let i = 0; i < 12; i++) expect(r.paymentsByMonth[i]).toBe(33_334);
    expect(divideHalfUp(1_200_000n, 36n)).toBe(33_333n);
    expect(r.balanceAtPromoEnd).toBe(799_992);
    expect(r.paymentsByMonth[12]).toBe(amortise(m(799_992), pct('9.9'), 24).payment);
    expect(r.finalPayment).toBe(r.paymentsByMonth[35]);
    expect(r.payment).toBe(33_334);
    expect(r.balancesByMonth[35]).toBe(0);
    expect(r.totalPaid).toBe(1_200_000 + num(r.totalInterest));
    expect(r.interestAfterPromo).toBe(r.totalInterest);
    expect(r.deferredInterestCharged).toBe(0);
    expect(r.highestPayment).toBe(max(r.paymentsByMonth.map(num)));
    expect(r.promoMonths).toBe(12);
  });

  it('deferred interest is added when the balance is still open at promo end', () => {
    const r = amortiseSchedule(m(1_200_000), DEFERRED, 36);
    let expected = 0n;
    for (let i = 0; i < 12; i++) {
      expected += divideHalfUp(BigInt(1_200_000 - 33_334 * i) * pct('9.9'), D);
    }
    expect(r.deferredInterestCharged).toBe(Number(expected));
    expect(r.deferredInterestCharged).toBeGreaterThan(0);
    expect(r.paymentsByMonth[12]).toBe(amortise(m(799_992 + num(r.deferredInterestCharged)), pct('9.9'), 24).payment);
    expect(r.interestAfterPromo).toBeGreaterThanOrEqual(r.deferredInterestCharged);
    expect(r.totalPaid).toBe(1_200_000 + num(r.totalInterest));
  });

  it('a promo covering the whole term charges nothing', () => {
    const schedule: RateSchedule = {
      segments: [
        { fromMonth: 1, apr: ZERO_PERCENT },
        { fromMonth: 37, apr: pct('9.9') },
      ],
      deferredInterest: true,
    };
    const r = amortiseSchedule(m(1_200_000), schedule, 36);
    expect(r.deferredInterestCharged).toBe(0);
    expect(r.balanceAtPromoEnd).toBe(0);
    expect(r.totalInterest).toBe(0);
  });

  it('deferred interest on a zero principal charges nothing', () => {
    const r = amortiseSchedule(m(0), DEFERRED, 24);
    expect(r.deferredInterestCharged).toBe(0);
    expect(r.totalPaid).toBe(0);
  });

  it('three segments recast at months 7 and 19', () => {
    const schedule: RateSchedule = {
      segments: [
        { fromMonth: 1, apr: ZERO_PERCENT },
        { fromMonth: 7, apr: pct('4.9') },
        { fromMonth: 19, apr: pct('12.9') },
      ],
      deferredInterest: false,
    };
    const r = amortiseSchedule(m(2_000_000), schedule, 48);
    expect(r.paymentsByMonth[6]).toBe(amortise(r.balancesByMonth[5]!, pct('4.9'), 42).payment);
    expect(r.paymentsByMonth[18]).toBe(amortise(r.balancesByMonth[17]!, pct('12.9'), 30).payment);
    expect(r.totalPaid).toBe(2_000_000 + num(r.totalInterest));
  });

  it('a clamped payment on a tiny balance still clears', () => {
    const r = amortiseSchedule(m(5), singleRate(pct('30')), 12);
    expect(r.balancesByMonth[11]).toBe(0);
    expect(r.totalPaid).toBe(5 + num(r.totalInterest));
  });

  it.each([0, 601, 1.5])('rejects months %s', (months) => {
    expect(() => amortiseSchedule(m(1000), PROMO, months)).toThrow(/^amortiseSchedule: /);
  });

  it('rejects a negative principal and an invalid schedule', () => {
    expect(() => amortiseSchedule(-1 as MinorUnits, PROMO, 12)).toThrow(/^amortiseSchedule: /);
    expect(() => amortiseSchedule(m(1000), { segments: [], deferredInterest: false }, 12)).toThrow(
      /^amortiseSchedule: /
    );
  });

  it('property: one segment equals amortise exactly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.bigInt({ min: 0n, max: 400_000_000_000n }),
        fc.integer({ min: 1, max: 600 }),
        (principal, apr, months) => {
          const a = amortise(m(principal), apr as Percent, months);
          const s = amortiseSchedule(m(principal), singleRate(apr as Percent), months);
          expect(s.payment).toBe(a.payment);
          expect(s.finalPayment).toBe(a.finalPayment);
          expect(s.totalPaid).toBe(a.totalPaid);
          expect(s.totalInterest).toBe(a.totalInterest);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('property: random schedules keep the totals identity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 3, max: 120 }),
        fc.boolean(),
        fc.bigInt({ min: 0n, max: 400_000_000_000n }),
        fc.bigInt({ min: 0n, max: 400_000_000_000n }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        (principal, months, deferred, a1, a2, f2, f3, threeSegments) => {
          const start2 = 2 + Math.floor(f2 * (months - 2));
          const start3 = Math.min(months, start2 + 1 + Math.floor(f3 * (months - start2)));
          const useThree = threeSegments && start3 > start2 && !deferred;
          const segments = useThree
            ? [
                { fromMonth: 1, apr: ZERO_PERCENT },
                { fromMonth: start2, apr: a1 as Percent },
                { fromMonth: start3, apr: a2 as Percent },
              ]
            : [
                { fromMonth: 1, apr: deferred ? ZERO_PERCENT : (a1 as Percent) },
                { fromMonth: start2, apr: a2 as Percent },
              ];
          const r = amortiseSchedule(m(principal), { segments, deferredInterest: deferred }, months);
          expect(num(r.totalPaid)).toBe(principal + num(r.totalInterest));
          expect(r.paymentsByMonth.every((p) => p >= 0)).toBe(true);
          expect(r.balancesByMonth[months - 1]).toBe(0);
          if (r.deferredInterestCharged > 0) expect(r.balanceAtPromoEnd).toBeGreaterThan(0);
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('simulateMinimumSchedule', () => {
  it('property: one segment equals simulateMinimum exactly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.bigInt({ min: 0n, max: 400_000_000_000n }),
        fc.bigInt({ min: 10_000_000_000n, max: 50_000_000_000n }),
        fc.boolean(),
        fc.integer({ min: 0, max: 10_000 }),
        (balance, apr, minPct, interestAdded, floor) => {
          const terms: CardMinimumTerms = {
            minimumPercent: minPct as Percent,
            interestAdded,
            floor: m(floor),
          };
          const a = simulateMinimum(m(balance), apr as Percent, terms);
          const s = simulateMinimumSchedule(m(balance), singleRate(apr as Percent), terms);
          expect(s.outcome).toBe(a.outcome);
          expect(s.months).toBe(a.months);
          expect(s.firstPayment).toBe(a.firstPayment);
          expect(s.totalInterest).toBe(a.totalInterest);
          expect(s.remainingBalance).toBe(a.remainingBalance);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('promo card: 1% minimum with no interest for 6 months, then 22.9%', () => {
    const schedule: RateSchedule = {
      segments: [
        { fromMonth: 1, apr: ZERO_PERCENT },
        { fromMonth: 7, apr: pct('22.9') },
      ],
      deferredInterest: false,
    };
    const r = simulateMinimumSchedule(m(500_000), schedule, PROTO);
    expect(r.outcome).toBe('cleared');
    for (let i = 0; i < 6; i++) {
      const opening = i === 0 ? 500_000 : num(r.balancesByMonth[i - 1]!);
      expect(r.paymentsByMonth[i]).toBe(Math.max(Number(divideHalfUp(BigInt(opening), 100n)), 2_500));
    }
    expect(r.paymentAfterPromo).toBe(r.paymentsByMonth[6]);
    expect(r.clearedBeforePromoEnd).toBe(false);
    expect(r.interestAfterPromo).toBe(r.totalInterest);
    expect(r.promoMonths).toBe(6);
    expect(r.highestPayment).toBe(max(r.paymentsByMonth.map(num)));
  });

  it('SC-2 under a schedule: never clears once the rate bites', () => {
    const schedule: RateSchedule = {
      segments: [
        { fromMonth: 1, apr: ZERO_PERCENT },
        { fromMonth: 4, apr: pct('22.9') },
      ],
      deferredInterest: false,
    };
    const r = simulateMinimumSchedule(m(500_000), schedule, NO_INTEREST_1PCT);
    expect(r.outcome).toBe('never_clears');
    expect(r.months).toBe(4);
    expect(r.interestAfterPromo).toBeNull();
    expect(r.totalInterest).toBeNull();
    expect(r.paymentsByMonth).toHaveLength(4);
    expect(r.balancesByMonth).toHaveLength(4);
    expect(r.highestPayment).toBe(max(r.paymentsByMonth.map(num)));
  });

  it('deferred card: the accrued interest is charged when the balance is open at promo end', () => {
    const schedule: RateSchedule = {
      segments: [
        { fromMonth: 1, apr: ZERO_PERCENT },
        { fromMonth: 13, apr: pct('24.99') },
      ],
      deferredInterest: true,
    };
    const r = simulateMinimumSchedule(m(300_000), schedule, PROTO);
    let expected = 0n;
    for (let i = 0; i < 12; i++) {
      const opening = i === 0 ? 300_000n : BigInt(r.balancesByMonth[i - 1]!);
      expected += divideHalfUp(opening * pct('24.99'), D);
    }
    expect(r.deferredInterestCharged).toBe(Number(expected));
    expect(r.deferredInterestCharged).toBeGreaterThan(0);
    expect(r.paymentsByMonth[12]!).toBeGreaterThan(r.paymentsByMonth[11]!);
    expect(r.interestAfterPromo!).toBeGreaterThanOrEqual(r.deferredInterestCharged);
    expect(r.highestPayment).toBe(max(r.paymentsByMonth.map(num)));
  });

  it('cleared inside the promo: no deferred charge', () => {
    const schedule: RateSchedule = {
      segments: [
        { fromMonth: 1, apr: ZERO_PERCENT },
        { fromMonth: 13, apr: pct('22.9') },
      ],
      deferredInterest: true,
    };
    const r = simulateMinimumSchedule(m(20_000), schedule, PROTO);
    expect(r.outcome).toBe('cleared');
    expect(r.months).toBeLessThanOrEqual(12);
    expect(r.clearedBeforePromoEnd).toBe(true);
    expect(r.paymentAfterPromo).toBeNull();
    expect(r.deferredInterestCharged).toBe(0);
    expect(r.highestPayment).toBe(max(r.paymentsByMonth.map(num)));
  });

  it('a balance open at the cap is exceeds_month_cap', () => {
    const r = simulateMinimumSchedule(m(1_000_000), singleRate(pct('22.9')), {
      minimumPercent: pct('2'),
      interestAdded: false,
      floor: m(2_500),
    });
    expect(r.outcome).toBe('exceeds_month_cap');
    expect(r.months).toBe(600);
  });

  it('rejects a negative balance and an invalid schedule', () => {
    expect(() => simulateMinimumSchedule(-1 as MinorUnits, PROMO, PROTO)).toThrow(/^simulateMinimumSchedule: /);
    expect(() => simulateMinimumSchedule(m(1000), { segments: [], deferredInterest: false }, PROTO)).toThrow(
      /^simulateMinimumSchedule: /
    );
  });
});
