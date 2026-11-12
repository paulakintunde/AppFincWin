---
phase: 06-grow
plan: 05
subsystem: grow-connect
tags: [grow, decide, connection-points, parity, safety-net, debts]
requires: ["06-01", "06-02", "06-03"]
provides:
  - "src/features/grow/connect: goalSaved, goalPointsOf, envelopesOf, safetyNetPointOf, safetyNetInputsOf, debtToV3Debt, debtPointOf"
  - "D-07 parity grid (96 cells), criterion 8 property with Grow-written debts, ENG-24 one-payoff-module guard"
affects: [06-10 wires these into Decide's builder, 06-06 migration SQL must follow the account_id rule below]
tech-stack:
  added: []
  patterns: ["pure connect folder, engine types only, 100% coverage list"]
key-files:
  created:
    - src/features/grow/connect/types.ts
    - src/features/grow/connect/goalSaved.ts
    - src/features/grow/connect/goalPoint.ts
    - src/features/grow/connect/safetyNetPoint.ts
    - src/features/grow/connect/debtPoint.ts
    - src/features/grow/connect/index.ts
    - src/features/grow/connect/__tests__/ (goalPoint, safetyNetPoint, debtPoint, parity, growDebtsLowestPoint, onePayoffModule)
  modified:
    - jest.config.js
key-decisions:
  - "Migration rule for plan 06: account_id = reserve_account_id ONLY where reserve is not null (found by the parity grid)"
  - "Payoff dates computed with an own month/day helper (due day cut to short months, then back to the due day) rather than occurrenceDate, which would drift after a clamped anchor"
requirements-completed: [GRW-02, GRW-03, GRW-07]
completed: 2026-11-06
---

# Phase 6 Plan 05: Grow connection points Summary

Three pure connection points (goal, safety net, debt) that Decide will read, with their contract tests written first, a 96-cell parity grid against the interim safety-net columns, the criterion-8 property with Grow-shaped debts, and an ENG-24 one-payoff-module guard.

## What was built
- `goalSaved`: opening amount plus goal-tagged paid lines; transfer legs signed ("Take some out" lowers it), other lines absolute; any failed conversion gives null and the goal is left out.
- `goalPointsOf` / `envelopesOf`: live non-safety-net goals; `locked` always an explicit boolean (absent on a cached row = true).
- `safetyNetPointOf` / `safetyNetInputsOf`: starter size stays null; other-currency goal gives size null, saved 0, no account, no fund (CR-03); saved 0 with no account gives no fund.
- `debtToV3Debt` (builder mapping moved verbatim) and `debtPointOf` (payoff date via engine `fixedPayoff`; auto loan gives 2029-04-15 and 75636 interest; pays-in-full cards and zero balances have no date; never-clears gives no date).
- `src/features/grow/connect` added to the 100% coverage list in `jest.config.js`.

## Commits
- fff494dd test(06-05): failing BO-07 contract tests
- 2f9d0c0c feat(06-05): BO-07 goal, safety net and debt connection points

## Verification (per-plan)
- `npx jest src/features/grow/connect`: 6 suites, 133 tests pass. Coverage on connect/*.ts: 100% statements, branches, functions, lines (types.ts and index.ts hold no executable code).
- `npm run depcruise`: no violations. `npx eslint src/features/grow/connect`: clean. `npm run typecheck`: passed on the implementation (re-run after the final parity edit also run, see below).

## Finding for plan 06 (migration SQL) - important
The D-07 parity grid found a case beyond the two allowed differences. When the old settings had a linked account (`reserve_account_id`) but no reserve typed (`reserve` null), the old builder produced no emergency fund. A migrated goal with `opening_saved 0` and that account would read as a fund of 0 in the account, and the engine then treats the linked account's whole live balance as the fund (a 1,070,000 ring-fence in the demo), which changes answers. The TS mirror `migrateSafetyNetRow()` therefore sets `account_id = reserve_account_id` only when `reserve is not null`. The plan-06 SQL must apply the same rule. With it, all 96 cells match, with exactly the two documented differences (empty unlinked fund: no fund-not-linked notice; `safety_net_locked = false`: net is always Locked).

## Deviations from Plan
**1. [Rule 1 - Bug in the plan's migration rule] account_id carries over only when reserve is set** (above). Files: parity.test.ts. Commit 2f9d0c0c.
**2. [Design] Payoff dates use a local month/day helper instead of `occurrenceDate`**: `occurrenceDate` keyed to a clamped anchor (Feb 28) would keep the 28th afterwards instead of returning to the due day. Tests cover Feb, leap year and December rollover.
**3. [Test detail] Parity test uses a real demo account id (`demo-acct-savings`)**: an unknown account id fires the fund-unlinked notice on both sides and hides the real comparison.

## Known Stubs
None.

## Self-Check: PASSED
Files and commits fff494dd, 2f9d0c0c verified present.
