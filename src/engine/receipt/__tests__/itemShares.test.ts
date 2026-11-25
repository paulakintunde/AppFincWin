// 10.1-13 (D-14, D-15): shares between people.
import fc from 'fast-check';
import { itemShares } from '../itemShares';

const M = ['A', 'B'];
describe('10.1-13 itemShares', () => {
  it('shares items and tax in proportion', () => {
    const r = itemShares({ members: M, items: [{ price: 1000, discount: 0, people: ['A'] }, { price: 500, discount: 0, people: ['A', 'B'] }, { price: 700, discount: 0, people: ['B'] }], tax: 220, tip: 0, discounts: 0 });
    expect(r).toEqual({
      ok: true,
      shares: [{ memberId: 'A', items: 1250, extras: 125, total: 1375, itemCount: 2 }, { memberId: 'B', items: 950, extras: 95, total: 1045, itemCount: 2 }],
    });
  });
  it('odd cents go to the lowest index in the item people order', () => {
    const r = itemShares({ members: M, items: [{ price: 1001, discount: 0, people: ['A', 'B'] }], tax: 0, tip: 0, discounts: 0 });
    expect(r.ok && r.shares.map((s) => s.total)).toEqual([501, 500]);
    const r2 = itemShares({ members: M, items: [{ price: 1001, discount: 0, people: ['B', 'A'] }], tax: 0, tip: 0, discounts: 0 });
    expect(r2.ok && r2.shares.map((s) => s.total)).toEqual([500, 501]);
  });
  it('a person without items gets nothing; nobody with items is refused', () => {
    const r = itemShares({ members: M, items: [{ price: 300, discount: 0, people: ['A'] }], tax: 100, tip: 0, discounts: 0 });
    expect(r.ok && r.shares[1]).toEqual({ memberId: 'B', items: 0, extras: 0, total: 0, itemCount: 0 });
    expect(itemShares({ members: M, items: [], tax: 100, tip: 0, discounts: 0 })).toEqual({ ok: false, reason: 'no_items' });
    const none = itemShares({ members: M, items: [], tax: 0, tip: 0, discounts: 0 });
    expect(none.ok && none.shares.map((s) => s.total)).toEqual([0, 0]);
  });
  it('refuses an item with nobody on it or an unknown person', () => {
    expect(itemShares({ members: M, items: [{ price: 1, discount: 0, people: [] }], tax: 0, tip: 0, discounts: 0 })).toEqual({ ok: false, reason: 'empty_item' });
    expect(itemShares({ members: M, items: [{ price: 1, discount: 0, people: ['Z'] }], tax: 0, tip: 0, discounts: 0 })).toEqual({ ok: false, reason: 'unknown_member' });
  });
  it('discounts larger than tax and tip share negatively and still add up', () => {
    const r = itemShares({ members: M, items: [{ price: 600, discount: 0, people: ['A'] }, { price: 400, discount: 0, people: ['B'] }], tax: 10, tip: 0, discounts: 110 });
    expect(r.ok && r.shares.map((s) => s.extras)).toEqual([-60, -40]);
    expect(r.ok && r.shares.reduce((s, x) => s + x.total, 0)).toBe(900);
  });
  it('property: shares sum to net items + tax + tip - discounts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ price: fc.integer({ min: 1, max: 9000 }), d: fc.nat(50), who: fc.subarray(['A', 'B', 'C'], { minLength: 1 }) }), { minLength: 1, maxLength: 6 }),
        fc.nat(800), fc.nat(800), fc.nat(500),
        (rows, tax, tip, discounts) => {
          const items = rows.map((r) => ({ price: r.price, discount: Math.min(r.d, r.price), people: r.who }));
          const r = itemShares({ members: ['A', 'B', 'C'], items, tax, tip, discounts });
          if (!r.ok) return true;
          const net = items.reduce((s, x) => s + x.price - x.discount, 0);
          return r.shares.reduce((s, x) => s + x.total, 0) === net + tax + tip - discounts;
        },
      ),
    );
  });
});
