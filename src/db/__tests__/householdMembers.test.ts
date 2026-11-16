import { fetchHouseholdMembers, setMemberWeights, setMyMemberDisplay } from '../householdMembers';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('household members db', () => {
  it('reads members in join order', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ user_id: 'a' }]));
    expect(await fetchHouseholdMembers(client, 'h1')).toEqual([{ user_id: 'a' }]);
    const methods = client.calls.map((c) => c.method);
    expect(methods).toContain('order');
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['created_at', { ascending: true }]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
  });

  it('returns an ok result and a refusal untouched', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, version: 2 }));
    client.respondWith(ok({ ok: false, reason: 'not_100' }));
    expect(
      await setMyMemberDisplay(client, { expectedVersion: 1, colourKey: 2, nameHidden: false, displayName: 'Sam' }),
    ).toEqual({ ok: true, version: 2 });
    expect(await setMemberWeights(client, { a: 60, b: 50 }, { a: 1, b: 1 })).toEqual({ ok: false, reason: 'not_100' });
    expect(client.calls[0]?.args).toEqual([
      'set_my_member_display',
      { p_expected_version: 1, p_colour_key: 2, p_name_hidden: false, p_display_name: 'Sam' },
    ]);
    expect(client.calls[1]?.args).toEqual([
      'set_member_weights',
      { p_weights: { a: 60, b: 50 }, p_expected_versions: { a: 1, b: 1 } },
    ]);
  });
});
