---
phase: 04-decide-engine
plan: 17
subsystem: engine/decide
tags: [cash-path, cash-dip, tdd]
requires: [04-05, 04-13]
provides:
  [
    seriesDatesInPath,
    spreadUndatedSpending,
    buildCashPath,
    cashPathForSnapshot,
    purchaseFlows,
    applyOutflows,
    lowestPoint,
    cashPathReport,
    cashTightFact,
    dipShortfall,
    classifyCashDip,
    cashPathMargin,
  ]
affects: [04-07, 04-18, 04-20, phase-05]
key-files:
  created:
    - src/engine/decide/cashPath.ts
    - src/engine/decide/__tests__/cashPath.test.ts
decisions:
  - "Daily spread of undated spending and debt minimums lives only in spreadUndatedSpending (cumulative half-up, D-59 default 1)"
  - "dipShortfall subtracts only the purchase-caused part of the cash card, with a zero-line layer; cashPathMargin and classifyCashDip read the same rooms"
  - "D-61 scheduled outflows placed through scheduledOutflowsDue at my share as given, in both paths"
metrics:
  completed: 2026-10-16
requirements-completed: []
---

# Phase 4 Plan 17: 90-day cash path and cash_dip Summary

Pure day-by-day 90-day cash path (cash on hand, confirmed series and D-61 scheduled outflows on their dates, exact daily spread), purchase flows, lowest points, the cash_tight_before_payday fact, the D-59 one-card-per-cause `cash_dip` rule and a matching cash-path margin, at 100% coverage.

## Tasks

| Task | Commits |
| ---- | ------- |
| 1 and 2 tests (RED, observed failing: module missing) | 828c97b |
| 1 and 2 implementation (GREEN) | f552ea8 |

## Verification

- `npx jest src/engine/decide src/engine/payoff`: 38 suites, 556 tests pass; cashPath.ts 100% statements/branches/functions/lines.
- All hand-derived figures from the plan matched on first run (1_989_479, 2_389_589, 2_379_068, 2_842_630, 2_329_068, 1_939_479, 2_792_630, 2_992, 1_097_808, and the W1 and zero-line dip cases).
- eslint: 0 errors (fc default-import warnings as in earlier plans); depcruise clean; check:ignores OK; tsc only reports the known `expo-blur` error in TabBar.tsx.

## Deviations from Plan

- Tasks 1 and 2 share one RED commit and one GREEN commit (single module and test file); RED was observed failing (module not found).
- Requirements DEC-06 and DEC-20 not ticked: 04-07 and 04-20 still wire the cash path into the verdict.

## Known Stubs

None.

## Self-Check: PASSED

- src/engine/decide/cashPath.ts and its test exist; commits 828c97b and f552ea8 exist on phase/04-decide-engine.
