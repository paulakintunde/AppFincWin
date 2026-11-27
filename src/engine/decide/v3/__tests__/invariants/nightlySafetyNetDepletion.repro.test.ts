/**
 * Known red (debug note .planning/debug/nightly-safetynet-depletion.md). Replays the two counterexamples that have failed the
 * Nightly engine properties (FC_RUNS=2000) every night since 2026-11-23, with the recorded seed and path, and the assertions of
 * safetyNet.test.ts I-D41 (need_net_line) and depletion.test.ts I-D54 exactly as they read on main.
 * Both fail because 08.1-13 (606f0bc2, owner option 1) leads a Fits answer with below_zero_later_without / below_zero_later_with,
 * and the two properties only set aside not_within_year and below_zero_without. `it.failing` keeps the file green while the
 * properties are out of date; once they are fixed, flip these to `it` (they then pass) or delete this file.
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { Fact, Result, V3Inputs } from '../../types';
import { checkArb, checkOf, inputsArb, netInputsArb, priceArb, withSafetyNet, type NetTweak } from './arbitraries';

const DEPLETION = new Set<string>(['usual_month_short', 'depletion_payment', 'plan_makes_short', 'price_over_net', 'net_lasts', 'net_lasts_without', 'interest_is_a_cost', 'balanced_month_room', 'month_balance_gap']);
const D08 = new Set<string>(['not_within_year', 'below_zero_without']); // as on main: the later-dip lines are missing
const run = (inputs: V3Inputs, check: Parameters<typeof evaluate>[1]): Result => evaluate(inputs, check).result;

describe('nightly 2026-11-23.. known red: the later-dip lines lead before the lines these properties expect first', () => {
  it.failing('I-D41 replay (seed 1365): a need answer leads with below_zero_later_without, not need_net_line', () => {
    const n: NetTweak = { protect: true, size: 1_000_000, saved: 1_000_000, locked: false };
    const afterDepletion = (facts: readonly Fact[]): readonly Fact[] => facts.filter((f) => !DEPLETION.has(f.code) && !D08.has(f.code));
    fc.assert(
      fc.property(netInputsArb, priceArb, ({ base }, price) => {
        const inputs = withSafetyNet(base, n);
        const need = run(inputs, checkOf(price, { plan: null, purpose: { kind: 'preset', value: 'necessity' }, emergency: false }));
        fc.pre(need.code === 'fits_uses_net');
        expect(afterDepletion(need.facts)[0]?.code).toBe('need_net_line');
      }),
      { seed: 1365, path: '2392:3:1:1:3:1:1:1:1:4:2:5:3:5:5:5:5:6:5:5:6:5:6:8:6:5:5', endOnFailure: true }
    );
  });

  it.failing('I-D54 replay (seed 21588): the depletion block is empty because a later-dip line sits where the block starts', () => {
    const anyInputsArb: fc.Arbitrary<V3Inputs> = fc.oneof(inputsArb, netInputsArb.map(({ base, n }) => withSafetyNet(base, n)));
    const TIER_FACTS = new Set(['month_short_fits', 'money_lasts_shorter']);
    fc.assert(
      fc.property(anyInputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        const r = ev.result;
        const tl = ev.month.typicalLeft;
        const facts = r.facts.filter((f) => !D08.has(f.code));
        const d68 = facts.some((f) => f.code === 'short_plan_from_cash');
        const M = d68 ? 0 : (ev.purchase?.monthly ?? 0);
        const interest = d68 && (ev.purchase?.schedule?.totalInterest ?? 0) > 0;
        const applies = r.code !== 'needs_input' && tl !== null && (tl < 0 || interest || (M > 0 && tl - M < 0 && (r.code === 'monthly_short' || r.code === 'not_yet')));
        let lead = facts.length > 0 && TIER_FACTS.has(facts[0]!.code) ? 1 : 0;
        if (d68) lead += 1;
        let end = lead;
        while (end < facts.length && DEPLETION.has(facts[end]!.code)) end += 1;
        if (applies) expect(end - lead).toBeGreaterThan(0);
      }),
      { seed: 21588, path: '1726:8:8:8:10:8:8:8:8:8:8:8:9:8:8:9:10:9:11:35:3:2:1:2:2:2:2:7:2:2:3:4:2:2:2:2:25:1:1:1:4:1:1:2:2:2:6:3:4:3:4:4:25:1:1:4:3:8:4:3:5:3:3:4:3:26:1:1:2:2:6:3:4:6:2:2:2:25:1:2:6:2:3:2:5:2:4:2:25:2:5:7:2:2:2:2:3:25:2:2:2:6:4:3:2:2:3:3:2:2:25:2:7:3:5:2:2:4:25:2:8:3:3:3:3:26:2:2:2:2:9:3:3:2:3:3:25:2:10:3:2:29:2:2:2:2:2:2:2:11:4:28:2:2:2:2:2:2:12:4:3:25:2:2:13:3:3:2:25:2:14:3:2:25:2:2:15:3:25:2:2:16:26:2:2:25:2:41:18:25:2:45:1:5:1:5:6:2:3:6:25:1:6:9:8:8:8:7:6:7:7:7:7:7:7:7:7:7:7:7:7:7:7:7:7:7:7:8:7:7:7:7:7:7:7:7:7:7:7:8:8:10:10:7:7:7:7:7:12:7:8:8:8', endOnFailure: true }
    );
  });
});
