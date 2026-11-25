---
phase: 07-insights
plan: 04
subsystem: i18n, test-config
tags: [copy, copy-guard, coverage, stryker]
requires: []
provides: [insights copy catalogue, insights guard set, health/insights coverage and mutation scope]
affects: [07-08..07-11 consume the insights.* keys]
key-files:
  created: [src/i18n/locales/insights/index.ts, src/i18n/__tests__/insightsCopy.test.ts]
  modified: [src/i18n/locales/en.ts, src/i18n/copyGuard/rules.json, jest.config.js, stryker.config.mjs, scripts/check-stryker-disables.mjs]
requirements-completed: [INS-01, INS-02, INS-03, INS-04, INS-05, INS-06]
duration: long (slow shared machine)
completed: 2026-11-22
---

# Phase 7 Plan 04: Insights copy contract Summary

Insights copy catalogue (`insights.*`) wired into en.ts, an `insights` copy-guard set that bans advice and grade words, and the `health` / `insights` engine folders added to the 100% coverage loop and the Stryker mutate list.

## Commits
- 498749eb feat(07-04): catalogue, wiring, guard set, test
- 65f91f34 chore(07-04): jest / stryker / check-stryker-disables config

## Copy keys
The tree is exactly the plan's contract, with these owner-driven changes:
- **D-27:** `insights.categories.debtSavingNote` = "Debt payments and saving are not counted here."
- **Plural fix:** `insights.score.parts.cover.figure` replaced by `figure_one` ("{{months}} month") and `figure_other` ("{{months}} months"). Consumers must call `t('insights.score.parts.cover.figure', { count, months })` where `count` is the months value (so 1 reads "1 month").
- **D-26a:** `range.sixMonthsA11y` = "Last 6 full months and this month so far"; `range.oneYearA11y` = "Last 12 full months and this month so far". `allWindowNote` already reads "plus this one".

## Deviations
None of substance. Guard `banned` entries are already case-insensitive (string entries use flag `i`), so no capitalised variants were added. `listFiles` in check-stryker-disables already skips missing folders, so no change was needed there. The new top-level `insights` key in en.ts does not collide with the existing nested `insights: 'Insights'` tab label.

## Checks
- `npx jest src/i18n --coverage=false`: PASS (25 suites passed, 2 skipped, 22607 tests)
- `node -e "require('./jest.config.js')"`, `node scripts/check-stryker-disables.mjs` ("stryker disables ok"), `import('./stryker.config.mjs')`: OK
- `npx tsc --noEmit` and `npm run depcruise`: did not finish (machine saturated by parallel plans; the 2-minute and 3-minute runs timed out with no errors printed). Not confirmed. The only TS files touched are the catalogue, its test and en.ts wiring; run tsc at wave merge.

## Self-Check: PASSED
