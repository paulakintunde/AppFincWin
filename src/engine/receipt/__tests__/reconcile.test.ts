// 10.1-15 (D-12): do items, tax and tip, less discounts, add up to the total?
import { reconcile } from '../reconcile';
import type { ReceiptExtra, ReceiptItem } from '../types';

const item = (price: number, discount = 0): ReceiptItem => ({ key: 'i', name: 'x', price, discount, unsure: false, frame: null });
const ex = (kind: ReceiptExtra['kind'], amount: number): ReceiptExtra => ({ key: 'x', kind, name: kind, amount, unsure: false, frame: null });

describe('10.1-15 reconcile', () => {
  it('matches, falls short, runs over, or has no total', () => {
    const items = [item(1000), item(500)];
    const extras = [ex('tax', 120)];
    expect(reconcile({ items, extras, total: { value: 1620, unsure: false } })).toEqual({ itemsTotal: 1500, extrasNet: 120, computed: 1620, total: 1620, diff: 0, state: 'match' });
    expect(reconcile({ items, extras, total: { value: 1700, unsure: false } })).toMatchObject({ diff: -80, state: 'short' });
    expect(reconcile({ items, extras, total: { value: 1600, unsure: false } })).toMatchObject({ diff: 20, state: 'over' });
    expect(reconcile({ items, extras, total: { value: null, unsure: true } })).toEqual({ itemsTotal: 1500, extrasNet: 120, computed: 1620, total: null, diff: null, state: 'noTotal' });
  });
  it('takes item discounts, tips and receipt discounts into account', () => {
    const r = reconcile({ items: [item(1000, 150)], extras: [ex('tip', 200), ex('discount', 50)], total: { value: 1000, unsure: false } });
    expect(r).toMatchObject({ itemsTotal: 850, extrasNet: 150, computed: 1000, state: 'match' });
  });
});
