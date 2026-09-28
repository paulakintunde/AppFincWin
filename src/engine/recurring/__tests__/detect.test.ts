import {
  AMOUNT_TOLERANCE,
  INTERVAL_WINDOWS,
  MIN_ROWS,
  detectRecurring,
  type RecurringDetectRow,
} from '../detect';

function row(over: Partial<RecurringDetectRow> & { id: string; localDate: string }): RecurringDetectRow {
  return {
    name: 'NETFLIX.COM',
    amount: -1099,
    currency: 'GBP',
    ...over,
  };
}

describe('detectRecurring', () => {
  it('detects a monthly series across 4 rows, anchored on the latest date', () => {
    const rows = [
      row({ id: 'a', localDate: '2026-05-03' }),
      row({ id: 'b', localDate: '2026-06-03' }),
      row({ id: 'c', localDate: '2026-07-03' }),
      row({ id: 'd', localDate: '2026-08-04' }),
    ];
    const result = detectRecurring(rows);
    expect(result).toEqual([
      {
        key: expect.any(String),
        name: 'NETFLIX.COM',
        amount: -1099,
        currency: 'GBP',
        freq: 'monthly',
        anchorDate: '2026-08-04',
        rowIds: ['a', 'b', 'c', 'd'],
      },
    ]);
  });

  it('detects a weekly series across 4 rows 7 days apart', () => {
    const rows = [
      row({ id: 'a', name: 'GYM', amount: -3000, localDate: '2026-01-01' }),
      row({ id: 'b', name: 'GYM', amount: -3000, localDate: '2026-01-08' }),
      row({ id: 'c', name: 'GYM', amount: -3000, localDate: '2026-01-15' }),
      row({ id: 'd', name: 'GYM', amount: -3000, localDate: '2026-01-22' }),
    ];
    const result = detectRecurring(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.freq).toBe('weekly');
    expect(result[0]!.rowIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('detects a fortnightly series across 3 rows 14 days apart', () => {
    const rows = [
      row({ id: 'a', name: 'GYM', amount: -3000, localDate: '2026-01-01' }),
      row({ id: 'b', name: 'GYM', amount: -3000, localDate: '2026-01-15' }),
      row({ id: 'c', name: 'GYM', amount: -3000, localDate: '2026-01-29' }),
    ];
    const result = detectRecurring(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.freq).toBe('fortnightly');
  });

  it('detects a quarterly series across 2 rows in the quarterly window', () => {
    const rows = [
      row({ id: 'a', name: 'INSURANCE', amount: -5000, localDate: '2026-01-01' }),
      row({ id: 'b', name: 'INSURANCE', amount: -5000, localDate: '2026-04-01' }), // 90 days
    ];
    const result = detectRecurring(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.freq).toBe('quarterly');
  });

  it('detects a yearly series across exactly 2 rows 360-370 days apart', () => {
    const rows = [
      row({ id: 'a', name: 'DOMAIN RENEWAL', amount: -1200, localDate: '2025-09-01' }),
      row({ id: 'b', name: 'DOMAIN RENEWAL', amount: -1200, localDate: '2026-09-01' }), // 365 days
    ];
    const result = detectRecurring(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.freq).toBe('yearly');
  });

  it('does not suggest only 2 monthly rows (below MIN_ROWS.monthly)', () => {
    const rows = [
      row({ id: 'a', localDate: '2026-05-03' }),
      row({ id: 'b', localDate: '2026-06-03' }),
    ];
    expect(detectRecurring(rows)).toEqual([]);
  });

  it('suggests when amounts are within 10% of the median', () => {
    const rows = [
      row({ id: 'a', name: 'ELECTRIC CO', amount: -1000, localDate: '2026-01-03' }),
      row({ id: 'b', name: 'ELECTRIC CO', amount: -1050, localDate: '2026-02-03' }),
      row({ id: 'c', name: 'ELECTRIC CO', amount: -980, localDate: '2026-03-03' }),
    ];
    const result = detectRecurring(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(-1000);
  });

  it('does not suggest when one amount is far from the median', () => {
    const rows = [
      row({ id: 'a', name: 'ELECTRIC CO', amount: -1000, localDate: '2026-01-03' }),
      row({ id: 'b', name: 'ELECTRIC CO', amount: -2000, localDate: '2026-02-03' }),
      row({ id: 'c', name: 'ELECTRIC CO', amount: -1000, localDate: '2026-03-03' }),
    ];
    expect(detectRecurring(rows)).toEqual([]);
  });

  it('does not suggest when the gaps do not fit any single frequency window', () => {
    const rows = [
      row({ id: 'a', name: 'RANDOM CO', localDate: '2026-01-01' }),
      row({ id: 'b', name: 'RANDOM CO', localDate: '2026-01-10' }), // 9 days: fits no window
      row({ id: 'c', name: 'RANDOM CO', localDate: '2026-01-20' }),
    ];
    expect(detectRecurring(rows)).toEqual([]);
  });

  it('never groups two rows under the same name but different currencies together', () => {
    const rows = [
      row({ id: 'a', name: 'FX SUB', currency: 'GBP', localDate: '2026-01-01' }),
      row({ id: 'b', name: 'FX SUB', currency: 'GBP', localDate: '2026-02-01' }),
      row({ id: 'c', name: 'FX SUB', currency: 'USD', localDate: '2026-01-01' }),
      row({ id: 'd', name: 'FX SUB', currency: 'USD', localDate: '2026-02-01' }),
    ];
    // Each currency group only has 2 rows -- below MIN_ROWS.monthly (3) -- so neither
    // combines with the other to reach a suggestion, proving they are grouped separately.
    expect(detectRecurring(rows)).toEqual([]);
  });

  it('never groups two rows under the same name but opposite signs together', () => {
    const rows = [
      row({ id: 'a', localDate: '2026-05-03' }),
      row({ id: 'b', localDate: '2026-06-03' }),
      row({ id: 'c', localDate: '2026-07-03' }),
      row({ id: 'd', localDate: '2026-08-04' }),
      row({ id: 'refund', amount: 1099, localDate: '2026-06-20' }),
    ];
    const result = detectRecurring(rows);
    expect(result).toHaveLength(1);
    expect(result[0]!.rowIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores rows flagged isTransfer (D-56)', () => {
    const rows = [
      row({ id: 'a', localDate: '2026-05-03' }),
      row({ id: 'b', localDate: '2026-06-03' }),
      row({ id: 'c', localDate: '2026-07-03', isTransfer: true }),
      row({ id: 'd', localDate: '2026-08-04' }),
    ];
    // Removing row c breaks the monthly gap chain (May->Jun is fine, but Jun->Aug is ~62
    // days, which fits no window), so the series collapses to no suggestion once c is
    // correctly excluded.
    expect(detectRecurring(rows)).toEqual([]);
  });

  it('ignores a single row under a name (no gap to measure)', () => {
    const rows = [row({ id: 'a', name: 'ONE OFF', localDate: '2026-05-03' })];
    expect(detectRecurring(rows)).toEqual([]);
  });

  it('sorts multiple suggestions by rowIds.length desc, then name', () => {
    const rows = [
      // 4-row monthly group, name 'B SUB'
      row({ id: 'b1', name: 'B SUB', localDate: '2026-05-03' }),
      row({ id: 'b2', name: 'B SUB', localDate: '2026-06-03' }),
      row({ id: 'b3', name: 'B SUB', localDate: '2026-07-03' }),
      row({ id: 'b4', name: 'B SUB', localDate: '2026-08-04' }),
      // 3-row monthly group, name 'A SUB'
      row({ id: 'a1', name: 'A SUB', localDate: '2026-05-03' }),
      row({ id: 'a2', name: 'A SUB', localDate: '2026-06-03' }),
      row({ id: 'a3', name: 'A SUB', localDate: '2026-07-03' }),
      // another 3-row monthly group, name 'Z SUB'
      row({ id: 'z1', name: 'Z SUB', localDate: '2026-05-03' }),
      row({ id: 'z2', name: 'Z SUB', localDate: '2026-06-03' }),
      row({ id: 'z3', name: 'Z SUB', localDate: '2026-07-03' }),
    ];
    const result = detectRecurring(rows);
    expect(result.map((r) => r.name)).toEqual(['B SUB', 'A SUB', 'Z SUB']);
  });

  it('exposes the tolerance, window and min-rows constants', () => {
    expect(AMOUNT_TOLERANCE).toBe(0.1);
    expect(INTERVAL_WINDOWS.weekly).toEqual([6, 8]);
    expect(INTERVAL_WINDOWS.fortnightly).toEqual([12, 16]);
    expect(INTERVAL_WINDOWS.monthly).toEqual([27, 33]);
    expect(INTERVAL_WINDOWS.quarterly).toEqual([85, 97]);
    expect(INTERVAL_WINDOWS.yearly).toEqual([360, 370]);
    expect(MIN_ROWS).toEqual({ weekly: 3, fortnightly: 3, monthly: 3, quarterly: 2, yearly: 2 });
  });
});
