import { readClientEnv, readErrorTrackingEnv, EnvError } from '../env';

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

  // Sentry-delivery debug (2026-09-25): root cause was EAS values stored with literal wrapping
  // quotes (e.g. `"https://abcxyz.supabase.co"` instead of `https://abcxyz.supabase.co`).
  describe('quoted-value detection', () => {
    it.each(['"https://abcxyz.supabase.co"', "'https://abcxyz.supabase.co'"])(
      'throws a specific, value-free message for a quoted EXPO_PUBLIC_SUPABASE_URL (%s)',
      (quoted) => {
        try {
          readClientEnv({ ...VALID, EXPO_PUBLIC_SUPABASE_URL: quoted });
          throw new Error('expected readClientEnv to throw');
        } catch (error) {
          expect(error).toBeInstanceOf(EnvError);
          const message = (error as EnvError).problems.join(' ');
          expect(message).toContain(
            'EXPO_PUBLIC_SUPABASE_URL is wrapped in literal quotes — remove them in EAS/.env'
          );
          expect(message).not.toContain(quoted);
        }
      }
    );

    it('reports the quoted-value message instead of the generic https:// message (the helpful one wins)', () => {
      try {
        readClientEnv({ ...VALID, EXPO_PUBLIC_SUPABASE_URL: '"https://abcxyz.supabase.co"' });
        throw new Error('expected readClientEnv to throw');
      } catch (error) {
        const problems = (error as EnvError).problems;
        expect(problems).toEqual(
          expect.arrayContaining([expect.stringContaining('wrapped in literal quotes')])
        );
        expect(problems.some((p) => p.includes('must start with https://'))).toBe(false);
      }
    });

    it('detects a quoted value on any EXPO_PUBLIC_ key, not just the Supabase URL', () => {
      try {
        readClientEnv({ ...VALID, EXPO_PUBLIC_APP_ENV: '"development"' });
        throw new Error('expected readClientEnv to throw');
      } catch (error) {
        const problems = (error as EnvError).problems;
        expect(problems).toEqual(
          expect.arrayContaining([
            expect.stringContaining('EXPO_PUBLIC_APP_ENV is wrapped in literal quotes'),
          ])
        );
        expect(problems.some((p) => p.includes('must be one of'))).toBe(false);
      }
    });

    it('does not flag a normal, unquoted value', () => {
      expect(() => readClientEnv(VALID)).not.toThrow();
    });

    it('does not flag a single leading or trailing quote (not a matched pair)', () => {
      const env = readClientEnv({ ...VALID, EXPO_PUBLIC_POSTHOG_KEY: '"phc_test' });
      expect(env.posthogKey).toBe('"phc_test');
    });
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

// Sentry-delivery debug (2026-09-25): error reporting must read ONLY the keys it needs. Every
// EAS environment had EXPO_PUBLIC_SUPABASE_URL stored with literal wrapping quotes, so the
// whole-env readClientEnv() threw and silently took Sentry init down with it.
describe('readErrorTrackingEnv', () => {
  const DSN = 'https://examplePublicKey@o0.ingest.us.sentry.io/0';

  it('returns sentry + DSN even when unrelated required keys are missing', () => {
    expect(readErrorTrackingEnv({ EXPO_PUBLIC_SENTRY_DSN: DSN })).toEqual({
      errorTracking: 'sentry',
      sentryDsn: DSN,
    });
  });

  it('returns sentry + DSN when an unrelated key is malformed (quoted Supabase URL)', () => {
    const src = { ...VALID, EXPO_PUBLIC_ERROR_TRACKING: undefined, EXPO_PUBLIC_SUPABASE_URL: '"https://abcxyz.supabase.co"', EXPO_PUBLIC_SENTRY_DSN: DSN };
    expect(() => readClientEnv(src)).toThrow(EnvError);
    expect(readErrorTrackingEnv(src)).toEqual({
      errorTracking: 'sentry',
      sentryDsn: DSN,
      environment: 'development',
    });
  });

  it('treats an empty DSN as unset', () => {
    expect(readErrorTrackingEnv({ EXPO_PUBLIC_SENTRY_DSN: '' }).sentryDsn).toBeUndefined();
  });

  it('honours EXPO_PUBLIC_ERROR_TRACKING=posthog', () => {
    expect(readErrorTrackingEnv({ EXPO_PUBLIC_ERROR_TRACKING: 'posthog' }).errorTracking).toBe('posthog');
  });

  it('throws EnvError naming only the key (never the value) for an unknown tracker', () => {
    expect(() => readErrorTrackingEnv({ EXPO_PUBLIC_ERROR_TRACKING: 'bugsnag' })).toThrow(EnvError);
  });

  // Sentry environment tag: EXPO_PUBLIC_APP_ENV is tagged onto every Sentry event.
  it.each(['development', 'preview', 'production'] as const)(
    'passes through EXPO_PUBLIC_APP_ENV=%s as environment',
    (appEnv) => {
      expect(
        readErrorTrackingEnv({ EXPO_PUBLIC_SENTRY_DSN: DSN, EXPO_PUBLIC_APP_ENV: appEnv }).environment
      ).toBe(appEnv);
    }
  );

  it('leaves environment undefined (not a default, not a throw) when EXPO_PUBLIC_APP_ENV is missing', () => {
    const env = readErrorTrackingEnv({ EXPO_PUBLIC_SENTRY_DSN: DSN });
    expect(env.environment).toBeUndefined();
    expect(env).not.toHaveProperty('environment');
  });

  it('leaves environment undefined when EXPO_PUBLIC_APP_ENV is an unrecognised value', () => {
    const env = readErrorTrackingEnv({ EXPO_PUBLIC_SENTRY_DSN: DSN, EXPO_PUBLIC_APP_ENV: 'staging' });
    expect(env.environment).toBeUndefined();
  });

  // Sentry-delivery debug (2026-09-25): same class of mistake as the Supabase URL, but the DSN
  // is read by the error-tracking-only reader, which must never throw over it.
  describe('quoted DSN', () => {
    it('treats a quoted DSN as unset with reason code quoted-value, without throwing', () => {
      const env = readErrorTrackingEnv({ EXPO_PUBLIC_SENTRY_DSN: `"${DSN}"` });
      expect(env.sentryDsn).toBeUndefined();
      expect(env.sentryDsnDisabledReason).toBe('quoted-value');
    });

    it('does not set sentryDsnDisabledReason for a normal DSN', () => {
      const env = readErrorTrackingEnv({ EXPO_PUBLIC_SENTRY_DSN: DSN });
      expect(env.sentryDsnDisabledReason).toBeUndefined();
      expect(env).not.toHaveProperty('sentryDsnDisabledReason');
    });
  });
});
