---
phase: 05-decide-ui
plan: 124
subsystem: decide snapshot builder / data source
tags: [pots, housing, D-100, D-101, D-103, R18.2, R18.4]
requires: [05-120, 05-121, 05-122, 05-133]
provides:
  - buildDecideSnapshot fills DecideSnapshot.pots, housingMonthly, limits.housingLine
  - SnapshotResult.pots, SnapshotResult.potChecks, meta.unconvertedPots (all result kinds)
  - withoutOwnPot, computeCore/computeCheck/computeChip own-check parameter
  - convertCeiled (round-up stored-rate conversion)
  - stacked property checks count toward housing in the combined position
affects: [05-125, 05-126, 05-129, 05-134]
key-files:
  modified:
    - src/features/decide/snapshot/buildSnapshot.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/conversion.ts
    - src/features/decide/snapshot/computeCheck.ts
    - src/features/decide/snapshot/withoutCheckWrites.ts
    - src/data/queries/decide.ts
    - src/engine/decide/position.ts
  created:
    - src/engine/decide/__tests__/housingStacked.test.ts
requirements: [DCU-36, DCU-38, DCU-35]
completed: 2026-10-24
---

# Phase 5 Plan 124: Snapshot builder, pots and housing Summary

The builder now reads the user's pots and housing costs: live pots reach the engine in the home currency (converted at the latest stored rate, set-asides never rounded down), tagged transfer legs no longer count as saving twice, `housingMonthly` and `housingLine` come from real records, and a stacked open property check counts toward housing in the combined position.

## Commits
- e2e31362 engine: stacked property check counts toward housing (`position.ts`, new `housingStacked.test.ts`)
- bec26bc0 builder, source assembler, conversion, own-pot exclusion, tests and fixtures (Tasks 1 and 2 together: the pot and housing hunks share `buildSnapshot.ts` and its test file, so they were not split)

## What was built
- **Pots (D-101).** `SnapshotSource.goals` (new `GoalSource`) carries every savings_goals row; the builder drops `done_at != null` and deleted rows. Each pot maps to a `PotInput`: `saved` = converted `opening_saved` plus the paid lines tagged `goal_id` (same rule as `savedSoFar`: absolute home amount of paid, live lines). A pot in another currency converts at the latest stored rate by exact rational maths: target and the Wait monthly amount rounded UP (`convertCeiled`), opening saved rounded DOWN, zero needs no rate. No stored rate, or a result past the money range, leaves the pot out, records the miss (existing "Lines in {{currency}} are waiting for an exchange rate." path) and counts it in `meta.unconvertedPots`. The FX fetch door is never reached (depcruise clean).
- **No double counting.** A transfer leg with `goal_id` set is left out of `savingTotal` and `investingTotal` (`goal_id` added to `SnapshotRow`). An untagged Savings-category series still counts.
- **Own pot.** `potChecks` (pot id to check id) rides on the result; `withoutOwnPot(result, checkId)` drops that check's Wait pot from `result.pots` and `snapshot.pots`. `computeCore` takes `opts.ownCheckId`, `computeCheck` and `computeChip` a trailing `ownCheckId`. `withoutCheckWrites` also drops goals whose `check_id` is the check's. 05-129 passes the id.
- **Housing (D-103).** `housingMonthly` = half-up average over the used months of paid, non-one-off Housing-category outflows (the same `expenseTotals`, so a debt-covered series counts once, in the loan's minimum) plus `minimum_payment` of live non-card debts with `is_housing`. Same on the Worst and Average basis. `housingLine` is parsed with the DSR pattern and capped at 100; a bad value counts toward `limitsReset`. `SettingsSource.housing_line` and `DebtSource.is_housing` are new.
- **Source assembler.** `useDecideSnapshot` reads `useSavingsGoals`, adds it to the required reads, to the source and its dependency list. Debts already carry `is_housing` from 05-122's row.
- **Stacked housing (hand-off 3).** `stackCheck` (engine `position.ts`) adds a stacked buy-property check's positive net monthly cost to `housingMonthly` in the combined position only; the standalone position is unchanged.

## Verification
- Plan coverage command scope (`src/features/decide/snapshot/**`): 100% statements, branches, functions and lines; `position.ts` 100% as well.
- Named tests present and passing: the eight D-101 acceptance tests, the four D-103 acceptance tests, plus tagged-line saved, rate-less tagged line, out-of-range conversion, saved cap, housing basis, housing loan in another currency, valid and invalid housing_line, and `D-103 a stacked open property check counts toward housing`.
- `npx jest src/features/decide src/engine src/data`: 363 suites, 5869 passed, 14 skipped (all pre-existing skips).
- `tsc --noEmit` clean, eslint 0 errors on touched files, `npm run depcruise` no violations.

## Hand-off notes
1. Done pots and deleted rows are filtered in the builder (`done_at != null`, `deleted_at != null`).
2. `housingMonthly` and `housingLine` are filled for real.
3. Stacking: the combined position now carries other property checks' monthly housing cost (see Deviations 1). Remaining: nothing for personal scope. Household scope (Phase 8) would need the share applied; `stackCheck` already uses `myPart`-shares for the other quantities, and housing uses the same `monthlyCost`, which is already the user's share.
4. Asserted: `SnapshotResult.pots` is the same array as `snapshot.pots` (and also exists on rough and none results); the hook test shows goals (kind, done_at) and debts (is_housing) reaching the source, and a done pot not reaching the engine.

## Deviations from Plan
1. **[Rule 2 - correctness] Engine file `src/engine/decide/position.ts` and a new test file** were edited, not in the plan's list. Stacking cannot be done honestly in `computeCheck.ts`: bumping `snapshot.housingMonthly` there would also change the standalone verdict. The edit is disjoint from 05-123 (its files are ownership, investmentViews, types, index).
2. **[Rule 3] Extra files:** `conversion.ts` (`convertCeiled`, sharing one rounding routine with `convertFloored`) and `conversion.test.ts`, `demoScenario.ts` and both snapshot fixture helpers (new required fields `goals`, `is_housing`, `housing_line`, `unconvertedPots`), `decide.test.tsx` mock for the goals read.
3. Tasks 1 and 2 landed in one commit (shared hunks).
4. `meta.unconvertedPots` added (not in the plan) so 05-134's Needs a look entry can say "{{count}} pot" separately from the row count; a pot's miss also counts once in `unconvertedRows`.
5. `SnapshotResult.pots` and `potChecks` are optional in the type (like `fx`, `region`), so older literals compile; the builder always sets them.

## Things to know / decisions
- **Tagged lines older than the history window.** The pot's tagged paid lines are read from the snapshot's rows (12 months back plus upcoming); lines older than that are not counted in `saved`, so a long-running pot can show less saved than the Pots screen's `savedSoFar` (which reads a dedicated goal-lines query). The effect is a slightly larger set-aside, never a smaller one. A `goalLines` source field would close it if wanted.
- **More than 50 live pots + Wait goals.** `totalSetAside` throws above `MAX_POTS` (50); the screen caps plain pots at 50 but Wait goals add to the count. Not guarded here (the engine owns the limit); worth a follow-up decision.
- **Rough hero.** The builder only exposes `pots` on rough results; no engine function subtracts set-asides from `RoughFigures` yet. The test shows `income - spending - totalSetAside(pots)`; whoever renders the rough hero (05-125/05-134) must do that subtraction.
- **Done/deleted pots' tagged legs** are still excluded from saving (spec: any leg with `goal_id`).

## Known Stubs
None.

## Device item
05-EXECUTION-NOTES entry 05-124: not edited here.

## Self-Check: PASSED
Commits e2e31362 and bec26bc0 exist; `housingStacked.test.ts` exists; ROADMAP diff is the single 05-124 tick.
