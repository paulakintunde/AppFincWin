---
phase: 05-decide-ui
plan: 135
subsystem: engine/decide
tags: [engine, expected-month, D-106, D-107]
requires: [05-130, 05-132]
provides: [expectedMonth, expectedMonthMoney, ExpectedMonthFigures]
affects: [05-142 (prepareContext month basis), Decide home card]
key-files:
  created:
    - src/engine/decide/expectedMonth.ts
    - src/engine/decide/__tests__/expectedMonth.test.ts
  modified:
    - src/engine/decide/index.ts
    - src/features/decide/__tests__/engineBarrel.test.ts
requirements: [DCU-39, DCU-35]
completed: 2026-10-24
---

# Phase 5 Plan 135: expectedMonth Summary

Pure engine figure for the current month as it is expected to end: logged and pending lines (via `summariseMonth`) plus unsettled series occurrences still due, minus debts, saving and set-asides.

## Built
- `expectedMonthMoney(snapshot, spendingShare)` returns income, spending and the still-due share. `expectedMonth(context)` wraps it and adds `debtPayments`, `saving` (pausable), `setAside` and `result` (same formula as `leftBefore`).
- No double count: each series' own non-skipped, non-transfer lines take at most one occurrence. Monthly, quarterly and yearly series are taken by any line that month; weekly and fortnightly series by a line within 3 or 6 days. Occurrences on or before `lastPaidDate` are also dropped.
- One-offs count this month. Household share applies to lines and bills, not pay. Bills and income series are validated and currency-checked; unconfirmed series are ignored.
- Barrel export, with `engineBarrel.test.ts` updated (`expectedMonth`, `expectedMonthMoney` sorted between `estimateBias` and `firstRead`; `ExpectedMonthFigures` in `_Gate`).

## Commits
- 59f635dc feat(05-135): expectedMonth and expectedMonthMoney
- b5e0a2f5 feat(05-135): export expectedMonth from the decide barrel

## Verification
- `src/engine/decide` jest: 1298 passed. expectedMonth.ts 100% statements, branches, functions, lines. No coverage-ignore comments. depcruise clean. eslint: 0 errors.
- Typecheck: 2 errors, both in `src/features/decide/copy/__tests__/foldCopy.test.ts` (lines 53, 79; "Expected 1 arguments, but got 2"). That is the other executor's uncommitted work, out of scope.

## Deviations from Plan
None. Two small test additions beyond the named list: a second line of the same monthly series, and a fortnightly radius test (needed for branch coverage and clarity).

## Self-Check: PASSED
