/**
 * 05.4-61 (D-177 a): planMonths multiplies the count by the cadence step (it never divides).
 */
import { planMonths } from '../caveats';
import type { Purchase } from '../types';

const plan = (count: number, every: number, unit: 'month' | 'week'): Purchase =>
  ({ schedule: { count, cadence: { every, unit } } }) as unknown as Purchase;

describe('05.4-61 planMonths', () => {
  it('no schedule is no plan length', () => {
    expect(planMonths({ schedule: null } as unknown as Purchase)).toBeNull();
  });

  it('monthly: count times every', () => {
    expect(planMonths(plan(12, 1, 'month'))).toBe(12);
    expect(planMonths(plan(12, 2, 'month'))).toBe(24);
    expect(planMonths(plan(3, 4, 'month'))).toBe(12);
  });

  it('weekly: count times every weeks, 84/365 of a month each, rounded up', () => {
    expect(planMonths(plan(52, 1, 'week'))).toBe(12); // 52 * 84 / 365 = 11.97
    expect(planMonths(plan(26, 2, 'week'))).toBe(12);
    expect(planMonths(plan(4, 2, 'week'))).toBe(2); // 8 * 84 / 365 = 1.84
    expect(planMonths(plan(10, 3, 'week'))).toBe(7); // 30 * 84 / 365 = 6.9
  });
});
