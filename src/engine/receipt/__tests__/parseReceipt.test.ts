// 10.1-15 (SCN-02, SCN-03, D-11, D-18): receipt text into store, date, total, items, tax, tip and discounts.
import { parseReceipt, type ParseOptions } from '../parseReceipt';
import { reconcile } from '../reconcile';
import type { ReceiptOcr, ReceiptOcrLine } from '../types';

const USD: ParseOptions = { currency: 'USD', dateOrder: 'MDY', today: '2026-11-25' };
const ocr = (texts: string[]): ReceiptOcr => ({ lines: texts.map((text) => ({ text, frame: null })), imageWidth: null, imageHeight: null });
const read = (texts: string[], opts: ParseOptions = USD) => {
  const out = parseReceipt(ocr(texts), opts);
  if (!out.readable) throw new Error('unreadable');
  return out.receipt;
};
const names = (texts: string[]) => read(texts).items.map((i) => [i.name, i.price, i.discount, i.unsure]);

describe('10.1-15 parseReceipt', () => {
  it('reads a grocery receipt: items, tax, total; the card line is dropped', () => {
    const r = read(['HARVEST LANE', '12 MAIN ST', 'TEL 555-555-5555', '11/20/2026 17:52', 'BANANAS 1.29', 'MILK 2L 3.89', 'BREAD 5.49', 'SUBTOTAL 10.67', 'SALES TAX 8.25% 0.88', 'TOTAL $11.55', 'VISA ****1234 11.55', 'AUTH 123456', 'THANK YOU']);
    expect(r.store).toEqual({ value: 'HARVEST LANE', unsure: false });
    expect(r.date).toEqual({ value: '2026-11-20', unsure: false });
    expect(r.total).toEqual({ value: 1155, unsure: false });
    expect(r.items).toEqual([
      { key: 'i0', name: 'BANANAS', price: 129, discount: 0, unsure: false, frame: null },
      { key: 'i1', name: 'MILK 2L', price: 389, discount: 0, unsure: false, frame: null },
      { key: 'i2', name: 'BREAD', price: 549, discount: 0, unsure: false, frame: null },
    ]);
    expect(r.extras).toEqual([{ key: 'x0', kind: 'tax', name: 'SALES TAX 8.25%', amount: 88, unsure: false, frame: null }]);
    expect(r.currency).toBe('USD');
    expect(reconcile(r).state).toBe('match');
  });

  it('a tip written after the total becomes a tip, and the total with tip is the total', () => {
    const r = read(['LUNA', 'Pizza 16.50', 'SUBTOTAL 16.50', 'TOTAL 16.50', 'DEBIT 16.50', 'TIP 3.00', 'TOTAL WITH TIP 19.50', 'ITEMS SOLD 1']);
    expect(r.extras.map((x) => [x.kind, x.amount])).toEqual([['tip', 300]]);
    expect(r.total).toEqual({ value: 1950, unsure: false });
    expect(reconcile(r).state).toBe('match');
    // without a printed total with tip, the total is the printed total plus the tip, flagged
    const r2 = read(['LUNA', 'Pizza 16.50', 'TOTAL 16.50', 'TIP 3.00', 'TIP 1.00']);
    expect(r2.total).toEqual({ value: 1950, unsure: true });
    expect(r2.extras.map((x) => [x.kind, x.amount])).toEqual([['tip', 300]]);
    expect(read(['LUNA', 'Pizza 16.50', 'TOTAL 16.50', 'TIP 3.00', 'TOTAL WITH TIP 19.60']).total).toEqual({ value: 1960, unsure: true });
  });

  it('a tip and a later total are ignored when no total was read; a second total is ignored', () => {
    expect(read(['A', 'Pizza 16.50', 'TOTAL', 'TIP 3.00']).total).toEqual({ value: null, unsure: true });
    expect(read(['A', 'Pizza 16.50', 'TOTAL 16.50', 'BALANCE DUE 20.00', 'CHANGE DUE 1.00']).total).toEqual({ value: 1650, unsure: false });
  });

  it('a tip before the total is a tip', () => {
    const r = read(['A', 'Pizza 10.00', 'TIP 18% 1.80', 'AMOUNT DUE $11.80']);
    expect(r.extras).toMatchObject([{ kind: 'tip', amount: 180, name: 'TIP 18%' }]);
    expect(reconcile(r).state).toBe('match');
  });

  it('a minus row under an item is that item’s discount; other discounts are receipt-level', () => {
    expect(names(['A', 'Shampoo 8.99', 'Coupon -1.00', 'Lip Balm 3.49', 'TOTAL 11.48'])).toEqual([['Shampoo', 899, 100, false], ['Lip Balm', 349, 0, false]]);
    const r = read(['A', 'Shampoo 8.99', 'SUBTOTAL 8.99', 'MEMBER DISCOUNT 10% -0.90', 'COUPON 0.10', 'TOTAL 7.99']);
    expect(r.extras.map((x) => [x.kind, x.amount])).toEqual([['discount', 90], ['discount', 10]]);
    expect(read(['A', '-1.00', 'Gum 2.00', 'TOTAL 1.00']).extras).toMatchObject([{ kind: 'discount', amount: 100 }]);
    expect(names(['A', 'Gum 1.00', 'SAVE -2.00', 'TOTAL 0.00'])).toEqual([['Gum', 100, 200, true]]);
    expect(names(['A', 'Gum 3.00', 'SAVE -1O.OO', 'TOTAL 0.00'])).toEqual([['Gum', 300, 1000, true]]);
  });

  it('quantity rows multiply into the item under its name', () => {
    expect(names(['A', 'TEA BAGS 80', '3 x 4.59 13.77', 'PEAS', '2 @ 1.50', 'RICE', '3 x 1.00 4.00', 'TOTAL 21.77'])).toEqual([
      ['TEA BAGS 80', 1377, 0, false],
      ['PEAS', 300, 0, false],
      ['RICE', 400, 0, true],
    ]);
    // a quantity row under an item that already shows the line price is information only
    expect(names(['A', 'ONIONS 6.98', '2 x 3.49', 'TOTAL 6.98'])).toEqual([['ONIONS', 698, 0, false]]);
    // a quantity row with no name above it keeps its own text, flagged
    expect(names(['A', 'MILK 1.00', '2 x 3.49 6.98', 'TOTAL 7.98'])).toEqual([['MILK', 100, 0, false], ['2 x 3.49 6.98', 698, 0, true]]);
    expect(names(['A', '-----', '2 x 3.49 6.98', 'TOTAL 6.98'])).toEqual([['2 x 3.49 6.98', 698, 0, true]]);
  });

  it('a row without a price under an item continues its name', () => {
    expect(names(['A', 'WOOD SCREWS #8 1-1 8.97', '/4IN 100PK', 'GLUE 2.00', 'TOTAL 10.97'])).toEqual([['WOOD SCREWS #8 1-1 /4IN 100PK', 897, 0, false], ['GLUE', 200, 0, false]]);
    // a keyword row or a rule line ends the item
    expect(names(['A', 'GLUE 2.00', '--------', 'TAPE', 'TOTAL 2.00'])).toEqual([['GLUE', 200, 0, false]]);
    expect(names(['A', 'GLUE 2.00', 'SUBTOTAL', 'TAPE', 'TOTAL 2.00'])).toEqual([['GLUE', 200, 0, false]]);
  });

  it('a price on its own row takes the name above it, flagged', () => {
    expect(names(['A', 'GLUE 2.00', 'BIG TAPE', '3.00', 'TOTAL 5.00'])).toEqual([['GLUE', 200, 0, false], ['BIG TAPE', 300, 0, true]]);
    expect(names(['3.00', 'TOTAL 3.00'])).toEqual([['', 300, 0, true]]);
  });

  it('payment and change rows are dropped, even before the total', () => {
    const r = read(['A', 'Gum 1.00', 'CASH 5.00', 'CHANGE 4.00', 'TOTAL 1.00']);
    expect(r.items).toHaveLength(1);
    expect(r.extras).toEqual([]);
  });

  it('an unreadable total falls back to the card amount, flagged; cash tendered never counts', () => {
    expect(read(['A', 'Gum 1.00', 'TOTAL £1.0', 'CASH 5.00', 'VISA ****1234 1.00']).total).toEqual({ value: 100, unsure: true });
    expect(read(['A', 'Gum 1.00', 'TOTAL £1.0', 'CASH 5.00']).total).toEqual({ value: null, unsure: true });
  });

  it('a total read through an OCR slip is flagged', () => {
    expect(read(['A', 'Gum 40.00', 'TOTAL $40-00']).total).toEqual({ value: 4000, unsure: true });
  });

  it('items that do not add up to the subtotal flag the total, unless an item is already flagged', () => {
    expect(read(['A', 'Gum 1.00', 'Mint 2.00', 'SUBTOTAL 4.00', 'TOTAL 4.00']).total).toEqual({ value: 400, unsure: true });
    expect(read(['A', 'Gum 1.0O', 'Mint 2.00', 'SUBTOTAL 4.00', 'TOTAL 4.00']).total).toEqual({ value: 400, unsure: false });
    expect(read(['A', 'Gum 2.00', 'Mint 2.00', 'SUBTOTAL 4.00', 'TOTAL 4.00']).total).toEqual({ value: 400, unsure: false });
  });

  it('no total row: the total is missing and flagged', () => {
    expect(read(['A', 'Gum 1.00']).total).toEqual({ value: null, unsure: true });
  });

  it('no date: today, marked Check this', () => {
    expect(read(['A', 'Gum 1.00', 'TOTAL 1.00']).date).toEqual({ value: '2026-11-25', unsure: true });
  });

  it('the store is the first plain name near the top; flagged unless it is the first row', () => {
    expect(read(['12 MAIN ST', 'SMALL BATCH', 'Gum 1.00', 'TOTAL 1.00']).store).toEqual({ value: 'SMALL BATCH', unsure: true });
    expect(read(['TEL [phone]', 'Nov 14, 2026', 'CHANGE', 'RECEIPT', 'Gum 1.00', 'TOTAL 1.00']).store).toEqual({ value: null, unsure: true });
    expect(read(['-----', 'Gum 1.00', 'TOTAL 1.00']).store).toEqual({ value: null, unsure: true });
    expect(read(['TOTAL 1.00']).store).toEqual({ value: null, unsure: true });
  });

  it('with frames, the store is searched in the top fifth only', () => {
    const ln = (text: string, top: number): ReceiptOcrLine => ({ text, frame: { left: 10, top, width: 200, height: 30 } });
    const lines = [ln('1 KING RD', 0), ln('Gum 1.00', 100), ln('Mint 1.00', 200), ln('Tea 1.00', 300), ln('Pop 1.00', 400), ln('SHOP NAME', 500), ln('TOTAL 4.00', 600)];
    const out = parseReceipt({ lines, imageWidth: 300, imageHeight: 700 }, USD);
    expect(out.receipt.store).toEqual({ value: null, unsure: true });
    const out2 = parseReceipt({ lines: [ln('SHOP NAME', 0), ...lines.slice(1)], imageWidth: 300, imageHeight: 700 }, USD);
    expect(out2.receipt.store).toEqual({ value: 'SHOP NAME', unsure: false });
    expect(out2.receipt.items[0]?.frame).toEqual({ left: 10, top: 100, width: 200, height: 30 });
  });

  it('caps item names at 120 characters', () => {
    const long = 'X'.repeat(200);
    const r = read([long, `${long} 1.00`, long, 'TOTAL 1.00']);
    expect(r.items[0]?.name).toHaveLength(120);
    expect(r.store.value).toHaveLength(120);
  });

  it('reads comma decimals and zero-decimal currencies', () => {
    const eur = read(['CAFE', '17.07.2026', 'Americano 3,50', 'Croissant 3,75', 'TOTAL 7,25 €'], { currency: 'EUR', dateOrder: 'DMY', today: '2026-11-25' });
    expect([eur.total.value, eur.date.value, eur.items.length]).toEqual([725, '2026-07-17', 2]);
    const jpy = read(['KISSA', 'Coffee 500', 'TOTAL 1,200'], { currency: 'JPY', dateOrder: 'YMD', today: '2026-11-25' });
    expect([jpy.total.value, jpy.items[0]?.price]).toEqual([1200, 500]);
  });

  it('a read with no items and no total is unreadable: the empty shell', () => {
    expect(parseReceipt(ocr(['Thank you']), USD)).toEqual({
      readable: false,
      receipt: { store: { value: null, unsure: true }, date: { value: null, unsure: true }, total: { value: null, unsure: true }, items: [], extras: [], currency: 'USD' },
    });
    expect(parseReceipt(ocr([]), USD).readable).toBe(false);
  });
});
