import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { isAuthorized } from './auth.ts';
import { runPurge } from './purge.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  // Invoked only by pg_cron with its own shared secret (verify_jwt = false).
  if (!isAuthorized((n) => Deno.env.get(n), (n) => req.headers.get(n))) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const result = await runPurge({
    listStale: async (limit) => {
      const { data, error } = await admin.rpc('stale_statement_uploads', { p_limit: limit });
      if (error) throw new Error('storage');
      return (data ?? []) as string[];
    },
    remove: async (names) => {
      const { data, error } = await admin.storage.from('statement-uploads').remove(names);
      if (error) throw new Error('storage');
      return data?.length ?? 0;
    },
    now: () => Date.now(),
    log: (l) => console.log(l),
  });
  return json(result, result.ok ? 200 : 500);
});
