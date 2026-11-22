import * as fc from 'fast-check';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { minorUnits as mu } from '../../money/types';
import { healthScore } from '../score';
import type { HealthInputs } from '../types';

const SEED = 0x0701;
const amt = (min: number, max: number) => fc.integer({ min, max }).map(mu);

const healthInputsArb: fc.Arbitrary<HealthInputs> = fc.record({
  moneyIn: amt(-1000, 5_000_000),
  left: amt(-2_000_000, 5_000_000),
  emergency: fc.option(amt(-1000, 20_000_000), { nil: null }),
  monthlyEssential: amt(-1000, 3_000_000),
  debtTotal: amt(-1000, 50_000_000),
  typicalIncome: amt(-1000, 5_000_000),
  billsDue: amt(-1000, 5_000_000),
  moneyOut: amt(-1000, 5_000_000),
  hasBalance: fc.boolean(),
  short: fc.boolean(),
});

describe('health score properties (T-07-01, T-07-02)', () => {
  it('a short month never scores above 74', () => {
    fc.assert(
      fc.property(healthInputsArb, (i) => {
        const r = healthScore({ ...i, short: true });
        if (r.kind === 'score') expect(r.score).toBeLessThanOrEqual(74);
      }),
      { numRuns: fcRuns(200), seed: SEED },
    );
  });
  it('without the cap the parts add up exactly to the score, in bounds', () => {
    fc.assert(
      fc.property(healthInputsArb, (i) => {
        const r = healthScore({ ...i, short: false });
        if (r.kind !== 'score') return;
        expect(r.parts.reduce((s, p) => s + p.points, 0)).toBe(r.score);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        for (const p of r.parts) {
          expect(p.points).toBeGreaterThanOrEqual(0);
          expect(p.points).toBeLessThanOrEqual(p.max);
        }
      }),
      { numRuns: fcRuns(200), seed: SEED },
    );
  });
});
