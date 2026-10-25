---
phase: 05-decide-ui
plan: 10
subsystem: decide-ui-primitives
tags: [decide, ui, primitives, accessibility, tdd]
requires: [05-01, 05-02]
provides:
  - StateChip, FigureStrip, WarningCard, CollapsibleSection (display primitives)
  - StepBar, ChoiceCard, CheckRow, SegmentedToggle (choice primitives)
affects: [05-13, 05-14, 05-15, 05-16, 05-17, 05-21, 05-22, 05-23, 05-24, 05-27, 05-29, 05-30]
key-files:
  created:
    - src/features/decide/ui/StateChip.tsx
    - src/features/decide/ui/FigureStrip.tsx
    - src/features/decide/ui/WarningCard.tsx
    - src/features/decide/ui/CollapsibleSection.tsx
    - src/features/decide/ui/StepBar.tsx
    - src/features/decide/ui/ChoiceCard.tsx
    - src/features/decide/ui/CheckRow.tsx
    - src/features/decide/ui/SegmentedToggle.tsx
    - src/features/decide/ui/__tests__/displayPrimitives.test.tsx
    - src/features/decide/ui/__tests__/choicePrimitives.test.tsx
decisions:
  - StepBar calls onJump only when canEnter(step), else onBlocked; unreached segments are disabled (D-08)
  - Prototype-literal sizes are named consts with UI-SPEC comments; no raw colours
metrics:
  tasks: 2
  files: 10
  completed: 2026-10-16
---

# Phase 5 Plan 10: Decide display and choice primitives Summary

Eight token-only Decide primitives with accessible roles and states: state chip, figure strip (capped at 1.3x, stacks above it), hard/soft warning card, collapsible section, D-08-gated step bar, radio choice card, checkbox row and radiogroup toggle.

## Commits
- 52b70c0: display primitives (Task 1)
- 0dd05ba: choice primitives (Task 2)

## Verification
- `npx jest src/features/decide/ui src/theme`: 67 passed (20 in the two new files); noRawColours green.
- `npm run typecheck` clean; `npm run lint` 0 errors (existing warnings only); no hex/rgba literals and no expo-haptics imports in the new files.

## Deviations from Plan
None. Test note: RNTL events must be awaited here, otherwise a following test in the same file can render nothing.

## Human verification
None required; TalkBack/VoiceOver reading of the primitives is covered later by the screen-level device checks.

## Self-Check: PASSED
