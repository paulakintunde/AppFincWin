/**
 * E8 properties (D-103): the housing breach is the exact bigint cross-multiply, whatever the figures, and a check that
 * adds no housing cost never raises the warning.
 */
import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { assess } from '../assess';
import type { Assessment } from '../types';
import { buyCash, monthsOf, snapshotOf } from './helpers/fixtures';

function run(housing: number, running: number, income: number, linePct: number, itemType: 'property' | 'general'): Assessment {
  const s = snapshotOf({
    housingMonthly: minorUnits(housing),
    months: monthsOf([[income, 1], [income, 1], [income, 1]], '2026-04'),
    limits: { ...snapshotOf().limits, housingLine: percent(String(linePct)) },
  });
  const v = assess(s, buyCash(1, { itemType, runningCostsNet: minorUnits(running) }));
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
}

describe('D-103 housing properties', () => {
  it('D-103 breach is exactly housingAfter x 100 > line x income, and the shortfall is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 1, max: 2_000_000 }),
        fc.integer({ min: 1, max: 3_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        (housing, running, income, linePct) => {
          const a = run(housing, running, income, linePct, 'property');
          const breach = BigInt(housing + running) * 100n > BigInt(linePct) * BigInt(income);
          const w = a.warnings.find((x) => x.code === 'housing');
          expect(w !== undefined).toBe(breach);
          expect(a.checks.housing).toBe(!breach);
          if (w) expect(w.shortfall).toBeGreaterThanOrEqual(0); // 0 when the breach is under half a minor unit (the line is rounded half-up, as for dsr)
        }
      ),
      { numRuns: 150 }
    );
  });

  it('D-103 a non-property check never raises the housing warning', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: -1_000_000, max: 2_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (housing, running, income) => {
          const a = run(housing, running, income, 28, 'general');
          expect(a.warnings.some((x) => x.code === 'housing')).toBe(false);
          expect(a.housingAfter).toBe(housing);
        }
      ),
      { numRuns: 100 }
    );
  });
});
