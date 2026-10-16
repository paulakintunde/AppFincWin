---
phase: 04-decide-engine
plan: 08
subsystem: engine/decide
tags: [first-read, rough-cushion, tdd]
requires: [04-06, 04-15]
provides: [firstRead]
affects: [04-11, phase-05]
key-files:
  created:
    - src/engine/decide/firstRead.ts
    - src/engine/decide/__tests__/firstRead.test.ts
decisions:
  - "Rough cushion is 3 x rough monthly spending; cashAfter at or above 0 but below it is `adjust` with a `cash` warning (D-11 amended)"
  - "Size (D-36) and confidence (D-46) computed before the plan resolves, so the missing result carries both"
metrics:
  tasks: 1
  files: 2
  tests: 23 (firstRead.test.ts); 668 across engine/decide and engine/payoff
  completed: 2026-10-16
---

# Phase 4 Plan 08: firstRead Summary

`firstRead(figures, check)` gives a brand-new user a cash-level answer from a cash balance, rough income and rough spending: whether cash covers the day-one cost, whether the month closes, and whether cash stays at or above a rough cushion of 3 x rough spending. Results are `fits`, `adjust`, `no` or `missing`, always marked `first_read_rough_figures`, with the D-36 size code and rough `first_read` confidence. Warnings are limited to `month` and `cash`, sorted by shortfall with the WARNING_ORDER tie-break. `firstRead.ts` is at 100% statements, branches, functions and lines.

## Commits

| Commit | Message |
| ------ | ------- |
| b10aff6 | test(04-08): first read from rough figures with a rough cushion |
| dd10398 | feat(04-08): cash-level first read with rough cushion |

RED was observed failing (module not found) before GREEN.

## Verification

- `npx jest src/engine/decide src/engine/payoff --coverage`: 40 suites, 668 tests passed; no decide or payoff threshold failures.
- `npx tsc --noEmit`: only the known `expo-blur` error in `TabBar.tsx`.
- eslint clean on touched files; `npm run depcruise` and `npm run check:ignores` pass.
- Plan acceptance greps: marker count 3, forbidden-name grep 0.

## Deviations from Plan

- Minor: the plan's guard list implied a cash integer check; `cash` is a branded `MinorUnits` that is already validated at construction, so the extra check was unreachable and was removed (kept 100% branches). Negative cash is allowed (overdrawn account).
- All hand-derived plan figures (930_000, 1_080_000, 750_000, 120_833, -50_833) matched the engine.

## Requirements

DEC-16 and DEC-22 are delivered in part by this plan; DEC-16's agreement-with-full-verdict test lives in 04-11, so they are left Pending in REQUIREMENTS.md.

## Self-Check: PASSED
