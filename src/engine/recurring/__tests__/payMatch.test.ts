import {
  PAY_MATCH_AFTER_DAYS,
  PAY_MATCH_BEFORE_DAYS,
  matchPendingPayments,
  type PayMatchRow,
  type PendingOccurrence,
} from '../payMatch';

function pending(over: Partial<PendingOccurrence> & { id: string; localDate: string }): PendingOccurrence {
  return {
    version: 1,
    amount: -1099,
    currency: 'GBP',
    name: 'Netflix',
    accountId: 'acc-1',
    ...over,
  };
}

function importedRow(over: Partial<PayMatchRow> & { index: number; localDate: string }): PayMatchRow {
  return {
    amount: -1099,
    currency: 'GBP',
    name: 'NETFLIX.COM',
    ...over,
  };
}

describe('matchPendingPayments', () => {
  it('matches an imported row to a pending occurrence with the same amount, dated just after the due date', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04' })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'p1' }]);
  });

  it('matches within 10% of the planned amount', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04', amount: -1150 })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'p1' }]);
  });

  it('does not match beyond 10% of the planned amount', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04', amount: -1300 })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([]);
  });

  it('never matches a positive row against a negative pending occurrence', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04', amount: 1099 })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([]);
  });

  it('does not match a row dated more than PAY_MATCH_BEFORE_DAYS before the due date', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-08-29' })]; // 5 days before 09-03
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([]);
  });

  it('matches a row dated exactly PAY_MATCH_BEFORE_DAYS before the due date', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-08-31' })]; // 3 days before 09-03
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'p1' }]);
  });

  it('does not match a row dated more than PAY_MATCH_AFTER_DAYS after the due date', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-11' })]; // 8 days after 09-03
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([]);
  });

  it('matches a row dated exactly PAY_MATCH_AFTER_DAYS after the due date', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-10' })]; // 7 days after 09-03
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'p1' }]);
  });

  it('matches the closest due date only, one-to-one, among two pending occurrences', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04' })];
    const pendingRows = [
      pending({ id: 'p-aug', localDate: '2026-08-03' }),
      pending({ id: 'p-sep', localDate: '2026-09-03' }),
    ];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'p-sep' }]);
  });

  it('excludes rows already flagged as duplicates', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04' })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    const result = matchPendingPayments(rows, pendingRows, { excludeIndexes: new Set([0]) });
    expect(result).toEqual([]);
  });

  it('never matches a pending occurrence with a null name', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04' })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03', name: null })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([]);
  });

  it('never matches a dissimilar name even within the date and amount window', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04', name: 'SHELL PETROL' })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([]);
  });

  it('assigns two imported rows to two different pending occurrences one-to-one', () => {
    const rows = [
      importedRow({ index: 0, localDate: '2026-09-04', name: 'NETFLIX.COM' }),
      importedRow({ index: 1, localDate: '2026-09-05', name: 'NETFLIX.COM' }),
    ];
    const pendingRows = [
      pending({ id: 'p1', localDate: '2026-09-03' }),
      pending({ id: 'p2', localDate: '2026-09-04' }),
    ];
    const result = matchPendingPayments(rows, pendingRows);
    expect(result).toHaveLength(2);
    const pendingIds = new Set(result.map((r) => r.pendingId));
    expect(pendingIds).toEqual(new Set(['p1', 'p2']));
    const rowIndexes = new Set(result.map((r) => r.index));
    expect(rowIndexes).toEqual(new Set([0, 1]));
  });

  it('breaks a tie between two equally-good candidates for the same pending row by row index', () => {
    const rows = [
      importedRow({ index: 1, localDate: '2026-09-04' }),
      importedRow({ index: 0, localDate: '2026-09-04' }),
    ];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03' })];
    // Both rows tie on dayGap, amountDiff and pendingId, so the smaller row index wins
    // the single pending occurrence, one-to-one.
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'p1' }]);
  });

  it('prefers the pending occurrence with the smaller amount difference when day gaps tie', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04', amount: -1099 })];
    const pendingRows = [
      pending({ id: 'pHigh', localDate: '2026-09-03', amount: -1050 }), // amountDiff 49
      pending({ id: 'pExact', localDate: '2026-09-03', amount: -1099 }), // amountDiff 0
    ];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'pExact' }]);
  });

  it('breaks a tie between two equally-good pending occurrences by the smaller pending id', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04' })];
    const pendingRows = [
      pending({ id: 'pB', localDate: '2026-09-03' }),
      pending({ id: 'pA', localDate: '2026-09-03' }),
    ];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'pA' }]);
  });

  it('IN-04: never matches a line in a different currency from the pending occurrence', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04', currency: 'EUR' })];
    const pendingRows = [pending({ id: 'p1', localDate: '2026-09-03', currency: 'GBP' })];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([]);
  });

  it('IN-04: a currency mismatch skips only that candidate, so a same-currency one still matches', () => {
    const rows = [importedRow({ index: 0, localDate: '2026-09-04', currency: 'EUR' })];
    const pendingRows = [
      pending({ id: 'pA', localDate: '2026-09-04', currency: 'GBP' }),
      pending({ id: 'pB', localDate: '2026-09-03', currency: 'EUR' }),
    ];
    expect(matchPendingPayments(rows, pendingRows)).toEqual([{ index: 0, pendingId: 'pB' }]);
  });

  it('exposes the before/after window constants', () => {
    expect(PAY_MATCH_BEFORE_DAYS).toBe(3);
    expect(PAY_MATCH_AFTER_DAYS).toBe(7);
  });
});
