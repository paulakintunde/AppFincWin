// 10.1-15 (SCN-02): what kind of row is this?
import { classifyRow } from '../keywords';

describe('10.1-15 classifyRow', () => {
  it.each([
    ['TOTAL $29.63', 'total'],
    ['AMOUNT DUE', 'total'],
    ['BALANCE DUE 12.00', 'total'],
    ['Grand Total', 'total'],
    ['To pay', 'total'],
    ['TOTAL WITH TIP', 'total'],
    ['SUBTOTAL', 'subtotal'],
    ['Sub Total', 'subtotal'],
    ['Sub-total', 'subtotal'],
    ['SALES TAX 8.25%', 'tax'],
    ['GST 5%', 'tax'],
    ['HST 13%', 'tax'],
    ['PST', 'tax'],
    ['QST', 'tax'],
    ['VAT 20% INCL', 'tax'],
    ['TIP 18%', 'tip'],
    ['Gratuity', 'tip'],
    ['Service charge', 'tip'],
    ['MEMBER DISCOUNT 5%', 'discount'],
    ['COUPON', 'discount'],
    ['Savings', 'discount'],
    ['Promo', 'discount'],
    ['You saved', 'discount'],
    ['CASH', 'payment'],
    ['VISA ****1234', 'payment'],
    ['Mastercard', 'payment'],
    ['AMEX', 'payment'],
    ['DEBIT', 'payment'],
    ['Credit card', 'payment'],
    ['Tendered', 'payment'],
    ['AUTH 123456', 'payment'],
    ['CHANGE DUE', 'change'],
    ['Change', 'change'],
    ['CASHEWS 4.99', 'item'],
    ['TAXI TOY', 'item'],
    ['Cardamom', 'item'],
  ])('%s is %s', (text, kind) => {
    expect(classifyRow(text)).toBe(kind);
  });
});
