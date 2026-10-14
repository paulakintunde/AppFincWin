---
phase: 03-shell
plan: 02
subsystem: shell
tags: [navigation, back-history, pure-module, tdd]
requires: []
provides:
  - backHistoryReducer (MAX_HISTORY, Location, pushEntry, popTo, classifyTransition, applyTransition, decideBack, sameLocation)
  - navLocation (locationFromNavState, OUTER_GROUP, TABS_GROUP)
affects: [BackHistoryProvider (later plans)]
key-files:
  created:
    - src/shell/backHistory/backHistoryReducer.ts
    - src/shell/backHistory/navLocation.ts
    - src/shell/backHistory/__tests__/backHistoryReducer.test.ts
    - src/shell/backHistory/__tests__/navLocation.test.ts
key-decisions:
  - "Tab locations carry no depth; only outer locations do (D-22)"
requirements-completed: [NAV-02, NAV-03]
completed: 2026-10-13
---

# Phase 3 Plan 02: Back History Core Summary

Pure, React-free 8-deep unified back history (push/pop classification, back decision) plus nav-state to Location translation, both at 100% branch coverage.

## Tasks
- Task 1 (TDD): RED 5320e27, GREEN with Task 2 in the feat commit below.
- Task 2: navLocation implemented with its tests.
- Final feat commit: see `git log` (feat(03-02): implement backHistoryReducer and navLocation).

35 tests pass; tsc and eslint clean.

## Deviations from Plan
- Tasks 1 and 2 implementation went into one feat commit (the RED commit for Task 1 was separate; Task 2 tests were written together with its implementation).
- Environment: the worktree `node_modules` is a full copy of the phase install rather than a junction (the junction commands were blocked by the sandbox, `ln -s` fell back to copying). It is gitignored and not committed.

## Self-Check: PASSED
