import { fetchHouseholdSpendRule, setHouseholdSpendRule } from '../householdSpendRules';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const fail = { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 };

describe('household spend rule db (08.1-22)', () => {
  it('reads the saved row for the household', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ household_id: 'h1', rule: 'bring', setup: null, shares: null, version: 1 }));
    expect(await fetchHouseholdSpendRule(client, 'h1')).toMatchObject({ rule: 'bring', version: 1 });
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
  });

  it('returns null when no rule is saved', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok(null));
    expect(await fetchHouseholdSpendRule(client, 'h1')).toBeNull();
  });

  it('throws a read error', async () => {
    const client = createFakeSupabase();
    client.respondWith(fail);
    await expect(fetchHouseholdSpendRule(client, 'h1')).rejects.toBeDefined();
  });

  it('sends the rule through the RPC and returns the result untouched', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, version: 2 }));
    expect(await setHouseholdSpendRule(client, { rule: 'custom', setup: 'mixed', shares: { a: 60, b: 40 }, expectedVersion: 1 })).toEqual({ ok: true, version: 2 });
    expect(client.calls[0]?.args).toEqual(['set_household_spend_rule', { p_rule: 'custom', p_setup: 'mixed', p_shares: { a: 60, b: 40 }, p_expected_version: 1 }]);
  });

  it.each(['not_member', 'too_few', 'invalid_rule', 'invalid_setup', 'members_mismatch', 'invalid_share', 'all_zero', 'not_100', 'version_conflict'])('passes the refusal %s through', async (reason) => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: false, reason }));
    expect(await setHouseholdSpendRule(client, { rule: 'bring', setup: null, shares: null, expectedVersion: null })).toEqual({ ok: false, reason });
  });

  it('a missing session raises', async () => {
    const client = createFakeSupabase();
    client.respondWith(fail);
    await expect(setHouseholdSpendRule(client, { rule: 'bring', setup: null, shares: null, expectedVersion: null })).rejects.toBeDefined();
  });
});
