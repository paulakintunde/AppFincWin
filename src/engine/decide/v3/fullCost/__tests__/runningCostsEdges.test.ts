/**
 * 05.4-61 (D-177 a): running-cost edges: the cadences that count, the sort, the error text, a past start across a year end,
 * and the first day of the month an end date can fall on. Also the purchase-date helpers' messages.
 */
import { minorUnits as mu, type MinorUnits } from '../../../../money/types';
import type { RunningCostLine } from '../../types';
import { laterRoom } from '../purchaseDate';
import { countsAsRunning, monthlyShare, runningCostOutflows } from '../runningCosts';

const line = (over: Partial<RunningCostLine> = {}): RunningCostLine => ({ id: 'a', amount: mu(10_000), everyMonths: 1, start: '2026-12-10', end: null, on: true, ...over });

describe('05.4-61 countsAsRunning: the cadences', () => {
  it.each([
    [1, true],
    [3, true],
    [12, true],
    [2, false],
    [6, false],
  ])('every %i months counts: %s', (everyMonths, counts) => {
    expect(countsAsRunning(line({ everyMonths: everyMonths as 1 }))).toBe(counts);
  });
});

describe('05.4-61 runningCostOutflows', () => {
  it('days must be a positive integer, and 1 is allowed', () => {
    expect(() => runningCostOutflows([line()], '2026-11-15', 0)).toThrow('runningCosts: days must be a positive integer');
    expect(() => runningCostOutflows([line()], '2026-11-15', 1.5)).toThrow('runningCosts: days must be a positive integer');
    expect(runningCostOutflows([line({ start: '2026-11-15' })], '2026-11-15', 1)).toEqual([{ date: '2026-11-15', amount: 10_000 }]);
  });

  it('a line that started in an earlier year still falls on its dates (the skip-ahead never skips a due date)', () => {
    // started 10 December 2025, path from 1 February 2026: dues on 10 February and 10 March
    const out = runningCostOutflows([line({ start: '2025-12-10' })], '2026-02-01', 60);
    expect(out.map((f) => f.date)).toEqual(['2026-02-10', '2026-03-10']);
    // started 2024, yearly: the 2026 due is still found
    expect(runningCostOutflows([line({ start: '2024-03-05', everyMonths: 12 })], '2026-02-01', 90).map((f) => f.date)).toEqual(['2026-03-05']);
  });

  it('flows come back by date, whatever order the lines were given in', () => {
    const late = line({ id: 'b', start: '2026-12-20', amount: mu(1) });
    const early = line({ id: 'a', start: '2026-12-05', amount: mu(2) });
    expect(runningCostOutflows([late, early], '2026-11-15', 40)).toEqual([
      { date: '2026-12-05', amount: 2 },
      { date: '2026-12-20', amount: 1 },
    ]);
    expect(runningCostOutflows([early, late], '2026-11-15', 40)).toEqual([
      { date: '2026-12-05', amount: 2 },
      { date: '2026-12-20', amount: 1 },
    ]);
    const three = [line({ id: 'c', start: '2026-12-24', amount: mu(3) }), late, early];
    expect(runningCostOutflows(three, '2026-11-15', 40).map((f) => f.amount)).toEqual([2, 1, 3]);
  });

  it('on the same date, by id; an id tie keeps the order given', () => {
    const z = line({ id: 'z', amount: mu(100) });
    const a = line({ id: 'a', amount: mu(200) });
    expect(runningCostOutflows([z, a], '2026-11-15', 40).map((f) => f.amount)).toEqual([200, 100]);
    expect(runningCostOutflows([a, z], '2026-11-15', 40).map((f) => f.amount)).toEqual([200, 100]);
    const x1 = line({ id: 'x', amount: mu(100) });
    const x2 = line({ id: 'x', amount: mu(200) });
    expect(runningCostOutflows([x1, x2], '2026-11-15', 40).map((f) => f.amount)).toEqual([100, 200]);
    expect(runningCostOutflows([x2, x1], '2026-11-15', 40).map((f) => f.amount)).toEqual([200, 100]);
  });
});

describe('05.4-61 monthlyShare: an end date on the first of the month still counts that month', () => {
  it('ends 1 December: December has it, an end on 30 November does not', () => {
    expect(monthlyShare([line({ end: '2026-12-01' })], '2026-12')).toBe(10_000);
    expect(monthlyShare([line({ end: '2026-11-30' })], '2026-12')).toBe(0);
  });
});

describe('05.4-61 laterRoom error text', () => {
  it('an overflow names laterRoom', () => {
    expect(() => laterRoom(Number.MAX_SAFE_INTEGER as MinorUnits, '2026-01-15', '2026-06-15')).toThrow('laterRoom: result exceeds Number.MAX_SAFE_INTEGER');
  });
});
