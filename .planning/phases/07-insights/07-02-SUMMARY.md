---
phase: 07-insights
plan: 02
subsystem: engine
tags: [insights, month-bars, categories, compare, engine]
requires: []
provides:
  - monthBars(prepared, {throughCurrent}) in src/engine/month/picture.ts (pastMonthBars is a wrapper)
  - src/engine/insights: barsInRange, monthsInRange, barTotals, RANGE_MONTHS, categoryTotals, spendByCategory, compareMonths
affects: [07-03, 07-04, 07-05]
key-files:
  created:
    - src/engine/insights/range.ts
    - src/engine/insights/categories.ts
    - src/engine/insights/compare.ts
    - src/engine/insights/index.ts
    - src/engine/month/__tests__/monthBars.test.ts
    - src/engine/month/__tests__/monthBars.property.test.ts
    - src/engine/insights/__tests__/*.test.ts
  modified:
    - src/engine/month/picture.ts
    - src/engine/month/index.ts
decisions:
  - "D-26a: ranges are N full months plus this month so far"
  - "D-28: categories under 1% fold into rest"
requirements: [INS-02, INS-03, INS-04, INS-05]
completed: 2026-11-22
---

# Phase 7 Plan 02: Month bars and insights engine Summary

One bar rule (`monthBars`) now serves Decide's Month-by-month sheet and Insights, and a pure `engine/insights` module gives range trimming, category totals and month-against-month changes in integer minor units.

## Commits
- 0e75bc97 feat(07-02): monthBars adds this month
- next commit: insights engine (range, categories, compare)

## How D-26a changed the plan
The plan trimmed "6m" to the last 6 bars. Now `barsInRange` keeps the last N+1 bars after trimming leading empty months: 6m = 7 bars (6 full months + this month so far), 1y = 13 (Decide's whole window), all = every bar. `RANGE_MONTHS` still names the full months (6 / 12 / null). Tests and the range test assert 7 and 13. Callers must pass bars from `monthBars(p, {throughCurrent: true})` so the last bar is this month.

## Other decisions
- D-28: rows under 100 basis points (1%) fold into `rest {amount, shareBp, count}`; exactly 1% stays a row. Zero-net categories (refunds >= spending) are listed in `refundsExceeded`, not in rows.
- D-27: categories count `spending` less `refund` only; the Out bar (monthBars) still counts debt payments and saving. The note copy is 07-04's job.
- `compareIds` (amount ties by id, null last) is exported from categories.ts for compare.ts.

## Deviations
- Rule 3: RED and GREEN were committed together per task (one commit per task) rather than separate test/feat commits.
- Test-only fix: the monthBars fixture needs a pay series so income lines are eligible (recorded income requires it).

## Checks
- eslint on changed files: clean
- `npx jest src/engine/month` (whole folder): 35 suites, all pass after the fixture fix (469 + new tests); monthBars suites pass
- `npx jest src/engine/insights`: 4 suites, 24 tests pass; coverage 100% on range.ts and compare.ts; categories.ts had one dead branch (`a === b` in compareIds), removed
- tsc / depcruise / related tests: see final report from the orchestrator run (results recorded below if available)
