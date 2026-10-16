---
phase: 04-decide-engine
plan: 04
subsystem: engine/payoff
tags: [simulateMinimum, never-clears, golden, deviations]
requires: [04-01, 04-03]
provides: [simulateMinimum, payoff barrel, payoff golden parity]
affects: [04-06]
key-files:
  created:
    - src/engine/payoff/simulateMinimum.ts
    - src/engine/payoff/index.ts
    - src/engine/payoff/__tests__/simulateMinimum.test.ts
    - src/engine/payoff/__tests__/golden.test.ts
    - src/engine/payoff/__tests__/deviations/d17-never-clears-vs-cap.test.ts
    - src/engine/payoff/__tests__/deviations/d20-per-month-rounding.test.ts
key-decisions:
  - "never_clears is an explicit per-month paid <= interest check; exceeds_month_cap is a separate 600-month outcome (D-17)"
  - "Under the prototype's own formula the payment always exceeds interest, so SC-2 uses interestAdded:false terms"
requirements-completed: [DEC-03]
duration: ~25 min
completed: 2026-10-16
---

# Phase 4 Plan 04: simulateMinimum and payoff parity Summary

All-bigint `simulateMinimum` with the explicit D-17 never-clears check (SC-2 test fires at month 1), a separate `exceeds_month_cap` outcome, the `engine/payoff` barrel, and golden parity plus named D-17/D-20 deviation tests.

## Commits
- 171a860 test: failing simulateMinimum tests
- a475ae4 feat: simulateMinimum and barrel
- 41849bf test: golden parity and deviation tests

## Results
- payoff: 97 tests pass, 100% branch coverage on simulateMinimum.ts and the rest of payoff/.
- tsc: only the known expo-blur error; eslint 0 errors (fc warnings as elsewhere); depcruise and check:ignores clean.
- Full coverage run: 8488 tests pass; 2 shell suites fail on the known missing expo-blur; no threshold errors.

## Deviations from Plan

**1. [Rule 1 - Test bound] D-20 interest bound is invalid for ill-conditioned terms**
- **Issue:** For dpmt-100000-22.9-600 the payment is barely above month-1 interest, so rounding the level payment by under one unit is amplified by the annuity factor ((1+r)^n-1)/r (~4.4M) and the final payment absorbs it (diff 1,650,335 vs bound 301). The engine is correct; the plan's ceil(n/2)+1 bound is not.
- **Fix:** bound widened by ceil(A/2) only when A > 5000; well-conditioned cases keep the tight bound. Documented in the test comment.
- **Commit:** 41849bf

## Known Stubs
None.

## Self-Check: PASSED
