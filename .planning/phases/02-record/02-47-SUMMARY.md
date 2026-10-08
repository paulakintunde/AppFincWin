---
phase: 02-record
plan: 47
subsystem: data
tags: [fx, resolve-rate, sweep, offline, asyncstorage]
requires: [02-46]
provides:
  - src/data/sync/sweepBudget.ts (leaf call budget, shared with 02-49)
  - src/data/mutations/accountRateChecks.ts (persisted account opening-date checks)
  - src/data/sync/ratePendingSweep.ts (budgeted oldest-first sweep)
affects: [02-49]
key-files:
  created:
    - src/data/sync/sweepBudget.ts
    - src/data/sync/ratePendingSweep.ts
    - src/data/mutations/accountRateChecks.ts
    - src/data/sync/__tests__/sweepBudget.test.ts
    - src/data/sync/__tests__/ratePendingSweep.test.ts
    - src/data/mutations/__tests__/accountsRate.test.tsx
  modified:
    - src/data/mutations/accounts.ts
    - src/features/record/accounts/AccountSheet.tsx
    - src/features/record/accounts/__tests__/accounts.test.tsx
    - src/data/QueryProvider.tsx
decisions:
  - Opening date is the device-local creation date (rc.today), carried in the mutation vars so an offline-queued account still asks for it on flush.
  - A throttled retry still consumes a budget unit (conservative; keeps the cap exact).
metrics:
  tasks: 2
  completed: 2026-10-08
requirements: [REC-08, MON-05, MON-06, SYN-01]
---

# Phase 2 Plan 47: On-demand FX triggers and pending sweep Summary

A new foreign-currency account asks the server for its currency's rate on the account's opening date; whatever cannot complete is retried by a budgeted sweep that runs when the app is online and focused.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 account rate check | f4e5420 | `sweepBudget.ts` leaf; `accountRateChecks.ts` (key `fincwin:fx-account-rate-checks`, max 20, per-user, never throws); `addAccount` onSuccess runs it when `vars.rateCheck` set; `useAddAccount.add(input, undo, rateCheck)` drops the check for home-currency accounts; AccountSheet passes `{homeCurrency, openingDate: rc.today, userId}` only for a foreign new account |
| 2 sweep | 3c3b52b | `ratePendingSweep.ts`: 15 min interval, 10 calls/run via one SweepBudget, account checks first then oldest dates, 6 h per-date backoff, signed-out/throttled/empty = no call; `startRatePendingSweep(queryClient)` in QueryProvider after `startOnlineManager()` |

## Verification
- `npx jest src/data src/db src/features/record src/services/storage`: 67 suites, 1147 tests; all pass (moneyPrefs.test.tsx failed once under full-run load and passes alone, 20/20; unrelated to this plan).
- `npm run typecheck`, `npm run depcruise` (no-circular clean), eslint on changed files: clean.

## Deviations from Plan
- TDD note: Task 1's RED run raced with my writing of the implementation files (jest was slow), so RED was only partly observed (sweepBudget passed, accountsRate had failures). Task 2's RED was observed cleanly (module not found) before the implementation was written.
- ratePendingSweep tests mock fxResolve, transactionCache and accountRateChecks (as planned) and count calls through the mocks rather than raw client invokes.
- The sweep reads the device time zone via `@/services/locale/deviceLocale` (`getDeviceTimeZone`) for device-local tomorrow.

## Known Stubs
None.

## Self-Check: PASSED
