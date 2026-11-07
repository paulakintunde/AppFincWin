// Criterion 8: a debt written by Grow (due day 1..31 or none, any balance, minimum and rate) never raises the lowest point
// and never makes the answer less strict. Same property as I55, with the debt built through debtToV3Debt.
import * as fc from 'fast-check';
import { evaluate } from '@/engine/decide/v3/evaluate';
import { applyPurchaseFlows } from '@/engine/decide/v3/cash/path';
import { prepare } from '@/engine/decide/v3/prepare';
import type { V3Inputs } from '@/engine/decide/v3';
import { checkArb, codeRank, inputsArb } from '@/engine/decide/v3/__tests__/invariants/arbitraries';
import { fcRuns } from '@/engine/decide/v3/__tests__/helpers/fcRuns';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { debtToV3Debt } from '../index';
import type { DebtSourceRow } from '../types';

function lowest(inputs: V3Inputs): number {
  const p = prepare(inputs);
  const r = p.readings[0] as (typeof p.readings)[number];
  const path = applyPurchaseFlows(r.open, r.funds.spending, []);
  return Math.min(...path.points.map((x) => x.balance));
}

const growRowArb = fc.record({
  n: fc.integer({ min: 0, max: 99 }),
  card: fc.boolean(),
  balance: fc.integer({ min: 0, max: 5_000_000 }),
  minimum: fc.integer({ min: 1, max: 200_000 }),
  apr: fc.constantFrom(null, '0', '5.5', '19.99', '24.9'),
  dueDay: fc.option(fc.integer({ min: 1, max: 31 }), { nil: null }),
  housing: fc.boolean(),
});

describe('criterion 8: Grow-written debts', () => {
  it('adding a debt never raises the lowest point and never makes the answer less strict', () => {
    fc.assert(
      fc.property(inputsArb, growRowArb, checkArb, (base, g, check) => {
        const row: DebtSourceRow = {
          id: `grow-debt-${g.n}`, kind: g.card ? 'card' : 'loan', account_id: null, check_id: null, balance: g.balance, apr: g.apr,
          minimum_payment: g.minimum, secured: false, is_housing: g.housing, due_day: g.dueDay, deleted_at: null,
        };
        const debt = debtToV3Debt(
          { id: row.id, balance: minorUnits(g.balance), minimumPayment: minorUnits(g.minimum), apr: g.apr === null ? null : percent(g.apr), secured: false },
          row,
          undefined,
          () => ''
        );
        const withDebt: V3Inputs = { ...base, debts: [...base.debts, debt] };
        expect(lowest(withDebt)).toBeLessThanOrEqual(lowest(base));
        const a = evaluate(base, check).result;
        const b = evaluate(withDebt, check).result;
        if (a.code !== 'needs_input' && b.code !== 'needs_input') expect(codeRank(b.code)).toBeLessThanOrEqual(codeRank(a.code));
      }),
      { numRuns: fcRuns(200), seed: 0x0605 }
    );
  });
});
