/** 05.4 ENG-14 (QE-07): the records-synced freshness rule, every branch. */
import { RECORDS_FRESH_FIRST_DAYS, RECORDS_FRESH_SYNC_DAYS } from '../../constants';
import { addDays } from '../../dates';
import { monthOf, v3Line } from '../../__tests__/helpers/fixtures';
import type { V3Month } from '../../types';
import { recordsSynced } from '../freshness';

const ASOF = '2026-12-01';
const NOV: V3Month = monthOf('2026-11', [v3Line({ id: 'n', date: '2026-11-28', amount: 100 })]);
const run = (over: { asOf?: string; months?: readonly V3Month[]; recordsAsOf?: string | null }) =>
  recordsSynced({ asOf: over.asOf ?? ASOF, months: over.months ?? [NOV], recordsAsOf: 'recordsAsOf' in over ? over.recordsAsOf : '2026-11-29' });

describe('recordsSynced (ENG-14)', () => {
  it('QE-07: 1st of the month, no records yet, November full, synced 2 days ago', () => {
    expect(run({})).toBe(true);
    // an empty current month counts as no records too
    expect(run({ months: [NOV, monthOf('2026-12', [], { full: false })] })).toBe(true);
  });

  it('constants are the QE-07 statement', () => {
    expect(RECORDS_FRESH_FIRST_DAYS).toBe(7);
    expect(RECORDS_FRESH_SYNC_DAYS).toBe(3);
  });

  it('no records date, a date that is not a date, or a date after asOf: the rule does not apply', () => {
    expect(recordsSynced({ asOf: ASOF, months: [NOV] })).toBe(false);
    expect(run({ recordsAsOf: null })).toBe(false);
    expect(run({ recordsAsOf: 'yesterday' })).toBe(false);
    expect(run({ recordsAsOf: '2026-12-02' })).toBe(false);
    expect(run({ recordsAsOf: ASOF })).toBe(true);
  });

  it('only the first 7 days of a month', () => {
    expect(run({ asOf: '2026-12-07', recordsAsOf: '2026-12-05' })).toBe(true);
    expect(run({ asOf: '2026-12-08', recordsAsOf: '2026-12-07' })).toBe(false);
  });

  it('synced at most 3 days before asOf', () => {
    expect(run({ recordsAsOf: addDays(ASOF, -RECORDS_FRESH_SYNC_DAYS) })).toBe(true);
    expect(run({ recordsAsOf: addDays(ASOF, -(RECORDS_FRESH_SYNC_DAYS + 1)) })).toBe(false);
  });

  it('a paid line in the new month means it has records: the usual rules apply', () => {
    const dec = monthOf('2026-12', [v3Line({ id: 'd', date: ASOF, amount: 100 })], { full: false });
    expect(run({ months: [NOV, dec] })).toBe(false);
    // Expected (pending) rows of recurring bills and pay are not records (D-45)
    const expected = monthOf('2026-12', [v3Line({ id: 'x', date: ASOF, amount: 120_000, seriesId: 'bills', status: 'pending' })], { full: false });
    expect(run({ months: [NOV, expected] })).toBe(true);
  });

  it('last month must be there and full', () => {
    expect(run({ months: [] })).toBe(false);
    expect(run({ months: [{ ...NOV, full: false }] })).toBe(false);
    expect(run({ months: [{ ...NOV, month: '2026-10' }] })).toBe(false);
  });
});
