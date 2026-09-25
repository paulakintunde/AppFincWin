import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { runFxMonitor, type MonitorDeps } from './monitor.ts';

// Constant-time comparison so a shared-secret check never leaks timing
// information about how many leading bytes matched -- same mitigation as
// fx-sync/index.ts (T-00-09-01, T-01-11-03).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  // Auth is a shared secret (compared in constant time), not a user JWT --
  // this function is invoked by pg_cron via net.http_post, not by clients.
  // Reuses the fx_sync_secret shared secret; same trust model as fx-sync.
  const expected = Deno.env.get('FX_SYNC_SECRET');
  const got = req.headers.get('x-fx-sync-secret');
  if (!expected || !got || !safeEqual(expected, got)) return json({ ok: false, error: 'forbidden' }, 403);

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  const alertToEmail = Deno.env.get('FX_ALERT_TO_EMAIL');
  // Config errors never echo which value is missing or what any value is.
  if (!resendApiKey || !resendFromEmail || !alertToEmail) return json({ ok: false, error: 'config' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const deps: MonitorDeps = {
    today: () => new Date().toISOString().slice(0, 10),
    async latestRates() {
      const { data, error } = await admin.rpc('fx_latest_rates');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: { quote: string; rate_date: string }) => ({ quote: r.quote, rate_date: r.rate_date }));
    },
    async currencies() {
      const { data, error } = await admin.from('currencies').select('code, end_date, staleness_limit_days');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async insertAlerts(alerts) {
      if (alerts.length === 0) return;
      const { error } = await admin
        .from('fx_alerts')
        .insert(alerts.map((a) => ({ kind: a.kind, quote: a.quote ?? null, detail: a.detail ?? {} })));
      if (error) throw new Error(error.message);
    },
    async autoAcceptHolds() {
      const { data, error } = await admin.rpc('fx_auto_accept_holds');
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },
    async restampPending() {
      const { data, error } = await admin.rpc('fx_restamp_pending');
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    async pendingRowsCount() {
      const { data, error } = await admin.rpc('fx_pending_rows_count');
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    async unsentAlerts() {
      const { data, error } = await admin
        .from('fx_alerts')
        .select('id, kind, quote, detail, created_at')
        .is('emailed_at', null)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async markEmailed(ids) {
      if (ids.length === 0) return;
      const { error } = await admin.from('fx_alerts').update({ emailed_at: new Date().toISOString() }).in('id', ids);
      if (error) throw new Error(error.message);
    },
    async sendEmail(subject, text) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: resendFromEmail, to: [alertToEmail], subject, text }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
    },
  };

  try {
    const result = await runFxMonitor(deps);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 502);
  }
});
