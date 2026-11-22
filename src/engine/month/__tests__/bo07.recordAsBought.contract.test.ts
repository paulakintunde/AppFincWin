// BO-07 record-as-bought contract. Owner: plan 05.5-13, switched on by 08.1-09 (ARC-24, D-09). The frozen list lives in
// src/test/contracts/contractManifest.test.ts; the exact titles are kept.
// Engine side: what the month does with an expected line, and a source scan of the one writer so this test imports no data code.
// The builder-side proof (the series and end-dates the writer really builds) is in src/data/mutations/__tests__/decideGoAhead.test.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { minorUnits } from '@/engine/money';
import type { V3Line, V3Series } from '@/engine/decide/v3';
import { expectedDueCounts } from '../model/expected';

const WRITER = readFileSync(join(process.cwd(), 'src', 'data', 'mutations', 'decideGoAhead.ts'), 'utf8');

const bill = (over: Partial<V3Series> & { id: string }): V3Series => ({
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
  ...over,
});

describe('BO-07: record as bought', () => {
  it('a cost that stops ends its Activity bill with end_reason stopped', () => {
    // One writer ends the bill, through the stop path's own fields: end_date the day before, end_reason 'stopped'.
    expect(WRITER).toContain("end_reason: 'stopped'");
    expect(WRITER).toContain('addDays(stop.stopDate, -1)');
    // The older second writer is gone.
    expect(() => readFileSync(join(process.cwd(), 'src', 'data', 'mutations', 'boughtWrite.ts'), 'utf8')).toThrow();
  });

  it('fixed running costs become Activity bills; varying costs become expected spending', () => {
    // Writer side: a line that varies is written as an 'expected' series; a fixed one carries no kind (read back as exact).
    expect(WRITER).toContain("line.varies === true ? { ...bill, amount_kind: 'expected' as const } : bill");
    // Engine side: an exact bill counts whole; an expected line counts max(0, expected - real spending in its category), once.
    const spent: V3Line = {
      id: 'l1', date: '2026-11-10', amount: minorUnits(-5000), role: 'spending', status: 'paid', seriesId: null,
      categoryId: 'cat-fuel', coversMonths: null, expected: false, incomeKind: null, countsAs: null,
    };
    const counts = expectedDueCounts({
      asOf: '2026-11-12',
      series: [bill({ id: 'insurance' }), bill({ id: 'fuel', amountKind: 'expected' })],
      lines: [spent],
    });
    expect(counts.has('insurance|2026-11-20')).toBe(false); // not in the map: counted whole
    expect(counts.get('fuel|2026-11-20')).toBe(7000n);
  });
});
