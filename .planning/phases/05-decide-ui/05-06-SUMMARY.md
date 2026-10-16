---
phase: 05-decide-ui
plan: 06
subsystem: decide-snapshot
tags: [decide, snapshot-builder, fx-conversion, tdd, core-value]
requires: [05-01, 05-33, 05-34, 05-38]
provides:
  - buildDecideSnapshot / marketKeyFor / SnapshotSource (src/features/decide/snapshot/buildSnapshot.ts)
  - fullMonthFlags / shiftMonth (src/features/decide/snapshot/fullMonths.ts)
  - makeConverter (src/features/decide/snapshot/conversion.ts)
affects: [05-07, 05-12, 05-15, 05-30, 05-41]
tech-stack:
  added: []
  patterns: ["pure builder outside engine/ importing only barrels", "stored-rate conversion with a miss ledger instead of a fallback"]
key-files:
  created:
    - src/features/decide/snapshot/fullMonths.ts
    - src/features/decide/snapshot/buildSnapshot.ts
    - src/features/decide/snapshot/conversion.ts
    - src/features/decide/snapshot/__tests__/fullMonths.test.ts
    - src/features/decide/snapshot/__tests__/buildSnapshot.test.ts
    - src/features/decide/snapshot/__tests__/conversion.test.ts
    - src/features/decide/snapshot/__tests__/types.test.ts
    - src/features/decide/snapshot/__tests__/helpers/sourceFixtures.ts
  modified: []
key-decisions:
  - "Card owed amount is balance plus pending one-offs on the account (balances are paid-only), and covered Go-ahead purchases are subtracted from that, not from the bare balance"
  - "Missing rates are counted only for rows in the newest six full months and for pending one-offs; older or current-month rows are dropped silently"
  - "Market defaults (dealer cap, market card floor) convert without a basis note and without an unconverted miss"
  - "One-off lines are left out of expenseLines as well as the engine averages"
  - "A Debt-category outflow with no series is dropped from lines only when at least one DebtRecord came from a debts row"
requirements-completed: []
duration: ~75 min
completed: 2026-10-16
---

# Phase 5 Plan 06: Snapshot builder Summary

Pure, 100%-covered builder that turns Supabase rows, series, balances, debts, settings and dated changes into the one DecideSnapshot the Phase 4 engine reads, using stored FX rates only and counting every payment exactly once.

## What was built

- **fullMonths.ts**: `fullMonthFlags` (04 D-13, A3): a month is full only before the current month, with at least one live row, and either on/after a 1st-of-month coverage start or covered end to end by an imported statement period. `shiftMonth` helper.
- **conversion.ts**: `makeConverter` wraps 05-33 `convertLatest` (custom-currency aware). One `ConversionNote` per converted currency, a miss ledger that yields `UnconvertedNote`, no fallback rate ever.
- **buildSnapshot.ts**: `buildDecideSnapshot(source)` returning `logged`, `rough` or `none` with `cards`, `dealerCap`, `cash`, `conversions`, `unconverted` and full `SnapshotMeta`. Covers: counted-elsewhere predicate (debt-covered series, Savings series, promo payment runs via `paymentLinks`), bills/incomeSeries, saving vs investing (invest payment links), dated `scheduledOutflows` for pending one-offs (04 D-61) and derived card debt, card minimums through `simulateMinimum(...).firstPayment` (stored terms, market terms, pay-in-full, no terms named), loan accounts without payment named, limit validation (D-51, `limitsReset`), `futureChanges`, `RecordLine.oneOff`, rough-figures fallback.

## Verification

- `npx jest src/features/decide/snapshot --coverage` with the real config scope: 100% statements, branches, functions and lines on fullMonths.ts, buildSnapshot.ts, conversion.ts and types.ts (76 tests, including the fast-check property that `prepareContext` never throws on a built snapshot and the named limits test).
- `npm run typecheck`: clean. `npm run depcruise`: no violations. `npm run lint`: 0 errors (existing warnings only; the new folder has none).
- Plan acceptance greps all pass (no `@/db/*` import except `@/db/rows`, no `projectionHomeAmount`, no `Math.round`/`parseFloat`, barrel-only engine imports, all named tests present).

## Deviations from Plan

**1. [Rule 3 - Blocking] Tasks 2 and 3 committed as one RED/GREEN pair.** The depth inputs (conversion, one-offs, changes, payment links) are woven through the same builder code paths as Task 2, so a Task 2-only implementation would have been rewritten immediately. Commits: `ec961de` (tests and fixtures, RED) and `fbe5460` (implementation, GREEN). Task 1 kept its own pair (`5aa957c`, `713039e`).

**2. [Rule 3 - Blocking] Added `types.test.ts`.** The 100% coverage gate for `src/features/decide/snapshot/` includes 05-01's `types.ts`, whose runtime constants (`PAY_METHODS`, `CREDIT_TERMS`, `EMPTY_STACK`) had no test, so the folder threshold could not be met. A three-line test covers them.

**3. [Judgement, plan formula adjusted] Card base for the minimum.** The plan's `base = max(0, |home balance| - covered)` assumes the balance already includes the Go-ahead pending purchase, but balances are paid-only (activity.ts sums paid legs). The builder uses `owed = |min(0, balance + pending one-offs)|` and `base = max(0, owed - covered)`, which gives the plan's stated numbers (paid -120,000 plus pending -180,000 covered: base 120,000; pending only: base 0) with honest paid-only balances. Tests use paid-only balances.

**4. [Judgement] Missing-rate scope.** A row counts toward `unconverted` only when it sits in one of the newest six full months (the months the engine averages) or is a pending one-off; rows in older or current months are dropped quietly. Each row is counted at most once (a pending row in a used month is both a line and a pending one-off).

**5. [Judgement] Debt-category rule.** Per the plan, a Debt-category outflow with no series is omitted from lines only when a DebtRecord came from a debts row; otherwise it stays as spending so nothing disappears.

No engine code was edited.

## Known Stubs

None.

## Human verification

None required (pure logic). 05-12 will pass real 05-05 rows into `SnapshotSource`; its `tsc` run proves the local structural types (`SettingsSource`, `DebtSource`, `ChangeSource`) agree with `src/db/*`.

## Notes for downstream plans

- `percent()` throws on a malformed APR or card `min_percent` string; the builder trusts the DB column checks for those (only limits are guarded, per D-51).
- Migrations: none created. Docker not running; no database tests involved in this plan.

## Self-Check: PASSED
