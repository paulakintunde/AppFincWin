// 10.1-15 (SCN-02): prices into integer minor units, no floats.
import fc from 'fast-check';
import { parsePriceToMinor, rowPrice } from '../amounts';

describe('10.1-15 parsePriceToMinor', () => {
  it.each([
    ['12.50', 2, 1250],
    ['1,234.56', 2, 123456],
    ['1.234,56', 2, 123456],
    ['12,50', 2, 1250],
    ['$ 3.99', 2, 399],
    ['$3.99', 2, 399],
    ['£13.45', 2, 1345],
    ['29,63€', 2, 2963],
    ['(2.00)', 2, -200],
    ['2.00-', 2, -200],
    ['-2.50', 2, -250],
    ['-$2.50', 2, -250],
    ['500', 0, 500],
    ['1,234', 0, 1234],
    ['1.500', 3, 1500],
    ['0.05', 2, 5],
  ])('%s at exponent %i is %i', (token, exp, out) => {
    expect(parsePriceToMinor(token, exp)).toBe(out);
  });
  it.each([
    ['12.505', 2],
    ['1.234', 2],
    ['1,234', 2],
    ['500', 2],
    ['12.50', 0],
    ['1.234.56', 2],
    ['1,23,456.00', 2],
    ['12,34.56', 2],
    ['abc', 2],
    ['', 2],
    ['--1.00', 2],
    ['(1.00', 2],
    ['17:56', 2],
    ['#12345', 2],
    ['1.2KG', 2],
    ['12.5', 2],
    ['1234567890123.45', 2],
  ])('%s at exponent %i is not a price', (token, exp) => {
    expect(parsePriceToMinor(token, exp)).toBeNull();
  });
  it('round-trips any non-negative amount written as w.ff or w,ff', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999_999 }), (n) => {
        const w = Math.trunc(n / 100);
        const f = String(n % 100).padStart(2, '0');
        expect(parsePriceToMinor(`${w}.${f}`, 2)).toBe(n);
        expect(parsePriceToMinor(`${w},${f}`, 2)).toBe(n);
      }),
    );
  });
});

describe('10.1-15 rowPrice', () => {
  it('takes the price at the end of the row', () => {
    expect(rowPrice('EGGS LARGE 12 4.99', 2)).toEqual({ amount: 499, negative: false, token: '4.99', ambiguous: false });
    expect(rowPrice('2 x 11.84 23.68', 2)).toEqual({ amount: 2368, negative: false, token: '23.68', ambiguous: false });
  });
  it('joins a loose currency symbol or minus sign, and skips a trailing symbol', () => {
    expect(rowPrice('TOTAL $ 29.63', 2)?.amount).toBe(2963);
    expect(rowPrice('Gesamt 29,63 €', 2)).toEqual({ amount: 2963, negative: false, token: '29,63', ambiguous: false });
    expect(rowPrice('COUPON - 1.50', 2)).toEqual({ amount: 150, negative: true, token: '-1.50', ambiguous: false });
    expect(rowPrice('COUPON -1.50', 2)?.negative).toBe(true);
  });
  it('is null when the row does not end in a price', () => {
    expect(rowPrice('11/03/2026 17:56 #12345', 2)).toBeNull();
    expect(rowPrice('ITEMS SOLD 6', 2)).toBeNull();
    expect(rowPrice('ORANGE JUICE 1.75 L', 2)).toBeNull();
    expect(rowPrice('', 2)).toBeNull();
    expect(rowPrice('€', 2)).toBeNull();
  });
  it('repairs letter O read for zero and a split decimal, marking the price ambiguous', () => {
    expect(rowPrice('BREAD 1O.5O', 2)).toEqual({ amount: 1050, negative: false, token: '1O.5O', ambiguous: true });
    expect(rowPrice('BREAD 12. 50', 2)).toEqual({ amount: 1250, negative: false, token: '12. 50', ambiguous: true });
    expect(rowPrice('BREAD 12 .50', 2)).toEqual({ amount: 1250, negative: false, token: '12 .50', ambiguous: true });
    expect(rowPrice('BREAD OO', 2)).toBeNull();
  });
});
