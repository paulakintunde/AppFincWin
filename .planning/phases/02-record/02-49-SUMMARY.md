---
phase: 02-record
plan: 49
subsystem: data
tags: [fx, resolve-rate, home-currency, offline, asyncstorage, sweep]
requires: [02-46, 02-47]
provides:
  - src/db/householdCurrencies.ts (fetchHouseholdCurrencies)
  - src/data/mutations/homeCurrencyRates.ts (ensureRatesForHomeChange, retryOutstandingHomeRateCheck, HOME_RATE_CHECK_KEY)
affects: []
key-files:
  created:
    - src/db/householdCurrencies.ts
    - src/data/mutations/homeCurrencyRates.ts
    - src/db/__tests__/householdCurrencies.test.ts
    - src/data/mutations/__tests__/homeCurrencyRates.test.ts
  modified:
    - src/data/mutations/moneyPrefs.ts
    - src/data/sync/ratePendingSweep.ts
    - src/data/mutations/__tests__/moneyPrefs.test.tsx
    - src/data/sync/__tests__/ratePendingSweep.test.ts
decisions:
  - Each ensure chunk carries the new home plus up to 49 others (50 total), so 120 other codes make 3 calls (50/50/23).
  - A budget unit is taken before each chunk; an exhausted budget defers and keeps the persisted record.
  - Household id comes from the cached queryKeys.household(userId); if not cached the check is persisted and retried by the sweep.
metrics:
  tasks: 2
  completed: 2026-10-08
requirements: [MON-06, MON-05, SYN-01]
---

# Phase 2 Plan 49: Home-currency on-demand FX Summary

Changing the home currency (explicit `setHomeCurrency` or the applied device-region default) now asks resolve-rate for today's device-local rates for the new home currency against every other currency the household uses, with a per-user, wipe-safe persisted retry run first in the budgeted pending sweep.

## Tasks

| Task | Commits | Result |
|------|---------|--------|
| 1 helper + read | de94c8b (RED), 64999f9 (GREEN) | `fetchHouseholdCurrencies` unions accounts, `account_balances` line currencies and recurring series (sorted, distinct; any failing read throws). `ensureRatesForHomeChange` chunks to 50 codes incl. new home, never throws, persists the latest check under `fincwin:fx-home-rate-check` on deferral, invalidates `fxLatest` on success; `retryOutstandingHomeRateCheck` drops other users' records unread. |
| 2 wiring | 86d117b (RED), 4b0eadb (GREEN) | `setHomeCurrency` carries `homeRateDate` in the mutation vars so an offline change keeps its day; `onSuccess` and `useSetHomeCurrencyIfDefault` (when applied) call the helper fire-and-forget; sweep runs the home retry first (failure-isolated) on the shared budget. |

## Verification
- RED observed for both tasks (module not found; 5 new trigger/sweep tests failing) before implementation.
- `npx jest --ci src/data src/db src/features src/services/storage`: 81 suites; all pass. In the full run YouScreen's first test timed out once under load (5 s cold start) and passes alone; unrelated.
- `npm run typecheck`, `npm run depcruise` (no-circular and fx-fetch rules clean), eslint on changed files: clean.
- Gates: key literal count 1; no transaction writes in the helper; `ensureRatesForHomeChange(` x2 in moneyPrefs.ts; `retryOutstandingHomeRateCheck(` x1 in the sweep.

## Deviations from Plan
- Test-only: the moneyPrefs trigger tests pin `getDeviceTimeZone` to UTC in their `beforeEach`, because an earlier test in that file leaves another zone mocked.
- Local Supabase stack, deploys and pushes were not used.

## Known Stubs
None.

## Self-Check: PASSED
