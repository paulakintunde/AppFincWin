---
phase: 04-decide-engine
plan: 20
subsystem: engine/decide
tags: [decide, margins, combined-checks, cash-path, tdd]
requires: [04-09, 04-18, 04-19]
provides: [decide, lineMargins]
affects: [phase-05]
key-files:
  created:
    - src/engine/decide/decision.ts
    - src/engine/decide/__tests__/decision.test.ts
    - src/engine/decide/__tests__/deviations/d41-combined-checks.test.ts
    - src/engine/decide/__tests__/deviations/d43-on-the-edge.test.ts
    - src/engine/decide/__tests__/deviations/d44-cash-path.test.ts
decisions:
  - "decide() composes existing pieces only: verdict from assessPlan on the combined position (equals assess), standalone beside it, worst month from the position record, margins via edgeMargin and cashPathMargin, stress on the combined context, a separate includeExpectedIncome assessment plus payback for a positive income change"
  - "cash_path margin uses cashPathMargin (D-59) with cashOnHand = context.cashAvailable, never snapshot.cashOnHand"
metrics:
  completed: 2026-10-16
requirements-completed: [DEC-06, DEC-09, DEC-13, DEC-17, DEC-19, DEC-20, DEC-28]
---

# Phase 4 Plan 20: decide() report Summary

`decide(snapshot, check, otherChecks)` returns one Decision for Phase 5: the combined verdict (deep-equal to `assess`), the standalone verdict and `combinedDiffers`, the stacked statuses, the D-45 worst month report, per-line margins with the on-the-edge flag, variable-rate stress, and a separate "with expected income" assessment with payback. `lineMargins` assembles month, cash, dsr, owe, inv (buy) or month, cash (invest) plus the D-59 cash-path line.

## Tasks
1. `decision.ts` with `lineMargins` and `decide` (tests 24, decision.ts at 100% statements/branches/functions/lines).
2. Named tests: d41-combined-checks (incl. stacked-dip and a fast-check "combined never better than standalone" property), d43-on-the-edge, d44-cash-path (D-44, D-59, D-24/D-44 amended, D-61).

## Commits
- e1f3d1f test(04-20): decide report and line margins
- 94d3119 feat(04-20): decide() report for Phase 5
- f8ef0f8 test(04-20): D-41, D-43 and D-44 named tests

## Verification
- `npx jest src/engine/decide src/engine/payoff --coverage`: 71 suites, 992 passed, 14 skipped; no threshold failure for decide/ or payoff/ (scoped-run messages for other engine folders only).
- eslint clean on touched files except `fc` default-import warnings (as in other test files); depcruise, check:ignores and golden --check pass; tsc shows only the known TabBar expo-blur error.

## Deviations from Plan
None in engine behaviour. One plan figure disagreed with correct maths: the withExpectedIncome assessment's `context.monthIncome` is 1_400_000, not 1_000_000 (the worst of the next 12 months all carry the +400_000 gain from August; the main verdict stays at 1_000_000). The test asserts both; engine unchanged. The D-41 amended order test compares figures instead of whole verdicts because the stacked record's indexes follow call order. All W1, W3, D-59 and D-61 hand figures matched.

## Requirements
DEC-06, DEC-09, DEC-13, DEC-17, DEC-19, DEC-20, DEC-28 marked complete (no remaining plan delivers parts of them).

## Known Stubs
None.

## Self-Check: PASSED
