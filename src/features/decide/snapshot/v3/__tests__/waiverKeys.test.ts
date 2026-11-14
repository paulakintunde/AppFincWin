import type { ReadinessWaiver } from '@/engine/decide/v3';
import { waiverAnswerKey, waiverOfAnswer } from '../waiverKeys';

const U = '3f0c2a9e-1b4d-4c5e-8f60-1234567890ab';
const AT = '2026-11-12';

// Copied literally from supabase/migrations/20261030000200_decide_answers_readiness_waiver.sql (Postgres \d = [0-9]).
const DB_KEY =
  /^(paid-by-other|didnt-happen|no-pay):[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$|^always-other:[0-9a-f-]{36}$|^income-elsewhere$|^(nothing-to-add|month-complete|start-from):\d{4}-\d{2}$/;

const ALL: readonly ReadinessWaiver[] = [
  { kind: 'paid_by_other', seriesId: U, date: '2026-10-03' },
  { kind: 'didnt_happen', seriesId: U, date: '2026-10-03' },
  { kind: 'no_pay', seriesId: U, date: '2026-10-03' },
  { kind: 'always_other', seriesId: U },
  { kind: 'income_elsewhere' },
  { kind: 'nothing_to_add', month: '2026-10', at: AT },
  { kind: 'month_complete', month: '2026-10', at: AT },
  { kind: 'start_from', month: '2026-11' },
];

describe('waiverAnswerKey', () => {
  it('builds every key format', () => {
    expect(ALL.map(waiverAnswerKey)).toEqual([
      `paid-by-other:${U}:2026-10-03`,
      `didnt-happen:${U}:2026-10-03`,
      `no-pay:${U}:2026-10-03`,
      `always-other:${U}`,
      'income-elsewhere',
      'nothing-to-add:2026-10',
      'month-complete:2026-10',
      'start-from:2026-11',
    ]);
  });

  it('every built key passes the database key check', () => {
    for (const w of ALL) expect(DB_KEY.test(waiverAnswerKey(w))).toBe(true);
  });

  it('a bad id, date or month throws RangeError', () => {
    expect(() => waiverAnswerKey({ kind: 'paid_by_other', seriesId: 'nope', date: '2026-10-03' })).toThrow(RangeError);
    expect(() => waiverAnswerKey({ kind: 'paid_by_other', seriesId: U, date: '2026-10-3' })).toThrow('date must be YYYY-MM-DD');
    expect(() => waiverAnswerKey({ kind: 'always_other', seriesId: 'x' })).toThrow('expected a 36 character id');
    expect(() => waiverAnswerKey({ kind: 'start_from', month: '2026-1' })).toThrow('month must be YYYY-MM');
  });
});

describe('waiverOfAnswer', () => {
  it('round trips every kind (at comes from on_date)', () => {
    for (const w of ALL) {
      expect(waiverOfAnswer({ kind: 'readiness_waiver', key: waiverAnswerKey(w), on_date: AT })).toEqual(w);
    }
  });

  it('reads nothing_to_add and month_complete at from on_date; other kinds ignore it', () => {
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'nothing-to-add:2026-10', on_date: '2026-11-12' })).toEqual({
      kind: 'nothing_to_add',
      month: '2026-10',
      at: '2026-11-12',
    });
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'month-complete:2026-10', on_date: '2026-11-01' })).toEqual({
      kind: 'month_complete',
      month: '2026-10',
      at: '2026-11-01',
    });
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'start-from:2026-11', on_date: null })).toEqual({ kind: 'start_from', month: '2026-11' });
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'income-elsewhere', on_date: null })).toEqual({ kind: 'income_elsewhere' });
  });

  it('returns null for other kinds, unknown prefixes and malformed keys', () => {
    expect(waiverOfAnswer({ kind: 'pay_arrival', key: `${U}:2026-10-03`, on_date: AT })).toBeNull();
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: `paid-by-someone:${U}:2026-10-03`, on_date: AT })).toBeNull();
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: `paid-by-other:${U}`, on_date: AT })).toBeNull();
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'always-other:short', on_date: AT })).toBeNull();
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'income-elsewhere:x', on_date: AT })).toBeNull();
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'start-from:2026-1', on_date: AT })).toBeNull();
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: '', on_date: AT })).toBeNull();
  });

  it('a dated monthly answer with no usable on_date is skipped', () => {
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'nothing-to-add:2026-10', on_date: null })).toBeNull();
    expect(waiverOfAnswer({ kind: 'readiness_waiver', key: 'month-complete:2026-10', on_date: '2026-11' })).toBeNull();
  });
});
