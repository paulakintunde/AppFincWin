---
phase: 05-decide-ui
plan: 23
subsystem: decide-onboarding
tags: [onboarding, first-read, quick-check]
requires: [05-12, 05-13, 05-19, 05-28]
provides: [setup/rough route, setup/first-check route]
affects: [05-24 (Stack.Screen registrations)]
key-files:
  created:
    - app/(app)/setup/rough.tsx
    - app/(app)/setup/first-check.tsx
    - src/features/decide/onboarding/RoughFiguresScreen.tsx
    - src/features/decide/onboarding/FirstCheckScreen.tsx
    - src/features/decide/onboarding/__tests__/onboarding.test.tsx
  modified:
    - src/features/decide/quick/QuickCheckForm.tsx
    - src/features/record/setup/SetupAccountScreen.tsx
    - src/features/record/setup/__tests__/setup.test.tsx
    - src/features/navigation/swipeBackGesture.ts
    - src/features/navigation/__tests__/swipeBackGesture.test.ts
metrics:
  tasks: 2
  completed: 2026-10-16
---

# Phase 5 Plan 23: Onboarding rough figures and first check Summary

Onboarding now runs account, rough monthly in and out, first check, then Bring your history; a new user gets a labelled first verdict (or a cash-only answer when figures are skipped) before logging anything.

## Tasks

1. RoughFiguresScreen, FirstCheckScreen and routes (71d51f1). Rough Next saves rough_income, rough_spending, currency through the 05-19 mutation (never `seeded`); Skip saves nothing. FirstCheckScreen reuses QuickCheckForm surface `firstRead`, tracks `first_read_shown` with the state enum only, fires success/warning haptics (cash-only: warning only when cashAfter is below zero), and has Check something else (form remount) and Bring your history. Routes validate `accountId` with a uuid regex.
2. Setup chain and swipe-back (187ffba). The account sheet replaces to /setup/rough; `setup/rough` and `setup/first-check` join NO_SWIPE_BACK.

## Verification

Onboarding, record/setup, navigation, quick and wider decide/record suites pass (146 suites, 2116 tests); typecheck clean; lint 0 errors; depcruise clean; no StoreReview import, no router.push in onboarding.

## Deviations from Plan

**[Rule 3 - Blocking] QuickCheckForm onResult passes the computation.** The form reported only the state word, so the screen could not tell a cash-only overdraw from a fit for the haptic. `onResult(state, computation)` now carries both; existing callers are unaffected. Commit 71d51f1.

## Known Stubs

None. Stack.Screen registration of the two routes is owned by 05-24.

## Self-Check: PASSED
