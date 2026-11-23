/** 07-02 (INS-05, D-13): a month against the month before it. */
import { minorUnits } from '../../money/types';
import type { MonthBar } from '../../month/types';
import type { LineRole } from '../../decide/v3/types';
import { monthOf, v3Line } from '../../decide/v3/__tests__/helpers/fixtures';
import { compareMonths } from '../compare';

let n = 0;
const sp = (month: string, amount: number, categoryId: string | null, role: LineRole = 'spending') =>
  v3Line({ id: `c${(n += 1)}`, date: `${month}-05`, amount, role, categoryId });
const bar = (month: string, comesIn: number, goesOut: number): MonthBar => ({ month, comesIn: minorUnits(comesIn), goesOut: minorUnits(goesOut), left: minorUnits(comesIn - goesOut) });

describe('07-02 compareMonths', () => {
  const months = [
    monthOf('2026-09', [sp('2026-09', 1_000, 'rent'), sp('2026-09', 500, 'food'), sp('2026-09', 300, 'gone'), sp('2026-09', 200, 'same'), sp('2026-09', 100, null), sp('2026-09', 50, 'zero'), sp('2026-09', 50, 'zero', 'refund')]),
    monthOf('2026-10', [sp('2026-10', 1_000, 'rent'), sp('2026-10', 900, 'food'), sp('2026-10', 700, 'fresh'), sp('2026-10', 200, 'same'), sp('2026-10', 100, 'a'), sp('2026-10', 100, null), sp('2026-10', 100, 'less')]),
  ];
  const bars = [bar('2026-09', 5_000, 2_150), bar('2026-10', 6_000, 3_000)];

  it('lists each category change with its kind, biggest change first, ties by id, null last', () => {
    const c = compareMonths(months, bars, '2026-10');
    expect(c.previous).toBe('2026-09');
    expect(c.changes.map((x) => [x.categoryId, x.change, x.kind])).toEqual([
      ['fresh', 700, 'new'],
      ['food', 400, 'more'],
      ['gone', -300, 'none'],
      ['a', 100, 'new'],
      ['less', 100, 'new'],
      ['rent', 0, 'same'],
      ['same', 0, 'same'],
      [null, 0, 'same'],
    ]);
  });

  it('marks a smaller spend as less and an uncategorised change last among equals', () => {
    const ms = [monthOf('2026-09', [sp('2026-09', 500, 'x'), sp('2026-09', 100, null)]), monthOf('2026-10', [sp('2026-10', 400, 'x'), sp('2026-10', 200, null)])];
    const c = compareMonths(ms, [], '2026-10');
    expect(c.changes.map((x) => [x.categoryId, x.thisMonth, x.lastMonth, x.change, x.kind])).toEqual([
      ['x', 400, 500, -100, 'less'],
      [null, 200, 100, 100, 'more'],
    ]);
  });

  it('gives the bars and the signed totals change when both bars exist', () => {
    const c = compareMonths(months, bars, '2026-10');
    expect(c.bar).toBe(bars[1]);
    expect(c.previousBar).toBe(bars[0]);
    expect(c.totalsChange).toEqual({ comesIn: 1_000, goesOut: 850, left: 150 });
    expect(c.previousRecorded).toBe(true);
  });

  it('has null totals when either bar is missing', () => {
    expect(compareMonths(months, [bars[1] as MonthBar], '2026-10').totalsChange).toBeNull();
    expect(compareMonths(months, [bars[0] as MonthBar], '2026-10').totalsChange).toBeNull();
  });

  it('previousRecorded is false when the earlier month is missing or has no lines', () => {
    expect(compareMonths([months[1] as (typeof months)[number]], bars, '2026-10').previousRecorded).toBe(false);
    expect(compareMonths([monthOf('2026-09', []), months[1] as (typeof months)[number]], bars, '2026-10').previousRecorded).toBe(false);
  });

  it('reads January against the December before it', () => {
    expect(compareMonths([], [], '2027-01').previous).toBe('2026-12');
  });
});
