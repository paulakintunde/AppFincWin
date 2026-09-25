// D-18, D-19, T-00-16-02, T-00-16-03: always-on, anonymous, scrubbed crash/error reporting.
// Sentry (D-19: chosen over PostHog after the spike — see docs/decisions/error-tracking.md,
// 3/3 real-device fatal crashes were lost with PostHog's fire-and-forget flush racing
// expo-updates' process teardown). This module is entirely separate from the product-analytics
// PostHog service — it never imports that other service, never links this client to a person
// or attaches a user id, and stays active even after the analytics service is disabled, because
// D-18 keeps crash reports on regardless of analytics consent (legitimate interest, disclosed
// in the privacy policy; re-verified at Compliance).
import * as Sentry from '@sentry/react-native';
import { getEnv, type ClientEnv } from '@/config/env';
import { scrubMessage, scrubStackFrame } from './scrub';

export type ErrorArea = 'auth' | 'theme' | 'sync' | 'boot' | 'unknown';

// The subset of the real Sentry module this file depends on, so tests can inject a fake
// without calling the real SDK's global init.
type SentryModule = Pick<typeof Sentry, 'init' | 'captureException'>;

const defaultSentryModule: SentryModule = Sentry;

// Loose, self-contained shapes for beforeSend/beforeBreadcrumb — deliberately not imported from
// @sentry/core's own Event/Breadcrumb types, so this module's scrubbing logic never depends on
// exactly how the SDK structures those internally. Field names (filename/function/lineno/colno/
// vars, exception.values[].value/stacktrace.frames) match scrub.ts's generic scrubStackFrame<T>.
interface ScrubbableException {
  value?: string;
  stacktrace?: { frames?: Record<string, unknown>[]; [key: string]: unknown };
  [key: string]: unknown;
}
interface ScrubbableSentryEvent {
  message?: string;
  exception?: { values?: ScrubbableException[]; [key: string]: unknown };
  [key: string]: unknown;
}
interface ScrubbableBreadcrumb {
  message?: string;
  data?: unknown;
  [key: string]: unknown;
}

/**
 * The beforeSend hook wired into Sentry.init() below. Scrubs the top-level message (if any) and
 * every exception's message/stack frames before the event leaves the device — T-00-16-01.
 */
function scrubSentryEvent<E extends ScrubbableSentryEvent | null>(event: E): E {
  if (!event) return event;

  let next: ScrubbableSentryEvent = event;
  if (typeof event.message === 'string') {
    next = { ...next, message: scrubMessage(event.message) };
  }

  const values = event.exception?.values;
  if (Array.isArray(values)) {
    const scrubbedValues = values.map((exception) => ({
      ...exception,
      value: typeof exception.value === 'string' ? scrubMessage(exception.value) : exception.value,
      stacktrace: exception.stacktrace
        ? {
            ...exception.stacktrace,
            frames: (exception.stacktrace.frames ?? []).map((frame) => scrubStackFrame(frame)),
          }
        : exception.stacktrace,
    }));
    next = { ...next, exception: { ...next.exception, values: scrubbedValues } };
  }

  return next as E;
}

/**
 * The beforeBreadcrumb hook wired into Sentry.init() below. Scrubs the message and drops `data`
 * entirely — auto-captured breadcrumbs (console, navigation, HTTP) can carry arbitrary
 * key/value pairs, and D-18 allows only type, stack frames and technical context.
 */
function scrubBreadcrumb<B extends ScrubbableBreadcrumb | null>(breadcrumb: B): B {
  if (!breadcrumb) return breadcrumb;
  const { data: _data, ...rest } = breadcrumb;
  return {
    ...rest,
    message: typeof breadcrumb.message === 'string' ? scrubMessage(breadcrumb.message) : breadcrumb.message,
  } as B;
}

let activeSentry: SentryModule | undefined;

/**
 * Initialises the always-on error-reporting client. `env` and `sentry` are injectable for
 * tests; production code calls this with no arguments once, at app boot.
 *
 * Never throws. Error reporting exists to survive when something else in the app is broken —
 * including a misconfigured/incomplete environment unrelated to error tracking itself (e.g. a
 * different feature's required var not set yet). getEnv() validates the *whole* environment and
 * throws collectively on any missing required var, so it is deliberately not a default
 * parameter (default-parameter evaluation runs before this function's own try/catch could ever
 * see it) — it is resolved inside the try block below instead. A crash in error-reporting init
 * crashing the app it is meant to protect is exactly the failure mode this guards against —
 * found live during the D-19 spike (see docs/decisions/error-tracking.md).
 */
export function initErrorReporting(env?: ClientEnv, sentry: SentryModule = defaultSentryModule): void {
  try {
    const resolvedEnv = env ?? getEnv();

    if (resolvedEnv.errorTracking !== 'sentry' || !resolvedEnv.sentryDsn) {
      // No Sentry DSN configured yet — stay a no-op rather than init with an empty DSN.
      activeSentry = undefined;
      return;
    }

    sentry.init({
      dsn: resolvedEnv.sentryDsn,
      // D-18: no email/IP/device-name auto-attached; identity is never linked to this client.
      sendDefaultPii: false,
      // Native crash handling is what the D-19 spike found PostHog's JS-only fire-and-forget
      // flush could not reliably beat: Sentry writes a fatal event to disk on the crashing
      // thread and uploads it on the *next* launch, rather than racing an in-flight network
      // call against the OS tearing the process down.
      enableNativeCrashHandling: true,
      enableAutoSessionTracking: true,
      beforeSend: (event) => scrubSentryEvent(event as unknown as ScrubbableSentryEvent) as never,
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb as unknown as ScrubbableBreadcrumb) as never,
    });
    activeSentry = sentry;
  } catch {
    // Swallow: an app-config problem elsewhere must never take crash reporting down with it.
    activeSentry = undefined;
  }
}

/**
 * Reports a caught (or uncaught-and-rethrown) error, scoped to a finite area so no free text
 * can pass as context. No-ops before initErrorReporting() has built a client. Never sets a
 * user id — D-18 keeps this client anonymous.
 */
export function captureError(error: unknown, context?: { area: ErrorArea }): void {
  if (!activeSentry) return;
  const err = error instanceof Error ? error : new Error(String(error));
  activeSentry.captureException(err, context ? { tags: { area: context.area } } : undefined);
}
