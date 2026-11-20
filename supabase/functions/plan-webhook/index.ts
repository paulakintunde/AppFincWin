import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { fetchSubscriber } from '../_shared/revenuecat/subscriber.ts';
import { processEvent, type SyncDeps } from './sync.ts';
import { verifyRevenueCat } from './verify.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Called by RevenueCat, not a user (verify_jwt = false). The check is the HMAC (or Authorization) secret in verify.ts.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const raw = await req.text();
  if (!(await verifyRevenueCat(raw, (n) => Deno.env.get(n), (n) => req.headers.get(n), Math.floor(Date.now() / 1000)))) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const deps: SyncDeps = {
    insertEvent: async (e) => {
      const { error } = await admin
        .from('plan_events')
        .insert({ rc_event_id: e.id, type: e.type, app_user_id: e.appUserId, environment: e.environment, payload: e.payload })
        .select('id');
      if (!error) return 'new';
      if (error.code !== '23505') throw new Error('plan_events');
      // Already stored: skip only when the first run finished (applied_at set); otherwise process again.
      const { data, error: readError } = await admin
        .from('plan_events')
        .select('applied_at')
        .eq('rc_event_id', e.id)
        .single();
      if (readError) throw new Error('plan_events');
      return data?.applied_at ? 'duplicate' : 'unapplied';
    },
    fetchSubscriber: (appUserId) =>
      fetchSubscriber(appUserId, { apiKey: Deno.env.get('REVENUECAT_SECRET_API_KEY')!, fetch }),
    applyPlan: async (appUserId, snapshot, eventId) => {
      const { data, error } = await admin.rpc('plan_apply', {
        p_app_user_id: appUserId,
        p_snapshot: snapshot,
        p_rc_event_id: eventId,
      });
      if (error) throw new Error('plan_apply');
      return data;
    },
    markNote: async (eventId, note) => {
      // A terminal outcome: set applied_at so a retry of this event is a duplicate. plan_apply sets it on every other path (09-05).
      const { error } = await admin
        .from('plan_events')
        .update({ note, applied_at: new Date().toISOString() })
        .eq('rc_event_id', eventId);
      if (error) throw new Error('plan_events');
    },
    now: () => Date.now(),
    log: (l) => console.log(l),
  };

  // Answer fast (RevenueCat disconnects after 60 s) and work in the background. A run that fails after the insert is
  // recovered by the daily reconcile (09-05 plan_sweep_targets, 09-07 sweep mode) and by the app's plan-refresh after
  // purchase and restore (09-10, 09-14).
  EdgeRuntime.waitUntil(processEvent(deps, body));
  return json({ ok: true });
});
