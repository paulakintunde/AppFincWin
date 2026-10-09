import { fetchDismissedOfferKeys, insertDismissedOffers } from '../dismissedOffers';
import { createFakeSupabase } from './fakeSupabase';

describe('dismissed offers', () => {
  it('fetches keys as a set', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ offer_key: 'a' }, { offer_key: 'b' }], error: null, status: 200 });
    await expect(fetchDismissedOfferKeys(client)).resolves.toEqual(new Set(['a', 'b']));
  });

  it('upserts with ignoreDuplicates', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 201 });
    await insertDismissedOffers(client, ['a', 'b']);
    expect(client.calls.find((c) => c.method === 'upsert')?.args).toEqual([
      [{ offer_key: 'a' }, { offer_key: 'b' }],
      { onConflict: 'owner_id,offer_key', ignoreDuplicates: true },
    ]);
  });

  it('rejects oversize batches and keys before any call', async () => {
    const client = createFakeSupabase();
    await expect(
      insertDismissedOffers(client, Array.from({ length: 51 }, (_, i) => `k${i}`))
    ).rejects.toBeInstanceOf(RangeError);
    await expect(insertDismissedOffers(client, ['x'.repeat(301)])).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });
});
