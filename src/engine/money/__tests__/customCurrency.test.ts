import {
  validateCustomCurrency,
  type CustomCurrencyInput,
  type ValidateCustomCurrencyContext,
} from '../customCurrency';

const ISO_CODES = new Set(['USD', 'EUR', 'JPY', 'GBP']);

function ctx(overrides: Partial<ValidateCustomCurrencyContext> = {}): ValidateCustomCurrencyContext {
  return { isoCodes: ISO_CODES, existingCustomCodes: new Set(), ...overrides };
}

function input(overrides: Partial<CustomCurrencyInput> = {}): CustomCurrencyInput {
  return {
    code: 'GLD',
    symbol: '',
    decimals: 0,
    referenceCurrency: 'USD',
    unitValueRaw: '2.5',
    locale: 'en-US',
    ...overrides,
  };
}

describe('validateCustomCurrency', () => {
  it('trims/upper-cases the code, falls back the symbol to the code, and produces a canonical 10dp unit value', () => {
    const result = validateCustomCurrency(input({ code: ' gld ', symbol: '', decimals: 0 }), ctx());
    expect(result).toEqual({
      ok: true,
      value: { code: 'GLD', symbol: 'GLD', decimals: 0, referenceCurrency: 'USD', unitValue: '2.5000000000' },
    });
  });

  it('keeps an explicit symbol rather than falling back to the code', () => {
    const result = validateCustomCurrency(input({ symbol: 'g' }), ctx());
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ symbol: 'g' }) });
  });

  describe('code', () => {
    it('empty code is code-missing', () => {
      const result = validateCustomCurrency(input({ code: '' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['code-missing']) });
    });

    it('a single-character code is code-missing (fewer than 2 chars)', () => {
      const result = validateCustomCurrency(input({ code: 'G' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['code-missing']) });
    });

    it('a code with an invalid character is code-invalid', () => {
      const result = validateCustomCurrency(input({ code: 'G$D' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['code-invalid']) });
    });

    it('a code longer than 4 characters is code-invalid', () => {
      const result = validateCustomCurrency(input({ code: 'ABCDE' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['code-invalid']) });
    });

    it('a code shadowing a known ISO currency is code-exists', () => {
      const result = validateCustomCurrency(input({ code: 'USD' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['code-exists']) });
    });

    it('a code matching an existing custom currency is code-exists', () => {
      const result = validateCustomCurrency(input({ code: 'GLD' }), ctx({ existingCustomCodes: new Set(['GLD']) }));
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['code-exists']) });
    });
  });

  describe('symbol', () => {
    it('a symbol longer than 4 characters is symbol-invalid', () => {
      const result = validateCustomCurrency(input({ symbol: 'TOOLONG' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['symbol-invalid']) });
    });
  });

  describe('decimals', () => {
    it('5 decimals is decimals-invalid (out of the 0-4 range)', () => {
      const result = validateCustomCurrency(input({ decimals: 5 }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['decimals-invalid']) });
    });

    it('a non-integer decimals value is decimals-invalid', () => {
      const result = validateCustomCurrency(input({ decimals: 1.5 }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['decimals-invalid']) });
    });
  });

  describe('referenceCurrency', () => {
    it('a reference currency not in isoCodes is reference-invalid', () => {
      const result = validateCustomCurrency(input({ referenceCurrency: 'ABC' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['reference-invalid']) });
    });
  });

  describe('unitValueRaw', () => {
    it('zero is value-invalid (must be greater than zero)', () => {
      const result = validateCustomCurrency(input({ unitValueRaw: '0' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['value-invalid']) });
    });

    it('a non-numeric string is value-invalid', () => {
      const result = validateCustomCurrency(input({ unitValueRaw: 'abc' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['value-invalid']) });
    });

    it('an empty string is value-invalid', () => {
      const result = validateCustomCurrency(input({ unitValueRaw: '' }), ctx());
      expect(result).toEqual({ ok: false, errors: expect.arrayContaining(['value-invalid']) });
    });

    it('RD-01: 11 fraction digits is still value-invalid (numeric(24,10) precision, not a value bound)', () => {
      const result = validateCustomCurrency(input({ unitValueRaw: '1000000.00000000001' }), ctx());
      expect(result).toEqual({ ok: false, errors: ['value-invalid'] });
    });

    // RD-01: no upper or lower bound on unit_value -- a legitimate investment can be worth
    // 100M-1B+ reference units, and a value the old MIN_UNIT_VALUE would have rejected
    // (e.g. 0.0000009) is a perfectly valid fractional unit. The only guard left is that the
    // *derived per-EUR rate* neither rounds to zero nor overflows numeric(24,10) --
    // engine/money/rates.ts's customPerEur (exercised end to end via provisionalStamp /
    // useAddCustomCurrency, and server-side by guard_custom_currency_rate), not this
    // validator, is the single source of truth for that.
    it.each(['60000', '5000000', '0.0000009', '0.0000000001', '1000000000', '99999999999999'])(
      'RD-01: %p has no static bound and is accepted',
      (raw) => {
        expect(validateCustomCurrency(input({ unitValueRaw: raw }), ctx()).ok).toBe(true);
      }
    );

    it('RD-01: a 1,000,000,000-unit value (e.g. a high-value investment) validates end to end with a canonical 10dp unit value', () => {
      const result = validateCustomCurrency(input({ unitValueRaw: '1000000000' }), ctx());
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({ unitValue: '1000000000.0000000000' }),
      });
    });

    it('WR-A11: explicit region separators win over the locale tag', () => {
      const result = validateCustomCurrency(
        input({ unitValueRaw: '2,5', locale: 'en-US', separators: { decimal: ',', group: '.' } }),
        ctx()
      );
      expect(result).toEqual({ ok: true, value: expect.objectContaining({ unitValue: '2.5000000000' }) });
    });

    it('a de-DE comma decimal parses correctly per the given locale', () => {
      const result = validateCustomCurrency(input({ unitValueRaw: '2,5', locale: 'de-DE' }), ctx());
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({ unitValue: '2.5000000000' }),
      });
    });
  });

  it('reports every problem in one call, not just the first', () => {
    const result = validateCustomCurrency(
      input({ code: '', symbol: 'TOOLONG', decimals: 5, referenceCurrency: 'ABC', unitValueRaw: '' }),
      ctx()
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors).toEqual(
      expect.arrayContaining(['code-missing', 'symbol-invalid', 'decimals-invalid', 'reference-invalid', 'value-invalid'])
    );
    expect(result.errors).toHaveLength(5);
  });
});
