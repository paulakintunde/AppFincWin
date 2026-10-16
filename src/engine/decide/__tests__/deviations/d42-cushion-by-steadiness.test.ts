/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-42 and its consistency amendment).
 */
import { minorUnits } from '../../../money/types';
import { defaultReserve } from '../../reserve';

const costs = minorUnits(410_000);

it('D-42: the default cushion grows with unsteady income — 3, 4.5 and 6 months of costs', () => {
  // The prototype used a fixed 6000 (dlim.reserve); D-01 made it 3 months; D-42 scales it by steadiness.
  expect(defaultReserve(costs, 'steady')).toBe(1_230_000);
  expect(defaultReserve(costs, 'variable')).toBe(1_845_000);
  expect(defaultReserve(costs, 'volatile')).toBe(2_460_000);
});

it('D-42 amended: under 3 full months the cushion is 3 months, not 6', () => {
  // The worst-income / highest-spending basis and the rough confidence already carry the caution, and the first
  // read's 3-month cushion must not jump when a second month is logged.
  expect(defaultReserve(costs, 'insufficient')).toBe(1_230_000);
});

it('D-42: 4.5 months is exact in minor units with one half-up rounding', () => {
  expect(defaultReserve(minorUnits(410_001), 'variable')).toBe(1_845_005);
});
