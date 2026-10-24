---
phase: 05-decide-ui
plan: 120
subsystem: engine
tags: [decide, pots, E6, D-100, D-101, R18.2]
requires: []
provides:
  - potSetAside, totalSetAside, MAX_POTS (pure, engine/decide/pots.ts)
  - DecideSnapshot.pots; AssessContext.setAside, potLines, protectedCash; MonthColumn.setAside
affects: [05-124, 05-125]
key-files:
  created:
    - src/engine/decide/pots.ts
    - src/engine/decide/__tests__/pots.test.ts
    - src/engine/decide/__tests__/potsProperties.test.ts
  modified:
    - src/engine/decide/types.ts
    - src/engine/decide/constants.ts
    - src/engine/decide/index.ts
    - src/engine/decide/assess.ts
    - src/engine/decide/cashPath.ts
    - src/engine/decide/position.ts
    - src/engine/decide/investmentViews.ts
    - src/features/decide/__tests__/engineBarrel.test.ts
    - src/features/decide/snapshot/buildSnapshot.ts
decisions:
  - "cashPathForSnapshot takes protectedCash as a required input (no optional default branch)"
  - "totalSetAside also returns the exact bigint sum of saved, so protectedCash needs no second pass or export"
  - "A plain pot with a target but no readyBy sets aside 0 and stays active (the spec is silent; the DB shape constraint forbids it)"
requirements: [DCU-36, DCU-35]
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 5 Plan 120: Engine E6, pots as a monthly set-aside Summary

Pots become a monthly set-aside taken off net free cash flow and a protected slice of cash, in pure integer minor-unit bigint maths with 100% branch coverage.

## Commits
- d08a1cb1 potSetAside, totalSetAside, pot types, MAX_POTS, barrel surface
- 23225424 context, cash, month column, position and investment changes; `pots: []` in the snapshot builder and fixtures

## What was built
- `potSetAside(pot, asOf)` follows R18.2 in order: no target, reached, Wait pot (0 or null amount means 0 with no division), plain pot past due, otherwise `ceilDivide(remaining, m)` with m = whole months rounded down (via `occurrenceDate`), at least 1, capped at `SIMULATION_MONTH_CAP`. Each pot is range-asserted on entry (reachable branch, tested); `totalSetAside` refuses more than `MAX_POTS` (50), so the bigint sum stays at most 5 x 10^14 and converts with a plain `Number()`. No coverage-ignore comments.
- `prepareContext`: `leftBefore` subtracts `setAside`; `pausable` unchanged; `protectedCash = min(sum saved, max(0, cashOnHand))`; `cashAvailable`, `ledgerCash`, `cashAfterBills` and the cash-path opening start from cash less protectedCash.
- `MonthColumn.setAside` is in `outgoings`; `position` fixedOutgoings adds it; `investmentViews` surplus adds it.

## Verification
- Coverage (pots, assess, cashPath, position, investmentViews): 100% statements, branches, functions, lines. `npx jest src/engine src/features/decide/snapshot src/features/decide/__tests__/engineBarrel.test.ts`: 191 suites, all pass after the one-line buildSnapshot expectation fix.
- fast-check properties pass (see deviation 1 for the changed lower bound). typecheck clean, eslint 0 errors (776 pre-existing warnings), depcruise clean, `check:ignores` OK.

## Deviations from Plan

1. **[Rule 1 - Bug in plan spec] Property "setAside x (m-1) < remaining" is false.** Counterexample: 5 over 4 months is 2 a month, 2 x 3 = 6. Replaced with the true minimality bound `(setAside - 1) x m < remaining` alongside `setAside x m >= remaining`.
2. **[Rule 1 - correctness] Net worth path adds `protectedCash` back to its opening cash** (`investmentViews.ts`). Otherwise cashAfterBills' lower start would drop pot money out of net worth, contradicting "pot money stays cash in the net-worth path". A test shows the path is identical with and without a pot.
3. **[Rule 3] Extra files fixed for the required `pots` field:** `src/features/decide/snapshot/__tests__/helpers/snapshotFixtures.ts` and `buildSnapshot.test.ts` (an expected-object literal). Both are one-line `pots: []` additions. `cashPath.test.ts`/`assess.test.ts` callers gained `protectedCash`; the existing month-column `col` helper gained `setAside: 0`.
4. The barrel surface lists `MAX_POTS`, `potSetAside`, `totalSetAside` only (as planned); `golden/adapter.ts` needed no edit because it builds on `snapshotOf`.

## Known Stubs
`buildSnapshot.ts` sets `pots: []` on purpose; 05-124 fills it from the data.

## Device checklist
05-EXECUTION-NOTES entry 05-120 is engine-only ("covered by 05-124/05-125"); no device item.

## Self-Check: PASSED
Files and commits d08a1cb1, 23225424 verified present.
