---
phase: 02-record
plan: 13
subsystem: database
tags: [supabase, rpc, undo, postgrest, typescript]

# Dependency graph
requires:
  - phase: 02-record (plan 02-09)
    provides: apply_patches/apply_undo_step/rollback_undo_to RPCs, account_balances/transaction_months RPCs, undo_log table
  - phase: 02-record (plan 02-05)
    provides: engine/undo vocabulary (PatchOp, UndoStepDraft, UndoConflict, UndoLabelParams)
  - phase: 02-record (plan 02-11)
    provides: UndoLogRow, UNDO_LOG_COLUMNS, DbClient, VersionConflictError/DbError/toDbError
  - phase: 02-record (plan 02-38)
    provides: import_profiles table and its insert(id, account_id, layout_signature, profile)/update(profile) grants
provides:
  - "src/db/patches.ts: serialiseOps/serialiseStep/parseConflict/applyPatches wrapping apply_patches"
  - "src/db/undoLog.ts: fetchUndoLog/insertUndoStep/applyUndoStep/rollbackUndoTo"
  - "src/db/recordReads.ts: fetchAccountBalances/fetchTransactionMonths/fetchHouseholdMemberNames"
  - "src/db/importProfiles.ts: isFormatProfile/fetchImportProfile/saveImportProfile"
affects: [02-14, 02-15, 02-16, 02-17, 02-18, "mutation plans that call these typed wrappers instead of raw RPC names"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk/undo writes go through one typed wrapper (applyPatches) over apply_patches, never a raw rpc() call from a mutation file"
    - "RPC envelope interpretation: isRecord guard + switch on response.status, throwing DbError(BAD_RESPONSE) on any unrecognised shape (mirrors recurringSeries.ts's interpretSeriesResponse)"
    - "Remembered-shape validation (isFormatProfile) is a strict allowlist of exact keys plus enum/range checks -- a stale or foreign profile is silently ignored, never applied"

key-files:
  created:
    - src/db/patches.ts
    - src/db/undoLog.ts
    - src/db/recordReads.ts
    - src/db/importProfiles.ts
    - src/db/__tests__/patches.test.ts
    - src/db/__tests__/undoLog.test.ts
    - src/db/__tests__/recordReads.test.ts
    - src/db/__tests__/importProfiles.test.ts
  modified: []

key-decisions:
  - "applyPatches/applyUndoStep/rollbackUndoTo/parseConflict each guard the RPC envelope with an isRecord + status-switch, throwing a DbError with code 'bad-response' on anything unrecognised -- mirrors the existing recurringSeries.ts response-interpretation pattern rather than inventing a new one"
  - "importProfiles.ts keeps insert and update as two separate calls (no upsert): the migration grants narrower, non-overlapping column sets for insert vs. update, so a single merge-on-conflict write is not possible without also granting update on insert-only columns"
  - "saveImportProfile's version-conflict path (a concurrent confirm of the same layout landing between fetch and update) reuses the established VersionConflictError/NotFoundError shape from customCurrencies.ts/transactions.ts rather than inventing new behaviour for a rare, low-stakes race"

patterns-established:
  - "Pattern: db/*.ts wrapping a multi-branch RPC response validates every field strictly before returning/throwing, never trusting numeric/string fields without an explicit typeof check (T-02-13-01, T-02-13-04)"

requirements-completed: [REC-11, REC-12, ACT-05, REC-08, ACT-02, REC-13]

# Metrics
duration: ~50min active (session paused mid-plan by an API rate limit; commit timestamps span longer)
completed: 2026-09-27
---

# Phase 02 Plan 13: Record db wrappers (undo, bulk patches, reads, import profiles) Summary

**Four typed `src/db/` modules wrapping plan 02-09's server primitives: `applyPatches`/undo-log RPCs with strict envelope validation, bigint-safe balance/month reads, and a strict-shape-guarded remembered-import-profile store.**

## Performance

- **Duration:** ~50 min active work
- **Tasks:** 3 completed
- **Files modified:** 8 (4 source, 4 test)

## Accomplishments
- `applyPatches` (patches.ts) sends any version-checked op list -- bulk delete, bulk mark paid/unpaid, merge, transfer create/edit/delete, undo replay -- as one atomic `apply_patches` RPC call, optionally carrying its own undo step, and turns a server conflict into the same `VersionConflictError` Phase 1 already uses, with a parsed `UndoConflict` as `serverRow`
- `undoLog.ts` gives the data layer `fetchUndoLog` (12 deep, newest first), `insertUndoStep` (replay-safe on a duplicate id), `applyUndoStep`, and `rollbackUndoTo` -- none of them ever send `owner_id` or `touched_ids` in a write payload, matching the server's column grants exactly
- `recordReads.ts` wraps `account_balances`/`transaction_months` and adds `fetchHouseholdMemberNames`, keeping every sum as a string so it never round-trips through a JS float
- `importProfiles.ts` adds `isFormatProfile`, a strict allowlist-plus-enum shape guard, so a stale schema version or a foreign shape read back from the DB is silently ignored rather than applied to a live import

## Task Commits

Each task was committed atomically:

1. **Task 1: patches.ts and undoLog.ts** - `dfa00fd` (feat)
2. **Task 2: recordReads.ts** - `5e949fc` (feat)
3. **Task 3: importProfiles.ts (remembered statement readings)** - `0680013` (feat)

_No plan-metadata commit: this plan runs inside a wave worktree, so STATE.md/ROADMAP.md are owned by the orchestrator after the wave completes._

## Files Created/Modified
- `src/db/patches.ts` - `serialiseOps`/`serialiseStep`/`parseConflict`/`applyPatches`, the one wrapper over the `apply_patches` RPC
- `src/db/undoLog.ts` - `fetchUndoLog`/`insertUndoStep`/`applyUndoStep`/`rollbackUndoTo`
- `src/db/recordReads.ts` - `fetchAccountBalances`/`fetchTransactionMonths`/`fetchHouseholdMemberNames`
- `src/db/importProfiles.ts` - `isFormatProfile`/`fetchImportProfile`/`saveImportProfile`
- `src/db/__tests__/patches.test.ts`, `undoLog.test.ts`, `recordReads.test.ts`, `importProfiles.test.ts` - unit coverage per each module's `<behavior>` spec (70 new tests)

## Decisions Made
- Reused the codebase's existing `isRecord` + status-switch RPC-envelope pattern (from `src/db/recurringSeries.ts`'s `interpretSeriesResponse`) for `applyPatches`/`applyUndoStep`/`rollbackUndoTo` instead of introducing a different validation style, keeping every RPC wrapper in `src/db/` shaped the same way for future readers
- `importProfiles.ts`'s `saveImportProfile` treats a zero-row update result (a concurrent confirm of the same layout beating this one) the same way `customCurrencies.ts`/`transactions.ts` already treat any version-conditional update: re-fetch by id, throw `VersionConflictError` if the row is still there under a different version, `NotFoundError` if it is gone

## Deviations from Plan

None - plan executed exactly as written. Two documentation comments were reworded during self-review (not functional changes) because their prose incidentally matched the acceptance-criteria grep patterns (`rpc('apply_patches'` and the `Number(`/`parseFloat`/`parseInt` guard) -- the code itself never used a second `apply_patches` RPC call or any float-based numeric parsing; only the comment wording changed to keep the automated grep checks unambiguous.

## Issues Encountered

None beyond the wording adjustment above, resolved before the first review pass.

## Next Phase Readiness
- Every Phase 2 server primitive from plan 02-09 now has a typed, tested client wrapper: mutation plans 02-15..02-18 and query plan 02-14 can call `applyPatches`/`fetchUndoLog`/`insertUndoStep`/`applyUndoStep`/`rollbackUndoTo`/`fetchAccountBalances`/`fetchTransactionMonths`/`fetchHouseholdMemberNames`/`fetchImportProfile`/`saveImportProfile` directly, never a raw `rpc('apply_patches'`/`rpc('apply_undo_step'`/`rpc('rollback_undo_to'` call or a raw `import_profiles` table write
- No blockers for downstream plans

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 4 created source files, all 4 created test files, and this SUMMARY.md verified present on disk. All 3 task commits (`dfa00fd`, `5e949fc`, `0680013`) verified present in `git log`.
