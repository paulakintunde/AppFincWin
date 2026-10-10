---
status: awaiting_human_verify
trigger: "White screen after login on any account with no recurring-series offers (all new users)."
created: 2026-10-10
updated: 2026-10-10
workspace: C:/dev/fincwin-d1 (branch fix/activity-white-screen, from origin/main fd5a90e)
---

# Debug: Activity white screen for users with no series offers

## Symptoms

- **Expected:** after sign-in and onboarding, Activity opens.
- **Actual:** the screen goes white. Preview (release) build on a second phone; reproduced on the Pixel 9 development build (dev server on port 8075 from C:/dev/fincwin-p2).
- **Error:** `RangeError: Invalid time value`, componentStack at `RecurringReviewSheet` (logcat 2026-10-10 01:48:35; Metro log line 52). Code frame: `src/features/record/activity/ActivityScreen.tsx:390`, call stack ActivityScreen → ActivityRoute → AppLayout → Gate → RootLayout.
- **Timeline:** introduced by Phase 02.2 plans 29/34 (on main via PR #52). Never caught: plan 29 tests always render the sheet with offers; plan 34 integration tests mock offers.
- **Reproduction:** sign in with any account whose current month has no series offers (every new user) and open Activity.
- **Second issue (startup):** `Can't perform a React state update on a component that hasn't mounted yet` (logcat 01:44:47), before sign-in.
- **Logs:** C:/Users/harki/AppData/Local/Temp/claude/c--dev-fincwin/8a06a8d5-7a20-426c-b8be-577607664efd/scratchpad/pixel-logcat.log and metro-8075.log

## Current Focus

- hypothesis: ActivityScreen always mounts RecurringReviewSheet; RecurringReviewSheet.tsx:69 calls `shortMonthName(commonPreviousMonth(offers), locale)` on every render; with zero offers `commonPreviousMonth` returns `''`, `''.split('-').map(Number)` gives `[NaN]`, `Date.UTC(NaN, NaN)` is NaN and `Intl.DateTimeFormat.format(NaN)` throws RangeError (SeriesOfferCard.tsx:40-42). No error boundary, so release builds unmount to white.
- next_action: confirm with a failing test, then fix

## Fix scope (agreed with user)

1. `shortMonthName` returns `''` for a blank or invalid month instead of throwing.
2. `RecurringReviewSheet` renders nothing / skips the label when `offers` is empty.
3. Regression test: render Activity and the real RecurringReviewSheet with zero offers (not mocked).
4. Expo Router `ErrorBoundary` exported from the signed-in group `app/(app)/_layout.tsx`: declarative "Something went wrong" + Retry, reported through the existing error-tracking hook; new copy passes the copy voice test.
5. Trace the startup "state update on a component that hasn't mounted yet" warning; fix if it is in our code, otherwise document the source.

## Constraints

- Work ONLY in C:/dev/fincwin-d1 on branch fix/activity-white-screen. Never switch branches in C:/dev/fincwin. Do not stop the Metro process serving C:/dev/fincwin-p2 on port 8075.
- Full gate before done: `npm run typecheck`, `npm run lint` (0 errors), `npm run depcruise`, `npx jest --coverage --ci --no-watchman --forceExit`.
- Commit with hooks; commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push; the orchestrator opens the PR.

## Evidence

- timestamp: 2026-10-10T01:48:35 — logcat `E/ReactNativeJS: { [RangeError: Invalid time value] componentStack: '\n at RecurringReviewSheet ...' isComponentError: true }`
- timestamp: 2026-10-10 — Pixel screenshot after sign-in: blank white screen.

## Eliminated

## Resolution

- root_cause: shortMonthName('') (from commonPreviousMonth([]) with zero offers) built Date.UTC(NaN) and Intl format threw RangeError on every RecurringReviewSheet render; no error boundary, so release builds went white. Confirmed by a regression test that fails with RangeError before the fix (3/3 red) and passes after.
- fix: (1) shortMonthName returns '' for non-finite dates; (2) RecurringReviewSheet returns null with zero offers (after hooks); (3) ActivityNoOffers.test.tsx renders real ActivityScreen/sheet/card with zero offers; (4) RouteErrorBoundary (src/ui) exported as ErrorBoundary from app/(app)/_layout.tsx, reports via captureError area 'ui', copy errorBoundary.* in en.ts; (5) startup warning is third-party: expo-router@57.0.22 build/fork/useLinking.native.js getInitialState, getInitialURL().then(...) calls onUnhandledLinking which sets state before the container mounts. Dev-only (React DEV warning), no our-code frame in the stack; no workaround applied.
- verification: typecheck clean, lint 0 errors (369 pre-existing warnings), depcruise clean, jest --coverage --ci 217 suites / 5828 tests pass.
- files_changed: [src/features/record/activity/SeriesOfferCard.tsx, src/features/record/activity/RecurringReviewSheet.tsx, src/features/record/activity/__tests__/ActivityNoOffers.test.tsx, src/ui/RouteErrorBoundary.tsx, src/ui/__tests__/RouteErrorBoundary.test.tsx, app/(app)/_layout.tsx, src/i18n/locales/en.ts, src/services/errors/errorReporter.ts]
