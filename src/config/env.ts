// ENV-01: every runtime config value is read through this one typed module — nothing else
// in the app should touch process.env directly. Expo only inlines *literal*
// `process.env.EXPO_PUBLIC_*` member accesses at bundle time (no dynamic keys, no
// destructuring of `process.env`), so every access below is written out by hand as a literal
// property access — see getEnv() at the bottom.

export type AppEnv = 'development' | 'preview' | 'production';
export type ErrorTracking = 'posthog' | 'sentry';

export interface ClientEnv {
  appEnv: AppEnv;
  supabaseUrl: string;
  supabasePublishableKey: string;
  googleWebClientId: string;
  googleIosClientId?: string;
  appleSignInEnabled: boolean;
  posthogKey?: string;
  posthogHost: 'https://eu.i.posthog.com';
  errorTracking: ErrorTracking;
  sentryDsn?: string;
  iosAppStoreId?: string;
}

const EU_POSTHOG_HOST = 'https://eu.i.posthog.com';
const APP_ENVS: readonly AppEnv[] = ['development', 'preview', 'production'];
const ERROR_TRACKERS: readonly ErrorTracking[] = ['posthog', 'sentry'];
const DEV_LOOPBACK_HOSTS = ['http://127.0.0.1', 'http://10.0.2.2'];

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment: ${problems.join('; ')}`);
    this.name = 'EnvError';
  }
}

function isAppEnv(value: string | undefined): value is AppEnv {
  return APP_ENVS.includes(value as AppEnv);
}

function isErrorTracking(value: string | undefined): value is ErrorTracking {
  return ERROR_TRACKERS.includes(value as ErrorTracking);
}

function isValidSupabaseUrl(url: string, appEnv: string | undefined): boolean {
  if (url.startsWith('https://')) return true;
  return appEnv === 'development' && DEV_LOOPBACK_HOSTS.some((host) => url.startsWith(host));
}

/**
 * Pure, validated env reader — takes a plain object so it can be unit tested without touching
 * `process.env`. Collects every problem before throwing once, so a misconfigured environment
 * reports everything wrong with it in one pass rather than one fix-and-rerun cycle at a time.
 */
export function readClientEnv(src: Record<string, string | undefined>): ClientEnv {
  const problems: string[] = [];

  const appEnvRaw = src.EXPO_PUBLIC_APP_ENV;
  if (!isAppEnv(appEnvRaw)) {
    problems.push(
      `EXPO_PUBLIC_APP_ENV must be one of ${APP_ENVS.join('|')} (got ${JSON.stringify(appEnvRaw)})`
    );
  }
  const appEnv: AppEnv = isAppEnv(appEnvRaw) ? appEnvRaw : 'development';

  const requiredKeys = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  ] as const;
  for (const key of requiredKeys) {
    if (!src[key]) {
      problems.push(`${key} is required and was not set`);
    }
  }

  const supabaseUrl = src.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (supabaseUrl && !isValidSupabaseUrl(supabaseUrl, appEnvRaw)) {
    problems.push(
      `EXPO_PUBLIC_SUPABASE_URL must start with https:// (loopback/emulator hosts are only allowed when EXPO_PUBLIC_APP_ENV=development), got ${JSON.stringify(supabaseUrl)}`
    );
  }

  const posthogHostRaw = src.EXPO_PUBLIC_POSTHOG_HOST;
  if (posthogHostRaw && posthogHostRaw !== EU_POSTHOG_HOST) {
    problems.push(
      `EXPO_PUBLIC_POSTHOG_HOST must be ${EU_POSTHOG_HOST} (D-23), got ${JSON.stringify(posthogHostRaw)}`
    );
  }

  const errorTrackingRaw = src.EXPO_PUBLIC_ERROR_TRACKING;
  if (errorTrackingRaw && !isErrorTracking(errorTrackingRaw)) {
    problems.push(
      `EXPO_PUBLIC_ERROR_TRACKING must be one of ${ERROR_TRACKERS.join('|')}, got ${JSON.stringify(errorTrackingRaw)}`
    );
  }

  if (problems.length > 0) {
    throw new EnvError(problems);
  }

  return {
    appEnv,
    supabaseUrl,
    supabasePublishableKey: src.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    googleWebClientId: src.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    googleIosClientId: src.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    appleSignInEnabled: src.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === 'true',
    posthogKey: src.EXPO_PUBLIC_POSTHOG_KEY || undefined,
    posthogHost: EU_POSTHOG_HOST,
    errorTracking: isErrorTracking(errorTrackingRaw) ? errorTrackingRaw : 'posthog',
    sentryDsn: src.EXPO_PUBLIC_SENTRY_DSN || undefined,
    iosAppStoreId: src.EXPO_PUBLIC_IOS_APP_STORE_ID || undefined,
  };
}

let cached: ClientEnv | undefined;

/**
 * The real entry point every service/feature calls. Each access below MUST stay a literal
 * `process.env.EXPO_PUBLIC_X` property access (see module comment) — do not refactor this into
 * a loop or destructure `process.env`, or Expo's bundler will stop inlining these values.
 */
export function getEnv(): ClientEnv {
  return (cached ??= readClientEnv({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    EXPO_PUBLIC_APPLE_SIGNIN_ENABLED: process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED,
    EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    EXPO_PUBLIC_ERROR_TRACKING: process.env.EXPO_PUBLIC_ERROR_TRACKING,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_IOS_APP_STORE_ID: process.env.EXPO_PUBLIC_IOS_APP_STORE_ID,
  }));
}
