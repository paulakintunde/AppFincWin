---
phase: 02-record
plan: 15
subsystem: data
tags: [tanstack-query, supabase, undo, optimistic-concurrency, csv-import, typescript, jest]

# Dependency graph
requires:
  - phase: 02-record (plan 02-05)
    provides: "src/engine/undo: buildStep, inverseOfInserts, inverseOfPatches, inverseOfImport, planBulkPatch, BulkPatchItem, UndoConflict, PatchValue"
  - phase: 02-record (plan 02-06)
    provides: "src/engine/activity: markPaidDate (D-06)"
  - phase: 02-record (plan 02-11)
    provides: "src/db/transactions.ts: insertTransactionsBatch/IMPORT_CHUNK_MAX; src/db/rows.ts: Record/provenance fields on TransactionRow/NewTransaction/TransactionPatch"
  - phase: 02-record (plan 02-13)
    provides: "src/db/patches.ts: applyPatches; src/db/undoLog.ts: insertUndoStep; src/db/importProfiles.ts: saveImportProfile"
provides:
  - "src/data/mutations/undoCapture.ts: recordUndoStepSafely (immediate insertUndoStep, queued fallback on failure), registerUndoCaptureMutations, newStepId, useRecordUndoStep"
  - "src/state/undoToast.ts: showToast/dismissToast/useToast, TOAST_MS_ORDINARY/TOAST_MS_DESTRUCTIVE (D-31), wiped on sign-out"
  - "src/data/mutations/transactions.ts (extended): add/edit capture their own undo step at the moment the forward write succeeds; useDeleteTransaction/useMarkPaid/useSkipOccurrence; useImportChunks + chunkKeepingPairs (D-52) + the importChunk mutation default"
  - "src/data/mutations/importFinalize.ts: registerImportFinalizeMutations, useImportCommit, ImportFinalizeVars/ImportLink/ImportMarkPaid/ImportLimit/ImportCommitInput -- one atomic apply_patches call for links/mark-paid/limit plus the import's post-link undo step"
affects: ["02-16..02-18 (recurring/category/undo-history mutations and hooks)", "02-20 (entry sheet, Transfer type)", "02-26/02-27 (import pipeline UI, calls useImportCommit)", "02-28 (toast host, reads src/state/undoToast.ts)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Undo capture at the moment of success: every add/edit mutationFn builds its inverse ops and calls recordUndoStepSafely inside its own mutationFn (after the forward write resolves), never in onSuccess and never reconstructed later"
    - "Thin useEditTransaction wrappers (delete/markPaid/skip): each builds a TransactionPatch and an UndoCapture, letting the shared hook compute `before` from the cache for exactly the patched keys"
    - "Queued-fallback recorder: a failed immediate write falls back to a fire-and-forget queued mutation (qc.getMutationCache().build(...).execute(...)) rather than blocking the caller -- mirrors the existing non-awaited resolve-rate follow-up pattern (WR-A15)"

key-files:
  created:
    - src/data/mutations/undoCapture.ts
    - src/data/mutations/__tests__/undoCapture.test.tsx
    - src/state/undoToast.ts
    - src/state/__tests__/undoToast.test.ts
    - src/data/mutations/importFinalize.ts
    - src/data/mutations/__tests__/importFinalize.test.tsx
  modified:
    - src/data/mutations/transactions.ts
    - src/data/mutations/__tests__/transactions.test.tsx
    - src/data/mutations/index.ts

key-decisions:
  - "chunkKeepingPairs is defined in transactions.ts, not importFinalize.ts as the plan's <action> text specifies, and importFinalize.ts re-exports it -- the plan's literal placement creates a genuine import cycle (importFinalize.ts's useImportCommit needs useImportChunks from transactions.ts; the plan also has useImportChunks importing chunkKeepingPairs from importFinalize.ts), which the project's no-circular dependency-cruiser rule forbids unconditionally. One-directional dependency (importFinalize.ts -> transactions.ts) preserves both files' documented public shape."
  - "useEditTransaction's edit() takes an optional second `undo` parameter (typed as UndoCapture) rather than requiring every caller to pre-compute `before` -- the hook reads the cached row itself and attaches `before` (and the undo step) only when a cached row was found, matching the plan's 'attaches vars.undo only when the row was found'"
  - "recordUndoStepSafely's queued fallback is fired via `void mutation.execute(...).catch(() => {})` rather than awaited to completion -- awaiting it would let an offline pause hang the caller's own (already-awaited) mutationFn indefinitely, which WR-A15's existing non-awaited resolve-rate follow-up specifically avoids for the same reason"
  - "followUpIfRatePending's parameter was narrowed from TransactionRow to Pick<TransactionRow, 'id' | 'rate_pending'> so the import chunk's resolve-rate follow-up (which only has that Pick from insertTransactionsBatch's return shape) can reuse it without a wasted extra fetch or an unsafe cast"

requirements-completed: [REC-01, REC-02, REC-03, REC-04, REC-06, REC-09, REC-11, REC-13, REC-14, REC-17, REC-18]

# Metrics
duration: ~5h (dominated by a heavily-loaded shared machine: a fresh `npm ci`, and several `npx jest`/`tsc`/`depcruise` runs that took many multiples of their normal time under CPU contention from other parallel agents)
completed: 2026-09-28
---

# Phase 2 Plan 15: Record Mutations -- Undo Capture, Soft Delete, Mark Paid, Skip, Import Chunks, Import Finalize Summary

**Extended the Phase 1 write queue (never a second pipeline) so every Record action -- add, edit, soft delete, mark paid, skip, and a chunked statement import -- captures its own undo step at the moment the forward write succeeds, with the import's links/mark-paid/limit and its single "Imported N lines" step committing atomically in one `apply_patches` call.**

## Performance

- **Duration:** ~5h wall-clock, of which the large majority was waiting on `npm ci`, `npx tsc`, `npx jest` and `npm run depcruise` under heavy contention from other parallel agents on the same shared machine (single-file jest runs that normally take ~20s took up to ~100s; one full-suite run took ~10x its expected time before the harness's own background-task pipe produced output). Active implementation/test-authoring time was a small fraction of that.
- **Completed:** 2026-09-28
- **Tasks:** 3 (all TDD: RED then GREEN)
- **Files modified:** 9 (6 created, 3 extended) -- matches the plan's `files_modified` list exactly

## Accomplishments

- `src/data/mutations/undoCapture.ts`: `recordUndoStepSafely` records an undo step immediately via `insertUndoStep`, falling back to a queued `recordUndoStep` mutation (never re-running the forward write, D-29) when the immediate write fails; registered ahead of the transaction/import mutations in `registerMutationDefaults` so a paused-mutation replay restored from disk always has a registered `mutationFn`
- `src/state/undoToast.ts`: the single toast store (D-31) -- `showToast`/`dismissToast`/`useToast`, the 3.2s/6s timing constants, cleared by the sign-out wipe handler (T-02-15-04)
- `src/data/mutations/transactions.ts`: add/edit now build their inverse ops (`inverseOfInserts`/`inverseOfPatches`) and call `recordUndoStepSafely` inside their own `mutationFn`, right after the forward write resolves; `useDeleteTransaction`/`useMarkPaid`/`useSkipOccurrence` are thin `useEditTransaction` wrappers that each record one labelled step and return its `stepId`; `placeRowInMonth` now removes a soft-deleted row from every cached month at once (D-30) instead of upserting it; `useImportChunks` + `chunkKeepingPairs` (D-52: never split a transfer pair) + the `importChunk` mutation default insert chunks into month caches already loaded, dedupe the resolve-rate follow-up per (currency, date) capped at 20/chunk, and record ids-and-counts-only failed writes on rejection (D-19)
- `src/data/mutations/importFinalize.ts`: `useImportCommit` enqueues the chunks then sends one queued `importFinalize` write that links accepted transfer pairs, marks accepted pending bills paid, sets an accepted statement limit, and records the import's single post-link undo step -- all in one atomic `apply_patches` call (D-16, D-24, D-48, D-50, D-55); when there is nothing to patch it inserts the undo step directly instead; on success it best-effort saves the remembered format profile (D-42, failure never reaches the failed-writes list); a version conflict or a `23514` pair-trigger rejection records one failed write carrying ids and counts only (T-02-15-07)
- `npx jest src/data src/state`: 210/210 tests pass across 18 suites; `npm run typecheck` and `npm run depcruise` (212 modules, 632 dependencies, zero violations including the `no-circular` rule) both clean; `npx eslint` on every file this plan touched is clean

## Task Commits

Each task followed the plan's RED-then-GREEN TDD gate:

1. **Task 1: Undo capture module + toast store + registration**
   - `cafa1a0` test(02-15): add failing tests for undo capture and toast store (RED)
   - `083207c` feat(02-15): undo-step recorder and toast store (GREEN)
2. **Task 2: Transaction mutations -- fields, soft delete, mark paid, skip, undo capture, import chunks**
   - `35a9746` test(02-15): add failing tests for transaction fields, soft delete, mark paid, skip, undo capture, import chunks (RED)
   - `36166bc` feat(02-15): extend transaction mutations for undo capture, soft delete, mark paid, skip, import chunks (GREEN)
3. **Task 3: Import finalize -- transfer links, mark-paid, limit, post-link undo step, remembered reading**
   - `6efcb18` test(02-15): add failing tests for import finalize and chunkKeepingPairs (RED)
   - `bb20bcd` feat(02-15): import finalize -- transfer links, mark-paid, limit, post-link undo step (GREEN)

**Plan metadata:** committed separately by the orchestrator per this plan's execution instructions (STATE.md/ROADMAP.md are not touched by this agent).

## Files Created/Modified

- `src/data/mutations/undoCapture.ts` - `UndoCapture`, `newStepId`, `RecordUndoStepVars`, `registerUndoCaptureMutations`, `recordUndoStepSafely`, `useRecordUndoStep`
- `src/data/mutations/__tests__/undoCapture.test.tsx` - 4 tests: direct success, queued fallback, queued success (duplicate-id tolerance lives in `insertUndoStep` itself), transient-error retry
- `src/state/undoToast.ts` - `ToastKind`, `ToastText`, `ToastState`, `TOAST_MS_ORDINARY`/`TOAST_MS_DESTRUCTIVE`, `showToast`/`dismissToast`/`getToast`/`useToast`/`resetToastForTests`
- `src/state/__tests__/undoToast.test.ts` - 8 tests: timing constants, replace-on-show, dismiss/stale-dismiss no-ops, `useToast` re-render, refusal payload passthrough, sign-out wipe
- `src/data/mutations/transactions.ts` - undo capture wired into add/edit `mutationFn`s; `placeRowInMonth`'s soft-delete removal; `useDeleteTransaction`/`useMarkPaid`/`useSkipOccurrence`; `chunkKeepingPairs`; `ImportChunkVars`/`useImportChunks`/the `importChunk` mutation default; `AddTransactionInput` gained `name`/`categoryId`/`paymentType`/`status`/`undo`
- `src/data/mutations/__tests__/transactions.test.tsx` - +20 tests across 3 new `describe` blocks (undo capture on add/edit appended to the existing `useEditTransaction` block, `useDeleteTransaction`/`useMarkPaid`/`useSkipOccurrence`, `useImportChunks`/`importChunk`)
- `src/data/mutations/importFinalize.ts` - `ImportLink`/`ImportMarkPaid`/`ImportLimit`/`ImportFinalizeVars`/`ImportCommitInput`, `registerImportFinalizeMutations`, `useImportCommit`, re-exports `chunkKeepingPairs`
- `src/data/mutations/__tests__/importFinalize.test.tsx` - 12 tests: `chunkKeepingPairs`'s pair-grouping and chunk-size guarantees, commit's precondition/ordering, the exact op list for links+markPaid+limit, the no-op-list direct-insert path, best-effort profile save (success and swallowed failure), conflict and `23514` failed-write recording
- `src/data/mutations/index.ts` - `registerUndoCaptureMutations`/`registerImportFinalizeMutations` wired into `registerMutationDefaults`, undo capture registered first

## Decisions Made

See `key-decisions` in the frontmatter. The two load-bearing ones: (1) `chunkKeepingPairs` physically lives in `transactions.ts` rather than `importFinalize.ts` to avoid a real import cycle the plan's literal file placement would have created; (2) `recordUndoStepSafely`'s queued fallback is fire-and-forget, not awaited to completion, so an offline pause can never hang the awaited forward-write `mutationFn` it was called from.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `chunkKeepingPairs`'s planned location creates a circular import**
- **Found during:** Task 2/3 design, before any code was written (reasoned through the plan's own module graph)
- **Issue:** The plan's `<action>` text places `chunkKeepingPairs` in `importFinalize.ts` (Task 3) while `useImportChunks` (Task 2, `transactions.ts`) is specified to import it from there; `importFinalize.ts`'s own `useImportCommit` in turn imports `useImportChunks` from `transactions.ts`. That is a genuine two-way dependency between the two files, and the project's `.dependency-cruiser.cjs` has an unconditional `no-circular` rule at `error` severity covering all of `src/`, not just `engine/`.
- **Fix:** Defined `chunkKeepingPairs` in `transactions.ts` (the file that needs it at the value level for `useImportChunks`), and had `importFinalize.ts` do `export { chunkKeepingPairs } from './transactions'` so downstream code can still import it from either module per the plan's documented `provides` shape. The dependency is now one-directional: `importFinalize.ts -> transactions.ts`, never the reverse.
- **Files modified:** `src/data/mutations/transactions.ts` (function moved here), `src/data/mutations/importFinalize.ts` (re-export)
- **Verification:** `npm run depcruise` -- "no dependency violations found (212 modules, 632 dependencies cruised)"; `chunkKeepingPairs`'s own behavior (never splitting a transfer pair, 1001 rows -> 3 chunks) is tested in `importFinalize.test.tsx` per the plan's documented test location, importing the function from `../importFinalize`'s re-export
- **Committed in:** `36166bc` (Task 2 GREEN, definition) and `bb20bcd` (Task 3 GREEN, re-export)

---

**Total deviations:** 1 auto-fixed (Rule 3, a pre-empted blocking issue -- caught during design rather than after a failed `depcruise` run, so no wasted implementation cycle)
**Impact on plan:** No behavioral or API change from the caller's perspective; both modules' documented exports (`useImportChunks` from `transactions.ts`, `chunkKeepingPairs` and `useImportCommit` from `importFinalize.ts`) are unchanged. Only the function's physical file location differs from the plan's literal text.

## Issues Encountered

None beyond the circular-dependency deviation above and a very heavily loaded shared machine (many other parallel Claude Code worktree-agent sessions running concurrently) that made every `npm`/`npx` command run several times slower than normal -- no code or test changes resulted from that, only elapsed wall-clock time.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every mutation `useDeleteTransaction`/`useMarkPaid`/`useSkipOccurrence`/`useImportChunks`/`useImportCommit` needs is exported and tested; downstream UI plans (02-20 entry sheet, 02-26/02-27 import pipeline/screens) can call these hooks directly
- `src/state/undoToast.ts` is ready for plan 02-28's toast host to mount `useToast()` and translate `ToastText`'s i18n key
- The import pipeline (a later plan) is responsible for excluding a mark-paid-matched row from the chunk rows it passes to `useImportCommit().commit()` before calling it (D-55) -- `commit()` itself does not filter; `insertedIds` is derived directly from `input.rows`
- No blockers for downstream plans in this wave

---

*Phase: 02-record*
*Completed: 2026-09-28*

## Self-Check: PASSED

All 9 created/modified files plus this SUMMARY.md verified present on disk. All 6 task
commits (`cafa1a0`, `083207c`, `35a9746`, `36166bc`, `6efcb18`, `bb20bcd`) verified present
in `git log`.
