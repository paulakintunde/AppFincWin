// 10-review-2 (D-1, D-2; owner 2026-11-28): flexible amount reading, canonical export form, exact round trip.
import fc from 'fast-check';
import { ISO_EXPONENT_EXCEPTIONS } from '../../money';
import { exponentWith, formatExportAmount, resolveCell, shapeCell, toMinor } from '../amount';
import { parseDataCsv } from '../parse';

const EXP: Record<string, number> = { USD: 2, EUR: 2, JPY: 0, KWD: 3 };

/** One goal row in its own file: no other value proves a convention. */
function read(cell: string, currency: string, deviceDecimal?: string) {
  const csv = `name,currency,target\nA,${currency},"${cell.replace(/"/g, '""')}"\n`;
  const res = parseDataCsv('savings_goals', csv, deviceDecimal === undefined ? {} : { deviceDecimal });
  if (!res.ok) throw new Error(res.error);
  const row = res.rows[0]!;
  return { minor: row.money.target, issues: row.issues, notes: row.notes };
}

// The owner's examples. `null` is an extra-decimals flag.
const EXAMPLES: readonly [string, Record<string, number | null>][] = [
  ['5.69', { USD: 569, EUR: 569, JPY: null, KWD: 5690 }],
  ['5,69', { USD: 569, EUR: 569, JPY: null, KWD: 5690 }],
  ['1,234.56', { USD: 123456, EUR: 123456, JPY: null, KWD: 1234560 }],
  ['1.234,56', { USD: 123456, EUR: 123456, JPY: null, KWD: 1234560 }],
  ['1 234,56', { USD: 123456, EUR: 123456, JPY: null, KWD: 1234560 }],
  ['1 234,56', { USD: 123456, EUR: 123456, JPY: null, KWD: 1234560 }],
  ["1'234.50", { USD: 123450, EUR: 123450, JPY: null, KWD: 1234500 }],
  ['1234', { USD: 123400, EUR: 123400, JPY: 1234, KWD: 1234000 }],
  ['$1,234.56', { USD: 123456, EUR: 123456, JPY: null, KWD: 1234560 }],
  ['-25.00', { USD: -2500, EUR: -2500, JPY: -25, KWD: -25000 }],
  ['(25.00)', { USD: -2500, EUR: -2500, JPY: -25, KWD: -25000 }],
  ['25.00-', { USD: -2500, EUR: -2500, JPY: -25, KWD: -25000 }],
  ['USD 25.00', { USD: 2500, EUR: 2500, JPY: 25, KWD: 25000 }],
  ['12,50 €', { USD: 1250, EUR: 1250, JPY: null, KWD: 12500 }],
  ['-$1,234,567', { USD: -123456700, EUR: -123456700, JPY: -1234567, KWD: -1234567000 }],
  ['−kr 1.234.567,8', { USD: -123456780, EUR: -123456780, JPY: null, KWD: -1234567800 }],
];

describe('10-review-2 (D-2): the owner examples, every currency, both device marks', () => {
  for (const device of ['.', ',']) {
    for (const [cell, by] of EXAMPLES) {
      for (const currency of Object.keys(EXP)) {
        const want = by[currency]!;
        it(`${JSON.stringify(cell)} ${currency} on a "${device}" device`, () => {
          const got = read(cell, currency, device);
          if (want === null) {
            expect(got.issues).toEqual(['extra-decimals']);
            expect(got.minor).toBeNull();
          } else {
            expect(got.issues).toEqual([]);
            expect(got.minor).toBe(want);
          }
          expect(got.notes).toEqual([]);
        });
      }
    }
  }
});

describe('10-review-2 (D-2): one mark once with 3 digits after it ("1,234")', () => {
  it('2-decimal and 0-decimal currencies read it as grouping, whatever the device', () => {
    for (const d of [',', '.', undefined]) {
      expect(read('1,234', 'USD', d).minor).toBe(123400);
      expect(read('1.234', 'EUR', d).minor).toBe(123400);
      expect(read('1,234', 'JPY', d).minor).toBe(1234);
    }
  });
  it('a 3-decimal currency follows the device mark', () => {
    expect(read('1,234', 'KWD', ',').minor).toBe(1234);
    expect(read('1,234', 'KWD', '.').minor).toBe(1234000);
    expect(read('1.234', 'KWD', '.').minor).toBe(1234);
    expect(read('1.234', 'KWD', ',').minor).toBe(1234000);
  });
  it('with nothing to settle it, grouping is taken and the row carries a read-as note (not blocking)', () => {
    const got = read('1,234', 'KWD');
    expect(got.minor).toBe(1234000);
    expect(got.issues).toEqual([]);
    expect(got.notes).toEqual([{ kind: 'read-as', column: 'target' }]);
    expect(read('1,234', 'KWD', '٫').notes).toHaveLength(1);
  });
  it('the convention proven by other values in the file wins first', () => {
    const csv = (a: string, b: string) => `name,currency,target\nA,KWD,"${a}"\nB,KWD,"${b}"\n`;
    const comma = parseDataCsv('savings_goals', csv('5,69', '1,234'), { deviceDecimal: '.' });
    const dot = parseDataCsv('savings_goals', csv('5.69', '1,234'), { deviceDecimal: ',' });
    if (!comma.ok || !dot.ok) throw new Error('parse');
    expect(comma.rows.map((r) => r.money.target)).toEqual([5690, 1234]);
    expect(dot.rows.map((r) => r.money.target)).toEqual([5690, 1234000]);
    // for USD the proven ',' makes "1,234" a decimal with too many places: flagged, never rounded
    const usd = parseDataCsv('savings_goals', 'name,currency,target\nA,USD,"5,69"\nB,USD,"1,234"\n');
    if (!usd.ok) throw new Error('parse');
    expect(usd.rows[1]!.issues).toEqual(['extra-decimals']);
  });
  it('a column proves its own mark before the file does', () => {
    const csv = 'name,currency,target,opening_saved\nA,KWD,"5,69","1.5"\nB,KWD,"6,1","1,234"\n';
    const res = parseDataCsv('savings_goals', csv);
    if (!res.ok) throw new Error('parse');
    // target proves ','; opening_saved proves '.', so its "1,234" is grouping
    expect(res.rows[1]!.money.opening_saved).toBe(1234000);
    expect(res.rows.every((r) => r.issues.length === 0)).toBe(true);
  });
});

describe('10-review-2 (D-2): contradicting rows are flagged, and only those', () => {
  it('the minority convention is flagged', () => {
    const res = parseDataCsv('savings_goals', 'name,currency,target\nA,USD,"5,69"\nB,USD,"1.234,56"\nC,USD,"1,234.56"\nD,USD,7\n');
    if (!res.ok) throw new Error('parse');
    expect(res.rows.map((r) => r.issues)).toEqual([[], [], ['mixed-format'], []]);
    expect(res.rows[2]!.money.target).toBeNull();
  });
  it('a tie goes to the device mark; with no device mark nothing is flagged', () => {
    const csv = 'name,currency,target\nA,USD,"5,69"\nB,USD,"5.69"\n';
    const dev = parseDataCsv('savings_goals', csv, { deviceDecimal: '.' });
    const none = parseDataCsv('savings_goals', csv);
    if (!dev.ok || !none.ok) throw new Error('parse');
    expect(dev.rows.map((r) => r.issues)).toEqual([['mixed-format'], []]);
    expect(none.rows.map((r) => r.money.target)).toEqual([569, 569]);
  });
});

describe('shapeCell', () => {
  it('reads bad cells as bad', () => {
    for (const cell of ['', 'abc', '1e5', '.', '1.2.3', '1,23,456.00', ',5.3', '1,234.567.8', '--5', '-(5)', '(5', '5)x', '1.234.5', '0,123,456']) {
      expect(shapeCell(cell)).toEqual({ kind: 'bad' });
    }
  });
  it('a leading plus and leading-zero or long first parts are plain decimals', () => {
    expect(shapeCell('+5.5')).toEqual({ kind: 'sure', negative: false, whole: '5', fraction: '5', proves: '.' });
    expect(shapeCell('0,123')).toEqual({ kind: 'sure', negative: false, whole: '0', fraction: '123', proves: ',' });
    expect(shapeCell('1234,567')).toEqual({ kind: 'sure', negative: false, whole: '1234', fraction: '567', proves: ',' });
    expect(shapeCell('.5')).toEqual({ kind: 'sure', negative: false, whole: '', fraction: '5', proves: '.' });
    expect(shapeCell('7.')).toEqual({ kind: 'sure', negative: false, whole: '7', fraction: '', proves: '.' });
    expect(shapeCell('$-25')).toEqual({ kind: 'sure', negative: true, whole: '25', fraction: '', proves: null });
  });
  it('resolveCell passes a bad cell through as not ok', () => {
    expect(resolveCell({ kind: 'bad' }, { convention: null, exponent: 2 })).toEqual({ ok: false });
  });
});

describe('toMinor', () => {
  it('drops zero decimals past the currency, flags others, refuses too large', () => {
    expect(toMinor(false, '2500', '00', 0)).toEqual({ minor: 2500 });
    expect(toMinor(false, '1', '2340', 3)).toEqual({ minor: 1234 });
    expect(toMinor(false, '1', '2345', 3)).toEqual({ issue: 'extra-decimals' });
    expect(toMinor(true, '0', '00', 2)).toEqual({ minor: 0 });
    expect(toMinor(false, '100000000000', '01', 2)).toEqual({ issue: 'bad-amount' });
    expect(toMinor(false, '99999999999999999', '', 0)).toEqual({ issue: 'bad-amount' });
  });
});

describe('exponentWith', () => {
  it('ISO first, then the person custom currencies, then the default rule', () => {
    const exp = exponentWith([{ code: 'GLD1', decimals: 4 }]);
    expect(exp('KWD')).toBe(3);
    expect(exp('GLD1')).toBe(4);
    expect(exp('ZZZ9')).toBe(2);
    expect(exponentWith()('JPY')).toBe(0);
  });
});

describe('export form round trip (fast-check)', () => {
  const exponents = [...new Set([0, 1, 2, 3, 4, ...Object.values(ISO_EXPONENT_EXCEPTIONS)])];
  it('minor -> canonical string -> minor is identity for every exponent', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000_000_000, max: 10_000_000_000_000 }), fc.constantFrom(...exponents), (minor, exponent) => {
        const text = formatExportAmount(minor, exponent);
        if (/[,\s]/.test(text)) return false;
        const shape = shapeCell(text);
        const resolved = resolveCell(shape, { convention: '.', exponent });
        if (!resolved.ok) return false;
        const out = toMinor(resolved.negative, resolved.whole, resolved.fraction, exponent);
        return 'minor' in out && out.minor === minor;
      }),
    );
  });
  it('writes the currency own decimals', () => {
    expect(formatExportAmount(2500, 2)).toBe('25.00');
    expect(formatExportAmount(2500, 0)).toBe('2500');
    expect(formatExportAmount(1250, 3)).toBe('1.250');
    expect(formatExportAmount(-5, 2)).toBe('-0.05');
  });
});
