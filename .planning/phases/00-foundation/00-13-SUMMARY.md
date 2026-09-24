---
phase: 00-foundation
plan: 13
subsystem: analytics
tags: [posthog, analytics, typescript, consent, privacy, eu-host]

# Dependency graph
requires:
  - phase: 00-foundation (plan 05)
    provides: "src/config/env.ts — the typed getEnv() reader, including posthogKey?/posthogHost enforcing the EU host (D-23)"
provides:
  - "src/services/analytics/catalogue.ts — EventCatalogue of 8 typed events; property types are compile-time-restricted to boolean or finite string-literal unions (ANL-03)"
  - "src/services/analytics/posthog.ts — createAnalytics()/getAnalytics(): consent-gated PostHog service on the EU host, no session replay, no lifecycle autocapture (ANL-01, ANL-02, ANL-04)"
  - "A provisioned PostHog EU cloud project ('FincWin United' org, 'FincWin' project, id 281828) with project-level session replay and autocapture turned off, and real keys in .env.local (ENV-14)"
affects: [00-18 (consent screen + settings toggle wire this service up), 00-19 (on-device event check), any-future-feature-emitting-analytics-events]

# Tech tracking
tech-stack:
  added:
    - "posthog-react-native 4.75.0 (already a dependency; this plan is its first real usage)"
  patterns:
    - "Typed analytics catalogue: track<E extends EventName>(e: E, p: EventProps<E>) makes an unknown event name, a missing/excess property, or an out-of-union property value a compile error, not a runtime one"
    - "Double consent gate: the PostHog SDK's own defaultOptIn:false + optOut()-at-construction is backed by the service's own independent `enabled` boolean in front of every capture() call, so an SDK-level consent bug still cannot leak an event"
    - "Lazy singleton env access: getAnalytics()'s module-level import never touches process.env; getEnv() only runs on first call, keeping the module safely importable in test/CI contexts with no env configured"

key-files:
  created:
    - src/services/analytics/catalogue.ts
    - src/services/analytics/posthog.ts
    - src/services/analytics/index.ts
    - src/services/analytics/__tests__/catalogue.typecheck.ts
    - src/services/analytics/__tests__/consentGate.test.ts
    - src/services/analytics/__tests__/config.test.ts
  modified:
    - .env.local (PostHog EU project keys; gitignored, not committed)

key-decisions:
  - "The first POSTHOG_PERSONAL_API_KEY pasted into .env.local during Task 3 was a phs_-prefixed project secret key, not a phx_-prefixed personal API key — it returned HTTP 401 'Personal API key found in request Authorization header is invalid' from https://eu.posthog.com/api/projects/281828/. Replaced with the correct phx_ personal API key from PostHog's Personal settings -> Personal API keys page, re-verified with a live GET against the same endpoint (200, project id present)."
  - "Analytics.enable(userId) validates userId against a Supabase UUID regex and throws before calling optIn()/identify() on an invalid value, so a caller bug can never identify a non-UUID string to PostHog"

patterns-established:
  - "Pattern: any service wrapping a third-party SDK with a consent/privacy requirement should keep its own independent enabled/disabled flag in front of the SDK call, not rely solely on the SDK's own opt-in state"

requirements-completed: [ANL-01, ANL-02, ANL-03, ANL-04, ENV-14]

# Metrics
duration: ~25min (code) + checkpoint wait for PostHog dashboard setup
completed: 2026-09-24
---

# Phase 00 Plan 13: Analytics (Typed Catalogue + Consent-Gated PostHog) Summary

**Consent-gated PostHog analytics on the EU host (eu.i.posthog.com) with a typed event catalogue whose property types are compile-time-restricted to booleans and finite string-literal unions, and a live PostHog EU project wired through env.**

## Performance

- **Duration:** ~25 min of active implementation across 2 code tasks, plus a checkpoint (Task 3) that required two rounds of dashboard/credential correction before the PostHog EU API verified
- **Completed:** 2026-09-24
- **Tasks:** 3 (2 TDD code tasks + 1 human-action checkpoint)
- **Files modified:** 6 created (2 source, 3 test/fixture files under src/services/analytics), plus .env.local (gitignored)

## Accomplishments
- `src/services/analytics/catalogue.ts`: `EventCatalogue` with 8 events (`app_opened`, `sign_in_completed`, `sign_in_failed`, `theme_accent_changed`, `theme_font_changed`, `analytics_opted_in`, `signed_out`, `update_required_shown`), plus an `AssertAll`/`IsFinite` compile-time guard that fails `tsc --noEmit` if any catalogue entry's property is typed as a bare `string` or `number` rather than `boolean` or a finite string-literal union (ANL-03)
- `src/services/analytics/posthog.ts`: `createAnalytics()`/`getAnalytics()` build a PostHog client on the EU host with `defaultOptIn: false`, `enableSessionReplay: false`, `captureAppLifecycleEvents: false`, then immediately call `optOut()` as a second gate; `enable(userId)` validates a Supabase UUID before opting in and calling `identify(userId)` with no person properties (ANL-01); `disable()` opts out and resets identity for shared-device sign-out; `track()` only reaches `capture()` once the service's own `enabled` flag is set, independent of the SDK's own consent state (ANL-02); with no `posthogKey` configured, `createAnalytics()` returns a no-op service that never constructs PostHog at all
- `src/services/analytics/index.ts`: re-exports the service and catalogue types for 00-18's consent screen and settings toggle
- PostHog EU cloud project provisioned: organisation "FincWin United", project "FincWin" (id `281828`) on the EU host, with session replay recording and autocapture turned off at the project level (defence in depth for ANL-04), and real keys (`EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY`) in `.env.local`

## Task Commits

Each code task was committed atomically as a TDD RED/GREEN pair:

1. **Task 1: Typed event catalogue** — RED `2f1ed4b` (test), GREEN `a1e2bcd` (feat)
2. **Task 2: Consent-gated PostHog service** — RED `4beb002` (test), GREEN `690afa0` (feat)
3. **Task 3: PostHog EU project + `.env.local` keys** — human-action checkpoint, no code commit; keys live in gitignored `.env.local` only

**Plan metadata:** this commit (docs: complete plan) — created alongside this SUMMARY

## Files Created/Modified
- `src/services/analytics/catalogue.ts` — `EventCatalogue`, `EventName`, `EventProps<E>`, and the `CATALOGUE_IS_FINITE` compile-time guard
- `src/services/analytics/__tests__/catalogue.typecheck.ts` — `tsc`-only fixture with 5 `@ts-expect-error` lines proving invalid `track()` calls fail to compile
- `src/services/analytics/posthog.ts` — `Analytics` interface, `createAnalytics()`, `getAnalytics()`
- `src/services/analytics/index.ts` — public re-exports
- `src/services/analytics/__tests__/consentGate.test.ts` — 6 tests covering ANL-01/ANL-02 (construction options, pre-consent silence, enable/identify, invalid-UUID rejection, disable/reset, no-key no-op)
- `src/services/analytics/__tests__/config.test.ts` — 2 tests covering ANL-04 (no session-replay/plugin dependency, `enableSessionReplay: false` + `captureAppLifecycleEvents: false` present in source)
- `.env.local` — PostHog EU project keys added (gitignored; not committed, never will be)

## Decisions Made
- Kept `enabled` as an independent second gate in `createAnalytics()`'s closure, in front of every `capture()` call, rather than trusting the PostHog SDK's own opt-in state alone — see key-decisions in frontmatter
- Validated `enable(userId)`'s argument against a Supabase UUID regex and throw-before-optIn on a mismatch, so a caller bug can never identify a malformed distinct ID to PostHog

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Acceptance-criteria grep for forbidden terms initially failed on the catalogue's own explanatory comments**
- **Found during:** Task 1, acceptance-criteria check `grep -Ei "amount|payee|merchant|account_name|note|email|name:" src/services/analytics/catalogue.ts`
- **Issue:** The file's doc comments explaining the ANL-03 guard used words like "amounts", "payees", "emails" and "note: string" in prose, which the literal grep (intended to catch actual smuggled properties) also matched
- **Fix:** Reworded the comments to describe the same guard without using the flagged substrings (e.g. "a loosely typed string field" instead of "note: string")
- **Files modified:** src/services/analytics/catalogue.ts
- **Verification:** `grep -Ei "amount|payee|merchant|account_name|note|email|name:" src/services/analytics/catalogue.ts` returns nothing; `npx tsc --noEmit` still passes
- **Committed in:** a1e2bcd

---

**Total deviations:** 1 auto-fixed (Rule 1, cosmetic — comment wording only, no logic change)
**Impact on plan:** No scope creep. The guard's actual behaviour (compile-time rejection of non-finite property types) was correct on first pass; only the comment prose needed adjustment to satisfy the plan's own literal acceptance check.

## Issues Encountered

**Task 3 checkpoint required two correction rounds before the PostHog EU API verified.** The first `POSTHOG_PERSONAL_API_KEY` pasted into `.env.local` was a `phs_`-prefixed key (a PostHog project secret key, not a personal API key), which returned `HTTP 401 authentication_failed` from `GET https://eu.posthog.com/api/projects/281828/`. A byte-for-byte re-check after the first "done" signal showed the value in `.env.local` was unchanged from the original failing attempt, so a second round was needed. The key was then replaced with the correct `phx_`-prefixed personal API key (scopes `query:read` and error-tracking write, per the plan's setup spec), which verified with `HTTP 200` and the project id present in the response body. `EXPO_PUBLIC_POSTHOG_KEY` (the `phc_`-prefixed project API key) and `EXPO_PUBLIC_POSTHOG_HOST` were correct on the first attempt throughout.

## User Setup Required
None further — the PostHog EU project is provisioned and `.env.local` holds working keys. No action needed before 00-18 wires the consent UI to this service.

## Next Phase Readiness
- `npx jest src/services/analytics` (8 tests), `npx tsc --noEmit`, and `npm run lint` all pass on a clean tree
- `getAnalytics()`/`createAnalytics()` and the full `EventCatalogue` are ready for 00-18 (consent screen, settings toggle, sign-out wipe registry) and 00-19 (on-device event verification against the live PostHog project) to build on directly — no further analytics-service work needed before then
- Crash/error reporting (D-18) is explicitly out of scope for this module and lands separately in 00-16; declining analytics consent must never disable it, and this plan does not touch it
- Nothing blocks 00-14 onward

## Known Stubs
None — every file this plan created is either fully implemented and tested (`catalogue.ts`, `posthog.ts`, `index.ts`) or a proof fixture with no runtime behaviour of its own (`catalogue.typecheck.ts`).

## Self-Check: PASSED

All files listed under "Files Created/Modified" verified present on disk:
FOUND src/services/analytics/catalogue.ts, src/services/analytics/posthog.ts, src/services/analytics/index.ts, src/services/analytics/__tests__/catalogue.typecheck.ts, src/services/analytics/__tests__/consentGate.test.ts, src/services/analytics/__tests__/config.test.ts.
Commits `2f1ed4b`, `a1e2bcd`, `4beb002`, `690afa0` all verified present in `git log --oneline`.
Live re-verification at completion time: `EXPO_PUBLIC_POSTHOG_KEY` starts `phc_` with EU host set; `GET https://eu.posthog.com/api/projects/281828/` with `POSTHOG_PERSONAL_API_KEY` returns HTTP 200 with the project id present.

---
*Phase: 00-foundation*
*Completed: 2026-09-24*
