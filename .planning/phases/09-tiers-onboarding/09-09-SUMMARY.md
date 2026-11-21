---
phase: 09-tiers-onboarding
plan: 09
subsystem: data/sync
tags: [write-queue, locked-writes, offline, tanstack-query]
requires: []
provides:
  - "'locked' WriteErrorClass (PT402 / HTTP 402)"
  - "src/data/sync/lockedWrites.ts: encrypted, ordered, replayable store of refused writes"
affects: [09-16, 09-17]
key-files:
  created:
    - src/data/sync/lockedWrites.ts
    - src/data/sync/__tests__/lockedWrites.test.ts
  modified:
    - src/data/sync/writeErrors.ts
    - src/data/sync/failedWrites.ts
    - src/data/queryClient.ts
    - src/data/QueryProvider.tsx
    - src/data/sync/__tests__/writeErrors.test.ts
    - src/data/sync/__tests__/failedWrites.test.ts
decisions:
  - "Store mutationKey + variables (not the scrubbed attempted row) for replay (RESEARCH A8)"
  - "A replayed write refused again is not re-recorded: identity check against the entry being replayed"
metrics:
  tasks: 2
  completed: 2026-11-18
requirements: [TIER-09]
---

# Phase 9 Plan 09: Locked writes Summary

PT402 / HTTP 402 refusals classify as `locked`, are never retried, and are kept encrypted on the phone in order, with a replay through the existing mutation defaults.

## Commits
- 531d5476: 'locked' error class and failedWrites guard
- 7304ccb4: lockedWrites store, replay, MutationCache onError hook, start-up hydration

## Deviations from Plan
- Replay does not use a duplicate-cleanup pass. The global onError would record a second copy when a replayed write is refused again, so `recordLockedWrite` skips the entry currently being replayed (same mutationKey and variables references).
- `MutationObserver` is typed `<unknown, Error, unknown>` to satisfy tsc.

## Verification
- jest: writeErrors + failedWrites (45 tests) and lockedWrites (8 tests) pass; tsc clean; eslint no errors (one pre-existing warning in connectivity.test.ts); depcruise clean.
- Whole `src/data/sync` directory was run as separate files, not as one command (slow machine).

## Known Stubs
None. Wiring replay to plan state is 09-16.

## Self-Check: PASSED
