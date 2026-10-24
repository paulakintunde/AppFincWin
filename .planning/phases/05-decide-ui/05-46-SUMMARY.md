---
phase: 05-decide-ui
plan: 46
subsystem: decide-ui
tags: [decide, step5, cooling-off, savings-goal, written-lines]
requires: [05-12, 05-17, 05-36, 05-37, 05-39]
provides:
  - writtenLines goal and cooling-off lines
  - Step 5 cooling-off toggle, Wait goal preview, decided-goal progress
affects: []
key-files:
  modified:
    - src/features/decide/check/writtenLines.ts
    - src/features/decide/check/steps/Step5Decision.tsx
    - src/features/decide/check/__tests__/writtenLines.test.ts
    - src/features/decide/check/steps/__tests__/Step5Decision.test.tsx
  created:
    - src/features/decide/check/steps/__tests__/step5Depth.test.tsx
key-decisions:
  - "Goal progress hooks live in a child component rendered only for a decided Waiting check, so an undecided step 5 needs no data providers"
metrics:
  tasks: 2
  completed: 2026-10-16
requirements: [DCU-07, DCU-21, DCU-22]
---

# Phase 5 Plan 46: Cooling-off and Wait goal Summary

Step 5 offers "Check again in 48 hours" (off by default) only when the purchase size is needs_spreading, previews the Wait savings goal with a bar at zero, and shows a decided Waiting check's goal progress from its tagged transfers; `writtenLines` lists the goal (target > 0) and the reminder (needs_spreading and coolingOff, any outcome, last) by the same rules the write uses.

## Behaviour
- writtenLines: Wait with `waitPlan.target > 0` adds `decide.depth.goal.written` (or `writtenNoDate`) after the target line and before the reminder; target 0 adds none. Cooling-off line appended last for any chosen outcome. The card payoff series line (`writtenCardPayoff`) already existed from 05-17/05-20; its test was renamed to "a card paid over months lists its payment series".
- Step5Decision: new optional props `checkId` and `checkStatus` (flow shell supplies them for a decided check). Toggle is disabled when read-only. The goal progress shows only on step 5, never on an Open checks row.

## Deviations from Plan
- [Rule 3] Step5Decision.test.tsx gained jest.mock lines for the three data modules, since step 5 now imports hooks that pull in the Supabase client (env validation throws in tests).
- The existing 05-17 Wait tests were updated (a goal line now appears for target > 0, as the plan requires).
- Past decisions / detail sheet goal progress belongs to other plans; only step 5 was in this plan's files.

## Verification
decide folder jest 50 suites / 767 tests green; typecheck clean; lint 0 errors; depcruise clean. Phase 4 gate passed. No engine edits; no migrations.

## Human/device items
Wait panel with goal preview and cooling-off toggle at 402x874 and large font; TalkBack on the switch row.

## Self-Check: PASSED
