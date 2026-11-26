// 10-25 (ACC-11, D-30): store-review sign-in. The reviewer-signin Edge Function checks the allow-list and the password and
// returns session tokens; this hands them to the Supabase client. Every failure is the same 'invalid' so nothing about the
// allow-list leaks. The password is never logged.
import { supabase } from '@/services/supabase';

export type ReviewerSignInResult = 'ok' | 'invalid';

interface Tokens {
  ok?: boolean;
  access_token?: string;
  refresh_token?: string;
}

export async function reviewerSignIn(email: string, password: string): Promise<ReviewerSignInResult> {
  try {
    const { data, error } = await supabase.functions.invoke('reviewer-signin', {
      body: { email: email.trim().toLowerCase(), password },
    });
    const tokens = data as Tokens | null;
    if (error || !tokens || !tokens.access_token || !tokens.refresh_token) return 'invalid';
    const set = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
    return set.error ? 'invalid' : 'ok';
  } catch {
    return 'invalid';
  }
}
