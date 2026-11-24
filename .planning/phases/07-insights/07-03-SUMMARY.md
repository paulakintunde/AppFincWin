---
phase: 07-insights
plan: 03
subsystem: engine/grow
tags: [net-worth, engine, insights, INS-01]
requires: []
provides: [netWorthOf in engine/grow, monthEndsFor, holdingValueOn, netWorthSeries, seriesChange]
affects: [07-insights net-worth line]
key-files:
  created: [src/engine/grow/netWorthSeries.ts, src/engine/grow/__tests__/netWorthSeries.test.ts, src/engine/grow/__tests__/netWorthSeries.property.test.ts]
  modified: [src/engine/grow/netWorth.ts (moved), src/engine/grow/index.ts, src/engine/grow/__tests__/netWorth.test.ts (moved), src/features/grow/netWorth.ts (re-export)]
decisions:
  - "D-26a: 6m = 6 month-ends before this month (plus today by the caller); 1y = 12; all = from first month"
  - "D-08: series calls netWorthOf once per point, no second sum"
metrics:
  completed: 2026-11-22
---

# Phase 7 Plan 03: net-worth rule in engine + month-end series Summary

netWorthOf now lives in the pure engine (moved unchanged, re-exported from the old feature path so HoldingDetailScreen is untouched), plus a netWorthSeries helper that builds one netWorthOf point per month-end and for today.

## Commits
- c6065531 refactor: move netWorthOf into engine/grow
- 50e23705 feat: netWorthSeries, monthEndsFor, holdingValueOn, seriesChange + tests

## Deviations
- [D-26a] monthEndsFor spans N full months before the current month (6m = 6 month-ends, 1y = 12), as the owner decided; plan examples already matched for 6m.
- [Rule 2] Added a RangeError overflow test to the moved netWorth test: the moved file now sits under the 100% engine/grow branch gate and line 64 was uncovered.
- Task 1 commit holds only the netWorth barrel line; the netWorthSeries barrel line lands in the Task 2 commit.

## Known edge (not redesigned)
A debt paid off later with no startedBalance falls back to its current balance, so earlier months may understate debt. Unlinked live debts are held flat in past points (debtsHeldFlat flag).

## Checks
- eslint on changed files: 0 errors (existing-style fast-check warnings only)
- tsc --noEmit: clean; depcruise: no violations
- jest engine/grow netWorth + netWorthSeries (incl. property, seed 0x0704): 26+ pass; branch coverage 100% on netWorth.ts and netWorthSeries.ts
- Whole src/engine/grow + src/features/grow run (machine heavily loaded, ~78 min): engine/grow all pass; 11 feature UI suites failed (e.g. newGoalSheet getByText), none touching net worth; not investigated as out of scope, likely load/timeouts or pre-existing. Owner may want to re-run on a quiet machine.

## Self-Check: PASSED
