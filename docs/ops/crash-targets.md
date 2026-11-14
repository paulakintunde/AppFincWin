# Crash targets (APP-12)

**Date:** 2026-11-13

## Target

**At least 99.8% crash-free sessions over a 14-day closed test on Android.** iOS gets the same target in Phase 11, once there is a TestFlight build.

The closed test is the Play internal or closed track with the real testers. The 14 days run without a rebuild of the native part; an over-the-air update inside the window restarts the count only if it touches the crash path (the owner decides).

## What a crash report carries

- No amounts, names or emails. Messages and stack frames go through `scrubMessage` and `scrubStackFrame` (`src/services/errors/scrub.ts`) before they leave the phone (`beforeSend` in `src/services/errors/errorReporter.ts`).
- **No breadcrumb data.** `beforeBreadcrumb` drops each breadcrumb's `data` object and keeps only a scrubbed message. Breadcrumbs therefore cannot carry amounts, item names or ids.
- The client is anonymous: `sendDefaultPii: false` and `setUser()` is never called.
- Decide adds its own breadcrumbs from plan 05.5-09 (`src/services/errors/decideBreadcrumbs.ts`): `check_started`, `answer_shown`, `engine_error`, `setup_item_opened`. Each is a fixed event name with category `decide` and no data object. A test (05.5-09) proves the list is closed and that no free text can be added.

## How to read the figure in Sentry

1. Open the `fincwin` project in Sentry, Releases.
2. Pick the release `com.fincwin.app@<version>+<build>` of the closed-test build. Filter environment as needed (preview builds are currently tagged `production` because no environment is passed; see the open item in `docs/decisions/error-tracking.md`).
3. Read "Crash Free Sessions" for the 14-day window. A session counts as crashed when its end is a fatal JS or native crash.
4. Record the figure, the window dates and the release in the closed-test acceptance note. Below 99.8% the test is not passed; open an issue per top crash group.

## Open item: Android event delivery

Delivery of Android fatal events was fixed on 2026-09-25 (the `installFatalPersistDelay()` hold-back of `FATAL_PERSIST_DELAY_MS` = 3000 ms before the app dies, release builds only). The fix was proven in the device log, but nobody with Sentry dashboard access has yet confirmed in the dashboard that the probe events (`FINCWIN_SENTRY_PROBE_CAUGHT`, `FINCWIN_SENTRY_PROBE_FATAL`) arrived. The record is in `docs/decisions/error-tracking.md`, sections "Delivery fix" and "Status at handoff". (The plan named `.planning/debug/sentry-android-no-events.md`; that file does not exist on this branch, and `error-tracking.md` holds the same facts.) Until the dashboard check is done, the crash-free figure cannot be trusted: a zero-crash result could mean no events arrived.

Also still open there: strip the literal quotes from the three EAS variables, and pass an `environment` to Sentry.

## Not covered

Vendor retention for crash reports and the privacy wording are Phase 11 (`docs/compliance/data-map.md`, DM-26).
