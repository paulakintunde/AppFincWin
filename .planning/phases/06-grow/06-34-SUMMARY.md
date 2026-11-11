---
phase: 06-grow
plan: 34
subsystem: activity
tags: [grow, activity, goals, confirm_goal_contribution]
requirements: [GRW-03]
key-files:
  modified:
    - src/features/record/activity/useRowActions.ts
    - src/features/record/activity/ActivityScreen.tsx
    - src/data/mutations/patches.ts
    - src/features/record/activity/__tests__/useRowActions.test.tsx
  created:
    - src/features/record/activity/__tests__/goalLineMarkPaid.test.tsx
metrics:
  completed: 2026-11-07
---

# Phase 6 Plan 34: Activity goal-line Mark paid Summary

Mark paid on a goal's Expected line in Activity now goes through `confirm_goal_contribution` (via `useConfirmGoalContribution`, the same call Grow's Confirm makes) instead of a plain status patch, so the goal grows once and both legs exist.

## D-32 check result: the bypass existed

Task 1 test run against unchanged code:
- Row Mark paid on a goal line: RED (called `markPaid`, never `confirm`)
- Swipe / detail sheet: RED (all three call `rowActions.pay`; ActivityScreen wires `onMarkPaid`, `onSwipePay` and the detail sheet's `onStatus` to it)
- Bulk Mark paid, goal line plus bill line: RED (goal line was patched with the bill line)
- Plain bill line uses `markPaid`: GREEN (no regression)

## What changed

- `useRowActions.ts`: exported pure `isGoalLine(row, seriesById)` (pending, not a transfer leg, `goal_id` on the row or on its series). `pay` routes goal lines to `confirm`, with the same Undo toast Grow shows (`undo.label.goalContributionConfirmed`, via `useGoalToast`). If the goal is not loaded, nothing is written.
- `patches.ts`: `useBulkMarkPaid` skips rows with `goal_id`; `BulkRow` gains `goal_id`.
- `ActivityScreen.tsx` (not in the plan's file list): the bulk handler pre-filters goal lines with `isGoalLine`, so a selection of only goal lines hits the existing "nothing to mark" hint rather than a thrown RangeError.
- `useRowActions.test.tsx`: mocks for the three new hooks (suite-level failure otherwise).
- `TransactionDetailSheet` untouched; its props are unchanged.

## Verification

- `npx jest src/features/record/activity src/data/mutations`: 105 suites, all tests passed after the useRowActions test mock fix (re-run of that suite and goalLineMarkPaid: 13 passed).
- `npm run typecheck`, `npm run depcruise`: clean. `npm run lint`: 0 errors (pre-existing warnings).
- `src/features/decide/snapshot/v3` not run: nothing in counting changed; goal lines still confirm through the existing server function, so a contribution stays counted once.

## Deviations

- [Rule 3] Edited `ActivityScreen.tsx` and `useRowActions.test.tsx`, outside the plan's file list, both required for the change to work.

## Notes for the owner

- `OccurrenceActions.tsx` (record/entry) also calls `useMarkPaid` for an occurrence; it was not in scope. If a goal occurrence can open there, it has the same bypass; worth a follow-up.
- T-06-34-02 accepted: an old build can still patch status directly; no server guard added.
- Missing strings: none (reused `undo.label.goalContributionConfirmed`).
- `useRowActions` now calls `useSavingsGoals`, one extra goals query whenever Activity is open.
- Bulk fallback for a goal line whose `goal_id` tag is missing but whose series has one: handled in the Activity screen filter only, not in `patches.ts`.

## Commits

- 29d27e77 test(06-34)
- d0866999 fix(06-34)
