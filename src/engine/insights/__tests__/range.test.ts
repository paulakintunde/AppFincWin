/** 07-02 (INS-02, D-21, D-26a): range trimming and the In / Out / Left strip. */
import { minorUnits } from '../../money/types';
import type { MonthBar } from '../../month/types';
import { RANGE_MONTHS, barTotals, barsInRange, monthsInRange } from '../range';

const mu = minorUnits;
const bar = (month: string, comesIn: number, goesOut: number): MonthBar => ({ month, comesIn: mu(comesIn), goesOut: mu(goesOut), left: mu(comesIn - goesOut) });
const ym = (i: number): string => `2026-${String(i).padStart(2, '0')}`;
const run = (n: number): MonthBar[] => Array.from({ length: n }, (_, i) => bar(ym(i + 1), 100, 40));

describe('07-02 range', () => {
  it('names the full months before this one for each range', () => {
    expect(RANGE_MONTHS).toEqual({ '6m': 6, '1y': 12, all: null });
  });

  it('D-26a: 6m is 6 full months plus this month so far; 1y is 12 plus this month', () => {
    const bars = run(13);
    expect(barsInRange(bars, '6m').map((b) => b.month)).toEqual(bars.slice(-7).map((b) => b.month));
    expect(barsInRange(bars, '6m')).toHaveLength(7);
    expect(barsInRange(bars, '1y')).toHaveLength(13);
  });

  it('all gives every bar given', () => {
    const bars = run(9);
    expect(barsInRange(bars, 'all')).toEqual(bars);
  });

  it('a short history gives what there is', () => {
    expect(barsInRange(run(3), '6m')).toHaveLength(3);
  });

  it('drops leading empty months but keeps a middle empty month', () => {
    const bars = [bar('2026-01', 0, 0), bar('2026-02', 0, 5), bar('2026-03', 0, 0), bar('2026-04', 9, 0)];
    expect(barsInRange(bars, 'all').map((b) => b.month)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(barsInRange([bar('2026-01', 0, 0)], 'all')).toEqual([]);
    expect(barsInRange([], '6m')).toEqual([]);
  });

  it('monthsInRange lists the months of the trimmed bars', () => {
    expect(monthsInRange(run(10), '6m')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('barTotals sums in and out and left is the difference', () => {
    const t = barTotals([bar('2026-01', 100, 30), bar('2026-02', 50, 80)]);
    expect(t).toEqual({ comesIn: 150, goesOut: 110, left: 40 });
    expect(barTotals([])).toEqual({ comesIn: 0, goesOut: 0, left: 0 });
  });
});
