// 10.1-24 (SCN-02/03/05, D-12, D-16, D-20): the review draft.
import type { ParseOutcome, ParsedReceipt, ReceiptItem } from '@/engine/receipt';
import {
  addItem,
  applyItemsTotal,
  applyReceiptTotal,
  canConfirm,
  draftSignature,
  fromParsed,
  removeExtra,
  removeItem,
  reviewBalance,
  setDate,
  setExtraAmount,
  setItemCategory,
  setItemName,
  setItemPrice,
  setStore,
  setTotal,
  toPrivateSave,
  type FromParsedContext,
  type ReviewDraft,
} from '../scanModel';

const item = (name: string, price: number, extra: Partial<ReceiptItem> = {}): ReceiptItem => ({
  key: name,
  name,
  price,
  discount: 0,
  unsure: false,
  frame: null,
  ...extra,
});

function receipt(over: Partial<ParsedReceipt> = {}): ParsedReceipt {
  return {
    store: { value: 'Corner Market', unsure: false },
    date: { value: '2026-11-20', unsure: false },
    total: { value: 1620, unsure: false },
    items: [item('Bread', 1000), item('Soap', 500)],
    extras: [{ key: 'tax', kind: 'tax', name: 'Tax', amount: 120, unsure: false, frame: null }],
    currency: 'USD',
    ...over,
  };
}

const ok = (r: ParsedReceipt): ParseOutcome => ({ readable: true, receipt: r });

const suggest: FromParsedContext['suggest'] = (name) =>
  name === 'Bread' ? { categoryId: 'groceries', source: 'item' } : name === 'Soap' ? { categoryId: 'household', source: 'store' } : { categoryId: null, source: 'none' };

const ctx = (over: Partial<FromParsedContext> = {}): FromParsedContext => ({ mode: 'new', images: [{ uri: 'file://a.jpg', mime: 'image/jpeg' }], suggest, ...over });

describe('fromParsed', () => {
  it('gives each item the suggested category, likely when it came from the item or the store', () => {
    const d = fromParsed(ok(receipt({ items: [item('Bread', 1000), item('Soap', 500), item('Widget', 120)] })), ctx());
    expect(d.items.map((i) => [i.name, i.categoryId, i.likely])).toEqual([
      ['Bread', 'groceries', true],
      ['Soap', 'household', true],
      ['Widget', null, false],
    ]);
    expect(d.store.value).toBe('Corner Market');
    expect(d.extras).toHaveLength(1);
    expect(d.totalChoice).toBeNull();
  });

  it('opens empty for an unreadable or missing reading (D-18)', () => {
    const bad: ParseOutcome = { readable: false, receipt: receipt({ items: [], extras: [], total: { value: null, unsure: true } }) };
    const n = fromParsed(bad, ctx());
    expect(n.items).toEqual([]);
    expect(n.extras).toEqual([]);
    expect(n.total).toEqual({ value: null, unsure: true });
    const e = fromParsed(null, ctx({ mode: 'existing', lineTotal: -2599 }));
    expect(e.items).toEqual([]);
    expect(e.total).toEqual({ value: 2599, unsure: false });
    expect(e.store.value).toBeNull();
  });

  it('existing mode keeps the line total', () => {
    const d = fromParsed(ok(receipt()), ctx({ mode: 'existing', lineTotal: -1700, lineCategoryId: 'groceries' }));
    expect(d.total.value).toBe(1700);
    expect(d.taxTipCategoryId).toBe('groceries');
  });

  it('puts each framed item back on its page', () => {
    const r = receipt({
      items: [item('Bread', 1000, { frame: { left: 10, top: 100, width: 300, height: 30 } }), item('Soap', 500, { frame: { left: 10, top: 2100, width: 300, height: 30 } })],
    });
    const d = fromParsed(ok(r), ctx({ pageOffsets: [{ page: 0, top: 0 }, { page: 1, top: 2000 }] }));
    expect(d.items[0]).toMatchObject({ page: 0, frame: { top: 100 } });
    expect(d.items[1]).toMatchObject({ page: 1, frame: { top: 100 } });
  });
});

describe('balance and confirm', () => {
  const base = (total: number | null): ReviewDraft => fromParsed(ok(receipt({ total: { value: total, unsure: false } })), ctx());

  it('matches 1000 + 500 + 120 = 1620 and is short 80 against 1700', () => {
    expect(reviewBalance(base(1620)).state).toBe('match');
    const b = reviewBalance(base(1700));
    expect(b.state).toBe('short');
    expect(b.diff).toBe(-80);
  });

  it('blocks confirm with the right reason', () => {
    expect(canConfirm({ ...base(1620), items: [] })).toEqual({ ok: false, reason: 'noItems' });
    const d = base(1620);
    expect(canConfirm(setItemPrice(d, d.items[0]!.key, null))).toEqual({ ok: false, reason: 'emptyPrice' });
    expect(canConfirm(base(null))).toEqual({ ok: false, reason: 'noTotal' });
    expect(canConfirm(base(1700))).toEqual({ ok: false, reason: 'mismatch' });
    expect(canConfirm(base(1620))).toEqual({ ok: true });
  });

  it('Use the receipt total adds an Other item for the gap', () => {
    const d = applyReceiptTotal(base(1700), 'Other');
    expect(canConfirm(d)).toEqual({ ok: true });
    expect(d.totalChoice).toBe('receipt');
    expect(d.items.find((i) => i.name === 'Other')?.price).toBe(80);
    expect(d.total.value).toBe(1700);
  });

  it('Use the receipt total adds an Other discount when the items are over', () => {
    const d = applyReceiptTotal(base(1600));
    expect(d.extras.find((x) => x.name === 'Other')).toMatchObject({ kind: 'discount', amount: 20 });
    expect(canConfirm(d)).toEqual({ ok: true });
  });

  it('Use the receipt total does nothing without a total and only marks a match', () => {
    const none = base(null);
    expect(applyReceiptTotal(none)).toBe(none);
    expect(applyReceiptTotal(base(1620)).items).toHaveLength(2);
  });

  it('Use the items total sets the total to 1620', () => {
    const d = applyItemsTotal(base(1700));
    expect(d.total.value).toBe(1620);
    expect(d.totalChoice).toBe('items');
    expect(canConfirm(d)).toEqual({ ok: true });
  });
});

describe('toPrivateSave', () => {
  it('splits a -1620 line into Groceries, Household and Tax and tip', () => {
    const d = fromParsed(ok(receipt()), ctx({ lineCategoryId: 'shopping' }));
    const s = toPrivateSave(d, -1, 'shopping');
    expect(s.total).toBe(1620);
    expect(s.parts).toEqual([
      { categoryId: 'groceries', amount: -1000 },
      { categoryId: 'household', amount: -500 },
      { categoryId: 'shopping', amount: -120, label: 'taxTip' },
    ]);
    expect(s.categoryId).toBe('groceries');
  });

  it('one category and no tax keeps one category and no parts', () => {
    const d = fromParsed(ok(receipt({ items: [item('Bread', 1000), item('Bread', 500)], extras: [], total: { value: 1500, unsure: false } })), ctx());
    expect(toPrivateSave(d, -1, 'other')).toEqual({ total: 1500, parts: null, categoryId: 'groceries' });
  });

  it('falls back to the line category when no item has one', () => {
    const d = fromParsed(ok(receipt({ items: [item('Widget', 900)], extras: [], total: { value: null, unsure: true } })), ctx());
    expect(toPrivateSave(d, -1, 'other')).toEqual({ total: 900, parts: null, categoryId: 'other' });
  });
});

describe('edits', () => {
  it('edit helpers change only what they name and clear the unsure mark', () => {
    let d = fromParsed(ok(receipt()), ctx());
    const first = d.items[0]!.key;
    const sig = draftSignature(d);
    d = setStore(d, '  ');
    expect(d.store).toEqual({ value: null, unsure: false });
    d = setStore(d, 'Shop');
    d = setDate(d, '2026-11-21');
    d = setTotal(d, 2000);
    expect(d.totalChoice).toBeNull();
    d = setItemName(d, first, 'Rye bread');
    d = setItemCategory(d, first, 'bakery');
    expect(d.items[0]).toMatchObject({ name: 'Rye bread', categoryId: 'bakery', likely: false });
    expect(setItemName(d, 'nope', 'x')).toBe(d);
    d = addItem(d, 'Milk');
    expect(d.items[2]).toMatchObject({ name: 'Milk', price: null, categoryId: 'household' });
    d = removeItem(d, d.items[2]!.key);
    expect(removeItem(d, 'nope')).toBe(d);
    const tax = d.extras[0]!.key;
    d = setExtraAmount(d, tax, 130);
    expect(d.extras[0]!.amount).toBe(130);
    expect(setExtraAmount(d, 'nope', 1)).toBe(d);
    expect(canConfirm(setExtraAmount(d, tax, null))).toEqual({ ok: false, reason: 'emptyPrice' });
    d = removeExtra(d, tax);
    expect(d.extras).toEqual([]);
    expect(removeExtra(d, 'nope')).toBe(d);
    expect(draftSignature(d)).not.toBe(sig);
  });

  it('a new item on an empty review takes the line category', () => {
    const d = addItem(fromParsed(null, ctx({ lineCategoryId: 'food' })));
    expect(d.items[0]!.categoryId).toBe('food');
  });
});
