import fc from 'fast-check';
import { parseAmount, parseDecimalString, localeSeparators } from '../parseAmount';
import { MAX_ABS_AMOUNT_MINOR } from '../types';

describe('localeSeparators', () => {
  it('derives en-US decimal and group characters', () => {
    expect(localeSeparators('en-US')).toEqual({ decimal: '.', group: ',' });
  });

  it('derives de-DE decimal and group characters (swapped vs en-US)', () => {
    expect(localeSeparators('de-DE')).toEqual({ decimal: ',', group: '.' });
  });

  it('falls back to "." and "," when Intl reports no decimal/group part tokens', () => {
    const spy = jest.spyOn(Intl.NumberFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'integer', value: '1234567' },
    ]);
    try {
      expect(localeSeparators('en-US')).toEqual({ decimal: '.', group: ',' });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('parseDecimalString', () => {
  it('converts a de-DE-formatted string using the locale decimal mark, ignoring maxFractionDigits headroom', () => {
    expect(parseDecimalString('2,5', { locale: 'de-DE', maxFractionDigits: 10 })).toEqual({
      ok: true,
      value: '2.5',
    });
  });

  it('rejects more fraction digits than allowed', () => {
    expect(
      parseDecimalString('2,12345678901', { locale: 'de-DE', maxFractionDigits: 10 })
    ).toEqual({ ok: false, error: 'too-many-decimals' });
  });
});

describe('parseAmount: en-US', () => {
  const opts = { locale: 'en-US', exponent: 2 };

  it('parses a grouped amount', () => {
    expect(parseAmount('1,234.56', opts)).toEqual({ ok: true, value: 123456 });
  });

  it('parses a whole number with no fraction', () => {
    expect(parseAmount('1234', opts)).toEqual({ ok: true, value: 123400 });
  });

  it('parses a leading-zero decimal', () => {
    expect(parseAmount('0.5', opts)).toEqual({ ok: true, value: 50 });
  });

  it('parses a bare decimal mark with no leading digit', () => {
    expect(parseAmount('.5', opts)).toEqual({ ok: true, value: 50 });
  });

  it('parses a trailing decimal mark with no fraction digits', () => {
    expect(parseAmount('12.', opts)).toEqual({ ok: true, value: 1200 });
  });
});

describe('parseAmount: de-DE', () => {
  it('parses a fully grouped amount', () => {
    expect(parseAmount('1.234,56', { locale: 'de-DE', exponent: 2 })).toEqual({
      ok: true,
      value: 123456,
    });
  });

  it('parses a simple decimal amount', () => {
    expect(parseAmount('12,5', { locale: 'de-DE', exponent: 2 })).toEqual({
      ok: true,
      value: 1250,
    });
  });

  it('treats the dot as the de-DE group mark, not a decimal point (D-24) -- a 3-decimal exponent makes the effect unambiguous', () => {
    expect(parseAmount('12.5', { locale: 'de-DE', exponent: 3 })).toEqual({
      ok: true,
      value: 125000,
    });
  });
});

describe('parseAmount: fr-FR grouping variants', () => {
  const opts = { locale: 'fr-FR', exponent: 2 };
  const cases = ['1 234,56', '1 234,56', '1 234,56'];

  it.each(cases)('accepts %p as a grouping separator', (raw) => {
    expect(parseAmount(raw, opts)).toEqual({ ok: true, value: 123456 });
  });
});

describe('parseAmount: ar-KW Arabic-Indic digits', () => {
  it('parses Arabic-Indic digits with the Arabic decimal mark', () => {
    expect(parseAmount('١٢٫٥', { locale: 'ar-KW', exponent: 3 })).toEqual({
      ok: true,
      value: 12500,
    });
  });
});

describe('parseAmount: Extended Arabic-Indic digits (Persian/Urdu, U+06F0-U+06F9)', () => {
  it('normalizes Extended Arabic-Indic digits the same as ASCII digits', () => {
    expect(parseAmount('۱۲.۵', { locale: 'en-US', exponent: 2 })).toEqual({
      ok: true,
      value: 1250,
    });
  });
});

describe('parseAmount: zero', () => {
  it('parses a fully-zero amount to zero', () => {
    expect(parseAmount('0.00', { locale: 'en-US', exponent: 2 })).toEqual({ ok: true, value: 0 });
  });
});

describe('parseAmount: ja-JP zero-exponent currency', () => {
  const opts = { locale: 'ja-JP', exponent: 0 };

  it('parses a grouped whole amount', () => {
    expect(parseAmount('1,200', opts)).toEqual({ ok: true, value: 1200 });
  });

  it('rejects any fraction digit at all', () => {
    expect(parseAmount('12.5', opts)).toEqual({
      ok: false,
      error: 'too-many-decimals',
      maxDecimals: 0,
    });
  });
});

describe('parseAmount: KWD three-decimal exponent', () => {
  it('rejects a fourth fraction digit', () => {
    expect(parseAmount('1.2345', { locale: 'en-US', exponent: 3 })).toEqual({
      ok: false,
      error: 'too-many-decimals',
      maxDecimals: 3,
    });
  });
});

describe('parseAmount: rejections', () => {
  const opts = { locale: 'en-US', exponent: 2 };

  it.each(['', '   '])('rejects %p as empty', (raw) => {
    expect(parseAmount(raw, opts)).toEqual({ ok: false, error: 'empty', maxDecimals: 2 });
  });

  it.each(['.', '1.2.3', '12a', '-5', '−5', '1.2,3'])('rejects %p as invalid', (raw) => {
    expect(parseAmount(raw, opts)).toEqual({ ok: false, error: 'invalid', maxDecimals: 2 });
  });
});

describe('parseAmount: MAX_ABS_AMOUNT_MINOR boundary', () => {
  const opts = { locale: 'en-US', exponent: 2 };

  it('accepts an amount exactly at the maximum', () => {
    expect(parseAmount('100000000000.00', opts)).toEqual({
      ok: true,
      value: MAX_ABS_AMOUNT_MINOR,
    });
  });

  it('rejects one minor unit over the maximum', () => {
    expect(parseAmount('100000000000.01', opts)).toEqual({
      ok: false,
      error: 'too-large',
      maxDecimals: 2,
    });
  });
});

describe('parseAmount: exponent validation is a programming error, not user input', () => {
  it('throws RangeError for a negative exponent', () => {
    expect(() => parseAmount('1', { locale: 'en-US', exponent: -1 })).toThrow(RangeError);
  });

  it('throws RangeError for a non-integer exponent', () => {
    expect(() => parseAmount('1', { locale: 'en-US', exponent: 2.5 })).toThrow(RangeError);
  });

  it('throws RangeError for an exponent above 4', () => {
    expect(() => parseAmount('1', { locale: 'en-US', exponent: 5 })).toThrow(RangeError);
  });
});

// Builds a plain decimal string from a MinorUnits integer using pure string manipulation --
// no division, mirroring how toDecimalString (Task 2) will work, but kept local here since
// formatAmount.ts does not exist yet at this point in the plan.
function decimalStringFromMinor(n: number, exponent: number): string {
  const digits = Math.abs(n).toString().padStart(exponent + 1, '0');
  if (exponent === 0) return digits;
  const cut = digits.length - exponent;
  return `${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

describe('parseAmount: round-trip property (fast-check)', () => {
  it('recovers the original minor-unit integer from its own Intl-rendered string, for every locale/exponent combination', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_ABS_AMOUNT_MINOR }),
        fc.constantFrom('en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP', 'ar-KW', 'en-IN'),
        fc.constantFrom(0, 2, 3),
        (n, locale, exponent) => {
          const decimalStr = decimalStringFromMinor(n, exponent);
          const rendered = new Intl.NumberFormat(locale, {
            minimumFractionDigits: exponent,
            maximumFractionDigits: exponent,
            useGrouping: true,
          }).format(decimalStr as unknown as number);

          const result = parseAmount(rendered, { locale, exponent });
          expect(result).toEqual({ ok: true, value: n });
        }
      ),
      { numRuns: 200 }
    );
  });
});
