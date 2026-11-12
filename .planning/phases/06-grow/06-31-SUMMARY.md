---
phase: 06-grow
plan: 31
subsystem: grow-home
tags: [grow, goals, D-32, swipe, badges]
requires: [06-26, 06-27, 06-28]
provides: [goals read model pendingByGoal/goalCount/netCounted/netReachesOn/netMonthly, Grow home row actions]
key-files:
  modified:
    - src/features/grow/goals/useGoalsRead.ts
    - src/features/grow/goals/__tests__/useGoalsRead.test.tsx
    - src/features/grow/home/GoalsSegment.tsx
    - src/features/grow/home/GoalRow.tsx
    - src/features/grow/home/SafetyNetCard.tsx
    - src/features/grow/home/ToolsRow.tsx
    - src/features/grow/home/__tests__/GrowHome.test.tsx
    - src/features/grow/goals/GoalPlanEditSheet.tsx
  created:
    - src/features/grow/home/useGoalMoney.ts
requirements-completed: [GRW-01, GRW-02, GRW-03]
completed: 2026-11-10
---

# Phase 6 Plan 31: Grow home D-32 Summary

Grow home now shows honest hero copy, "to confirm" badges, swipe and more-menu actions on goal rows, the safety net date line and tile, no bar for no-target goals, and tiled Tools rows.

## Commits
- bd06ac4f: read model (pendingByGoal, goalCount, netCounted, netReachesOn, plus netMonthly)
- Task 2: Grow home UI (feat(06-31) Grow home badges, row actions, hero label and net date)

## What was built
- Hero: "Saved across N goals and the safety net" / "Saved in the safety net" / plain label without a net; total unchanged (194000 in the LEDGER fixture).
- Slate sClock "N to confirm" badge on goal rows and the net card; spoken label gains "N expected lines to confirm".
- Goal rows wrapped in the shared DeletableRow: Add money, Edit, then the delete option. Delete confirms first, then the "Goal removed" toast with Undo. Net card has no DeletableRow (tested).
- Net card: date line via `cardLine`, blue tint tile, muted "of $X". No-target goals draw no bar. Tools rows use AccTile.

## Deviations from Plan
1. **[Rule 3 - Blocking] Import cycle.** GoalsSegment now mounts NewGoalSheet, which imports GoalPlanEditSheet, which imported `useGoalMoney` from GoalsSegment (depcruise error). Moved `useGoalMoney` to new `home/useGoalMoney.ts` (GoalsSegment re-exports it) and changed one import line in `goals/GoalPlanEditSheet.tsx`. 06-32 should be aware of that one-line change.
2. **Wording of the delete option.** DeletableRow has fixed words ("Delete", "More for {{name}}", "Keep it"). I did NOT add a word prop to DeletableRow, so the plan's `rowRemove` / `rowMoreA11y` keys are unused; the swipe and menu read "Delete" and the confirm sheet uses the shared decide.delete wording, with the goal's remove title/body. A word prop on DeletableRow is the follow-up if "Remove" is required.
3. Model new fields are optional on `GoalsModel` so the many existing test fixtures in other files keep compiling; consumers default them. Added `netMonthly` (needed for the cardLine monthly figure).
4. Row testID `grow-goal-row-<id>` now sits on the content view; the spoken label lives on the swipe wrapper (tests use getByLabelText).

## Missing strings
None.

## Known Stubs
None.
