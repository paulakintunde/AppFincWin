import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { fetchSubscriber, toSnapshot } from '../_shared/revenuecat/subscriber.ts';
import { safeEqual } from '../plan-webhook/verify.ts';
import { refreshForCaller, sweep, type RefreshDeps } from './refresh.ts';
import { hitRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

const RATE_LIMIT = { limit: 30, windowSeconds: 3600 }; // ACC-13, caller mode only

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Two callers, one function (verify_jwt = false in config.toml):
//  - sweep mode: the daily cron sends {"mode":"sweep"} with x-plan-sweep-secret (PLAN_SWEEP_SECRET).
//  - caller mode: the app sends its own JWT; the caller id is read with auth.getUser(). The body never names a user.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  let mode: unknown;
  try {
    const text = await req.text();
    mode = text ? (JSON.parse(text) as { mode?: unknown })?.mode : undefined;
  } catch {
    mode = undefined;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const deps: RefreshDeps = {
    fetchSnapshot: async (id) =>
      toSnapshot(await fetchSubscriber(id, { apiKey: Deno.env.get('REVENUECAT_SECRET_API_KEY')!, fetch }), Date.now()),
    apply: async (id, snapshot, eventId) => {
      const { error } = await admin.rpc('plan_apply', { p_app_user_id: id, p_snapshot: snapshot, p_rc_event_id: eventId });
      if (error) throw new Error('plan_apply');
    },
    householdPayer: async (callerId) => {
      const { data: m } = await admin.from('household_members').select('household_id').eq('user_id', callerId).limit(1);
      const hid = m?.[0]?.household_id;
      if (!hid) return null;
      const { data: p } = await admin.from('household_plans').select('payer_id').eq('household_id', hid).maybeSingle();
      return p?.payer_id ?? null;
    },
    sweepTargets: async () => {
      const { data, error } = await admin.rpc('plan_sweep_targets');
      if (error) throw new Error('plan_sweep_targets');
      return (data ?? []).map((r: { app_user_id: string }) => r.app_user_id);
    },
    now: () => Date.now(),
    log: (l) => console.log(l),
  };

  if (mode === 'sweep') {
    const expected = Deno.env.get('PLAN_SWEEP_SECRET');
    const got = req.headers.get('x-plan-sweep-secret');
    if (!expected || !got || !safeEqual(expected, got)) return json({ ok: false, error: 'forbidden' }, 403);
    return json(await sweep(deps));
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ ok: false, error: 'unauthorized' }, 401);
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return json({ ok: false, error: 'unauthorized' }, 401);

  const rl = await hitRateLimit(admin, 'plan-refresh:' + data.user.id, RATE_LIMIT.limit, RATE_LIMIT.windowSeconds);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const result = await refreshForCaller(deps, data.user.id);
  if (!result.ok) return json(result, 502);
  return json({ ok: true, state: (await userClient.rpc('plan_state')).data });
});
