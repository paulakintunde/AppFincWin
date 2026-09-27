import fc from 'fast-check';
import {
  parseCsvDate,
  inferDateFormat,
  inferDecimalMark,
  inferNumberNotation,
  notationFor,
  type DateFormat,
} from '../inferFormat';
import type { NumberNotation } from '../../money';

describe('parseCsvDate', () => {
  it('parses a DMY date', () => {
    expect(parseCsvDate('13/09/2026', 'DMY')).toBe('2026-09-13');
  });

  it('rejects an invalid calendar date (31 February)', () => {
    expect(parseCsvDate('31/02/2026', 'DMY')).toBeNull();
  });

  it('drops a T-separated time part before parsing', () => {
    expect(parseCsvDate('2026-09-13T10:22:00', 'YMD')).toBe('2026-09-13');
  });

  it('parses dot-separated 2-digit-year dates', () => {
    expect(parseCsvDate('1.9.26', 'DMY')).toBe('2026-09-01');
  });

  it('reads an English month abbreviation regardless of declared format', () => {
    expect(parseCsvDate('13-Sep-2026', 'DMY')).toBe('2026-09-13');
  });

  it('reads a full English month name', () => {
    expect(parseCsvDate('13-September-2026', 'DMY')).toBe('2026-09-13');
  });

  it('returns null for unparseable input', () => {
    expect(parseCsvDate('hello', 'DMY')).toBeNull();
    expect(parseCsvDate('', 'DMY')).toBeNull();
    expect(parseCsvDate('12/2026', 'DMY')).toBeNull();
  });

  it('returns null when a part is not all-digits and not a month name', () => {
    expect(parseCsvDate('13/xx/2026', 'DMY')).toBeNull();
  });

  it('returns null for an out-of-range month number', () => {
    expect(parseCsvDate('09/13/2026', 'DMY')).toBeNull(); // month=13 under DMY roles
  });

  it('rejects a year outside 1900..2100', () => {
    expect(parseCsvDate('13/09/1899', 'DMY')).toBeNull();
    expect(parseCsvDate('13/09/2101', 'DMY')).toBeNull();
  });

  it('drops a space-separated time part', () => {
    expect(parseCsvDate('13/09/2026 10:22', 'DMY')).toBe('2026-09-13');
  });
});

describe('inferDateFormat', () => {
  it('is certain YMD for ISO-shaped dates', () => {
    expect(inferDateFormat(['2026-09-01', '2026-09-15'])).toEqual({ kind: 'certain', format: 'YMD' });
  });

  it('is certain DMY when a day exceeds 12', () => {
    expect(inferDateFormat(['13/09/2026', '01/09/2026'])).toEqual({ kind: 'certain', format: 'DMY' });
  });

  it('is certain MDY when a "day" position exceeds 12 under DMY reading', () => {
    expect(inferDateFormat(['09/13/2026'])).toEqual({ kind: 'certain', format: 'MDY' });
  });

  it('is ambiguous when both DMY and MDY fit every sample', () => {
    expect(inferDateFormat(['01/02/2026', '03/04/2026'])).toEqual({
      kind: 'ambiguous',
      candidates: ['DMY', 'MDY'],
    });
  });

  it('is none for unparseable samples', () => {
    expect(inferDateFormat(['hello'])).toEqual({ kind: 'none' });
  });

  it('is none for an empty sample list', () => {
    expect(inferDateFormat([])).toEqual({ kind: 'none' });
  });

  it('ignores empty samples when inferring', () => {
    expect(inferDateFormat(['', '2026-09-01', '  '])).toEqual({ kind: 'certain', format: 'YMD' });
  });
});

describe('inferDecimalMark', () => {
  it('is certain "." when both separators appear with "." last', () => {
    expect(inferDecimalMark(['12.50', '1,234.56'])).toEqual({ kind: 'certain', mark: '.' });
  });

  it('is certain "," when both separators appear with "," last', () => {
    expect(inferDecimalMark(['12,50', '1.234,56'])).toEqual({ kind: 'certain', mark: ',' });
  });

  it('is ambiguous for a single grouped-looking sample with no other evidence', () => {
    expect(inferDecimalMark(['1,234'])).toEqual({ kind: 'ambiguous' });
  });

  it('is ambiguous for a sample with no separator at all', () => {
    expect(inferDecimalMark(['1234'])).toEqual({ kind: 'ambiguous' });
  });

  it('is certain "." for a signed sample with a clear 1-digit decimal', () => {
    expect(inferDecimalMark(['-3.5'])).toEqual({ kind: 'certain', mark: '.' });
  });

  it('ignores sign/currency/DR-CR/parentheses decorations during inference', () => {
    expect(inferDecimalMark(['(£1,234.56) DR'])).toEqual({ kind: 'certain', mark: '.' });
  });

  it('is ambiguous on a tie between conflicting single-separator samples', () => {
    expect(inferDecimalMark(['12.5', '12,5'])).toEqual({ kind: 'ambiguous' });
  });
});

describe('inferNumberNotation', () => {
  it('is certain western "." / "," for a classic US-style sample set', () => {
    expect(inferNumberNotation(['1,234.56', '12.50'])).toEqual({
      kind: 'certain',
      notation: { decimal: '.', group: ',', grouping: 'western' },
    });
  });

  it('is certain western "," / "." for a classic EU-style sample set', () => {
    expect(inferNumberNotation(['1.234,56', '12,50'])).toEqual({
      kind: 'certain',
      notation: { decimal: ',', group: '.', grouping: 'western' },
    });
  });

  it('recognises plain-space, NBSP or narrow-NBSP grouping', () => {
    expect(inferNumberNotation(['1 234,56', '12,50'])).toEqual({
      kind: 'certain',
      notation: { decimal: ',', group: ' ', grouping: 'western' },
    });
    expect(inferNumberNotation(['1 234,56', '12,50'])).toEqual({
      kind: 'certain',
      notation: { decimal: ',', group: ' ', grouping: 'western' },
    });
    expect(inferNumberNotation(['1 234,56', '12,50'])).toEqual({
      kind: 'certain',
      notation: { decimal: ',', group: ' ', grouping: 'western' },
    });
  });

  it('recognises straight and curly apostrophe grouping', () => {
    expect(inferNumberNotation(["1'234.50", '1’234.50'])).toEqual({
      kind: 'certain',
      notation: { decimal: '.', group: "'", grouping: 'western' },
    });
  });

  it('is certain Indian grouping for a lakh/crore sample set', () => {
    expect(inferNumberNotation(['12,34,567.00', '1,00,000.00'])).toEqual({
      kind: 'certain',
      notation: { decimal: '.', group: ',', grouping: 'indian' },
    });
  });

  it('flags mixed grouping when both western-deep and Indian shapes appear', () => {
    expect(inferNumberNotation(['1,234,567.00', '12,34,567.00'])).toEqual({
      kind: 'mixed-grouping',
      notation: { decimal: '.', group: ',', grouping: 'western' },
    });
  });

  it('is certain with the default group "," for a single unambiguous decimal sample', () => {
    expect(inferNumberNotation(['12.50'])).toEqual({
      kind: 'certain',
      notation: { decimal: '.', group: ',', grouping: 'western' },
    });
  });

  it('is ambiguous with both notation candidates for an undecidable sample', () => {
    expect(inferNumberNotation(['1234'])).toEqual({
      kind: 'ambiguous',
      candidates: [notationFor('.'), notationFor(',')],
    });
  });

  it('ignores sign/currency/DR-CR/parentheses decorations during inference', () => {
    expect(inferNumberNotation(['(£1,234.56) DR', '12.50'])).toEqual({
      kind: 'certain',
      notation: { decimal: '.', group: ',', grouping: 'western' },
    });
  });
});

describe('notationFor', () => {
  it('maps "." to western comma-grouping', () => {
    expect(notationFor('.')).toEqual({ decimal: '.', group: ',', grouping: 'western' });
  });

  it('maps "," to western dot-grouping', () => {
    expect(notationFor(',')).toEqual({ decimal: ',', group: '.', grouping: 'western' });
  });
});

describe('inferFormat: no device-locale usage (D-11 file-neutral inference)', () => {
  it('never imports Intl/navigator/getLocales (structural — covered by acceptance grep too)', () => {
    // A behavioural companion to the acceptance-criteria grep: two files whose sample
    // would read oppositely under en-US vs en-IN Intl grouping both still resolve from
    // their own digits alone.
    expect(inferNumberNotation(['1,234,567.00'])).toEqual({
      kind: 'certain',
      notation: { decimal: '.', group: ',', grouping: 'western' },
    });
    expect(inferNumberNotation(['12,34,567.00'])).toEqual({
      kind: 'certain',
      notation: { decimal: '.', group: ',', grouping: 'indian' },
    });
  });
});

// --- Properties (fast-check) ---

function render(year: number, month: number, day: number, format: DateFormat): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  if (format === 'YMD') return `${y}/${m}/${d}`;
  if (format === 'DMY') return `${d}/${m}/${y}`;
  return `${m}/${d}/${y}`;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

describe('parseCsvDate: round-trip property (fast-check)', () => {
  it('recovers year/month/day for any valid date and any format', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1901, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom<DateFormat>('YMD', 'DMY', 'MDY'),
        (year, month, format) => {
          const maxDay = month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
          fc.assert(
            fc.property(fc.integer({ min: 1, max: maxDay }), (day) => {
              const rendered = render(year, month, day, format);
              const expected = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              expect(parseCsvDate(rendered, format)).toBe(expected);
            }),
            { numRuns: 5 }
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('inferDateFormat: property — a day > 12 always disambiguates DMY (fast-check)', () => {
  it('returns certain DMY whenever at least one rendered sample has a day > 12', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1901, max: 2099 }),
        fc.array(fc.integer({ min: 13, max: 28 }), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 1, max: 12 }),
        (year, days, month) => {
          const samples = days.map((day) => render(year, month, day, 'DMY'));
          expect(inferDateFormat(samples)).toEqual({ kind: 'certain', format: 'DMY' });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- inferNumberNotation round-trip property ---

const NOTATION_FAMILIES: readonly NumberNotation[] = [
  { decimal: '.', group: ',', grouping: 'western' },
  { decimal: ',', group: '.', grouping: 'western' },
  { decimal: ',', group: ' ', grouping: 'western' },
  { decimal: '.', group: "'", grouping: 'western' },
  { decimal: '.', group: ',', grouping: 'indian' },
];

function groupInteger(digits: string, notation: NumberNotation): string {
  if (notation.grouping === 'indian') {
    if (digits.length <= 3) return digits;
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    const groups: string[] = [];
    let remaining = rest;
    while (remaining.length > 2) {
      groups.unshift(remaining.slice(-2));
      remaining = remaining.slice(0, -2);
    }
    if (remaining.length > 0) groups.unshift(remaining);
    return [...groups, last3].join(notation.group);
  }
  // western: groups of 3 from the right
  const groups: string[] = [];
  let remaining = digits;
  while (remaining.length > 3) {
    groups.unshift(remaining.slice(-3));
    remaining = remaining.slice(0, -3);
  }
  if (remaining.length > 0) groups.unshift(remaining);
  return groups.join(notation.group);
}

function renderMagnitude(m: number, notation: NumberNotation): string {
  const s = String(m);
  const whole = s.length > 3 ? groupInteger(s, notation) : s;
  return `${whole}${notation.decimal}50`;
}

describe('inferNumberNotation: round-trip property (fast-check)', () => {
  it('recovers the rendering notation for every family, given 10 samples including one >= 1,000,000', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NOTATION_FAMILIES),
        fc.array(fc.integer({ min: 0, max: 999_999 }), { minLength: 9, maxLength: 9 }),
        fc.integer({ min: 1_000_000, max: 999_999_999 }),
        (notation, smallMagnitudes, bigMagnitude) => {
          const samples = [...smallMagnitudes, bigMagnitude].map((m) => renderMagnitude(m, notation));
          const result = inferNumberNotation(samples);
          expect(result.kind).toBe('certain');
          if (result.kind === 'certain') {
            expect(result.notation).toEqual(notation);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
