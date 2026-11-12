/**
 * SC-6 end-to-end monotonicity (05.1-27): I9..I13 and I18 through evaluate() on the golden persons.
 * "Never better" is codeRank(after) <= codeRank(before) in the direction of the change (lower rank = stricter).
 * needs_input is a request for a figure, not a verdict, so a pair where either side asks is skipped (fc.pre): asking
 * disappears legitimately when the extra spending line makes the records look current again.
 */
import fc from 'fast-check';
import { fcRuns } from '../helpers/fcRuns';
import { evaluate } from '../../evaluate';
import type { CheckV2, ReadyBy, Result, V3Inputs, V3Line } from '../../types';
import { percent } from '../../../../payoff/types';
import { checkOf, codeRank, checkArb, inputsArb, inputsOfPerson, latePayInputsArb, mu, priceArb, shapeArb } from './arbitraries';
import { v3Line } from '../helpers/fixtures';

const RUNS = { numRuns: fcRuns(200) };

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

/** The money is in the everyday account too: the balance and the first everyday (or mixed, or unstated) account rise by it. */
function withPaidIn(inputs: V3Inputs, amount: number): V3Inputs {
  const i = (inputs.accounts ?? []).findIndex((a) => a.use === null || a.use.kind === 'everyday' || a.use.kind === 'mixed');
  const accounts = inputs.accounts?.map((a, k) => (k === i ? { ...a, balance: mu(a.balance + amount) } : a));
  return { ...inputs, balance: mu(inputs.balance + amount), ...(accounts === undefined ? {} : { accounts }) };
}

/**
 * The money spent has left the everyday account too: the balance and that account fall by it. A paid spending line the balance does
 * not show means the account opened higher by the same amount (the mirror of withPaidIn, D-86): the rest of this month's everyday
 * spending (Erest = usual everyday less what is spent so far) shrinks by the line, so the line alone would add it back to the cash path.
 */
function withPaidOut(inputs: V3Inputs, amount: number): V3Inputs {
  return withPaidIn(inputs, -amount);
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
        // The spending leaves the account too (withPaidOut); without it the case is an account that opened higher by the amount.
        const after = run(withPaidOut(withLine(inputs, extraLine(inputs, 'spending', amount, day)), amount), check);
        fc.pre(!asking(before, after));
        expect(codeRank(after.code)).toBeLessThanOrEqual(codeRank(before.code));
      }),
      RUNS
    );
  });

  // CI run 42216986391 (seed -1072770010): kim, everyday x1.31, balance x1.03, no unspent anchor, no net; a $98,960.18 plan every
  // 11 weeks x 47 at 30% APR. The cash path ends 2026-12-31 at -$0.01, so Not yet. A $1 spending line on October 1 with the balance
  // left as it was lowers Erest by $1 and ends the path at +$0.99: the cash check passes and the plan is Monthly short (a looser code).
  // That input is an account that opened $1 higher, not an extra expense; with the $1 out of the account too, nothing moves.
  it('I10 pinned: a $1 expense that leaves the account does not lift a Not yet on a -$0.01 cash path (seed -1072770010)', () => {
    const inputs = inputsOfPerson('kim', { everydayPct: 131, balancePct: 103, unspentMode: 'none', unspentPct: 0, emergency: null, extras: [] });
    const check = checkOf(9_896_018, {
      plan: { cadence: { unit: 'week', every: 11 }, count: 47, apr: percent('30'), firstPayment: { kind: 'one_period' } },
      purpose: null,
      emergency: false,
    });
    const line = extraLine(inputs, 'spending', 100, 1);
    const before = run(inputs, check);
    expect(before.code).toBe('not_yet');
    expect(run(withPaidOut(withLine(inputs, line), 100), check).code).toBe('not_yet');
    // The impossible input (the line without the money leaving): the path gains the $1 back, by design of Erest.
    expect(run(withLine(inputs, line), check).code).toBe('monthly_short');
  });

  // Seed -1745555528 (path 1324): D-68 read the plan's last PAYING period, and the level payment is rounded up to the cent, so a
  // tiny dearer plan could clear a week early. 13 weekly payments, the first one week out: $1.18 at 0% pays 11 x 10c + 8c (12
  // payments, the last on day 84, inside the 90 days, judged by cash) while $1.00 pays 12 x 8c + 4c (13 payments, the 13th on day
  // 91, outside). The window now counts the payments the person chose (13), so both are outside and both get the monthly test.
  const weekly13 = (apr: string) => ({
    plan: { cadence: { unit: 'week' as const, every: 1 }, count: 13, apr: percent(apr), firstPayment: { kind: 'one_period' as const } },
    purpose: null,
    emergency: false,
  });

  it('I9 pinned: $1.18 vs $1.00 over 13 weekly 0% payments, Sam with a short usual month (seed -1745555528)', () => {
    const inputs = inputsOfPerson('sam', { everydayPct: 129, balancePct: 50, unspentMode: 'keep', unspentPct: 0, emergency: 186_375, extras: [] });
    const hi = run(inputs, checkOf(118, weekly13('0')));
    const lo = run(inputs, checkOf(100, weekly13('0')));
    expect(codeRank(lo.code)).toBeGreaterThanOrEqual(codeRank(hi.code));
    expect([hi.code, hi.variant]).toEqual(['monthly_short', 'month_already_short']);
    expect([lo.code, lo.variant]).toEqual(['monthly_short', 'month_already_short']);
    expect(hi.facts.map((f) => f.code)).not.toContain('short_plan_from_cash');
  });

  it('I9 pinned: $1.19 vs $1.00 over 13 weekly 9% payments, Riley (seed -1745555528, path 1324)', () => {
    const inputs = inputsOfPerson('riley', { everydayPct: 135, balancePct: 100, unspentMode: 'keep', unspentPct: 0, emergency: 3_744_409, extras: [] });
    const hi = run(inputs, checkOf(119, weekly13('9')));
    const lo = run(inputs, checkOf(100, weekly13('9')));
    expect(codeRank(lo.code)).toBeGreaterThanOrEqual(codeRank(hi.code));
    expect([hi.code, hi.variant]).toEqual(['monthly_short', 'month_already_short']);
    expect([lo.code, lo.variant]).toEqual(['monthly_short', 'month_already_short']);
    expect(hi.facts.map((f) => f.code)).not.toContain('short_plan_from_cash');
  });

  // Owner decision 2026-11-12, "rounding only": the count is read only when the early finish comes from the engine's own round-up.
  // A quoted payment larger than the engine's (L-09) really clears the plan early, so it keeps its real last payment: $300 over 13
  // weekly 0% payments, the first one week out, quoted at $30 pays off in 10 (the last on day 70, inside the 90 days) while the
  // 13th chosen payment would fall on day 91. D-68 still judges it by cash, as before PR #108.
  it('D-68 pinned: a quoted payment that clears the plan inside 90 days is still judged by cash (Sam, $300, quote $30)', () => {
    const inputs = inputsOfPerson('sam', { everydayPct: 129, balancePct: 50, unspentMode: 'keep', unspentPct: 0, emergency: 186_375, extras: [] });
    const shape = weekly13('0');
    const quoted = run(inputs, checkOf(30_000, { ...shape, plan: { ...shape.plan, quotedPayment: mu(3_000) } }));
    expect([quoted.code, quoted.variant]).toEqual(['fits_unspent', 'month_short_moderate']);
    expect(quoted.facts.map((f) => f.code)).toContain('short_plan_from_cash');
    // Without the quote the engine's own payment runs all 13 weeks, past the window: the monthly test.
    expect(run(inputs, checkOf(30_000, shape)).code).toBe('monthly_short');
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
        // 05.4 D-86 (FIN-09b): the pay lands in the account too; a pay line the balance does not show means the account opened lower
        const after = run(withPaidIn(withLine(inputs, extraLine(inputs, 'income', amount, day)), amount), check);
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
      { numRuns: fcRuns(200), seed: 0x0413 }
    );
  });

  it('I13 late-month pay dates: a higher price never makes ready-by earlier', () => {
    fc.assert(
      fc.property(latePayInputsArb, shapeArb, priceArb, fc.integer({ min: 1, max: 99 }), (inputs, shape, price, pct) => {
        const cheaper = Math.max(100, Math.floor((price * pct) / 100));
        const hi = run(inputs, checkOf(price, shape));
        const lo = run(inputs, checkOf(cheaper, shape));
        fc.pre(hi.code === 'not_yet' && lo.code === 'not_yet');
        expect(readyKey(hi.readyBy) >= readyKey(lo.readyBy)).toBe(true);
      }),
      { numRuns: fcRuns(200), seed: 0x0513 }
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
          const failed = results[i - 1]!.cash.kind === 'payday' || results[i - 1]!.cash.kind === 'not_covered'; // an overdraft dip is not a failed check (05.4 FIN-03)
          if (failed) expect(results[i]!.result.code).toBe('not_yet');
        }
      }),
      RUNS
    );
  });
});
