---
phase: 04-decide-engine
plan: 01
subsystem: engine/payoff
tags: [decide, amortisation, future-value, bigint, tdd]
requires: [engine/money (divideHalfUp, RATE_SCALE, minorUnits)]
provides: [Percent brand, payoff contracts, amortise (DEC-01), futureValue (DEC-02)]
affects: [04-04, 04-05, 04-06, Phase 6 payoff planner]
tech-stack:
  added: []
  patterns: [exact bigint rational with one divideHalfUp, final-payment residual reconciliation]
key-files:
  created:
    - src/engine/payoff/types.ts
    - src/engine/payoff/constants.ts
    - src/engine/payoff/amortise.ts
    - src/engine/payoff/futureValue.ts
    - src/engine/payoff/__tests__/types.test.ts
    - src/engine/payoff/__tests__/amortise.test.ts
    - src/engine/payoff/__tests__/futureValue.test.ts
key-decisions:
  - "Percent reuses RATE_SCALE with zero allowed (ScaledRate forbids 0)"
  - "amortise clamps each paid amount to balance due so tiny principals never overpay"
requirements-completed: [DEC-01, DEC-02]
duration: ~15 min
completed: 2026-10-16
---

# Phase 4 Plan 01: Payoff foundation Summary

Zero-allowing scaled `Percent` type, payoff contracts, and exact-rational `amortise` and `futureValue` with a single half-up rounding and an exact `totalPaid === principal + totalInterest` identity.

## Commits
- 3ab0459 test: payoff contracts failing tests
- 752ccfb feat: Percent type and contracts
- d07b027 test: amortise/futureValue failing tests
- af14b39 feat: amortise and futureValue

## Results
- `npx jest src/engine/payoff`: 45 tests pass; payoff 100% statements/branches/functions/lines.
- depcruise clean, check:ignores OK, eslint 0 errors (fast-check `fc` default-import warnings only, same style as existing tests).
- Known tables match (119_910, 59_955, 39_602, 8_885; FV 126_825, 112_683, 239_508).

## Deviations from Plan
**[Rule 1 - Test bug] futureValue property APR range.** The planned 0-50% APR over 600 months overflows Number.MAX_SAFE_INTEGER (correctly raising RangeError). The property now uses APR 0-10%; overflow behaviour is a deliberate guard.

## Deferred Issues
- `npx tsc --noEmit` reports one pre-existing error unrelated to payoff: `src/shell/tabBar/TabBar.tsx` cannot find module `expo-blur` (not installed in the shared node_modules). Out of scope; no payoff errors.

## Known Stubs
None.

## Self-Check: PASSED
