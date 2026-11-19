/**
 * 05.4-61 (D-177 a): the money-help table written out entry by entry, and the not-ready rule with a short-month variant set.
 */
import type { Result } from '../../types';
import { FREE_HELP, freeHelpFor, usualMonthShort } from '../freeHelp';

type Shape = Pick<Result, 'code' | 'variant' | 'readiness'>;
const shape = (code: Result['code'], variant: Result['variant'] = null, readiness?: Result['readiness']): Shape => ({ code, variant, ...(readiness === undefined ? {} : { readiness }) });

describe('05.4-61 FREE_HELP rows, literally', () => {
  it('GB', () => {
    expect(FREE_HELP.GB).toEqual({ name: 'MoneyHelper', url: 'https://www.moneyhelper.org.uk', checkedOn: '2026-11-05' });
  });
  it('US', () => {
    expect(FREE_HELP.US).toEqual({ name: 'NFCC', url: 'https://www.nfcc.org', checkedOn: '2026-11-05' });
  });
  it('CA', () => {
    expect(FREE_HELP.CA).toEqual({ name: 'Credit Counselling Canada', url: 'https://creditcounsellingcanada.ca', checkedOn: '2026-11-05' });
  });
  it('the lookup returns those same rows', () => {
    expect(freeHelpFor('GB')).toEqual({ name: 'MoneyHelper', url: 'https://www.moneyhelper.org.uk', checkedOn: '2026-11-05' });
  });
});

describe('05.4-61 usualMonthShort', () => {
  it.each(['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'] as const)('variant %s alone makes the month short', (v) => {
    expect(usualMonthShort(shape('fits_month', v))).toBe(true);
  });

  it('a variant that is not one of the four does not', () => {
    expect(usualMonthShort(shape('fits_month', 'tight'))).toBe(false);
    expect(usualMonthShort(shape('fits_month', 'not_covered'))).toBe(false);
  });

  it('an ask never counts, even with a short-month variant', () => {
    expect(usualMonthShort(shape('needs_input', 'month_already_short'))).toBe(false);
    expect(usualMonthShort(shape('needs_input', 'month_short_small', { ready: true, missing: [] }))).toBe(false);
  });

  it('a not-ready answer never counts, even with a short-month variant', () => {
    expect(usualMonthShort(shape('fits_month', 'month_already_short', { ready: false, missing: ['past_month_missing'] }))).toBe(false);
    expect(usualMonthShort(shape('monthly_short', 'month_already_short', { ready: true, missing: [] }))).toBe(true);
  });
});
