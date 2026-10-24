import fc from 'fast-check';
import { minorUnits as mu } from '../../money/types';
import { occurrenceDate } from '../../recurring/schedule';
import { MAX_POTS } from '../constants';
import { potSetAside, totalSetAside } from '../pots';
import type { PotInput } from '../types';

const ASOF = '2026-10-24';
const TARGET = fc.integer({ min: 1, max: 10_000_000_000_000 });
const MONTHS = fc.integer({ min: 1, max: 120 });

function plain(target: number, readyBy: string, saved = 0): PotInput {
  return { id: 'p', kind: 'pot', target: mu(target), monthlyAmount: null, readyBy, saved: mu(saved) };
}

describe('pots properties', () => {
  it('D-101 setAside x m >= remaining and (setAside - 1) x m < remaining', () => {
    fc.assert(
      fc.property(TARGET, MONTHS, (target, k) => {
        const l = potSetAside(plain(target, occurrenceDate(ASOF, 'monthly', k)), ASOF);
        expect(l.months).toBe(k);
        expect(l.monthly * k).toBeGreaterThanOrEqual(target);
        // minimality: one minor unit less a month would fall short (monthly x (m - 1) can exceed remaining, e.g. 5 over 4
        // months is 2 a month, 2 x 3 = 6, because the last month is a residual of 0)
        expect((l.monthly - 1) * k).toBeLessThan(target);
      })
    );
  });

  it('D-101 monotonic in remaining', () => {
    fc.assert(
      fc.property(TARGET, TARGET, MONTHS, (a, b, k) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const date = occurrenceDate(ASOF, 'monthly', k);
        expect(potSetAside(plain(lo, date), ASOF).monthly).toBeLessThanOrEqual(potSetAside(plain(hi, date), ASOF).monthly);
      })
    );
  });

  it('D-101 monotonic in m: a later date never raises the monthly amount', () => {
    fc.assert(
      fc.property(TARGET, MONTHS, MONTHS, (target, a, b) => {
        const [near, far] = a <= b ? [a, b] : [b, a];
        const n = potSetAside(plain(target, occurrenceDate(ASOF, 'monthly', near)), ASOF).monthly;
        const f = potSetAside(plain(target, occurrenceDate(ASOF, 'monthly', far)), ASOF).monthly;
        expect(f).toBeLessThanOrEqual(n);
      })
    );
  });

  it('D-101 the total equals the sum of the per-pot amounts', () => {
    const potArb = fc.record({
      id: fc.uuid(),
      kind: fc.constantFrom('wait' as const, 'pot' as const),
      target: fc.option(TARGET.map(mu), { nil: null }),
      monthlyAmount: fc.option(fc.integer({ min: 0, max: 10_000_000_000_000 }).map(mu), { nil: null }),
      readyBy: fc.option(MONTHS.map((k) => occurrenceDate(ASOF, 'monthly', k)), { nil: null }),
      saved: fc.integer({ min: 0, max: 10_000_000_000_000 }).map(mu),
    });
    fc.assert(
      fc.property(fc.array(potArb, { maxLength: MAX_POTS }), (pots) => {
        const r = totalSetAside(pots, ASOF);
        expect(BigInt(r.total)).toBe(r.lines.reduce((s, l) => s + BigInt(l.monthly), 0n));
        expect(r.lines.every((l) => l.monthly >= 0)).toBe(true);
      })
    );
  });
});
