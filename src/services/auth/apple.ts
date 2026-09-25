// ACC-01, D-11, T-00-15-01/03: native Sign in with Apple on iOS; Supabase's web OAuth PKCE
// flow through the Apple Services ID on Android, since Apple's native SDK is iOS-only.
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/services/supabase';
import { createNonce } from './nonce';
import { persistFirstAuthProfile } from './firstAuthProfile';

export type SignInResult = { status: 'signedIn' } | { status: 'cancelled' };

const REDIRECT_PATH = 'auth-callback';

function isRequestCancelled(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
}

async function signInWithAppleIOS(): Promise<SignInResult> {
  const { raw, hashed } = await createNonce();

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed, // HASHED to Apple
    });
  } catch (err) {
    if (isRequestCancelled(err)) return { status: 'cancelled' };
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: raw, // RAW to Supabase; it hashes and compares
  });
  if (error) throw error;

  // ACC-03: awaited before returning -- Apple's fullName/email are only ever present on the
  // very first authorization, so this must run in this call, not be fired-and-forgotten.
  await persistFirstAuthProfile(data.user.id, credential.fullName, credential.email);

  return { status: 'signedIn' };
}

async function signInWithAppleAndroid(): Promise<SignInResult> {
  const redirectTo = Linking.createURL(REDIRECT_PATH);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo, skipBrowserRedirect: true, scopes: 'name email' },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { status: 'cancelled' };
  }
  if (result.type !== 'success') {
    throw new Error(`Unexpected Apple web OAuth result: ${result.type}`);
  }

  const code = Linking.parse(result.url).queryParams?.code;
  if (!code || typeof code !== 'string') {
    throw new Error('Apple web OAuth redirect had no authorization code');
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;

  return { status: 'signedIn' };
}

export async function signInWithApple(): Promise<SignInResult> {
  return Platform.OS === 'ios' ? signInWithAppleIOS() : signInWithAppleAndroid();
}
