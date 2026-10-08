---
phase: 02-record
plan: 46
subsystem: data
tags: [fx, resolve-rate, tanstack-query, recurring-series]
requires: [02-44 (server contract, wave 2)]
provides:
  - src/db/fxResolve.ts (only client door to resolve-rate; fetchRatePendingRows for 02-47)
  - followUpPendingByDate in transactionCache.ts (sweep reuses it)
affects: [02-47, 02-48, 02-50]
tech-stack:
  patterns: [one call per distinct date, fxLatest invalidation after every resolve]
key-files:
  created:
    - src/db/fxResolve.ts
    - src/db/__tests__/fxResolve.test.ts
    - src/data/mutations/__tests__/transactionCache.test.ts
  modified:
    - src/db/transactions.ts
    - src/db/__tests__/transactions.test.ts
    - src/data/mutations/transactionCache.ts
    - src/data/mutations/transactions.ts
    - src/data/mutations/__tests__/transactions.test.tsx
    - src/data/mutations/recurringSeries.ts
    - src/data/mutations/__tests__/recurringSeries.test.tsx
decisions:
  - Series follow-up skips the read only when cached home currency equals the series currency; unknown prefs still read.
metrics:
  tasks: 3
  completed: 2026-10-08
requirements: [MON-05, MON-06, REC-01, REC-02, REC-05, REC-09]
---

# Phase 2 Plan 46: On-demand FX client door Summary

One module (`src/db/fxResolve.ts`) now owns every resolve-rate call. Imports fetch once per distinct date, foreign recurring series follow up their server-materialised lines, and every resolve refreshes the cached latest rates.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 fxResolve.ts | 37152d4 | requestRateResolution moved verbatim; added batch, ensure-by-date, pending-row read; shared private invoke with the old error handling (network rethrown, 429 noted, other HTTP null) |
| 2 per-date import + fxLatest | fd3a35c | followUpPendingByDate (<=50 ids/call, <=20 calls, newest dates first, swallows errors, returns stillPendingDates); followUpIfRatePending invalidates fxLatest after a call returns; importChunk uses one `void followUpPendingByDate`; stale fx-monitor/restamp comments replaced |
| 3 series follow-up | 282709a | `followUpSeriesRates` (read pending rows for the series up to device-local tomorrow, asc, limit 100, then follow up by date); createSeries skips it when home currency equals series currency; editSeriesFrom always runs it; endSeries none |

## Verification
- `npx jest src/data src/db src/features/record`: 62 suites, 1108 tests pass.
- `npm run typecheck`, `npm run depcruise`, eslint on changed dirs: clean.
- Acceptance greps: only fxResolve.ts invokes resolve-rate outside tests; `requestRateResolution` count in db/transactions.ts is 0; `followUpPendingByDate(` once and `dedupeKey` zero in mutations/transactions.ts; no fx-monitor/restamp text in transactionCache.ts.

## Deviations from Plan
- offlineWrite.test.tsx needed no change: it uses the fake client (no module mock), and the single-add path still sends `{ transactionId }`.
- Added a dedicated `transactionCache.test.ts` for the follow-up helpers (not in the plan's file list).
- TDD note: for Task 1 (a move) and the Task 2/3 code the implementation was written before running the new tests, so RED was not separately observed; the changed import test was updated to the new body shape and would fail against the old per-row code.

## Known Stubs
None.

## Self-Check: PASSED
Files and commits 37152d4, fd3a35c, 282709a verified present.
