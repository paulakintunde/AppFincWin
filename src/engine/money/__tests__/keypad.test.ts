import fc from 'fast-check';
import { applyKey, type KeypadContext, type KeypadKey } from '../keypad';
import { parseAmount } from '../parseAmount';
import { MAX_ABS_AMOUNT_MINOR } from '../types';

const ctx = (exponent: number, decimalSeparator = '.'): KeypadContext => ({ exponent, decimalSeparator });
const ctx2 = ctx(2);

describe('applyKey', () => {
  it('handles leading zeros and decimal start', () => {
    expect(applyKey('', '0', ctx2)).toBe('0');
    expect(applyKey('0', '0', ctx2)).toBe('0');
    expect(applyKey('0', '5', ctx2)).toBe('5');
    expect(applyKey('', 'decimal', ctx2)).toBe('0.');
    expect(applyKey('', 'decimal', ctx(2, ','))).toBe('0,');
  });
  it('caps decimals at the exponent', () => {
    expect(applyKey('12.3', '4', ctx2)).toBe('12.34');
    expect(applyKey('12.34', '5', ctx2)).toBe('12.34');
    expect(applyKey('1.234', '5', ctx(3))).toBe('1.234');
    expect(applyKey('1.23', '4', ctx(3))).toBe('1.234');
  });
  it('ignores decimal for exponent 0 and a second separator', () => {
    expect(applyKey('12', 'decimal', ctx(0))).toBe('12');
    expect(applyKey('12.', 'decimal', ctx2)).toBe('12.');
    expect(applyKey('12', 'decimal', ctx2)).toBe('12.');
  });
  it('backspace and clear', () => {
    expect(applyKey('12.3', 'backspace', ctx2)).toBe('12.');
    expect(applyKey('12.', 'backspace', ctx2)).toBe('12');
    expect(applyKey('5', 'backspace', ctx2)).toBe('');
    expect(applyKey('', 'backspace', ctx2)).toBe('');
    expect(applyKey('12.3', 'clear', ctx2)).toBe('');
    expect(applyKey('12::', 'backspace', ctx(2, '::'))).toBe('12');
  });
  it('ignores digits past the cap', () => {
    const big = String(MAX_ABS_AMOUNT_MINOR / 100);
    expect(applyKey(big, '0', ctx2)).toBe(big);
    expect(applyKey(big, 'decimal', ctx2)).toBe(`${big}.`);
    expect(applyKey('5', '0', { ...ctx2, maxMinor: 600 })).toBe('5');
    expect(applyKey('5', '0', { ...ctx(0), maxMinor: 100 })).toBe('50');
  });

  const keys: KeypadKey[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'decimal', 'backspace', 'clear'];
  it('property: output always parses, respects exponent, one separator', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 2, 3),
        fc.constantFrom('en-GB', 'de-DE', 'fr-FR'),
        fc.array(fc.constantFrom(...keys), { maxLength: 40 }),
        (exponent, locale, seq) => {
          const sep = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')!.value;
          const c = ctx(exponent, sep);
          let text = '';
          for (const k of seq) {
            const next = applyKey(text, k, c);
            if (k !== 'backspace' && k !== 'clear' && k !== 'decimal' && text !== '0' && next !== text) {
              expect(applyKey(next, 'backspace', c)).toBe(text);
            }
            text = next;
            expect(text.split(sep).length).toBeLessThanOrEqual(2);
            expect((text.split(sep)[1] ?? '').length).toBeLessThanOrEqual(exponent);
            expect(text).not.toMatch(/^0\d/);
            if (text !== '') {
              const trimmed = text.endsWith(sep) ? text.slice(0, -sep.length) : text;
              expect(parseAmount(trimmed, { locale, exponent }).ok).toBe(true);
            }
          }
        }
      )
    );
  });
});
