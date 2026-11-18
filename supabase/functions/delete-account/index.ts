import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { deleteAccount, type DeleteDeps } from './delete.ts';

// Same bucket and folder layout as read-pdf-statement: statement-uploads/<user id>/<file>.pdf.
const STATEMENT_BUCKET = 'statement-uploads';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Client-invoked with the caller's own JWT. The gateway verifies it (verify_jwt = true in supabase/config.toml) and the
// caller id is read from that token with auth.getUser(). The request body is never read, so no client can name another user.
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
  // The service role key lives only in the function's environment: never returned, never logged.
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const deps: DeleteDeps = {
    getCallerId: async () => {
      const { data, error } = await userClient.auth.getUser();
      return error || !data?.user ? null : data.user.id;
    },
    listUserStorageObjects: async (userId) => {
      const { data, error } = await admin.storage.from(STATEMENT_BUCKET).list(userId, { limit: 1000 });
      if (error) throw new Error('storage');
      return (data ?? []).filter((o) => o.name).map((o) => ({ bucket: STATEMENT_BUCKET, path: `${userId}/${o.name}` }));
    },
    removeStorageObjects: async (objects) => {
      for (const bucket of new Set(objects.map((o) => o.bucket))) {
        const { error } = await admin.storage.from(bucket).remove(objects.filter((o) => o.bucket === bucket).map((o) => o.path));
        if (error) throw new Error('storage');
      }
    },
    // Runs the before-delete trigger from plan 08-14 (household hand-off, personal erasure, Former member).
    deleteAuthUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      return { error: error ? 'delete_failed' : null };
    },
  };

  const result = await deleteAccount({ method: req.method }, deps);
  return json(result.body, result.status);
});
