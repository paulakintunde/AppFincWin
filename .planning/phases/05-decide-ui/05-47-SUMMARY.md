---
phase: 05-decide-ui
plan: 47
subsystem: decide-ui
tags: [decide, past-decisions, savings-goal, transfer-tagging]
requires: [05-12, 05-22, 05-34, 05-36, 05-37, 05-39]
provides:
  - AttachLineSheet transfer mode
  - Tag a transfer and untag from the Past decisions detail sheet, each one undo step
affects: []
key-files:
  created:
    - src/features/decide/past/goalTagEdit.ts
    - src/shell/decide/GoalTagEditProvider.tsx
    - src/features/decide/past/__tests__/goalTagging.test.tsx
  modified:
    - src/features/decide/past/AttachLineSheet.tsx
    - src/features/decide/past/DecisionDetailSheet.tsx
    - app/(app)/decide/past.tsx
    - src/features/decide/past/__tests__/DecisionDetailSheet.test.tsx
    - src/features/decide/past/__tests__/PastDecisionsScreen.test.tsx
key-decisions:
  - "The goal_id edit is injected through GoalTagEditContext (provided by the Past decisions route) because depcruise fx-fetch-never-from-reads forbids anything in features/decide reaching src/data/mutations/transactions.ts"
metrics:
  tasks: 2
  completed: 2026-10-20
requirements: [DCU-07, DCU-21]
---

# Phase 5 Plan 47: Savings-goal progress and transfer tagging Summary

A Waiting decision's detail sheet shows its goal progress, a "Tag a transfer" pill that lists untagged money-in transfer legs from the last 90 days, and its tagged transfers with a 44px untag control; tagging and untagging are undoable `goal_id` edits with toasts.

## Behaviour
- Task 1: row progress (GoalProgress under the sub-line for Waiting only, "Waiting for a rate" when a tagged line has no stored stamp) was already in place from 05-22/05-39 via `goalByCheck` + `goalLines` + `savedSoFar`; this plan added the covering tests rather than a second `goalsByCheck` map.
- Task 2: `AttachLineSheet` takes `mode: 'line' | 'transfer'` (union props; default unchanged). Transfer mode filters live legs with `transfer_id`, positive `original_amount`, no `goal_id`; empty text is `decide.depth.goal.tagEmpty`. Tag/untag call the injected edit with `labelKey` transferTagged/transferUntagged and `before` goal_id; toast carries the stepId only when an undo step was recorded.

## Deviations from Plan
- [Rule 3] Plan key link said the sheet calls `useEditTransaction` from `src/data/mutations/transactions.ts`. Importing it from features/decide fails depcruise (`fx-fetch-never-from-reads`, transactions.ts reaches fxResolve). Added `goalTagEdit.ts` (context in features/decide) and `src/shell/decide/GoalTagEditProvider.tsx` mounted in `app/(app)/decide/past.tsx`. Behaviour is as planned.
- Task 1 needed no hook change (see above).

## Verification
- `npx jest src/features/decide/past` 23 tests green; engineBarrel 51 green; typecheck clean; lint 0 errors (717 warnings, unchanged); depcruise clean.
- No engine edits, no migrations.

## Device items
- Tag a transfer sheet and untag 'x' on the Pixel (44px target, TalkBack names), Undo from the toast.

## Self-Check: PASSED
