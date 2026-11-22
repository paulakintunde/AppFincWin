import { fetchJointAccountMonth, fetchJointBalances, fetchJointPurposes, setJointAccountPurpose } from '../jointAccounts';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const fail = { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 };

describe('joint accounts db (08.1-22)', () => {
  it('reads the live joint accounts of the household with their purpose', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ id: 'j1', joint_purpose: 'bills' }]));
    expect(await fetchJointPurposes(client, 'h1')).toEqual([{ id: 'j1', joint_purpose: 'bills' }]);
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([['household_id', 'h1'], ['is_shared', true]]);
  });

  it('C-CR-02: leaves out deleted, tombstone (a departed member) and archived joint accounts', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([]));
    await fetchJointPurposes(client, 'h1');
    expect(client.calls.filter((c) => c.method === 'is').map((c) => c.args)).toEqual([
      ['deleted_at', null],
      ['tombstone_of', null],
      ['archived_at', null],
    ]);
  });

  it('treats no rows and a null body as an empty list, and a read error throws', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok(null));
    expect(await fetchJointPurposes(client, 'h1')).toEqual([]);
    client.respondWith(fail);
    await expect(fetchJointPurposes(client, 'h1')).rejects.toBeDefined();
  });

  it('turns the string balances into numbers', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ account_id: 'j1', balance: '350000', currency: 'USD' }]));
    expect(await fetchJointBalances(client, 'h1')).toEqual([{ account_id: 'j1', balance: 350000, currency: 'USD' }]);
    expect(client.calls[0]?.args).toEqual(['joint_account_balances', { p_household_id: 'h1' }]);
    client.respondWith(ok(null));
    expect(await fetchJointBalances(client, 'h1')).toEqual([]);
    client.respondWith(fail);
    await expect(fetchJointBalances(client, 'h1')).rejects.toBeDefined();
  });

  it('reads the month totals with per-member pay-ins as numbers', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ account_id: 'j1', currency: 'USD', money_in: '500000', money_out: 300000, paid_in_by: { u1: '300000', u2: 200000 } }, { account_id: 'j2', currency: 'USD', money_in: 0, money_out: 0, paid_in_by: null }]));
    expect(await fetchJointAccountMonth(client, 'h1', '2026-11-01', '2026-12-01')).toEqual([
      { account_id: 'j1', currency: 'USD', money_in: 500000, money_out: 300000, paid_in_by: { u1: 300000, u2: 200000 } },
      { account_id: 'j2', currency: 'USD', money_in: 0, money_out: 0, paid_in_by: {} },
    ]);
    expect(client.calls[0]?.args).toEqual(['joint_account_month', { p_household_id: 'h1', p_from: '2026-11-01', p_to: '2026-12-01' }]);
    client.respondWith(ok(null));
    expect(await fetchJointAccountMonth(client, 'h1', 'a', 'b')).toEqual([]);
    client.respondWith(fail);
    await expect(fetchJointAccountMonth(client, 'h1', 'a', 'b')).rejects.toBeDefined();
  });

  it.each(['not_member', 'not_joint', 'invalid_purpose', 'version_conflict'])('passes the purpose refusal %s through', async (reason) => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: false, reason }));
    expect(await setJointAccountPurpose(client, { accountId: 'j1', purpose: 'bills', spendable: false, expectedVersion: 3 })).toEqual({ ok: false, reason });
    expect(client.calls[0]?.args).toEqual(['set_joint_account_purpose', { p_account: 'j1', p_purpose: 'bills', p_spendable: false, p_expected_version: 3, p_safety_net: false }]);
  });

  // 08.1-23 (Q10): the safety-net mark rides the same RPC (migration 20261125000800).
  it('sends the safety-net mark', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, version: 4 }));
    await setJointAccountPurpose(client, { accountId: 'j1', purpose: 'savings', spendable: false, safetyNet: true, expectedVersion: null });
    expect(client.calls[0]?.args).toEqual(['set_joint_account_purpose', { p_account: 'j1', p_purpose: 'savings', p_spendable: false, p_expected_version: null, p_safety_net: true }]);
  });
});
