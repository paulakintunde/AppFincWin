/**
 * I-ENG11 (05.4-57, ENG11-QE-BILLS): with quick estimates, no usable history month and no everyday override, the usual bills
 * are counted once. Quick estimates' money out includes the bills; the everyday figure is the rest, never below 0.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { buildMonthModel } from '../../month/model';
import type { MonthModel, V3Inputs, V3Series } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';

const mu = minorUnits;
const MONTHLY = { unit: 'month', every: 1 } as const;

const billArb = (n: number): fc.Arbitrary<V3Series> =>
  fc
    .record({ amount: fc.integer({ min: 0, max: 600_000 }), day: fc.integer({ min: 1, max: 28 }) })
    .map(({ amount, day }) =>
      v3Series({ id: `qe-bill-${n}`, role: 'bill', cadence: MONTHLY, anchorDate: `2026-01-${String(day).padStart(2, '0')}`, amount })
    );

interface Drawn {
  readonly inputs: V3Inputs;
  readonly extra: V3Series;
  readonly expenses: number;
}

const drawnArb: fc.Arbitrary<Drawn> = fc
  .record({
    day: fc.integer({ min: 1, max: 31 }),
    income: fc.integer({ min: 0, max: 1_500_000 }),
    expenses: fc.integer({ min: 0, max: 1_000_000 }),
    bills: fc.integer({ min: 0, max: 3 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => billArb(i)))),
    extra: billArb(9),
    lines: fc.array(fc.record({ amount: fc.integer({ min: 1, max: 80_000 }), d: fc.integer({ min: 1, max: 31 }) }), { maxLength: 5 }),
  })
  .map(({ day, income, expenses, bills, extra, lines }) => {
    const asOf = `2026-10-${String(day).padStart(2, '0')}`;
    const current = monthOf(
      '2026-10',
      lines.filter((l) => l.d <= day).map((l, i) => v3Line({ id: `qe-l-${i}`, date: `2026-10-${String(l.d).padStart(2, '0')}`, amount: l.amount })),
      { full: false }
    );
    const inputs = inputsOf({
      asOf,
      months: [current],
      series: bills,
      typedEstimates: { income: mu(income), expenses: mu(expenses), saving: mu(0), debt: mu(0), invest: mu(0), asOf },
    });
    return { inputs, extra, expenses };
  });

const onEstimates = (m: MonthModel): boolean => m.monthsUsed.length === 0 && m.reasons.includes('quick_estimates_used');

describe('I-ENG11 quick estimates count the bills once (05.4-57)', () => {
  it('I-ENG11 everyday + bills never exceeds the larger of the money out and the bills; this month adds up; erest <= e', () => {
    fc.assert(
      fc.property(drawnArb, ({ inputs, expenses }) => {
        const m = buildMonthModel(inputs);
        expect(onEstimates(m)).toBe(true);
        const e = m.e as number;
        expect(e).toBeGreaterThanOrEqual(0);
        expect(e + m.recurringBills).toBeLessThanOrEqual(Math.max(expenses, m.recurringBills));
        expect(m.moneyOut).toBe(m.billsPaid + m.billsDue + m.everydayLogged + m.erest + m.setAside);
        expect(m.erest).toBeLessThanOrEqual(e);
      }),
      { numRuns: fcRuns(300), seed: 0x0e11 }
    );
  });

  it('I-ENG11 recording one more monthly bill (estimates unchanged) never raises the everyday figure or the still to come', () => {
    fc.assert(
      fc.property(drawnArb, ({ inputs, extra }) => {
        const before = buildMonthModel(inputs);
        const after = buildMonthModel({ ...inputs, series: [...inputs.series, extra] });
        expect(onEstimates(after)).toBe(true);
        expect(after.e as number).toBeLessThanOrEqual(before.e as number);
        expect(after.erest).toBeLessThanOrEqual(before.erest);
      }),
      { numRuns: fcRuns(300), seed: 0x0e11 }
    );
  });
});
