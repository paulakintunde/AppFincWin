---
phase: 05-decide-ui
plan: 123
subsystem: decide engine
tags: [engine, E7, total-cost, opportunity-cost, DCU-37, D-102, D-104]
requires: [05-120, 05-121, 05-131]
provides: [totalCost, TotalCost, TotalCostInput, InvestmentViews.headline, InvestmentHeadline]
affects: [05-128]
key-files:
  created:
    - src/engine/decide/ownership.ts
    - src/engine/decide/__tests__/ownership.test.ts
    - src/engine/decide/__tests__/ownershipProperties.test.ts
  modified:
    - src/engine/decide/investmentViews.ts
    - src/engine/decide/types.ts
    - src/engine/decide/index.ts
    - src/engine/decide/__tests__/investmentViews.test.ts
    - src/engine/decide/__tests__/public-api.test.ts
    - src/features/decide/__tests__/engineBarrel.test.ts
metrics:
  completed: 2026-10-24
requirements: [DCU-37]
---

# Phase 5 Plan 123: Engine E7 total cost and invested-instead headline Summary

`totalCost` states the cost over the years from figures the check already holds, and `investmentViews` gains a `headline` for the first typed non-zero rate, never a defaulted one.

## Commits
- 94cb5044 feat(05-123): totalCost of ownership (D-102, E7)
- 7637c762 feat(05-123): invested-instead headline in investmentViews (D-104, E7)
- (follow-up) typecheck narrowing fix in ownership.ts, plus this summary and the ROADMAP tick

## What was built
- `totalCost(check, verdict, { horizonMonths, advertised, lossMonthly }) -> TotalCost | null` in `ownership.ts`. total = myPart(plan.total) + max(0, mineRunning) x H - resale; H = chosen, else plan term, else 60, never below plan.months. Null for an invest check, a missing verdict, a null plan total, or any component past the safe range (never thrown). An invalid chosen horizon throws, as `investmentViews` does.
- `investmentViews(...).headline = { rate, contributed, projected | null, rangeCode }` for the first non-zero entry in `projectionRates`: month-0 lump of `mineDayOne` (one rounding, with the fee) plus the existing `paymentsInvested` figure for that rate, added exactly. Null with no non-zero rate or contributed 0. Out of range gives `projected: null`, `rangeCode: 'exceeds_range'`.
- Barrel export, `totalCost` in `DECIDE_RUNTIME_EXPORTS`, `ownership.ts` in the public-api verdict-path file list and a typeof check.
- Tests: all named D-102 and D-104 tests from the plan (plus an invalid-horizon test, a household rounding test, an out-of-range test) and a fast-check property.

## Verification
- `npx jest src/engine` with 100% gate on ownership.ts and investmentViews.ts: 182 suites pass, 100/100/100/100.
- barrel/public-api/ownership targeted run with the 100% gate on ownership.ts: pass.
- `npm run typecheck` exit 0, `npm run lint` 0 errors (795 pre-existing warnings), `npm run depcruise` no violations, `npm run check:ignores` OK.

## Deviations from Plan
1. **Signature.** The plan did not fix `totalCost`'s arguments. It takes `(check, verdict, { horizonMonths, advertised, lossMonthly })`; `advertised` comes from `ResolvedPrice.advertised` and `lossMonthly` from `RunningCosts.nonCash`, supplied by 05-128 (no new check input).
2. **Headline "fee makes the net rate invalid" has no engine path.** The fee is bounded to 0..100% and rates are non-negative, so the net factor never goes invalid; no dead branch was added. The existing guard throws for a bad fee.
3. **Invest checks.** The headline is null for invest checks because `investmentViews` is only called for buy checks (`computeDetails`), unchanged.
4. `InvestmentHeadline`/`TotalCost` types were committed with the first commit (types.ts is shared by both tasks).

## Needs a decision
None. 05-128 must pass `advertised` and `lossMonthly` to `totalCost` and `horizonMonths` equal to `inputs.investHorizonMonths`.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-123: not edited here.

## Self-Check: PASSED
Commits 94cb5044 and 7637c762 exist; ownership.ts and both ownership tests exist.
