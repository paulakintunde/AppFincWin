import { fromParts, setCategoryParts, toParts } from '../categoryParts';
import { createFakeSupabase } from './fakeSupabase';

describe('toParts / fromParts', () => {
  it('maps stored parts to engine parts and back', () => {
    const stored = [{ c: 'a', a: -3000 }, { c: null, a: -2000, l: 'taxTip' as const }];
    const parts = toParts(stored);
    expect(parts).toEqual([
      { categoryId: 'a', amount: -3000, label: null },
      { categoryId: null, amount: -2000, label: 'taxTip' },
    ]);
    expect(fromParts(parts!)).toEqual(stored);
  });

  it('keeps null as null', () => {
    expect(toParts(null)).toBeNull();
  });
});

describe('setCategoryParts', () => {
  it('sends the stored shape and a null keep-as', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ok: true, version: 4, before: { parts: null, category_id: 'x' } }, error: null, status: 200 });
    const res = await setCategoryParts(client, {
      id: 't1',
      expectedVersion: 3,
      parts: [{ categoryId: 'a', amount: -3000 }, { categoryId: 'b', amount: -2000 }],
    });
    expect(res).toEqual({ ok: true, version: 4, before: { parts: null, category_id: 'x' } });
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'set_category_parts',
      {
        p_id: 't1',
        p_expected_version: 3,
        p_parts: [{ c: 'a', a: -3000 }, { c: 'b', a: -2000 }],
        p_keep_as: null,
      },
    ]);
  });

  it('sends null parts with the category to keep, and returns a refusal untouched', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ok: false, reason: 'version_conflict', current_version: 5, updated_by: 'u2' }, error: null, status: 200 });
    const res = await setCategoryParts(client, { id: 't1', expectedVersion: 3, parts: null, keepAs: 'cat-1' });
    expect(res).toEqual({ ok: false, reason: 'version_conflict', current_version: 5, updated_by: 'u2' });
    expect((client.calls[0]?.args[1] as Record<string, unknown>)).toMatchObject({ p_parts: null, p_keep_as: 'cat-1' });
  });
});
