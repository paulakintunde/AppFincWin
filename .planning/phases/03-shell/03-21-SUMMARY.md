---
phase: 03-shell
plan: 21
subsystem: ui
tags: [state, activity, home, entry-host]
requires: [03-17]
provides:
  - "Shared selected month and one-shot Activity filter intent (src/state/activityFocus.ts)"
  - "App-wide entry sheet host store (src/features/record/entry/entryHost.ts)"
  - "Activity Unpaid filter lists projected bills"
affects: [Home cards (Pay bills / See all), ShellEntryHost 03-15]
key-files:
  created:
    - src/state/activityFocus.ts
    - src/state/__tests__/activityFocus.test.ts
    - src/features/record/entry/entryHost.ts
    - src/features/record/entry/__tests__/entryHost.test.ts
    - src/features/record/activity/__tests__/unpaidFocus.test.tsx
  modified:
    - src/features/record/activity/useActivityViewModel.ts
    - src/features/record/activity/__tests__/ActivityScreen.test.tsx
    - src/features/record/activity/__tests__/ActivityIntegration.test.tsx
    - src/features/record/activity/__tests__/ActivityViews.test.tsx
key-decisions:
  - "Intent effect keeps a scoped eslint-disable for react-hooks/set-state-in-effect (same precedent as TransactionSheet)"
duration: ~25m
completed: 2026-10-13
---

# Phase 3 Plan 21: Shared month, Unpaid focus and entry host Summary

Module stores for the month Home and Activity share, a one-shot Unpaid filter intent, and one entry-sheet host; Activity now reads them and lists projected bills under the Unpaid filter.

## Tasks
1. Stores `activityFocus` and `entryHost` with tests, both registering wipe handlers (fa53f85).
2. `useActivityViewModel` uses `useSelectedMonth`, applies and consumes the filter intent (also clears search, sets month scope), and passes `filterProjections` output to the list and to `monthTotals` when filtering; searching still hides projections, other filters still hide them (e51bad5).

## Deviations
- [Rule 3] Existing Activity tests (Screen, Integration, Views) now call `resetActivityFocusForTests()` in `beforeEach`, because the month store persists across tests within a file.
- [Rule 3] Lint rule `react-hooks/set-state-in-effect` flagged the intent effect; added a scoped disable with reason.
- RNTL here has an async `renderHook`, so the store tests await it.

## Verification
tsc clean; eslint clean (two pre-existing warnings in ActivityRow.test); `npx jest src/features/record src/state` run: all suites listed passed in the visible output (the output was truncated at 60 lines, the unpaidFocus suite passed separately with 5/5).

## Known Stubs
None.

## Self-Check: PASSED
