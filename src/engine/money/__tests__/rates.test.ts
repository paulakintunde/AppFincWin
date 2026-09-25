import fixtures from '../../../../supabase/tests/fixtures/money-conversion-cases.json';
import {
  RATE_SCALE,
  EUR_PER_EUR,
  parseRate,
  formatRate,
  convertMinor,
  crossRate,
  customPerEur,
} from '../rates';
import { minorUnits } from '../types';

describe('RATE_SCALE', () => {
  it('is 10 decimal digits, matching numeric(24,10)', () => {
    expect(RATE_SCALE).toBe(10);
  });
});

describe('EUR_PER_EUR', () => {
  it('is exactly 1, formatted with 10 fraction digits', () => {
    expect(formatRate(EUR_PER_EUR)).toBe('1.0000000000');
  });
});

describe('parseRate', () => {
  it('scales a rate string by 10^10', () => {
    expect(parseRate('1.1483')).toBe(11483000000n);
  });

  it('throws RangeError for zero', () => {
    expect(() => parseRate('0')).toThrow(RangeError);
  });

  it('throws RangeError for a negative rate', () => {
    expect(() => parseRate('-1')).toThrow(RangeError);
  });

  it('throws RangeError for more than 10 fraction digits', () => {
    expect(() => parseRate('1.12345678901')).toThrow(RangeError);
  });

  it('throws RangeError for a non-numeric string', () => {
    expect(() => parseRate('abc')).toThrow(RangeError);
  });

  it('throws RangeError for exponential notation', () => {
    expect(() => parseRate('1e5')).toThrow(RangeError);
  });
});

describe('formatRate', () => {
  it('always renders 10 fraction digits', () => {
    expect(formatRate(parseRate('180.7'))).toBe('180.7000000000');
  });
});

describe('convertMinor', () => {
  it.each(fixtures.convert)(
    '$name',
    ({ amount, fromPerEur, fromExponent, toPerEur, toExponent, expected }) => {
      const result = convertMinor(
        minorUnits(amount),
        parseRate(fromPerEur),
        fromExponent,
        parseRate(toPerEur),
        toExponent
      );
      expect(result).toBe(expected);
    }
  );

  it('throws RangeError when the result exceeds Number.MAX_SAFE_INTEGER', () => {
    expect(() =>
      convertMinor(minorUnits(9_000_000_000_000), parseRate('1'), 0, parseRate('1000000000000'), 0)
    ).toThrow(RangeError);
  });

  // Mirrors the transactions.home_amount check (23514) in SQL: 10^13 USD
  // cents is the largest original amount, and into IDR it overflows
  // MAX_SAFE_INTEGER (supabase/tests/database/19_money_bounds.test.sql).
  it('throws RangeError for the largest original amount converted into IDR (WR-B09)', () => {
    expect(() =>
      convertMinor(minorUnits(10_000_000_000_000), parseRate('1.1483'), 2, parseRate('18000'), 2)
    ).toThrow(RangeError);
  });

  it('throws RangeError for an out-of-range fromExponent', () => {
    expect(() => convertMinor(minorUnits(100), parseRate('1'), 5, parseRate('1'), 2)).toThrow(
      RangeError
    );
  });

  it('throws RangeError for an out-of-range toExponent', () => {
    expect(() => convertMinor(minorUnits(100), parseRate('1'), 2, parseRate('1'), -1)).toThrow(
      RangeError
    );
  });
});

describe('crossRate', () => {
  it.each(fixtures.crossRate)('$name', ({ fromPerEur, toPerEur, expected }) => {
    expect(formatRate(crossRate(parseRate(fromPerEur), parseRate(toPerEur)))).toBe(expected);
  });
});

describe('customPerEur', () => {
  it.each(fixtures.customPerEur)('$name', ({ referencePerEur, unitValue, expected }) => {
    expect(formatRate(customPerEur(parseRate(referencePerEur), parseRate(unitValue)))).toBe(
      expected
    );
  });

  // WR-B07: mirrors custom_per_eur()'s 22003 in SQL -- a per-EUR rate that
  // rounds to zero would make every later conversion divide by zero, and one
  // beyond numeric(24,10) cannot be stored.
  it('throws RangeError when the per-EUR rate rounds to zero', () => {
    expect(() => customPerEur(parseRate('0.0001'), parseRate('99999999999999'))).toThrow(RangeError);
  });

  it('throws RangeError when the per-EUR rate overflows numeric(24,10)', () => {
    expect(() => customPerEur(parseRate('99999'), parseRate('0.0000000001'))).toThrow(RangeError);
  });

  it('accepts the largest per-EUR rate numeric(24,10) can hold', () => {
    expect(formatRate(customPerEur(parseRate('99999999999999.9999999999'), parseRate('1')))).toBe(
      '99999999999999.9999999999'
    );
  });
});
