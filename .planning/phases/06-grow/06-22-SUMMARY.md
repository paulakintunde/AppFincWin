---
phase: 06-grow
plan: 22
subsystem: ui
tags: [grow, goals, safety-net, sheets, lock, undo]
requires: ["06-09", "06-12", "06-15", "06-21"]
provides:
  - "app/(app)/grow/goal/[id].tsx and GoalDetailScreen (G02)"
  - "MoneyMoveSheet (G02a, D-08), exported for the safety-net screen (06-16)"
  - "ReachedMoment, GoalPlanEditSheet, NewGoalSheet (G03, D-23), UseAsSafetyNetSheet (D-29)"
  - "useGoalToast, goalPlanModel helpers"
affects: [06-16, 06-20]
key-files:
  created:
    - app/(app)/grow/goal/[id].tsx
    - src/features/grow/goals/GoalDetailScreen.tsx
    - src/features/grow/goals/MoneyMoveSheet.tsx
    - src/features/grow/goals/ReachedMoment.tsx
    - src/features/grow/goals/GoalPlanEditSheet.tsx
    - src/features/grow/goals/NewGoalSheet.tsx
    - src/features/grow/goals/UseAsSafetyNetSheet.tsx
    - src/features/grow/goals/goalPlanModel.ts
    - src/features/grow/goals/useGoalToast.ts
    - src/features/grow/goals/__tests__/goalScreens.test.tsx
    - src/features/grow/goals/__tests__/newGoalSheet.test.tsx
    - src/features/grow/goals/__tests__/useAsSafetyNet.test.tsx
  modified:
    - app/(app)/_layout.tsx
    - src/features/grow/home/GrowHome.tsx
    - src/features/grow/home/__tests__/GrowHome.test.tsx
    - src/features/grow/goals/useGoalsRead.ts
key-decisions:
  - "Goal toasts go through one useGoalToast hook: it shows the message, and Undo replays the step the 06-12 hook recorded and then calls refreshGoalReads. Screens pass the registry label only to replay, never a label key of their own."
  - "Plan maths uses the same anchor as the Grow home (first of next month); the monthly record's first date is the next 16th."
requirements-completed: [GRW-01, GRW-02, GRW-03]
completed: 2026-11-06
---

# Phase 6 Plan 22: Goal screens Summary

Goal detail, money moves with the Decide-effect confirm, the one reached moment, the new-goal sheet with the unanswered lock question, and "Use as my safety net" with a plain-words confirm and one Undo.

## Tasks

| Task | Commit |
|------|--------|
| 1 Goal route, detail, money sheet, withdrawal confirm, reached moment | c37b580d |
| 2 New goal sheet (G03) with the D-23 lock question, mounted on Grow home | b53d0c25 |
| 3 Use as my safety net (D-29) | 0294333c |

Commit 1 does not compile on its own: GoalDetailScreen imports NewGoalSheet and UseAsSafetyNetSheet, which land in commits 2 and 3. The three together typecheck.

## What was built

- Goal detail: saved and "of target", a thick bar, Locked badge plus "Decide keeps $640 out of every answer.", the Plan group (Each month, Reaches), the line card (Kept in, "Automatic ... recorded for you to confirm"), Add money / Take some out, History (Expected rows carry a slate clock badge; tapping one confirms through useConfirmGoalContribution), the "From a Decide check" card, a lock switch, the Use as my safety net row, and Remove goal. The safety net's own detail has no Remove and no Use-as-net row.
- Plan edits: "Each month" previews the reach date (75 a month reaches Feb 2028); "Reaches" previews the amount rounded up (Dec 2027 gives $82.86). Saves go through useSaveGoalPlan and hand the goal's live monthly record back, so an edit never stops it.
- MoneyMoveSheet: label follows the amount; taking from a locked goal or the net asks first (Take $200 out in accent / Keep it), light haptic only, no warning haptic.
- ReachedMoment: Reached badge (check plus word), tick drawn once, hapticSuccess once; static tick with Reduce Motion. Mounted only when useMoveGoalMoney reports `reachedTarget`.
- NewGoalSheet: three steps with the step bar, name chips and 8 icon tiles, target or "No set target", linked Each month / By (By typed as MM/YYYY), Kept in and From account rows, record switch, and the lock question with no option preselected; Make goal disabled until answered. Open-ended goals hide By and save target and ready_by as null. Closing mid-way asks Discard this goal?. Edit mode is one page and refuses a target below what is saved. Never sends is_safety_net.
- GrowHome mounts NewGoalSheet against `newGoalOpen` (only change to GrowHome).

## Route registration

The calculators (06-13) and `accounts/[id]` are declared as `Stack.Screen` in `app/(app)/_layout.tsx`, so I followed that convention and added `grow/goal/[id]` outside the Decide gate. Whether an undeclared route would also resolve (06-15's note) was not run on a device. Plans 16-19 that add `grow/safety-net`, `grow/lines`, `grow/debt/[id]`, `grow/holding/[id]` should follow the same convention or confirm a push resolves; I did not add their entries.

## Deviations from Plan

**1. [Design] MoneyInput instead of Keypad** in MoneyMoveSheet and the target fields, because MoneyInput is the tested shared amount field and parses through the app parser. The Keypad component exists if the owner wants the prototype's number pad.

**2. [Rule 3] `toHomeOf` is now exported from useGoalsRead.ts** (one word) so MoneyMoveSheet converts with the same rates as the read model.

**3. [Design] The monthly record's "From" account.** The plan only names "Kept in". A record needs a paid-from account, so step 3 shows a From row when the record switch is on (default: first other account). The record's category is the Transfer category.

**4. GrowHome.test.tsx** now mocks NewGoalSheet (it imports the Supabase client, which needs env) and has one new test that the Goals FAB opens it.

## Missing strings (en.ts untouched; owner or a later plan to add)

- A "Confirm" button for an Expected history row. The confirm sheet uses "Done" (`grow.common.done`) for now.
- "Goal saved" / "Plan changed" wording: edits and money moves use the undo registry's own wording through `undo.label.<key>` toasts.
- "From a Decide check" body line (`fromCheckBody`) needs the check's state, date and leftover, which the goal screen does not read; the card shows the title and links to the check.
- Icon tile spoken names (they read "Icon calendar" etc.) and the By field placeholder "MM/YYYY".
- `grow.home.goalRowNotReached` (just added) is not used here: GoalRow / GoalsSegment were not touched by this plan, so the Grow home still falls back to `goalRowNoMonthly` for that case. Wiring it is a small follow-up in GoalRow.
- Lock switch has no confirmation or "Decide will count $X less" note on unlocking; only the withdrawal path has one (D-08).

## Known Stubs

None. The Debts / Investing add buttons in GrowHome remain no-ops owned by 06-17 / 06-18.

## Verification

- Jest: goalScreens (14), newGoalSheet (12), useAsSafetyNet (6), the whole GrowHome file (15 incl. one new), useGoalsRead, copyLint, all src/theme tests: pass.
- `npm run typecheck`, `npm run depcruise` clean; eslint on src/features/grow/goals, src/features/grow/home, app/(app): 0 errors (warnings are the usual `require()` mocks in tests).
- Greps: no `hapticWarning` or `labelKey` in the goals screens; `grow/goal/[id]` once in the layout; `locked: lock === 'yes'` in NewGoalSheet; no `is_safety_net` in NewGoalSheet.
- Not run: full coverage, device check (reduce motion tick, sheet stacking on a phone).

## Self-Check: PASSED
