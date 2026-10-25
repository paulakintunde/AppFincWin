---
phase: 05-decide-ui
plan: 89
subsystem: engine
tags: [engine, payoff, amortise, periodsPerYear, D-89]
requires: [05-87]
provides:
  - amortise and amortiseDue take periodsPerYear 12 | 26 | 52 | 4 (default 12)
  - PeriodsPerYear type and rateDenominator(ppy) in engine/payoff
affects: [05-91]
key-files:
  modified:
    - src/engine/payoff/amortise.ts
    - src/engine/payoff/types.ts
    - src/engine/payoff/__tests__/amortise.test.ts
    - src/features/decide/__tests__/engineBarrel.test.ts
decisions:
  - "rateDenominator(ppy) = 100 x ppy x PERCENT_SCALE; MONTHLY_RATE_DENOMINATOR is rateDenominator(12), same value"
  - "assertMonths becomes assertPeriods in amortise.ts; same 1..600 cap, message now says periods; the error prefix 'amortise: ' is kept"
requirements: [DCU-31, DCU-17]
metrics:
  tasks: 1
  completed: 2026-10-23
---

# Phase 5 Plan 89: Engine E3a, payoff periods per year Summary

amortise and amortiseDue work out the level payment per period for monthly, every-2-weeks, weekly and quarterly plans: the rate per period is apr / 100 / periodsPerYear in bigint, rounding unchanged (rounded up, final payment adjusted, D-64). The default of 12 leaves every existing call bit-for-bit as it was.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. periodsPerYear on amortise and amortiseDue | 58983c36 | walkLevel takes the denominator as a parameter; tests named "D-89" (weekly clears exactly, ppy 12 unchanged, 500 periods pass, ppy x apr x n x principal grid for both functions, quarterly 8% hand-check 515.05) |

## Verification

- `engine/payoff` per-file coverage 100% on all four measures for amortise.ts and every other source file except types.ts lines 59-60 (`minorOrNull`) when only the payoff suite runs; that function is not exercised by the payoff tests and is covered by the decide suite (not changed by this plan). The plan's global-threshold command therefore reports a shortfall on types.ts alone.
- `engine/decide` suite: 82 suites pass, no threshold failure.
- Golden suites (decide and payoff) pass unchanged.
- depcruise clean; eslint 0 errors on touched files; the typecheck's only error is in `src/shell/fab/__tests__/FabProvider.test.tsx` (another plan, not touched here).

## Deviations from Plan

**1. [Rule 3 - Blocking] Barrel test enumerates runtime exports**
- `engineBarrel.test.ts` PAYOFF_RUNTIME_EXPORTS gained `rateDenominator` (outside the plan file list, as in 05-81). `PeriodsPerYear` is a type and needs no entry.
- That test currently also fails on `MAX_APR`, `MAX_IMPLIED_APR_COUNT`, `impliedApr`, `impliedAprDisplay`, which another executor's uncommitted `payoff/index.ts` change exports. It passes once that plan adds them to the list.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-89: engine-only; nothing visible until 05-91.

## Self-Check: PASSED
