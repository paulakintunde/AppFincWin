---
phase: 05-decide-ui
plan: 74
subsystem: ui
tags: [decide, step3, folds, hint, scroll, D-74, D-75, D-82]
requires: [05-59, 05-60, 05-63, 05-64, 05-65, 05-66, 05-69, 05-80, 05-83, 05-84]
provides:
  - useStep3Folds / Step3FoldList / defaultOpenFold / InvestGrowBody (step3Folds.tsx)
  - step 3 composed as summary card, notices, hint, one FoldList
  - ScrollIntoViewContext provider (steps 2 and 3)
affects: [05-75]
key-files:
  created:
    - src/features/decide/check/step3Folds.tsx
    - src/features/decide/check/__tests__/step3Folds.test.tsx
  modified:
    - src/features/decide/check/CheckFlowScreen.tsx
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/check/steps/Step4Alternatives.tsx
    - src/features/decide/check/BasisDetailRow.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/check/__tests__/CheckFlow.test.tsx
    - src/features/decide/check/steps/__tests__/Step3Verdict.test.tsx
    - src/features/decide/check/steps/__tests__/investingInstead.test.tsx
decisions:
  - "Step3FoldList is a component that calls useStep3Folds, so the seven useInfoSheet hooks run only inside the step 3 render (CheckFlowScreen returns early before computation exists)"
  - "Open fold is `chosenFold` (undefined = not chosen) with the effective key derived; closing every fold is a kept choice"
  - "Scroll-on-open goes through ScrollIntoViewContext only; FoldList's onOpened is not used"
metrics:
  tasks: 2
  completed: 2026-10-23
requirements: [DCU-11, DCU-14, DCU-18, DCU-02, DCU-13]
---

# Phase 5 Plan 74: Step 3 composition Summary

Step 3 now reads verdict card, basis row, notices, first-run hint, then one FoldList of up to ten folds (What breaks open on arrival when anything breaks), with "If it went into investing instead" moved from step 4 into fold 7, which on investment checks becomes "What it could grow to".

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. useStep3Folds, defaultOpenFold, notices-only Step3Verdict, provisional basis ⓘ | 3c858472 | 8 tests in step3Folds.test.tsx; Step3Verdict warning tests moved to WhatBreaksBody |
| 2. CheckFlowScreen composition, hint, scroll-on-open, step 4 without investing | 3465efc0 | 7 new CheckFlow tests incl. the five named ones |

## What changed

- `step3Folds.tsx` owns fold presence, order (FOLD_ORDER), titles, previews (foldCopy + `joinPreview`), ⓘ and bodies. Bodies are elements, so a closed fold computes nothing until opened. The D-56 settled/debounced memo in the screen is untouched; `busy` and `setbackResultIds` (settled inputs) are passed in.
- Investment fold 7 (`InvestGrowBody`): projection sentence from `expectedReturnProjection`, or the no-return line with a 44-hit "Amount and schedule" link calling `goToStep(2)` (step 2 already opens the selected method card, 05-84), or "Too large to project at this rate".
- The screen keeps `chosenFold` and derives the open key, wraps the FoldList in `RevealTapContext` (value `useFoldHint(rc.userId).dismiss`), renders `FoldHint` above it, and provides `ScrollIntoViewContext` around the step body.
- `BasisDetailRow` ends with the `provisionalRate` ⓘ (via `InfoTitle`, rule I) when the provisional item is present; the card-minimum press is unchanged.
- `assumptionRows` in AssumptionsSection is now exported so the fold preview counts the same rows the body shows.

## Verification

- `npx jest src/features/decide --silent`: 99 suites, 1428 tests pass.
- `npm run typecheck`: clean. `npm run depcruise`: no violations.
- eslint on `src/features/decide/check`: 0 errors (remaining warnings are pre-existing `require()` / duplicate-import in test files).
- Not run: `npm run lint` over the repo and `npm run test:coverage`.
- No copy was added, so the DCU-09 guard is unchanged.

## Deviations from Plan

**1. [Rule 3 - Blocking] Component wrapper instead of calling the hook in the screen.** `CheckFlowScreen` returns early before `computation` and `source` exist, and `useStep3Folds` calls `useInfoSheet` seven times; calling it in the screen body would break the rules of hooks. `Step3FoldList` calls it. `useStep3Folds` is still exported.

**2. Scroll-on-open uses the context only.** The plan suggested `onOpened(key, rowY)` plus the list's measured offset. FoldList already calls `scrollIntoView(rowNode)` from the opened body's layout, so the screen measures the row against the ScrollView's inner view (`getInnerViewRef`, read through a cast because the bundled types only declare `getInnerViewNode`) and `onOpened` is not wired. This also serves the step 2 method cards.

**3. Tests outside the listed files.** `investingInstead.test.tsx` (two tests asserted the section on step 4: one now asserts it is absent, the other renders the section directly and a new test keeps the "Kept never mentions fees" check on step 4). The `InvestingInsteadSection` wrapper is left in place because its tests use it; it is no longer rendered by the app.

**4. Setbacks preview fallback.** `setbacksPreview` has no wording for a finite runway with no months lost, so that case keeps the old `decide.section.setbacksSummary` ("Runway {n} months") via a `ref`.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-74 (not added by me; the file is shared). Check on the Pixel and iPhone XR: a warning check opens with What breaks and two full warning rows above the bar (DCU-11 frame 2: y <= 695.5 at 402x874); opening a fold whose row sits above the viewport scrolls it 12 below the header (animated, instant under reduce motion); scroll-on-open for a step 2 method card; the hint shows once per device and the first fold tap removes it; the provisional-rate ⓘ at the end of the basis row; on an investment check fold 7 reads "What it could grow to" and the link opens step 2 with the card open. The scroll code (`measureLayout` against `getInnerViewRef`) is not exercised in jest.

## Self-Check: PASSED
