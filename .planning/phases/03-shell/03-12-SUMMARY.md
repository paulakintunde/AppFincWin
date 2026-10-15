---
phase: 03-shell
plan: 12
subsystem: shell
tags: [fab, quick-menu, sheet]
requires: [03-04, 03-05, 03-07, 03-09]
provides: [FabQuickMenu]
key-files:
  created:
    - src/shell/fab/FabQuickMenu.tsx
    - src/shell/fab/__tests__/FabQuickMenu.test.tsx
metrics:
  tasks: 1
  completed: 2026-10-13
---

# Phase 3 Plan 12: FAB Quick Menu Summary

FabQuickMenu: a 'Quick add' app Sheet listing registered quick actions in D-11 order; choosing one closes the menu and runs the action on the next animation frame.

## Task 1 (commit f0af338)
- `FabQuickMenu` uses `useFab()` quickActions/quickMenuOpen/closeQuickMenu, `Sheet`, `SheetHeader`, and `Row` (Row already has role button and a 44px minimum height, so no Pressable wrapper was needed).
- 5 tests: closed renders nothing; order and button role; close-then-run-next-frame exactly once; backdrop dismiss runs nothing; sheet label and Cancel.

## Deviations
None. No rise-duration override was added (one Sheet behaviour for all).

## Notes
- `tsc` reports only the known environmental `expo-blur` error in TabBar.tsx. ESLint is clean.
- In the full `src/shell/fab` run, `Fab.test.tsx` "renders nothing when hidden" hit the 5s timeout under heavy parallel load (cold start, 6 suites at once). It is a pre-existing file untouched by this plan, so I left it alone. All other tests, including the 5 new ones, passed.

## Self-Check: PASSED
