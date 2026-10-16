---
phase: 04-decide-engine
plan: 14
subsystem: engine/payoff
tags: [rate-schedule, promo, deferred-interest, amortisation, reference-tables, D-48, D-57]
requires: [04-01, 04-04]
provides: [RateSchedule, singleRate, assertValidSchedule, promoMonthsOf, amortiseSchedule, simulateMinimumSchedule]
affects: [04-06, 04-17, 04-21]
key-files:
  created:
    - src/engine/payoff/rateSchedule.ts
    - src/engine/payoff/__tests__/rateSchedule.test.ts
    - src/engine/payoff/__tests__/amortise.reference.test.ts
    - src/engine/payoff/__tests__/deviations/d57-reference-residuals.test.ts
  modified:
    - src/engine/payoff/index.ts
key-decisions:
  - "Recast at each segment start over the remaining months; final payment absorbs the residual (D-20), so totalPaid === principal + totalInterest"
  - "Deferred interest accrues at the post-promo rate on each promo month's opening balance and is charged only if a balance is open at promo end"
  - "Schedules and the deferred flag are inputs only; no default rate exists in the source"
requirements-completed: []
duration: 25min
completed: 2026-10-16
---

# Phase 4 Plan 14: Rate schedules and published amortisation references Summary

Promotional and stepped rate schedules for `engine/payoff` (recast per segment, user-entered deferred-interest flag), plus `amortise` proven against four published tables (OpenStax x3, Sekhon and Bloom) with named residual deviations.

## Tasks and commits

| Task | Commit |
| --- | --- |
| 1. Reference tables R1-R4 and D-57 residual deviations | c8d597f |
| 2+3. rateSchedule.ts (amortiseSchedule, simulateMinimumSchedule), barrel export, tests | 9dba49a |

## Results

- All four reference vectors passed on the first run; `amortise` needed no change.
- `npx jest src/engine/payoff --coverage`: 134 tests pass, payoff/ at 100% statements/branches/functions/lines.
- `npx tsc --noEmit`: only the known `expo-blur` error in TabBar.tsx. `npm run depcruise` and `npm run check:ignores` pass. eslint: 0 errors (fast-check default-import warnings, same as existing tests).
- Greps: no float maths or default rates in rateSchedule.ts; `1026.53` out-of-scope note present; no `385.54` in reference test.

## Deviations from Plan

- RED and GREEN for Tasks 2 and 3 were committed together (one commit with tests and implementation) rather than as separate test/feat commits; the implementation was written in one pass and the tests passed at once. Task 1 followed the plan (tests only, one commit).
- `balanceAtPromoEnd` for a promo longer than the term is the final (zero) balance, matching the "balance after month min(promoMonths, months)" interface comment.

## Known Stubs

None.

## Self-Check: PASSED
