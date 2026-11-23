import fc from 'fast-check';
import { minorUnits, parseRate } from '../../money';
import {
  ALERT_HISTORY_MIN_EXPENSES,
  ALERT_HISTORY_MIN_MONTHS,
  FLAT_LARGE_EUR_MINOR,
  FLAT_LOW_EUR_MINOR,
  suggestAlertAmounts,
  type AlertSpendLine,
  type SuggestInput,
} from '..';

const TODAY = '2026-11-22';
const TWO_MONTHS = ['2026-11-10', '2026-10-10'];

function lines(mags: number[], dates: string[]): AlertSpendLine[] {
  return mags.map((m, i) => ({ magnitude: minorUnits(m), localDate: dates[i % dates.length]! }));
}

function input(over: Partial<SuggestInput>): SuggestInput {
  return {
    expenses: [],
    today: TODAY,
    homeCurrency: 'EUR',
    homeExponent: 2,
    homePerEur: parseRate('1'),
    ...over,
  };
}

describe('constants', () => {
  it('match D-10', () => {
    expect(ALERT_HISTORY_MIN_EXPENSES).toBe(30);
    expect(ALERT_HISTORY_MIN_MONTHS).toBe(2);
    expect(FLAT_LARGE_EUR_MINOR).toBe(20000);
    expect(FLAT_LOW_EUR_MINOR).toBe(10000);
  });
});

describe('history path', () => {
  it('odd count: large is 3x the median, low is sum/13 half up', () => {
    const mags = Array.from({ length: 31 }, (_, i) => (i + 1) * 100); // median 1600
    const r = suggestAlertAmounts(input({ expenses: lines(mags, TWO_MONTHS) }));
    expect(r.large).toEqual({ minor: 4800, basis: 'history' });
    const sum = mags.reduce((a, b) => a + b, 0); // 49600
    expect(r.low).toEqual({ minor: Math.floor((2 * sum + 13) / 26), basis: 'history' });
  });

  it('even count: median is the half-up mean of the two middle values', () => {
    const mags = Array.from({ length: 30 }, (_, i) => 100 + i); // middle 114, 115
    const r = suggestAlertAmounts(input({ expenses: lines(mags, TWO_MONTHS) }));
    expect(r.large).toEqual({ minor: 345, basis: 'history' }); // 115 * 3
  });

  it('sorts unsorted input', () => {
    const mags = Array.from({ length: 31 }, (_, i) => (31 - i) * 100);
    const r = suggestAlertAmounts(input({ expenses: lines(mags, TWO_MONTHS) }));
    expect(r.large.minor).toBe(4800);
  });

  it('low is at least 1 minor unit', () => {
    const ones = suggestAlertAmounts(
      input({ expenses: lines(Array.from({ length: 30 }, () => 1), TWO_MONTHS) })
    );
    expect(ones.low.minor).toBe(2); // 30/13
    const zeros = suggestAlertAmounts(
      input({ expenses: lines(Array.from({ length: 30 }, () => 0), TWO_MONTHS) })
    );
    expect(zeros.low.minor).toBe(1);
  });

  it('ignores expenses older than the window or after today', () => {
    const inWindow = lines(Array.from({ length: 30 }, () => 1000), TWO_MONTHS);
    const noise: AlertSpendLine[] = [
      { magnitude: minorUnits(9_000_000), localDate: '2026-08-22' }, // boundary, exclusive
      { magnitude: minorUnits(9_000_000), localDate: '2026-01-01' },
      { magnitude: minorUnits(9_000_000), localDate: '2026-11-23' },
    ];
    const r = suggestAlertAmounts(input({ expenses: [...inWindow, ...noise] }));
    expect(r.large.minor).toBe(3000);
    expect(r.low.minor).toBe(Math.floor((2 * 30000 + 13) / 26));
  });

  it('includes the day after the exclusive boundary and today itself', () => {
    const mags = Array.from({ length: 30 }, () => 500);
    const r = suggestAlertAmounts(input({ expenses: lines(mags, ['2026-08-23', TODAY]) }));
    expect(r.large.basis).toBe('history');
  });

  it('clamps the window start for short months (31 May -> 28 Feb)', () => {
    const mags = Array.from({ length: 30 }, () => 500);
    const old: AlertSpendLine = { magnitude: minorUnits(1), localDate: '2026-02-28' };
    const r = suggestAlertAmounts(
      input({ today: '2026-05-31', expenses: [...lines(mags, ['2026-05-02', '2026-04-02']), old] })
    );
    expect(r.large.minor).toBe(1500); // Feb 28 excluded
  });

  it('handles a January today (year rollover)', () => {
    const mags = Array.from({ length: 30 }, () => 500);
    const r = suggestAlertAmounts(
      input({ today: '2027-01-15', expenses: lines(mags, ['2027-01-02', '2026-12-02']) })
    );
    expect(r.large.basis).toBe('history');
  });

  it('history amounts do not depend on rate or currency', () => {
    const mags = Array.from({ length: 30 }, () => 1000);
    const r = suggestAlertAmounts(
      input({ homeCurrency: 'JPY', homeExponent: 0, homePerEur: null, expenses: lines(mags, TWO_MONTHS) })
    );
    expect(r.large).toEqual({ minor: 3000, basis: 'history' });
  });

  it('rejects an invalid today', () => {
    expect(() => suggestAlertAmounts(input({ today: 'nope' }))).toThrow(RangeError);
  });
});

describe('flat path', () => {
  it('29 expenses falls back to flat', () => {
    const r = suggestAlertAmounts(
      input({ expenses: lines(Array.from({ length: 29 }, () => 1000), TWO_MONTHS) })
    );
    expect(r.large.basis).toBe('flat');
    expect(r.low.basis).toBe('flat');
  });

  it('30 expenses in one month falls back to flat', () => {
    const r = suggestAlertAmounts(
      input({ expenses: lines(Array.from({ length: 30 }, () => 1000), ['2026-11-10']) })
    );
    expect(r.large).toEqual({ minor: 20000, basis: 'flat' });
    expect(r.low).toEqual({ minor: 10000, basis: 'flat' });
  });

  it('EUR', () => {
    const r = suggestAlertAmounts(input({}));
    expect(r.large.minor).toBe(20000);
    expect(r.low.minor).toBe(10000);
  });

  it('USD at 1.08', () => {
    const r = suggestAlertAmounts(input({ homeCurrency: 'USD', homePerEur: parseRate('1.08') }));
    expect(r.large.minor).toBe(21600);
    expect(r.low.minor).toBe(10800);
  });

  it('JPY exponent 0 at 160', () => {
    const r = suggestAlertAmounts(
      input({ homeCurrency: 'JPY', homeExponent: 0, homePerEur: parseRate('160') })
    );
    expect(r.large.minor).toBe(32000);
    expect(r.low.minor).toBe(16000);
  });

  it('null rate uses 200 / 100 whole units in the home exponent', () => {
    const r3 = suggestAlertAmounts(input({ homePerEur: null, homeExponent: 3 }));
    expect(r3.large.minor).toBe(200000);
    expect(r3.low.minor).toBe(100000);
    const r0 = suggestAlertAmounts(input({ homePerEur: null, homeExponent: 0 }));
    expect(r0.large.minor).toBe(200);
    expect(r0.low.minor).toBe(100);
  });

  it('rounds to whole units half up', () => {
    const down = suggestAlertAmounts(input({ homeCurrency: 'USD', homePerEur: parseRate('1.08245') }));
    expect(down.large.minor).toBe(21600); // converted 21649
    const up = suggestAlertAmounts(input({ homeCurrency: 'USD', homePerEur: parseRate('1.0825') }));
    expect(up.large.minor).toBe(21700); // converted 21650
  });

  it('a tiny rate never rounds a flat amount to zero', () => {
    const r = suggestAlertAmounts(input({ homeCurrency: 'XXX', homePerEur: parseRate('0.0001') }));
    expect(r.low.minor).toBe(100);
    expect(r.large.minor).toBe(100);
  });
});

describe('property', () => {
  it('large >= 3 * min magnitude, low >= 1, safe integers', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100_000_000 }), { minLength: 30, maxLength: 120 }),
        (mags) => {
          const r = suggestAlertAmounts(input({ expenses: lines(mags, TWO_MONTHS) }));
          expect(r.large.basis).toBe('history');
          expect(r.large.minor).toBeGreaterThanOrEqual(3 * Math.min(...mags));
          expect(Number.isSafeInteger(r.large.minor)).toBe(true);
          expect(r.low.minor).toBeGreaterThanOrEqual(1);
          expect(Number.isSafeInteger(r.low.minor)).toBe(true);
        }
      )
    );
  });
});
