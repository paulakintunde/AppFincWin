---
phase: 05-decide-ui
plan: 56
subsystem: data
tags: [decide, mutations, undo, write-queue, D-73, D-77]
requires: [05-54]
provides:
  - saveDecideCheckDraft returns null for a soft-deleted check (client-side deleted_at filter)
  - useAbandonCheck.abandon(row, reason) with checkCleared / checkDeleted labels
  - decisionDeleted and changeDeleted undo labels on new writes
affects: [05-72, 05-73, 05-75]
key-files:
  modified:
    - src/db/decideChecks.ts
    - src/db/__tests__/decideChecks.test.ts
    - src/data/mutations/decideChecks.ts
    - src/data/mutations/decideChanges.ts
    - src/data/mutations/__tests__/decideChecks.test.tsx
    - src/data/mutations/__tests__/decideChanges.test.tsx
decisions:
  - "A draft save that matches no row reads id, status, deleted_at (no deleted filter); deleted returns null, anything else stays NotFoundError"
  - "Old label keys (checkAbandoned, decisionRemoved, changeRemoved) stay in the engine list for stored undo rows; only new writes use the new keys"
requirements: [DCU-28, DCU-04, DCU-07, DCU-15]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 56: Draft save after delete is silent; Clear / Delete undo labels Summary

A stale draft save (queued replay or another device) can no longer touch a soft-deleted check, and says nothing; Clear and Delete are single undo steps with their own labels. No migration: the filter and the silent result are client-side.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 + 2 | 657c3ef6 | Both tasks edit src/data/mutations/decideChecks.ts and its test file, so they landed in one commit |

- `saveDecideCheckDraft` adds `.is('deleted_at', null)`, returns `DecideCheckRow | null`; the saveCheckDraft mutationFn skips `recordWrittenVersion` for null and onSuccess leaves the cache alone.
- `useAbandonCheck().abandon(row, reason = 'deleted')`: 'checkCleared' or 'checkDeleted'. `useRemoveDecision` uses 'decisionDeleted' (goal still restored by Undo through the existing bulk patch). `useRemoveChange` uses 'changeDeleted'.
- Named D-77 / D-73 tests added, including create, save, delete round-tripped through JSON dehydrate/hydrate and replayed in order with no failed write.

## Verification

- `npx jest src/db/__tests__/decideChecks.test.ts src/data/mutations`: 34 suites, 444 tests passed.
- eslint on all touched files clean; depcruise clean; `grep -c "is('deleted_at', null)" src/db/decideChecks.ts` = 4.
- `npm run typecheck`: errors only in `src/features/decide/ui/InfoSheet.tsx` and `useInfoSheet.tsx` (another executor's in-progress files, Translate type); none in this plan's files.

## Deviations from Plan

1. [Rule 1 - Existing test] The existing "not found is parked" tests (db and mutation) now queue a second response, because the zero-row path performs the state read. Behaviour unchanged.
2. Tasks 1 and 2 share files, so one commit instead of two.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-56.

## Known Stubs

None.

## Self-Check: PASSED
