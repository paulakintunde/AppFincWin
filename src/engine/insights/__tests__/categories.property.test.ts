/** 07-02 (T-07-07): category totals tie to the month's paid spending, and shares stay inside 0..10000. */
import * as fc from 'fast-check';
import { prepare } from '../../decide/v3/prepare';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { inputsArb } from '../../decide/v3/__tests__/invariants/arbitraries';
import { categoryTotals } from '../categories';

const SEED = 0x0703;

describe('07-02 categoryTotals properties', () => {
  it('rows plus rest equal the total, shares are bounded, and the total never exceeds paid spending', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const p = prepare(inputs);
        for (const m of p.inputs.months) {
          const b = categoryTotals(p.inputs.months, [m.month]);
          expect(b.total).toBeGreaterThanOrEqual(0);
          const rows = b.rows.reduce((s, r) => s + r.amount, 0);
          expect(rows + (b.rest?.amount ?? 0)).toBe(b.total);
          for (const r of b.rows) {
            expect(r.shareBp).toBeGreaterThanOrEqual(0);
            expect(r.shareBp).toBeLessThanOrEqual(10_000);
          }
          if (b.rest !== null) {
            expect(b.rest.shareBp).toBeGreaterThanOrEqual(0);
            expect(b.rest.shareBp).toBeLessThanOrEqual(10_000);
          }
          const spending = m.lines.filter((l) => l.status === 'paid' && l.role === 'spending').reduce((s, l) => s + Math.abs(l.amount), 0);
          expect(b.total).toBeLessThanOrEqual(spending);
        }
      }),
      { numRuns: fcRuns(200), seed: SEED },
    );
  });
});
