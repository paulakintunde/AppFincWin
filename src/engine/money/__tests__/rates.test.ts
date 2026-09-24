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
});
