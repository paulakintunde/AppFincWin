// D-18, D-19, T-00-16-02: crash/error reporting must be a separate client from analytics
// (the product-analytics PostHog service), independent of consent, never identifying anyone,
// and every event must be scrubbed before it leaves the device. Sentry was chosen over PostHog
// after the D-19 spike — see docs/decisions/error-tracking.md. These tests inject a fake Sentry
// module — exactly like src/services/analytics/__tests__/consentGate.test.ts injects a fake
// PostHog client — so nothing here touches the real getEnv()/Sentry singleton.
import fs from 'fs';
import path from 'path';
import { initErrorReporting, captureError, installFatalPersistDelay } from '../errorReporter';
import type { ClientEnv } from '@/config/env';

function makeFakeSentry() {
  return {
    init: jest.fn(),
    captureException: jest.fn(),
  };
}

function makeEnv(overrides: Partial<ClientEnv> = {}): ClientEnv {
  return {
    appEnv: 'development',
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'anon-key',
    googleWebClientId: 'web-client-id',
    appleSignInEnabled: false,
    posthogHost: 'https://eu.i.posthog.com',
    errorTracking: 'sentry',
    sentryDsn: 'https://examplePublicKey@o0.ingest.de.sentry.io/0',
    ...overrides,
  };
}

describe('errorReporter source (D-18 independence)', () => {
  it('never imports the analytics client — a fully separate client (D-18)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../errorReporter.ts'), 'utf8');
    expect(source).not.toMatch(/services\/analytics/);
  });

  it('never calls setUser() — anonymous and always-on (D-18)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../errorReporter.ts'), 'utf8');
    expect(source).not.toMatch(/\bsetUser\(/);
  });
});

describe('initErrorReporting', () => {
  it('initialises Sentry with the DSN, sendDefaultPii false, and native crash handling on', () => {
    const sentry = makeFakeSentry();

    initErrorReporting(makeEnv(), sentry);

    expect(sentry.init).toHaveBeenCalledTimes(1);
    const [options] = sentry.init.mock.calls[0] as [Record<string, unknown>];
    expect(options.dsn).toBe('https://examplePublicKey@o0.ingest.de.sentry.io/0');
    expect(options.sendDefaultPii).toBe(false);
    expect(options.enableNativeCrashHandling).toBe(true);
  });

  it('is a no-op with no Sentry DSN configured', () => {
    const sentry = makeFakeSentry();

    initErrorReporting(makeEnv({ sentryDsn: undefined }), sentry);
    expect(() => captureError(new Error('boom'))).not.toThrow();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('is a no-op when errorTracking is not sentry', () => {
    const sentry = makeFakeSentry();

    initErrorReporting(makeEnv({ errorTracking: 'posthog' }), sentry);

    expect(sentry.init).not.toHaveBeenCalled();
  });

  // Found live during the D-19 PostHog spike (Task 2), and kept true for the Sentry
  // implementation: initErrorReporting() must never throw. Called with no env argument here so
  // the real (error-tracking-only) env reader runs against Jest's process.env.
  it('never throws when resolving the real environment', () => {
    const sentry = makeFakeSentry();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const saved = process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    try {
      expect(() => initErrorReporting(undefined, sentry)).not.toThrow();
      expect(sentry.init).not.toHaveBeenCalled();
      expect(() => captureError(new Error('after a skipped init'))).not.toThrow();
    } finally {
      if (saved !== undefined) process.env.EXPO_PUBLIC_SENTRY_DSN = saved;
      warn.mockRestore();
    }
  });
});

describe('captureError', () => {
  it('forwards a caught error to Sentry with its context area as a tag', () => {
    const sentry = makeFakeSentry();
    initErrorReporting(makeEnv(), sentry);

    const error = new Error('x 42');
    captureError(error, { area: 'sync' });

    expect(sentry.captureException).toHaveBeenCalledWith(error, { tags: { area: 'sync' } });
  });

  it('forwards with no hint when no context is given', () => {
    const sentry = makeFakeSentry();
    initErrorReporting(makeEnv(), sentry);

    const error = new Error('no context');
    captureError(error);

    expect(sentry.captureException).toHaveBeenCalledWith(error, undefined);
  });

  it('wraps a non-Error throw in an Error before forwarding', () => {
    const sentry = makeFakeSentry();
    initErrorReporting(makeEnv(), sentry);

    captureError('a plain string throw');

    const [forwarded] = sentry.captureException.mock.calls[0] as [Error];
    expect(forwarded).toBeInstanceOf(Error);
  });

  it('is a no-op before initErrorReporting has built a client', () => {
    const sentry = makeFakeSentry();
    initErrorReporting(makeEnv({ sentryDsn: undefined }), sentry);

    expect(() => captureError(new Error('never sent'))).not.toThrow();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('beforeSend scrubbing (T-00-16-01)', () => {
  function initAndGetOptions(sentry: ReturnType<typeof makeFakeSentry>) {
    initErrorReporting(makeEnv(), sentry);
    return sentry.init.mock.calls[0][0] as {
      beforeSend: (event: unknown) => {
        message?: string;
        exception?: { values?: { value?: string; stacktrace?: { frames?: Record<string, unknown>[] } }[] };
      };
      beforeBreadcrumb: (breadcrumb: unknown) => { message?: string; data?: unknown };
    };
  }

  it('scrubs an exception message and drops stack-frame locals before the event is sent', () => {
    const sentry = makeFakeSentry();
    const { beforeSend } = initAndGetOptions(sentry);

    const rawEvent = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Invalid amount 123.45 for "Tesco Metro"',
            stacktrace: {
              frames: [
                {
                  filename: 'index.android.bundle',
                  function: 'renderDecideVerdict',
                  lineno: 42,
                  colno: 7,
                  vars: { amount: 12345, payee: 'Tesco Metro' },
                },
              ],
            },
          },
        ],
      },
    };

    const scrubbed = beforeSend(rawEvent);
    const exception = scrubbed.exception?.values?.[0];

    expect(exception?.value).toBe('Invalid amount <n> for <str>');
    expect(exception?.stacktrace?.frames?.[0]).not.toHaveProperty('vars');
    expect(exception?.stacktrace?.frames?.[0]).toMatchObject({
      filename: 'index.android.bundle',
      function: 'renderDecideVerdict',
      lineno: 42,
      colno: 7,
    });
  });

  it('scrubs a top-level event message', () => {
    const sentry = makeFakeSentry();
    const { beforeSend } = initAndGetOptions(sentry);

    const scrubbed = beforeSend({ message: 'user jane@example.com failed' });
    expect(scrubbed.message).toBe('user <email> failed');
  });

  it('passes a null event through unchanged (a beforeSend hook may receive null)', () => {
    const sentry = makeFakeSentry();
    const { beforeSend } = initAndGetOptions(sentry);
    expect(beforeSend(null as never)).toBeNull();
  });

  it('scrubs a breadcrumb message and drops its data entirely', () => {
    const sentry = makeFakeSentry();
    const { beforeBreadcrumb } = initAndGetOptions(sentry);

    const scrubbed = beforeBreadcrumb({
      message: 'charged $3.50 twice',
      data: { amount: 350, payee: 'Tesco Metro' },
    });

    expect(scrubbed.message).toBe('charged <n> twice');
    expect(scrubbed).not.toHaveProperty('data');
  });

  it('passes a null breadcrumb through unchanged', () => {
    const sentry = makeFakeSentry();
    const { beforeBreadcrumb } = initAndGetOptions(sentry);
    expect(beforeBreadcrumb(null as never)).toBeNull();
  });
});

// Sentry-delivery debug (2026-09-25): on every EAS build, getEnv() threw because an unrelated
// var (EXPO_PUBLIC_SUPABASE_URL) was stored with literal quotes, and initErrorReporting()
// swallowed it silently — Sentry was never initialised and no event ever arrived.
describe('initErrorReporting resolving the real environment', () => {
  const KEYS = ['EXPO_PUBLIC_SENTRY_DSN', 'EXPO_PUBLIC_ERROR_TRACKING', 'EXPO_PUBLIC_SUPABASE_URL'] as const;
  const saved: Record<string, string | undefined> = {};
  let warn: jest.SpyInstance;

  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    warn.mockRestore();
  });

  it('initialises Sentry from the DSN alone, even when the rest of the environment is invalid', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.us.sentry.io/0';
    process.env.EXPO_PUBLIC_SUPABASE_URL = '"https://abcxyz.supabase.co"';
    delete process.env.EXPO_PUBLIC_ERROR_TRACKING;
    const sentry = makeFakeSentry();

    expect(initErrorReporting(undefined, sentry)).toBe('enabled');

    expect(sentry.init).toHaveBeenCalledTimes(1);
    const [options] = sentry.init.mock.calls[0] as [Record<string, unknown>];
    expect(options.dsn).toBe('https://examplePublicKey@o0.ingest.us.sentry.io/0');
    captureError(new Error('reaches sentry'), { area: 'boot' });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns observably (naming the reason, never the DSN) when no DSN is configured', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_ERROR_TRACKING;
    const sentry = makeFakeSentry();

    expect(initErrorReporting(undefined, sentry)).toBe('disabled-no-dsn');

    expect(sentry.init).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/EXPO_PUBLIC_SENTRY_DSN/);
  });

  it('never throws and warns with the error name when EXPO_PUBLIC_ERROR_TRACKING is invalid', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.us.sentry.io/0';
    process.env.EXPO_PUBLIC_ERROR_TRACKING = 'bugsnag';
    const sentry = makeFakeSentry();

    expect(initErrorReporting(undefined, sentry)).toBe('failed');

    expect(sentry.init).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toMatch(/examplePublicKey/);
  });
});

describe('initErrorReporting status', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('returns failed, never throws, and warns when Sentry.init itself throws', () => {
    const sentry = makeFakeSentry();
    sentry.init.mockImplementation(() => {
      throw new TypeError('native module missing');
    });

    expect(initErrorReporting(makeEnv(), sentry)).toBe('failed');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => captureError(new Error('after failed init'))).not.toThrow();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('returns disabled-not-sentry when another tracker is selected', () => {
    expect(initErrorReporting(makeEnv({ errorTracking: 'posthog' }), makeFakeSentry())).toBe('disabled-not-sentry');
  });
});

// Sentry-delivery debug (2026-09-25), H2: on Android, Sentry's global handler calls the previous
// handler as soon as its JS flush resolves, but sentry-java only *enqueues* the envelope on a
// single-thread executor (AsyncHttpTransport.send) and writes it to disk later — so the RN default
// handler / expo-updates crashed the process first and every fatal JS event was lost (logcat,
// build f81838b1). The fix delays the ORIGINAL handler on fatals, installed before Sentry.init so
// Sentry wraps it.
describe('fatal persist delay', () => {
  type Handler = (error: unknown, isFatal?: boolean) => void;
  function makeFakeErrorUtils(initial: Handler) {
    let handler = initial;
    return {
      getGlobalHandler: jest.fn(() => handler),
      setGlobalHandler: jest.fn((next: Handler) => {
        handler = next;
      }),
      current: () => handler,
    };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('delays the original handler for a fatal error by the given window', () => {
    const original = jest.fn();
    const errorUtils = makeFakeErrorUtils(original);

    expect(installFatalPersistDelay(errorUtils, 3000)).toBe(true);
    const error = new Error('fatal');
    errorUtils.current()(error, true);

    expect(original).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2999);
    expect(original).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(original).toHaveBeenCalledWith(error, true);
  });

  it('passes a non-fatal error straight through', () => {
    const original = jest.fn();
    const errorUtils = makeFakeErrorUtils(original);
    installFatalPersistDelay(errorUtils, 3000);

    const error = new Error('soft');
    errorUtils.current()(error, false);

    expect(original).toHaveBeenCalledWith(error, false);
  });

  it('is idempotent — a second install does not stack another delay', () => {
    const errorUtils = makeFakeErrorUtils(jest.fn());
    installFatalPersistDelay(errorUtils, 3000);
    expect(installFatalPersistDelay(errorUtils, 3000)).toBe(false);
    expect(errorUtils.setGlobalHandler).toHaveBeenCalledTimes(1);
  });

  it('does nothing without ErrorUtils or with a zero window', () => {
    expect(installFatalPersistDelay(undefined, 3000)).toBe(false);
    const errorUtils = makeFakeErrorUtils(jest.fn());
    expect(installFatalPersistDelay(errorUtils, 0)).toBe(false);
    expect(errorUtils.setGlobalHandler).not.toHaveBeenCalled();
  });

  it('is installed BEFORE Sentry.init, so Sentry wraps the delaying handler', () => {
    const original = jest.fn();
    const errorUtils = makeFakeErrorUtils(original);
    let handlerSeenBySentry: Handler | undefined;
    const sentry = makeFakeSentry();
    sentry.init.mockImplementation(() => {
      handlerSeenBySentry = errorUtils.getGlobalHandler();
    });

    initErrorReporting(makeEnv(), sentry, { errorUtils, fatalPersistDelayMs: 3000 });

    expect(handlerSeenBySentry).toBeDefined();
    expect(handlerSeenBySentry).not.toBe(original);
    handlerSeenBySentry?.(new Error('fatal'), true);
    expect(original).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3000);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('does not touch the global handler when Sentry is not being enabled', () => {
    const errorUtils = makeFakeErrorUtils(jest.fn());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    initErrorReporting(makeEnv({ sentryDsn: undefined }), makeFakeSentry(), { errorUtils, fatalPersistDelayMs: 3000 });

    expect(errorUtils.setGlobalHandler).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
