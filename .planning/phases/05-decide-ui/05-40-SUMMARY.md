---
phase: 05-decide-ui
plan: 40
subsystem: data-layer
tags: [tanstack-query, write-queue, undo, decide-changes]
requires: [05-02, 05-12, 05-20, 05-38]
provides:
  - registerDecideChangeMutations, useAddChange, useEditChange, useRemoveChange
affects: [Changes coming up UI plans]
key-files:
  created:
    - src/data/mutations/decideChanges.ts
    - src/data/mutations/__tests__/decideChanges.test.tsx
  modified:
    - src/data/mutations/index.ts
key-decisions:
  - "Remove sends an ISO deleted_at; NOW_SENTINEL is used only inside undo ops (via inverseOfInserts)"
metrics:
  tasks: 1
  files: 3
completed: 2026-10-20
---

# Phase 5 Plan 40: Changes coming up mutations Summary

Queued, undo-aware add / edit / remove for dated changes (D-27), following the categoryRules precedent with expectedVersion conflict handling and ids-only failed-write records.

## What was built
- `useAddChange` mints a client id and step id, inserts optimistically, records `changeAdded` (inverse soft-delete); replay-safe via 05-38's 23505 handling.
- `useEditChange` patches with expectedVersion; the `changeEdited` step stores before-values of exactly the patched keys.
- `useRemoveChange` soft deletes under `editChange`, records `changeRemoved` with restore `deleted_at: null`, returns the step id for the caller's toast.
- Conflicts replace the cached row with the server row and park a `conflict` failed-write; every success invalidates `queryKeys.decideChanges` so the snapshot recomputes.
- Registered in `index.ts` after the 05-20 lines.

## Verification
- Phase 4 gate passed (22 summaries, status passed, engineBarrel 51 tests).
- decideChanges tests 6/6; `src/data/mutations` 33 suites / 411 tests green; typecheck clean; lint 0 errors; depcruise clean.

## Deviations from Plan
The plan text says remove patches `{ deleted_at: NOW_SENTINEL }`. The sentinel is an undo-op placeholder resolved server-side, not a valid timestamp for a direct update, so the direct write uses an ISO string (as categoryRules does); the add's undo op still uses the sentinel via `inverseOfInserts`. No engine edits, no migrations.

## Human/device items
None (data layer only).

## Self-Check: PASSED
