import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { FRANKFURTER_V2_RATES_URL, parseFrankfurterRates } from './parse.ts';

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

  const res = await fetch(`${FRANKFURTER_V2_RATES_URL}?base=EUR`, { headers: { accept: 'application/json' } });
  if (!res.ok) return json({ ok: false, error: `frankfurter ${res.status}` }, 502);

  let rows;
  try {
    rows = parseFrankfurterRates(await res.json());
  } catch (e) {
    // Nothing is written on parse failure (T-00-09-02).
    return json({ ok: false, error: (e as Error).message }, 502);
  }

  // SUPABASE_SERVICE_ROLE_KEY is injected by Supabase into every Edge
  // Function's runtime environment only -- never set by client code
  // (ENV-04, T-00-09-03).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { error } = await admin
    .from('fx_rates')
    .upsert(
      rows.map((r) => ({ base: r.base, quote: r.quote, rate: r.rate, rate_date: r.date, source: 'frankfurter-v2' })),
      { onConflict: 'base,quote,rate_date,source' }
    );
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, count: rows.length, date: rows[0]?.date });
});
