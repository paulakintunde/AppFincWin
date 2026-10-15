---
phase: 03-shell
plan: 03
subsystem: shell
tags: [navigation, tabs, fab, pure-functions, tdd]
requires: []
provides:
  - TAB_ORDER / TabId / HOME_TAB / isTabId
  - TAB_AVAILABILITY / availableTabs / isTabAvailable / tabPosition
  - slideDirection / slideFor / BACK_SLIDE / slideStartX / SLIDE_OFFSET
  - shouldHideFab / fabSurface / FabHideReason
  - QUICK_ACTION_ORDER / availableQuickActions
affects: [03-shell tab bar, FAB, quick menu plans]
tech-stack:
  added: []
  patterns: [pure decision modules with no react/expo imports]
key-files:
  created:
    - src/shell/tabBar/tabs.ts
    - src/shell/tabBar/availableTabs.ts
    - src/shell/tabBar/direction.ts
    - src/shell/fab/shouldHideFab.ts
    - src/shell/fab/quickActions.ts
    - src/shell/tabBar/__tests__/direction.test.ts
    - src/shell/tabBar/__tests__/availableTabs.test.ts
    - src/shell/fab/__tests__/shouldHideFab.test.ts
    - src/shell/fab/__tests__/quickActions.test.ts
key-decisions:
  - "Slide direction follows D-01 TAB_ORDER index, never visible position; back is always fromLeft (D-05)"
  - "Tab availability is a build-rollout constant with no tier or level input (D-03)"
requirements-completed: [NAV-01, NAV-05]
duration: ~25 min
completed: 2026-10-13
---

# Phase 3 Plan 03: Tab and FAB decisions Summary

Five pure, fully tested modules fix the D-01 tab order, D-02/D-03 availability, NAV-01 slide direction with the D-05 reverse-back rule, the D-10 FAB hide rule and the D-11 quick-menu order.

## Tasks

1. Tab order, availability, slide direction: RED commit (all four test files) then GREEN commit.
2. FAB hide rule and quick actions: GREEN commit (tests were in the shared RED commit).

100 tests pass; 100% statement/branch/function/line coverage on all five modules. `tsc --noEmit` and eslint on `src/shell` are clean.

## Deviations from Plan

None in behaviour. Process note: the RED commit covers both tasks' tests together, so Task 2 has no separate `test(...)` commit.

## Known Stubs

None.

## Self-Check: PASSED
