import { fetchHoldsFlags } from '../holdsData';
import { createFakeSupabase } from './fakeSupabase';

const yes = { data: [{ id: 'x' }], error: null, status: 200 };
const no = { data: [], error: null, status: 200 };

describe('fetchHoldsFlags (09-22)', () => {
  it('asks for one id per probe, scoped to the household and the active view', async () => {
    const client = createFakeSupabase();
    for (const r of [yes, no, yes, no]) client.respondWith(r);
    await expect(fetchHoldsFlags(client, 'hh1')).resolves.toEqual({
      transfers: true,
      importedLines: false,
      weightSplits: true,
      amountSplits: false,
    });
    expect(client.calls.filter((c) => c.method === 'limit').every((c) => c.args[0] === 1)).toBe(true);
    expect(client.calls.filter((c) => c.table !== undefined).every((c) => c.table === 'transactions_active')).toBe(true);
    expect(client.calls.filter((c) => c.method === 'eq' && c.args[0] === 'household_id')).toHaveLength(4);
    expect(client.calls.some((c) => c.method === 'not' && c.args[0] === 'transfer_id')).toBe(true);
    expect(client.calls.some((c) => c.method === 'not' && c.args[0] === 'import_batch_id')).toBe(true);
    expect(client.calls.some((c) => c.method === 'eq' && c.args[0] === 'split_rule' && c.args[1] === 'amount')).toBe(true);
  });

  it('throws a db error when a read fails', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom' }, status: 500 });
    for (let i = 0; i < 3; i++) client.respondWith(no);
    await expect(fetchHoldsFlags(client, 'hh1')).rejects.toBeDefined();
  });
});
