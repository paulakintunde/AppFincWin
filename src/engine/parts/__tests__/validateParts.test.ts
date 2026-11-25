import { PARTS_MAX, PARTS_MIN, validateParts } from '../validateParts';

const p = (...amounts: number[]) => amounts.map((amount) => ({ categoryId: 'c', amount }));

describe('validateParts', () => {
  it('exposes the limits', () => {
    expect([PARTS_MIN, PARTS_MAX]).toEqual([2, 20]);
  });
  it('too_few', () => expect(validateParts(-5000, p(-5000))).toBe('too_few'));
  it('too_many', () => expect(validateParts(-5000, p(...Array<number>(21).fill(-1)))).toBe('too_many'));
  it('accepts exactly 20', () => expect(validateParts(-20, p(...Array<number>(20).fill(-1)))).toBeNull());
  it('not_integer', () => expect(validateParts(-5000, p(-1.5, -4998.5))).toBe('not_integer'));
  it('zero_part', () => expect(validateParts(-5000, p(0, -5000))).toBe('zero_part'));
  it('over_total for a zero line', () => expect(validateParts(0, p(1, -1))).toBe('over_total'));
  it('mixed_sign', () => expect(validateParts(-150, p(100, -250))).toBe('mixed_sign'));
  it('mixed_sign on a positive line', () => expect(validateParts(150, p(-100, 250))).toBe('mixed_sign'));
  it('over_total', () => expect(validateParts(-5000, p(-3000, -3000))).toBe('over_total'));
  it('not_total without allowGap', () => expect(validateParts(-5000, p(-2000, -2000))).toBe('not_total'));
  it('not_total when allowGap is explicitly false', () =>
    expect(validateParts(-5000, p(-2000, -2000), { allowGap: false })).toBe('not_total'));
  it('allows a gap with allowGap', () =>
    expect(validateParts(-5000, p(-2000, -2000), { allowGap: true })).toBeNull());
  it('null when the parts add up', () => expect(validateParts(-5000, p(-2000, -3000))).toBeNull());
  it('null for a positive line', () => expect(validateParts(5000, p(2000, 3000))).toBeNull());
  it('first failing check wins: too_few before not_integer', () =>
    expect(validateParts(-5, p(-1.5))).toBe('too_few'));
});
