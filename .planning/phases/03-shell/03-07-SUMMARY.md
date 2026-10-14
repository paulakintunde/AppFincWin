---
phase: 03-shell
plan: 07
subsystem: shell
tags: [fab, haptics, a11y, reanimated]
requires: [03-01, 03-03, 03-04, 03-05, 03-06]
provides:
  - FabProvider, useFab, useRegisterFab, useProvideDefaultFabAction, useProvideQuickAction, useHideFab
  - useFabOffsets, useToastSlot
  - Fab component
key-files:
  created:
    - src/shell/fab/FabProvider.tsx
    - src/shell/fab/useShellPositions.ts
    - src/shell/fab/Fab.tsx
    - src/shell/fab/__tests__/FabProvider.test.tsx
    - src/shell/fab/__tests__/useShellPositions.test.tsx
    - src/shell/fab/__tests__/Fab.test.tsx
metrics:
  tasks: 2
  completed: 2026-10-13
---

# Phase 3 Plan 07: Floating action button Summary

Context-aware FAB: screens register label and action (default 'Add' / 'Add a transaction'), visibility comes from `shouldHideFab` fed by auth, back history, the sheet stack and reference-counted hide reasons, quick actions double as named screen-reader actions, and the button rises in and lifts above an app-layer toast.

## Commits
- b1502a0 FabProvider and shell position hooks
- a016264 Fab component

## Deviations from Plan
- Added `testID="fab-wrapper"` to the animated wrapper so the position and lift tests can read it (the tree parent chain was not stable enough).
- Test mocks use `Location.depth` (required by the 03-06 type) for outer locations.
- Test probe stores the context in a holder object via effect (react-hooks/globals forbids assigning an outer variable during render).
- Lift test uses `jest.advanceTimersByTime` because Reanimated's `advanceAnimationByTime` is deprecated.

## Verification
`npx tsc --noEmit` clean; eslint clean on src/shell/fab; `jest src/shell/fab` passes (4 suites); no hex or rgba literal in Fab.tsx; no 96/104 literals in useShellPositions.ts.

## Known Stubs
None. Mounting is 03-13; real default and quick actions are wired in 03-15.

## Self-Check: PASSED
