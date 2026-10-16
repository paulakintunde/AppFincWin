import * as fc from 'fast-check';
import { currencyCode } from '../../money/types';
import { minorUnits } from '../../money/types';
import { estimateBias } from '../estimateBias';
import type { PastDecision } from '../types';
import { USD } from './helpers/fixtures';

const m = minorUnits;
type Trio = [number, number, number];
type NTrio = [number | null, number | null, number | null];

function dec(id: string, estimate: Trio, actual: NTrio, currency = USD): PastDecision {
  return {
    id,
    currency,
    estimate: { dayOne: m(estimate[0]), monthlyPayment: m(estimate[1]), runningCosts: m(estimate[2]) },
    actual: {
      dayOne: actual[0] === null ? null : m(actual[0]),
      monthlyPayment: actual[1] === null ? null : m(actual[1]),
      runningCosts: actual[2] === null ? null : m(actual[2]),
    },
  };
}

const running = (r: ReturnType<typeof estimateBias>) => r[2];

describe('estimateBias (D-56)', () => {
  it('is null below 3 usable decisions and reports the count', () => {
    for (const n of [0, 1, 2]) {
      const ds = Array.from({ length: n }, (_, i) => dec(`d${i}`, [100, 100, 100], [110, 110, 110]));
      const r = estimateBias(ds, USD);
      expect(r.map((b) => b.figure)).toEqual(['day_one', 'monthly_payment', 'running_costs']);
      for (const b of r) {
        expect(b.decisionsUsed).toBe(n);
        expect(b.biasBasisPoints).toBeNull();
      }
    }
  });

  it('running costs 20% higher is +2_000 basis points', () => {
    const ds = [1, 2, 3].map((i) => dec(`d${i}`, [1, 1, 10_000], [null, null, 12_000]));
    expect(running(estimateBias(ds, USD))).toEqual({ figure: 'running_costs', decisionsUsed: 3, biasBasisPoints: 2_000 });
  });

  it('lower actuals give a negative bias', () => {
    const ds = [1, 2, 3].map((i) => dec(`d${i}`, [1, 1, 10_000], [null, null, 8_000]));
    expect(running(estimateBias(ds, USD)).biasBasisPoints).toBe(-2_000);
  });

  it('averages mixed gaps half-up: [1_000, -1_000, 1_000] / 3 = 333', () => {
    const ds = [
      dec('a', [1, 1, 10_000], [null, null, 11_000]),
      dec('b', [1, 1, 20_000], [null, null, 18_000]),
      dec('c', [1, 1, 5_000], [null, null, 5_500]),
    ];
    expect(running(estimateBias(ds, USD)).biasBasisPoints).toBe(333);
  });

  it('is an average of ratios, not a ratio of sums', () => {
    // ratios: +10_000, 0, 0 -> 3_333; a ratio of sums would be 1_000 / 201_000 = about 50 bp
    const ds = [
      dec('a', [1, 1, 1_000], [null, null, 2_000]),
      dec('b', [1, 1, 100_000], [null, null, 100_000]),
      dec('c', [1, 1, 100_000], [null, null, 100_000]),
    ];
    expect(running(estimateBias(ds, USD)).biasBasisPoints).toBe(3_333);
  });

  it('leaves out null actuals and zero estimates; 2 usable of 4 is null', () => {
    const ds = [
      dec('a', [1, 1, 10_000], [null, null, 11_000]),
      dec('b', [1, 1, 10_000], [null, null, null]),
      dec('c', [1, 1, 0], [null, null, 500]),
      dec('d', [1, 1, 10_000], [null, null, 11_000]),
    ];
    const r = running(estimateBias(ds, USD));
    expect(r.decisionsUsed).toBe(2);
    expect(r.biasBasisPoints).toBeNull();
  });

  it('measures a negative estimate against its magnitude', () => {
    const ds = [1, 2, 3].map((i) => dec(`d${i}`, [1, 1, -5_000], [null, null, -4_000]));
    expect(running(estimateBias(ds, USD)).biasBasisPoints).toBe(2_000);
  });

  it('rounds each decision half-up, symmetric for negatives', () => {
    const up = [1, 2, 3].map((i) => dec(`d${i}`, [1, 1, 3], [null, null, 4]));
    const down = [1, 2, 3].map((i) => dec(`d${i}`, [1, 1, 3], [null, null, 2]));
    expect(running(estimateBias(up, USD)).biasBasisPoints).toBe(3_333);
    expect(running(estimateBias(down, USD)).biasBasisPoints).toBe(-3_333);
  });

  it('keeps the three figures independent', () => {
    const ds = [1, 2, 3].map((i) => dec(`d${i}`, [100, 100, 100], [null, null, 110]));
    const r = estimateBias(ds, USD);
    expect(r[0]).toEqual({ figure: 'day_one', decisionsUsed: 0, biasBasisPoints: null });
    expect(r[1]).toEqual({ figure: 'monthly_payment', decisionsUsed: 0, biasBasisPoints: null });
    expect(r[2].biasBasisPoints).toBe(1_000);
  });

  it('computes day one and monthly payment too', () => {
    const ds = [1, 2, 3].map((i) => dec(`d${i}`, [1_000, 200, 1], [1_100, 150, null]));
    const r = estimateBias(ds, USD);
    expect(r[0].biasBasisPoints).toBe(1_000);
    expect(r[1].biasBasisPoints).toBe(-2_500);
  });

  it('rejects a decision in another currency', () => {
    const ds = [dec('a', [1, 1, 1], [1, 1, 1], currencyCode('CAD'))];
    expect(() => estimateBias(ds, USD)).toThrow(RangeError);
    expect(() => estimateBias(ds, USD)).toThrow(/^estimateBias: mixed currencies/);
  });

  it('rejects a non-integer amount', () => {
    const bad = dec('a', [1, 1, 1], [1, 1, 1]);
    const ds = [{ ...bad, estimate: { ...bad.estimate, dayOne: 1.5 as never } }];
    expect(() => estimateBias(ds, USD)).toThrow(RangeError);
    expect(() => estimateBias(ds, USD)).toThrow(/^estimateBias: /);
    const bad2 = [{ ...bad, actual: { ...bad.actual, runningCosts: 1.5 as never } }];
    expect(() => estimateBias(bad2, USD)).toThrow(/^estimateBias: /);
  });

  it('home-currency contract: unconverted USD decisions asked for in CAD are rejected (D-62)', () => {
    const ds = [1, 2, 3].map((i) => dec(`d${i}`, [1_000, 1_000, 1_000], [1_100, 1_100, 1_100]));
    expect(estimateBias(ds, USD)[0].biasBasisPoints).toBe(1_000);
    expect(() => estimateBias(ds, currencyCode('CAD'))).toThrow(/^estimateBias: mixed currencies/);
  });

  it('property: actual equals estimate gives 0', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 3, maxLength: 8 }), (xs) => {
        const ds = xs.map((x, i) => dec(`d${i}`, [x, x, x], [x, x, x]));
        for (const b of estimateBias(ds, USD)) expect(b.biasBasisPoints).toBe(0);
      })
    );
  });

  it('property: scaling estimates and actuals leaves the bias within 1 bp', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 100_000 }), fc.integer({ min: 0, max: 200_000 })), {
          minLength: 3,
          maxLength: 6,
        }),
        fc.integer({ min: 2, max: 50 }),
        (pairs, k) => {
          const base = pairs.map(([e, a], i) => dec(`d${i}`, [e, e, e], [a, a, a]));
          const scaled = pairs.map(([e, a], i) => dec(`d${i}`, [e * k, e * k, e * k], [a * k, a * k, a * k]));
          const rb = estimateBias(base, USD);
          const rs = estimateBias(scaled, USD);
          rb.forEach((b, j) => {
            expect(Math.abs((b.biasBasisPoints as number) - (rs[j].biasBasisPoints as number))).toBeLessThanOrEqual(1);
          });
        }
      )
    );
  });
});
