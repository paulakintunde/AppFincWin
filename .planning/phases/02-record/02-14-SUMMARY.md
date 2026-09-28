---
phase: 02-record
plan: 14
subsystem: database
tags: [tanstack-query, supabase, typescript, jest, activity, categories, recurring, undo]

# Dependency graph
requires:
  - phase: 02-record (02-01)
    provides: "engine/recurring: occurrenceDate, occurrencesBetween, materialisationHorizon, projectOccurrences"
  - phase: 02-record (02-06)
    provides: "engine/activity: monthTotals, isOverdue, markPaidDate, monthsForSwitcher, accountBalance; engine/categorize/builtins: BUILTIN_CATEGORY_KEYS"
  - phase: 02-record (02-11)
    provides: "src/db/rows.ts Record row types, src/db/transactions.ts fetchTransactionsSearch/fetchTransferLegs/TRANSFER_LEGS_MAX, src/data/keys.ts Phase 2 query keys"
  - phase: 02-record (02-12)
    provides: "src/db/categories.ts fetchCategories, src/db/recurringSeries.ts fetchRecurringSeries"
  - phase: 02-record (02-13)
    provides: "src/db/undoLog.ts fetchUndoLog, src/db/recordReads.ts fetchAccountBalances/fetchTransactionMonths/fetchHouseholdMemberNames"
  - phase: 02-record (02-37)
    provides: "engine/accounts: accountStanding"
provides:
  - "src/data/queries/categories.ts: useCategories, useCategoryLookup (active picker order, builtinIds, transferCategoryId)"
  - "src/data/queries/recurringSeries.ts: useRecurringSeries"
  - "src/data/queries/undoLog.ts: useUndoLog"
  - "src/data/queries/homeAmount.ts: latestPerEur, homeAmountFor, projectionHomeAmount"
  - "src/data/queries/activity.ts: useMonthView, useTransactionMonths, useTransactionsSearch, useTransferLegs, useAccountBalances, useHouseholdMemberNames"
  - "src/features/record/useRecordContext.ts: useRecordContext"
  - "src/features/record/categoryName.ts: categoryName"
affects: ["02-20..02-30 (Phase 2 screens consume every read exclusively through these hooks)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Query hooks stay a thin useQuery wrapper over an already-typed db/ fetch function (accounts.ts's established shape); all view maths (totals, projections, standing, switcher) stays imported from engine/ and is never reimplemented in the data layer"
    - "A month's transfer counterparts resolve for free when both legs already sit in the cached month; only transfer ids with a single local leg trigger one batched, sorted, TRANSFER_LEGS_MAX-capped useTransferLegs follow-up fetch"

key-files:
  created:
    - src/data/queries/categories.ts
    - src/data/queries/recurringSeries.ts
    - src/data/queries/undoLog.ts
    - src/data/queries/homeAmount.ts
    - src/data/queries/activity.ts
    - src/data/queries/__tests__/recordQueries.test.tsx
    - src/features/record/useRecordContext.ts
    - src/features/record/categoryName.ts
  modified: []

key-decisions:
  - "homeAmountFor/projectionHomeAmount take no customs list (matching the plan's literal signature): a custom currency's code is simply absent from the cached FX rate list, so it falls through the same 'no usable rate -> null' path as any other missing rate, rather than needing separate custom-currency handling"
  - "useAccountBalances' pendingSum sums only the account's own-currency pending legs (mirroring how accountBalance's own paid-sum only counts the account's own currency), left as a same-currency figure rather than mixing currencies into one number"
  - "useMonthView's counterpart resolution batches every transfer id with exactly one local leg into a single sorted, TRANSFER_LEGS_MAX-capped useTransferLegs call, rather than one fetch per row"

requirements-completed: [ACT-01, ACT-02, ACT-03, ACT-04, REC-05, REC-07, REC-08, REC-11, REC-17, REC-18]

# Metrics
duration: ~3h50m wall-clock (most of it background Jest/tsc runs under heavy concurrent-worktree load, not active editing -- see Issues Encountered)
completed: 2026-09-28
---

# Phase 02 Plan 14: Record Read Hooks Summary

**Every Phase 2 read hook screens will consume: month view with recurring projections and transfer-aware totals, the month switcher, cross-month search, per-account balances with standing, categories/series/undo-log/member-name caches, and the shared `useRecordContext` + `categoryName` helpers -- all thin `useQuery` wrappers over `db/`, with every number crunched in `engine/`.**

## Performance

- **Duration:** ~3h50m wall-clock (see Issues Encountered -- this machine ran several concurrent parallel-executor worktrees, and single Jest/tsc invocations that normally take under a minute took several minutes each)
- **Tasks:** 2 (both TDD, RED then GREEN)
- **Files modified:** 8 (7 created, plus the shared test file grown across both tasks)

## Accomplishments

- Task 1: `useCategories`/`useCategoryLookup` (active picker order: builtins in seed order then custom by `created_at`; `builtinIds` map; the system Transfer category's own id for D-50), `useRecurringSeries`, `useUndoLog` -- each a direct copy of `accounts.ts`'s established `useQuery` shape
- Task 1: `homeAmount.ts`'s `homeAmountFor`/`projectionHomeAmount` cross-convert through a row's own stored `orig_per_eur` to whatever home currency is requested (D-05's "cross-converted through the stored base"), never re-deriving from `home_per_eur`; any missing rate, unusable exponent or unstamped row counts as unconverted (`null`), never a guessed figure (T-02-14-01)
- Task 1: `useRecordContext` (userId/householdId/homeCurrency/showCents/region/timeZone/today, `ready`-gated on auth+household+prefs) and `categoryName` (i18n key until renamed)
- Task 2: `useMonthView` combines the cached month's rows with recurring projections beyond `materialised_through`, maps each row's `amountHome`/`overdue`, and computes totals via the engine's `monthTotals` -- transfer legs excluded from every sum by `transfer_id` alone (never by category), with same-month counterparts resolved for free and cross-month counterparts fetched via one batched, capped `useTransferLegs` call (T-02-14-03)
- Task 2: `useTransactionMonths` (month switcher), `useTransactionsSearch` (2+ char server-side search), `useAccountBalances` (paid/pending/`accountStanding` per account, standing `null` rather than guessed when the balance itself overflowed -- T-02-14-04), `useHouseholdMemberNames`
- Every acceptance-criteria grep passes exactly as specified: `monthTotals(`, `projectOccurrences(`, `accountStanding(` each appear exactly once in `activity.ts`; `isTransfer: r.transfer_id !== null` appears exactly once; `homeAmount.ts` contains no `parseFloat`/`Number(row.rate|orig_per_eur)`
- `npm run typecheck`, `npm run depcruise` (216 modules, 639 dependencies, no violations) and `npx eslint` on every file this plan touched are all clean; `npx jest src/data/queries` -- 47/47 tests, 3/3 suites green

## Task Commits

Each task followed the plan's RED-then-GREEN TDD gate, each half committed atomically:

1. **Task 1: Simple cached reads + home-amount helper + record context**
   - `7f20dc2` test(02-14): add failing tests for simple cached reads, home-amount and record context helpers (RED)
   - `5f925dd` feat(02-14): simple cached reads, home-amount conversion and shared record context (GREEN)
2. **Task 2: Month view, months, search, balances, member names**
   - `9e867e5` test(02-14): add failing tests for month view, months, search, balances and member names (RED)
   - `1bd5c53` feat(02-14): month view, month switcher, search, balances and member-name reads (GREEN)
3. **Fix (surfaced by whole-project verification, both tasks)**
   - `30ef547` fix(02-14): brand minor-unit amounts before convertMinor; fix getDeviceTimeZone import

_TDD gate compliance verified: each RED commit's test run was confirmed genuinely failing against the pre-implementation tree (Task 1: "Cannot find module '@/features/record/categoryName'"; Task 2: "Cannot find module '../activity'", both via a real `mv`-implementation-files-aside run, not an assumption), then the matching GREEN commit's suite passed in full._

## Files Created/Modified

- `src/data/queries/categories.ts` - `useCategories`, `useCategoryLookup`
- `src/data/queries/recurringSeries.ts` - `useRecurringSeries`
- `src/data/queries/undoLog.ts` - `useUndoLog`
- `src/data/queries/homeAmount.ts` - `latestPerEur`, `homeAmountFor`, `projectionHomeAmount`
- `src/data/queries/activity.ts` - `useMonthView`, `useTransactionMonths`, `useTransactionsSearch`, `useTransferLegs`, `useAccountBalances`, `useHouseholdMemberNames`
- `src/data/queries/__tests__/recordQueries.test.tsx` - 31 tests across every hook/helper in this plan
- `src/features/record/useRecordContext.ts` - `useRecordContext`
- `src/features/record/categoryName.ts` - `categoryName`

## Decisions Made

See `key-decisions` in the frontmatter: no customs list threaded through `homeAmountFor`/`projectionHomeAmount` (a custom currency's absence from the cached FX list already produces the correct "unconverted" null); `useAccountBalances`' `pendingSum` stays same-currency only; `useMonthView` batches its cross-month transfer-leg lookups into one capped fetch rather than one per row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `homeAmount.ts` passed a plain `number` where `convertMinor` requires a branded `MinorUnits`**
- **Found during:** post-Task-2 whole-project `npm run typecheck`
- **Issue:** `convertMinor(row.original_amount, ...)` and `convertMinor(amount, ...)` in `homeAmountFor`/`projectionHomeAmount` passed the raw `number` fields straight through; `MinorUnits` is a branded type (`number & { __brand }`) and TypeScript correctly rejected the unbranded value at both call sites (plus two matching test expected-value calculations)
- **Fix:** Wrapped each amount in `minorUnits(...)` before calling `convertMinor`, inside the existing try/catch (an out-of-range or non-integer amount now falls through to the same `null`/unconverted path rather than throwing uncaught)
- **Files modified:** `src/data/queries/homeAmount.ts`, `src/data/queries/__tests__/recordQueries.test.tsx`
- **Verification:** `npm run typecheck` clean; `npx jest src/data/queries` still 47/47
- **Committed in:** `30ef547`

**2. [Rule 1 - Bug] `useRecordContext.ts` imported `getDeviceTimeZone` from the wrong module**
- **Found during:** the same whole-project `npm run typecheck` run
- **Issue:** `import { getDeviceTimeZone, localDateIn } from '@/engine/time'` -- `@/engine/time`'s barrel only exports `localDateIn`/`isValidLocalDate`/`monthOf`/`monthRange`; `getDeviceTimeZone` is a device-reading function that correctly lives in `@/services/locale/deviceLocale`, not in the engine (which has no device I/O)
- **Fix:** Split the import: `localDateIn` from `@/engine/time`, `getDeviceTimeZone` from `@/services/locale/deviceLocale`
- **Files modified:** `src/features/record/useRecordContext.ts`
- **Verification:** `npm run typecheck` clean
- **Committed in:** `30ef547`

**3. [Rule 1 - Bug] Two eslint warnings (duplicate import, unused import) in the test file**
- **Found during:** `npx eslint` on every file this plan touched
- **Issue:** `@/db/rows` was imported twice (once as `type { DbClient }`, once as `type { AccountRow, CategoryRow, ... }`); `isOverdue` was imported from `@/engine/activity` but never referenced directly (the hooks under test compute it internally)
- **Fix:** Merged both `@/db/rows` imports into one; dropped the unused `isOverdue` import
- **Files modified:** `src/data/queries/__tests__/recordQueries.test.tsx`
- **Verification:** `npx eslint` clean (0 errors, 0 warnings); `npx jest src/data/queries` still 47/47
- **Committed in:** `30ef547`

---

**Total deviations:** 3 auto-fixed, all Rule 1 (bugs caught by the plan's own stated verify commands -- whole-project typecheck and eslint on the plan's files). No scope change; no design decision required.

## Issues Encountered

- This worktree sits at `.claude/worktrees/agent-a9b6d1e47b9d1c074`, and (per 02-01/02-06/02-37's SUMMARYs) the committed `jest.config.js` `testMatch`/`roots` fix from 02-01 already handles the dot-directory glob issue -- no further workaround was needed here.
- The sandbox machine ran multiple concurrent parallel-executor worktree agents throughout this plan's execution (confirmed via `tasklist`, consistently 20-35 `node.exe` processes). Single `npx jest <one file>` invocations that this project's own SUMMARYs usually report as 50-260s took 30s-185s here, and whole-project `npm run typecheck`/`npm run depcruise`/`npx eslint` runs that are normally near-instant each took multiple minutes. Every verification command was run via `run_in_background` with a wait-for-notification loop rather than a blocking foreground call, per the environment's own guidance. No project file was changed to work around this -- it is pure machine load, not a config defect.
- `node_modules` was missing at the start of this worktree session; restored via `npm ci --legacy-peer-deps` (~5-6 min).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every hook plans 02-20..02-30 (Phase 2 screens) need is now typed, tested and available: `useCategories`/`useCategoryLookup`, `useRecurringSeries`, `useUndoLog`, `useMonthView`, `useTransactionMonths`, `useTransactionsSearch`, `useTransferLegs`, `useAccountBalances`, `useHouseholdMemberNames`, plus `useRecordContext` and `categoryName`.
- No blockers for downstream plans in this wave or Phase 2's screen plans.

---
*Phase: 02-record*
*Completed: 2026-09-28*

## Self-Check: PASSED

All 8 created/modified files verified present on disk:
- `src/data/queries/categories.ts`, `recurringSeries.ts`, `undoLog.ts`, `homeAmount.ts`, `activity.ts`
- `src/data/queries/__tests__/recordQueries.test.tsx`
- `src/features/record/useRecordContext.ts`, `categoryName.ts`

All 5 referenced commit hashes (`7f20dc2`, `5f925dd`, `9e867e5`, `1bd5c53`, `30ef547`) verified present in `git log`.
