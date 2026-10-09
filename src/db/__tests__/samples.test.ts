import { clearSampleData, fetchSampleDataExists, seedSampleData } from '../samples';
import { createFakeSupabase } from './fakeSupabase';

describe('sample data wrappers', () => {
  it('seedSampleData calls the rpc and validates status', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied', transactions: 12 }, error: null, status: 200 });
    client.respondWith({ data: { status: 'nope' }, error: null, status: 200 });
    await expect(seedSampleData(client, 'hh', '2026-10-09')).resolves.toEqual({
      status: 'applied',
      counts: { transactions: 12 },
    });
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'seed_sample_data',
      { p_household_id: 'hh', p_today: '2026-10-09' },
    ]);
    await expect(seedSampleData(client, 'hh', '2026-10-09')).rejects.toMatchObject({ code: 'bad-response' });
  });

  it('clearSampleData returns counts and rejects bad shapes', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: { status: 'applied', transactions: 5, series: 1, accounts: 1, categories: 2, kept: 0 },
      error: null,
      status: 200,
    });
    client.respondWith({ data: { status: 'applied' }, error: null, status: 200 });
    await expect(clearSampleData(client, 'hh')).resolves.toEqual({
      transactions: 5,
      series: 1,
      accounts: 1,
      categories: 2,
      kept: 0,
    });
    await expect(clearSampleData(client, 'hh')).rejects.toMatchObject({ code: 'bad-response' });
  });

  it('fetchSampleDataExists requires a boolean', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: true, error: null, status: 200 });
    client.respondWith({ data: 'yes', error: null, status: 200 });
    await expect(fetchSampleDataExists(client, 'hh')).resolves.toBe(true);
    await expect(fetchSampleDataExists(client, 'hh')).rejects.toMatchObject({ code: 'bad-response' });
  });
});
