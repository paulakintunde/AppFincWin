import { DECIDE_WHY_CODES, decideBannerOf, monthParamOf, whyParamOf } from '../monthFilter';

describe('06.1-71 monthParamOf (T-06.1-71-01)', () => {
  it('accepts a YYYY-MM month', () => {
    expect(monthParamOf('2026-10')).toBe('2026-10');
    expect(monthParamOf('2026-01')).toBe('2026-01');
    expect(monthParamOf('2026-12')).toBe('2026-12');
  });

  it('takes the first value of a repeated parameter', () => {
    expect(monthParamOf(['2026-09', '2026-10'])).toBe('2026-09');
  });

  it.each([undefined, null, '', '2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', ' 2026-10', 'october', '2026/10'])(
    'rejects %p',
    (raw) => {
      expect(monthParamOf(raw as never)).toBeNull();
    }
  );
});

describe('06.1-71 whyParamOf', () => {
  it.each(DECIDE_WHY_CODES)('accepts %s', (code) => {
    expect(whyParamOf(code)).toBe(code);
  });

  it.each([undefined, null, '', 'envelopes', 'BILL', 'bill ', '<script>'])('rejects %p', (raw) => {
    expect(whyParamOf(raw as never)).toBeNull();
  });

  it('takes the first value of a repeated parameter', () => {
    expect(whyParamOf(['pay', 'bill'])).toBe('pay');
  });
});

describe('06.1-71 decideBannerOf', () => {
  it('is the month and reason when both are valid', () => {
    expect(decideBannerOf('2026-10', 'bill')).toEqual({ month: '2026-10', why: 'bill' });
  });

  it('is null when either is missing or invalid', () => {
    expect(decideBannerOf('2026-10', undefined)).toBeNull();
    expect(decideBannerOf(undefined, 'bill')).toBeNull();
    expect(decideBannerOf('2026-10', 'nope')).toBeNull();
    expect(decideBannerOf('2026-99', 'bill')).toBeNull();
  });
});
