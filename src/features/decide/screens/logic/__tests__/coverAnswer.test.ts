import { coverAnswerOf, type CoverAnswerRow } from '../coverAnswer';

const row = (o: Partial<CoverAnswerRow> = {}): CoverAnswerRow => ({ kind: 'volatile_cover', check_id: 'c1', bool_value: true, deleted_at: null, ...o });

describe('coverAnswerOf (05.5-29)', () => {
  it('a live saved row for this check wins over the check field', () => {
    expect(coverAnswerOf([row({ bool_value: false })], 'c1', { volatileCover: true })).toBe(false);
    expect(coverAnswerOf([row({ bool_value: true, deleted_at: undefined })], 'c1', { volatileCover: false })).toBe(true);
  });
  it('ignores another check, another kind, an empty value and a deleted row', () => {
    const rows = [row({ check_id: 'c2' }), row({ kind: 'pay_arrival' }), row({ bool_value: null }), row({ deleted_at: '2026-11-16T00:00:00Z' })];
    expect(coverAnswerOf(rows, 'c1', { volatileCover: false })).toBe(false);
  });
  it('falls back to the check field, then null', () => {
    expect(coverAnswerOf(undefined, 'c1', { volatileCover: true })).toBe(true);
    expect(coverAnswerOf([], 'c1', { volatileCover: null })).toBeNull();
    expect(coverAnswerOf([], 'c1', {})).toBeNull();
  });
});
