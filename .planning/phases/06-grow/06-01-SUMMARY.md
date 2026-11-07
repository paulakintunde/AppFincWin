---
phase: 06-grow
plan: 01
subsystem: engine
tags: [payoff, growth, bigint, tdd]
requires: []
provides:
  - fixedPayoff, strategy, compoundSteps, estimatedCardMinimum in src/engine/payoff
affects: [06-02, grow screens, calculators]
tech-stack:
  added: []
  patterns: [bigint with divideHalfUp, 600-month cap, explicit never_clears]
key-files:
  created:
    - src/engine/payoff/fixedPayoff.ts
    - src/engine/payoff/strategies.ts
    - src/engine/payoff/compoundSteps.ts
    - src/engine/payoff/cardMinimumEstimate.ts
    - src/engine/payoff/__tests__/golden/calc-grow.json
    - src/engine/payoff/__tests__/fixedPayoff.test.ts
    - src/engine/payoff/__tests__/strategies.test.ts
    - src/engine/payoff/__tests__/compoundSteps.test.ts
    - src/engine/payoff/__tests__/cardMinimumEstimate.test.ts
  modified:
    - src/engine/payoff/index.ts
key-decisions:
  - "D-28 card minimum estimate: month-1 interest + 1% of balance, floor 2500, capped at balance + interest"
  - "strategy never_clears fires when the payable amount in a month does not exceed that month's total interest"
requirements-completed: [GRW-07, GRW-08, GRW-09, GRW-11]
duration: ~40 min
completed: 2026-11-06
---

# Phase 6 Plan 01: Payoff and growth maths Summary

Pure bigint engine maths for Grow: single-debt fixed payoff with extra or lump, two-order multi-debt strategy, month-by-month growth illustration and the estimated card minimum, all matching the prototype ledger to the cent.

## Commits
- d11be0fb test(06-01): failing tests and golden JSON from design/calc.js (RED)
- 15c1b2eb feat(06-01): the four modules and barrel exports (GREEN)

## Results
- Exact equality with calc.js: loan 30 months / 75636 / 12836, extras, lump, strategy 114868 / 128030 / 218434, growth 2944998 / 4091444.
- fast-check properties (100 runs) cover interest, cap, payment sum identity, never_clears iff, monotonic extra, constant budget, single-debt equality.
- `npx jest src/engine/payoff`: 240 tests pass. The four new files are at 100% statements, branches, functions and lines. typecheck, depcruise pass; eslint has 0 errors.

## Deviations from Plan
None to the code. Task 3 needed no extra tests (new files reached 100% in Task 2), so it has no separate commit.

## Deferred Issues
- Folder-wide threshold run reports `types.ts` lines 59-60 (`minorOrNull`) and `index.ts` uncovered under a payoff-only run. Both are pre-existing, outside this plan, and covered by the decide suite in the full coverage run.
- 4 eslint `array-type` warnings (`ReadonlyArray<T>`) kept to match the plan's signatures.

## Known Stubs
None.

## Self-Check: PASSED
All created files exist; commits d11be0fb and 15c1b2eb exist.
