import * as fc from 'fast-check';
import { addDays, addMonthsClamped } from '../../dates';
import { detectCandidates, twoDateClusters, type DetectContext, type DetectRow } from '../recurring';

const EMPTY: DetectContext = { dismissedKeys: new Set(), linkedRowIds: new Set() };

let n = 0;
function row(date: string, amount = -1500, over: Partial<DetectRow> = {}): DetectRow {
  n += 1;
  return { id: `r${n}`, name: 'Acme', amount, currency: 'USD', date, isTransfer: false, accountId: 'a1', ...over };
}

function everyDays(start: string, gap: number, count: number, amount = -1500): DetectRow[] {
  return Array.from({ length: count }, (_, i) => row(addDays(start, gap * i), amount));
}

describe('detectCandidates', () => {
  it.each([
    [7, 3, { unit: 'week', every: 1 }],
    [14, 3, { unit: 'week', every: 2 }],
    [30, 3, { unit: 'month', every: 1 }],
    [91, 2, { unit: 'month', every: 3 }],
    [365, 2, { unit: 'month', every: 12 }],
  ])('D-02 every cadence: %i-day gaps with %i rows', (gap, count, cadence) => {
    const out = detectCandidates(everyDays('2025-01-03', gap, count), EMPTY);
    expect(out).toHaveLength(1);
    expect(out[0]?.cadence).toEqual(cadence);
    expect(out[0]?.payGroupKey).toBeNull();
    expect(out[0]?.direction).toBe('out');
    expect(out[0]?.amount).toBe(1500);
  });

  it('D-02 too few repeats: 2 weekly rows are not offered, 2 quarterly are', () => {
    expect(detectCandidates(everyDays('2025-01-03', 7, 2), EMPTY)).toEqual([]);
    expect(detectCandidates(everyDays('2025-01-03', 91, 2), EMPTY)).toHaveLength(1);
  });

  it('SC-1 1st/15th is two monthly series', () => {
    const rows: DetectRow[] = [];
    for (let i = 0; i < 6; i += 1) {
      rows.push(row(addMonthsClamped('2026-01-01', i), 300000, { name: 'Payroll' }));
      rows.push(row(addMonthsClamped('2026-01-15', i), 300000, { name: 'Payroll' }));
    }
    const out = detectCandidates(rows, EMPTY);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.cadence.unit === 'month' && c.cadence.every === 1)).toBe(true);
    expect(out.some((c) => c.cadence.unit === 'week')).toBe(false);
    expect(out[0]?.payGroupKey).not.toBeNull();
    expect(out[0]?.payGroupKey).toBe(out[1]?.payGroupKey);
    expect(out.every((c) => c.direction === 'in')).toBe(true);
    const perYear = out.reduce((s, c) => s + (c.cadence.unit === 'month' ? 12 / c.cadence.every : 0), 0);
    expect(perYear).toBe(24);
  });

  it('SC-1 1st/15th tolerates a payday landing on the 30th for the 1st', () => {
    const dates = ['2026-01-02', '2026-01-15', '2026-01-30', '2026-02-13', '2026-03-02', '2026-03-16', '2026-04-01', '2026-04-15'];
    const out = detectCandidates(dates.map((d) => row(d, 100000, { name: 'Pay' })), EMPTY);
    // 30 Jan is within 3 days of month-end so it sits with the 1st; the gaps then fail monthly, so no false pair.
    expect(out.every((c) => c.payGroupKey === null || c.cadence.every === 1)).toBe(true);
  });

  it('SC-1 true fortnightly stays fortnightly', () => {
    const out = detectCandidates(everyDays('2026-01-02', 14, 12, 200000), EMPTY);
    expect(out).toHaveLength(1);
    expect(out[0]?.cadence).toEqual({ unit: 'week', every: 2 });
    expect(out[0]?.payGroupKey).toBeNull();
  });

  it('D-02 amount tolerance: 11% off breaks the group, 10% does not', () => {
    const mk = (third: number): DetectRow[] => [
      row('2025-01-05', -10000),
      row('2025-02-04', -10000),
      row('2025-03-06', third),
    ];
    expect(detectCandidates(mk(-11000), EMPTY)).toHaveLength(1);
    expect(detectCandidates(mk(-11100), EMPTY)).toEqual([]);
  });

  it('D-21 dismissed never offered; linked rows removed', () => {
    const rows = everyDays('2025-01-03', 30, 4);
    const [first] = detectCandidates(rows, EMPTY);
    expect(first).toBeDefined();
    expect(detectCandidates(rows, { dismissedKeys: new Set([first!.key]), linkedRowIds: new Set() })).toEqual([]);
    expect(detectCandidates(rows, { dismissedKeys: new Set(), linkedRowIds: new Set([rows[1]!.id]) })).toEqual([]);
  });

  it('transfers never offered', () => {
    const rows = everyDays('2025-01-03', 30, 4).map((r) => ({ ...r, isTransfer: true }));
    expect(detectCandidates(rows, EMPTY)).toEqual([]);
  });

  it('I16 deterministic under shuffling', () => {
    const rows: DetectRow[] = [
      ...everyDays('2025-01-03', 7, 6),
      ...everyDays('2025-01-10', 30, 4, -4000).map((r) => ({ ...r, name: 'Rent' })),
      ...[0, 1, 2, 3].flatMap((i) => [
        row(addMonthsClamped('2025-01-01', i), 90000, { name: 'Pay' }),
        row(addMonthsClamped('2025-01-15', i), 90000, { name: 'Pay' }),
      ]),
    ];
    const expected = detectCandidates(rows, EMPTY);
    fc.assert(
      fc.property(fc.shuffledSubarray(rows, { minLength: rows.length, maxLength: rows.length }), (shuffled) => {
        expect(detectCandidates(shuffled, EMPTY)).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });
});

describe('twoDateClusters', () => {
  it('splits 1st and 15th', () => {
    const dates = ['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15'];
    const c = twoDateClusters(dates);
    expect(c?.days).toEqual([1, 15]);
    expect(c?.members[0]).toHaveLength(3);
  });

  it('returns null for a single day', () => {
    expect(twoDateClusters(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'])).toBeNull();
  });

  it('returns null when the centres are under 10 days apart', () => {
    expect(twoDateClusters(['2026-01-01', '2026-01-07', '2026-02-01', '2026-02-07', '2026-03-01', '2026-03-07'])).toBeNull();
  });
});
