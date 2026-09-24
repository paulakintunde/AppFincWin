---
phase: 01-money-core
plan: 07
subsystem: data
tags: [tanstack-query, offline-cache, encryption, netinfo, react-native]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-01's engine/money foundation (no direct import here, but shares the phase's data-layer conventions)"
  - phase: 00-foundation
    provides: "LargeSecureStore (src/services/supabase/largeSecureStore.ts) and the wipe registry (src/services/storage/wipe.ts)"
provides:
  - "queryClient singleton with offlineFirst defaults and a sign-out wipe handler"
  - "Encrypted, versioned, 30-day TanStack Query persister reusing LargeSecureStore"
  - "NetInfo -> onlineManager and AppState -> focusManager bridges (startOnlineManager)"
  - "Proof tests that offline reads serve cached data and paused mutations survive dehydration"
affects: [01-12 (mutation defaults + provider wiring imports these modules), phase-08-household (Realtime cache patching sits on this QueryClient), phase-10-system (queue hardening builds on the paused-mutation mechanism proven here)]

# Tech tracking
tech-stack:
  added: []  # all packages were already installed by 01-01/00-XX; this plan only wires them
  patterns:
    - "TanStack Query persister storage backend is the existing LargeSecureStore, not a second encryption layer"
    - "gcTime: Infinity as the 'never auto-GC' sentinel instead of a literal 30-day millisecond value (32-bit setTimeout overflow)"
    - "Wipe handlers register at module scope in the same file that owns the resource, not inside a component"

key-files:
  created:
    - src/data/cache/persister.ts
    - src/data/queryClient.ts
    - src/data/onlineManager.ts
    - src/data/__tests__/persister.test.ts
    - src/data/__tests__/onlineManager.test.ts
    - src/data/__tests__/offlineRead.test.tsx
  modified:
    - jest.setup.ts

key-decisions:
  - "gcTime set to Infinity, not CACHE_MAX_AGE_MS, because 30 days in milliseconds (2,592,000,000) exceeds the 32-bit signed integer max setTimeout accepts and gets silently clamped to 1ms"
  - "offlineRead.test.tsx mocks expo-secure-store itself (same Map-backed mock as largeSecureStore.test.ts) rather than relying on a global mock, since LargeSecureStore's key generation must resolve the same key across the save and restore calls within one test"

patterns-established:
  - "Persister/query-client tests use throttleTime's leading-edge-immediate behavior (nextExecutionTime starts at 0) instead of waiting out throttle windows or using fake timers"

requirements-completed: [SYN-01, SYN-07]

# Metrics
duration: ~55min
completed: 2026-09-24
---

# Phase 1 Plan 07: TanStack Query Data-Layer Foundation Summary

**Encrypted, 30-day TanStack Query persister on LargeSecureStore, an offlineFirst QueryClient singleton with a sign-out wipe handler, and NetInfo/AppState bridges into onlineManager/focusManager — all proven by tests that a restored cache serves data while genuinely offline.**

## Performance

- **Duration:** ~55 min (including `npm ci` in a fresh worktree with no `node_modules`)
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `src/data/cache/persister.ts`: `createEncryptedPersister`/`persister`/`persistOptions` — AsyncStorage persister backed by `LargeSecureStore`, with a D-15 30-day dehydrate window (`shouldDehydrateQuery`) and paused-mutation persistence (`shouldDehydrateMutation`)
- `src/data/queryClient.ts`: the `queryClient` singleton (`networkMode: 'offlineFirst'`, `gcTime: Infinity`) plus a `registerWipeHandler` call so sign-out clears both the in-memory cache and the persisted blob, and reports queued-write counts to the unsynced-changes warning
- `src/data/onlineManager.ts`: `startOnlineManager()` (idempotent) wiring NetInfo into `onlineManager` and `AppState` into `focusManager`, plus the `isReachable` null-means-unknown truth table
- Three test files (16 tests total) proving: ciphertext-only storage with the key in SecureStore under `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, round-trip restore, buster-mismatch discard, 30-day-stale exclusion, wipe-handler cleanup, the NetInfo/onlineManager wiring, and a genuinely offline `useQuery` rendering cached data

## Task Commits

1. **Task 1: Encrypted persister, QueryClient singleton and wipe registration** - `84feb93` (feat)
2. **Task 2: NetInfo/AppState bridges and the offline-read proof** - `0dff990` (feat)

## Files Created/Modified
- `src/data/cache/persister.ts` - Encrypted AsyncStorage persister, 30-day dehydrate window, schema-version buster
- `src/data/queryClient.ts` - QueryClient singleton, offlineFirst/`gcTime: Infinity` defaults, sign-out wipe registration
- `src/data/onlineManager.ts` - NetInfo → onlineManager and AppState → focusManager bridges
- `src/data/__tests__/persister.test.ts` - Ciphertext, key-in-SecureStore, round-trip, buster-mismatch, staleness, wipe tests
- `src/data/__tests__/onlineManager.test.ts` - `isReachable` truth table, idempotent registration, NetInfo event flips `isOnline()`
- `src/data/__tests__/offlineRead.test.tsx` - A restored, offline `useQuery` renders cached data; retry pauses rather than hammering the network
- `jest.setup.ts` - Added the `@react-native-community/netinfo` jest mock globally

## Decisions Made
- **`gcTime: Infinity` instead of `CACHE_MAX_AGE_MS`** (Rule 1 auto-fix): the plan's literal `gcTime: CACHE_MAX_AGE_MS` (30 days = 2,592,000,000ms) exceeds JS's 32-bit signed `setTimeout` limit (2,147,483,647ms, ~24.8 days). Node/Hermes silently clamp the overflowing delay to 1ms, which would garbage-collect a query restored from the persisted cache almost immediately — the exact failure mode the plan's own comment warned against ("gcTime must be at least maxAge or a query restored from the persisted cache is garbage-collected before anything reads it"). `Infinity` is TanStack Query's documented never-auto-GC sentinel (`isValidTimeout` explicitly excludes it, so no timer is ever scheduled), trivially satisfies "at least maxAge", and moved verification: the "TimeoutOverflowWarning" that appeared with the literal value in the first `persister.test.ts` run disappeared entirely after the fix.
- **`offlineRead.test.tsx` mocks `expo-secure-store` locally**: it exercises `LargeSecureStore`'s full key-generation cycle twice within one test (once persisting via a seed `QueryClient`, once restoring into a fresh one), and both calls must resolve the identical 256-bit key for AES-CTR decryption to produce valid plaintext. `jest-expo`'s default automock for `expo-secure-store` is not guaranteed stateful across calls, so without an explicit mock the restore silently decrypted with the wrong key, producing byte garbage that failed `JSON.parse` inside the persist-client-core deserializer.
- **`offlineFirst`'s actual retry-pause timing, verified against source**: `@tanstack/query-core`'s `retryer.js` shows `offlineFirst` always fires the *first* fetch attempt regardless of online status (`canStart()` bypasses the online check for any mode other than `'online'`) — only a failed attempt's *retry* pauses while offline, and only after the retry's ~1000ms default backoff delay elapses (the retryer sleeps before checking `canContinue()`). The test asserts `fetchStatus === 'paused'` after that backoff (with a raised `waitFor` timeout) and `queryFn` called exactly once, rather than the plan's more speculative "queryFn not invoked OR fetchStatus paused" hedge — this is the actually-verified behavior, not a guess.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `gcTime` overflow silently defeated the 30-day offline-cache guarantee**
- **Found during:** Task 1 (Encrypted persister, QueryClient singleton)
- **Issue:** `gcTime: CACHE_MAX_AGE_MS` passes a millisecond value (2,592,000,000) larger than the 32-bit signed integer `setTimeout` accepts. Node/Hermes clamp it to a 1ms timeout instead of throwing, so the very first test run surfaced a `TimeoutOverflowWarning` and (unverified but implied) restored queries would be garbage-collected almost immediately in the real app — breaking SYN-01 (browsable offline) despite the persister and restore logic being otherwise correct.
- **Fix:** Set `gcTime: Infinity`, TanStack Query's documented sentinel for "never schedule an automatic GC timer" (confirmed by reading `isValidTimeout` in `@tanstack/query-core`, which explicitly excludes `Infinity`). Eviction is left to the wipe handler and explicit `queryClient.clear()` calls, which is exactly the eviction path Phase 1 already relies on for sign-out.
- **Files modified:** `src/data/queryClient.ts`
- **Verification:** Re-ran `src/data/__tests__/persister.test.ts`; the `TimeoutOverflowWarning` present in the first run disappeared, all 6 tests still pass, and total run time dropped (142s → ~9-13s per subsequent run, consistent with no more spurious overflow-driven timer churn).
- **Committed in:** `84feb93` (Task 1 commit)

**2. [Rule 3 - Blocking] `offlineRead.test.tsx` needed its own `expo-secure-store` mock**
- **Found during:** Task 2 (NetInfo/AppState bridges and the offline-read proof)
- **Issue:** Without mocking `expo-secure-store`, the test's second `LargeSecureStore` key-generation call (during restore) did not reliably resolve the same key generated during the first (save) call, so AES-CTR decryption produced byte garbage that failed `JSON.parse` inside `persistQueryClientRestore` with `SyntaxError: Unexpected token`.
- **Fix:** Added the same Map-backed `jest.mock('expo-secure-store', ...)` used in `largeSecureStore.test.ts` and `persister.test.ts`, plus the `globalThis.crypto = require('crypto').webcrypto` shim `react-native-get-random-values` needs under Jest.
- **Files modified:** `src/data/__tests__/offlineRead.test.tsx`
- **Verification:** Test passed after the fix (confirmed decryption succeeded and cached data restored correctly).
- **Committed in:** `0dff990` (Task 2 commit)

**3. [Rule 1 - Bug] `renderHook` from this RNTL version is async and must be awaited**
- **Found during:** Task 2, writing `offlineRead.test.tsx`
- **Issue:** `@testing-library/react-native@14.0.1`'s `renderHook` is an `async function` (it awaits the underlying `render()` call before returning `{ result, rerender, unmount }`). Calling it without `await` returned a `Promise`, not the destructured result, causing `Cannot read properties of undefined (reading 'current')`.
- **Fix:** Added `await` to the `renderHook(...)` call.
- **Files modified:** `src/data/__tests__/offlineRead.test.tsx`
- **Verification:** `result.current` resolved correctly on the next test run.
- **Committed in:** `0dff990` (Task 2 commit)

**4. [Rule 1 - Bug] `waitFor` raced the retryer's backoff delay**
- **Found during:** Task 2, writing `offlineRead.test.tsx`
- **Issue:** After confirming (via source read of `retryer.js`) that `offlineFirst` pauses retries — not the initial attempt — while offline, the first assertion attempt used `waitFor`'s default ~1000ms timeout, which raced the retryer's own ~1000ms default backoff delay before it checks online status and pauses. The test observed `fetchStatus: 'fetching'` instead of `'paused'` at the timeout boundary.
- **Fix:** Raised the `waitFor` timeout to 3000ms for that specific assertion and set `jest.setTimeout(10000)` for the file so the whole test has headroom beyond Jest's 5000ms per-test default.
- **Files modified:** `src/data/__tests__/offlineRead.test.tsx`
- **Verification:** Test passes reliably; `fetchStatus` settles to `'paused'` well within the raised timeout.
- **Committed in:** `0dff990` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 Rule 1 correctness bug affecting the shipped feature's actual guarantee, 3 Rule 1/3 test-construction bugs that only affected getting the test suite itself to pass)
**Impact on plan:** Deviation 1 is the one with real product impact — it directly protects SYN-01's "browsable offline" guarantee from silently breaking on real devices. Deviations 2-4 are test-only fixes with no runtime code impact. No scope creep; no architectural changes.

## Issues Encountered
- The worktree had no `node_modules` (fresh checkout); ran `npm ci` with a local, untracked `.npmrc` (`legacy-peer-deps=true`) per the environment notes before any test could execute. Not a deviation — expected first-run setup in this worktree.
- The Windows/dot-prefixed-worktree-path Jest "No tests found" bug (documented in the task's environment notes) was worked around with a disposable `jest.worktree.config.js` (never committed, deleted before finishing) spreading `jest.config.js` with an overridden `testMatch`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `queryClient`, `persister`/`persistOptions`, and `startOnlineManager` are ready for plan 01-12 to import for `setMutationDefaults` registration and the `PersistQueryClientProvider`/app-boot wiring — none of that is done here by design (per the plan's stated split).
- `useSyncStatus()` (SYN-06, D-14) is not built in this plan; it is a thin consumer of `queryClient`'s mutation cache plus `onlineManager` and can be added independently once the provider tree exists.
- No blockers. `src/data` has zero engine imports (verified via `npm run depcruise`), keeping the `engine/` purity boundary intact.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*

## Self-Check: PASSED

- FOUND: src/data/cache/persister.ts
- FOUND: src/data/queryClient.ts
- FOUND: src/data/onlineManager.ts
- FOUND: src/data/__tests__/persister.test.ts
- FOUND: src/data/__tests__/onlineManager.test.ts
- FOUND: src/data/__tests__/offlineRead.test.tsx
- FOUND commit: 84feb93 (Task 1)
- FOUND commit: 0dff990 (Task 2)
