---
phase: 07-insights
plan: 07
subsystem: data
tags: [insights, net-worth, scope, tanstack-query]
requires: [07-03]
provides: [useInsightsPrepared, householdPreparedOf, useNetWorthSeries, accountsForScope, buildNetWorthInputs, pointBalances, paidBeforeDateOf, useInsightsScope]
affects: [07-09, 07-10, 07-11]
key-files:
  created:
    - src/data/queries/insights.ts
    - src/data/queries/insightsNetWorth.ts
    - src/features/insights/useInsightsScope.ts
    - src/data/queries/__tests__/insights.test.ts
    - src/data/queries/__tests__/insightsNetWorth.test.ts
    - src/features/insights/__tests__/useInsightsScope.test.tsx
  modified:
    - src/features/home/useFigureScope.ts
requirements: [INS-01, INS-02, INS-03, INS-04, INS-05, INS-06]
completed: 2026-11-23
---

# Phase 7 Plan 07: Insights data layer Summary

One scoped Prepared per scope, a month-end net-worth series built from `account_paid_before` plus today's balances, and a persisted Just me / Household switch.

## What was built
- `useInsightsPrepared(scope, householdCurrency)`: Just me uses `useDecideV3()` (already carries the household slice); Household uses `householdPreparedOf(raw useDecideSnapshot().source, currency)`. `minePrepared` is always returned for the score. No `countsForMe` call.
- `useInsightsScope()`: same rule as Home (switch only with 2+ members), key `fincwin:figureScope.insights`; `FigureScreen` widened to `'home' | 'insights'`. Also returns `householdCurrency`.
- `useNetWorthSeries({range, scope, currency})`: `useQueries` per month-end from `monthEndsFor`, sharing `queryKeys.paidBefore` with Activity; today's point from `useAccountBalances` (`balance` + `otherCurrencies`, pending not counted); points = month-ends + 1. Pure helpers exported and tested.

## Deviations from Plan
- Insights scope hook also returns `householdCurrency` (needed by `useInsightsPrepared`). Minor addition.
- Test fixture for ARC-22 uses four months of shared lines: the builder drops a lone line in a non-full month, so a one-line fixture showed nothing.

## Checks
- eslint on changed files: clean. `npx tsc --noEmit`: clean. `npm run depcruise`: no violations.
- New tests: insights (3), insightsNetWorth (12 incl. hook), useInsightsScope (2): all pass.
- `jest --findRelatedTests src/features/home/useFigureScope.ts`: 4 suites, 28 tests pass. (An earlier wide run of `src/features/home` under heavy machine load hit 30 s test timeouts in homeLife and others; the related-tests run with a longer timeout is green.)

## Follow-ups
- Household scope uses `householdSnapshotSource` (series: [], settings: null), the same source Home and Decide's household view use, so Insights matches them. Salary lines tied to a pay series with no income kind on the line may count as 0 in Household "in". Existing app-wide behaviour, not fixed here.
- Net worth for debts paid off later without a recorded starting balance falls back to the current balance (engine edge from 07-03).

## Self-Check: PASSED
Files and commits 291a0ca8, 73f91d1a exist.
