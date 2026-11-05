/**
 * 05.4 BO-05 (05.4-27, VC-02): what a purchase replaces, save-for-it and judgeBoth, through the engine on the generated people.
 * - I70: a stopped cost is never counted after its stop date: what a stop gives back falls only after it, on the bill's own dates (or
 *   at the end of each later month for everyday spending), and a stop at or after the path's end leaves the cash check as it was.
 *   A stop never changes this month's figure (D-103) and never gives a stricter answer.
 * - I71: save-for-it has no double count: money already in the accounts Decide counts adds nothing; kept savings count at most once
 *   (more saved than they hold changes nothing), and more saved is never a later date.
 * - I72: judgeBoth equals two separate checks (cash and plan), on one Prepared.
 */
import * as fc from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { CASH_PATH_DAYS_V3 } from '../../constants';
import { addDays } from '../../dates';
import { evaluate } from '../../evaluate';
import { judgeBoth } from '../../fullCost/cashAndPlan';
import { stoppedCostFlows } from '../../fullCost/replaces';
import { saveForItReadyDate } from '../../fullCost/saveForIt';
import { seriesOccurrences } from '../../month/series';
import { prepare } from '../../prepare';
import type { StoppedCost, V3Inputs } from '../../types';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { checkArb, codeRank, inputsArb } from './arbitraries';

/** A stop drawn around the check date: a recorded bill of the person when there is one, else everyday spending. */
function stopArb(inputs: V3Inputs): fc.Arbitrary<StoppedCost> {
  const bills = inputs.series.filter((s) => s.role === 'bill');
  return fc
    .record({
      pick: fc.nat({ max: Math.max(0, bills.length - 1) }),
      everyday: fc.boolean(),
      stopIn: fc.integer({ min: -40, max: 120 }),
      amount: fc.integer({ min: 100, max: 50_000 }),
      everyMonths: fc.constantFrom(1 as const, 3 as const, 12 as const),
    })
    .map((r) => {
      const bill = bills[r.pick];
      const source: StoppedCost['source'] = r.everyday || bill === undefined ? { kind: 'everyday', categoryId: null } : { kind: 'bill', seriesId: bill.id };
      return { id: 'stop-gen', amount: mu(r.amount), everyMonths: r.everyMonths, stopDate: addDays(inputs.asOf, r.stopIn), source };
    });
}

const withStop = fc.tuple(inputsArb, checkArb).chain(([inputs, check]) => fc.tuple(fc.constant(inputs), fc.constant(check), stopArb(inputs)));

describe('I70 a stopped cost is never counted after its stop date', () => {
  it('I70 what a stop gives back falls after its stop date, on the bill\'s own dates or a month end, inside the path', () => {
    fc.assert(
      fc.property(withStop, ([inputs, check, stop]) => {
        const m = evaluate(inputs, check).month;
        const flows = stoppedCostFlows([stop], { asOf: inputs.asOf, days: CASH_PATH_DAYS_V3, series: inputs.series, paid: new Set(), debts: inputs.debts, debtFlows: [], month: m });
        const end = addDays(inputs.asOf, CASH_PATH_DAYS_V3);
        for (const f of flows) {
          expect(f.date > stop.stopDate).toBe(true);
          expect(f.date >= inputs.asOf && f.date < end).toBe(true);
          expect(f.amount).toBeGreaterThan(0);
          if (stop.source.kind === 'bill') {
            const s = inputs.series.find((x) => x.id === (stop.source as { seriesId: string }).seriesId);
            expect(s === undefined ? [] : seriesOccurrences(s, f.date, addDays(f.date, 1))).toEqual([f.date]);
          } else {
            expect(addDays(f.date, 1).slice(8, 10)).toBe('01');
          }
        }
      }),
      { numRuns: fcRuns(300), seed: 0x0570 }
    );
  });

  it('I70 a stop never changes this month\'s figure and never gives a stricter answer; one at or after the path\'s end leaves the cash check as it was', () => {
    let compared = 0;
    fc.assert(
      fc.property(withStop, ([inputs, check, stop]) => {
        const without = evaluate(inputs, check);
        const withIt = evaluate(inputs, { ...check, replaces: { stops: [stop], sale: null } });
        expect(withIt.month.monthLeft).toBe(without.month.monthLeft);
        expect(withIt.result.afterBuy.before).toBe(without.result.afterBuy.before);
        const late = evaluate(inputs, { ...check, replaces: { stops: [{ ...stop, stopDate: addDays(inputs.asOf, CASH_PATH_DAYS_V3) }], sale: null } });
        if (stop.source.kind === 'bill') expect(late.cash).toEqual(without.cash);
        fc.pre(without.result.code !== 'needs_input' && withIt.result.code !== 'needs_input');
        compared += 1;
        expect(codeRank(withIt.result.code)).toBeGreaterThanOrEqual(codeRank(without.result.code));
      }),
      { numRuns: fcRuns(200), seed: 0x0570 }
    );
    if (isFullRun(200)) expect(compared).toBeGreaterThan(0);
  });
});

describe('I71 save-for-it has no double count', () => {
  const savedArb = fc.tuple(inputsArb, checkArb, fc.integer({ min: 0, max: 2_000_000 }), fc.integer({ min: 0, max: 2_000_000 }));

  it('I71 money already in the counted accounts adds nothing; kept savings count at most once', () => {
    fc.assert(
      fc.property(savedArb, ([inputs, check, saved]) => {
        const noKept: V3Inputs = { ...inputs, accounts: (inputs.accounts ?? []).filter((a) => !(a.kind === 'savings' && a.use !== null && a.use.kind === 'untouched')) };
        const p = prepare(noKept);
        expect(saveForItReadyDate(p, check, saved)).toBe(saveForItReadyDate(p, check, 0));
        const kept: V3Inputs = { ...noKept, accounts: [...(noKept.accounts ?? []), { id: 'kept-gen', kind: 'savings', balance: mu(saved), use: { kind: 'untouched' }, overdraftLimit: null, overdraftRate: null }] };
        const pk = prepare(kept);
        expect(saveForItReadyDate(pk, check, saved + 1_000_000)).toBe(saveForItReadyDate(pk, check, saved));
      }),
      { numRuns: fcRuns(200), seed: 0x0571 }
    );
  });

  it('I71 more saved is never a later ready date', () => {
    fc.assert(
      fc.property(savedArb, ([inputs, check, a, b]) => {
        const kept: V3Inputs = { ...inputs, accounts: [...(inputs.accounts ?? []), { id: 'kept-gen', kind: 'savings', balance: mu(2_000_000), use: { kind: 'untouched' }, overdraftLimit: null, overdraftRate: null }] };
        const p = prepare(kept);
        const less = saveForItReadyDate(p, check, Math.min(a, b));
        const more = saveForItReadyDate(p, check, Math.max(a, b));
        if (less !== null && more !== null) expect(more <= less).toBe(true);
      }),
      { numRuns: fcRuns(200), seed: 0x0571 }
    );
  });
});

describe('I72 judgeBoth equals two separate checks', () => {
  it('I72 the cash side equals a paid-once check and the plan side equals the plan check, on one Prepared', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const both = judgeBoth(prepare(inputs), check);
        expect(both.cash).toEqual(evaluate(inputs, check.pay.mode === 'once' ? check : { ...check, pay: { mode: 'once' } }));
        if (check.pay.mode === 'plan') expect(both.plan).toEqual(evaluate(inputs, check));
        else expect(both.plan).toBeNull();
      }),
      { numRuns: fcRuns(200), seed: 0x0572 }
    );
  });
});

