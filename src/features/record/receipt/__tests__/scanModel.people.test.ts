// 10.1-26 (SCN-06, SCN-07; D-14, D-15, D-20): people on each review item, the live share preview, and what a split by item sends.
import type { ParsedReceipt } from '@/engine/receipt';
import {
  addItem,
  applyReceiptTotal,
  draftSignature,
  fromParsed,
  resetToUsual,
  setByItem,
  sharesPreview,
  toItemSplitSave,
  togglePerson,
  withMembers,
  withUsualPeople,
  type ReviewDraft,
} from '../scanModel';

const MEMBERS = [
  { id: 'A', name: 'Alex' },
  { id: 'B', name: 'Sam' },
  { id: 'C', name: 'Kim' },
];

const receipt = (over: Partial<ParsedReceipt> = {}): ParsedReceipt => ({
  store: { value: 'Corner Market', unsure: false },
  date: { value: '2026-11-20', unsure: false },
  total: { value: 2420, unsure: false },
  items: [
    { key: 'a', name: 'Bread', price: 1000, discount: 0, unsure: false, frame: null },
    { key: 'b', name: 'Soap', price: 500, discount: 0, unsure: false, frame: null },
    { key: 'c', name: 'Milk', price: 700, discount: 0, unsure: false, frame: null },
  ],
  extras: [{ key: 't', kind: 'tax', name: 'Tax', amount: 220, unsure: false, frame: null }],
  currency: 'USD',
  ...over,
});

const suggest = (name: string) => ({ categoryId: name === 'Soap' ? 'household' : 'groceries', source: 'item' });

function base(r: ParsedReceipt = receipt()): ReviewDraft {
  return fromParsed({ readable: true, receipt: r }, { mode: 'existing', images: [], suggest, lineTotal: -2420, lineCategoryId: 'shopping' });
}
const keys = (d: ReviewDraft) => d.items.map((i) => i.key) as [string, string, string];

describe('private line', () => {
  it('has no people anywhere and no preview people', () => {
    const d = base();
    expect(d.members).toBeNull();
    expect(d.byItem).toBe(false);
    expect(d.items.every((i) => i.people === null)).toBe(true);
    expect(addItem(d).items.at(-1)!.people).toBeNull();
    const [k] = keys(d);
    expect(togglePerson(d, k, 'A')).toBe(d);
    expect(setByItem(d, true)).toBe(d);
    expect(withUsualPeople(d, ['A'])).toBe(d);
  });

  it('toItemSplitSave on a private draft never invents people', () => {
    expect(toItemSplitSave(base(), -1, 'shopping').items.every((i) => i.people.length === 0)).toBe(true);
  });
});

describe('people on items (D-14)', () => {
  it('every item starts on the usual people, in member order, and by item starts on', () => {
    const d = withMembers(base(), MEMBERS, ['B', 'A']);
    expect(d.members).toEqual(MEMBERS);
    expect(d.byItem).toBe(true);
    expect(d.usual).toEqual(['A', 'B']);
    expect(d.items.map((i) => i.people)).toEqual([
      ['A', 'B'],
      ['A', 'B'],
      ['A', 'B'],
    ]);
  });

  it('an empty or unknown usual list falls back to every member', () => {
    expect(withMembers(base(), MEMBERS, []).items[0]!.people).toEqual(['A', 'B', 'C']);
    expect(withMembers(base(), MEMBERS, ['Z']).items[0]!.people).toEqual(['A', 'B', 'C']);
  });

  it('togglePerson takes a person off and puts them back in member order, but never the last one', () => {
    let d = withMembers(base(), MEMBERS, ['A', 'B']);
    const [k] = keys(d);
    d = togglePerson(d, k, 'A');
    expect(d.items[0]!.people).toEqual(['B']);
    expect(togglePerson(d, k, 'B')).toBe(d); // the last person stays
    d = togglePerson(d, k, 'C');
    d = togglePerson(d, k, 'A');
    expect(d.items[0]!.people).toEqual(['A', 'B', 'C']);
    expect(d.items[1]!.people).toEqual(['A', 'B']); // other items untouched
  });

  it('ignores an unknown item or a non-member', () => {
    const d = withMembers(base(), MEMBERS, ['A', 'B']);
    expect(togglePerson(d, 'nope', 'A')).toBe(d);
    expect(togglePerson(d, keys(d)[0], 'Z')).toBe(d);
  });

  it('resetToUsual puts every item back on the usual people', () => {
    let d = withMembers(base(), MEMBERS, ['A', 'B']);
    const [k1, , k3] = keys(d);
    d = togglePerson(togglePerson(d, k1, 'B'), k3, 'A');
    d = resetToUsual(d, ['A', 'B']);
    expect(d.items.every((i) => JSON.stringify(i.people) === '["A","B"]')).toBe(true);
  });

  it('new items (added, or the receipt total Other) start on the usual people', () => {
    const d = withMembers(base(), MEMBERS, ['A', 'C']);
    expect(addItem(d).items.at(-1)!.people).toEqual(['A', 'C']);
    const short = withMembers(base(receipt({ total: { value: 2600, unsure: false } })), MEMBERS, ['A', 'C']);
    expect(applyReceiptTotal(short).items.at(-1)!.people).toEqual(['A', 'C']);
  });

  it('setByItem turns the toggle off and on; the signature changes with people and the toggle', () => {
    const d = withMembers(base(), MEMBERS, ['A', 'B']);
    expect(setByItem(d, false).byItem).toBe(false);
    expect(draftSignature(setByItem(d, false))).not.toBe(draftSignature(d));
    expect(draftSignature(togglePerson(d, keys(d)[0], 'A'))).not.toBe(draftSignature(d));
  });
});

describe('sharesPreview (D-15)', () => {
  it('items 1000 [A], 500 [A,B], 700 [B] with tax 220 give A 1375 and B 1045 (the 10.1-13 example)', () => {
    let d = withMembers(base(), MEMBERS.slice(0, 2), ['A', 'B']);
    const [k1, , k3] = keys(d);
    d = togglePerson(d, k1, 'B');
    d = togglePerson(d, k3, 'A');
    const r = sharesPreview(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shares.map((s) => [s.memberId, s.total])).toEqual([
      ['A', 1375],
      ['B', 1045],
    ]);
    expect(r.shares.reduce((s, x) => s + x.total, 0)).toBe(2420);
  });

  it('a member with no items shows a total of 0', () => {
    const d = withMembers(base(), MEMBERS, ['A', 'B']);
    const r = sharesPreview(d);
    expect(r.ok && r.shares.find((s) => s.memberId === 'C')).toMatchObject({ total: 0, itemCount: 0 });
  });

  it('discounts and tips are shared in proportion too, and the shares add up exactly', () => {
    const r0 = receipt({
      total: { value: 2333, unsure: false },
      extras: [
        { key: 't', kind: 'tax', name: 'Tax', amount: 101, unsure: false, frame: null },
        { key: 'p', kind: 'tip', name: 'Tip', amount: 132, unsure: false, frame: null },
        { key: 'd', kind: 'discount', name: 'Off', amount: 100, unsure: false, frame: null },
      ],
    });
    const r = sharesPreview(withMembers(base(r0), MEMBERS, ['A', 'B', 'C']));
    expect(r.ok && r.shares.reduce((s, x) => s + x.total, 0)).toBe(2333);
  });
});

describe('toItemSplitSave', () => {
  it('sends items with their people and categories, the extras, and the parts with a Tax and tip part (D-20)', () => {
    let d = withMembers(base(), MEMBERS, ['A', 'B']);
    d = togglePerson(d, keys(d)[1], 'A');
    const save = toItemSplitSave(d, -1, 'shopping');
    expect(save.items).toEqual([
      { name: 'Bread', price: 1000, discount: 0, c: 'groceries', people: ['A', 'B'] },
      { name: 'Soap', price: 500, discount: 0, c: 'household', people: ['B'] },
      { name: 'Milk', price: 700, discount: 0, c: 'groceries', people: ['A', 'B'] },
    ]);
    expect(save.extras).toEqual({ tax: 220, tip: 0, discounts: 0 });
    expect(save.parts).toEqual([
      { categoryId: 'groceries', amount: -1700 },
      { categoryId: 'household', amount: -500 },
      { categoryId: 'shopping', amount: -220, label: 'taxTip' },
    ]);
    expect(save.category).toBeNull();
    expect(save.store).toBe('Corner Market');
    expect(save.date).toBe('2026-11-20');
  });

  it('one category and no extras: no parts, the category is sent instead', () => {
    const r0 = receipt({
      total: { value: 1000, unsure: false },
      items: [{ key: 'a', name: 'Bread', price: 1000, discount: 0, unsure: false, frame: null }],
      extras: [],
    });
    const save = toItemSplitSave(withMembers(base(r0), MEMBERS, ['A']), -1, 'shopping');
    expect(save.parts).toBeNull();
    expect(save.category).toBe('groceries');
  });
});
