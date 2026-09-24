import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { runFxSync, type FxSyncDb } from './sync.ts';

// Constant-time comparison so a shared-secret check never leaks timing
// information about how many leading bytes matched (T-00-09-01).
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
  const expected = Deno.env.get('FX_SYNC_SECRET');
  const got = req.headers.get('x-fx-sync-secret');
  if (!expected || !got || !safeEqual(expected, got)) return json({ ok: false, error: 'forbidden' }, 403);

  // SUPABASE_SERVICE_ROLE_KEY is injected by Supabase into every Edge
  // Function's runtime environment only -- never set by client code
  // (ENV-04, T-00-09-03). No secret or key is ever logged.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const fetchJson = async (url: string) => {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.json();
  };

  const db: FxSyncDb = {
    async recentRates(sinceDate) {
      const { data, error } = await admin
        .from('fx_rates')
        .select('quote, rate, rate_date')
        .eq('base', 'EUR')
        .gte('rate_date', sinceDate);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ quote: r.quote, rate: String(r.rate), date: r.rate_date }));
    },
    async openHolds() {
      const { data, error } = await admin
        .from('fx_rate_holds')
        .select('id, quote, held_rate, held_rate_date, source')
        .eq('status', 'held');
      if (error) throw new Error(error.message);
      return (data ?? []).map((h) => ({
        id: h.id,
        quote: h.quote,
        heldRate: String(h.held_rate),
        heldDate: h.held_rate_date,
        source: h.source,
      }));
    },
    async upsertRates(rows, source) {
      if (rows.length === 0) return;
      const { error } = await admin
        .from('fx_rates')
        .upsert(
          rows.map((r) => ({ base: r.base, quote: r.quote, rate: r.rate, rate_date: r.date, source })),
          { onConflict: 'base,quote,rate_date,source' }
        );
      if (error) throw new Error(error.message);
    },
    async upsertHolds(rows) {
      if (rows.length === 0) return;
      const { error } = await admin
        .from('fx_rate_holds')
        .upsert(
          rows.map((r) => ({
            base: r.base,
            quote: r.quote,
            held_rate: r.rate,
            held_rate_date: r.date,
            source: r.source,
            prior_rate: r.priorRate,
            prior_rate_date: r.priorDate,
            change_ratio: r.changeRatio,
            status: 'held',
          })),
          { onConflict: 'quote,held_rate_date,source' }
        );
      if (error) throw new Error(error.message);
    },
    async confirmHolds(ids) {
      if (ids.length === 0) return;
      const { error } = await admin
        .from('fx_rate_holds')
        .update({ status: 'confirmed', resolved_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw new Error(error.message);
    },
    async insertAlerts(alerts) {
      if (alerts.length === 0) return;
      const { error } = await admin
        .from('fx_alerts')
        .insert(alerts.map((a) => ({ kind: a.kind, quote: a.quote ?? null, detail: a.detail ?? {} })));
      if (error) throw new Error(error.message);
    },
    async upsertCurrencies(meta) {
      if (meta.length === 0) return;
      const { error } = await admin.from('currencies').upsert(
        meta.map((m) => ({
          code: m.code,
          iso_numeric: m.isoNumeric,
          name: m.name,
          symbol: m.symbol,
          start_date: m.startDate,
          end_date: m.endDate,
          synced_at: new Date().toISOString(),
        })),
        { onConflict: 'code' }
      );
      if (error) throw new Error(error.message);
    },
  };

  try {
    const result = await runFxSync({ fetchJson, db });
    return json(result);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 502);
  }
});
