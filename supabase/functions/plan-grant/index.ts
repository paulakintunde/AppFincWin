// plan-grant (09-07, D-29): operator-only free access for testers and the owner, as RevenueCat promotional entitlements.
// Guarded by its own secret PLAN_GRANT_SECRET (header x-plan-grant-secret); a user JWT is never accepted.
//
// Runbook (values come from the environment, never pasted into a file or chat):
//   Testers at launch, three months, including households that existed before launch:
//     curl -X POST "$SUPABASE_URL/functions/v1/plan-grant" \
//       -H "x-plan-grant-secret: $PLAN_GRANT_SECRET" -H "Content-Type: application/json" \
//       -d '{"mode":"testers","end_time_ms":<launch + 3 months in ms>,"include_prelaunch":true}'
//   Owner, no practical end date:
//     curl -X POST "$SUPABASE_URL/functions/v1/plan-grant" \
//       -H "x-plan-grant-secret: $PLAN_GRANT_SECRET" -H "Content-Type: application/json" \
//       -d '{"mode":"owner","user_id":"<owner user id>"}'
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { fetchSubscriber, isUuid, toSnapshot } from '../_shared/revenuecat/subscriber.ts';
import { safeEqual } from '../plan-webhook/verify.ts';
import { grantOwner, grantTesters, type GrantDeps } from './grant.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const expected = Deno.env.get('PLAN_GRANT_SECRET');
  const got = req.headers.get('x-plan-grant-secret');
  if (!expected || !got || !safeEqual(expected, got)) return json({ ok: false, error: 'forbidden' }, 403);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const apiKey = () => Deno.env.get('REVENUECAT_SECRET_API_KEY')!;
  const snapshotOf = async (id: string) => toSnapshot(await fetchSubscriber(id, { apiKey: apiKey(), fetch }), Date.now());

  const members = async (householdIds: string[]): Promise<string[]> => {
    if (householdIds.length === 0) return [];
    const { data, error } = await admin.from('household_members').select('user_id').in('household_id', householdIds);
    if (error) throw new Error('household_members');
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  };

  const deps: GrantDeps = {
    listTesterUsers: async (includePrelaunch) => {
      const { data: tester, error } = await admin.from('household_plans').select('household_id').eq('promo_kind', 'tester');
      if (error) throw new Error('household_plans');
      const ids = (tester ?? []).map((r: { household_id: string }) => r.household_id);
      let users = await members(ids);
      if (includePrelaunch) {
        const { data: all } = await admin.from('households').select('id');
        const { data: planned } = await admin.from('household_plans').select('household_id');
        const hasPlan = new Set((planned ?? []).map((r: { household_id: string }) => r.household_id));
        const bare = (all ?? []).map((r: { id: string }) => r.id).filter((id: string) => !hasPlan.has(id));
        users = users.concat(await members(bare));
      }
      return users;
    },
    currentPromoEnd: async (id) => {
      const s = await snapshotOf(id);
      return s.entitled && s.store === 'PROMOTIONAL' && s.expires_at ? Date.parse(s.expires_at) : null;
    },
    // Recorded before posting so a grant is always traceable; a repeat of the same grant is a no-op.
    recordGrant: async (id, endMs) => {
      const { error } = await admin
        .from('plan_events')
        .upsert(
          { rc_event_id: `grant:${id}:${endMs}`, type: 'GRANT', app_user_id: id, payload: { end_time_ms: endMs } },
          { onConflict: 'rc_event_id', ignoreDuplicates: true },
        );
      if (error) throw new Error('plan_events');
    },
    postPromotional: async (id, endMs) => {
      const res = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}/entitlements/access/promotional`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey(), 'content-type': 'application/json' },
          body: JSON.stringify({ end_time_ms: endMs }),
        },
      );
      if (!res.ok) throw new Error('revenuecat_' + res.status);
    },
    refresh: async (id) => {
      const { error } = await admin.rpc('plan_apply', {
        p_app_user_id: id,
        p_snapshot: await snapshotOf(id),
        p_rc_event_id: `refresh:${id}:${Date.now()}`,
      });
      if (error) throw new Error('plan_apply');
    },
    setTesterUntil: async (endMs) => {
      const { error } = await admin.from('plan_settings').update({ tester_until: new Date(endMs).toISOString() }).eq('id', true);
      if (error) throw new Error('plan_settings');
    },
    markOwner: async (id) => {
      const { data: m } = await admin.from('household_members').select('household_id').eq('user_id', id).limit(1);
      const hid = m?.[0]?.household_id;
      if (!hid) throw new Error('no_household');
      const { error } = await admin.from('household_plans').update({ promo_kind: 'owner' }).eq('household_id', hid);
      if (error) throw new Error('household_plans');
    },
    log: (l) => console.log(l),
  };

  if (body.mode === 'testers') {
    const end = body.end_time_ms;
    if (typeof end !== 'number' || !Number.isInteger(end) || end <= Date.now()) {
      return json({ ok: false, error: 'bad_end_time' }, 400);
    }
    return json(await grantTesters(deps, { endTimeMs: end, includePrelaunch: body.include_prelaunch === true }));
  }
  if (body.mode === 'owner') {
    if (!isUuid(body.user_id)) return json({ ok: false, error: 'bad_user' }, 400);
    const r = await grantOwner(deps, { userId: body.user_id });
    return json(r, r.ok ? 200 : 502);
  }
  return json({ ok: false, error: 'bad_mode' }, 400);
});
