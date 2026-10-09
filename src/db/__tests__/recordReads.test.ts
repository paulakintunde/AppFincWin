import { DbError } from '../errors';
import {
  MonthNotAddableError,
  addActivityMonth,
  fetchAccountBalances,
  fetchAccountPaidBefore,
  fetchAccountPendingSplit,
  fetchHouseholdMemberNames,
  fetchTransactionMonths,
} from '../recordReads';
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

describe('Phase 02.2 reads', () => {
  const undo = { id: 'u1', labelKey: 'monthAdded' as const, labelParams: { name: 'Oct' } };

  it('fetchAccountPendingSplit maps rows and keeps sums as strings', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: [{ account_id: 'a1', currency: 'GBP', pending_in: '100', pending_out: '-250', pending_count: 3 }],
      error: null,
      status: 200,
    });
    await expect(fetchAccountPendingSplit(client, 'hh')).resolves.toEqual([
      { accountId: 'a1', currency: 'GBP', pendingIn: '100', pendingOut: '-250', pendingCount: 3 },
    ]);
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual(['account_pending_split', { p_household_id: 'hh' }]);
  });

  it('fetchAccountPaidBefore maps rows', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: [{ account_id: 'a1', currency: 'USD', paid_sum: '5', paid_home_sum: '4', unconverted: 1 }],
      error: null,
      status: 200,
    });
    await expect(fetchAccountPaidBefore(client, 'hh', '2026-10-01')).resolves.toEqual([
      { accountId: 'a1', currency: 'USD', paidSum: '5', paidHomeSum: '4', unconverted: 1 },
    ]);
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'account_paid_before',
      { p_household_id: 'hh', p_before: '2026-10-01' },
    ]);
  });

  it('rejects a malformed split row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ account_id: 'a1' }], error: null, status: 200 });
    await expect(fetchAccountPendingSplit(client, 'hh')).rejects.toMatchObject({ code: 'bad-response' });
  });

  it('addActivityMonth sends the undo step and maps applied, already-applied and 22023', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: { status: 'applied', month: '2026-11', inserted: ['t1'], undo_step_id: 'u1' },
      error: null,
      status: 200,
    });
    client.respondWith({ data: { status: 'already-applied' }, error: null, status: 200 });
    client.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    const args = { householdId: 'hh', month: '2026-11', today: '2026-10-09', undo };
    await expect(addActivityMonth(client, args)).resolves.toEqual({
      status: 'applied',
      month: '2026-11',
      insertedIds: ['t1'],
      undoStepId: 'u1',
    });
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'add_activity_month',
      {
        p_household_id: 'hh',
        p_month: '2026-11',
        p_today: '2026-10-09',
        p_undo_step: { id: 'u1', label_key: 'monthAdded', label_params: { name: 'Oct' } },
      },
    ]);
    await expect(addActivityMonth(client, args)).resolves.toEqual({ status: 'already-applied' });
    await expect(addActivityMonth(client, args)).rejects.toBeInstanceOf(MonthNotAddableError);
  });

  it('fetchTransactionMonths returns row counts (ACT-15)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ month: '2026-10', row_count: 7 }], error: null, status: 200 });
    await expect(fetchTransactionMonths(client, 'hh')).resolves.toEqual([{ month: '2026-10', row_count: 7 }]);
  });
});
