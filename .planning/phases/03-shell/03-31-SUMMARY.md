---
phase: 03-shell
plan: 31
subsystem: activity
tags: [activity, unpaid-banner, projection-detail, fab-clearance, gap-closure]
requires: [03-25, 03-26, 03-32]
provides: [UnpaidBanner, tappable ProjectionRow, ActivityScreen wiring]
affects: [src/features/record/activity]
key-files:
  created: [src/features/record/activity/UnpaidBanner.tsx, src/features/record/activity/__tests__/UnpaidBanner.test.tsx]
  modified: [src/features/record/activity/ActivityRow.tsx, src/features/record/activity/ActivityScreen.tsx, src/features/record/activity/__tests__/ActivityRow.test.tsx, src/features/record/activity/__tests__/ActivityScreen.test.tsx, src/features/record/activity/__tests__/unpaidFocus.test.tsx]
decisions:
  - "Clear removes only unpaidOnly; other filters stay (D-41)"
metrics:
  completed: 2026-10-14
---

# Phase 3 Plan 31: Activity gap closure Summary

Activity now shows a "Showing unpaid bills · Clear" banner under the Unpaid filter, opens expected rows in Home's read-only ProjectionDetailSheet, clears the FAB, uses the shared refresh keys and shows the sync line at rest.

## Tasks

1. UnpaidBanner and tappable ProjectionRow (ed00df8). Clear button has 44pt hit area; ProjectionRow with onPress is a labelled button, without it renders as before.
2. ActivityScreen wiring (see git log, second commit). Banner in list header; `projection` state plus ProjectionDetailSheet (no Pay); `paddingBottom: FAB_CLEARANCE` on calendar ScrollView and FlashList; `monthRefreshKeys(rc.householdId, month)` (now includes accountBalances); file-level eslint-disable removed.

## Deviations from Plan

- [Rule 3] Removing the file-level `react-hooks/refs` disable surfaced 9 errors (the whole `chrome` object is flagged wherever used in JSX), so each reported line got an `eslint-disable-next-line react-hooks/refs` with the original reason. Scope is narrowed to those lines; behaviour unchanged.
- G5: no code change needed; 03-32's largeHeader already carries SyncProblemLine. Tests added for list and calendar offline at scroll 0 (override of the harness's useSyncStatus mock via jest.requireMock).
- The FAB clearance test asserts the calendar ScrollView only; the shared FlashList mock drops `contentContainerStyle`, so the list side is covered by the plan's source grep (2 occurrences).

## Verification

`npx jest src/features/record/activity src/features/home`: 27 suites, 263 tests pass. eslint on activity: 0 errors (2 pre-existing warnings). depcruise clean. tsc: only the known environmental expo-blur error in TabBar.tsx.

## Known Stubs

None.

## Self-Check: PASSED
