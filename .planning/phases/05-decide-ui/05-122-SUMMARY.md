---
phase: 05-decide-ui
plan: 122
subsystem: data-layer
tags: [tanstack-query, paused-mutations, undo, pots, housing]
requires: [05-119, 05-131]
provides:
  - SavingsGoalRow kind/done_at, insertSavingsGoal, widened patch keys
  - DebtRow is_housing
  - selectPots / usePots
  - useAddPot, useEditPot, useDeletePot, useSetPotDone, useSetDebtHousing
affects: [05-124, 05-127, 05-128, 05-129, 05-130]
key-files:
  created:
    - src/data/mutations/decidePots.ts
    - src/data/mutations/debts.ts
    - src/data/mutations/__tests__/decidePots.test.tsx
    - src/data/mutations/__tests__/debts.test.tsx
  modified:
    - src/db/savingsGoals.ts
    - src/db/debts.ts
    - src/data/queries/decide.ts
    - src/data/keys.ts
    - src/data/mutations/index.ts
requirements-completed: [DCU-36, DCU-38]
completed: 2026-10-24
---

# Phase 5 Plan 122: Pots and debt-housing data layer Summary

Pots (savings_goals, kind 'pot') and the loan housing marker are written through the persisted paused-mutation queue with optimistic cache updates, replay safety and one undo step each. No UI and no catalogue strings were added (05-131's labels are used).

## Commits
- 48f3328f: db modules, selector, query keys, fixture updates
- 3c13772f: mutations, tests, barrel registration

## Exported API for later plans

Query keys (`src/data/keys.ts`): `queryKeys.savingsGoals(userId, householdId)` (unchanged; pots live here, not a new key), `queryKeys.debts(householdId)` (unchanged). Mutation keys: `mutationKeys.addPot` `['savings-goals','add']`, `mutationKeys.editPot` `['savings-goals','edit']` (shared by edit, delete, done, reopen), `mutationKeys.setDebtHousing` `['debts','set-housing']`.

Reads (`src/data/queries/decide.ts`):
- `usePots(userId?, householdId?)` returns `UseQueryResult<PotsView>`, selected from the savings goals key. `PotsView = { live, plain, wait, done }`: `live` = not deleted and not done (both kinds, oldest first); `plain` = live kind 'pot' (the 50-pot cap counts these); `wait` = live kind 'wait'; `done` = done and not deleted, newest first.
- `selectPots(rows)` pure selector. `useSavingsGoals` still returns the raw live rows (done rows included), which is what the snapshot builder (05-124) should filter on `done_at == null`.

Writes (`src/data/mutations/decidePots.ts`, all return the undo step id for the toast):
- `useAddPot().add({ householdId, ownerId, pot: { name, currency, target, ready_by, opening_saved } })` returns `{ id, stepId }`. `ready_by` is a date (last day of the chosen month, per R18.2).
- `useEditPot().edit(row, patch)` where patch is `name | target | ready_by | opening_saved` only. Throws RangeError on an empty patch, a Wait goal, or `deleted_at`/`done_at` keys.
- `useDeletePot().remove(row)` soft delete, label potDeleted. Throws for a Wait goal (it goes with its decision).
- `useSetPotDone().setDone(row, done)` labels potDone / potReopened; allowed for both kinds.
- `registerDecidePotMutations(qc)` is called from `registerMutationDefaults`.

`src/data/mutations/debts.ts`: `useSetDebtHousing().setHousing(debt, isHousing, ownerId)` (RangeError for a card), `registerDebtMutations(qc)`.

DB (`src/db/savingsGoals.ts`): `SavingsGoalRow` + `kind`, `done_at`; `NewPot`, `SavingsGoalPatch`, `SAVINGS_GOAL_INSERT_KEYS`, `SAVINGS_GOAL_PATCH_KEYS`, `insertSavingsGoal` (pots only, 23505 read back). `src/db/debts.ts`: `is_housing` in row, `DEBT_COLUMNS`, `DebtPatch`, `DEBT_PATCH_KEYS` (not in insert keys).

## Verify
- `npx jest src/db src/data`: 84 suites, 1075 tests pass (named D-101 / D-103 tests included)
- `npm run typecheck`: no errors in src/db or src/data. Remaining errors elsewhere come from other executors' in-flight engine work (WarningCode 'housing', DecideLimits.housingLine, DecideSnapshot.housingMonthly).
- `npx eslint src/db src/data`: 0 errors (16 pre-existing fast-check warnings)
- `npm run depcruise`: no violations

## Deviations from Plan
**[Rule 3 - Blocking] Existing code and fixtures updated for the new required columns.** `decideLinks.ts` (optimistic card debt: `is_housing: false`), `decideOutcome.ts` (optimistic Wait goal: `kind: 'wait', done_at: null`), and test fixtures in decideChecks, decideLinks, debtsLinksPeriods, savingsGoals tests and `past/__tests__/helpers/pastFixtures.ts`.
**[Rule 3] `src/data/keys.ts` edited** to add the three mutation keys (not in the plan's file list).
**Test change:** the old "exports no insert function" guard in savingsGoals.test.ts now asserts the single `insertSavingsGoal` export.
Client-side guards added beyond the plan text (match the 05-119 DB guards): Wait goals cannot be edited or deleted from `useEditPot`/`useDeletePot`; `insertSavingsGoal` refuses kind 'wait'; pot values are range-checked (name 1-80, target 1 to 10^13, opening_saved >= 0, ready_by a date).

## Decisions / notes
- The Pots screen reads one cache (savings goals key) for pots, Wait goals and done rows; done is a field, not a separate query.
- `ownerId` is a parameter of `setHousing` because DebtRow has no created_by; callers pass the record-context user id.
- Device item: 05-EXECUTION-NOTES entry 05-122 (already present).

## Self-Check: PASSED
