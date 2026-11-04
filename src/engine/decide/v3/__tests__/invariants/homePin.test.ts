/**
 * I64 (05.4-24, D-24): Home and the answer are pinned together. For the same month, Decide Home's figure (homeFigure) and the
 * answer's afterBuy.month differ by exactly what the purchase takes from this month, plus the stated reasons:
 * - money from earlier months the answer names (earlier_money_from, D-44) and the purchase's own envelope (envelope_used) are not
 *   this month's money;
 * - a plan's payments later this month come off too; a plan whose first payment falls after this month carries first_payment_later
 *   and moves the figure by its day-one cost only.
 * The answer's before figure is Home's figure, whichever reading decides the code (the November mismatch, novemberRepro.test.ts).
 * Otherwise the build fails.
 */
import * as fc from 'fast-check';
import { homeFigure, laterThisMonth } from '../../afterBuy';
import { judgeCheck, prepare } from '../../prepare';
import type { Fact } from '../../types';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { checkArb, inputsArb } from './arbitraries';

const SEED = 0x0564;
const RUNS = 300;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const stated = (facts: readonly Fact[]): number => sum(facts.filter((f) => f.code === 'earlier_money_from').map((f) => f.values['amount'] as number));

describe('I64 Home and the answer differ by exactly the purchase this month', () => {
  it('I64 homeFigure(prepared) - afterBuy.month = the cost this month less the stated earlier money and envelope', () => {
    const seen = { answers: 0, earlier: 0, later: 0, firstLater: 0, notYet: 0 };
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const p = prepare(inputs);
        const e = judgeCheck(p, check);
        const r = e.result;
        const home = homeFigure(p);
        expect(r.afterBuy.before).toBe(home);
        expect(r.afterBuy.monthName).toBe(e.month.month);
        if (r.code === 'needs_input' || e.purchase === null) return;
        seen.answers++;
        const pur = e.purchase;
        const byCash = r.facts.some((f) => f.code === 'short_plan_from_cash');
        const cost = r.split.length > 0 ? sum(r.split.map((s) => s.amount)) : pur.dayOne;
        const envelope = sum(r.split.filter((s) => s.source === 'envelope').map((s) => s.amount));
        const later = byCash ? 0 : laterThisMonth(pur, inputs.asOf, e.month.month);
        expect(home - r.afterBuy.month).toBe(cost - stated(r.facts) - envelope + later);
        // every part of the split that is not this month's money is stated by name
        const earlierParts = sum(r.split.filter((s) => s.source === 'unspent_earlier' || s.source === 'extra_savings').map((s) => s.amount));
        expect(stated(r.facts)).toBe(earlierParts);
        if (earlierParts > 0) seen.earlier++;
        if (later > 0) seen.later++;
        if (r.code === 'not_yet') seen.notYet++;
        const firstLater = pur.schedule !== null && !byCash && pur.schedule.firstDate >= `${nextMonth(e.month.month)}-01`;
        expect(r.reasons.includes('first_payment_later')).toBe(firstLater);
        if (firstLater) {
          seen.firstLater++;
          expect(home - r.afterBuy.month).toBe(cost - stated(r.facts) - envelope);
        }
      }),
      { numRuns: fcRuns(RUNS), seed: SEED }
    );
    if (isFullRun(RUNS)) for (const [k, n] of Object.entries(seen)) expect({ k, reached: n > 0 }).toEqual({ k, reached: true });
  });

  it('I64 the usual month once payments start is the usual month less the monthly cost, for a plan; a plan leads with it', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const e = judgeCheck(prepare(inputs), check);
        const pur = e.purchase;
        if (e.result.code === 'needs_input' || pur === null) return;
        const ab = e.result.afterBuy;
        const byCash = e.result.facts.some((f) => f.code === 'short_plan_from_cash');
        const expectsUsual = e.month.typicalLeft !== null && (pur.schedule !== null || pur.runningMonthly > 0);
        expect(ab.usualMonth).toBe(expectsUsual ? (e.month.typicalLeft as number) - pur.monthly : null);
        expect(ab.lead).toBe(pur.schedule !== null && !byCash ? 'usualMonth' : 'month');
      }),
      { numRuns: fcRuns(RUNS), seed: SEED }
    );
  });
});

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
