import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { STATEMENT_BUCKET } from './contract.ts';
import { readStatement, type ReadDeps } from './read.ts';
import { openPdf } from './unpdf.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Client-invoked with the caller's own JWT: the gateway verifies it
// (verify_jwt = true in supabase/config.toml) and readStatement proves the
// path's folder equals the caller's user id before the service role is used.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ ok: false, error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const deps: ReadDeps = {
    userId: async () => (await userClient.auth.getUser()).data.user?.id ?? null,
    download: async (path) => {
      const { data, error } = await admin.storage.from(STATEMENT_BUCKET).download(path);
      if (error) {
        const e = error as { status?: unknown; statusCode?: unknown; name?: unknown };
        const code = String(e.statusCode ?? e.status ?? '');
        if (code === '404' || code === 'not_found') return null;
        throw new Error('storage');
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    remove: async (path) => {
      const { error } = await admin.storage.from(STATEMENT_BUCKET).remove([path]);
      if (error) throw new Error('storage');
    },
    openPdf,
    now: () => performance.now(),
    log: (l) => console.log(l),
  };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid-input' }, 400);
  }
  const r = await readStatement(deps, body);
  return json(r.body, r.status);
});
