// reviewer-signin (10-19, ACC-11, D-25/D-30): email-and-password sign-in for allow-listed store-review accounts only.
// verify_jwt = false (the caller has no session yet). Allow-list lives in public.reviewer_allowlist (server-only);
// the before_user_created hook stops anyone else creating an email account. The body is never logged.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { hitRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';
import { reviewerSignIn, type SignInDeps } from './signin.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });

  let body: unknown = null;
  if (req.method === 'POST') {
    try {
      body = JSON.parse(await req.text());
    } catch {
      body = null;
    }
  }
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

  const deps: SignInDeps = {
    isListed: async (email) => {
      const { data, error } = await admin.rpc('is_reviewer_email', { p_email: email });
      if (error) throw new Error('allowlist');
      return data === true;
    },
    signInWithPassword: async (email, password) => {
      const { data, error } = await anon.auth.signInWithPassword({ email, password });
      if (error || !data.session) return null;
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      };
    },
    rateLimit: (key, limit, windowSeconds) => hitRateLimit(admin, key, limit, windowSeconds),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (l) => console.log(JSON.stringify(l)),
  };

  const r = await reviewerSignIn({ method: req.method, ip, body }, deps);
  if (r.status === 429) return tooManyRequests(r.retryAfter ?? 1);
  return json(r.body, r.status);
});
