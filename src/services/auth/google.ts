// ACC-02, T-00-15-02: native Google Sign-In. The installed
// @react-native-google-signin/google-signin SDK's `signIn()` takes a `SignInParams` that only
// carries `loginHint` -- verified against the installed package's own .d.ts, not assumed from
// docs -- so this "Original Google Sign In" API has no nonce parameter to give it. No nonce is
// therefore sent to either Google or Supabase here; Google's ID token is still short-lived,
// audience-bound to our client IDs, and verified server-side by GoTrue. This is the accepted
// residual risk recorded as T-00-15-02 in docs/ops/auth-providers.md, alongside the "Skip
// nonce checks" Supabase setting this configuration may require. Silent sign-in (ACC-14) returns
// the same kind of ID token, so it does not change T-00-15-02.
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getEnv } from '@/config/env';
import { supabase } from '@/services/supabase';
import { forgetRememberedAccount } from '@/features/auth/rememberedAccounts';
import type { SignInResult } from './apple';

export function configureGoogle(): void {
  const env = getEnv();
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId,
  });
}

export async function exchangeGoogleToken(idToken: string): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return { status: 'signedIn' };
}

const sameEmail = (a: string | null | undefined, b: string): boolean =>
  (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

export async function signInWithGoogle(): Promise<SignInResult> {
  await GoogleSignin.hasPlayServices();

  const response = await GoogleSignin.signIn();
  if (response.type === 'cancelled') {
    return { status: 'cancelled' };
  }

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token');
  }

  return exchangeGoogleToken(idToken);
}

/**
 * D-19: one tap. Silent sign-in is used only for the SAME Google account as the tile; anything
 * else clears the SDK's cached account and opens the chooser hinted at that email (Pitfall 5).
 * The email is never logged or sent to analytics.
 */
export async function continueWithGoogle(email: string): Promise<SignInResult> {
  await GoogleSignin.hasPlayServices();

  try {
    const silent = await GoogleSignin.signInSilently();
    if (silent.type === 'success' && sameEmail(silent.data.user.email, email) && silent.data.idToken) {
      return await exchangeGoogleToken(silent.data.idToken);
    }
  } catch {
    // Fall through to the chooser.
  }

  await GoogleSignin.signOut().catch(() => null);
  const env = getEnv();
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId,
    accountName: email,
  });
  try {
    const response = await GoogleSignin.signIn({ loginHint: email });
    if (response.type === 'cancelled') return { status: 'cancelled' };
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google sign-in did not return an ID token');
    return await exchangeGoogleToken(idToken);
  } finally {
    configureGoogle();
  }
}

/** D-19: always the account list -- clear the SDK's cached account first. */
export async function signInWithDifferentGoogleAccount(): Promise<SignInResult> {
  await GoogleSignin.signOut().catch(() => null);
  return signInWithGoogle();
}

/** D-20 / ACC-10 (Phase 10): the in-app deletion flow calls this after the server purge. */
export async function forgetGoogleOnAccountDeletion(email: string): Promise<void> {
  await forgetRememberedAccount('google', email).catch(() => null);
  await GoogleSignin.revokeAccess().catch(() => null);
  await GoogleSignin.signOut().catch(() => null);
}
