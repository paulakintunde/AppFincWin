---
phase: 05-decide-ui
plan: 36
subsystem: decide-ui
tags: [decide, ui, a11y, primitives]
requires: [05-10, 05-31]
provides: [ConfidenceChip, EdgeTag, CombineToggle, GoalProgress]
affects: [05-13, 05-30, 05-41, 05-46, 05-47]
key-files:
  created:
    - src/features/decide/ui/ConfidenceChip.tsx
    - src/features/decide/ui/EdgeTag.tsx
    - src/features/decide/ui/CombineToggle.tsx
    - src/features/decide/ui/GoalProgress.tsx
    - src/features/decide/ui/__tests__/depthPrimitives.test.tsx
metrics:
  tasks: 2
  files: 5
completed: 2026-10-16
---

# Phase 5 Plan 36: Depth primitives Summary

Four token-only depth primitives: a word-labelled confidence chip button, the edge tag pill, a 44-hit combine switch with a selection haptic, and an 8px goal bar carried by caption and accessibilityValue (integer whole percent).

## Commits
- bd8382a feat(05-36): all four components and tests (both tasks together, shared test file)

## Deviations from Plan
- GoalProgress takes `whole: MoneyFormatter` and a `currency` prop (needed to format the caption) and exports `wholePercent` for tests. Unsafe-integer products fall back to 0 percent.
- No engine edits, no migrations.

## Verification
decide/ui jest 39 passed; typecheck clean; lint 0 errors.

## Human/device items
Screen-reader read of the switch and progress bar.

## Self-Check: PASSED
