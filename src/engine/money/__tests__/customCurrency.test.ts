import {
  MAX_UNIT_VALUE,
  MIN_UNIT_VALUE,
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

    it.each(['1000000.0000000001', '5000000', '0.0000009', '0.0000000001'])(
      'IN-A02: %p is outside the unit-value bounds and is value-invalid',
      (raw) => {
        const result = validateCustomCurrency(input({ unitValueRaw: raw }), ctx());
        expect(result).toEqual({ ok: false, errors: ['value-invalid'] });
      }
    );

    it.each([MIN_UNIT_VALUE, MAX_UNIT_VALUE, '60000'])('IN-A02: %p is within bounds', (raw) => {
      expect(validateCustomCurrency(input({ unitValueRaw: raw }), ctx()).ok).toBe(true);
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
