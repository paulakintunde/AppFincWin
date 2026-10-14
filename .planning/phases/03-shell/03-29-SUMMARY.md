---
phase: 03-shell
plan: 29
subsystem: home
tags: [gap-closure, home, data-state, a11y]
requires: [03-25]
provides: [monthDataState, MonthView.dataState, Home error/offline states]
affects: [src/features/home, src/data/queries/activity.ts]
key-files:
  created: [src/data/queries/monthDataState.ts, src/data/queries/__tests__/monthDataState.test.ts]
  modified: [src/data/queries/activity.ts, src/features/home/useHomeViewModel.ts, src/features/home/ThisMonthCard.tsx, src/features/home/ComingUpCard.tsx, src/features/home/HomeScreen.tsx]
requirements-completed: [HOME-02, HOME-03, NAV-06, DSG-07]
duration: ~40m
completed: 2026-10-14
---

# Phase 3 Plan 29: Home This month / Coming up gap closure Summary

Home now shows the real negative "left after everything" when only expected bills exist, discloses failed or offline-uncached reads instead of a false empty month, and follows the selected month in its copy; closes T-03-22-01 (OT-02).

## Commits
- 300a729: monthDataState, MonthView.dataState, view-model dataState and monthRefreshKeys (G4, M8)
- 3749c00: ThisMonthCard projection-aware empty, error/offline, month heading, header role, line4 placeholders (G1, G4, M6, L12)
- 0ff0c1a: ComingUpCard states, long month names, Pay spacer/stacking, outer shadow, HomeScreen wiring (M6, L3, L11, M1, L13)

## Deviations from Plan
None of substance. Notes: a Prettier run reformatted two files by mistake; reverted and re-applied by hand, so the committed diff is minimal. HomeScreen test cards are probes, so a props-capturing probe was added to assert state/currentMonth/ACTIVITY_HREF. The date-block month text sits in a hidden-from-accessibility subtree, so its test queries with { hidden: true }.

## Verification
- jest src/features/home src/features/record/activity: 26 suites, 247 tests pass; depcruise clean; eslint 0 errors (4 pre-existing require warnings in HomeScreen test).
- tsc: only the known environmental expo-blur error in TabBar.tsx.

## Threat flags
T-03-29-01/02 mitigated (empty requires no rows, no unpaid count, no unconverted unpaid; error/offline hide figures). None new.

## Known Stubs
None.

## Self-Check: PASSED
