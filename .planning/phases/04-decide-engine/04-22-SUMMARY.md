---
phase: 04-decide-engine
plan: 22
subsystem: engine/decide
tags: [promo-rates, deferred-interest, late-fees, tdd]
requires: [04-06, 04-14]
provides: [rateScheduleFor, Plan.promo, Plan.lateFees]
affects: [04-09, 04-12, 04-19, 04-21, phase-05]
key-files:
  created:
    - src/engine/decide/__tests__/deviations/d48-d50-credit-terms.test.ts
  modified:
    - src/engine/decide/plan.ts
    - src/engine/decide/__tests__/plan.test.ts
decisions:
  - "Plan.monthly is the highest scheduled payment only when a promo is present; without one it stays the first payment, so plans without credit terms equal 04-06's"
  - "clearsBeforePromoEnd for amortised plans is balanceAtPromoEnd === 0; paymentAfterPromo is null then"
  - "variable is validated as boolean and otherwise ignored (D-49); promo terms on a full card payoff are ignored (nothing financed)"
metrics:
  tasks: 2
  files: 3
  tests: "plan.test.ts 66 -> 75+; 4 named D-48/D-50 tests; src/engine 2669 passed"
  completed: 2026-10-16
---

# Phase 4 Plan 22: Credit terms Summary

Loan and card plans now follow user-entered promotional rates and deferred interest through `rateScheduleFor` and the 04-14 schedule functions, and instalment plans report the cost of one and two late payments beside an otherwise unchanged plan. Nothing is defaulted: the post-promo APR stays required, the variable flag changes nothing, and no late-fee cap is invented.

## What was built

- `rateScheduleFor(apr, promo)`: single rate without a promo; otherwise a promo segment then the standard APR. Guards promo months (1..600) and deferred interest needing a 0% promo, with the `resolvePlan:` prefix.
- `Plan.promo` (PromoOutcome) for loans and card months/minimum; `Plan.monthly` becomes the highest payment; `paymentSteps` stays the series source (W3 proven: the steps sum to the schedule total and differ from `monthly x (months - 1) + finalMonthly`).
- D-63 holds: card promo `cardCosts` = schedule interest (deferred charge included) + one-off `cardFees`; null when the minimum never clears.
- `Plan.lateFees` on instalment plans: `min(fee x min(n, count), cap)`; guards for negative values and a cap without a fee.

## Commits

| Commit | Message |
| ------ | ------- |
| 59e5bd1 | test(04-22): promotional rates and the variable flag |
| 776aa4a | feat(04-22): promotional rates in plan resolution |
| 9574c6f | test(04-22): late fees |
| a59e56b | test(04-22): D-48 and D-50 named tests |
| f32c77a | feat(04-22): instalment late fees |

RED observed failing for promo tests (12 failures) and for the late-fee tests (6 failures, including the D-50 named test) before each GREEN. The other three named D-48 tests pass on Task 1's code, as the plan expects.

## Verification

- `npx jest src/engine --coverage`: 2669 passed; plan.ts 100% on all four measures; decide and payoff thresholds met.
- `npx tsc --noEmit`: only the known `expo-blur` error in `TabBar.tsx`.
- eslint clean (existing `fc` default-import warnings only); `npm run depcruise`, `npm run check:ignores` pass; golden `--check` clean; grep gates for default rates (22.9, 9.9) and a 25% cap return 0.

## Deviations from Plan

None - plan executed as written. Plan hand figures (33_333, 100_000, 800/1_600) matched the engine.

## Issues observed (out of scope)

- Running coverage over all of `src/engine` reports `src/engine/statement/` at 99.88% statements against its 100% threshold. That folder is untouched by this plan; pre-existing.

## Requirements

DEC-01/03/24/25/26 left pending (other plans still deliver parts); DEC-04 already complete.

## Self-Check: PASSED
