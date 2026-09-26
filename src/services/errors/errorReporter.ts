// D-18, D-19, T-00-16-02, T-00-16-03: always-on, anonymous, scrubbed crash/error reporting.
// Sentry (D-19: chosen over PostHog after the spike — see docs/decisions/error-tracking.md,
// 3/3 real-device fatal crashes were lost with PostHog's fire-and-forget flush racing
// expo-updates' process teardown). This module is entirely separate from the product-analytics
// PostHog service — it never imports that other service, never links this client to a person
// or attaches a user id, and stays active even after the analytics service is disabled, because
// D-18 keeps crash reports on regardless of analytics consent (legitimate interest, disclosed
// in the privacy policy; re-verified at Compliance).
import * as Sentry from '@sentry/react-native';
import { getErrorTrackingEnv, type ErrorTrackingEnv } from '@/config/env';
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

// Minimal shape of React Native's global ErrorUtils, injectable for tests.
type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): GlobalErrorHandler;
  setGlobalHandler(handler: GlobalErrorHandler): void;
}

/**
 * How long a fatal JS error's teardown is held back so the native Sentry SDK can persist (and
 * usually send) the event first. Found live 2026-09-25 (build f81838b1, logcat): Sentry's global
 * handler awaits its JS flush and then calls the previous handler, but on Android the JS flush
 * resolves as soon as sentry-java has *enqueued* the envelope — AsyncHttpTransport.send() submits
 * it to a single-thread executor and only EnvelopeSender.run() writes it to disk. React Native's
 * default handler then crashed the process (via expo-updates' error recovery) ~25ms later, while
 * that executor was still busy with another upload, and the fatal event was never written to disk.
 * iOS stores fatal envelopes synchronously upstream (sentry-react-native PR 3031); Android has no
 * equivalent as of @sentry/react-native 8.28. Bounded, not a completion signal: a very slow
 * in-flight upload can still outlast it. Crashing apps sit on a frozen screen for this long.
 */
export const FATAL_PERSIST_DELAY_MS = 3000;
const DELAY_MARKER = '__fincwinFatalPersistDelay';

/**
 * Wraps the CURRENT global JS error handler so that, for fatal errors only, it runs after
 * `delayMs`. Must be installed before Sentry.init(): Sentry captures whatever handler exists at
 * init as its "default" and calls it after flushing, so the delay lands exactly between Sentry's
 * capture and the process teardown. Non-fatal errors pass straight through. Idempotent.
 * Returns whether it installed.
 */
export function installFatalPersistDelay(
  errorUtils: ErrorUtilsLike | undefined,
  delayMs: number,
  schedule: (callback: () => void, ms: number) => unknown = setTimeout
): boolean {
  if (!errorUtils || delayMs <= 0) return false;
  const previous = errorUtils.getGlobalHandler();
  if ((previous as unknown as Record<string, unknown>)[DELAY_MARKER]) return false;

  const delayed: GlobalErrorHandler = (error, isFatal) => {
    if (!isFatal) {
      previous(error, isFatal);
      return;
    }
    schedule(() => previous(error, isFatal), delayMs);
  };
  (delayed as unknown as Record<string, unknown>)[DELAY_MARKER] = true;
  errorUtils.setGlobalHandler(delayed);
  return true;
}

function globalErrorUtils(): ErrorUtilsLike | undefined {
  return (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
}

export interface InitErrorReportingOptions {
  errorUtils?: ErrorUtilsLike;
  /** Defaults to {@link FATAL_PERSIST_DELAY_MS} in release builds and 0 (off) under __DEV__. */
  fatalPersistDelayMs?: number;
}

/** Outcome of {@link initErrorReporting}, returned so a skipped init is never silent. */
export type ErrorReportingStatus = 'enabled' | 'disabled-not-sentry' | 'disabled-no-dsn' | 'failed';

// Once-per-launch, value-free diagnostic (visible in Metro and in `adb logcat` as ReactNativeJS).
// Never includes the DSN or any env value — only a reason code and, on failure, an error name.
function warnSkipped(reason: string): void {
  console.warn(`[errors] Sentry error reporting is OFF for this launch: ${reason}`);
}

/**
 * Initialises the always-on error-reporting client. `env` and `sentry` are injectable for
 * tests; production code calls this with no arguments once, at app boot.
 *
 * Reads ONLY the error-tracking keys (getErrorTrackingEnv), never the whole-app getEnv(): crash
 * reporting must stay up when an unrelated var is missing or malformed. Before this fix, a
 * quoted EXPO_PUBLIC_SUPABASE_URL in every EAS environment made getEnv() throw, the catch below
 * swallowed it, and Sentry was never initialised on any build (see
 * docs/decisions/error-tracking.md, "Delivery fix").
 *
 * Also holds back fatal-error teardown so the event is persisted first — see
 * {@link FATAL_PERSIST_DELAY_MS}.
 *
 * Never throws. A crash in error-reporting init crashing the app it is meant to protect is
 * exactly the failure mode this guards against — found live during the D-19 spike (see
 * docs/decisions/error-tracking.md). Any skip or failure is reported via console.warn once.
 */
export function initErrorReporting(
  env?: ErrorTrackingEnv,
  sentry: SentryModule = defaultSentryModule,
  options: InitErrorReportingOptions = {}
): ErrorReportingStatus {
  activeSentry = undefined;
  try {
    const resolvedEnv = env ?? getErrorTrackingEnv();

    if (resolvedEnv.errorTracking !== 'sentry') {
      warnSkipped(`EXPO_PUBLIC_ERROR_TRACKING selects ${resolvedEnv.errorTracking}`);
      return 'disabled-not-sentry';
    }
    if (!resolvedEnv.sentryDsn) {
      // No Sentry DSN configured — stay a no-op rather than init with an empty DSN. A quoted
      // value (the exact class of mistake this whole debug session traced) gets a more specific,
      // still value-free, reason than a plain "not set".
      warnSkipped(
        resolvedEnv.sentryDsnDisabledReason === 'quoted-value'
          ? 'EXPO_PUBLIC_SENTRY_DSN is wrapped in literal quotes — remove them in EAS/.env'
          : 'EXPO_PUBLIC_SENTRY_DSN is not set in this bundle'
      );
      return 'disabled-no-dsn';
    }

    // Before sentry.init(), so Sentry's handler wraps the delaying one (see the function's docs).
    installFatalPersistDelay(
      options.errorUtils ?? globalErrorUtils(),
      options.fatalPersistDelayMs ?? (__DEV__ ? 0 : FATAL_PERSIST_DELAY_MS)
    );

    sentry.init({
      dsn: resolvedEnv.sentryDsn,
      // Tags every event with the build channel (development|preview|production) so Sentry's
      // dashboard can be filtered by it. Omitted entirely (not passed as undefined) when
      // EXPO_PUBLIC_APP_ENV is missing or unrecognised — see ErrorTrackingEnv['environment'].
      ...(resolvedEnv.environment ? { environment: resolvedEnv.environment } : {}),
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
    return 'enabled';
  } catch (error) {
    // Swallow (never crash the app), but never silently: name the error type, not its message,
    // since env error messages can echo configuration values.
    activeSentry = undefined;
    warnSkipped(`init failed (${error instanceof Error ? error.name : typeof error})`);
    return 'failed';
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
