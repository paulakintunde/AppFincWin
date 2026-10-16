---
phase: 04-decide-engine
plan: 06
subsystem: engine/decide
tags: [plan-resolution, card-rule, check-inputs, sales-tax, loss-of-value, payment-steps]
requires: [04-04, 04-05, 04-14, 04-16]
provides: [resolvePlan, resolvePlanStrict, withPrice, resolvePriceInputs, salesTaxAmount, netRunningCosts, lossOfValueMonthly]
affects: [04-07, 04-08, 04-17, 04-19, 04-21, 04-22]
key-files:
  created:
    - src/engine/decide/plan.ts
    - src/engine/decide/checkInputs.ts
    - src/engine/decide/__tests__/plan.test.ts
    - src/engine/decide/__tests__/checkInputs.test.ts
    - src/engine/decide/__tests__/deviations/d07-card-apr-never-invented.test.ts
    - src/engine/decide/__tests__/deviations/d18-dealer-cap-remainder.test.ts
    - src/engine/decide/__tests__/deviations/instalment-path.test.ts
    - src/engine/decide/__tests__/deviations/d37-check-inputs.test.ts
    - src/engine/decide/__tests__/deviations/d55-loss-of-value-non-cash.test.ts
  modified:
    - src/engine/payoff/index.ts
key-decisions:
  - "Every plan is built from amortiseSchedule / simulateMinimumSchedule with a single-rate schedule; paymentSteps come from paymentsByMonth compressed into runs (zero-amount runs dropped)"
  - "Card total = price + interest + cardFees for every card payoff; financed = onCard (prototype fin = cap), including full payoff"
  - "A card minimum that never clears repeats its last payment step to SIMULATION_MONTH_CAP; interest, total and cardCosts are null"
  - "Card fees are day-one cash and never interest, so plan.total - plan.price === card.cardCosts"
requirements-completed: [DEC-04, DEC-05, DEC-35]
duration: ~45min
completed: 2026-10-16
---

# Phase 4 Plan 06: resolvePlan and check inputs Summary

Every payment method (cash, deposit plus loan, instalment, card full/months/minimum, invest lump/monthly) resolves into one comparable Plan with paymentSteps, finalMonthly and impliedAnnualRate, or into `missing` with exact reason codes; the step-2 final price, day-one fees, sales tax, running costs and non-cash loss of value are engine figures.

## Commits
- 386f3b6 test(04-06): resolvePlan method x card-plan matrix
- 104b268 feat(04-06): resolvePlan for all payment methods
- 3d40628 test(04-06): D-07, D-18 and instalment deviation tests
- 050997c test(04-06): check inputs and sales tax
- 92f6ed1 feat(04-06): check inputs: final price, day fees, sales tax, running costs

## Verification
- `npx jest src/engine/decide src/engine/payoff --coverage`: 37 suites, 491 tests pass; decide and payoff stay at 100% (no threshold failures for those folders; the other engine folders report thresholds only because the run was scoped)
- `npx tsc --noEmit`: only the known expo-blur error in TabBar.tsx
- `npx eslint src/engine/decide src/engine/payoff`: 0 errors (fast-check default-import warnings as in earlier plans)
- `npm run depcruise` and `npm run check:ignores`: clean
- plan.ts has no reference to suggestItemType, suggestSecured or marketDefaults, and no default APR or cap

## Deviations from Plan

**1. [Rule 3 - Blocking] Payoff barrel did not export rateSchedule**
- **Found during:** Task 1
- **Issue:** the plan says amortiseSchedule / simulateMinimumSchedule / singleRate come "via the payoff barrel", but `src/engine/payoff/index.ts` did not re-export `rateSchedule.ts` (04-14 only tested it directly).
- **Fix:** added `export * from './rateSchedule';` to the barrel.
- **Commit:** 104b268

**2. Task ordering (RED/GREEN)**: the implementation was written before its test file was committed, so the RED commits contain tests that pass at their successor commit, not tests observed failing. Test commits precede the implementation commits in history for Tasks 1 and 3. Task 2 tests pass immediately by design.

Otherwise the plan executed as written. Decision taken where the plan was silent: card `financed` is the on-card amount for every card payoff, including `full` (the prototype set `fin: cap` for all card plans).

## Notes for later plans
- 04-04 flag still applies: `amortise` lets the final payment absorb the rounding residual. plan.ts never assumes finalPayment is close to payment; `paymentSteps` carries the real final amount.
- A card minimum with outcome `exceeds_month_cap` reports months 600 and the interest accrued to that point; its paymentSteps do not sum to total minus dayOne (the balance is still open). Only the loan and card-months property is asserted.
- 04-22 adds the credit terms (promo, variable, late fees); plans here carry `promo: null` and `lateFees: null`.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
All files listed above exist and all five commit hashes appear in `git log`.
