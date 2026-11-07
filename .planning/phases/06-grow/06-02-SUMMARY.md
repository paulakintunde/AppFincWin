---
phase: 06-grow
plan: 02
subsystem: engine
tags: [grow, goals, lots, gain, staleness, tdd]
requires: [engine/payoff types, engine/money rounding, engine/recurring schedule]
provides: [engine/grow goalPlan, lots, gain, asOf, shared LEDGER fixtures]
affects: [jest.config.js 100% folder list]
key-files:
  created:
    - src/engine/grow/goalPlan.ts
    - src/engine/grow/lots.ts
    - src/engine/grow/gain.ts
    - src/engine/grow/asOf.ts
    - src/engine/grow/index.ts
    - src/engine/grow/__tests__/ (goalPlan, lots, gain, asOf tests)
    - src/engine/grow/__tests__/fixtures/ledger.ts
  modified:
    - jest.config.js
requirements: [GRW-01, GRW-05, GRW-06, GRW-10]
completed: 2026-11-06
---

# Phase 6 Plan 02: Grow engine Summary

Pure `src/engine/grow/` folder: two-way goal calculator (needed-each-month rounds up), average-cost lot replay with bigint-scaled units, gain/loss per holding and total, and the 30-day stale rule; folder added to the 100% coverage list.

## Commits
- Task 1 (RED): test(06-02) add failing grow engine tests and ledger fixtures
- Task 2 (GREEN): feat(06-02) grow engine goal plan, lots, gain, staleness

## Verification
- `npx jest src/engine/grow` with coverage: 100% statements/branches/functions/lines for src/engine/grow (the one failing property test was fixed and re-run green; the goalPlan file passes alone, 23 tests).
- typecheck clean, depcruise no violations, eslint 0 errors (fast-check `fc` import warnings only, same as existing tests).

## Decisions
- `putIn` equals the remaining cost basis (buys minus basis removed by sells).
- Sale without units and without a positive value-before removes the sale amount from basis, capped at the basis.
- `goalPlanByDate` counts anchor month through due month inclusive, minimum 1 deposit.
- `isValueStale` uses integer civil-day arithmetic (no Date).
- Already-reached goal returns deposits 0 and reachesOn null.

## Deviations from Plan
- [Rule 1 - test bug] The naive-loop property test generated cases past the 600-deposit cap; the generator was bounded (add >= 10). No engine change.
- Test files and fixtures were written with the Write tool because the sandbox refused a compound heredoc command.

## Known Stubs
None.

## Self-Check: PASSED
