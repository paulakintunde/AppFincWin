/**
 * E7 properties (D-102): the total never undercuts the share of the price less the resale, grows with the horizon when
 * running costs are positive, and never throws for in-range inputs.
 */
import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { assess } from '../assess';
import { myPart } from '../share';
import { totalCost } from '../ownership';
import type { Assessment } from '../types';
import { buyCash, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

describe('D-102 total cost properties', () => {
  it('D-102 total >= my part of the price - resale, and the running part grows with the horizon', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        fc.integer({ min: 0, max: 20_000 }),
        fc.integer({ min: 1, max: 300 }),
        (price, running, loss, months) => {
          const check = buyCash(price, { runningCostsNet: mu(running) });
          const a = assess(snapshotOf(), check) as Assessment;
          const input = { advertised: mu(price), lossMonthly: mu(loss) };
          const r = totalCost(check, a, { ...input, horizonMonths: months })!;
          expect(r).not.toBeNull();
          expect(r.total).toBeGreaterThanOrEqual(myPart(a.plan.price, a.context.purchaseShare) - r.resale);
          expect(r.resale).toBeGreaterThanOrEqual(0);
          const longer = totalCost(check, a, { ...input, horizonMonths: months + 1 })!;
          expect(longer.running).toBeGreaterThan(r.running);
          expect(longer.resale).toBeLessThanOrEqual(r.resale);
        }
      ),
      { numRuns: 150 }
    );
  });
});
