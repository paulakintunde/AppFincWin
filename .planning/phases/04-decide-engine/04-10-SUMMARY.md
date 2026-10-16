---
phase: 04-decide-engine
plan: 10
subsystem: engine/decide
tags: [alternatives, setbacks, runway, wait-plan, suppression, tdd]
requires: [04-07]
provides: [buildAlternatives, spareCashOf, setbackHit, setbackHitFor, runwayMonthsOf, applySetbacks, buildWaitPlan]
affects: [04-11, 04-19, 04-21, phase-05]
key-files:
  created:
    - src/engine/decide/alternatives.ts
    - src/engine/decide/setbacks.ts
    - src/engine/decide/wait.ts
    - src/engine/decide/__tests__/alternatives.test.ts
    - src/engine/decide/__tests__/setbacks.test.ts
    - src/engine/decide/__tests__/wait.test.ts
    - src/engine/decide/__tests__/deviations/d06-projection-return.test.ts
    - src/engine/decide/__tests__/deviations/d39-d40-runway-and-wait.test.ts
decisions:
  - "spareCashOf(context) is exported from alternatives.ts and used by buildWaitPlan, so the alternatives' spare cash and the wait target can never drift (cash above the cushion after bills due within 90 days, always)"
  - "Suppressed rows keep their dayOne and monthly figures and null every projection (contributed, projected, growth, byRate), so the UI can explain the suppression without implying a saving"
metrics:
  tasks: 3
  files: 8
  tests: 792 across engine/decide and engine/payoff
  completed: 2026-10-16
---

# Phase 4 Plan 10: Alternatives, setbacks and wait plan Summary

The step-4 alternatives table, the four setbacks with the D-39 runway, and the D-40 wait-and-save plan, as pure engine functions at 100% statement, branch, function and line coverage.

## What was built

- `buildAlternatives`: four rows in order (as_planned, cheaper, wait_and_save, skip). Money that is not genuinely spare is suppressed with a code (month_short, too_thin, nothing_freed, past_horizon, nothing_spare) and carries no projected figure. Spare money is capped at cash above the cushion after the bills due within 90 days (`cashAfterBills`, with or without a pay series) and the monthly surplus. Projections run at `limits.projectionReturn` (0% by default, D-06) and every projected row carries `byRate` for each entered rate (D-51). `Alternatives.cheaper` carries the "Spend less" card figures. The prototype 25.00 floor is the user-editable `spareFloor` (D-05).
- `setbackHitFor` / `setbackHit` / `runwayMonthsOf` / `applySetbacks`: each setback individually and combined, starting from `cashAfterBillsAndPurchase`. The unexpected-expense default is one month's costs (D-05). Runway is whole months from cash after the purchase (D-39). `setbackHitFor` and `runwayMonthsOf` are exposed on a plain basis for 04-21 (D-54).
- `buildWaitPlan`: target, monthly amount (default the monthly surplus), months, ready-by date and `withinSpare`; months equal the alternatives' `monthsToBuy` on a buy check at the default amount.

## Commits

| Commit | Message |
| ------ | ------- |
| 06d9268 | test(04-10): alternatives table and suppression |
| 9f65201 | feat(04-10): four-way alternatives with suppression |
| 97a2232 | test(04-10): setbacks |
| 404c137 | feat(04-10): setbacks re-assessment |
| 8d9d297 | test(04-10): wait-and-save plan |
| ec46dae | test(04-10): D-39 and D-40 deviation tests |
| cf45c53 | feat(04-10): wait-and-save plan |

## Verification

- `npx jest src/engine/decide src/engine/payoff --coverage`: 50 suites, 792 tests passed; alternatives.ts, setbacks.ts and wait.ts at 100% on all four measures.
- `npx tsc --noEmit`: only the known `expo-blur` error in `TabBar.tsx`.
- `npx eslint` on touched files: clean. `npm run depcruise`: no violations. `npm run check:ignores`: OK.
- Acceptance greps (no 25 floor, no 6.5, no raw cash fields, no 1200, schedule-only recurring import) all return the required counts.

## Deviations from Plan

None in behaviour; every hand-derived figure in the plan matched the engine. Test-fixture notes:

- The setbacks fixture is built from a real BL assessment with `burn` overridden to 560_000 (the plan's figure needs a 150_000 monthly payment the 300_000 cash buy does not have); `cashAfterBillsAndPurchase`, reserve (1_230_000, the D-42 default) and monthCosts (410_000) are real engine values. The PAY + YEARLY_DUE case uses the real burn of 420_000.
- With nothing enabled the plan's fixture gives `stressedOutcome` 'absorbed' (1_700_000 is above the 1_230_000 cushion); that is the correct classification.
- TDD gate: Task 1 and 2 REDs failed on a missing module; the Task 1 GREEN commit also carries two test-fixture corrections found on first run (the d06 floor fixture needed a no-debt snapshot's spending, and a BigInt literal comparison). Task 3 followed the plan's two RED commits then GREEN.

## Known Stubs

None.

## Threat Flags

None.

## Requirements

DEC-36 is fully delivered with this plan (the month table and ledgers came from 04-07, runway and the wait plan from here) and is ticked. DEC-14 and DEC-15 stay Pending: 04-19 and 04-21 still deliver parts of them.

## Self-Check: PASSED

- alternatives.ts, setbacks.ts, wait.ts and the five test files exist.
- Commits 06d9268, 9f65201, 97a2232, 404c137, 8d9d297, ec46dae, cf45c53 are in `git log` on phase/04-decide-engine.
