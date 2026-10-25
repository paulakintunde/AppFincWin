---
phase: 05-decide-ui
plan: 145
subsystem: decide-ui
tags: [decide, basis, D-107, DCU-40, DCU-09]
requires: [05-140, 05-141, 05-144]
provides: ["BasisOutcomeCard", "Step 3 outcome card and waiting-for-a-rate note"]
key-files:
  created:
    - src/features/decide/check/BasisOutcomeCard.tsx
    - src/features/decide/check/__tests__/BasisOutcomeCard.test.tsx
  modified:
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/check/steps/__tests__/Step3Verdict.test.tsx
    - src/features/decide/__tests__/r18Matrix.test.tsx
    - src/features/decide/__tests__/r18ReadingOrder.test.tsx
    - src/features/decide/check/__tests__/verdictCard.test.tsx
    - src/features/decide/check/__tests__/verdictDepth.test.tsx
    - src/features/decide/check/__tests__/expectedReturnSurfaces.test.tsx
metrics:
  completed: 2026-10-24
---

# Phase 5 Plan 145: Outcome on each basis Summary

Step 3 now shows "The outcome on each basis": This month, Worst month and Average month with the state chip and the free / overspent figure, the chosen basis marked "Used for this check".

## What was built
- `BasisOutcomeCard`: white card, heading title, three rows in fixed order from `computation.basisOutcomes`. Side by side (flex 1 each) when there is room, one per line under rule S (`useShouldStack`). The chosen row has a `fill1` background and `selected` state. An overspent figure is in the danger tone with no minus (`monthFigure`). A fallback row adds "Waiting for a {currency} rate, shown as the worst month". Each row is one accessible stop (`rowA11y` / `rowA11yChosen`, spoken amounts); the title is a header; the card is not a stop.
- Keep-last-value: the held outcomes live in state adjusted during render (the lint rule bars refs in render). Held only for the same `checkKey` (revealKey) and only while `busy`; not busy with null clears it; a new check drops it; nothing before the first settled value. The group carries `accessibilityState.busy`, no visible word.
- `Step3Verdict`: card after the basis row group and before the warnings; when `source.monthFallback` is set, a meta line `decide.home.hero.monthWaitingRate` sits directly under the basis row.
- No new copy keys, no new tokens, no `numberOfLines`, fixed height or absolute style (decideTextFit passes untouched).

## Tests
- 11 named D-107 tests in BasisOutcomeCard.test.tsx; 7 in Step3Verdict.test.tsx (placement, hidden first read, follows inputs, Judge-on moves the mark, reading order, fallback note, no note without fallback); R18 matrix cell (all four sizes, with and without fallback) and a reading-order test (verdict card, then header, then one stop per row).

## Deviations from Plan
1. [Rule 3 - Blocking] "Existing Step 3 tests pass unchanged" could not hold: `computeCheck` fills `basisOutcomes`, so the card's "It fits", "Average month" and headers duplicate what four older test files query by text (Step3Verdict, verdictCard, verdictDepth, expectedReturnSurfaces). Their `propsFor` helpers now set `basisOutcomes: null` (assertions untouched); the new tests use real outcomes.
2. Render-phase ref replaced by adjusted state, because `react-hooks/refs` errors on ref access in render.

## Verify
- Full `npx jest --silent`: 637 suites passed, 24698 tests passed, 14 skipped. typecheck clean. eslint 0 errors (warnings pre-existing). depcruise: no violations.

## Device
05-EXECUTION-NOTES "05-26 device checklist additions (Wording and This month, D-106)", entries 05-144 / 05-145 and the fallback-notes entry already cover this plan.

## Self-Check: PASSED
