---
phase: 05-decide-ui
plan: 139
subsystem: decide-home
tags: [decide, home-card, judge-on, D-106, D-107]
requires: [05-138, 05-141, 05-142]
provides: [month label, selected and fallback on the figure model, rate entries in Needs a look]
affects: [05-140]
key-files:
  modified:
    - src/features/decide/home/homeCardModel.ts
    - src/features/decide/home/homeProblems.ts
    - src/features/decide/home/HomeSummaryCard.tsx
    - src/features/decide/home/MonthDetailsSheet.tsx
    - src/features/decide/home/__tests__/homeCardModel.test.ts
    - src/features/decide/home/__tests__/homeProblems.test.ts
metrics:
  completed: 2026-10-24
---

# Phase 5 Plan 139: Card model for Judge-on Summary

The home card model now labels a 'month' basis, carries the user's Judge-on choice (`selected`) and the rate fallback (`fallback`), and Needs a look lists the uncounted rate action for current-month lines without a rate.

## Commits
- 6c72dc79: model, label maps, HomeSummaryCard `judgeOn` prop, tests
- 784b3078: homeProblems rate entries, tests

## What was built
- `HomeCardLabel` gains 'month'; new `HomeJudgeOn` type; `HomeCardFlags.judgeOn` (undefined ignored, null returns loading).
- Label: `money.basis === 'month'` gives 'month'; a `monthFallback` gives 'worst' (replacing the engine's tightest); otherwise unchanged. 'switched' still wins on the first visit. No second computation: the breakdown still reads `prepareContext`.
- Figure state carries `selected` and `fallback` (rough sources carry `selected`, fallback null).
- `HomeSummaryCard` takes an optional `judgeOn` prop; LABEL_KEY and BASIS_KEY gain month keys (subMonth, basisMonth).
- `homeProblems`: for each `monthUnconverted` currency not already listed as a 'lines' entry, adds an uncounted `missing_rate` lines entry with `rowsByCurrency[currency]`.

## Verification
- `npx jest src/features/decide/home` and decideTextFit: 16 suites, 217 tests pass. `npm run typecheck` clean. eslint on the home folder: 0 errors (17 pre-existing require() warnings).
- Full suite, lint and depcruise: see the report to the orchestrator.

## Deviations
None. Notes: the month label is evaluated before the 3-month tightest rule, and a fallback forces 'worst' even with fewer than 3 months (the sub-line names Worst per the plan).

## Known Stubs
None. `judgeOn` is not yet passed by DecideHomeScreen (plan 05-140), so the screen behaves as before.
