/** 10.1-09 (T-10.1-09-01): money is counted once. Adding parts to a line moves money between categories, never changes totals. */
import fc from 'fast-check';
import { monthOf, v3Line, v3Series } from '../../decide/v3/__tests__/helpers/fixtures';
import type { V3Line } from '../../decide/v3/types';
import { minorUnits } from '../../money/types';
import { spendByCategory } from '../../insights/categories';
import { everydayByMonth } from '../model/typical';
import { expectedDueCounts } from '../model/expected';

const CATS = ['a', 'b', 'c'];
type Row = { amount: number; cat: string | null; split: { a: number; b: number; ca: string | null; cb: string | null } | null };
const rowArb: fc.Arbitrary<Row> = fc.record({
  amount: fc.integer({ min: 1, max: 100_000 }),
  cat: fc.constantFrom<string | null>(...CATS, null),
  split: fc.option(
    fc.record({ a: fc.nat(100), b: fc.nat(100), ca: fc.constantFrom<string | null>(...CATS, null), cb: fc.constantFrom<string | null>(...CATS, null) }),
    { nil: null },
  ),
});

function partsOf(r: Row): { categoryId: string | null; amount: number }[] | null {
  if (r.split === null || r.amount < 3) return null;
  const pa = 1 + Math.floor((r.split.a * (r.amount - 2)) / 200);
  const pb = 1 + Math.floor((r.split.b * (r.amount - 1 - pa)) / 200);
  return [{ categoryId: r.split.ca, amount: pa }, { categoryId: r.split.cb, amount: pb }];
}

function build(rows: Row[], withParts: boolean): V3Line[] {
  return rows.map((r, i) => {
    const parts = withParts ? partsOf(r) : null;
    return v3Line({
      id: `l${i}`, date: '2026-10-05', amount: r.amount, role: 'spending', categoryId: r.cat,
      ...(parts === null ? {} : { parts: parts.map((p) => ({ categoryId: p.categoryId, amount: minorUnits(p.amount) })) }),
    });
  });
}

describe('10.1-09 cross-reader counted-once invariant', () => {
  it('totals do not change when parts are added; each reader counts the same lines', () => {
    fc.assert(
      fc.property(fc.array(rowArb, { minLength: 1, maxLength: 8 }), (rows) => {
        const plain = build(rows, false);
        const split = build(rows, true);
        const total = plain.reduce((s, l) => s + l.amount, 0);

        const sum = (mp: ReadonlyMap<string | null, bigint>) => [...mp.values()].reduce((s, v) => s + v, 0n);
        expect(sum(spendByCategory([monthOf('2026-10', split)], ['2026-10']))).toBe(BigInt(total));
        expect(sum(spendByCategory([monthOf('2026-10', plain)], ['2026-10']))).toBe(BigInt(total));

        // typical: the month total is the whole; the per-category list holds only categorised amounts (null category and the gap are not listed)
        const t = everydayByMonth([monthOf('2026-10', split)], [])[0]!;
        expect(t.everyday).toBe(total);
        const listed = [...t.byCategory.values()].reduce((s, v) => s + v, 0n);
        let expectedListed = 0n;
        rows.forEach((r) => {
          const parts = partsOf(r) ?? [{ categoryId: r.cat, amount: r.amount }];
          for (const p of parts) if (p.categoryId !== null) expectedListed += BigInt(p.amount);
        });
        expect(listed).toBe(expectedListed);
      }),
      { numRuns: 200 },
    );
  });

  it('expected-cost pool takes each part under its own category', () => {
    const series = [v3Series({ id: 's1', role: 'bill', cadence: { every: 1, unit: 'month' }, anchorDate: '2026-09-10', amount: 5000, categoryId: 'b', isHousing: false, amountKind: 'expected' })];
    const split = v3Line({ id: 'x', date: '2026-10-02', amount: 4000, role: 'spending', categoryId: 'a', parts: [{ categoryId: 'a', amount: minorUnits(1000) }, { categoryId: 'b', amount: minorUnits(3000) }] });
    const unsplit = v3Line({ id: 'x', date: '2026-10-02', amount: 4000, role: 'spending', categoryId: 'a' });
    const a = expectedDueCounts({ asOf: '2026-10-15', series, lines: [split] });
    const b = expectedDueCounts({ asOf: '2026-10-15', series, lines: [unsplit] });
    expect([...a.values()]).not.toEqual([...b.values()]);
  });
});
