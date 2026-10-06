---
phase: 02-record
plan: 18
subsystem: data
tags: [recurring-series, mutations, tanstack-query, undo]
requires: [02-12, 02-15, 02-17]
provides:
  - useCreateSeries, useEditSeriesFrom, useEndSeries, registerSeriesMutations
  - seriesInputFromRow, seriesPatchFromOccurrenceEdit
affects: [02-21, 02-26]
key-files:
  created:
    - src/data/mutations/recurringSeries.ts
    - src/data/mutations/__tests__/recurringSeries.test.tsx
  modified:
    - src/data/mutations/index.ts
requirements-completed: [REC-05, REC-06]
duration: ~40 min
completed: 2026-10-06
---

# Phase 2 Plan 18: Recurring-series mutations Summary

Series create (fresh, from an existing row, or with linked import rows), edit "this and future" and end go through the paused-mutation queue. Each action sends a server-recorded undo label (D-WR-04) with a step id minted once before `mutate`.

## Commits
- 2236330 test(02-18): failing tests (RED, module missing)
- 5c94e8d feat(02-18): implementation (GREEN)

Tasks 1 and 2 share one RED and one GREEN commit because the helpers and hooks live in one module and one test file.

## Verification
`npx jest src/data` 24 suites / 322 tests pass. `npm run typecheck`, `npm run depcruise` and `npx eslint` on the changed files are clean.

## Deviations from Plan

Follow-up note `02-REVIEW-FOLLOWUPS.md` overrides the plan where they disagree.

1. **[Follow-up item 1 over plan] No `inverseOfSeriesChange` / `insertUndoStep` / `recordUndoStepSafely`.** The RPC wrappers take a `SeriesUndoLabel` and the server records the step in the same transaction. `UndoCapture` is not used. The `inverseOfSeriesChange(` acceptance grep therefore returns 0, deliberately. Hooks return the step id minted once up front, kept across replays as the server's replay key. 'already-applied' records nothing.
2. **`anchorIsNew` dropped.** The plan had the anchor's unlink op carry `deleted_at: '$now'` so one Undo removes a brand-new entry together with its series. That needs a client-built step; the server builds the series step and will not soft-delete the anchor. Plan 02-21 must treat undoing a series created from a new entry as unlinking only, or a server change is needed (RPC option to delete the anchor on undo). Flagged for the orchestrator.
3. **Items 2/3 (`applyPatches`, `serialiseOps`):** not applicable, since this plan makes no `applyPatches` call.
4. **Item 14:** `registerSeriesMutations(qc)` added to `src/data/mutations/index.ts` after the existing registrations with no reordering.
5. **Extra behaviour:** success and error paths also invalidate `undoLog(ownerId)` (the step is now written server-side, so History must refetch). A create rejected as a conflict is also rolled back, as it carries no version.

## Decisions
- The failed-writes entry for a rejected create carries `{name, freq, anchor_date}`, never an amount.
- Edit-from and end resolve their expected version through the `recurring_series` version chain and record the new version only on 'applied'.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
Both files and both commits (2236330, 5c94e8d) exist; STATE.md and ROADMAP.md untouched.
