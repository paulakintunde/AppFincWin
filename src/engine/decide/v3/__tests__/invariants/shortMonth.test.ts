/**
 * I57 and I58 (05.4-21: FIN-06 / ENG-06 short month, FIN-07 / D-40 tight). Golden persons, perturbed (inputsArb).
 *
 * I57: a usual month at or below 0 never fits a new monthly payment. The one exception is D-68 (owner, later than FIN-06): a short
 * plan that money on hand pays in full inside the 90 days is judged by cash like a one-off, and its answer carries the
 * short_plan_from_cash caution line (refinement a: an already-short month then gets the D-65 tier a cash buy would get).
 * I58: for fixed inputs, a dearer price (so a larger payment) never turns a tight answer into a looser one: it stays tight, or
 * becomes a stricter code, a month-short headline (D-63 / D-65), or a D-68 cash plan with its caution line. Plans and one-offs.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { CODE_PRECEDENCE } from '../../constants';
import { evaluate } from '../../evaluate';
import type { Code, Result, V3Inputs } from '../../types';
import { checkOnce, checkPlan } from '../helpers/fixtures';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { codeRank, inputsArb, planPayArb, priceArb } from './arbitraries';

const FITS: readonly Code[] = ['fits_month', 'fits_unspent', 'fits_uses_net', 'fits_uses_overdraft', 'fits_by_borrowing', 'fits_on_your_answer', 'emergency_use'] as Code[];
const MONTH_SHORT = ['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'];
const byCash = (r: Result): boolean => r.facts.some((f) => f.code === 'short_plan_from_cash');

/** Tight, or stricter than any plain fit (a stricter code, a month-short headline, or a D-68 cash plan's caution). */
function tightOrStricter(r: Result): boolean {
  if (r.variant === 'tight') return true;
  if (codeRank(r.code) < CODE_PRECEDENCE.indexOf('fits_unspent')) return true;
  return byCash(r) || (r.variant !== null && MONTH_SHORT.includes(r.variant));
}

/** The same person with a set everyday figure (V3Inputs.everydayOverride), so short usual months are drawn often. */
function withEveryday(inputs: V3Inputs, everyday: number | null): V3Inputs {
  return everyday === null ? inputs : { ...inputs, everydayOverride: minorUnits(everyday) };
}

describe('short month and tight', () => {
  it('I57 a short month never fits a new payment (except a D-68 plan judged by cash, with its caution line)', () => {
    let short = 0;
    fc.assert(
      fc.property(inputsArb, fc.option(fc.integer({ min: 0, max: 1_500_000 }), { nil: null }), priceArb, planPayArb, (base, everyday, price, plan) => {
        const inputs = withEveryday(base, everyday);
        const e = evaluate(inputs, checkPlan(price, plan));
        const tl = e.month.typicalLeft;
        // a plan whose monthly equivalent rounds to 0 adds no monthly payment (no monthly part)
        if (tl === null || tl > 0 || e.result.code === 'needs_input' || (e.purchase?.monthly ?? 0) === 0) return;
        short += 1;
        if (byCash(e.result)) return;
        expect(FITS).not.toContain(e.result.code);
        expect(e.result.parts.monthly).toBe('monthly_short');
      }),
      { numRuns: fcRuns(400), seed: 0x0557 }
    );
    if (isFullRun(400)) expect(short).toBeGreaterThan(0);
  });

  it('I58 tight is monotone in payment size (plans)', () => {
    let tight = 0;
    fc.assert(
      fc.property(inputsArb, priceArb, fc.integer({ min: 1, max: 5_000_000 }), planPayArb, (inputs, price, more, plan) => {
        const a = evaluate(inputs, checkPlan(price, plan)).result;
        if (a.variant !== 'tight') return;
        tight += 1;
        const b = evaluate(inputs, checkPlan(price + more, plan)).result;
        expect({ code: b.code, variant: b.variant, ok: tightOrStricter(b) }).toEqual({ code: b.code, variant: b.variant, ok: true });
      }),
      { numRuns: fcRuns(600), seed: 0x0558 }
    );
    if (isFullRun(600)) expect(tight).toBeGreaterThan(0);
  });

  it('I58 tight is monotone in one-off price', () => {
    let tight = 0;
    fc.assert(
      fc.property(inputsArb, priceArb, fc.integer({ min: 1, max: 5_000_000 }), (inputs, price, more) => {
        const a = evaluate(inputs, checkOnce(price)).result;
        if (a.variant !== 'tight') return;
        tight += 1;
        const b = evaluate(inputs, checkOnce(price + more)).result;
        expect({ code: b.code, variant: b.variant, ok: tightOrStricter(b) }).toEqual({ code: b.code, variant: b.variant, ok: true });
      }),
      { numRuns: fcRuns(600), seed: 0x0558 }
    );
    if (isFullRun(600)) expect(tight).toBeGreaterThan(0);
  });
});
