---
phase: 05-decide-ui
plan: 144
subsystem: decide-snapshot
tags: [decide, basis, D-107, DCU-40]
requires: [05-138, 05-142]
provides: ["CheckComputation.basisOutcomes (three rows: month, worst, average)"]
key-files:
  modified:
    - src/features/decide/snapshot/computeCheck.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/__tests__/computeCheck.test.ts
  created:
    - src/features/decide/snapshot/__tests__/basisOutcomes.test.ts
metrics:
  completed: 2026-10-24
---

# Phase 5 Plan 144: Basis outcomes Summary

`computeDetails` now returns `basisOutcomes`: the verdict state and month figure (`left`) of the same check under This month, Worst and Average, with the chosen row marked (D-107).

## What was built
- types.ts: `BasisOutcome`, `BasisOutcomes` (rows in order month, worst, average) and optional `CheckComputation.basisOutcomes`.
- computeCheck.ts: `computeCore` keeps a memory-only `engineRun` handle (rated snapshot, engine check, the others list actually passed to decide(), judgeOn, month-fallback currencies) on `CheckCore` for logged results. `computeDetails` strips it and builds the rows in `basisOutcomesOf`. The month row under a fallback uses Worst and carries `waitingCurrencies`; `chosen` is `judgeOn ?? verdict.context.money.basis`. `computeCore` never computes rows. The field is `null` for first read, none, unconverted, incomplete, a missing verdict (including a missing variant), and a core with no handle.
- 11 named D-107 tests in basisOutcomes.test.ts.

## Cost of extra decide() calls
Spy counts: with the override matching the chosen basis, two extra decide() calls; one under the month to worst fallback. Wall time was not benchmarked separately (idle path only, never in computeCore).

## Deviations from Plan
1. [Rule 1 - Bug avoidance] A row also reuses the verdict when its effective basis equals `verdict.context.money.basis`, not only `snapshot.basisOverride`. With a null override the default basis row would otherwise be re-run (three extra calls); result is identical because deriveMoney takes `override ?? default`.
2. Two existing computeCheck.test.ts tests counted decide() calls through `computeCheck` (now includes the details pass). The call-count test now expects 3 (1 verdict + 2 basis rows, null-override fixture); the memoise test uses `computeCore`. Expectations about computeCore/computeDetails figures are unchanged.
3. `computeDetails` sets `basisOutcomes: null` explicitly for early returns so non-logged results read null, not undefined.

## Verify
- `npx jest src/features/decide/snapshot` with snapshot coverage: 332 tests pass; every source file in the folder at 100% for all four metrics. The only sub-100 branch figures come from the test helper files snapshotFixtures.ts and sourceFixtures.ts when they are included by the ad-hoc `--collectCoverageFrom` glob from the plan (pre-existing artefact; they are not source).
- typecheck: clean. lint: 0 errors (838 pre-existing warnings). depcruise: no violations.
- Whole `src/features/decide` run showed failures outside this plan: MonthDetailsSheet, LinesAndMonth (RoughFiguresSheet), FoldList, useEstimateBias. Not touched by this plan; probably other executors' uncommitted work or timeouts under load (runs took 120s+). Left alone.

## Known Stubs
None.

## Self-Check: PASSED
