---
phase: 04-decide-engine
plan: 19
subsystem: engine/decide
tags: [stress, payback, variable-rate, tdd]
requires: [04-07, 04-22]
provides: [stressTest, paybackMonths]
affects: [04-20, phase-05]
key-files:
  created:
    - src/engine/decide/stress.ts
    - src/engine/decide/payback.ts
    - src/engine/decide/__tests__/stress.test.ts
    - src/engine/decide/__tests__/payback.test.ts
    - src/engine/decide/__tests__/deviations/d49-variable-rate-stress.test.ts
decisions:
  - "stressTest adds STRESS_OFFSETS as Percent bigint values to the entered APR (card.apr for cards); promo terms pass through untouched"
  - "paybackMonths computes my share of each cost term per month (day one, scheduled payment, running net) and counts income as mine"
metrics:
  completed: 2026-10-16
requirements-completed: []
---

# Phase 4 Plan 19: Stress and payback Summary

`stressTest(context, check)` re-runs a variable loan or card months/minimum plan at the entered APR plus 2 and 4 percentage points through `assessPlan` and reports payment, my share, left, state, month and DSR checks beside an unchanged verdict (D-49). `paybackMonths` finds the first month where cumulative expected income reaches my day-one cost plus payments and running costs to date, or null within the horizon (D-53).

## Tasks
1. Stress (D-49): empty unless a buy check with loan/card method, `variable === true`, a resolved plan and, for cards, a non-full payoff. Promo stays as entered; only the post-promo APR moves. Named D-49 tests: percentage points not fractions, verdict unchanged by the flag, promo not stressed.
2. Payback (D-53): bigint accumulators, `monthAfter` against the income start month, RangeError guards (`paybackMonths: ...`) for non-positive gain, horizon outside 1..SIMULATION_MONTH_CAP, invalid dates. Property test: a larger gain never lengthens the payback.

## Commits
- bb1869a test(04-19): variable-rate stress
- 8da21f6 feat(04-19): variable-rate stress beside the verdict
- f9c06d3 test(04-19): payback months
- 05c6e62 feat(04-19): payback months for an expected income gain

## Verification
- `npx jest src/engine/decide src/engine/payoff --coverage`: 67 suites, 954 passed, 14 skipped; no threshold failure for decide/ or payoff/ (other folders show scoped-run threshold messages only). stress.ts and payback.ts at 100% branch.
- eslint clean on touched files except `fc` default-import warnings (same as other test files); depcruise, check:ignores and golden --check pass; tsc shows only the known TabBar expo-blur error.

## Deviations from Plan
None in engine behaviour. Test-side notes: the "verdict stays on the entered rate" test calls `assess(snapshot, ...)` (assess takes a snapshot, not a context); the +4 tightening example was found by search (see EXECUTION-NOTES). All plan hand figures matched.

## Requirements
DEC-06, DEC-15, DEC-25, DEC-28 left Pending: 04-20's decide() puts stress and payback on the Decision report.

## Known Stubs
None.

## Self-Check: PASSED
