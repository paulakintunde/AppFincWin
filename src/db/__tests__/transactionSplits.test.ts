import { DbError } from '../errors';
import {
  applyRuleToUnsettled,
  bulkShareTransactions,
  countUnsettledForRule,
  deleteMyLineCategory,
  fetchOpenSharedLines,
  fetchSplitDefaults,
  fetchSplitsForLines,
  makeLinePrivate,
  setLineSplit,
  setPaidBy,
  setSplitDefault,
  shareTransaction,
  upsertMyLineCategory,
} from '../transactionSplits';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('transactionSplits reads', () => {
  it('reads stored splits in chunks of 100 line ids', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ transaction_id: 'a', share: -500 }]));
    client.respondWith(ok([{ transaction_id: 'z', share: -100 }]));
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const rows = await fetchSplitsForLines(client, ids);
    expect(rows).toHaveLength(2);
    const ins = client.calls.filter((c) => c.method === 'in');
    expect(ins).toHaveLength(2);
    expect((ins[0]?.args[1] as string[]).length).toBe(100);
    expect((ins[1]?.args[1] as string[]).length).toBe(1);
    expect(client.calls.find((c) => c.method === 'select')?.table).toBe('transaction_splits');
  });

  it('reads the split defaults of a household', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ id: 'd1', rule: 'even', category_ref: null }]));
    expect(await fetchSplitDefaults(client, 'h1')).toHaveLength(1);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
  });

  it('reads shared lines that are not settle-up records, paging until a short page', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok(Array.from({ length: 1000 }, (_, i) => ({ id: `l${i}` }))));
    client.respondWith(ok([{ id: 'last' }]));
    const rows = await fetchOpenSharedLines(client, 'h1');
    expect(rows).toHaveLength(1001);
    const eqs = client.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['is_shared', true]);
    expect(eqs).toContainEqual(['is_settlement', false]);
    expect(client.calls.filter((c) => c.method === 'range').map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('writes and deletes only the caller own category row', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok(null));
    client.respondWith(ok(null));
    await upsertMyLineCategory(client, { transaction_id: 't', user_id: 'u', household_id: 'h', category_id: 'c' });
    await deleteMyLineCategory(client, 't', 'u');
    expect(client.calls.find((c) => c.method === 'upsert')?.args[1]).toEqual({ onConflict: 'transaction_id,user_id' });
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['transaction_id', 't'],
      ['user_id', 'u'],
    ]);
  });

  it('sends a read error through toDbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    await expect(fetchSplitDefaults(client, 'h1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('transactionSplits RPC wrappers', () => {
  const calls = (client: ReturnType<typeof createFakeSupabase>) => client.calls.filter((c) => c.method === 'rpc').map((c) => c.args);

  it('calls each 08-10 RPC by its server name and argument names', async () => {
    const client = createFakeSupabase();
    for (let i = 0; i < 9; i += 1) client.respondWith(ok({ ok: true }));
    await shareTransaction(client, { id: 't1', expectedVersion: 2, rule: 'weight', participants: ['a', 'b'], seriesScope: 'series' });
    await bulkShareTransactions(client, ['t1', 't2'], 'even');
    await makeLinePrivate(client, 't1', 3);
    await setLineSplit(client, { id: 't1', expectedVersion: 3, rule: 'amount', participants: ['a'], amounts: { a: -100 } });
    await setPaidBy(client, 't1', 3, 'b');
    await setSplitDefault(client, 'builtin:Groceries', 'mine', 4);
    await setSplitDefault(client, null, 'even');
    await countUnsettledForRule(client, null);
    await applyRuleToUnsettled(client, 'custom:c1');
    expect(calls(client)).toEqual([
      ['share_transaction', { p_id: 't1', p_expected_version: 2, p_rule: 'weight', p_participants: ['a', 'b'], p_amounts: null, p_series_scope: 'series' }],
      ['bulk_share_transactions', { p_ids: ['t1', 't2'], p_rule: 'even' }],
      ['make_line_private', { p_id: 't1', p_expected_version: 3 }],
      ['set_line_split', { p_id: 't1', p_expected_version: 3, p_rule: 'amount', p_participants: ['a'], p_amounts: { a: -100 } }],
      ['set_paid_by', { p_id: 't1', p_expected_version: 3, p_user: 'b' }],
      ['set_split_default', { p_category_ref: 'builtin:Groceries', p_rule: 'mine', p_expected_version: 4 }],
      ['set_split_default', { p_category_ref: null, p_rule: 'even', p_expected_version: null }],
      ['count_unsettled_for_rule', { p_category_ref: null }],
      ['apply_rule_to_unsettled', { p_category_ref: 'custom:c1' }],
    ]);
  });

  it('defaults a share to one line, the household default rule, and no amounts', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true }));
    await shareTransaction(client, { id: 't1', expectedVersion: 1 });
    expect(calls(client)[0]?.[1]).toEqual({ p_id: 't1', p_expected_version: 1, p_rule: null, p_participants: null, p_amounts: null, p_series_scope: 'one' });
  });

  it('returns a refusal untouched and throws a transport error through toDbError', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: false, reason: 'version_conflict', current_version: 5, updated_by: 'u2' }));
    expect(await makeLinePrivate(client, 't1', 1)).toEqual({ ok: false, reason: 'version_conflict', current_version: 5, updated_by: 'u2' });
    client.respondWith({ data: null, error: { message: 'boom', code: '' }, status: 0 });
    await expect(setPaidBy(client, 't1', 1, 'b')).rejects.toBeInstanceOf(DbError);
  });
});
