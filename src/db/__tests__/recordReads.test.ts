import { DbError } from '../errors';
import { fetchAccountBalances, fetchHouseholdMemberNames, fetchTransactionMonths } from '../recordReads';
import { createFakeSupabase } from './fakeSupabase';

describe('fetchAccountBalances', () => {
  it('calls rpc(account_balances, {p_household_id}) and keeps paid_sum/pending_sum as strings', async () => {
    const client = createFakeSupabase();
    const rows = [
      { account_id: 'a1', currency: 'GBP', paid_sum: '-500000', pending_sum: '10000' },
      { account_id: 'a2', currency: 'USD', paid_sum: '0', pending_sum: '0' },
    ];
    client.respondWith({ data: rows, error: null, status: 200 });

    const result = await fetchAccountBalances(client, 'hh-1');

    expect(result).toEqual(rows);
    expect(typeof result[0]?.paid_sum).toBe('string');
    expect(typeof result[0]?.pending_sum).toBe('string');
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual(['account_balances', { p_household_id: 'hh-1' }]);
  });

  it('returns an empty array when no rows are found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchAccountBalances(client, 'hh-1')).resolves.toEqual([]);
  });

  it('throws a DbError on an rpc error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchAccountBalances(client, 'hh-1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('fetchTransactionMonths', () => {
  it('calls rpc(transaction_months, {p_household_id}) and returns {month, row_count}[]', async () => {
    const client = createFakeSupabase();
    const rows = [
      { month: '2026-09', row_count: 42 },
      { month: '2026-08', row_count: 30 },
    ];
    client.respondWith({ data: rows, error: null, status: 200 });

    const result = await fetchTransactionMonths(client, 'hh-1');

    expect(result).toEqual(rows);
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual(['transaction_months', { p_household_id: 'hh-1' }]);
  });

  it('returns an empty array when no rows are found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchTransactionMonths(client, 'hh-1')).resolves.toEqual([]);
  });

  it('throws a DbError on an rpc error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchTransactionMonths(client, 'hh-1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('fetchHouseholdMemberNames', () => {
  it('selects user_id, display_name from household_members filtered by household_id', async () => {
    const client = createFakeSupabase();
    const rows = [
      { user_id: 'u1', display_name: 'Sam' },
      { user_id: 'u2', display_name: null },
    ];
    client.respondWith({ data: rows, error: null, status: 200 });

    const result = await fetchHouseholdMemberNames(client, 'hh-1');

    expect(result).toEqual(rows);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe('user_id, display_name');
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'hh-1']);
  });

  it('returns an empty array when no rows are found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchHouseholdMemberNames(client, 'hh-1')).resolves.toEqual([]);
  });

  it('throws a DbError on a query error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchHouseholdMemberNames(client, 'hh-1')).rejects.toBeInstanceOf(DbError);
  });
});
