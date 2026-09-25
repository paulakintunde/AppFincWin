---
phase: 00-foundation
plan: 16
subsystem: infra
tags: [sentry, posthog, error-tracking, crash-reporting, eas, expo-router-plugin, metro, gdpr]

# Dependency graph
requires:
  - phase: 00-foundation (plan 13)
    provides: "src/services/analytics/posthog.ts — the consent-gated PostHog analytics service this module stays deliberately separate from"
  - phase: 00-foundation (plan 14)
    provides: "EAS project, build profiles, and the eas env:set pattern for loading environment variables into development/preview/production"
provides:
  - "src/services/errors/{scrub,errorReporter,index}.ts — scrubMessage/scrubStackFrame (pure), initErrorReporting()/captureError(error, { area }) backed by Sentry, always-on and consent-independent (D-18)"
  - "docs/decisions/error-tracking.md — the D-19 spike record: full PostHog evidence (3/3 real-device fatal crashes lost), the Sentry decision and rationale, the US-region finding, and the Sentry live-build proof"
  - "@sentry/react-native wired end-to-end: app.config.ts's @sentry/react-native/expo plugin, metro.config.js's getSentryExpoConfig, EAS env vars (EXPO_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT) across all three EAS environments"
affects: ["01-15 (write queue calls captureError(error, { area: 'sync' }) — export shape preserved)", "Compliance phase (D-18 legitimate-interest re-verification; Sentry US-region vs originally-decided EU region)"]

# Tech tracking
tech-stack:
  added:
    - "@sentry/react-native ~7.11.0 (Expo SDK 57 compatible, via npx expo install)"
  patterns:
    - "A second, fully independent error-reporting client (Sentry) that never imports the analytics service, never links identity, and stays active regardless of analytics consent — same isolation pattern PostHog's own consent-gated service uses, mirrored for the opposite always-on requirement (D-18)"
    - "initErrorReporting()'s env resolution happens inside its own try/catch, never as a default parameter — a lesson learned live when an unrelated required env var crashed the whole app at boot before this fix"
    - "before-send/before-breadcrumb hooks are the scrubbing seam: pure scrubMessage/scrubStackFrame functions are reused unchanged across both the PostHog and Sentry implementations, since both SDKs expose structurally similar Exception/StackFrame/Breadcrumb shapes"

key-files:
  created:
    - src/services/errors/scrub.ts
    - src/services/errors/errorReporter.ts
    - src/services/errors/index.ts
    - src/services/errors/__tests__/scrub.test.ts
    - src/services/errors/__tests__/errorReporter.test.ts
    - metro.config.js
    - docs/decisions/error-tracking.md
    - .planning/phases/00-foundation/deferred-items.md
  modified:
    - app.config.ts
    - app/_layout.tsx
    - src/config/env.ts
    - package.json
    - package-lock.json
    - .env.example
    - docs/dependency-register.md
    - docs/ops/eas-environments.md

key-decisions:
  - "D-19: Sentry over PostHog for crash/error reporting. The D-19 spike deliberately threw an uncaught error on a real EAS Android build; PostHog's fire-and-forget flush() lost the event to expo-updates' process teardown on 3/3 attempts across two real-device sessions. Sentry's disk-persist-then-resend-on-next-launch pattern is the direct architectural mitigation, and its build-time wiring (source-map upload, native module init) was verified working on a separate real build. PostHog stays for consent-gated product analytics only"
  - "The actual Sentry org ('fincwin') is provisioned on the US region, not EU as originally decided — discovered live via the API (de.sentry.io rejects the org's token; sentry.io/us.sentry.io both accept it; the DSN's ingest host is ...ingest.us.sentry.io). Sentry has no in-place region migration; only creating a new org would move it. Left as an open decision for whoever holds the Sentry account — documented in docs/decisions/error-tracking.md rather than resolved unilaterally"
  - "SENTRY_AUTH_TOKEN is scoped for sentry-cli's release/source-map workflow only, not general API reads (confirmed: releases list endpoint works, but project/issues/events endpoints all return 403). This is good least-privilege practice for a CI token, but it means the Sentry live-build proof could verify source-map upload and spike-firing directly, but not final event arrival via the API — left as a manual dashboard check for whoever has Sentry login access"
  - "initErrorReporting()'s env parameter changed from env: ClientEnv = getEnv() (default parameter) to env?: ClientEnv resolved inside try/catch — default-parameter evaluation runs before a function body's own try/catch can see it, so the original signature let an unrelated env failure (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID missing, owned by 00-15) crash the entire app at boot. Confirmed live via a real EAS build crash before the fix, and via a regression test after"

patterns-established:
  - "Pattern: an SDK-backed service that must survive regardless of the rest of the app's configuration state (error reporting, analogous to a circuit breaker) should never let its own init depend on a default-parameter call to a function that can throw — resolve fallible config inside the function's own try/catch"

requirements-completed: [ENV-13]

# Metrics
duration: ~3h 40min wall-clock across two sessions (a human-action checkpoint for missing Sentry secret values sits in the middle; active work was closer to 2h, split across a PostHog spike investigation, a decision-swap to Sentry, and a live Sentry build proof)
completed: 2026-09-25
---

# Phase 00 Plan 16: D-19 Error-Tracking Spike (PostHog → Sentry) Summary

**Consent-independent crash/error reporting backed by Sentry (chosen over PostHog after a live-device D-19 spike found PostHog's fire-and-forget exception flush lost 3/3 real fatal crashes to `expo-updates`' fast process teardown), with a pure scrubbing pipeline shared across both SDK implementations, EAS source-map upload verified on two real Android builds, and a mid-flight fix for a live-discovered app-boot crash bug.**

## Performance

- **Duration:** ~3h 40min wall-clock, split across two sessions with a human-action checkpoint (missing Sentry secret values) in between
- **Completed:** 2026-09-25
- **Tasks:** 3 (Task 1 autonomous; Task 2 a `checkpoint:decision` resolved by the user as "sentry"; Task 3 executed post-decision, with one further checkpoint for missing credentials)
- **Files modified:** 8 created, 8 modified (see frontmatter)

## Accomplishments

- **The D-19 spike ran for real, twice, on physical hardware** (a connected Android device, not the emulator) — first proving PostHog's uncaught-exception delivery fails under `expo-updates`' fast crash-recovery teardown (0/3 real-device attempts delivered, despite correct wiring and a successful build-time source-map upload), then proving Sentry's wiring is correct end-to-end (source maps uploaded and debug-ID-linked; native module initializes; spike fires) on a second build.
- **`src/services/errors/{scrub,errorReporter,index}.ts`**: `scrubMessage`/`scrubStackFrame` are pure, SDK-agnostic functions (redact emails, quoted strings, currency amounts, 4+-digit runs; keep only filename/function/line/column from stack frames) reused unchanged across the PostHog prototype and the final Sentry implementation. `initErrorReporting()`/`captureError(error, { area })` build a Sentry client that is entirely separate from the product-analytics PostHog service, never calls `setUser()`, and never throws even if the rest of the app's environment is misconfigured.
- **Full Sentry build wiring**: `@sentry/react-native ~7.11.0`, `@sentry/react-native/expo` config plugin (Hermes source-map upload during the Android Gradle build; `authToken` deliberately never passed as a plugin prop, so it's never written to `sentry.properties`), `getSentryExpoConfig` in `metro.config.js`, and all four Sentry env vars (`EXPO_PUBLIC_SENTRY_DSN` plaintext, `SENTRY_AUTH_TOKEN` secret, `SENTRY_ORG`/`SENTRY_PROJECT` plaintext) set across `development`/`preview`/`production` EAS environments.
- **`docs/decisions/error-tracking.md`**: the full spike record — dates, both PostHog build ids, the fire-and-forget-flush-vs-teardown root cause read directly from the installed SDK source, `Decision: Sentry`, `ENV-13: provisioned, DSN wired`, the US-region finding with its live API verification, the Sentry live-proof build id and evidence, and open items for a human with Sentry dashboard access.
- **A live-discovered bug fixed mid-plan**: `initErrorReporting()`'s original `env: ClientEnv = getEnv()` default parameter let an *unrelated* env validation failure (a different feature's required var not yet set) crash the entire app at boot — confirmed via a real EAS build that failed to boot, fixed by resolving env inside the function's own try/catch, and covered by a new regression test.

## Task Commits

1. **Task 1: Scrubber + PostHog error reporter + source-map upload wiring** — RED `31f8f66` (test), GREEN `2c785da` (feat)
2. **(Discovery, logged not fixed) Pre-existing flaky test found during full-suite verification** — `2c32216` (docs)
3. **Task 2: D-19 spike, run twice on real hardware** — no code commit (checkpoint task); evidence gathered and reported in two `CHECKPOINT REACHED` handbacks
4. **(Live bug fix found during Task 2) `initErrorReporting()` crash-proofing** — `2437550` (fix)
5. **Task 3, part 1: Sentry SDK + Expo/metro plugin wiring** — `1fae1bf` (feat)
6. **Task 3, part 2: rewrite tests for Sentry (RED)** — `0ec956b` (test)
7. **Task 3, part 3: Sentry-backed errorReporter implementation (GREEN)** — `39b13e3` (feat)
8. **Task 3, part 4: decision doc + dependency register + env docs (first pass)** — `a8b8193` (docs)
9. **(Live discovery during EAS env wiring) Sentry region correction** — `2f60a56` (fix)
10. **Task 3, part 5: remove the spike trigger** — `aa09dea` (feat)
11. **Task 3, part 6: final decision-doc update with the live Sentry proof** — `05fdffe` (docs)

**Plan metadata:** this commit (docs: complete plan) — created alongside this SUMMARY

## Files Created/Modified

- `src/services/errors/scrub.ts` — pure `scrubMessage`/`scrubStackFrame`, SDK-agnostic
- `src/services/errors/errorReporter.ts` — `initErrorReporting()`/`captureError()` against Sentry, never throws, never links identity
- `src/services/errors/index.ts` — public exports (spike trigger removed)
- `src/services/errors/__tests__/{scrub,errorReporter}.test.ts` — 28 tests total
- `metro.config.js` — `getSentryExpoConfig` wraps Expo's default config
- `app.config.ts` — `@sentry/react-native/expo` plugin (no hardcoded region URL — the plugin's own default self-routes correctly)
- `app/_layout.tsx` — calls `initErrorReporting()` unconditionally at module load
- `src/config/env.ts` — default `errorTracking` changed to `'sentry'`
- `package.json`/`package-lock.json` — `@sentry/react-native` added, `@posthog/cli` removed
- `.env.example` — `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` added (names only), `EXPO_PUBLIC_ERROR_TRACKING` default to `sentry`
- `docs/decisions/error-tracking.md` — the full D-19 record
- `docs/dependency-register.md` — Sentry row (provisioned, US region, token-scope caveat), PostHog row narrowed to analytics-only
- `docs/ops/eas-environments.md` — 4 new Sentry variable rows
- `.planning/phases/00-foundation/deferred-items.md` — logs one pre-existing flaky test found (not fixed, out of scope)

## Decisions Made

See `key-decisions` in the frontmatter for full rationale. In brief: Sentry chosen over PostHog for crash reporting based on real-device spike evidence (D-19); the Sentry org turned out to be US-region rather than the originally-decided EU region, flagged rather than resolved unilaterally since Sentry has no in-place region migration; `initErrorReporting()`'s env-resolution pattern changed to survive an unrelated env failure elsewhere in the app.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `initErrorReporting()` crashed the whole app at boot on an unrelated env failure**
- **Found during:** Task 2, first live EAS build (`f399f6ec-5d14-479d-b23c-c2f58c9f84d7`)
- **Issue:** `env: ClientEnv = getEnv()` as a default parameter meant `getEnv()`'s collective validation of the *entire* environment (throwing if ANY required var is missing, including ones this module has nothing to do with — `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, owned by 00-15 and not yet in the preview EAS environment at spike time) ran before this function's own try/catch could ever see it. Confirmed via `adb logcat` `FATAL EXCEPTION` on the real build.
- **Fix:** `env` is now an optional parameter resolved inside the function's own try/catch.
- **Files modified:** `src/services/errors/errorReporter.ts`, `src/services/errors/__tests__/errorReporter.test.ts`
- **Verification:** New regression test exercises the real (no-arg) call path against Jest's unset `process.env`; confirmed live on a rebuilt APK that the app boots correctly.
- **Committed in:** `2437550`

**2. [Rule 3 - Blocking] `app/_layout.tsx` wired outside the plan's `files_modified`**
- **Found during:** Task 1, preparing for Task 2's live spike
- **Issue:** Without a call to `initErrorReporting()`/(originally) `maybeFireSpikeError()` from the app's entry point, Task 2's live EAS spike would have had nothing to fire or report.
- **Fix:** Added the calls to `app/_layout.tsx` (module-scope `initErrorReporting()`; the spike trigger was removed again in Task 3).
- **Files modified:** `app/_layout.tsx`
- **Verification:** Confirmed live on both EAS builds — the app boots and the spike fires as expected.
- **Committed in:** `2c785da` (added), `aa09dea` (spike wiring removed)

**3. [Rule 1 - Bug] Sentry plugin hardcoded to the wrong (EU) region**
- **Found during:** Task 3, setting the real EAS env vars
- **Issue:** `app.config.ts` hardcoded `url: 'https://de.sentry.io/'` for the `@sentry/react-native/expo` plugin, based on the originally-decided EU region. The actual Sentry org turned out to be US-region (confirmed live via the API), which would have made the plugin's control-plane calls (release creation, source-map upload) target the wrong regional host and fail.
- **Fix:** Removed the hardcoded `url` override; the plugin's own default (`https://sentry.io/`) is region-agnostic and self-routes correctly via the token.
- **Files modified:** `app.config.ts`
- **Verification:** Verified via `expo prebuild` (generated `sentry.properties` shows `defaults.url=https://sentry.io/`, correct org/project, no leaked auth token) and a real EAS build whose log shows `sentry-cli` correctly used `https://sentry.io (embedded in token)` and completed the source-map upload successfully.
- **Committed in:** `2f60a56`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking). All three were discovered live via real EAS builds/device testing, not caught by unit tests alone — a reminder that this plan's whole purpose (a live-device spike) is exactly the kind of gap unit tests can't close.
**Impact on plan:** No scope creep. Deviation 2 (wiring `app/_layout.tsx`) was necessary for the plan's own Task 2 to be executable at all. Deviations 1 and 3 are both correctness bugs that would have shipped silently without the live spike/build verification this plan mandated.

## Issues Encountered

- **PostHog spike: 3/3 real fatal crashes lost.** See `docs/decisions/error-tracking.md` for the full root-cause analysis (fire-and-forget `flush()` racing `expo-updates`' process teardown, measured at ~130–180ms from throw to process death).
- **`.env.local` had `EXPO_PUBLIC_SENTRY_DSN`/`SENTRY_AUTH_TOKEN` present as keys but genuinely empty** when Task 3 first resumed — confirmed at the byte level, not a false alarm. Correctly triggered the "stop and return a checkpoint" instruction rather than guessing; resolved once the user filled in real values in the main checkout.
- **The Sentry org's region turned out to be US, not the originally-decided EU.** Verified live against the API (see Deviation 3 above and `docs/decisions/error-tracking.md`'s Region note). Left open for a human decision (accept US under the same DPA/SCCs argument already used for Supabase's US-hosted database, or create a new EU org) rather than resolved unilaterally, since Sentry has no in-place region migration.
- **`SENTRY_AUTH_TOKEN` could not confirm event arrival via the API.** The token is scoped for `sentry-cli`'s release/source-map workflow (confirmed working) but returns `403` on project/issues/events read endpoints. Source-map upload and spike-firing were both confirmed directly; final event-arrival confirmation is left as a manual dashboard check — see `docs/decisions/error-tracking.md`'s Sentry live proof section for exactly what to look for (release `com.fincwin.app@0.1.0+1`, ~2026-09-25T05:41 local).

## User Setup Required

**One item needs a human with Sentry dashboard access:** confirm the `FINCWIN_SPIKE_ERROR 12345` event from build `00838470-93e7-471e-975d-7bb7e625a2c6` actually appears in the Sentry issues list, scrubbed (`FINCWIN_SPIKE_ERROR <n>`, per `scrubMessage`) and symbolicated to a real source line. Full details in `docs/decisions/error-tracking.md`'s Sentry live proof section.

**One decision needs the account owner:** whether to keep the Sentry org on the US region or create a new EU-region org — no in-place migration exists. See the same doc's Region note.

## Next Phase Readiness

- `src/services/errors` is ready for 01-15's write queue to call `captureError(error, { area: 'sync' })` — the export shape was preserved through the entire PostHog-to-Sentry swap.
- D-18 (always-on, consent-independent, scrubbed crash reporting) and D-19 (the tool decision, with evidence) are both fully resolved and documented.
- ENV-13 is closed: provisioned, DSN wired, EAS env vars set in all three environments.
- Nothing blocks 00-19 (the phase's on-device verification plan) or later phases from proceeding. The two open items above (Sentry dashboard confirmation, region decision) are informational/administrative, not code blockers.

## Known Stubs

None — every file this plan created or modified is fully implemented and tested, or (for `docs/decisions/error-tracking.md` and `docs/dependency-register.md`) a documentation record of real, live-verified evidence.

## Self-Check: PASSED

All files listed under "Files Created/Modified" verified present on disk. All 11 commits (`31f8f66`, `2c785da`, `2c32216`, `2437550`, `1fae1bf`, `0ec956b`, `39b13e3`, `a8b8193`, `2f60a56`, `aa09dea`, `05fdffe`) confirmed present in `git log --oneline`. Final verification run clean on this commit: `npx jest src/services/errors` (28 tests), full suite (1049 tests across 59 suites), `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run depcruise` (0 violations). Task 3's literal verify command (`! grep -rn "EXPO_PUBLIC_ERROR_SPIKE\|maybeFireSpikeError" src app && grep -qE "^Decision: (PostHog|Sentry)" docs/decisions/error-tracking.md && npx jest src/services/errors && npx tsc --noEmit`) passes in full.

---
*Phase: 00-foundation*
*Completed: 2026-09-25*
