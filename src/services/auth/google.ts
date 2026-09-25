// ACC-02, T-00-15-02: native Google Sign-In. The installed
// @react-native-google-signin/google-signin SDK's `signIn()` takes a `SignInParams` that only
// carries `loginHint` -- verified against the installed package's own .d.ts, not assumed from
// docs -- so this "Original Google Sign In" API has no nonce parameter to give it. No nonce is
// therefore sent to either Google or Supabase here; Google's ID token is still short-lived,
// audience-bound to our client IDs, and verified server-side by GoTrue. This is the accepted
// residual risk recorded as T-00-15-02 in docs/ops/auth-providers.md, alongside the "Skip
// nonce checks" Supabase setting this configuration may require.
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getEnv } from '@/config/env';
import { supabase } from '@/services/supabase';
import type { SignInResult } from './apple';

export function configureGoogle(): void {
  const env = getEnv();
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId,
  });
}

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

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;

  return { status: 'signedIn' };
}
