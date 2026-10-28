import * as fc from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { REFINE_NOISE_MIN_MINOR } from '../../constants';
import type { V3Line, V3Month } from '../../types';
import { inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import { refine, refineNoise } from '../refine';

const NUM_RUNS = 200;
const PAST = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const amount = fc.integer({ min: 0, max: 2_000_000 });

describe('refine: never suggests a change smaller than the noise (owner OQ2)', () => {
  it('refineNoise is at least the floor and at least 5% of the figure', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5_000_000, max: 5_000_000 }), fc.array(amount, { maxLength: 9 }), (c, w) => {
        const n = refineNoise(mu(c), w.map(mu));
        expect(n).toBeGreaterThanOrEqual(REFINE_NOISE_MIN_MINOR);
        expect(BigInt(n) * 100n).toBeGreaterThanOrEqual(BigInt(Math.abs(c)) * 5n);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('every card with both a current and a suggested figure differs by more than its noise', () => {
    const scenario = fc.record({
      everyday: fc.array(amount, { minLength: 0, maxLength: 6 }),
      income: fc.array(amount, { minLength: 0, maxLength: 6 }),
      rent: fc.array(amount, { minLength: 0, maxLength: 6 }),
      payLines: fc.array(amount, { minLength: 0, maxLength: 6 }),
      override: fc.option(amount, { nil: null }),
      steady: fc.option(amount, { nil: null }),
      rentAmount: fc.integer({ min: 1, max: 2_000_000 }),
      payAmount: fc.integer({ min: 1, max: 2_000_000 }),
      saved: amount,
      target: fc.option(amount, { nil: null }),
    });
    fc.assert(
      fc.property(scenario, (s) => {
        const months: V3Month[] = PAST.map((m, i) => {
          const lines: V3Line[] = [];
          const e = s.everyday[i];
          if (e !== undefined) lines.push(v3Line({ id: `e${i}`, date: `${m}-10`, amount: e }));
          const inc = s.income[i];
          if (inc !== undefined) lines.push(v3Line({ id: `i${i}`, date: `${m}-01`, amount: inc, role: 'income' }));
          const r = s.rent[i];
          if (r !== undefined) lines.push(v3Line({ id: `r${i}`, date: `${m}-05`, amount: r, seriesId: 'rent' }));
          const p = s.payLines[i];
          if (p !== undefined) lines.push(v3Line({ id: `p${i}`, date: `${m}-01`, amount: p, role: 'income', seriesId: 'pay1' }));
          return monthOf(m, lines);
        });
        const result = refine({
          inputs: inputsOf({
            asOf: '2026-10-03',
            months,
            series: [
              v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-05', amount: s.rentAmount }),
              v3Series({ id: 'pay1', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-01', amount: s.payAmount }),
            ],
            everydayOverride: s.override === null ? null : mu(s.override),
            profile: { types: ['salary'], variable: null, steady: s.steady === null ? null : mu(s.steady), billsHorizonMonths: null },
            envelopes: [{ id: 'b', kind: 'pot', target: s.target === null ? null : mu(s.target), monthlyAmount: mu(100), readyBy: null, saved: mu(s.saved), purposeId: null, bucket: true }],
          }),
          setupDoneAt: '2026-01-10',
          setupRough: false,
          overrideAt: '2026-09-01',
          lastAt: null,
          snoozeUntil: null,
          candidates: [],
          cardStatements: [],
        });
        for (const c of result.cards) {
          if (c.current === null || c.suggested === null) continue;
          expect(c.noise).not.toBeNull();
          const noise = c.noise as number;
          expect(noise).toBeGreaterThanOrEqual(REFINE_NOISE_MIN_MINOR);
          expect(Math.abs(c.suggested - c.current)).toBeGreaterThan(noise);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('refine is pure: the same input gives the same answer', () => {
    fc.assert(
      fc.property(fc.array(amount, { maxLength: 6 }), (xs) => {
        const months = xs.map((a, i) => monthOf(PAST[i] as string, [v3Line({ id: `e${i}`, date: `${PAST[i]}-10`, amount: a })]));
        const input = { inputs: inputsOf({ months, everydayOverride: mu(100000) }), setupDoneAt: '2026-01-10', setupRough: false, overrideAt: null, lastAt: null, snoozeUntil: null, candidates: [], cardStatements: [] };
        expect(refine(input)).toEqual(refine(input));
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
