/**
 * SC-6 end-to-end monotonicity (05.1-27): I9..I13 and I18 through evaluate() on the golden persons.
 * "Never better" is codeRank(after) <= codeRank(before) in the direction of the change (lower rank = stricter).
 * needs_input is a request for a figure, not a verdict, so a pair where either side asks is skipped (fc.pre): asking
 * disappears legitimately when the extra spending line makes the records look current again.
 */
import fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { CheckV2, ReadyBy, Result, V3Inputs, V3Line } from '../../types';
import { checkOf, codeRank, checkArb, inputsArb, mu, priceArb, shapeArb } from './arbitraries';
import { v3Line } from '../helpers/fixtures';

const RUNS = { numRuns: 60 };

const run = (inputs: V3Inputs, check: CheckV2): Result => evaluate(inputs, check).result;

function asking(...rs: Result[]): boolean {
  return rs.some((r) => r.code === 'needs_input');
}

/** A comparable key: a date, or the first of a month. null (never) sorts after everything. */
function readyKey(r: ReadyBy | null): string {
  if (r === null) return '9999-99-99';
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

function currentMonthOf(inputs: V3Inputs): string {
  return inputs.asOf.slice(0, 7);
}

function withLine(inputs: V3Inputs, line: V3Line): V3Inputs {
  const ym = currentMonthOf(inputs);
  if (!inputs.months.some((m) => m.month === ym)) return inputs;
  return { ...inputs, months: inputs.months.map((m) => (m.month === ym ? { ...m, lines: [...m.lines, line] } : m)) };
}

function extraLine(inputs: V3Inputs, role: V3Line['role'], amount: number, day: number): V3Line {
  const d = Math.min(day, Number(inputs.asOf.slice(8, 10)));
  return v3Line({ id: 'arb-added', date: `${currentMonthOf(inputs)}-${String(d).padStart(2, '0')}`, amount, role });
}

describe('end-to-end monotonicity through evaluate()', () => {
  it('I9 a cheaper price is never worse', () => {
    fc.assert(
      fc.property(inputsArb, shapeArb, priceArb, fc.integer({ min: 1, max: 99 }), (inputs, shape, price, pct) => {
        const cheaper = Math.max(100, Math.floor((price * pct) / 100));
        const hi = run(inputs, checkOf(price, shape));
        const lo = run(inputs, checkOf(cheaper, shape));
        fc.pre(!asking(hi, lo));
        expect(codeRank(lo.code)).toBeGreaterThanOrEqual(codeRank(hi.code));
      }),
      RUNS
    );
  });

  it('I10 an extra expense never helps', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: 100, max: 500_000 }), fc.integer({ min: 1, max: 28 }), (inputs, check, amount, day) => {
        const before = run(inputs, check);
        const after = run(withLine(inputs, extraLine(inputs, 'spending', amount, day)), check);
        fc.pre(!asking(before, after));
        expect(codeRank(after.code)).toBeLessThanOrEqual(codeRank(before.code));
      }),
      RUNS
    );
  });

  it('I10 a new monthly bill never helps', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: 100, max: 500_000 }), (inputs, check, amount) => {
        const bill = {
          id: 'arb-bill',
          role: 'bill' as const,
          cadence: { unit: 'month' as const, every: 1 },
          anchorDate: `${currentMonthOf(inputs)}-28`,
          endDate: null,
          amount: mu(amount),
          status: 'live' as const,
          confirmed: true,
          payGroup: null,
          countsAs: null,
          incomeKind: null,
          typicalChoice: null,
          categoryId: null,
          isHousing: false,
          savingMode: null,
        };
        const before = run(inputs, check);
        const after = run({ ...inputs, series: [...inputs.series, bill] }, check);
        fc.pre(!asking(before, after));
        expect(codeRank(after.code)).toBeLessThanOrEqual(codeRank(before.code));
      }),
      RUNS
    );
  });

  it('I11 extra paid income never hurts', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: 100, max: 500_000 }), fc.integer({ min: 1, max: 28 }), (inputs, check, amount, day) => {
        const before = run(inputs, check);
        const after = run(withLine(inputs, extraLine(inputs, 'income', amount, day)), check);
        fc.pre(!asking(before, after));
        expect(codeRank(after.code)).toBeGreaterThanOrEqual(codeRank(before.code));
      }),
      RUNS
    );
  });

  it('I12 less cash never helps', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: 0, max: 99 }), (inputs, check, pct) => {
        const less: V3Inputs = {
          ...inputs,
          balance: mu(Math.floor((inputs.balance * pct) / 100)),
          unspent: inputs.unspent === null ? null : { ...inputs.unspent, amount: mu(Math.floor((inputs.unspent.amount * pct) / 100)) },
        };
        const more = run(inputs, check);
        const fewer = run(less, check);
        fc.pre(!asking(more, fewer));
        expect(codeRank(fewer.code)).toBeLessThanOrEqual(codeRank(more.code));
      }),
      RUNS
    );
  });

  it('I13 a higher price never makes ready-by earlier', () => {
    fc.assert(
      fc.property(inputsArb, shapeArb, priceArb, fc.integer({ min: 1, max: 99 }), (inputs, shape, price, pct) => {
        const cheaper = Math.max(100, Math.floor((price * pct) / 100));
        const hi = run(inputs, checkOf(price, shape));
        const lo = run(inputs, checkOf(cheaper, shape));
        fc.pre(hi.code === 'not_yet' && lo.code === 'not_yet');
        expect(readyKey(hi.readyBy) >= readyKey(lo.readyBy)).toBe(true);
      }),
      RUNS
    );
  });

  it('I18 the ladder never improves as the price rises, and a failed cash check holds on every rung', () => {
    fc.assert(
      fc.property(inputsArb, fc.uniqueArray(priceArb, { minLength: 3, maxLength: 4 }), (inputs, prices) => {
        const sorted = [...prices].sort((a, b) => a - b);
        const results = sorted.map((p) => evaluate(inputs, checkOf(p, { plan: null, purpose: null, emergency: false })));
        fc.pre(!asking(...results.map((r) => r.result)));
        for (let i = 1; i < results.length; i++) {
          expect(codeRank(results[i]!.result.code)).toBeLessThanOrEqual(codeRank(results[i - 1]!.result.code));
          if (results[i - 1]!.cash.kind !== 'ok') expect(results[i]!.result.code).toBe('not_yet');
        }
      }),
      RUNS
    );
  });
});
