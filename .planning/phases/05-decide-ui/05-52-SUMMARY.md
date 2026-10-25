---
phase: 05-decide-ui
plan: 52
subsystem: decide-ui
tags: [decide, bought-check, recalculation, snapshot]
requires: [05-06, 05-07, 05-12, 05-18, 05-20]
provides:
  - withoutCheckWrites (pure SnapshotSource transform)
  - useBoughtCheckComputation hook for 05-29 and the cooling-off reopen
affects: [05-29, 05-11]
key-files:
  created:
    - src/features/decide/snapshot/withoutCheckWrites.ts
    - src/features/decide/snapshot/__tests__/withoutCheckWrites.test.ts
    - src/features/decide/check/useBoughtCheckComputation.ts
    - src/features/decide/check/__tests__/useBoughtCheckComputation.test.tsx
  modified: []
key-decisions:
  - "A bought check is judged on the source with its own live 'written' rows, series (and their materialised occurrences), debt (links plus debts.check_id) and payment/written-row links removed, so the purchase never counts twice"
metrics:
  tasks: 2
  completed: 2026-10-20
requirements: [DCU-03, DCU-07]
---

# Phase 5 Plan 52: Bought check without its own writes Summary

`withoutCheckWrites` strips a bought check's Go-ahead rows, series, occurrences, debt and links from the snapshot source, and `useBoughtCheckComputation` feeds that to `buildDecideSnapshot`/`computeCheck`, so a bought sofa or loan recalculates to exactly its pre-Go-ahead verdict.

## Behaviour
- Named proofs: a sofa Go ahead recalculates to a verdict equal to the pre-Go-ahead one, while the naive recompute is exactly 180_000 lower in `cashAfter` (the double count); a car loan Go ahead (day-one row, payment series, running-cost series, debt, a paid occurrence) recalculates to the pre verdict with the same debts and cash on hand.
- Attached links, other checks' writes and an undone Go ahead (links deleted) remove nothing; replaced series ended on the need-by/decided date are open again; paid dropped rows are added back to their account balance (same-currency only); input never mutated (deep-frozen test).
- Hook: idle unless the row is 'bought'; loading until snapshot source and links arrive; error on either failing; `endedOn = inputs.needBy ?? local date of decided_at` (falls back to `today` when decided_at is null).

## Assumptions
- A replaced series was a live open-ended bill when picked, so end_date reverts to null when it equals Go ahead's end date.
- A paid dropped row in another currency than its account leaves the balance alone; 05-20 writes in the account's currency so this does not arise.

## Deviations from Plan
- [Rule 3] The hook's useMemo deps were rewritten with `checkId`/`decidedAt` locals because the React compiler lint rule refused `row?.id` (lint error); behaviour unchanged.
- Test file mocks `waitReminder` (imported through decideGoAhead) to avoid the expo-notifications warning. Test arithmetic uses plain numbers (MinorUnits is a number brand), not bigint as the plan's sketch showed.
- Extra tests beyond the plan list: upcoming rows/payment links/debt by check_id, balance with no entry, hook loading/error/need-by variants.

## Verification
- snapshot folder + decide + data/queries: 75 suites, 1023 tests green; `withoutCheckWrites.ts` 100% statements/branches/functions/lines. (The folder-wide branch threshold message comes from test helper fixtures counted by the plan's ad-hoc `--collectCoverageFrom`, which includes `__tests__`; unchanged by this plan.)
- typecheck clean; lint 0 errors (717 warnings, unchanged); depcruise clean.
- No engine edits, no migrations.

## Device items
- None. 05-29 and the 05-11 reopen route should call `useBoughtCheckComputation` for bought checks.

## Self-Check: PASSED
