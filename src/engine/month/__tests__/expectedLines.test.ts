// 08.1-09 (D-09, T-08.1-21): an expected line (a varying running cost such as fuel) counts max(0, expected - real spending in its
// category this month), never both in full. Fast-check pins the bounds.
import { assert, bigInt, integer, property } from 'fast-check';
import { expectedCount, expectedDueCounts } from '../model/expected';
import type { V3Line, V3Series } from '../../decide/v3/types';
import { minorUnits } from '../../money/types';

const series = (over: Partial<V3Series> = {}): V3Series => ({
  id: 's1',
  role: 'bill',
  cadence: { unit: 'month', every: 1 },
  anchorDate: '2026-11-20',
  endDate: null,
  amount: minorUnits(12000),
  status: 'live',
  confirmed: true,
  payGroup: null,
  countsAs: null,
  incomeKind: null,
  typicalChoice: null,
  categoryId: 'cat-fuel',
  isHousing: false,
  savingMode: null,
  amountKind: 'expected',
  ...over,
});

const line = (id: string, amount: number, over: Partial<V3Line> = {}): V3Line => ({
  id,
  date: '2026-11-10',
  amount: minorUnits(-amount),
  role: 'spending',
  status: 'paid',
  seriesId: null,
  categoryId: 'cat-fuel',
  coversMonths: null,
  expected: false,
  incomeKind: null,
  countsAs: null,
  ...over,
});

describe('expectedCount', () => {
  it('is expected minus spending, never below 0', () => {
    expect(expectedCount(12000n, 0n)).toBe(12000n);
    expect(expectedCount(12000n, 5000n)).toBe(7000n);
    expect(expectedCount(12000n, 12000n)).toBe(0n);
    expect(expectedCount(12000n, 30000n)).toBe(0n);
  });

  it('never counts more than max(expected, actual); real spending at or above expected removes it', () => {
    assert(
      property(bigInt({ min: 0n, max: 10n ** 12n }), bigInt({ min: 0n, max: 10n ** 12n }), (e, a) => {
        const c = expectedCount(e, a);
        expect(c >= 0n).toBe(true);
        expect(c <= (e > a ? e : a)).toBe(true);
        expect(c + a >= e).toBe(true); // together they cover the expected figure, so the month never under-counts it
        if (a >= e) expect(c).toBe(0n);
        else expect(c).toBe(e - a);
      })
    );
  });
});

describe('expectedDueCounts', () => {
  const asOf = '2026-11-12';
  const base = { asOf, series: [series()], lines: [] as readonly V3Line[] };

  it('counts the whole expected amount when nothing is logged in its category', () => {
    expect(expectedDueCounts(base).get('s1|2026-11-20')).toBe(12000n);
  });

  it('takes real spending in the same category off the expected amount', () => {
    const m = expectedDueCounts({ ...base, lines: [line('l1', 5000), line('l2', 2000)] });
    expect(m.get('s1|2026-11-20')).toBe(5000n);
  });

  it('counts nothing once real spending reaches the expected amount', () => {
    expect(expectedDueCounts({ ...base, lines: [line('l1', 15000)] }).get('s1|2026-11-20')).toBe(0n);
  });

  it('ignores spending in another category, other months, pending lines and lines with no category', () => {
    const lines = [
      line('a', 4000, { categoryId: 'cat-food' }),
      line('b', 4000, { date: '2026-10-30' }),
      line('c', 4000, { status: 'pending' }),
      line('d', 4000, { categoryId: null }),
    ];
    expect(expectedDueCounts({ ...base, lines }).get('s1|2026-11-20')).toBe(12000n);
  });

  it('leaves an exact series, a series with no category and other months out of the map', () => {
    const m = expectedDueCounts({
      asOf,
      lines: [],
      series: [series({ id: 'x', amountKind: 'exact' }), series({ id: 'y', categoryId: null }), series({ id: 'z', anchorDate: '2026-12-20' })],
    });
    expect(m.size).toBe(0);
  });

  it('shares one category pool between two expected series, earlier due date first, so spending is never used twice', () => {
    const m = expectedDueCounts({
      asOf,
      series: [series({ id: 'a', anchorDate: '2026-11-14', amount: minorUnits(6000) }), series({ id: 'b', anchorDate: '2026-11-25', amount: minorUnits(6000) })],
      lines: [line('l1', 9000)],
    });
    expect(m.get('a|2026-11-14')).toBe(0n);
    expect(m.get('b|2026-11-25')).toBe(3000n);
  });

  it('property: the counted amounts add up to the expected total less what spending covered, between max(0, total - spent) and total', () => {
    assert(
      property(integer({ min: 1, max: 1_000_000 }), integer({ min: 1, max: 1_000_000 }), integer({ min: 0, max: 3_000_000 }), (e1, e2, spent) => {
        const m = expectedDueCounts({
          asOf,
          series: [series({ id: 'a', anchorDate: '2026-11-14', amount: minorUnits(e1) }), series({ id: 'b', anchorDate: '2026-11-25', amount: minorUnits(e2) })],
          lines: spent === 0 ? [] : [line('l', spent)],
        });
        const counted = [...m.values()].reduce((s, v) => s + v, 0n);
        const total = BigInt(e1 + e2);
        const floor = total > BigInt(spent) ? total - BigInt(spent) : 0n;
        expect(counted).toBe(floor);
        expect(counted <= (total > BigInt(spent) ? total : BigInt(spent))).toBe(true);
      })
    );
  });
});
