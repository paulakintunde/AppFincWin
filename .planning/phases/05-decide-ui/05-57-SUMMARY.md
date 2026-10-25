---
phase: 05-decide-ui
plan: 57
subsystem: data
tags: [decide, draft, save-status, persister, write-queue, D-77, R9]
requires: [05-54]
provides:
  - useCheckDraft flushes on AppState background/inactive, discard() disarms for Clear, pendingEdit and editedOffline flags
  - useCheckSaveStatus / saveStatusOf / useAnnounceSaveStatus (SaveStatus)
  - flushPersistedClient / startPersistOnBackground in the persister, registered in QueryProvider
affects: [05-75]
key-files:
  created:
    - src/features/decide/check/useCheckSaveStatus.ts
    - src/features/decide/check/__tests__/useCheckSaveStatus.test.tsx
  modified:
    - src/features/decide/check/useCheckDraft.ts
    - src/features/decide/check/__tests__/useCheckDraft.test.tsx
    - src/data/cache/persister.ts
    - src/data/QueryProvider.tsx
    - src/data/__tests__/persister.test.ts
decisions:
  - "The background flush uses a second, unthrottled persister (throttleTime 0) over a fresh LargeSecureStore with the same key and serializer; the provider's persister is unchanged"
  - "startPersistOnBackground defers with setTimeout 0 so the screen's own AppState flush queues its mutation first"
  - "Save status precedence: failed (newest settled errored, or a parked decide_checks failed write) > offline > saving > saved"
requirements: [DCU-28, DCU-03]
metrics:
  tasks: 3
  completed: 2026-10-23
---

# Phase 5 Plan 57: Client draft and save contract (D-77) Summary

Backgrounding the app flushes a check's pending edit and then writes the persisted queue to disk on the next tick, so a write less than a second old survives a kill. Clear can disarm the draft, and the header has one tested source for its save status.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 useCheckDraft | c02e5c2c | AppState flush, discard(), pendingEdit / editedOffline as event-path state |
| 2 useCheckSaveStatus | 2a5708b7 | R9 table as a pure function plus hook; announcements only into offline / failed |
| 3 persister | 3ebb99e5 | flushPersistedClient, startPersistOnBackground, QueryProvider wiring |

- `useSyncStatus().queued` already counts every pending mutation, so a paused saveCheckDraft is counted with no code change; a test pins it.
- Mutation defaults for createCheck, saveCheckDraft and editCheck were already registered through `registerMutationDefaults` before the provider; a test pins it.

## Verification

- `npx jest src/features/decide/check src/data`: 84 suites, 1095 tests passed.
- `npm run typecheck` clean; eslint clean on all touched files; `npm run depcruise` clean.

## Deviations from Plan

None in behaviour. Notes: the useCheckDraft tests mock the source module `@/data/mutations/decideChecks` with `jest.mock` (the existing harness) rather than a spy. The new save-status and persister tests leave a Jest "did not exit" open-handle notice (unstopped mutation gc timers); suites pass.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-57.

## Known Stubs

None. 05-75 wires discard(), the status and the announcement hook into the header.

## Self-Check: PASSED
