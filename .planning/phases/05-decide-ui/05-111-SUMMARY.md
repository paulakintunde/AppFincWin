---
phase: 05-decide-ui
plan: 111
subsystem: decide-home
tags: [pure-models, home-card, notice-row]
requires: [05-109]
provides: [homeCardModel, homeProblems, noticeRowModel]
affects: [05-114, 05-116]
key-files:
  created:
    - src/features/decide/home/homeCardModel.ts
    - src/features/decide/home/homeProblems.ts
    - src/features/decide/home/__tests__/homeCardModel.test.ts
    - src/features/decide/home/__tests__/homeProblems.test.ts
decisions:
  - Models return codes and raw parameters, never copy keys or formatted money; renderers map them (05-110 key names are discretionary).
  - The switch label "Now from your logged months" needs a prior rough basis (settings rough_income or rough_spending set) as well as homeBasisSeen false.
  - Notice dot: only for offline with writes waiting (M4 literal); plain Offline, Saving and online waiting have none.
requirements: [DCU-34, DCU-14, SYN-06]
metrics:
  completed: 2026-10-24
  tasks: 2
---

# Phase 5 Plan 111: Home models Summary

Two pure, table-tested models decide what the dark home card says and what the notice row and "Needs a look" sheet list.

## What was built

- `homeCardModel(source, settings, { status, homeBasisSeen })` returns `loading | error | first_run | unavailable | figure`. A figure reads the engine's `prepareContext` (`leftBefore`, `incomeBasis`, `spendingBasis`), so nothing is recomputed. Label is `average | worst | tightest (info tightestFigures, under 3 full months) | figures (rough) | switched`. A negative month gives `short: true` with the absolute amount. A missing rate (`source.unconverted`) or a logged source with no usable month gives `unavailable` with its reason and one action, never a number. `markBasisSeen` tells the caller when to set `homeBasisSeen`.
- `homeProblems({ source, openChecks, sync, today, now })` returns the R17.5 entries in order (no figures, missing rate as lines / card limit / D-67 check, failed saves, conflicts, card minimum per card, stale rate over 30 days, sync) each with a `counted` flag and one action ref. Lines-rate and no-figures entries are listed but not counted. The D-67 check uses `inHomeCurrency(...).kind === 'missing'`. Card limit uses `cardMaxPurchase === null`.
- `noticeRowModel(entries)` returns hidden, the sync label alone (when it is the only counted entry), or `{n} items need a look`.

## Verify

- `homeCardModel.test.ts` 9 passed, `homeProblems.test.ts` 10 passed; `npm run typecheck` clean; eslint 0 errors on touched files. No coverage target in the plan.

## Deviations

- `noticeRowModel` takes `entries` only (the sync label is already on the sync entry), not `(entries, sync)`.
- `homeProblems` takes the open checks (`{ inputs, isSample }`) and computes the D-67 gap itself, so it is tested.
- Switch label gated on a prior rough basis (see decisions); a user who never gave rough figures sees the normal label.
- No 05-110 keys referenced, so no test waited on them.

## Device item

05-EXECUTION-NOTES entry 05-111 (fresh account: 'Not worked out yet' and no notice row; 31-day-old EUR rate: '1 item needs a look') applies once 05-114/116 render these models.

## Self-Check: PASSED
Commits 1e6122ba, d514e259 exist.
