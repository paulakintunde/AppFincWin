// D-18, D-19, T-00-16-02: crash/error reporting must be a separate client from analytics
// (the product-analytics PostHog service), independent of consent, never identifying anyone,
// and every event must be scrubbed before it leaves the device. Sentry was chosen over PostHog
// after the D-19 spike — see docs/decisions/error-tracking.md. These tests inject a fake Sentry
// module — exactly like src/services/analytics/__tests__/consentGate.test.ts injects a fake
// PostHog client — so nothing here touches the real getEnv()/Sentry singleton.
import fs from 'fs';
import path from 'path';
import { initErrorReporting, captureError } from '../errorReporter';
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
  // implementation: initErrorReporting() must never take getEnv()'s default-parameter throw
  // (or any other init failure) down with it. getEnv() validates the *whole* environment and
  // throws when ANY required var is missing — including ones this module has nothing to do
  // with. Called with no env argument here so the real getEnv() runs and throws against Jest's
  // unset process.env, proving the function's own internal try/catch — not just a well-behaved
  // caller — is what survives it.
  it('never throws, even when resolving the real environment itself throws', () => {
    const sentry = makeFakeSentry();

    expect(() => initErrorReporting(undefined, sentry)).not.toThrow();
    expect(sentry.init).not.toHaveBeenCalled();
    expect(() => captureError(new Error('after a failed init'))).not.toThrow();
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
