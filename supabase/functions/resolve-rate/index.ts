import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { resolveRate, type ResolveDeps } from './resolve.ts';
import { notifyOperator, type NotifyDeps } from './notify.ts';
import type { FxRow } from '../_shared/fx/parse.ts';

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

  // The caller's id comes from their own JWT (already verified by the
  // platform gateway), never from client-supplied input. Memoised per request.
  let callerPromise: Promise<string | null> | null = null;
  const callerId = () => {
    callerPromise ??= userClient.auth.getUser().then(({ data, error }) => (error || !data?.user ? null : data.user.id));
    return callerPromise;
  };

  // Operator email (02-44): Resend secrets are project-wide function secrets.
  // Never logged; the body carries codes, dates and reasons only (T-01-11-04).
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  const alertToEmail = Deno.env.get('FX_ALERT_TO_EMAIL');
  const notifyDeps: NotifyDeps = {
    now: () => new Date(),
    configured: () => Boolean(resendApiKey && resendFromEmail && alertToEmail),
    async lastEmailedAt() {
      const { data, error } = await admin
        .from('fx_alerts')
        .select('emailed_at')
        .not('emailed_at', 'is', null)
        .order('emailed_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return data?.[0]?.emailed_at ?? null;
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

  const deps: ResolveDeps = {
    // RD-05: per-user throttle (~60/hour), enforced by the fx_resolve_calls-backed SQL
    // function (service-role, atomic increment); one count per call, whatever the shape.
    async checkRateLimit() {
      const id = await callerId();
      if (!id) return false;
      const { data, error } = await admin.rpc('fx_resolve_rate_check_limit', { p_user_id: id });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    today: () => new Date().toISOString().slice(0, 10),
    callerId,
    async readPendingMany(ids) {
      const { data, error } = await userClient
        .from('transactions')
        .select('id, original_currency, home_currency, local_date, rate_pending, created_by')
        .in('id', ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async quotesNeedingFetch(quotes, date) {
      const { data, error } = await admin.rpc('fx_quotes_needing_fetch', { p_quotes: quotes, p_on: date });
      if (error) throw new Error(error.message);
      return (data ?? []) as string[];
    },
    async openHolds(quotes) {
      if (quotes.length === 0) return [];
      const { data, error } = await admin
        .from('fx_rate_holds')
        .select('id, quote, held_rate, held_rate_date, source, status')
        .in('quote', quotes)
        .in('status', ['held', 'dropped']);
      if (error) throw new Error(error.message);
      return (data ?? []).map((h) => ({
        id: h.id,
        quote: h.quote,
        heldRate: String(h.held_rate),
        heldDate: h.held_rate_date,
        source: h.source,
        status: h.status as 'held' | 'dropped',
      }));
    },
    async confirmHolds(ids) {
      if (ids.length === 0) return;
      const { error } = await admin
        .from('fx_rate_holds')
        .update({ status: 'confirmed', resolved_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw new Error(error.message);
    },
    async upsertLookups(rows) {
      if (rows.length === 0) return;
      // Not ignoreDuplicates: refreshing fetched_at keeps the 1-hour freshness rule honest.
      const { error } = await admin.from('fx_rate_lookups').upsert(
        rows.map((r) => ({
          base: 'EUR',
          quote: r.quote,
          requested_date: r.requestedDate,
          rate_date: r.rateDate,
          source: r.source,
          fetched_at: new Date().toISOString(),
        })),
        { onConflict: 'base,quote,requested_date' }
      );
      if (error) throw new Error(error.message);
    },
    async recordFailures(date, quotes, reason) {
      if (quotes.length === 0) return;
      const { error } = await admin.from('fx_rate_fetch_failures').upsert(
        quotes.map((q) => ({ base: 'EUR', quote: q, requested_date: date, reason, failed_at: new Date().toISOString() })),
        { onConflict: 'base,quote,requested_date' }
      );
      if (error) throw new Error(error.message);
    },
    async clearFailures(date, quotes) {
      if (quotes.length === 0) return;
      const { error } = await admin
        .from('fx_rate_fetch_failures')
        .delete()
        .eq('base', 'EUR')
        .eq('requested_date', date)
        .in('quote', quotes);
      if (error) throw new Error(error.message);
    },
    async autoAcceptHolds() {
      const { data, error } = await admin.rpc('fx_auto_accept_holds');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ quote: string; held_rate_date: string }>).map((h) => ({
        quote: h.quote,
        heldDate: h.held_rate_date,
      }));
    },
    async refreshLookupsFor(accepted) {
      for (const a of accepted) {
        const { error } = await admin
          .from('fx_rate_lookups')
          .update({ fetched_at: new Date().toISOString() })
          .eq('base', 'EUR')
          .eq('quote', a.quote)
          .eq('rate_date', a.heldDate);
        if (error) throw new Error(error.message);
      }
    },
    async recentFailureAlert(date, quotes) {
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data, error } = await admin.from('fx_alerts').select('detail').eq('kind', 'sync-failed').gte('created_at', since);
      if (error) throw new Error(error.message);
      const want = [...quotes].sort().join(',');
      return ((data ?? []) as Array<{ detail: { date?: unknown; quotes?: unknown } | null }>).some(
        (a) =>
          a.detail?.date === date &&
          Array.isArray(a.detail.quotes) &&
          [...(a.detail.quotes as string[])].sort().join(',') === want
      );
    },
    async notify() {
      await notifyOperator(notifyDeps);
    },
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
    async upsertRates(rows: FxRow[], source) {
      if (rows.length === 0) return;
      const { error } = await admin
        .from('fx_rates')
        .upsert(
          rows.map((r) => ({ base: r.base, quote: r.quote, rate: r.rate, rate_date: r.date, source })),
          { onConflict: 'base,quote,rate_date,source', ignoreDuplicates: true }
        );
      if (error) throw new Error(error.message);
    },
    async restamp(id, relaxQuotes) {
      const { data, error } = await admin.rpc('restamp_transaction', { p_id: id, p_relax_quotes: relaxQuotes });
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
