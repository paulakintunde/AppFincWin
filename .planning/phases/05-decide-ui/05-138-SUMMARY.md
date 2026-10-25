---
phase: 05-decide-ui
plan: 138
subsystem: decide/snapshot
tags: [snapshot, judge-on, month-basis, D-106, D-107]
requires: [05-135, 05-142]
provides: [SnapshotSource.judgeOn, monthUnconverted, monthFallback, judgeOn on the result]
affects: [Decide home card, Judge on control, verdict comparison]
key-files:
  created:
    - src/features/decide/snapshot/__tests__/expectedMonth.test.ts
  modified:
    - src/features/decide/snapshot/buildSnapshot.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/__tests__/buildSnapshot.test.ts
requirements: [DCU-40, DCU-39, DCU-35]
completed: 2026-10-24
---

# Phase 5 Plan 138: Snapshot Judge-on Summary

The snapshot builder now turns the user's Judge-on choice into the engine's basis, reports current-month lines that have no stored rate, and falls back to Worst for the whole result when `month` is chosen and such a line exists.

## What was built
- `SnapshotSource.judgeOn?: Basis | null`. When given it is the engine `basisOverride`; absent or null keeps `settings.basis_override` exactly as before. The stored column and its type are unchanged.
- `monthUnconverted` (`MonthUnconvertedNote`: sorted `currencies`, `rowCount`, `rowsByCurrency`) on every result kind. Counted once per row, only for current-month lines that are not skipped (deleted ones are already filtered), only where the line is not already handled as a used history month. `unconverted`, `meta.unconvertedRows`, `converter.miss` and the history are untouched.
- `monthFallback` (`{ currencies }`, non-null only when `judgeOn` is `'month'` and `monthUnconverted` is non-null) and `judgeOn` (the choice as given, null when absent) on every result kind. With a fallback the logged snapshot gets `basisOverride: 'worst'`.
- A foreign pay series with no stored rate keeps the existing unconverted result (D-37); proven by a named test.

## Tests
- buildSnapshot.test.ts: 7 D-106 tests (monthUnconverted) and 8 D-107 tests (judgeOn, fallback, absent case, rough/none).
- expectedMonth.test.ts (new, 10 tests): builder to prepareContext to expectedMonth for conversion (EUR lines and series equal the same figures typed in USD), stamps, pay still due, no double count, one-offs, Savings series and debt-covered series, pot transfer legs; every case also asserts In minus Out equals the hero formula and `result === leftBefore`. Also the unconverted series case, the quick check on month/worst/average (month equals worst on an even world), and contexts on each basis through the real builder.
- Verify: `npx jest src/features/decide/snapshot src/engine/decide` green (109 suites, 1685 passed); snapshot source files at 100% on all four metrics (the 99.23% branch figure seen with a `**/*.ts` glob is the test helper fixtures only); typecheck clean for this plan's files; eslint 0 errors; depcruise clean.

## Commits
- ec20cc81 feat(05-138): report current-month lines with no stored rate (monthUnconverted)
- 64755c75 feat(05-138): judgeOn drives the engine basis, with the Worst fallback for a missing month rate
- 02032ea7 test(05-138): builder to engine integration tests for the expected month and the chosen basis

## Deviations from Plan
- Task 1 also added the optional `judgeOn` and `monthFallback` fields to `SnapshotBase` in types.ts (they belong to Task 2) so the type file was edited once. No behaviour change in Task 1.
- No defects found in 05-135 or 05-142; no changes to their files.

## Not green, outside this plan
- `npm run typecheck` reports an error in `src/features/decide/home/YourMonthCard.tsx(275)` (a non-literal i18n key), uncommitted work of the concurrent 05-141 executor. Left alone.
- A full `npx jest --silent` run on the busy shared machine crashed a worker and timed out `src/data/__tests__/offlineWrite.test.tsx` (hook timeout; unrelated, load-related). The targeted suites listed above pass.

## Self-Check: PASSED
