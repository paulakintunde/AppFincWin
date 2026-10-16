---
phase: 05-decide-ui
plan: 35
subsystem: ui
tags: [charts, react-native-svg, accessibility]
requires: [05-01 engine barrel, 05-31 copy]
provides: [chartGeometry, CashPathChart, NetWorthChart]
affects: [05-42 Day by day, 05-45 investing instead]
key-files:
  created:
    - src/features/decide/charts/chartGeometry.ts
    - src/features/decide/charts/CashPathChart.tsx
    - src/features/decide/charts/NetWorthChart.tsx
    - src/features/decide/charts/__tests__/chartGeometry.test.ts
    - src/features/decide/charts/__tests__/charts.test.tsx
  modified:
    - jest.config.js
requirements-partial: [DCU-02, DCU-11, DCU-14, DCU-18]
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-16
---

# Phase 5 Plan 35: Cash path and net worth charts Summary

Pure chart geometry (100% branch coverage, file-level threshold) plus two token-only, non-animated react-native-svg charts: the 90-day cash path (D-26) with a pan scrub and the net-worth chart (D-31) that breaks lines at out-of-range points (D-47).

## Commits
- 0f8e0bb: failing geometry tests (RED)
- 7cc10ad: chart geometry and jest threshold (GREEN)
- 8ec19e0: CashPathChart, NetWorthChart, tests

## Verification
- charts (31 tests) and src/theme pass; typecheck clean; lint 0 errors; depcruise clean.

## Deviations from Plan
- Props take `whole: ChartMoney` (`formatMoney(amount)`, optional `exponent`) instead of a full formatter, since the caller binds currency.
- `xTicks(length, parts = 3)`: 3 parts gives [0,30,60,90] for 91 points; 4 gives month quarters.
- `markerPoint` returns null for a missing/null point.
- Jest threshold added as an `existsSync`-guarded file key.

## Human/device items
- Feel of the horizontal scrub on a real device (gesture only unit-tested).

## Known Stubs
None.

## Self-Check: PASSED
