import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { resolveRate, type ResolveDeps } from './resolve.ts';
import type { FxRow } from '../fx-sync/parse.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  // Client-invoked with the caller's own JWT (T-01-11-01, T-01-11-02): the
  // platform gateway already verifies it (verify_jwt = true in
  // supabase/config.toml), but the IDOR mitigation that actually matters is
  // below -- readPending uses a client built from this same header, so the
  // row is only ever visible under the caller's own RLS policies, before any
  // service-role write happens.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ ok: false, error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // SUPABASE_ANON_KEY is the platform-injected name for the project's
  // publishable/anon key inside every Edge Function's runtime environment
  // (distinct from EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, which is the app's
  // own env var name for the same key) -- see SUMMARY.md for the source.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // User-scoped client: RLS, not the service role, decides whether the
  // caller may read this transaction at all.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // Admin client: only used after the user-scoped read above has already
  // proven household membership.
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const fetchJson = async (url: string) => {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.json();
  };

  const deps: ResolveDeps = {
    async readPending(id) {
      const { data, error } = await userClient
        .from('transactions')
        .select('id, original_currency, home_currency, local_date, rate_pending, created_by')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async customReference(ownerId, code) {
      if (!ownerId) return null;
      const { data, error } = await admin
        .from('custom_currencies')
        .select('reference_currency')
        .eq('owner_id', ownerId)
        .eq('code', code)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.reference_currency ?? null;
    },
    fetchJson,
    async blockedHolds(quotes) {
      if (quotes.length === 0) return [];
      const { data, error } = await admin
        .from('fx_rate_holds')
        .select('quote, held_rate_date')
        .in('quote', quotes)
        .in('status', ['held', 'dropped']);
      if (error) throw new Error(error.message);
      return (data ?? []).map((h) => ({ quote: h.quote, heldDate: h.held_rate_date }));
    },
    async storedRatesAround(quote, date) {
      const sameDate = await admin
        .from('fx_rates')
        .select('quote, rate, rate_date')
        .eq('base', 'EUR')
        .eq('quote', quote)
        .eq('rate_date', date);
      if (sameDate.error) throw new Error(sameDate.error.message);
      // Nearest earlier publication with no age window (WR-B04): a quote
      // whose last stored rate is months old must still be compared, never
      // waved through as "no prior".
      const prior = await admin
        .from('fx_rates')
        .select('quote, rate, rate_date')
        .eq('base', 'EUR')
        .eq('quote', quote)
        .lt('rate_date', date)
        .order('rate_date', { ascending: false })
        .limit(1);
      if (prior.error) throw new Error(prior.error.message);
      return [...(sameDate.data ?? []), ...(prior.data ?? [])].map((r) => ({
        quote: r.quote,
        rate: String(r.rate),
        date: r.rate_date,
      }));
    },
    async upsertHolds(rows) {
      if (rows.length === 0) return;
      const { error } = await admin.from('fx_rate_holds').upsert(
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
        // An existing hold (held, confirmed, auto-accepted or dropped) is
        // never overwritten -- a dropped hold stays dropped (CR-B02).
        { onConflict: 'quote,held_rate_date,source', ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);
    },
    async insertAlerts(alerts) {
      if (alerts.length === 0) return;
      const { error } = await admin
        .from('fx_alerts')
        .insert(alerts.map((a) => ({ kind: a.kind, quote: a.quote ?? null, detail: a.detail ?? {} })));
      if (error) throw new Error(error.message);
    },
    async upsertRates(rows: FxRow[]) {
      if (rows.length === 0) return;
      const { error } = await admin
        .from('fx_rates')
        .upsert(
          rows.map((r) => ({ base: r.base, quote: r.quote, rate: r.rate, rate_date: r.date, source: 'frankfurter-v2' })),
          { onConflict: 'base,quote,rate_date,source', ignoreDuplicates: true }
        );
      if (error) throw new Error(error.message);
    },
    async restamp(id) {
      const { data, error } = await admin.rpc('restamp_transaction', { p_id: id });
      if (error) throw new Error(error.message);
      return (data ?? {}) as Record<string, unknown>;
    },
  };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid-input' }, 400);
  }

  const result = await resolveRate(deps, body);
  return json(result.body, result.status);
});
