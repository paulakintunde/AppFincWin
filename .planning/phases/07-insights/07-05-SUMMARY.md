---
phase: 07-insights
plan: 05
subsystem: levels
tags: [feature-registry, level-map, insights]
requires: []
provides: [insights, netWorthTrend, healthScore feature ids]
affects: [07-11 tab and section gates]
key-files:
  modified:
    - src/features/levels/featureRegistry.ts
    - src/features/levels/FeaturesScreen.tsx
    - src/features/levels/__tests__/featureRegistry.test.ts
    - src/features/levels/__tests__/FeaturesScreen.test.tsx
    - src/i18n/locales/features/index.ts
    - src/services/analytics/catalogue.ts
    - .planning/phases/09-tiers-onboarding/09-LEVEL-MAP.md
decisions:
  - "D-16: insights at Everyday (2); netWorthTrend and healthScore at Full picture (3)"
metrics:
  completed: 2026-11-22
---

# Phase 7 Plan 05: Insights feature registration Summary

Three Insight rows (insights L2, netWorthTrend L3, healthScore L3) registered in the feature registry, the Features screen (new `Insight` area between Grow and Sharing), feature copy, the analytics feature-id union and the signed level map (counts 5 / 20 / 32 / 35).

## Tasks

1. Registry rows, area, copy, analytics union.
2. Level map rows, counts, owner-answer amendments 4, 5, 8, 9 (original lines kept), tests (35 rows, `[5, 20, 32, 35]`, new Features screen case).

## Deviations

- The Features screen lists every row at every level (rows above the level read "Not in your level"), so the new test asserts the Insights row is on and the two level-3 rows read "Not in your level" for a level-2 user, instead of "only the Insights row".
- Files use CRLF; edits preserved it.

## Merge note

`09-LEVEL-MAP.md` is a signed file. Phase 9 work on another branch may conflict on it (counts line, section 2 table, section 5 answers).

## Checks

- `npx jest src/features/levels src/services/analytics src/i18n --coverage=false`: 34 suites passed, 2 skipped, 22491 tests passed (includes the level-map drift test and the new Features screen case).
- eslint on changed files: 0 errors (15 existing fast-check warnings in other test files).
- `npx tsc --noEmit` and `npm run depcruise`: started but did not finish before hand-back (machine saturated by parallel runs; jest alone took 46 min). Changes are literal union and row additions with no new imports; re-run in the integration worktree.
