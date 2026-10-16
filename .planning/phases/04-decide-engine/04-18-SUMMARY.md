---
phase: 04-decide-engine
plan: 18
subsystem: engine/decide
tags: [position, stacking, future-changes, tdd]
requires: [04-07, 04-15]
provides: [positionContext, stackCheck, applyChanges, assess-otherChecks]
affects: [04-12, 04-19, 04-20, phase-05]
key-files:
  created:
    - src/engine/decide/position.ts
    - src/engine/decide/__tests__/position.test.ts
    - src/engine/decide/__tests__/deviations/d45-worst-future-month.test.ts
    - src/engine/decide/__tests__/deviations/d53-lost-income-counts.test.ts
  modified:
    - src/engine/decide/assess.ts
decisions:
  - "positionContext relies on worstFutureMonth's own change validation (incl. currency) rather than a second assertValidChange pass"
  - "Stacked invest checks never change monthCosts; a monthly one joins monthlyInvesting, pausable and both left figures"
metrics:
  completed: 2026-10-16
requirements-completed: []
---

# Phase 4 Plan 18: Position layer Summary

Other open checks are stacked order-independently at their own splits (buy and invest, D-41/D-62), the worst of the next 12 months and the purchase's own lost income are applied (D-45/D-53), and `assess(snapshot, check, otherChecks = [])` judges the combined position. position.ts and assess.ts are at 100% branch coverage.

## Tasks
1. Stacking (D-41): `stackCheck` moves debt payments, costs, running costs, financed debt, pausable, both left figures and the three cash figures (cashAvailable, cashAfterBills, ledgerCash) plus the cash path; an untyped reserve is recomputed from the stacked costs; missing plans or splits are reported and change nothing. Order independence and "never raises" properties via fast-check.
2. `applyChanges` / `positionContext` / assess rewire: leftThisMonth deliberately untouched so D-36 size reads this month; positive purchase income only with `includeExpectedIncome`; double positioning refused. D-45 and D-53 named tests added.

## Commits
- 9d18e42 test: stack other open checks (RED)
- 9338c9d feat: combined position from other open checks
- 171136c test: future changes and lost income (RED)
- 5691d65 test: D-45 and D-53 named tests (RED)
- eae4724 feat: positionContext and assess on the combined position

## Verification
decide + payoff jest suites pass (934 tests), decide/payoff coverage thresholds met, golden check passes, depcruise and check:ignores clean, eslint clean (fc default-import warnings only, as elsewhere). `tsc` reports only the known expo-blur error in TabBar.tsx.

## Deviations from Plan
- positionContext omits the explicit `assertValidChange` loop over snapshot changes; worstFutureMonth validates them (the CAD-change test still throws `mixed currencies`). Otherwise executed as written; every hand-derived figure matched the engine.

## Known Stubs
None.

## Self-Check: PASSED
