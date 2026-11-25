import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { deleteAccount, privateLineReceiptObjects, type DeleteDeps, type ReceiptRowWithLine } from './delete.ts';
import { hitRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

// Same bucket and folder layout as read-pdf-statement: statement-uploads/<user id>/<file>.pdf.
const STATEMENT_BUCKET = 'statement-uploads';

const RATE_LIMIT = { limit: 3, windowSeconds: 3600 }; // ACC-13

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

  // Memoised so auth.getUser() runs once per request.
  let callerPromise: Promise<string | null> | null = null;
  const getCallerId = () => {
    callerPromise ??= userClient.auth.getUser().then(({ data, error }) => (error || !data?.user ? null : data.user.id));
    return callerPromise;
  };

  const deps: DeleteDeps = {
    getCallerId,
    listUserStorageObjects: async (userId) => {
      const { data, error } = await admin.storage.from(STATEMENT_BUCKET).list(userId, { limit: 1000 });
      if (error) throw new Error('storage');
      const statements = (data ?? []).filter((o) => o.name).map((o) => ({ bucket: STATEMENT_BUCKET, path: `${userId}/${o.name}` }));
      // 10.1-12 (D-19): by rows, never storage.list(userId) -- a user's folder also holds files of shared lines that stay with the household.
      const receipts = await privateLineReceiptObjects(
        async (from, to) =>
          (await admin
            .from('transaction_receipts')
            .select('object_path, transactions!inner(created_by, is_shared)')
            .eq('transactions.created_by', userId)
            .eq('transactions.is_shared', false)
            .order('id', { ascending: true })
            .range(from, to)) as { data: ReceiptRowWithLine[] | null; error: unknown },
        userId,
      );
      return [...statements, ...receipts];
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

  const callerId = await getCallerId();
  if (callerId) {
    const rl = await hitRateLimit(admin, 'delete-account:' + callerId, RATE_LIMIT.limit, RATE_LIMIT.windowSeconds);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);
  }

  const result = await deleteAccount({ method: req.method }, deps);
  return json(result.body, result.status);
});
