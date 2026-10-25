---
phase: 05-decide-ui
plan: 12
subsystem: data
tags: [decide, tanstack-query, snapshot, stacking]
requires: [05-05, 05-06, 05-07, 05-38]
provides: [Decide query/mutation keys, Decide read hooks, useDecideSnapshot, selectOtherChecks, useOtherChecks]
affects: [05-13, 05-15, 05-21, 05-27, 05-52]
key-files:
  created:
    - src/data/queries/decide.ts
    - src/data/queries/__tests__/decide.test.tsx
    - src/features/decide/snapshot/stacking.ts
    - src/features/decide/snapshot/__tests__/stacking.test.ts
    - src/features/decide/__tests__/stackPerf.test.ts
  modified:
    - src/data/keys.ts
metrics:
  tasks: 3
  files: 6
---

# Phase 5 Plan 12: Decide keys and read hooks Summary

One shared Decide snapshot hook (`useDecideSnapshot`) assembled in memory with `useMemo` from cached rows, plus every Decide query and mutation key and a pure `selectOtherChecks` that stacks all other open checks (D-24).

## Tasks

| Task | Commit |
|------|--------|
| 1 Decide keys | 0e399e2 |
| 3 selectOtherChecks + stackPerf (committed before Task 2, which imports it) | dfb4647 |
| 2 read hooks, useDecideSnapshot, useOtherChecks | ead4de3 |

## What was built

- Row-derived keys (history, upcoming, linked lines, statement periods, attach candidates, goal lines) nest under `['transactions', householdId]`, so any transaction write refreshes the snapshot. Own-key reads (checks, settings, debts, links, changes, goals) and all 13 Decide mutation keys are registered.
- `useDecideSnapshot` reads 12 months of history, rows dated after this month up to 120 months out (pending one-offs, 05-06), accounts, balances, series, FX, categories, settings, debts, periods, changes, custom currencies, payment links (joined with each check's kind) and written row links. Region is `getDeviceRegion(rc.region) ?? null`. Returns `{ status, result, source, retry }`. The cache holds rows only; the `SnapshotResult` never reaches it. `status` is `error` only when a read failed with nothing cached, so an offline cached copy stays `ready`. `retry` refetches only failed reads.
- `selectOtherChecks` considers open, undeleted checks other than the excluded one in created_at then id order; incomplete drafts and foreign-currency checks are counted, never guessed; investment checks stack; source kind `none` gives `EMPTY_STACK`.

## Verification

- `npx jest src/data/queries/__tests__/decide.test.tsx` 12 tests pass; stacking 7, stackPerf 1 pass; decide + queries suites 447 tests pass; snapshot folder coverage 100% (stacking.ts 100/100/100/100)
- `npm run typecheck` clean (05-05 `DecideSettingsRow`/`DebtRow` match `SnapshotSource`); `npm run depcruise` no violations; `npm run lint` 0 errors
- A14 timing (non-gating): ten chips, each with nine stacked checks, took 17 ms on this machine (target under 100 ms)

## Deviations from Plan

None to the engine or plan scope. Notes:

- Task 3 was committed before Task 2 because `decide.ts` imports `stacking.ts` (useOtherChecks).
- `useDecideSnapshot` also mounts a second `useQuery` on the account-balances key (same key as `useAccountBalances`, so no extra request) purely to surface that read's loaded and error state, which `useAccountBalances` does not expose. Without it a failed balances read would silently build the snapshot from opening balances.
- Tests mock the db fetchers and sibling hooks rather than the order-based FakeSupabase queue, which is too brittle for fifteen concurrent reads.

## Known Stubs

None.

## Human / device items

None. Local Jest run once showed `journal/estimateActual.test.ts` fail under a heavy parallel coverage run; it passes in isolation (timing flake, not touched by this plan).

## Migrations

None created.

## Self-Check: PASSED
