---
phase: 07-insights
plan: 01
subsystem: engine
tags: [health-score, engine, tdd, INS-06, ARC-21]
requires: []
provides:
  - "healthScore(HealthInputs): HealthScore (pure, integer BigInt maths)"
  - "healthInputsOf(prepared): the only reader of Decide's Prepared"
  - "HEALTH_SHORT_CAP = 74"
affects: [07-04, 07-05, 07-06]
key-files:
  created:
    - src/engine/health/types.ts
    - src/engine/health/score.ts
    - src/engine/health/inputs.ts
    - src/engine/health/index.ts
    - src/engine/health/__tests__/score.test.ts
    - src/engine/health/__tests__/inputs.test.ts
    - src/engine/health/__tests__/short.property.test.ts
    - src/engine/health/__tests__/purity.test.ts
key-decisions:
  - "D-25: inputs follow Decide (left after planned bills and saving; cover = savings over one month of essential costs); each part rounded half-up on its own so parts sum exactly to the score"
requirements-completed: [INS-06]
duration: long (machine heavily loaded by parallel agents)
completed: 2026-11-22
---

# Phase 07 Plan 01: Health score engine Summary

Pure four-part health score (35/30/20/15, each part rounded half-up once, short months capped at 74) in `src/engine/health/`, fed only by Decide's own reading through `healthInputsOf`.

## Commits
- 39bcb7e0 test(07-01): add failing health score tests (RED)
- d0315859 feat(07-01): health score engine (GREEN)
- 2c1b3b8a feat(07-01): healthInputsOf reads Decide's reading (inputs tests, Decide-linked property, barrel)

## Deviations from Plan
None of substance. The final 0..100 clamp from the feature text is not a separate branch: the four capped parts always sum to 0..100, so the cap alone is coded (a clamp would be dead code at 100% branch coverage); the property test pins the bounds. Task 2 RED and GREEN went in one commit.

## Checks
- `npx jest src/engine/health` with coverage on `src/engine/health/**`: 4 suites, 25 tests pass; 100% statements, branches, functions, lines (threshold enforced).
- eslint on `src/engine/health` and `npm run depcruise`: exit 0.
- `npx tsc --noEmit`: see hand-back note (re-run at end).
- No Math.round, parseFloat or toFixed in score.ts; score.ts and types.ts import nothing from decide/ or month/ (purity test).

## Known Stubs
None.

## Self-Check: PASSED
