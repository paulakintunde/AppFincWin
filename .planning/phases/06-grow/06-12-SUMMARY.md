---
phase: 06-grow
plan: 12
subsystem: data-access
tags: [grow, goals, safety-net, mutations, rpc, write-queue]
requires: ["06-05", "06-06", "06-08", "06-09"]
provides:
  - "src/db/goalPlan.ts: saveGoalPlan, confirmGoalContribution, setSafetyNet RPC wrappers"
  - "src/data/queries/growGoals.ts: useSavingsGoalRows, useGoalLines"
  - "src/features/grow/goals/useGoalsRead.ts: useGoalsRead, buildGoalsModel, GoalsModel"
  - "src/data/mutations/growGoals.ts: registerGrowGoalMutations and six hooks, refreshGoalReads"
affects: [06-13, 06-14, 06-15, 06-16]
key-files:
  created:
    - src/db/goalPlan.ts
    - src/db/__tests__/goalPlan.test.ts
    - src/data/queries/growGoals.ts
    - src/features/grow/goals/useGoalsRead.ts
    - src/features/grow/goals/__tests__/useGoalsRead.test.tsx
    - src/data/mutations/growGoals.ts
    - src/data/mutations/__tests__/growGoals.test.tsx
  modified:
    - src/data/mutations/index.ts
key-decisions:
  - "A new goal's Undo step covers the goal row only (soft delete at version 1); the monthly record's own version is known only after the RPC returns, so it is not in the step."
  - "p_series null stops the live monthly record, so useSaveGoalPlan takes series as a required argument; an edit that leaves the record alone must pass the existing one back."
  - "Take some out on a goal with no account is refused ('goal-has-no-account'): a single tagged line counts its absolute amount in goalSaved, so it could only raise saved."
  - "Edits and removals use the direct version-conditional update (updateSavingsGoal, like pots) rather than apply_patches; same granted columns, same one Undo step."
requirements-completed: [GRW-01, GRW-02, GRW-03]
completed: 2026-11-06
---

# Phase 6 Plan 12: Goal data hooks Summary

RPC wrappers, a goals read model built on the connection points (LEDGER: 194000 saved, 15000 a month) and six queued, undoable goal writes registered for paused-mutation replay.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 RPC wrappers and goals read model | 59c071c3 | 12 db tests, 6 read tests |
| 2 Queued goal mutations with one Undo each | ff8e8e5e | 30 mutation tests |

## What was built

- `saveGoalPlan`, `confirmGoalContribution`, `setSafetyNet`: 'conflict' throws `VersionConflictError`; 'applied', 'already-applied' (and 'unchanged' for the net) are success; unknown status is a bad-response `DbError`. Unknown goal fields are refused before any call.
- `useGoalsRead` returns `{ status, model, refetch, userId, householdId, today }`. `GoalsModel` = safetyNet, goals, totalSaved, monthlyIntoGoals, needsNetConfirm (unconfirmed net with a size or saved money).
- Hooks: `useSaveGoalPlan` (new goal needs `locked: boolean`; the safety-net create passes `is_safety_net: true` with `locked: true`, label `safetyNetSizeSaved`; edits never send the flag), `useEditGoal` (`edit` and `remove`; 'target-below-saved'; net can't be unlocked; size-only net edit uses `safetyNetSizeSaved`), `useMoveGoalMoney` (both legs in one upsert, goal tag on the goal-side leg, returns `reachedTarget` via `goalSaved`), `useConfirmGoalContribution`, `useConfirmSafetyNet`, `useSetSafetyNet` (optimistic swap, exactly one flagged row, both rows roll back on conflict, server-built step).
- `refreshGoalReads(qc, {userId, householdId})` is exported: call it after Undo of any Grow step (set_safety_net steps do not bump row versions).

## Deviations from Plan

**1. [Rule 3] Edits use `updateSavingsGoal`, not `apply_patches`.** Same granted columns and the debts/pots template; no behaviour difference.

**2. [Design] `useEditGoal` returns `{ edit, remove }`** so removal (label `goalRemoved`) shares the key; `edit` takes the goal's current `saved` (goal currency) for the target check.

**3. [Design] Take some out with no goal account is refused** (see key-decisions).

## Open points for later plans

- The Undo of a new goal with a monthly record soft-deletes the goal but leaves the series and its Expected lines; adding a series op needs the series version after `materialise_series`, which the 06-06 contract does not make predictable. 06-21 or a follow-up could end the series on undo. Likewise the pair-undo of a confirmed contribution (delete the new leg, unpair the line and restore status/goal tag at version + 1) is client-built and has not run against pgTAP; it rides on `apply_patches` allowing `status`, `transfer_id` and `goal_id` on transactions (it does).
- No new en.grow strings were needed (hooks carry no copy).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model: T-06-12-01 (client uuids, 'already-applied' success), -02 (both legs in one batch), -03 (field names and ids only in failed-write records), -04 (`locked: boolean` required), -05 (swap and rollback together, tested).

## Verification

- `npx jest` on the three new suites plus registry05_2/05_3 and debtsAddEdit: 34 pass (30 in growGoals).
- `npm run typecheck`, `npm run depcruise`, `npm run check:cache-version` (shapes unchanged, version 4), eslint on changed files: clean (two require-import warnings in the test, same as sibling tests).
- Not run: full coverage (per milestone rule).

## Self-Check: PASSED

Files exist; commits 59c071c3 and ff8e8e5e exist.
