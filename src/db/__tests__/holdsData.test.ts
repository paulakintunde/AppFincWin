import { fetchHoldsFlags } from '../holdsData';
import { createFakeSupabase } from './fakeSupabase';

const yes = { data: [{ id: 'x' }], error: null, status: 200 };
const no = { data: [], error: null, status: 200 };

describe('fetchHoldsFlags (09-22)', () => {
  it('asks for one id per probe, scoped to the household and the active view', async () => {
    const client = createFakeSupabase();
    for (const r of [yes, no, no, yes, no, yes, no, yes]) client.respondWith(r);
    await expect(fetchHoldsFlags(client, 'hh1')).resolves.toEqual({
      transfers: true,
      importedLines: false,
      weightSplits: true,
      amountSplits: false,
      receipts: true,
      splitLines: false,
      itemSplits: true,
    });
    expect(client.calls.filter((c) => c.method === 'limit').every((c) => c.args[0] === 1)).toBe(true);
    expect(client.calls.filter((c) => c.table !== undefined && c.table !== 'import_profiles' && c.table !== 'transaction_receipts').every((c) => c.table === 'transactions_active')).toBe(true);
    expect(client.calls.filter((c) => c.method === 'eq' && c.args[0] === 'household_id')).toHaveLength(6);
    expect(client.calls.some((c) => c.method === 'not' && c.args[0] === 'transfer_id')).toBe(true);
    expect(client.calls.some((c) => c.method === 'not' && c.args[0] === 'import_batch_id')).toBe(true);
    expect(client.calls.some((c) => c.method === 'eq' && c.args[0] === 'split_rule' && c.args[1] === 'amount')).toBe(true);
    expect(client.calls.some((c) => c.table === 'transaction_receipts')).toBe(true);
    expect(client.calls.some((c) => c.method === 'not' && c.args[0] === 'category_parts')).toBe(true);
    expect(client.calls.some((c) => c.method === 'not' && c.args[0] === 'item_split')).toBe(true);
  });

  it('counts a remembered import layout as imported records', async () => {
    const client = createFakeSupabase();
    for (const r of [no, no, yes, no, no, no, no, no]) client.respondWith(r);
    await expect(fetchHoldsFlags(client, 'hh1')).resolves.toMatchObject({ importedLines: true });
    expect(client.calls.some((c) => c.table === 'import_profiles')).toBe(true);
  });

  it('throws a db error when a read fails', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom' }, status: 500 });
    for (let i = 0; i < 7; i++) client.respondWith(no);
    await expect(fetchHoldsFlags(client, 'hh1')).rejects.toBeDefined();
  });
});
