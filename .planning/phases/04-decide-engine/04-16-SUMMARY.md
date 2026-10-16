---
phase: 04-decide-engine
plan: 16
subsystem: engine/decide
tags: [running-costs, estimate-bias, tdd]
requires: [04-05]
provides: [RUNNING_COST_PROMPTS, runningCostPrompts, isNonCashCategory, estimateBias]
affects: [04-06, phase-05]
key-files:
  created:
    - src/engine/decide/runningCostPrompts.ts
    - src/engine/decide/estimateBias.ts
    - src/engine/decide/__tests__/runningCostPrompts.test.ts
    - src/engine/decide/__tests__/estimateBias.test.ts
decisions:
  - "estimateBias averages per-decision ratios (half-up bp), excludes zero estimates and null actuals, null below 3 usable decisions"
metrics:
  completed: 2026-10-16
requirements-completed: [DEC-12, DEC-13, DEC-30, DEC-31]
---

# Phase 4 Plan 16: Running-cost prompts and estimate bias Summary

Category-only running-cost prompt table by item type (loss_of_value the one non-cash category) and an exact signed basis-point estimate bias over past decisions, both at 100% branch coverage.

## Tasks

| Task | Commits |
| ---- | ------- |
| 1 Prompt table (D-55, D-63) | 222a648 (RED), 9be24e8 (GREEN) |
| 2 Estimate bias (D-56, D-62) | 99886ba (RED), 0f5aae4 (GREEN) |

## Verification

- `npx jest src/engine/decide`: 274 tests pass; estimateBias.ts and runningCostPrompts.ts at 100% statements/branches/functions/lines; decide/ threshold not reported as failing.
- eslint clean, depcruise clean, check:ignores OK. tsc only reports the known `expo-blur` error in TabBar.tsx.

## Deviations from Plan

None. Minor: `estimateBias` builds the result tuple from three explicit `measure` calls (instead of mapping an array) to satisfy `noUncheckedIndexedAccess`.

## Self-Check: PASSED
