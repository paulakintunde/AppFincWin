import fc from 'fast-check';
import { ofxLocalDate } from '../date';

describe('ofxLocalDate', () => {
  it('reads a bare date with no time or offset', () => {
    expect(ofxLocalDate('20260912')).toBe('2026-09-12');
  });

  it('reads a date with time, milliseconds and a signed named offset', () => {
    expect(ofxLocalDate('20260912120000.000[-5:EST]')).toBe('2026-09-12');
  });

  it('reads a date with midnight time and a fractional signed offset', () => {
    expect(ofxLocalDate('20260912000000[+5.30:IST]')).toBe('2026-09-12');
  });

  it('reads a date with a bare signed offset and no time-zone name', () => {
    expect(ofxLocalDate('20260912000000[-3]')).toBe('2026-09-12');
  });

  it('reads a date with an unsigned offset and a time-zone name', () => {
    expect(ofxLocalDate('20260912235959[0:GMT]')).toBe('2026-09-12');
  });

  it('rejects a month of 13', () => {
    expect(ofxLocalDate('20261312')).toBeNull();
  });

  it('rejects a string shorter than 8 characters', () => {
    expect(ofxLocalDate('2026091')).toBeNull();
  });

  it('rejects a calendar date that does not exist (30 Feb)', () => {
    expect(ofxLocalDate('20260230')).toBeNull();
  });

  it('rejects a malformed trailing time part', () => {
    expect(ofxLocalDate('20260912XX')).toBeNull();
  });

  it('rejects an unterminated offset bracket', () => {
    expect(ofxLocalDate('20260912120000[abc')).toBeNull();
  });

  it('rejects a non-digit first 8 characters', () => {
    expect(ofxLocalDate('2026091A')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(ofxLocalDate('')).toBeNull();
  });

  it('trims surrounding whitespace before reading', () => {
    expect(ofxLocalDate('  20260912  ')).toBe('2026-09-12');
  });

  it('accepts a time part with no fractional seconds and no offset', () => {
    expect(ofxLocalDate('20260912120000')).toBe('2026-09-12');
  });

  it('rejects a time part with a fraction longer than 3 digits', () => {
    expect(ofxLocalDate('20260912120000.0000')).toBeNull();
  });

  it('rejects a bracket offset with more than 2 sign digits', () => {
    expect(ofxLocalDate('20260912000000[+123:IST]')).toBeNull();
  });

  it('rejects a bracket offset with an empty fractional part', () => {
    expect(ofxLocalDate('20260912000000[+5.:IST]')).toBeNull();
  });

  it('rejects a bracket offset with an empty time-zone name', () => {
    expect(ofxLocalDate('20260912000000[+5:]')).toBeNull();
  });

  it('rejects a time part shorter than 6 digits', () => {
    expect(ofxLocalDate('202609121200')).toBeNull();
  });

  it('rejects a bracket that is only one character (unterminated)', () => {
    expect(ofxLocalDate('20260912000000[')).toBeNull();
  });

  it('accepts a lower-case time-zone name inside the offset bracket', () => {
    expect(ofxLocalDate('20260912000000[-5:est]')).toBe('2026-09-12');
  });

  it('rejects a time part with a stray trailing digit that is not a fraction separator', () => {
    expect(ofxLocalDate('202609121200019')).toBeNull();
  });

  it('never leaks input content in a failure -- no-leak', () => {
    const secret = 'DR JONES PHARMACY';
    const result = ofxLocalDate(`XX${secret}`);
    expect(result).toBeNull();
  });

  describe('property: never shifts a day, across every offset form', () => {
    const offsetForms = ['', '[0:GMT]', '[-5:EST]', '[+5.30:IST]', '[-3]', '[+14]'];

    it('holds for every valid date and every offset form, with an arbitrary time', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1900, max: 2400 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }), // 28 is valid in every month, avoiding calendar-length noise
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          fc.integer({ min: 0, max: 59 }),
          fc.constantFrom(...offsetForms),
          (year, month, day, hh, mm, ss, offset) => {
            const y = String(year).padStart(4, '0');
            const m = String(month).padStart(2, '0');
            const d = String(day).padStart(2, '0');
            const expected = `${y}-${m}-${d}`;
            const time = `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}`;
            const raw = `${y}${m}${d}${time}${offset}`;
            expect(ofxLocalDate(raw)).toBe(expected);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
