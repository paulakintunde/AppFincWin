/**
 * 05.4-61 (D-177 a): the shadow round keeps its figures within 1100 characters of JSON: exactly 1100 fits, 1101 does not.
 */
import type { LocalDate, Result } from '../../types';
import { SHADOW_FIGURES_CHARS, roundForShadow } from '../round';

const ASOF: LocalDate = '2026-11-15';

const result = (facts: Result['facts']): Result =>
  ({
    code: 'fits_month',
    variant: null,
    missing: [],
    reasons: [],
    facts,
    notices: [],
    caveats: [],
    split: [],
    band: null,
    readyBy: null,
    afterBuy: { month: 12_345, usualMonth: null, before: 54_321 },
  }) as unknown as Result;

describe('05.4-61 roundForShadow: the character budget is exact', () => {
  const baseLen = JSON.stringify(roundForShadow(result([]), ASOF).figures).length;
  // adding one figure with a key of `n` characters in all grows the JSON by n + 2 (quotes) + 1 (colon) + 1 (comma) + 1 (one digit)
  const factWithKeyLength = (keyLen: number): Result['facts'] => {
    const key = 'k'.repeat(keyLen - 'x.'.length);
    return [{ code: 'x', values: { [key]: 5 } }];
  };

  it('a figure that brings the JSON to exactly 1100 characters is kept', () => {
    expect(SHADOW_FIGURES_CHARS).toBe(1100);
    const keyLen = 1100 - baseLen - 5;
    const r = roundForShadow(result(factWithKeyLength(keyLen)), ASOF);
    expect(JSON.stringify(r.figures).length).toBe(1100);
    expect(Object.keys(r.figures).some((k) => k.startsWith('x.'))).toBe(true);
  });

  it('a figure that would bring it to 1101 is left out', () => {
    const keyLen = 1101 - baseLen - 5;
    const r = roundForShadow(result(factWithKeyLength(keyLen)), ASOF);
    expect(Object.keys(r.figures).some((k) => k.startsWith('x.'))).toBe(false);
    expect(JSON.stringify(r.figures).length).toBe(baseLen);
  });
});
