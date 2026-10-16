/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15. The prototype had no running-cost categories.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { lossOfValueMonthly, netRunningCosts } from '../../checkInputs';
import type { CostLine } from '../../types';

const m = minorUnits;
const line = (id: string, amount: number, over: Partial<CostLine> = {}): CostLine => ({
  id,
  amount: m(amount),
  counted: true,
  ...over,
});
const COSTS = [line('ins', 12_000), line('park', 8_000), line('fuel', 15_000, { counted: false })];
const BUS = [line('bus', 9_000)];

describe('D-55 loss of value is non-cash', () => {
  it('D-55: loss of value is reported as a non-cash figure and never enters the month test', () => {
    const r = netRunningCosts([...COSTS, line('lov', 25_000, { category: 'loss_of_value' })], BUS);
    // runningCostsNet is what BuyCheck carries into the month test.
    expect(r.net).toBe(11_000);
    expect(r.nonCash).toBe(25_000);
  });
});

describe('D-63 loss of value entry', () => {
  it('D-63: loss of value typed as a %/year of the advertised price becomes a monthly non-cash figure and never enters the month test', () => {
    const monthly = lossOfValueMonthly({ kind: 'percent_per_year', percentPerYear: percent('15') }, m(1_450_000));
    const r = netRunningCosts([...COSTS, line('lov', monthly, { category: 'loss_of_value' })], BUS);
    expect(r.net).toBe(11_000);
    expect(r.nonCash).toBe(18_125);
  });

  it('D-63: loss of value has no default', () => {
    // No input, no loss_of_value line: nothing is invented. lossOfValueMonthly always takes an explicit input.
    expect(netRunningCosts(COSTS, BUS).nonCash).toBe(0);
    expect(lossOfValueMonthly.length).toBe(2);
  });
});
