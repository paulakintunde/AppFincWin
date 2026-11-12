---
phase: 06-grow
plan: 36
subsystem: grow/debts
tags: [debt-detail, reveal, payments, D-30, D-32, gap-closure]
requires: [06-24, 06-26, 06-27, 06-28, 06-30]
provides:
  - useDebtPayments (next expected + last 6 paid lines of one debt)
  - useRecordLineDetail (Activity's transaction detail for any picked lines)
  - Debt detail reveal chips and payments list
affects: [06-37 (DebtsModel.focus now unread by the detail screen)]
tech-stack:
  added: []
  patterns:
    - one PostgREST select with an or-filter over series_id / extra_series_id / debt_id, ids checked as uuids first
    - query key nested under transactionsRoot so any transaction write refreshes debt payments
key-files:
  created:
    - src/data/queries/growDebts.ts
    - src/data/queries/__tests__/growDebts.test.tsx
  modified:
    - src/data/keys.ts
    - src/features/grow/debts/DebtDetailScreen.tsx
    - src/features/grow/debts/__tests__/debtDetail.test.tsx
    - src/features/grow/goals/useGoalRecordDetail.tsx
decisions:
  - Debt payments are keyed ['transactions', household, 'debt-payments', debtId, seriesId, extraSeriesId] so Activity writes, undo and confirms refresh them; the series ids in the key re-read after a plan save or stop.
  - A manual debt (no payment series) with a due day keeps its computed next payment as a plain Expected row (nothing to open), so the list is never empty while a payment is due.
  - The reveal card shows only when the minimum alone clears the debt; otherwise there is no "sooner"/"less" to compare.
metrics:
  completed: 2026-11-10
  tasks: 2
  files: 6
---

# Phase 6 Plan 36: Debt detail reveal and payments Summary

Debt detail now has the plan's reveal in small (+$25 / +$50 / +$100 / $1,000 once, each with "Debt-free by {date} · {sooner}" and "Interest about {x} · about {y} less" from `debtWhatIf`). It also lists real payments: the next Expected line, then the last 6 paid lines. Regular, extra and one-off payments each open Activity's transaction detail.

## What was built

**Task 1: `useDebtPayments` (commit d3ae0456)**
- `src/data/queries/growDebts.ts`: `fetchDebtPayments` makes one select on `transactions_active`. It filters on household, `status in (paid, pending)`, and `or(debt_id.eq.X, recurring_series_id.in.(series, extra))`, ordered newest first, with a 240-row safety cap. The pure function `debtPaymentsOf(rows, today)` returns `{ next, paid }`: `next` is the earliest pending line on or after today, and `paid` is the paid lines newest first, at most 6. The hook does not run without a debt.
- `debtLinkFilter` checks every id as a uuid before building the `or` string (T-06-36-01: no filter injection; reads stay behind the existing RLS).
- New key `queryKeys.debtPayments` sits under `transactionsRoot`.

**Task 2: Debt detail (commit 31f5e354)**
- **Reveal (D-30, T4):** chips come from `EXTRA_CHIP_UNITS` (the 0 is skipped) plus 1,000 once, scaled by the currency exponent. +$50 is open first. The figures come straight from `debtWhatIf` and are only formatted here (`aboutTens`, `soonerSpan`). The `revealA11y` label sits on the two lines, in a polite live region. LEDGER auto loan: "Debt-free by Dec 2028 · 4 months sooner" and "Interest about $640 · about $110 less". "$1,000 once" gives "Interest about $580 · about $170 less".
- **Change in the payoff plan (CRUD #10):** goes to `/(tabs)/grow?segment=debts` with `router.navigate`; `router.back()` is no longer used. "Try other amounts" still opens GC04.
- **Payments (D-32, T3, CRUD #4):** the next Expected row has the Expected badge. Paid rows show the date, then "From {account}", "Extra · from {account}" (extra series) or "One-off · from {account}" (debt_id, no series), then the amount. Each row opens `TransactionDetailSheet` through the new `useRecordLineDetail`. "See all in Activity" ends the list. When there is nothing to show, the list reads "No payments recorded yet".
- **Polish:** T1: the amount is in `display` (capped scale) with "owed" in muted `body`; the a11y label is still "$8,420 owed". T2: the "Started at" line and bar are hidden unless the start is above the balance. T5: the fact rows have hairline dividers and `gap: 0`. The header Edit uses the `label` role.
- The screen no longer reads `buildDebtsModel(...).focus` or `DEFAULT_EXTRA`.

## Deviations from Plan

**1. [Rule 3 - Blocking] Split `useRecordLineDetail` out of `useGoalRecordDetail.tsx`**
- **Issue:** the only working copy of "open Activity's detail from Grow" (06-32) filtered its lines by `goal_id`, so a debt's lines could not use it.
- **Fix:** an additive refactor. `useRecordLineDetail({ householdId, ownerId, today, lines })` holds the body, and `useGoalRecordDetail` now filters by goal and calls it. Goal behaviour is unchanged.
- **Files:** src/features/grow/goals/useGoalRecordDetail.tsx (not in the plan's file list).

**2. [Rule 3] Added a key in `src/data/keys.ts`** (`debtPayments`), following the registry rule that every query key lives there.

**3. `useDebtPayments(debt, today)` takes `today`** as well as the debt, because "next = on or after today" needs the screen's own today.

**4. Fallback Expected row** for a manual debt with no series line (this keeps the 06-17 behaviour, now shown as a Row with the badge instead of a sentence).

## Checks

- `npx jest src/features/grow/debts src/data/queries src/features/grow/__tests__/copyLint`: 22 suites, 1564 tests passed.
- `npx jest --findRelatedTests` on the changed files (keys.ts pulls in 267 suites): 3364/3364 passed on the final tree. An earlier run during the edits, under load, reported 2 failures. The re-run on the committed tree was clean, and `npx jest src/features/grow` gave 1811/1811.
- `npm run typecheck`: clean. `npm run depcruise`: no violations (1043 modules). eslint on the changed files: 0 errors (2 old `require()` warnings in the DetailScreen mock of debtDetail.test.tsx).
- Acceptance: `grep -c "\.focus"` gives 0, `grep -c "segment=debts"` gives 1, `grep -c debt_id src/data/queries/growDebts.ts` is 1 or more, and en.ts was not touched.

## Missing strings

None. Only existing 06-26 keys are used: `grow.debts.detail.*`, `grow.debts.sooner`, `yearsPart_*`, `monthsPart_*`, `spanYearsMonths`, `revealLess`, `revealSame`, `revealA11y`, and `grow.goals.detail.expected` / `historyRowA11y`.

## Known Stubs

None.

## Threat Flags

None. The read goes through the existing RLS-scoped `transactions_active` view, and no policy or migration was added.

## Self-Check: PASSED
- src/data/queries/growDebts.ts FOUND; src/data/queries/__tests__/growDebts.test.tsx FOUND
- commits d3ae0456, 31f5e354 FOUND
