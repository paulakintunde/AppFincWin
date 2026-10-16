---
phase: 04-decide-engine
plan: 15
subsystem: engine/decide
tags: [reserve, confidence, margins, future-changes, D-42, D-43, D-45, D-46]
requires: [04-05]
provides: [defaultReserve, reserveHalfMonthsFor, confidenceOf, isOnEdge, edgeMargin, monthAfter, changeActiveIn, assertValidChange, worstFutureMonth]
affects: [04-07, 04-08, 04-18, 04-20]
key-files:
  created:
    - src/engine/decide/reserve.ts
    - src/engine/decide/confidence.ts
    - src/engine/decide/margins.ts
    - src/engine/decide/futureChanges.ts
    - src/engine/decide/__tests__/reserve.test.ts
    - src/engine/decide/__tests__/confidence.test.ts
    - src/engine/decide/__tests__/margins.test.ts
    - src/engine/decide/__tests__/futureChanges.test.ts
    - src/engine/decide/__tests__/deviations/d42-cushion-by-steadiness.test.ts
key-decisions:
  - "Cushion in half-months with a single half-up division, so 4.5 months of an odd figure rounds once"
  - "confidenceOf checks rough before strong before fair; steadiness/fullMonths consistency is a RangeError"
  - "Edge test is bigint 100 x |margin| < 5 x base, strict, zero base never flags"
  - "worstFutureMonth window is months 1..12 after the as-of month; ties keep the earliest"
requirements-completed: []
duration: 20min
completed: 2026-10-16
---

# Phase 4 Plan 15: Cushion, confidence, margins and future changes Summary

Four pure leaf rules at 100% branch coverage: steadiness-scaled cushion (D-42 amended), confidence code (D-46), on-the-edge margin primitive (D-43) and the worst-of-12-months future-change loop (D-45).

## Commits
- 6fe9e2d test: cushion by steadiness and confidence (RED)
- f3a1c7d feat: steadiness-scaled cushion and confidence code
- a595624 feat: on-the-edge margin primitive (tests and implementation together)
- ad749f4 test: worst future month (RED)
- 7e0514c feat: worst of the next 12 months under future changes

## Verification
- `npx jest src/engine/decide`: 18 suites, 249 tests pass; the four modules at 100% statements, branches, functions and lines.
- depcruise and check:ignores clean; tsc only the known expo-blur error; eslint 0 errors (fc default-import warnings only).

## Deviations from Plan
Task 2 RED and GREEN were committed together (tests passed on first run); one test construction fix (a 1.5 amount built through `as never`). Otherwise as written.

## Requirements
DEC-06, DEC-07, DEC-18, DEC-19, DEC-21, DEC-22 not ticked: they are wired by 04-07, 04-08, 04-18 and 04-20.

## Known Stubs
None.

## Self-Check: PASSED
