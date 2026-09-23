import { readClientEnv, EnvError } from '../env';

const VALID: Record<string, string | undefined> = {
  EXPO_PUBLIC_APP_ENV: 'development',
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcxyz.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client-id',
  EXPO_PUBLIC_APPLE_SIGNIN_ENABLED: 'true',
  EXPO_PUBLIC_POSTHOG_KEY: 'phc_test',
  EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
  EXPO_PUBLIC_ERROR_TRACKING: 'posthog',
  EXPO_PUBLIC_SENTRY_DSN: undefined,
  EXPO_PUBLIC_IOS_APP_STORE_ID: '123456789',
};

describe('readClientEnv', () => {
  it('returns a typed object when every required key is present and valid', () => {
    const env = readClientEnv(VALID);
    expect(env).toEqual({
      appEnv: 'development',
      supabaseUrl: 'https://abcxyz.supabase.co',
      supabasePublishableKey: 'publishable-key',
      googleWebClientId: 'web-client-id',
      googleIosClientId: 'ios-client-id',
      appleSignInEnabled: true,
      posthogKey: 'phc_test',
      posthogHost: 'https://eu.i.posthog.com',
      errorTracking: 'posthog',
      sentryDsn: undefined,
      iosAppStoreId: '123456789',
    });
  });

  it('parses EXPO_PUBLIC_APPLE_SIGNIN_ENABLED="true" as true', () => {
    const env = readClientEnv({ ...VALID, EXPO_PUBLIC_APPLE_SIGNIN_ENABLED: 'true' });
    expect(env.appleSignInEnabled).toBe(true);
  });

  it.each(['false', 'TRUE', '1', '', undefined])(
    'parses EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=%p as false',
    (value) => {
      const env = readClientEnv({ ...VALID, EXPO_PUBLIC_APPLE_SIGNIN_ENABLED: value });
      expect(env.appleSignInEnabled).toBe(false);
    }
  );

  it('throws EnvError listing every missing required key', () => {
    expect(() =>
      readClientEnv({
        ...VALID,
        EXPO_PUBLIC_SUPABASE_URL: undefined,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: undefined,
      })
    ).toThrow(EnvError);

    try {
      readClientEnv({
        ...VALID,
        EXPO_PUBLIC_SUPABASE_URL: undefined,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: undefined,
      });
      throw new Error('expected readClientEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const envError = error as EnvError;
      expect(envError.problems.join(' ')).toContain('EXPO_PUBLIC_SUPABASE_URL');
      expect(envError.problems.join(' ')).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
      expect(envError.problems.join(' ')).toContain('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
    }
  });

  it('throws EnvError when EXPO_PUBLIC_POSTHOG_HOST is not the EU host (D-23)', () => {
    expect(() =>
      readClientEnv({ ...VALID, EXPO_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' })
    ).toThrow(EnvError);
  });

  it('defaults EXPO_PUBLIC_POSTHOG_HOST to the EU host when unset', () => {
    const env = readClientEnv({ ...VALID, EXPO_PUBLIC_POSTHOG_HOST: undefined });
    expect(env.posthogHost).toBe('https://eu.i.posthog.com');
  });

  it('throws EnvError when EXPO_PUBLIC_APP_ENV is outside development|preview|production', () => {
    expect(() => readClientEnv({ ...VALID, EXPO_PUBLIC_APP_ENV: 'staging' })).toThrow(EnvError);
  });

  it.each(['development', 'preview', 'production'])('accepts EXPO_PUBLIC_APP_ENV=%s', (appEnv) => {
    const env = readClientEnv({ ...VALID, EXPO_PUBLIC_APP_ENV: appEnv });
    expect(env.appEnv).toBe(appEnv);
  });

  it('throws EnvError when the Supabase URL does not start with https://', () => {
    expect(() =>
      readClientEnv({ ...VALID, EXPO_PUBLIC_SUPABASE_URL: 'http://example.com' })
    ).toThrow(EnvError);
  });

  it.each(['http://127.0.0.1:54321', 'http://10.0.2.2:54321'])(
    'allows a loopback/emulator Supabase URL (%s) only in development',
    (url) => {
      const env = readClientEnv({
        ...VALID,
        EXPO_PUBLIC_APP_ENV: 'development',
        EXPO_PUBLIC_SUPABASE_URL: url,
      });
      expect(env.supabaseUrl).toBe(url);
    }
  );

  it('rejects a loopback Supabase URL outside development', () => {
    expect(() =>
      readClientEnv({
        ...VALID,
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      })
    ).toThrow(EnvError);
  });

  it('collects every problem before throwing once, rather than failing on the first', () => {
    try {
      readClientEnv({
        ...VALID,
        EXPO_PUBLIC_SUPABASE_URL: undefined,
        EXPO_PUBLIC_APP_ENV: 'staging',
      });
      throw new Error('expected readClientEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const envError = error as EnvError;
      expect(envError.problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});
