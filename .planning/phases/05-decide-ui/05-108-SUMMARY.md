---
phase: 05-decide-ui
plan: 108
subsystem: sync
tags: [sync, mutation-cache, coalescing, status-line, idempotency, D-88]
requires: [05-88, 05-107]
provides:
  - coalesceDraftSave: at most one queued draft save per check
  - useSyncStatus oldestPendingAt and inFlightOldestAt
  - syncStatusLabel with the R16.4 table, nextSyncLineChangeAt, and a 5 s timer in SyncStatusLine
  - D-88 timeout retry is idempotent (Go ahead, transaction insert, transfer edit)
affects: [05-26]
key-files:
  created:
    - src/data/sync/coalesceDrafts.ts
    - src/data/sync/__tests__/coalesceDrafts.test.tsx
    - src/data/__tests__/idempotentRetry.test.tsx
  modified:
    - src/data/mutations/decideChecks.ts
    - src/data/sync/useSyncStatus.ts
    - src/data/sync/__tests__/useSyncStatus.test.tsx
    - src/ui/syncStatusLabel.ts
    - src/ui/SyncStatusLine.tsx
    - src/ui/__tests__/syncStatusLabel.test.ts
    - src/ui/__tests__/SyncStatusLine.test.tsx
    - src/shell/header/SyncProblemLine.tsx
    - src/features/you/YouScreen.tsx
    - src/features/you/__tests__/YouScreen.test.tsx
decisions:
  - "A save is 'unsent' when its mutation is pending, paused and has failureCount 0; one with failures has been on the wire and is kept"
  - "A save is removed only when it sits after the last queued create and has no queued delete of the check behind it; the new save always queues at the end"
  - "In flight = pending, not paused, failureCount 0. A write behind another in WRITE_SCOPE, waiting for the network or backing off for a retry is 'waiting'"
  - "A count-only status (no age fields) is read as old, so the line still speaks; the hook always supplies ages"
  - "The padding wrapper of the tab-header line moved inside SyncStatusLine (wrapperStyle, wrapperTestID) so a hidden line leaves no empty gap"
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 108: D-88 sync queue and status line Summary

Offline typing now sends one save per check, and the sync line stays silent until a write is 5 s old, a failure exists, or the device is offline with writes waiting.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Draft coalescing | 64798201 | `coalesceDraftSave(qc, id)` removes unsent saves from the `MutationCache`; `useSaveCheckDraft` calls it before `mutate` |
| 2. Sync line by age, idempotency test | 9971699a | `useSyncStatus` ages, `syncStatusLabel` R16.4 table, 5 s timer, `D-88 timeout retry is idempotent` |

## What was built

- **Coalescing.** Saves removed: unsent, after the last queued create, with no queued delete of that check after them. A save in flight is left alone. WR-A03 is unchanged because a removed save never ran, so it never recorded a version; the surviving save records its own bump, and a queued abandon built on the old version resolves past it (asserted: the abandon goes out at version 2).
- **Sync line.** Hidden under 5000 ms. 'Saving…' when a write has been on the wire 5 s or more; '{n} changes waiting' when writes have waited 5 s or more; offline shows 'offline · {n} changes waiting' or 'offline' at any age; failure and conflict lines unchanged. `sync.queued` and `sync.offlineQueued` are no longer produced (their copy keys remain in en.ts). 'synced … ago' shows only with `detail` (the You screen's Connection section).
- **Timer.** One effect sets a `setTimeout` for `nextSyncLineChangeAt`; the callback sets the `now` state; cleanup clears it. The 30 s interval stays for the detail's 'minutes ago'.
- **Idempotency.** A small in-memory server model (duplicate id gives 23505, `record_decide_go` and `apply_patches` answer `already-applied` for a seen step id) commits the first request and loses its answer; the replay leaves one set of rows and one undo step for Go ahead, a transaction insert, and a transfer edit. No migration.

## Verification

- `npx jest src/ui src/data src/shell src/features/you`: 121 suites, 1256 tests passed. `npx jest src/features/record src/features/decide/check`: 133 suites, 1887 tests passed.
- Named tests present and passing: `D-88 a paused create, save, save then delete replays as create, save, delete`, `D-88 the sync line hides writes younger than 5 s`, `D-88 waiting replaces queued`, `D-88 the sync line appears when a write passes 5 s with nothing else changing`, `D-88 timeout retry is idempotent`.
- `npm run typecheck` clean. eslint clean on all touched files.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test files are .tsx**
- `coalesceDrafts.test.ts` and `idempotentRetry.test.ts` contain JSX (provider wrappers), so they are `.tsx`.

**2. [Rule 3 - Blocking] Files outside the plan's list**
- `src/shell/header/SyncProblemLine.tsx`: the old wrapper View rendered padding whenever `queued > 0`, which would leave an empty gap while the line is hidden. The wrapper now renders inside `SyncStatusLine` only when the line has content.
- `src/features/you/YouScreen.tsx` passes `detail` so the You screen keeps 'synced … ago' (the R16.4 "expanded detail"); `YouScreen.test.tsx` updated to the 'waiting' copy.

**3. [Spec reading] Transfer replay path**
- The M2 transfer case is tested with a transfer edit, which goes through `apply_patches` and gets `already-applied`. Transfer delete takes a different replay path (no live legs left, then the undo step lookup) and is covered by existing tests (WR-02). Transfer add uses `ignoreDuplicates` with the step-insert dedupe, also already covered.

## Open points

- The Go ahead idempotency case relies on `record_decide_go` returning `already-applied`; the test uses a model of that server rule, not the real database (no Supabase access by design).
- Coalescing after an app restart (saves restored from the persisted cache) is not covered by a test.

## Device items

05-EXECUTION-NOTES entry 05-108 (already present): offline, type into a check for a minute, reconnect: one save travels; the sync line stays hidden for quick saves and reads 'N changes waiting' only after 5 s.

## Self-Check: PASSED
