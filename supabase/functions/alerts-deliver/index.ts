import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { safeEqual } from '../plan-webhook/verify.ts';
import { deliverPass, receiptsPass, type DeliverDeps } from './deliver.ts';
import { createExpo } from './expo.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// pg_cron calls this every minute with x-alerts-secret (ALERTS_DELIVER_SECRET). verify_jwt is false in config.toml,
// so this check is the only gate: no secret set, or a wrong one, is refused.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const expected = Deno.env.get('ALERTS_DELIVER_SECRET');
  const got = req.headers.get('x-alerts-secret');
  if (!expected || !got || !safeEqual(expected, got)) return json({ ok: false, error: 'forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const expo = createExpo(fetch as never, Deno.env.get('EXPO_ACCESS_TOKEN'));

  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T[]> => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(fn);
    return (data ?? []) as T[];
  };

  const deps: DeliverDeps = {
    claim: (limit) => call('alerts_claim', { p_limit: limit }),
    finish: async (id, status, delivery, ticketIds, ticketTokens) => {
      await call('alerts_finish', { p_id: id, p_status: status, p_delivery: delivery, p_ticket_ids: ticketIds, p_ticket_tokens: ticketTokens });
    },
    hold: async (id, until) => {
      await call('alerts_hold', { p_id: id, p_until: until.toISOString() });
    },
    requeue: async (id, after) => {
      await call('alerts_requeue', { p_id: id, p_after: after.toISOString() });
    },
    digestUsers: () => call('alerts_digest_users'),
    digestClaim: async (userId, localDate) => {
      const { data, error } = await admin.rpc('alerts_digest_claim', { p_user: userId, p_local_date: localDate });
      if (error) throw new Error('alerts_digest_claim');
      return data === true;
    },
    digestRelease: async (userId, localDate, previous) => {
      await call('alerts_digest_release', { p_user: userId, p_local_date: localDate, p_previous: previous });
    },
    digestDone: async (userId, localDate) => {
      await call('alerts_digest_done', { p_user: userId, p_local_date: localDate });
    },
    receiptsDue: () => call('alerts_receipts_due'),
    receiptsDone: async (id) => {
      await call('alerts_receipts_done', { p_id: id });
    },
    dropToken: async (token) => {
      await call('alerts_drop_token', { p_token: token });
    },
    send: (m) => expo.send(m),
    getReceipts: (ids) => expo.getReceipts(ids),
    log: (l) => console.log(JSON.stringify(l)),
  };

  try {
    const now = new Date();
    const delivered = await deliverPass(deps, now);
    const receipts = await receiptsPass(deps, now);
    // Counts only: no user ids, tokens or text.
    return json({ ok: true, delivered, receipts });
  } catch (e) {
    console.log(JSON.stringify({ event: 'alerts_deliver_failed', error: e instanceof Error ? e.message : 'error' }));
    return json({ ok: false, error: 'failed' }, 500);
  }
});
