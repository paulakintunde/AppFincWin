/**
 * I53 and I54 (05.4 FIN-11 as changed by D-47; CMP-F13, D-25). Golden persons, perturbed (inputsArb / netInputsArb).
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { evaluate } from '../../evaluate';
import { heldBackForBills } from '../../heldBack';
import type { CheckV2, V3Inputs, V3Series } from '../../types';
import { v3Series } from '../helpers/fixtures';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, codeRank, inputsArb, netInputsArb, withSafetyNet } from './arbitraries';

const mu = minorUnits;

/** A yearly or every-3-month bill with its first due date up to two years either side of 2026-10. */
const billArb: fc.Arbitrary<V3Series> = fc
  .record({
    every: fc.constantFrom(3, 12),
    amount: fc.integer({ min: 1, max: 5_000_000 }),
    year: fc.integer({ min: 2024, max: 2027 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    choice: fc.constantFrom('excluded' as const, 'monthly' as const, null),
  })
  .map((b) =>
    v3Series({
      id: 'arb-yearly',
      role: 'bill',
      cadence: { unit: 'month', every: b.every },
      anchorDate: `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`,
      amount: b.amount,
      typicalChoice: b.choice,
    })
  );

const spare = (inputs: V3Inputs, check: CheckV2): number | null => {
  const u = evaluate(inputs, check).funds.unspent;
  return u === null ? null : (u.available ?? u.value);
};

describe('held-back bills and the untouched line', () => {
  it('I53 no untouched claim without a net: nothing saved (or no record and no fund) never says the safety net is untouched', () => {
    fc.assert(
      fc.property(netInputsArb, checkArb, fc.boolean(), ({ base, n }, check, noRecord) => {
        const inputs: V3Inputs = noRecord ? { ...base, safetyNet: null, emergency: null } : withSafetyNet(base, { ...n, saved: 0 });
        expect(evaluate(inputs, check).result.facts.some((f) => f.code === 'emergency_untouched')).toBe(false);
      }),
      { numRuns: fcRuns(300), seed: 0x0553 }
    );
  });

  it('I54 a held-back share never raises spare money, and a lower usual leftover never lowers the hold-back', () => {
    fc.assert(
      fc.property(inputsArb, billArb, checkArb, (base, bill, check) => {
        const withBill: V3Inputs = { ...base, series: [...base.series, bill] };
        const before = spare(base, check);
        const after = spare(withBill, check);
        if (before !== null && after !== null) expect(after).toBeLessThanOrEqual(before);
        const a = evaluate(base, check).result;
        const b = evaluate(withBill, check).result;
        if (a.code !== 'needs_input' && b.code !== 'needs_input') expect(codeRank(b.code)).toBeLessThanOrEqual(codeRank(a.code));
      }),
      { numRuns: fcRuns(200), seed: 0x0554 }
    );
    fc.assert(
      fc.property(billArb, fc.integer({ min: -100_000, max: 2_000_000 }), fc.integer({ min: 0, max: 2_000_000 }), (bill, low, more) => {
        const asOf = '2026-10-15';
        const lower = heldBackForBills([bill], [], asOf, mu(low));
        const higher = heldBackForBills([bill], [], asOf, mu(low + more));
        expect(lower.total).toBeGreaterThanOrEqual(higher.total);
        for (const p of lower.parts) expect(p.holdBack).toBeLessThanOrEqual(p.builtUp);
      }),
      { numRuns: fcRuns(500), seed: 0x0554 }
    );
  });
});
