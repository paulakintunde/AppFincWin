// D-18, D-19, T-00-16-02: crash/error reporting must be a separate client from analytics
// (src/services/analytics/posthog.ts), independent of consent, never identifying anyone, and
// every event must be scrubbed before it leaves the device. These tests inject a fake client —
// exactly like src/services/analytics/__tests__/consentGate.test.ts — so nothing here touches
// the real getEnv()/PostHog singleton.
import fs from 'fs';
import path from 'path';
import { initErrorReporting, captureError } from '../errorReporter';
import type { ClientEnv } from '@/config/env';

function makeFakeClient() {
  return {
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
    posthogKey: 'phc_test_key',
    posthogHost: 'https://eu.i.posthog.com',
    errorTracking: 'posthog',
    ...overrides,
  };
}

describe('errorReporter source (D-18 independence)', () => {
  it('never imports the analytics client — a fully separate client (D-18)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../errorReporter.ts'), 'utf8');
    expect(source).not.toMatch(/services\/analytics/);
  });

  it('never calls identify() or optOut() — anonymous and always-on (D-18)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../errorReporter.ts'), 'utf8');
    expect(source).not.toMatch(/\bidentify\(/);
    expect(source).not.toMatch(/\boptOut\(/);
  });
});

describe('initErrorReporting', () => {
  it('constructs its own PostHog client with personProfiles never, session replay off, and lifecycle autocapture off', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);

    initErrorReporting(factory, makeEnv());

    expect(factory).toHaveBeenCalledTimes(1);
    const [apiKey, options] = factory.mock.calls[0] as [string, Record<string, unknown>];
    expect(apiKey).toBe('phc_test_key');
    expect(options.host).toBe('https://eu.i.posthog.com');
    expect(options.personProfiles).toBe('never');
    expect(options.enableSessionReplay).toBe(false);
    expect(options.captureAppLifecycleEvents).toBe(false);
  });

  it('enables uncaught-exception and unhandled-rejection autocapture', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);

    initErrorReporting(factory, makeEnv());

    const [, options] = factory.mock.calls[0] as [string, { errorTracking?: { autocapture?: { uncaughtExceptions?: boolean; unhandledRejections?: boolean } } }];
    expect(options.errorTracking?.autocapture?.uncaughtExceptions).toBe(true);
    expect(options.errorTracking?.autocapture?.unhandledRejections).toBe(true);
  });

  it('is a no-op with no PostHog key configured', () => {
    const factory = jest.fn();

    initErrorReporting(factory, makeEnv({ posthogKey: undefined }));
    expect(() => captureError(new Error('boom'))).not.toThrow();

    expect(factory).not.toHaveBeenCalled();
  });
});

describe('captureError', () => {
  it('forwards a caught error to the client with its context area', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);
    initErrorReporting(factory, makeEnv());

    const error = new Error('x 42');
    captureError(error, { area: 'sync' });

    expect(client.captureException).toHaveBeenCalledWith(error, { area: 'sync' });
  });

  it('wraps a non-Error throw in an Error before forwarding', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);
    initErrorReporting(factory, makeEnv());

    captureError('a plain string throw');

    const [forwarded] = client.captureException.mock.calls[0] as [Error];
    expect(forwarded).toBeInstanceOf(Error);
  });

  it('is a no-op before initErrorReporting is called with a real key', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);
    initErrorReporting(factory, makeEnv({ posthogKey: undefined }));

    expect(() => captureError(new Error('never sent'))).not.toThrow();
    expect(client.captureException).not.toHaveBeenCalled();
  });
});

describe('before_send scrubbing (T-00-16-01)', () => {
  it('scrubs the exception message and drops stack-frame locals before the event is sent', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);
    initErrorReporting(factory, makeEnv());

    const [, options] = factory.mock.calls[0] as [
      string,
      { before_send: (event: unknown) => { properties: { $exception_list: { value?: string; stacktrace?: { frames?: Record<string, unknown>[] } }[] } } },
    ];

    const rawEvent = {
      event: '$exception',
      properties: {
        $exception_list: [
          {
            type: 'Error',
            value: 'Invalid amount 123.45 for "Tesco Metro"',
            stacktrace: {
              type: 'raw',
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

    const scrubbed = options.before_send(rawEvent);
    const exception = scrubbed.properties.$exception_list[0]!;

    expect(exception.value).toBe('Invalid amount <n> for <str>');
    expect(exception.stacktrace?.frames?.[0]).not.toHaveProperty('vars');
    expect(exception.stacktrace?.frames?.[0]).toMatchObject({
      filename: 'index.android.bundle',
      function: 'renderDecideVerdict',
      lineno: 42,
      colno: 7,
    });
  });

  it('passes non-exception events through unchanged', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);
    initErrorReporting(factory, makeEnv());

    const [, options] = factory.mock.calls[0] as [string, { before_send: (event: unknown) => unknown }];

    const event = { event: '$pageview', properties: { url: 'app://home' } };
    expect(options.before_send(event)).toEqual(event);
  });

  it('passes a null event through unchanged (a before_send hook may receive null)', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);
    initErrorReporting(factory, makeEnv());

    const [, options] = factory.mock.calls[0] as [string, { before_send: (event: unknown) => unknown }];
    expect(options.before_send(null)).toBeNull();
  });
});
