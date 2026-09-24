---
phase: 01-money-core
plan: 09
subsystem: sync

tags: [tanstack-query, offline-queue, sync-status, large-secure-store, jest, testing-library]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-01: Phase 1 npm dependencies (@tanstack/react-query family, fast-check); 00-foundation: LargeSecureStore (encrypted AsyncStorage), registerWipeHandler/wipeDeviceData"
provides:
  - "src/db/errors.ts: DbError/VersionConflictError/NotFoundError, toDbError -- the typed error vocabulary every write mutation throws"
  - "src/data/sync/writeErrors.ts: classifyWriteError/shouldRetryWrite/writeRetryDelay -- D-18/D-19 retry classification with no dependency on the write queue itself"
  - "src/data/sync/failedWrites.ts: encrypted, persisted failed/conflict list with a subscribe API and a scrubbed failure-reporter hook"
  - "src/data/sync/lastSynced.ts: plain-AsyncStorage last-synced timestamp, plus trackSyncActivity() that marks synced on any successful QueryCache/MutationCache event"
  - "src/data/sync/useSyncStatus.ts: the SYN-06 hook (isOnline, queued, failed, conflicts, lastSyncedAt)"
affects: [01-10, 01-12, 01-14, 01-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WriteErrorClass classification (transient/already-applied/conflict/rejected/not-found) as the single place retry policy is decided, kept dependency-free from the actual write queue"
    - "useSyncExternalStore + a module-scope entries array/listener Set for both failedWrites and lastSynced, returning the same array reference until it changes (per useSyncExternalStore's contract)"
    - "registerWipeHandler() called at module scope (not inside a component) so sign-out always wipes a subsystem's data regardless of which screens mounted"
    - "Test-only globalThis-backed mock stores (not module-closure Maps) so mocked AsyncStorage/SecureStore state survives jest.isolateModulesAsync's fresh module registry, letting a test simulate 'data persisted, app restarted'"

key-files:
  created:
    - src/db/errors.ts
    - src/db/__tests__/errors.test.ts
    - src/data/sync/writeErrors.ts
    - src/data/sync/failedWrites.ts
    - src/data/sync/lastSynced.ts
    - src/data/sync/useSyncStatus.ts
    - src/data/sync/__tests__/writeErrors.test.ts
    - src/data/sync/__tests__/failedWrites.test.ts
    - src/data/sync/__tests__/useSyncStatus.test.tsx
  modified: []

key-decisions:
  - "lastSynced.ts has no dedicated test file per the plan's file list; its behavior (markSynced/getLastSyncedAt/hydrateLastSynced/trackSyncActivity) is tested inside useSyncStatus.test.tsx's own 'lastSynced' describe block, since that is the designated Task 2 test file and useSyncStatus is lastSynced's only consumer"
  - "useSyncStatus.ts uses TanStack Query's @internal-but-typed MutationCache.build()/Mutation.execute() in one test to drive a query+mutation success/error sequence without rendering a component -- avoided only where a hook-level test was more natural (queued-mutations test uses useMutation via renderHook instead)"
  - "recordFailedWrite/dismissFailedWrite/markSynced persist fire-and-forget (not awaited by callers other than the functions themselves awaiting their own persist() call) for recordFailedWrite/dismissFailedWrite, which do await persistence before resolving; markSynced deliberately does not await AsyncStorage.setItem (D-15: a timestamp is not sensitive, best-effort persistence is acceptable and keeps the hook's underlying store update synchronous)"

patterns-established:
  - "Failure classification lives in src/data/sync/writeErrors.ts, imports only @/db/errors -- plan 01-12's mutation defaults (setMutationDefaults) will call shouldRetryWrite/writeRetryDelay directly without pulling in any React or TanStack Query import here"

requirements-completed: [SYN-06]

# Metrics
duration: ~85min
completed: 2026-09-24
---

# Phase 1 Plan 9: Sync Bookkeeping (Errors, Failed Writes, Last Synced, useSyncStatus) Summary

**Typed DB error vocabulary plus D-18/D-19 write-error classification, an encrypted persisted failed/conflict list, a last-synced tracker wired to TanStack Query's own cache events, and the useSyncStatus() hook composing all of it -- zero direct dependency on Supabase, independently testable.**

## Performance

- **Duration:** ~85 min (includes `npm ci` for a from-scratch worktree, ~8 min, and an iterative TDD debugging cycle for Task 2's async testing-library API)
- **Started:** 2026-09-24 (worktree setup)
- **Completed:** 2026-09-24T17:59:36Z (last commit)
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 9 created (6 source, 3 test), 0 modified

## Accomplishments
- `src/db/errors.ts`: dependency-free `DbError`/`VersionConflictError`/`NotFoundError` classes and `toDbError()`, matching the plan's interface contract verbatim
- `src/data/sync/writeErrors.ts`: `classifyWriteError` maps every write failure to exactly one of five classes (`transient`/`already-applied`/`conflict`/`rejected`/`not-found`); `shouldRetryWrite`/`writeRetryDelay` give plan 01-12's mutation defaults their retry policy
- `src/data/sync/failedWrites.ts`: encrypted (`LargeSecureStore`), persisted, subscribable failed/conflict list; a corrupt or missing stored value hydrates to an empty list without throwing; the failure reporter receives only `{ entity, kind, code }`, never the attempted payload; registered as a wipe handler (`id: 'failed-writes'`) at module scope
- `src/data/sync/lastSynced.ts`: plain-`AsyncStorage` timestamp (not encrypted -- D-15: not sensitive); `trackSyncActivity(queryClient)` marks synced on any successful `QueryCache`/`MutationCache` event and never on error, verified with a deterministic `Date.now()` spy
- `src/data/sync/useSyncStatus.ts`: the SYN-06 hook, composing `onlineManager` (via `useSyncExternalStore`), `useMutationState({ filters: { status: 'pending' } })` for the queued count, and `failedWrites`/`lastSynced`'s own external stores -- no parallel queue-tracking data structure
- 43 tests pass across `src/db` + `src/data/sync` (27 for Task 1, 16 more for Task 2 across the three new test files, `use SyncStatus.test.tsx` covering both the hook and the `lastSynced` module); `npm run lint`, `npm run typecheck` and `npm run depcruise` all clean

## Task Commits

Each task followed RED then GREEN, confirmed genuinely (see Deviations for how Task 2's RED was re-verified after a process slip):

1. **Task 1: Typed DB errors and write-error classification** - `8bd7f47` (test, RED) then `2954493` (feat, GREEN)
2. **Task 2: Persisted failed-writes list, last-synced tracker and useSyncStatus** - `14eacfe` (test, RED) then `0e0ec89` (feat, GREEN)

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete.

## Files Created/Modified
- `src/db/errors.ts` - `WriteEntity`, `DbError`, `VersionConflictError`, `NotFoundError`, `toDbError`
- `src/db/__tests__/errors.test.ts` - behavior-spec tests for the above
- `src/data/sync/writeErrors.ts` - `WriteErrorClass`, `classifyWriteError`, `shouldRetryWrite`, `writeRetryDelay`
- `src/data/sync/__tests__/writeErrors.test.ts` - one test per classification row in the plan's behavior list
- `src/data/sync/failedWrites.ts` - `FailedWrite`, `FAILED_WRITES_KEY`, `hydrateFailedWrites`, `recordFailedWrite`, `dismissFailedWrite`, `getFailedWrites`, `subscribeFailedWrites`, `setFailureReporter`
- `src/data/sync/__tests__/failedWrites.test.ts` - id/timestamp generation, restart persistence (via `jest.isolateModulesAsync` with globalThis-backed storage mocks), ciphertext-at-rest, corrupt-value fallback, dismiss, scrubbed reporter, wipe integration
- `src/data/sync/lastSynced.ts` - `LAST_SYNCED_KEY`, `markSynced`, `getLastSyncedAt`, `subscribeLastSynced`, `hydrateLastSynced`, `trackSyncActivity`
- `src/data/sync/useSyncStatus.ts` - `SyncStatus`, `useSyncStatus`
- `src/data/sync/__tests__/useSyncStatus.test.tsx` - hook tests (isOnline, queued, failed/conflicts, lastSyncedAt) plus a `lastSynced` describe block covering the module directly, including `trackSyncActivity`'s query/mutation success-and-not-on-error behavior

## Decisions Made
- `lastSynced.ts`'s behavior is tested inside `useSyncStatus.test.tsx` rather than a separate file, matching the plan's `files_modified` list exactly (no `lastSynced.test.ts` was specified)
- `markSynced()` persists to `AsyncStorage` fire-and-forget rather than awaited, since D-15 explicitly treats a sync timestamp as non-sensitive and best-effort; `recordFailedWrite`/`dismissFailedWrite` do await their own `persist()` since losing a failed-write record would violate D-19's "never silently lose an entry"
- Kept `classifyWriteError`'s fallback for an unrecognized `DbError` code/status combination as `'rejected'` (matching "never loop forever on something unrecognised") rather than `'transient'`, since an unrecognized permanent-looking code is safer to stop retrying than to retry indefinitely

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `@testing-library/react-native` v14's `renderHook`/`act` are async and must be awaited**
- **Found during:** Task 2, first verification run of `useSyncStatus.test.tsx`
- **Issue:** `renderHook()` and `act()` in the installed RNTL version (`^14.0.1`) return `Promise`s (confirmed via `node_modules/@testing-library/react-native/dist/render-hook.d.ts` and `act.d.ts`), not synchronous results as in older RNTL/`@testing-library/react-hooks` versions. Calling `const { result } = renderHook(...)` without `await` destructured a `Promise` object, producing `result === undefined` and a `TypeError: Cannot read properties of undefined (reading 'current')` on every hook test.
- **Fix:** Added `await` to every `renderHook(...)` and `act(...)` call in `useSyncStatus.test.tsx`.
- **Files modified:** `src/data/sync/__tests__/useSyncStatus.test.tsx`
- **Verification:** All 4 `useSyncStatus` hook tests pass.
- **Committed in:** `0e0ec89` (Task 2 GREEN commit; caught and fixed before that commit, no separate fix commit needed)

**2. [Rule 3 - Blocking] `jest.mock()` hoisting left globalThis-backed test storage maps uninitialized on first read**
- **Found during:** Task 2, first verification run of `failedWrites.test.ts`
- **Issue:** Babel hoists `jest.mock()` calls above other top-level statements in a test file, including a plain `const g = globalThis; g.__fwAsyncStorage = g.__fwAsyncStorage ?? new Map(...)` initialization line. Since importing the module under test synchronously triggers the mock factories (via its `LargeSecureStore` dependency) before that later top-level line would otherwise run, the factories read `undefined` off `globalThis` and threw `TypeError: Cannot read properties of undefined (reading 'get')`.
- **Fix:** Moved the lazy `map = map ?? new Map()` initialization inside each `jest.mock()` factory itself, so it runs at first invocation regardless of hoisting order, rather than depending on a separately-ordered top-level statement.
- **Files modified:** `src/data/sync/__tests__/failedWrites.test.ts`
- **Verification:** All `failedWrites` persistence-across-restart tests pass.
- **Committed in:** `0e0ec89` (Task 2 GREEN commit)

**3. [Rule 1 - Bug] Custom test `AsyncStorage` mock was missing `multiRemove`, breaking `wipeDeviceData()`**
- **Found during:** Task 2, verification of the "cleared by wipeDeviceData" test
- **Issue:** `src/services/storage/wipe.ts`'s `wipeDeviceData()` calls `AsyncStorage.multiRemove(prefixed)` directly; the custom `globalThis`-backed AsyncStorage mock in `failedWrites.test.ts` only implemented `getItem`/`setItem`/`removeItem`/`clear`/`getAllKeys`, so the call threw `TypeError`, collected into an `AggregateError` by `wipeDeviceData`'s error-collection design.
- **Fix:** Added a `multiRemove` implementation to the mock.
- **Files modified:** `src/data/sync/__tests__/failedWrites.test.ts`
- **Verification:** The wipe-integration test passes; all 38 (then 43 with Task 1) tests green.
- **Committed in:** `0e0ec89` (Task 2 GREEN commit)

**4. [Process note, not a code deviation] Task 2's implementation files were written before RED was independently confirmed**
- **Found during:** Task 2, after launching the first "RED-phase" background test run
- **Issue:** The RED-phase test run for Task 2 was launched, and while it ran in the background (Jest's cold-start transform cache made it slow), the three Task 2 implementation files were written before that run completed -- a process ordering mistake, not a code bug. The background run therefore executed against the real implementation rather than proving a clean "module not found" RED.
- **Fix:** Before committing, the three implementation files were moved out of the working tree into the scratchpad, the test suite was re-run to confirm a genuine `Cannot find module` RED for both `failedWrites.test.ts` and `useSyncStatus.test.tsx`, the RED-only commit was made, and then the implementation files were restored and the GREEN commit made after a full clean pass (43/43 tests, lint/typecheck/depcruise clean).
- **Files modified:** None beyond the normal Task 2 commits; git history for `14eacfe`/`0e0ec89` accurately reflects RED-before-GREEN.
- **Verification:** `git show 14eacfe --stat` contains only the two test files; `git show 0e0ec89 --stat` contains only the three implementation files.
- **Committed in:** `14eacfe` (RED), `0e0ec89` (GREEN)

---

**Total deviations:** 4 auto-fixed (3 test-environment bugs found and fixed during verification, 1 process-ordering note with no lasting code impact)
**Impact on plan:** No scope creep, no change to any deliverable's public API or behavior. All four items are test-infrastructure/process corrections, not changes to `src/db/errors.ts`, `src/data/sync/writeErrors.ts`, `src/data/sync/failedWrites.ts`, `src/data/sync/lastSynced.ts` or `src/data/sync/useSyncStatus.ts`'s actual logic.

## Issues Encountered
- The plan's acceptance criteria specify `grep -c "registerWipeHandler" src/data/sync/failedWrites.ts` and `grep -c "useMutationState" src/data/sync/useSyncStatus.ts` each `returns 1`. `grep -c` counts matching *lines*, and a normal `import { X } from '...'; ... X(...)` pattern naturally produces 2 matching lines (the import line and the call site), not 1. Both identifiers are present and used correctly (`grep -c "registerWipeHandler"` = 2, `grep -c "useMutationState"` = 2; `grep -c "LargeSecureStore"` = 3 and `grep -c "attempted"` = 4, both satisfying their "at least 1" criteria). A namespace-import rewrite (`import * as X`) could force the literal count to 1, but was judged worse for readability for no functional benefit, since the actual `<verify>` block for this plan (`npx jest src/data/sync --silent && npm run lint && npm run typecheck && npm run depcruise`) is what was run and passed. Flagging this for the record rather than distorting the code to satisfy a grep-line-count artifact.

## User Setup Required
None - no external service configuration required. All work is local TypeScript with no Supabase/network calls.

## Next Phase Readiness
- `src/db/errors.ts` and `src/data/sync/writeErrors.ts` are stable for plan 01-12's `setMutationDefaults`-based write queue to import directly: `shouldRetryWrite`/`writeRetryDelay` give the retry policy, `classifyWriteError` tells the mutation's `onError`/`onSettled` handlers whether to call `recordFailedWrite` (for `'rejected'`/`'not-found'`/`'conflict'`) or let TanStack Query's own retry continue (`'transient'`) or treat as a no-op success (`'already-applied'`).
- `src/data/sync/failedWrites.ts`'s `setFailureReporter` is ready for whichever later plan wires up error tracking (Phase 0 D-18 scrubbing) -- this module still imports nothing from an error-tracking SDK.
- `useSyncStatus()` is ready to back the You-screen sync status line (D-14) once that screen exists; it needs to be rendered under a `QueryClientProvider` with the app's real `QueryClient` (plan 01-07, running concurrently in this wave and not yet merged at the time this plan executed -- tests here constructed a local `QueryClient` per the orchestrator's explicit instruction, not 01-07's).
- No blockers.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 9 created source/test files plus this SUMMARY.md confirmed present on disk. All 4 task commit hashes (`8bd7f47`, `2954493`, `14eacfe`, `0e0ec89`) confirmed present in `git log`.
