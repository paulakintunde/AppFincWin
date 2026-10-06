---
phase: 02-record
plan: 16
subsystem: data
tags: [tanstack-query, supabase, bulk-actions, undo, write-queue, jest]
requires:
  - phase: 02-record
    provides: "02-13 applyPatches/applyUndoStep/rollbackUndoTo, 02-15 undo capture + toast store"
provides:
  - "src/data/mutations/patches.ts: registerPatchMutations, useBulkPatch, useBulkDelete, useBulkMarkPaid, useBulkMarkUnpaid"
  - "src/data/mutations/undo.ts: registerUndoMutations, useUndo, useRollbackUndo"
affects: [02-28 toast host and History screen, 02-22 and later UI wiring bulk actions]
key-files:
  created:
    - src/data/mutations/patches.ts
    - src/data/mutations/undo.ts
    - src/data/mutations/__tests__/patches.test.tsx
    - src/data/mutations/__tests__/undo.test.tsx
  modified:
    - src/data/mutations/index.ts
key-decisions:
  - "Undo and rollback return refused/blocked/not-found as outcomes, never throw, so the serial queue continues and a refused step is never retried"
  - "Bulk n label param is recomputed at flush time from the final item count, so a delete that pulled in transfer partners says the true number"
requirements-completed: [ACT-05, REC-11, REC-12, REC-06, REC-18]
duration: ~1h (mostly jest start-up time)
completed: 2026-10-06
---

# Phase 2 Plan 16: Bulk Actions and Undo Mutations Summary

**Bulk delete, mark paid and mark unpaid are each one atomic queued `apply_patches` call carrying its own undo step; undo and "roll back to here" are queued writes in the same serial queue, with refusals recorded in failed writes and raised as attributed toasts.**

## Accomplishments
- `patches.ts`: one `bulkPatch` mutation default. The mutationFn dedupes items, appends transfer partner legs fetched at flush time (D-50), chains versions via `resolveExpectedVersion`, calls `planBulkPatch` once and sends forward ops plus the built step in a single `applyPatches` call. Optimistic update drops deleted rows from loaded months and merges status patches with `pending: true` (including month moves). A conflict refetches, records one `conflict` failed write on the conflicting row and raises a refusal toast.
- Mark paid / unpaid skip transfer legs and throw `RangeError('nothing to mark')` when nothing is eligible; empty or over-6000 selections throw `RangeError` before `mutate`.
- `undo.ts`: `undoStep` and `rollbackUndo` defaults on `WRITE_SCOPE` with the standard retry policy. Outcomes drive the toast (`undo.reverted`, `undo.rolledBack`, `undo.notRecorded`, or a refusal toast carrying the `UndoConflict`) and a failed write against `undo_log`.
- Both registered in `registerMutationDefaults`.
- Verification: `npx jest src/data src/state` 21 suites / 281 tests pass; `npm run typecheck`, `npm run depcruise` and eslint on all touched files are clean.

## Task Commits
1. Task 1 (bulk patch + hooks): a95c606
2. Task 2 (undo + rollback): see git log (a8ee0ce)

## Review follow-ups applied (02-REVIEW-FOLLOWUPS.md)
- #2 every `applyPatches` call sends `p_undo_step`; the step id is minted once before `mutate` and persisted in the variables, so replays are recognised.
- #3 `expectedVersion` always supplied (chain-resolved).
- #6 duplicates removed before `planBulkPatch` (in hooks and again after partner expansion).
- #14 remaining mutation keys: `bulkPatch`, `undoStep`, `rollbackUndo` registered here; categories, recurring series, transfers and `saveImportProfile` keys belong to later plans and are noted in `index.ts`. Added the queued undo-record vs undo-apply ordering test (insert then rpc).

## Deviations from Plan
1. **[Follow-up note] Toast `n`:** the plan fixed `n` at hook time; it is recomputed in the mutationFn so partner legs are counted.
2. **[Rule 2] Rollback `blocked` with no conflict:** shows a refusal toast with no refusal payload and records no new failed write (the earlier refusal was already recorded).
3. **[Rule 2] Non-conflict rejections** of a bulk write record a failed write keyed `bulk:<stepId>` (ids and counts only) so a rejected batch is never silent.
4. **TDD order:** Task 1 RED was confirmed (module missing) after the implementation was drafted, not before; Task 2 tests were written after `undo.ts` and were not run RED. Both suites are behaviour-level and pass.
5. Mark-paid optimistic merge also moves a row between loaded months when its date changes month.

## Known Stubs
None.

## Self-Check: PASSED
Files and both commits exist; STATE.md and ROADMAP.md untouched.
