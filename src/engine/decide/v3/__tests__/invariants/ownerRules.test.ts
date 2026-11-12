/**
 * Named properties for the owner's rules that can change a headline and had none (05.4-40, ENG-19, D-136):
 * I-D43, I-runway (D-46), I-D48 (with D-50 (3)), I-D50, I-D72, I-D80, I-D96 (with D-97) and I-D123.
 * Each runs over the synthetic people (invariants/synthetic.ts) or a focused draw, at fcRuns(200). The other owner rules map to
 * their existing properties or unit tests in ruleList.test.ts.
 */
import fc from 'fast-check';
import { divideHalfUp } from '../../../../money/rounding';
import { PERCENT_SCALE } from '../../../../payoff/types';
import { addDays } from '../../dates';
import { evaluate } from '../../evaluate';
import type { Fact, Result, V3Debt } from '../../types';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { toEngineInputs } from '../rightAnswers/fixture';
import type { RightAnswerFixture } from '../rightAnswers/schema';
import { costlyDebtArb, shortPlanArb, shortWaitPlanArb, syntheticFixtureArb } from './synthetic';

const run = (f: RightAnswerFixture): Result => {
  const { inputs, check } = toEngineInputs(f);
  return evaluate(inputs, check).result;
};
const factOf = (r: Result, code: string): Fact | undefined => r.facts.find((f) => f.code === code);
const has = (r: Result, code: string): boolean => factOf(r, code) !== undefined;
const headline = (r: Result) => ({ code: r.code, variant: r.variant, afterBuy: r.afterBuy, readyBy: r.readyBy });

/** The month-short answers (D-63 / D-65). */
const MONTH_SHORT = ['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'];
/** D-125: the countries with a checked free-help entry. */
const HELP_COUNTRIES = ['GB', 'US', 'CA'];

describe('owner rules as named properties (05.4-40)', () => {
  it('I-D43 the ask about unrecorded debts never changes the answer: recording a $0 loan and a $0 card leaves it as it was', () => {
    let asked = 0;
    fc.assert(
      fc.property(syntheticFixtureArb, (f) => {
        const { inputs, check } = toEngineInputs(f);
        const a = evaluate(inputs, check).result;
        if (a.code === 'needs_input') expect(has(a, 'ask_debts_not_recorded')).toBe(false);
        if (!has(a, 'ask_debts_not_recorded')) return;
        asked += 1;
        const zero = (id: string, kind: V3Debt['kind']): V3Debt => ({ id, kind, balance: 0 as V3Debt['balance'], minimum: 0 as V3Debt['minimum'], apr: null, secured: false, isHousing: false, dueDay: null });
        const b = evaluate({ ...inputs, debts: [...inputs.debts, zero('zero-loan', 'loan'), zero('zero-card', 'card')] }, check).result;
        expect(headline(b)).toEqual(headline(a));
      }),
      { numRuns: fcRuns(200), seed: 0x0d43 }
    );
    console.log(`I-D43: ${asked} draws carried the ask`);
    if (isFullRun(200)) expect(asked).toBeGreaterThan(0);
  });

  it('I-runway a bigger monthly gap never covers more payments (D-46)', () => {
    let reached = 0;
    fc.assert(
      fc.property(shortPlanArb, fc.integer({ min: 1, max: 10 }), (f, extraPct) => {
        const a = run(f);
        const cov = factOf(a, 'covered_from_savings');
        const further = factOf(a, 'further_shortfall_runway');
        if (cov === undefined) {
          expect(further).toBeUndefined(); // the further line only ever follows the first
          return;
        }
        reached += 1;
        const covered = Number(cov.values.covered);
        if (further !== undefined) expect(Number(further.values.covered)).toBeLessThanOrEqual(covered);
        // the same person spending more each month: a bigger gap
        const more = run({ ...f, usualMonth: { ...f.usualMonth, everyday: f.usualMonth.everyday + Math.floor((f.pay.amount * extraPct) / 100) } });
        const cov2 = factOf(more, 'covered_from_savings');
        if (cov2 !== undefined) expect(Number(cov2.values.covered)).toBeLessThanOrEqual(covered);
      }),
      { numRuns: fcRuns(200), seed: 0x0d46 }
    );
    console.log(`I-runway: ${reached} draws carried the runway lines`);
    if (isFullRun(200)) expect(reached).toBeGreaterThan(0);
  });

  it('I-D48 every plan answer carries net_covers_surprises and income_or_costs_first, fact lines on or off, and interest_is_a_cost exactly when there is interest', () => {
    let plans = 0;
    fc.assert(
      fc.property(syntheticFixtureArb, (f) => {
        if (f.check.pay.mode !== 'plan') return;
        for (const factLines of [true, false]) {
          const { inputs, check } = toEngineInputs({ ...f, factLines });
          const e = evaluate(inputs, check);
          const s = e.purchase?.schedule ?? null;
          if (s === null || e.result.code === 'needs_input') continue;
          plans += 1;
          expect(has(e.result, 'net_covers_surprises')).toBe(true);
          expect(has(e.result, 'income_or_costs_first')).toBe(true);
          expect(has(e.result, 'interest_is_a_cost')).toBe(s.totalInterest > 0);
        }
      }),
      { numRuns: fcRuns(200), seed: 0x0d48 }
    );
    console.log(`I-D48: ${plans} plan answers checked (fact lines on and off)`);
    if (isFullRun(200)) expect(plans).toBeGreaterThan(0);
  });

  it('I-D50 "tight" is never added to a "Dips into your safety net" answer', () => {
    fc.assert(
      fc.property(syntheticFixtureArb, (f) => {
        const r = run(f);
        if (r.code === 'fits_uses_net') expect(r.variant).not.toBe('tight');
      }),
      { numRuns: fcRuns(200), seed: 0x0d50 }
    );
  });

  it('I-D72 the costly-debt caution shows only when the earlier money would cut a 20%+ debt\'s interest by at least 1.00 a month, and always then', () => {
    let costly = 0;
    let quiet = 0;
    fc.assert(
      fc.property(fc.oneof(syntheticFixtureArb, costlyDebtArb), (f) => {
        const { inputs, check } = toEngineInputs(f);
        const r = evaluate(inputs, check).result;
        if (r.code !== 'fits_unspent') {
          expect(r.variant).not.toBe('costly_debt');
          return;
        }
        const earlier = r.split.filter((s) => s.source === 'unspent_earlier' || s.source === 'extra_savings').reduce((t, s) => t + s.amount, 0);
        const saves = (d: V3Debt): bigint =>
          d.apr === null || d.apr <= 0n ? 0n : divideHalfUp(BigInt(Math.max(0, Math.min(earlier, d.balance))) * d.apr, 100n * PERCENT_SCALE * 12n);
        // D-102: a sale that pays a debt leaves only what is still owed on it (sale_counted, debt_left_after_sale); a debt the sale pays
        // off is gone, so its interest is not there to cut (nightly 2026-11-07..11, seed 3442: a sale paid a 29.9% loan in full).
        const paid = has(r, 'sale_counted') ? (check.replaces?.sale?.paysDebtId ?? null) : null;
        const leftAfterSale = Number(factOf(r, 'debt_left_after_sale')?.values.amount ?? 0);
        const owed = inputs.debts.flatMap((d) => (d.id !== paid ? [d] : leftAfterSale > 0 ? [{ ...d, balance: leftAfterSale as V3Debt['balance'] }] : []));
        const qualifies = owed.some((d) => d.apr !== null && d.apr * 100n >= 2000n * PERCENT_SCALE && saves(d) >= 100n);
        if (r.variant === 'costly_debt') {
          costly += 1;
          expect(qualifies).toBe(true);
        } else if (!qualifies) {
          quiet += 1;
        } else {
          // the caution exists but a stronger one leads (D-59 / D-71 / D-77 order): only month-short, tight or low_month lead it
          expect([...MONTH_SHORT, 'tight', 'low_month']).toContain(r.variant);
        }
      }),
      { numRuns: fcRuns(200), seed: 0x0d72 }
    );
    console.log(`I-D72: ${costly} costly-debt answers, ${quiet} fits_unspent with no qualifying debt`);
    if (isFullRun(200)) expect(costly).toBeGreaterThan(0);
  });

  it('I-D80 a cash route ready within 31 days is never "Only by borrowing"', () => {
    let soon = 0;
    fc.assert(
      fc.property(fc.oneof(syntheticFixtureArb, shortWaitPlanArb), (f) => {
        if (f.check.pay.mode !== 'plan') return;
        const plan = run(f);
        if (plan.code !== 'fits_by_borrowing') return;
        const cash = run({ ...f, check: { ...f.check, pay: { mode: 'once' } } });
        const r = cash.readyBy;
        if (cash.code !== 'not_yet' || r === null) return;
        const day = r.kind === 'date' ? r.date : `${r.month}-${String(new Date(Date.UTC(Number(r.month.slice(0, 4)), Number(r.month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
        if (day > addDays(f.asOf, 31)) return;
        soon += 1;
        expect(plan.variant).toBe('borrowing_costs_more');
      }),
      { numRuns: fcRuns(200), seed: 0x0d80 }
    );
    console.log(`I-D80: ${soon} plans whose cash route was ready within 31 days`);
    if (isFullRun(200)) expect(soon).toBeGreaterThan(0);
  });

  it('I-D96 a purchase date in the past or not a real date reads as today, and two dates past day 90 in one month answer alike', () => {
    fc.assert(
      fc.property(syntheticFixtureArb, fc.integer({ min: 1, max: 400 }), fc.constantFrom('2026-02-31', 'soon', ''), fc.integer({ min: 95, max: 300 }), (f, back, bad, ahead) => {
        if (f.check.purchaseDate != null) return; // only people the generator left undated
        const today = run(f);
        expect(run({ ...f, check: { ...f.check, purchaseDate: addDays(f.asOf, -back) } })).toEqual(today);
        expect(run({ ...f, check: { ...f.check, purchaseDate: bad } })).toEqual(today);
        // D-96: past day 90 the up-front money is held to day 90; inside one calendar month the usual months before it are the same.
        // D-137: a sale counts toward such a purchase only when it arrives by day 90, so sales are covered too.
        const d1 = addDays(f.asOf, ahead);
        const d2 = addDays(d1, 1);
        if (d2.slice(0, 7) !== d1.slice(0, 7)) return;
        const a = run({ ...f, check: { ...f.check, purchaseDate: d1 } });
        const b = run({ ...f, check: { ...f.check, purchaseDate: d2 } });
        expect({ code: b.code, variant: b.variant, afterBuy: b.afterBuy }).toEqual({ code: a.code, variant: a.variant, afterBuy: a.afterBuy });
      }),
      { numRuns: fcRuns(200), seed: 0x0d96 }
    );
  });

  it('I-D123 the free-help line shows on every answer whose usual month is short, in the countries with an entry, and nowhere else', () => {
    let shown = 0;
    fc.assert(
      fc.property(syntheticFixtureArb, (f) => {
        const { inputs, check } = toEngineInputs(f);
        const r = evaluate(inputs, check).result;
        const short = r.code !== 'needs_input' && r.readiness?.ready !== false && (r.code === 'monthly_short' || (r.variant !== null && MONTH_SHORT.includes(r.variant)));
        const expected = short && inputs.region !== null && HELP_COUNTRIES.includes(inputs.region);
        if (expected) shown += 1;
        expect(has(r, 'free_help')).toBe(expected);
      }),
      { numRuns: fcRuns(200), seed: 0x0d23 }
    );
    console.log(`I-D123: free help shown on ${shown} draws`);
  });
});
