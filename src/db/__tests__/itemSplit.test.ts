// 10.1-26: the split-by-item RPC wrappers send the server's p_* names exactly and hand the answer back untouched.
import { restoreLineSplit, setSplitByItem, type ItemSplitBefore } from '../itemSplit';
import { createFakeSupabase } from './fakeSupabase';

const ITEMS = [
  { name: 'Oat milk', price: 1000, discount: 0, c: 'cat-a', people: ['u1'] },
  { name: 'Bread', price: 500, discount: 100, c: 'cat-b', people: ['u1', 'u2'] },
];
const BEFORE: ItemSplitBefore = {
  split: { rule: 'even', participants: ['u1', 'u2'], shares: { u1: 700, u2: 700 } },
  rule: 'even',
  manual: false,
  parts: null,
  category_id: 'cat-a',
  item_split: null,
};

describe('setSplitByItem', () => {
  it('maps every argument to its p_* name and sends parts in the stored shape', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ok: true, version: 5, before: BEFORE, shares: { u1: 1000, u2: 400 } }, error: null, status: 200 });
    const res = await setSplitByItem(client, {
      id: 't1',
      expectedVersion: 4,
      items: ITEMS,
      extras: { tax: 0, tip: 0, discounts: 0 },
      parts: [
        { categoryId: 'cat-a', amount: -1000 },
        { categoryId: 'cat-b', amount: -400 },
      ],
      category: null,
      store: 'Corner shop',
      date: '2026-11-20',
    });
    expect(res).toEqual({ ok: true, version: 5, before: BEFORE, shares: { u1: 1000, u2: 400 } });
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'set_split_by_item',
      {
        p_id: 't1',
        p_expected_version: 4,
        p_items: ITEMS,
        p_extras: { tax: 0, tip: 0, discounts: 0 },
        p_parts: [
          { c: 'cat-a', a: -1000 },
          { c: 'cat-b', a: -400 },
        ],
        p_category: null,
        p_store: 'Corner shop',
        p_date: '2026-11-20',
      },
    ]);
  });

  it('sends null parts with the category, defaults the optional fields to null, and returns a refusal untouched', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ok: false, reason: 'version_conflict', current_version: 6, updated_by: 'u2' }, error: null, status: 200 });
    const res = await setSplitByItem(client, {
      id: 't1',
      expectedVersion: 4,
      items: ITEMS,
      extras: { tax: 120, tip: 0, discounts: 20 },
      parts: null,
      category: 'cat-a',
    });
    expect(res).toEqual({ ok: false, reason: 'version_conflict', current_version: 6, updated_by: 'u2' });
    expect(client.calls[0]?.args[1]).toMatchObject({
      p_parts: null,
      p_category: 'cat-a',
      p_store: null,
      p_date: null,
      p_extras: { tax: 120, tip: 0, discounts: 20 },
    });
  });
});

describe('restoreLineSplit', () => {
  it('sends the before-state as p_before with the version', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ok: true, version: 6 }, error: null, status: 200 });
    const res = await restoreLineSplit(client, 't1', 5, BEFORE);
    expect(res).toEqual({ ok: true, version: 6 });
    expect(client.calls[0]?.args).toEqual(['restore_line_split', { p_id: 't1', p_expected_version: 5, p_before: BEFORE }]);
  });
});
