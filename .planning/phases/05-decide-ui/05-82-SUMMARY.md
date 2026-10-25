---
phase: 05-decide-ui
plan: 82
subsystem: engine
tags: [engine, decide, alternatives, cheaper, D-83]
requires: [05-81]
provides:
  - buildAlternatives takes an exact cheaper price ({ price }) instead of a whole-percent ratio
affects: [05-83, 05-85]
key-files:
  created:
    - src/engine/decide/__tests__/deviations/d83-exact-cheaper.test.ts
  modified:
    - src/engine/decide/alternatives.ts
    - src/engine/decide/types.ts
    - src/engine/decide/__tests__/alternatives.test.ts
    - src/features/decide/snapshot/computeCheck.ts
decisions:
  - "A loan deposit scales half up by cheaper over price (M4); a typed instalment amount keeps withPrice's ceil (HI-03); a worked-out instalment payment recomputes through resolvePlanStrict"
  - "ratioPercent is the half-up whole percent of cheaper over price, display only"
  - "A zero price accepts a cheaper price of 0 (ratio 100) so a nothing-to-pay check does not start throwing"
requirements: [DCU-05, DCU-26]
metrics:
  tasks: 1
  completed: 2026-10-23
---

# Phase 5 Plan 82: Engine E2, the exact cheaper price Summary

`buildAlternatives(context, check, assessment, cheaper?: { price })` judges the cheaper row at exactly the price given (RangeError outside 1..plan.price); absent, the 65% default applies as before.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. buildAlternatives takes an exact cheaper price | 75fffa7a | tests named "D-83"; existing alternatives tests moved to exact prices with unchanged expectations |

## Verification

- `jest src/engine src/features/decide/snapshot`: 182 suites passed.
- engine/decide and engine/payoff coverage: 100% statements, branches, functions, lines (threshold passed); computeCheck.ts 100%.
- depcruise clean, eslint clean on touched files. `grep cheaperRatioPercent alternatives.ts` returns 0.
- Golden and parity suites pass unchanged.
- `npm run typecheck` shows errors only in `src/features/decide/ui/InfoSheet.tsx` and `useInfoSheet.tsx` (another executor's untracked files, a Translate type mismatch); none in this plan's files.

## Deviations from Plan

**1. Ceil scaling of a typed instalment amount** (recorded, as the plan asked): this one figure departs from M4's half up, because half-up can leave the scaled instalments under the cheaper financed price, making the cheaper plan `missing` (instalment_total_below_price) so resolvePlanStrict throws.

**2. [Rule 1 - Bug] Zero price**: a plan price of 0 would have thrown on the default path (it did not before). The range is 0..0 when plan.price is 0, ratioPercent is 100, and the loan deposit is left alone (avoids a divide by zero).

**3. Bridge in computeCheck.ts** uses `divideHalfUp` and `minorUnits` from `@/engine/money` (the existing pattern in the snapshot folder; the decide barrel exports neither `divideHalfUp` nor `minorFromBigInt`). 05-83 replaces it.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-82: no visible change until 05-83 wires the typed price; the existing cheaper slider still gives the same figures.

## Known Stubs

None. The computeCheck bridge is temporary by design until 05-83.

## Self-Check: PASSED
