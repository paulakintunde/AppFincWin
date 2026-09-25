# Error tracking (D-19)

## Spike

**Date:** 2026-09-25
**Trigger:** `maybeFireSpikeError()` (`src/services/errors/index.ts`) — throws `new Error('FINCWIN_SPIKE_ERROR 12345')` 3 seconds after boot, gated behind `EXPO_PUBLIC_ERROR_SPIKE=1`, only ever set on the `preview` EAS environment for this spike and deleted immediately after.

Two real Android preview builds, tested on a physical device (Pixel 6, not the emulator):

| Build | Purpose | Result |
|---|---|---|
| [`f399f6ec-5d14-479d-b23c-c2f58c9f84d7`](https://expo.dev/accounts/fincwin/projects/fincwin/builds/f399f6ec-5d14-479d-b23c-c2f58c9f84d7) | First spike attempt | Crashed on boot before the spike could even fire — `EnvError: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is required and was not set`, thrown from inside `initErrorReporting()`'s (then) eager `getEnv()` default parameter. This is the bug fixed in commit `2437550` — error reporting must never crash the app it exists to protect. Rebuilt after the fix, with a temporary placeholder `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to unblock the boot-time env check (removed afterward; not 00-16's variable to own) |
| [`a8b23c64-d3c2-4349-8774-8a9c5e2c139c`](https://expo.dev/accounts/fincwin/projects/fincwin/builds/a8b23c64-d3c2-4349-8774-8a9c5e2c139c) | Spike, with the fix in place | Booted correctly. Spike fired and was observed across **three separate app launches** (the app does not auto-restart after a fatal JS exception; each observation required a manual relaunch) |

### Evidence (PostHog)

- **Source maps uploaded: yes.** The build log shows the Gradle task `createBundleReleaseJsAndAssets_PostHogUpload` ran `posthog-cli`, cloned the Hermes source map, created release `com.fincwin.app@0.1.0+1`, and uploaded 1/1 chunks (`Upload summary: 1 chunk(s) uploaded, 0 skipped`) — wired via the `posthog-react-native/expo` config plugin and `metro.config.js`'s `getPostHogExpoConfig`.
- **Spike fired: yes**, reliably. `adb logcat` shows `FINCWIN_SPIKE_ERROR 12345` thrown ~3s after boot on all three launches, exactly as coded.
- **Event arrived in PostHog: no.** Queried PostHog EU (`select properties.$exception_list ... where event = '$exception' and timestamp > now() - interval 1 hour`) four times over several minutes, spanning all three launch/crash cycles (including a ~60s wait after the final one) — **zero results every time.**
- **Scrubbed:** not applicable — no event arrived to inspect.
- **Symbolicated:** not applicable for the same reason, though the successful build-time upload (above) means a delivered event likely would have been.
- **Identity linked:** not applicable — no event arrived.

### Root cause

Read directly from the installed `posthog-react-native` SDK source (`ErrorTracking.autocaptureUncaughtErrors`): on a fatal exception the handler calls `captureException()`, then a **fire-and-forget** `flush()` — `void this.instance.flush().catch(...)`, never awaited — before returning control to the RN exception-handler chain. In this build, `expo-updates`' error-recovery mechanism kills the process **~130–180ms** after the throw (measured from `adb logcat` timestamps: JS throw → `AndroidRuntime FATAL EXCEPTION` → `Process ... has died`). The SDK does expose a `persistFatalException` hook intended to write the event to disk before the crash proceeds, but that write is itself async and is invoked the same fire-and-forget way — across three relaunches (which is when a persisted, disk-backed queue would normally flush), nothing ever appeared in PostHog, consistent with the disk write also losing the same race.

Ruled out as false negatives: the device had an active default network throughout (`adb shell dumpsys connectivity`); PostHog ingestion lag was accounted for with repeated waits up to ~70s; the APK was reinstalled cleanly before each attempt.

**Scope of the finding:** this is specific to genuinely fatal/uncaught crashes racing a fast process teardown, not to PostHog generally. The wiring itself (consent-independent client construction, scrubbing pipeline, source-map upload) all worked correctly — this is exactly what the spike was designed to test, and on that specific, hardest case, delivery failed reproducibly on a real device.

## Decision

Decision: Sentry

Sentry's mobile SDKs write a fatal event to disk **synchronously on the crashing thread** and upload it on the **next app launch**, rather than racing an in-flight network call against OS process teardown — the exact failure mode the PostHog spike reproduced three times. This is the standard, "battle-tested on RN" crash-reporting pattern their reputation is built on, and it is the direct mitigation for what the spike found.

**ENV-13: provisioned, DSN wired.** `@sentry/react-native` (`~7.11.0`, SDK-compatible with Expo SDK 57 per `npx expo install`) is wired: `@sentry/react-native/expo` config plugin in `app.config.ts` (Hermes source-map upload during the Android Gradle build, `sendDefaultPii: false`, EU region `https://de.sentry.io/`), `getSentryExpoConfig` in `metro.config.js` (debug-ID injection), and `src/services/errors/errorReporter.ts` implements `initErrorReporting()`/`captureError(error, { area })` against Sentry, running every event through the existing `scrubMessage`/`scrubStackFrame` scrubber via `beforeSend`/`beforeBreadcrumb`, exactly as for the PostHog implementation this replaces. `setUser()` is never called — this client stays anonymous, independent of the product-analytics PostHog service.

**D-18 legitimate-interest basis to be re-verified at the Compliance phase.** Unchanged by this decision — see `CLAUDE.md`'s compliance caveat and `.planning/PROJECT.md`'s Key Decisions.

### Status at handoff

Code wiring, tests, and this record are complete and committed. Two items remain blocked, pending real secret values:

1. `.env.local` has `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` present as keys but **empty** (confirmed at the byte level in both this worktree and the main checkout) — no `SENTRY_ORG`/`SENTRY_PROJECT` lookup, EAS environment wiring, or live Sentry-delivery proof could be completed without them.
2. Once real values are available: look up `SENTRY_ORG`/`SENTRY_PROJECT` via `GET https://de.sentry.io/api/0/organizations/` (then `.../projects/`) with `SENTRY_AUTH_TOKEN`, record them in `.env.local`, add all four vars to the EAS environments (`EXPO_PUBLIC_SENTRY_DSN` plaintext, `SENTRY_AUTH_TOKEN` secret, `SENTRY_ORG`/`SENTRY_PROJECT` plaintext), and — if it's cheap — repeat the spike-crash proof against Sentry (one Android preview build, confirm the event appears in the Sentry API after a relaunch) before deleting `maybeFireSpikeError`/`EXPO_PUBLIC_ERROR_SPIKE`.
