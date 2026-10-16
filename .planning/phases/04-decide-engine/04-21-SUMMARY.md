---
phase: 04-decide-engine
plan: 21
subsystem: engine/decide, engine/payoff
tags: [decide, investment-views, income-at-risk, holding-fee, tdd]
requires: [04-06, 04-07, 04-10, 04-14, 04-22]
provides: [futureValuePath, futureValueNet, investmentViews, incomeAtRisk]
affects: [phase-05]
key-files:
  created:
    - src/engine/payoff/futureValuePath.ts
    - src/engine/payoff/__tests__/futureValuePath.test.ts
    - src/engine/decide/investmentViews.ts
    - src/engine/decide/incomeAtRisk.ts
    - src/engine/decide/__tests__/investmentViews.test.ts
    - src/engine/decide/__tests__/incomeAtRisk.test.ts
    - src/engine/decide/__tests__/deviations/d51-user-rates-only.test.ts
  modified:
    - src/engine/payoff/index.ts
decisions:
  - "futureValuePath carries A^m and D^m incrementally, one half-up rounding per point, equal to futureValue at every month; futureValueNet takes net = rate - fee (signed, fee bounded 0..100%)"
  - "investmentViews reads rates only from context.limits.projectionRates; the net-worth start cash is context.cashAfterBills; the with-purchase path adds investingAtRisk back to cash each month and invests investingAfter"
  - "incomeAtRisk per-setback runway is the runway of cash left after that setback; overall runwayWith equals applySetbacks runwayMonths"
metrics:
  completed: 2026-10-16
requirements-completed: [DEC-02, DEC-14, DEC-15, DEC-27, DEC-29]
---

# Phase 4 Plan 21: Investment views and income at risk Summary

`investmentViews` returns the four D-52 views (price invested, payments invested, investing paused, monthly net-worth path) at 0% and the user's own rates, net of an optional user-entered holding fee (D-63), and `incomeAtRisk` re-runs the setbacks with and without the new plan (D-54), both on top of a new `futureValuePath`/`futureValueNet` in engine/payoff.

## Tasks
1. `futureValuePath` and `futureValueNet` (19 tests incl. two fast-check properties; 100% coverage). Every hand-derived fee figure matched: 126_825, 120_000, 99_005, 119_452, 299_313, 972_829.
2. `investmentViews` plus the three D-51 named tests (22 tests; 100% coverage). The 5% line with a 1% fee on 1_200_000 over 60 months is 1_465_196, equal to futureValue at 4%. The remaining balance by month comes from the plan's own schedule (loan, card months, card minimum held at its last balance, instalments still owed, nothing for cash or a card paid in full).
3. `incomeAtRisk` (14 tests incl. a property that the purchase never helps; 100% coverage). Starts from cashAfterBills and cashAfterBillsAndPurchase on both sides, so a bill due soon is deducted even with a pay series (1_160_000 and 1_460_000 figures).

## Commits
- dad28ca test(04-21): future value path
- 5b5cb69 feat(04-21): futureValuePath
- 2d1214d test(04-21): income at risk
- f1dab65 feat(04-21): income at risk from the new debt
- 1233f4e test(04-21): investment views
- 71521f9 test(04-21): D-51 named test
- 375efeb feat(04-21): four investment views at user rates

## Verification
- `npx jest src/engine/decide src/engine/payoff --coverage`: 75 suites, 1066 passed, 14 skipped; no threshold failure for decide/ or payoff/ (scoped-run messages for other engine folders only).
- tsc: only the known TabBar expo-blur error. eslint: no errors on touched files (fc default-import warnings as elsewhere). depcruise, check:ignores and golden --check pass.

## Deviations from Plan
One plan conflict, no engine bending: the D-62 line says each per-setback `runwayWith` equals applySetbacks `runwayMonths` (runway of the start cash), while the plan's own income_drop example needs `runwayWith` 0 (runway of the cash left after the setback). The engine follows the example; the alignment test asserts overall `runwayWith === applySetbacks.runwayMonths` and each `cashAfterWith === applySetbacks().results[i].cashAfter`. Recorded in 04-EXECUTION-NOTES.md. The RED test for futureValuePath also had a wrong literal for a 100% fee (110_000 not 0; the monthly factor is 1100/1200), fixed in the GREEN commit.

## Requirements
DEC-02, DEC-14, DEC-15, DEC-27, DEC-29 complete. DEC-30 left open: plan 04-12 still delivers part of it.

## Known Stubs
None.

## Self-Check: PASSED
