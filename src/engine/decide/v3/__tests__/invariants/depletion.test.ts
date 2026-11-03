/**
 * I-D54 and I-D65 (05.4 D-54, D-60, D-61, D-63, D-65, D-66): the depletion lines appear only where they apply, lead the answer
 * (after a D-65 tier line), agree with each other, never show a locked net as lasting; and an already-short usual month always
 * gets one of the four D-65 headlines, with Small and Moderate only on a cash fit with no monthly cost.
 * Golden persons, with and without a safety-net record (both sides of the lock).
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { V3Inputs } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, inputsArb, netInputsArb, withSafetyNet } from './arbitraries';

const DEPLETION = new Set(['usual_month_short', 'depletion_payment', 'plan_makes_short', 'price_over_net', 'net_lasts', 'net_lasts_without', 'interest_is_a_cost', 'balanced_month_room', 'month_balance_gap']);
const TIERS = ['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'];
const TIER_FACTS = new Set(['month_short_fits', 'money_lasts_shorter']);
const anyInputsArb: fc.Arbitrary<V3Inputs> = fc.oneof(inputsArb, netInputsArb.map(({ base, n }) => withSafetyNet(base, n)));

describe('depletion invariants', () => {
  it('I-D54 the lines appear only under (a) to (c), lead the answer, add up, and never show a locked net lasting', () => {
    fc.assert(
      fc.property(anyInputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        const r = ev.result;
        const tl = ev.month.typicalLeft;
        const dep = r.facts.filter((f) => DEPLETION.has(f.code));
        // D-68 branch (owner, 2026-11-03: "judge by cash better by a slim margin, with caution"): a short plan judged by cash reads
        // as a one-off of its whole cost (monthly 0 here), with its caution line after any tier line; its interest line still shows.
        const d68 = r.facts.some((f) => f.code === 'short_plan_from_cash');
        const M = d68 ? 0 : (ev.purchase?.monthly ?? 0);
        const interest = d68 && (ev.purchase?.schedule?.totalInterest ?? 0) > 0;
        const applies = r.code !== 'needs_input' && tl !== null && (tl < 0 || interest || (M > 0 && tl - M < 0 && (r.code === 'monthly_short' || r.code === 'not_yet')));
        expect(dep.length > 0).toBe(applies);
        if (d68 && tl !== null && tl >= 0) expect(dep.map((f) => f.code)).toEqual(interest ? ['interest_is_a_cost'] : []);
        if (d68) for (const c of ['depletion_payment', 'plan_makes_short']) expect(dep.some((f) => f.code === c)).toBe(false);
        let lead = r.facts.length > 0 && TIER_FACTS.has(r.facts[0]!.code) ? 1 : 0;
        if (d68) {
          expect(r.facts[lead]?.code).toBe('short_plan_from_cash');
          lead += 1;
        }
        expect(r.facts.slice(lead, lead + dep.length)).toEqual(dep);
        const pay = dep.find((f) => f.code === 'depletion_payment');
        if (pay !== undefined) expect(pay.values['shortAfter']).toBe((pay.values['shortBefore'] as number) + (pay.values['monthly'] as number));
        if (ev.net?.locked === true) expect(dep.some((f) => f.code === 'net_lasts' || f.code === 'net_lasts_without')).toBe(false);
      }),
      { numRuns: fcRuns(300), seed: 0x5454 }
    );
  });

  it('I-D65 an already-short usual month always gets one of the four tiers, no ready-by date, and no net line while locked (D-66)', () => {
    fc.assert(
      fc.property(anyInputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        const r = ev.result;
        const short = r.code !== 'needs_input' && ev.month.typicalLeft !== null && ev.month.typicalLeft < 0;
        expect(TIERS.includes(r.variant ?? '')).toBe(short);
        if (short) expect(r.readyBy).toBeNull();
        if (r.variant === 'month_short_small' || r.variant === 'month_short_moderate' || r.variant === 'month_short_moderate_extra') {
          expect(['fits_month', 'fits_unspent']).toContain(r.code);
          // D-68 branch (owner, 2026-11-03: "judge by cash better by a slim margin, with caution"; refinement (a): the tier of a
          // cash buy of the same total): a short plan judged by cash keeps its monthly figure, with the caution line second.
          if (r.facts[1]?.code === 'short_plan_from_cash') expect(ev.purchase?.schedule).not.toBeNull();
          else expect(ev.purchase?.monthly).toBe(0);
          expect(TIER_FACTS.has(r.facts[0]?.code ?? '')).toBe(true);
        }
        if (r.variant === 'month_short_moderate_extra') expect(r.split.some((s) => s.source === 'extra_savings')).toBe(true);
        if (ev.net?.locked === true) expect(r.facts.some((f) => f.code === 'net_lasts' || f.code === 'net_lasts_without')).toBe(false);
      }),
      { numRuns: fcRuns(300), seed: 0x5465 }
    );
  });
});
