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

**ENV-13: provisioned, DSN wired.** `@sentry/react-native` (`~7.11.0`, SDK-compatible with Expo SDK 57 per `npx expo install`) is wired: `@sentry/react-native/expo` config plugin in `app.config.ts` (Hermes source-map upload during the Android Gradle build, `sendDefaultPii: false`), `getSentryExpoConfig` in `metro.config.js` (debug-ID injection), and `src/services/errors/errorReporter.ts` implements `initErrorReporting()`/`captureError(error, { area })` against Sentry, running every event through the existing `scrubMessage`/`scrubStackFrame` scrubber via `beforeSend`/`beforeBreadcrumb`, exactly as for the PostHog implementation this replaces. `setUser()` is never called — this client stays anonymous, independent of the product-analytics PostHog service.

**Region: US, not EU as originally decided.** Verified live against the API with the real `SENTRY_AUTH_TOKEN`: `https://de.sentry.io/api/0/organizations/fincwin/` returns `{"detail":"Invalid org token"}` for this org's token, while `https://sentry.io/` and `https://us.sentry.io/` both recognise it; the runtime DSN's ingest host is `o4512146535940096.ingest.us.sentry.io`; and the build-time sentry-cli upload logged `Using https://sentry.io (embedded in token) rather than manually-configured URL` — the token itself carries US-region routing. Sentry has no region-migration path short of creating a brand-new organisation, which is a decision only the account owner can make (cost/disruption of moving vs. accepting US hosting under the DPA/SCCs argument the project already uses for Supabase's US-hosted database — see `docs/decisions/supabase-environments.md`). `app.config.ts`'s plugin config no longer hardcodes an EU URL; it uses the plugin's own default (`https://sentry.io/`), which self-routes correctly regardless of region.

**D-18 legitimate-interest basis to be re-verified at the Compliance phase.** Unchanged by this decision — see `CLAUDE.md`'s compliance caveat and `.planning/PROJECT.md`'s Key Decisions.

## Sentry live proof

**Date:** 2026-09-25. One more Android preview build with `EXPO_PUBLIC_ERROR_SPIKE=1` still in place, after the Sentry wiring and EAS env vars (`EXPO_PUBLIC_SENTRY_DSN` plaintext, `SENTRY_AUTH_TOKEN` secret, `SENTRY_ORG`/`SENTRY_PROJECT` plaintext, all three EAS environments) were set.

**Build:** [`00838470-93e7-471e-975d-7bb7e625a2c6`](https://expo.dev/accounts/fincwin/projects/fincwin/builds/00838470-93e7-471e-975d-7bb7e625a2c6)

- **Source maps uploaded: yes**, confirmed from the build log: `sentry-cli react-native gradle` ran, bundled 2 files, uploaded them (`File upload complete`), against `Organization: fincwin`, `Projects: fincwin`, `Release: com.fincwin.app@0.1.0+1`, `Dist: 1`, with matching debug IDs (`99e11e76-417b-4a96-ab59-a0740a21f06a`) reported for both the bundle and its source map.
- **Spike fired: yes.** `adb logcat` shows Sentry's native module initialising (`Sentry: io.sentry.auto-init read: false`, confirming JS-side `Sentry.init()` took over as intended) followed by `FINCWIN_SPIKE_ERROR 12345` thrown ~3s after boot, then the same `expo-updates` fatal-crash path as the PostHog spike.
- **Event arrival: not independently verified via the API.** `SENTRY_AUTH_TOKEN` turned out to be scoped narrowly enough for `sentry-cli`'s release/source-map workflow (confirmed working: the org-scoped `releases/` list endpoint returns `200`) but not for reading data back: `GET /api/0/projects/{org}/{project}/`, `.../events/`, and `.../organizations/{org}/issues/` all return `403 "You do not have permission to perform this action."`, and the releases list itself returns an empty array despite the build log showing a release was genuinely created — consistent with a write-only (or release-write-only) token rather than a general-read one. This is a token-scope limitation, not evidence against delivery; confirming the event actually reached the Sentry dashboard needs either a token with `event:read`/`project:read` scope or a manual dashboard check by whoever holds the Sentry login.
- **Symbolication:** not independently confirmed for the same reason, though the successful, correctly-linked source-map upload (above) is the build-time half of what symbolication needs.

**Net effect on the decision:** none — the decision was already made on the PostHog-vs-Sentry architectural comparison (disk-persist-then-resend vs. fire-and-forget-then-race), not on this confirmatory step. This proof confirms the Sentry *wiring* is correct end-to-end up to the point the API token's scope stops further automated verification.

## Status at handoff

Code wiring, tests, EAS environment variables (all three environments), and this record are complete and committed. `maybeFireSpikeError`/`EXPO_PUBLIC_ERROR_SPIKE` have been removed from the codebase and the EAS `preview` environment.

**Open items for a human with Sentry dashboard access:**
1. Confirm the `FINCWIN_SPIKE_ERROR 12345` event from build `00838470` actually appears in the Sentry issues list, scrubbed and symbolicated as expected (`docs/decisions/error-tracking.md`'s Sentry live proof section above has everything needed to find it: release `com.fincwin.app@0.1.0+1`, ~2026-09-25T05:41 local).
2. Decide whether to keep the Sentry org on the US region or create a new EU-region org (no in-place migration exists) — see the Decision section's Region note.
