import { refundHint } from '../refundHint';

describe('refundHint', () => {
  it('true when refunds make it strictly better and the stored answer is worse', () => {
    expect(refundHint({ stored: { code: 'not_yet' }, live: { code: 'fits_unspent' }, without: { code: 'not_yet' } })).toBe(true);
  });
  it('true with no stored answer', () => {
    expect(refundHint({ stored: null, live: { code: 'fits_month' }, without: { code: 'monthly_short' } })).toBe(true);
  });
  it('false when the stored answer is already that good', () => {
    expect(refundHint({ stored: { code: 'fits_unspent' }, live: { code: 'fits_unspent' }, without: { code: 'not_yet' } })).toBe(false);
  });
  it('false when live equals without', () => {
    expect(refundHint({ stored: null, live: { code: 'not_yet' }, without: { code: 'not_yet' } })).toBe(false);
  });
  it('false when there is no without evaluation or no live one', () => {
    expect(refundHint({ stored: null, live: { code: 'fits_month' }, without: undefined })).toBe(false);
    expect(refundHint({ stored: null, live: undefined, without: { code: 'not_yet' } })).toBe(false);
  });
  it('false when live is worse than without', () => {
    expect(refundHint({ stored: null, live: { code: 'not_yet' }, without: { code: 'fits_month' } })).toBe(false);
  });
  it('D-13 stored answer is never an output', () => {
    const stored = Object.freeze({ code: 'not_yet' as const });
    const live = Object.freeze({ code: 'fits_month' as const });
    const without = Object.freeze({ code: 'not_yet' as const });
    const out = refundHint({ stored, live, without });
    expect(typeof out).toBe('boolean');
    expect(stored).toEqual({ code: 'not_yet' });
  });
});
