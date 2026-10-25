---
phase: 05-decide-ui
plan: 107
subsystem: sync
tags: [sync, timeout, backoff, netinfo, D-88]
requires: [05-87]
provides:
  - timeoutFetch and RequestTimeoutError (15 s reads, 20 s writes, 120 s long operations)
  - writeRetryDelay capped at 12 s; long-operation timeouts never auto-retried
  - NetInfo reachability against Supabase, resume on focus and reachable, post-restore refetch in parallel
affects: [05-108]
key-files:
  created:
    - src/services/supabase/timeoutFetch.ts
    - src/services/supabase/__tests__/timeoutFetch.test.ts
  modified:
    - src/services/supabase/client.ts
    - src/data/sync/writeErrors.ts
    - src/data/sync/__tests__/writeErrors.test.ts
    - src/data/onlineManager.ts
    - src/data/__tests__/onlineManager.test.ts
    - src/data/QueryProvider.tsx
decisions:
  - "RequestTimeoutError extends TypeError with a 'Network request' message, so existing classification treats it as a connectivity failure (retried, paused offline)"
  - "postgrest-js flattens fetch failures to a status-0 DbError carrying only the message, so a long-op timeout carries the marker '(long operation)' in its message and writeErrors reads it back"
  - "App focus calls NetInfo.refresh() (a Supabase reachability probe) and resumes only if reachable, rather than forcing online"
  - "startOnlineManager takes the QueryClient; afterCacheRestore(qc, replay) holds the restore ordering so it is unit-testable"
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 107: D-88 sync transport Summary

Every Supabase request now has a deadline through a custom global fetch, online backoff is capped at 12 s, reconnect and app focus resume paused writes and refetch stale queries against a Supabase reachability probe, and the post-restore refetch no longer waits for writes.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. timeoutFetch and client wiring | 937fc6c7 | GET/HEAD 15 s, other methods 20 s; storage, `purge-statement-uploads`, `read-pdf-statement`, `delete-account`/`purge-account` functions and the `seed_sample_data`, `clear_sample_data`, `change_home_currency` RPCs get 120 s; honours a caller abort signal |
| 2. Backoff, resume, reachability, post-restore | 2a9302fe | `writeRetryDelay` = min(1 s x 2^n, 12 s); `NetInfo.configure` with `<SUPABASE_URL>/rest/v1/` and `status < 500`; `resumeAndRefetch`; `afterCacheRestore` |

## Verification

- `npx jest src/data src/services`: 865 passed.
- Named D-88 tests present and passing (timeouts, long ops, backoff cap, no long-op retry, reachability, coming back, post-restore).
- `npm run typecheck` clean; eslint clean on touched files.

## Deviations from Plan

**1. [Rule 3 - Blocking] Long-op marker in the error message**
- postgrest-js turns a fetch failure into a status-0 DbError, losing the `longOp` field, so the no-retry rule could not see it. The marker is written into the message and matched in `shouldRetryWrite`.

**2. [Rule 3 - Blocking] onlineManager env access and test seam**
- `getEnv()` is wrapped in try/catch inside `startOnlineManager` (other suites, e.g. persister.test, import QueryProvider with no env set). Added `resetOnlineManagerForTests` for the focus test.
- The WR-A02 comment on retry budget was updated for the 12 s cap (about 1.5 minutes).

## Open points

- The plan lists "statement import commits" as long operations, but no such RPC exists in the code or migrations today; the pattern list names only what exists plus anticipated `delete_account`/`purge_account`/`delete-account`/`purge-account` (account deletion is not built yet, Phase 10). Update `LONG_OP_PATTERNS` when those names land.
- ROADMAP was not touched by this executor (see report); the orchestrator should tick 05-107 only.

## Device items

05-EXECUTION-NOTES entry 05-107: airplane mode on during a save, off again: the write resumes within seconds without reopening the app; a slow network shows no stall beyond 20 s.

## Self-Check: PASSED
