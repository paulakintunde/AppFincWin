// ANL-01, ANL-02, ANL-04, ENV-14, D-23: the consent-gated PostHog service. No autocapture, no
// PostHogProvider — every event this app ever sends goes through track() below, gated behind
// an explicit enable(). Crash/error reporting is NOT part of this module: D-18 keeps it on
// regardless of analytics consent, through a separate client built in 00-16, so declining
// analytics never disables crash reports and consenting never identifies them.
import PostHog from 'posthog-react-native';
import { getEnv } from '@/config/env';
import type { EventName, EventProps } from './catalogue';

// T-00-13-03: identity is a Supabase UUID (v1-8) only, never a free-form string.
const SUPABASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface Analytics {
  /** Opts the user in and identifies them by their Supabase UUID. Throws if userId isn't a UUID. */
  enable(userId: string): void;
  /** Opts the user out and resets identity — call from sign-out and the wipe registry (00-18). */
  disable(): Promise<void>;
  /** No-ops before enable() and after disable(). */
  track<E extends EventName>(event: E, properties: EventProps<E>): void;
  isEnabled(): boolean;
}

// The subset of the real PostHog client this service depends on, so tests can inject a fake
// without constructing the real SDK.
type PostHogLike = Pick<PostHog, 'optIn' | 'optOut' | 'identify' | 'reset' | 'capture'>;
type PostHogFactory = (apiKey: string, options: object) => PostHogLike;

const defaultFactory: PostHogFactory = (apiKey, options) => new PostHog(apiKey, options);

/**
 * Builds the analytics service. `factory` and `env` are injectable for tests; production code
 * should always call this with no arguments via {@link getAnalytics}.
 */
export function createAnalytics(factory: PostHogFactory = defaultFactory, env = getEnv()): Analytics {
  const { posthogKey, posthogHost } = env;

  if (!posthogKey) {
    // No PostHog project key configured yet (e.g. before this plan's checkpoint is completed,
    // or in a test/CI environment) — return a no-op service that never constructs PostHog at all.
    return {
      enable() {
        /* no-op: no key configured */
      },
      async disable() {
        /* no-op: no key configured */
      },
      track() {
        /* no-op: no key configured */
      },
      isEnabled: () => false,
    };
  }

  const client = factory(posthogKey, {
    host: posthogHost,
    defaultOptIn: false,
    enableSessionReplay: false,
    captureAppLifecycleEvents: false,
    flushAt: 20,
  });

  // T-00-13-01: belt-and-braces — opt out immediately after construction on top of
  // defaultOptIn:false, so a misbehaving SDK default still cannot send before consent.
  void client.optOut();

  let enabled = false;

  return {
    enable(userId: string) {
      if (!SUPABASE_UUID.test(userId)) {
        throw new Error(
          `Analytics.enable: userId must be a Supabase UUID, got ${JSON.stringify(userId)}`
        );
      }
      void client.optIn();
      // ANL-01: identify by UUID only — no person properties (name/email/etc).
      client.identify(userId);
      enabled = true;
    },
    async disable() {
      enabled = false;
      await client.optOut();
      client.reset();
    },
    track<E extends EventName>(event: E, properties: EventProps<E>) {
      // Second gate in front of capture, independent of the SDK's own opt-in state, so a
      // consent bug in the SDK can never override this service's own enabled flag.
      if (!enabled) return;
      client.capture(event, properties);
    },
    isEnabled() {
      return enabled;
    },
  };
}

let instance: Analytics | undefined;

// Lazy singleton: importing this module must never read env (so it's safe to import for types
// or re-exports in a test environment without a full .env). getEnv() only runs on first call.
export function getAnalytics(): Analytics {
  return (instance ??= createAnalytics());
}
