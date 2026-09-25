// D-18, D-19, T-00-16-02, T-00-16-03: always-on, anonymous, scrubbed crash/error reporting.
// This is a SEPARATE PostHog client from the product-analytics one (the consent-gated service
// the app's Analytics service wraps) — this module never imports that other service, never
// links this client to a person or resets its identity, and stays active even after the
// analytics service is disabled, because D-18 keeps crash reports on regardless of analytics
// consent (legitimate interest, disclosed in the privacy policy; re-verified at Compliance).
//
// The provider is chosen by getEnv().errorTracking. Only 'posthog' is implemented here — a
// 'sentry' branch is added in Task 3 only if the D-19 spike picks Sentry instead.
import PostHog from 'posthog-react-native';
import { getEnv, type ClientEnv } from '@/config/env';
import { scrubMessage, scrubStackFrame } from './scrub';

export type ErrorArea = 'auth' | 'theme' | 'sync' | 'boot' | 'unknown';

// The subset of the real PostHog client this module depends on, so tests can inject a fake
// without constructing the real SDK.
type ErrorClientLike = Pick<PostHog, 'captureException'>;
type ErrorClientFactory = (apiKey: string, options: object) => ErrorClientLike;

const defaultFactory: ErrorClientFactory = (apiKey, options) => new PostHog(apiKey, options);

// Loose, self-contained shapes for the before_send hook — deliberately not imported from
// @posthog/core (a transitive dependency), so this module's scrubbing logic never depends on
// exactly how the SDK's own types are structured internally.
interface ScrubbableException {
  value?: string;
  stacktrace?: { frames?: Record<string, unknown>[]; [key: string]: unknown };
  [key: string]: unknown;
}
interface ScrubbableCaptureEvent {
  event?: string;
  properties?: (Record<string, unknown> & { $exception_list?: ScrubbableException[] }) | undefined;
  [key: string]: unknown;
}

/**
 * The before-send hook wired into the PostHog client below. Scrubs every exception's message
 * and every stack frame before the event is enqueued for sending — T-00-16-01. Non-exception
 * events (and null, which a before_send hook may receive) pass through unchanged.
 */
function scrubCaptureEvent<E extends ScrubbableCaptureEvent | null>(event: E): E {
  const exceptionList = event?.properties?.$exception_list;
  if (!event || !Array.isArray(exceptionList)) return event;

  const scrubbedList = exceptionList.map((exception) => ({
    ...exception,
    value: typeof exception.value === 'string' ? scrubMessage(exception.value) : exception.value,
    stacktrace: exception.stacktrace
      ? {
          ...exception.stacktrace,
          frames: (exception.stacktrace.frames ?? []).map((frame) => scrubStackFrame(frame)),
        }
      : exception.stacktrace,
  }));

  return { ...event, properties: { ...event.properties, $exception_list: scrubbedList } };
}

let client: ErrorClientLike | undefined;

/**
 * Builds the always-on error-reporting client. `factory` and `env` are injectable for tests;
 * production code calls this with no arguments once, at app boot.
 *
 * Never throws. Error reporting exists to survive when something else in the app is broken —
 * including a misconfigured/incomplete environment unrelated to error tracking itself (e.g. a
 * different feature's required var not set yet). getEnv() validates the *whole* environment and
 * throws collectively on any missing required var, so it is deliberately not a default
 * parameter (default-parameter evaluation runs before this function's own try/catch could ever
 * see it) — it is resolved inside the try block below instead. A crash in error-reporting init
 * crashing the app it is meant to protect is exactly the failure mode this guards against.
 */
export function initErrorReporting(factory: ErrorClientFactory = defaultFactory, env?: ClientEnv): void {
  try {
    const resolvedEnv = env ?? getEnv();

    if (resolvedEnv.errorTracking !== 'posthog') {
      // Sentry branch added in Task 3 only if the D-19 spike selects Sentry.
      client = undefined;
      return;
    }
    if (!resolvedEnv.posthogKey) {
      // No PostHog project key configured yet — stay a no-op rather than construct a client
      // that can never send anything.
      client = undefined;
      return;
    }

    client = factory(resolvedEnv.posthogKey, {
      host: resolvedEnv.posthogHost,
      // D-18: never build a person profile for this client — crash reports are anonymous.
      personProfiles: 'never',
      enableSessionReplay: false,
      captureAppLifecycleEvents: false,
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          console: [],
        },
      },
      before_send: scrubCaptureEvent,
    });
  } catch {
    // Swallow: an app-config problem elsewhere must never take crash reporting down with it.
    client = undefined;
  }
}

/**
 * Reports a caught (or uncaught-and-rethrown) error, scoped to a finite area so no free text
 * can pass as context. No-ops before initErrorReporting() has built a client.
 */
export function captureError(error: unknown, context?: { area: ErrorArea }): void {
  if (!client) return;
  const err = error instanceof Error ? error : new Error(String(error));
  client.captureException(err, context);
}
