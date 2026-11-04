/**
 * 05.4 BO-05 / ENG-29 (05.4-26, VC-02): running-cost lines and the purchase date, through evaluate() on the generated people.
 * - I68: adding a running cost never raises the money left (this month's figure, the usual month) and never gives a better answer.
 * - I69: a running cost is counted only from its start date (its outflows never fall before it; one that starts after the 90-day
 *   path leaves the cash check exactly as it was).
 * - D-42: every answer states when it is to be bought (Result.purchaseDate), asks included.
 */
import * as fc from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { evaluate } from '../../evaluate';
import { CASH_PATH_DAYS_V3 } from '../../constants';
import { addDays } from '../../dates';
import { runningCostOutflows } from '../../fullCost/runningCosts';
import type { CheckV2, Result, RunningCostLine, V3Inputs } from '../../types';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { toEngineInputs } from '../rightAnswers/fixture';
import { loadCases } from '../rightAnswers/loader';
import { checkArb, codeRank, inputsArb } from './arbitraries';

const run = (i: V3Inputs, c: CheckV2): Result => evaluate(i, c).result;

/** A running cost drawn around the check date: started up to about 13 months before it, or starting up to about 7 months after. */
const lineArb = (asOf: string): fc.Arbitrary<RunningCostLine> =>
  fc
    .record({
      amount: fc.integer({ min: 100, max: 60_000 }),
      everyMonths: fc.constantFrom(1 as const, 3 as const, 12 as const),
      startIn: fc.integer({ min: -400, max: 200 }),
      endAfter: fc.option(fc.integer({ min: 0, max: 400 }), { nil: null }),
    })
    .map((r) => {
      const start = addDays(asOf, r.startIn);
      return { id: 'rc-gen', amount: mu(r.amount), everyMonths: r.everyMonths, start, end: r.endAfter === null ? null : addDays(start, r.endAfter), on: true };
    });

const withLine = fc.tuple(inputsArb, checkArb).chain(([inputs, check]) => fc.tuple(fc.constant(inputs), fc.constant(check), lineArb(inputs.asOf)));

describe('I68 adding a running cost never raises the money left', () => {
  it('I68 this month and the usual month are no higher, and the code never ranks looser, with a running cost added', () => {
    let compared = 0;
    fc.assert(
      fc.property(withLine, ([inputs, check, line]) => {
        const without = run(inputs, check);
        const added = run(inputs, { ...check, runningCosts: [line] });
        expect(added.afterBuy.month).toBeLessThanOrEqual(without.afterBuy.month);
        if (without.afterBuy.usualMonth !== null) expect(added.afterBuy.usualMonth as number).toBeLessThanOrEqual(without.afterBuy.usualMonth);
        fc.pre(without.code !== 'needs_input' && added.code !== 'needs_input');
        compared += 1;
        expect(codeRank(added.code)).toBeLessThanOrEqual(codeRank(without.code));
      }),
      { numRuns: fcRuns(200), seed: 0x0568 }
    );
    if (isFullRun(200)) expect(compared).toBeGreaterThan(0);
  });

  it('I68 a switched-off line changes nothing but the usual month it states (FIN-28, RC-09)', () => {
    fc.assert(
      fc.property(withLine, ([inputs, check, line]) => {
        const without = run(inputs, check);
        const off = run(inputs, { ...check, runningCosts: [{ ...line, on: false }] });
        expect({ ...off, afterBuy: { ...off.afterBuy, usualMonth: without.afterBuy.usualMonth } }).toEqual(without);
      }),
      { numRuns: fcRuns(100), seed: 0x0568 }
    );
  });
});

describe('I69 a running cost is counted only from its start date', () => {
  it('I69 every outflow falls on or after the start, inside the path, and on or before the end', () => {
    fc.assert(
      fc.property(fc.constantFrom('2026-01-31', '2026-10-15', '2027-02-28'), fc.integer({ min: 1, max: CASH_PATH_DAYS_V3 }), (asOf, days) =>
        fc.assert(
          fc.property(lineArb(asOf), (line) => {
            const flows = runningCostOutflows([line], asOf, days);
            for (const f of flows) {
              expect(f.date >= line.start && f.date >= asOf && f.date < addDays(asOf, days)).toBe(true);
              if (line.end !== null) expect(f.date <= line.end).toBe(true);
              expect(f.amount).toBe(line.amount);
            }
            if (line.start >= addDays(asOf, days)) expect(flows).toEqual([]);
          }),
          { numRuns: 20, seed: 0x0569 }
        )
      ),
      { numRuns: fcRuns(20), seed: 0x0569 }
    );
  });

  it('I69 a cost that starts after the 90-day path leaves the cash check exactly as without it', () => {
    let reached = 0;
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: CASH_PATH_DAYS_V3, max: CASH_PATH_DAYS_V3 + 300 }), (inputs, check, after) => {
        const line: RunningCostLine = { id: 'late', amount: mu(25_000), everyMonths: 1, start: addDays(inputs.asOf, after), end: null, on: true };
        const without = evaluate(inputs, check);
        const late = evaluate(inputs, { ...check, runningCosts: [line] });
        expect(late.cash).toEqual(without.cash);
        if (late.purchase !== null) reached += 1;
      }),
      { numRuns: fcRuns(100), seed: 0x0569 }
    );
    if (isFullRun(100)) expect(reached).toBeGreaterThan(0);
  });
});

describe('D-42 every answer states when it is to be bought', () => {
  const rc = (id: string) => {
    const c = loadCases().find((x) => x.id === id);
    if (c === undefined) throw new Error(id);
    return toEngineInputs(c.fixture);
  };

  it('D-42 an ask, a Not yet and a fit, paid once and on a plan, carry the purchase date (today when none is given)', () => {
    const fits = rc('RC-07'); // fits_month, bought today
    expect(run(fits.inputs, fits.check)).toMatchObject({ code: 'fits_month', purchaseDate: '2026-11-15' });
    const notYet = rc('RC-06'); // not_yet, bought today
    expect(run(notYet.inputs, notYet.check)).toMatchObject({ code: 'not_yet', purchaseDate: '2026-11-15' });
    const ask = run(fits.inputs, { ...fits.check, price: null });
    expect(ask).toMatchObject({ code: 'needs_input', purchaseDate: '2026-11-15' });
    const plan = run(fits.inputs, { ...fits.check, pay: { mode: 'plan', cadence: { unit: 'month', every: 1 }, count: 10, termMonths: null, apr: null, fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) }, deposit: mu(0), tradeIn: mu(0), quotedPayment: null, firstPayment: null, deferredInterestTerm: false } });
    expect(plan).toMatchObject({ code: 'needs_input', purchaseDate: '2026-11-15' });
  });

  it('D-42 RC-08 gives its stated future date; an ask dated later keeps this month as it is', () => {
    const later = rc('RC-08');
    expect(run(later.inputs, later.check)).toMatchObject({ code: 'fits_month', purchaseDate: '2027-01-15' });
    const ask = run(later.inputs, { ...later.check, price: null });
    expect(ask).toMatchObject({ code: 'needs_input', purchaseDate: '2027-01-15' });
    expect(ask.afterBuy.month).toBe(ask.afterBuy.before);
    // the same sofa today is Not yet ($500 short; RC-08's why)
    expect(run(later.inputs, { ...later.check, purchaseDate: null }).code).toBe('not_yet');
  });

  it('D-42 RC-08 dated later: this month loses nothing, and it is judged with December added', () => {
    const later = rc('RC-08');
    const r = run(later.inputs, later.check);
    expect(r.afterBuy.month).toBe(r.afterBuy.before);
    expect(r.facts.map((f) => f.code)).not.toContain('unspent_before_after');
    // dated in December (no whole month before it), $1,500 against $1,000 is Not yet
    expect(run(later.inputs, { ...later.check, purchaseDate: '2026-12-20' }).code).toBe('not_yet');
  });
});
