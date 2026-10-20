---
phase: 05-decide-ui
plan: 49
subsystem: decide-ui
tags: [decide, lines, cushion, missing-rate]
requires: [05-27, 05-37]
provides:
  - Cushion months on the Lines card default tag and the limit editor info line
  - Your month missing-rate state
affects: []
key-files:
  modified:
    - src/features/decide/home/LinesCard.tsx
    - src/features/decide/home/LimitEditorSheet.tsx
    - src/features/decide/home/YourMonthCard.tsx
    - src/features/decide/copy/depthVerdictCopy.ts
    - src/features/decide/home/__tests__/LinesAndMonth.test.tsx
  created:
    - src/features/decide/home/__tests__/homeDepth.test.tsx
key-decisions:
  - "The editor receives an optional `cushion` prop from LinesCard (single prepareContext per source) and shows the default note only while no reserve is typed"
metrics:
  tasks: 2
  completed: 2026-10-20
requirements: [DCU-01, DCU-03, DCU-14, DCU-23]
---

# Phase 5 Plan 49: Decide-home depth touches Summary

The "Cash never below" row now reads "default · {n} months" and its editor adds "The default is {n} months of your costs, {reason}."; Your month shows the missing-rate title and body instead of figures when a rate is absent.

## Behaviour
- LinesCard computes `prepareContext` once per source and passes the cushion (half-months plus steadiness) to the editor. A typed reserve shows no default tag and no default note. The other four rows keep the plain "default" tag.
- YourMonthCard branches on `source.unconverted` before any figure, rendering the dark card with `missingRateCopy` title and body naming the currency.

## Deviations from Plan
- [Rule 3] `monthsText` exported from `depthVerdictCopy.ts` so the card tag formats months identically to `cushionCopy`.
- Existing LinesAndMonth assertions updated for the new tag (4 plain defaults plus "default · 3 months").
- Verified live rather than assumed: the engine reports cushion half-months from the snapshot, so a reserve typed in settings but not yet in the snapshot would still yield months; the editor hides the note whenever a stored reserve exists.

## Verification
home tests 65 green; full jest 527 suites / 16134 passed; typecheck clean; lint 0 errors; depcruise clean.

## Human/device items
None.

## Self-Check: PASSED
