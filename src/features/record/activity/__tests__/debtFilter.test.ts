// 06-37 (D-38): the pure debt filter behind "See all in Activity".
import { debtFilterOf, debtParamOf, matchesDebt } from '../debtFilter';

const ID = '0b0e8d1a-6c4f-4a52-9b3e-1f2a3b4c5d6e';
const debt = { id: ID, name: 'Auto loan', series_id: 's-pay', extra_series_id: 's-extra', deleted_at: null };

describe('debtParamOf', () => {
  it('takes one uuid and nothing else', () => {
    expect(debtParamOf(ID)).toBe(ID);
    expect(debtParamOf([ID, 'x'])).toBe(ID);
    expect(debtParamOf(undefined)).toBeNull();
    expect(debtParamOf(null)).toBeNull();
    expect(debtParamOf('')).toBeNull();
    expect(debtParamOf('auto')).toBeNull();
    expect(debtParamOf(`${ID},debt_id.neq.x`)).toBeNull();
  });
});

describe('debtFilterOf', () => {
  it('no id, no filter', () => {
    expect(debtFilterOf(null, [debt])).toBeNull();
  });
  it('a loaded debt gives its name and both series', () => {
    expect(debtFilterOf(ID, [debt])).toEqual({ id: ID, name: 'Auto loan', series: ['s-pay', 's-extra'] });
    expect(debtFilterOf(ID, [{ ...debt, extra_series_id: null }])).toEqual({ id: ID, name: 'Auto loan', series: ['s-pay'] });
  });
  it('not loaded, unknown or removed: tag only, no name', () => {
    const tagOnly = { id: ID, name: null, series: [] };
    expect(debtFilterOf(ID, undefined)).toEqual(tagOnly);
    expect(debtFilterOf(ID, [])).toEqual(tagOnly);
    expect(debtFilterOf(ID, [{ ...debt, deleted_at: '2026-11-01T00:00:00Z' }])).toEqual(tagOnly);
  });
});

describe('matchesDebt', () => {
  const f = { id: ID, name: 'Auto loan', series: ['s-pay', 's-extra'] };
  it('matches the tag and either series, nothing else', () => {
    expect(matchesDebt({ debt_id: ID, recurring_series_id: null }, f)).toBe(true);
    expect(matchesDebt({ recurring_series_id: 's-pay' }, f)).toBe(true);
    expect(matchesDebt({ debt_id: null, recurring_series_id: 's-extra' }, f)).toBe(true);
    expect(matchesDebt({ debt_id: 'other', recurring_series_id: 's-other' }, f)).toBe(false);
    expect(matchesDebt({ recurring_series_id: null }, f)).toBe(false);
  });
});
