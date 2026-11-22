// 08.1-24 (owner later dips option 1, 2026-11-20; caution sign 2026-11-21): the pure read of the later-dip fact the caution sign shows.
import type { Code, Fact, Result } from '@/engine/decide/v3';
import { laterDipOf } from '../laterDip';

const fact = (code: 'below_zero_later_without' | 'below_zero_later_with', date: string): Fact =>
  ({ code, values: { date, zero: 0 } }) as unknown as Fact;
const r = (code: Code, facts: readonly Fact[]): Pick<Result, 'code' | 'facts'> => ({ code, facts });

const FITS: readonly Code[] = ['fits_on_your_answer', 'fits_by_borrowing', 'fits_uses_overdraft', 'fits_uses_net', 'fits_unspent', 'fits_month'];
const NOT_FITS: readonly Code[] = ['not_yet', 'monthly_short', 'emergency_use', 'needs_input'];

describe('laterDipOf (08.1-24)', () => {
  it('reads "even without" on a fits_month answer', () => {
    expect(laterDipOf(r('fits_month', [fact('below_zero_later_without', '2027-06-14')]))).toEqual({ kind: 'without', date: '2027-06-14' });
  });

  it('reads "with" on a fits_month answer', () => {
    expect(laterDipOf(r('fits_month', [fact('below_zero_later_with', '2027-03-02')]))).toEqual({ kind: 'with', date: '2027-03-02' });
  });

  it('works for every fits_* code', () => {
    for (const code of FITS) expect(laterDipOf(r(code, [fact('below_zero_later_with', '2027-01-31')]))?.date).toBe('2027-01-31');
  });

  it('finds the fact among others', () => {
    const other = { code: 'month_left_after', values: { amount: 5 } } as unknown as Fact;
    expect(laterDipOf(r('fits_unspent', [other, fact('below_zero_later_without', '2027-06-14')]))?.kind).toBe('without');
  });

  it('is null for a fits answer without the fact', () => {
    expect(laterDipOf(r('fits_month', []))).toBeNull();
  });

  it('is null for every non-fits answer, even with a forged fact (T-08.1-69)', () => {
    for (const code of NOT_FITS) expect(laterDipOf(r(code, [fact('below_zero_later_without', '2027-06-14')]))).toBeNull();
  });

  it('is null for a malformed date', () => {
    for (const bad of ['', '2027-6-14', '14/06/2027', '2027-06-14T00:00:00Z', 'soon']) {
      expect(laterDipOf(r('fits_month', [fact('below_zero_later_without', bad)]))).toBeNull();
    }
    const noDate = { code: 'below_zero_later_with', values: { zero: 0 } } as unknown as Fact;
    expect(laterDipOf(r('fits_month', [noDate]))).toBeNull();
  });

  it('is null for no result', () => {
    expect(laterDipOf(null)).toBeNull();
  });
});
