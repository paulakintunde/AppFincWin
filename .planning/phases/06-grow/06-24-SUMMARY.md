---
phase: 06-grow
plan: 24
subsystem: payoff-engine, debts-read-model
tags: [payoff, strategy, lump, what-if, debts]
requires: [06-20]
provides:
  - "strategy(debts, extra, order, { lump }) one-off option"
  - "DebtsModel.scenarios, savedExtraPlan, debtWhatIf, soonerSpan"
affects: [06-35, 06-36, 06-37]
key-files:
  modified:
    - src/engine/payoff/strategies.ts
    - src/engine/payoff/__tests__/strategies.test.ts
    - src/features/grow/debts/useDebtsRead.ts
    - src/features/grow/debts/debtLineModel.ts
    - src/features/grow/debts/__tests__/useDebtsRead.test.tsx
    - src/features/grow/debts/__tests__/debtLineModel.test.ts
    - src/features/grow/debts/__tests__/debtScreens.test.tsx
  created:
    - src/features/grow/debts/__tests__/debtDetail.test.tsx
decisions:
  - "Lump with every debt cleared gives months 0 and payoffDate = today"
  - "Date fallback is today's day of month when the last-cleared debt has no due day"
metrics:
  tasks: 3
  completed: 2026-11-07
---

# Phase 6 Plan 24: Lump option and plan-wide what-ifs Summary

`strategy()` now accepts a one-off lump applied before month 1 interest, and the debts read model carries plan-wide minimum-only / extra / once what-ifs per order with exact sooner and less-interest figures, so the reveal screens only format.

## Commits
- `93f7ce9e` feat: lump option on the payoff strategy
- `7e02c5f3` feat: plan-wide what-ifs in the debts read model
- `be1603c1` test: debt detail tests moved to their own file

## What was built
- Engine: comparator extracted and shared by the lump pass and the monthly loop; lump < 0 throws `strategy: lump must be >= 0`; lump 0 or absent is deep-equal to the old results (golden unchanged). Tests include one-debt parity with `fixedPayoff` (fast-check) and "more lump never worsens" properties. `strategies.ts` is 100% on statements, branches, functions and lines.
- Read model: `WhatIf`, `Compare`, `PlanScenarios`, `DebtsModel.scenarios`, `DebtsModel.savedExtraPlan` (null at saved extra 0), `debtWhatIf()`, `lumpFirstDebtId`. `focus` and `plan` are kept for 06-37 to remove. LEDGER auto loan: min only 30 months / 75,636; extra 5000 -> 26 months, sooner 4, less 11,145; once 100000 -> 26 months, 58,204, less 17,432.
- Date fallback: a missing due day uses today's day of the month; payoffDate is null only when the outcome is not cleared (months 0 gives today).
- `soonerSpan(months)` in debtLineModel (48 -> 4y 0m, 38 -> 3y 2m, under 24 months stays in months).
- Test move: `debtScreens.test.tsx` had 24 cases; now 15 there plus 9 in `debtDetail.test.tsx` (24 total). No assertion changed; the date fallback changed no existing expected string.

## Verification
- engine/payoff jest with coverage: 17 suites, 248 tests pass; strategies.ts 100%. (The sweep also lists `types.ts` lines 59-60 and the `index.ts` re-export under the ad hoc collectCoverageFrom glob; both are untouched by this plan.)
- `npx jest src/features/grow/debts src/features/grow/calculators` pass; typecheck clean; depcruise clean; eslint 0 errors (warnings only, pre-existing style).
- Stryker not run (not confirmed to cover payoff; skipped).

## Deviations from Plan
None - plan executed as written.

## Known Stubs
None.

## Self-Check: PASSED
