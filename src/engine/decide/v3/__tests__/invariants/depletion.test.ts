/**
 * I-D54 and I-D63 (05.4 D-54, D-60, D-61, D-63): the depletion lines appear only where they apply, lead the answer, agree with
 * each other, never show a locked net as lasting; and "No: your month is already short" is exactly the already-short usual month.
 * Golden persons, with and without a safety-net record (both sides of the lock).
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { V3Inputs } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, inputsArb, netInputsArb, withSafetyNet } from './arbitraries';

const DEPLETION = new Set(['usual_month_short', 'depletion_payment', 'plan_makes_short', 'price_over_net', 'net_lasts', 'net_lasts_without', 'interest_is_a_cost', 'balanced_month_room', 'month_balance_gap']);
const anyInputsArb: fc.Arbitrary<V3Inputs> = fc.oneof(inputsArb, netInputsArb.map(({ base, n }) => withSafetyNet(base, n)));

describe('depletion invariants', () => {
  it('I-D54 the lines appear only under (a) to (c), lead the answer, add up, and never show a locked net lasting', () => {
    fc.assert(
      fc.property(anyInputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        const r = ev.result;
        const tl = ev.month.typicalLeft;
        const dep = r.facts.filter((f) => DEPLETION.has(f.code));
        const M = ev.purchase?.monthly ?? 0;
        const applies = r.code !== 'needs_input' && tl !== null && (tl < 0 || (M > 0 && tl - M < 0 && (r.code === 'monthly_short' || r.code === 'not_yet')));
        expect(dep.length > 0).toBe(applies);
        expect(r.facts.slice(0, dep.length)).toEqual(dep);
        const pay = dep.find((f) => f.code === 'depletion_payment');
        if (pay !== undefined) expect(pay.values['shortAfter']).toBe((pay.values['shortBefore'] as number) + (pay.values['monthly'] as number));
        if (ev.net?.locked === true) expect(dep.some((f) => f.code === 'net_lasts' || f.code === 'net_lasts_without')).toBe(false);
      }),
      { numRuns: fcRuns(300), seed: 0x5454 }
    );
  });

  it('I-D63 month_already_short exactly when the usual month is short before the purchase, with no ready-by date', () => {
    fc.assert(
      fc.property(anyInputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        const r = ev.result;
        const short = r.code !== 'needs_input' && ev.month.typicalLeft !== null && ev.month.typicalLeft < 0;
        expect(r.variant === 'month_already_short').toBe(short);
        if (short) expect(r.readyBy).toBeNull();
      }),
      { numRuns: fcRuns(300), seed: 0x5463 }
    );
  });
});
