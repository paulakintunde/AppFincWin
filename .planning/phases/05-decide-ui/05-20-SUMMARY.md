---
phase: 05-decide-ui
plan: 20
subsystem: decide-mutations
tags: [decide, mutations, write-queue, undo, offline, go-ahead, wait, pass]
requires: [05-05, 05-07, 05-11, 05-17, 05-19]
provides: [buildGoAheadWrite, registerDecideGoAheadMutations, useGoAhead, registerDecideOutcomeMutations, useWaitAndSave, usePass, coolingOffAt]
affects: [05-21, 05-29]
key-files:
  created:
    - src/data/mutations/decideGoAhead.ts
    - src/data/mutations/decideOutcome.ts
    - src/data/mutations/__tests__/decideGoAhead.test.tsx
    - src/data/mutations/__tests__/decideOutcome.test.tsx
  modified:
    - src/data/mutations/index.ts
requirements-completed: []
---

# Phase 5 Plan 20: Go ahead, Wait and Pass mutations Summary

One undoable multi-write for Go ahead (pure builder from `Plan.paymentSteps`, rows inserted with client ids then `record_decide_go` on the same step id), plus Wait and save (goal in the same call, local reminder that never blocks the save) and Pass, all through the persisted write queue.

## What was built
- **`buildGoAheadWrite`** (pure): cash (one pending expense), loan (day-one row, one series per multi-month payment run, a pending Debt-category row for a one-month run, debt record with `series_id` of the first series, typed `termMonths`, no debt when nothing is financed), instalment (same run mapping, no category), card (pending row on the card account, cash day-one remainder plus `card.fees`, payoff 'months' writes every run including a run of 1 as a role 'payment' Debt series from cash), running costs (monthly series, replaced series ended on the need-by date), investment lump (pending transfer into a same-currency tracked account, else one pending outflow) and monthly (Savings-category series for the term). The decision carries estimates (payment and running stored separately), `broke_line`, `cooling_off` (only for `needs_spreading`) and the `row_roles`/`series_roles`. The word `finalMonthly` is never used.
- **`useGoAhead`**: mints the step id before mutate, insert then `recordDecideGo` with that id, `rowsLanded` guard, optimistic rows and 'bought' mark, invalidation of transactions, series, checks, debts, links, undo log and derived reads; refusal toasts `undo.batchSavedNoUndo` / `undo.batchRefused`; failed-write record `{ checkId, count }`; tracks `decision_recorded` `go`; schedules the 48-hour cooling-off reminder when due.
- **`useWaitAndSave`** (resolves `{ reminder: 'set' | 'off' | 'none' }`) and **`usePass`**: `record_decide_outcome` through the queue, optimistic status ('waiting' / 'passed') and goal, `decision_recorded` `wait` / `pass`, cooling-off reminder for either.
- Both registered in `index.ts`.

## Verification
- `npx jest src/data/mutations --forceExit --silent`: 32 suites, 402 tests pass (new: 30 + 10, including fast-check properties for payment totals and day-one sums).
- `npm run typecheck` clean; `npm run lint` 0 errors; `npm run depcruise` clean. Acceptance greps all satisfied.
- No migrations; pgTAP/DB tests not run (Docker down).

## Deviations from Plan
- `scheduleWaitReminder` and `scheduleCoolingOffReminder` are called through a namespace import (`reminders.`) so the single-occurrence acceptance greps hold; behaviour is identical.
- `useWaitAndSave().save` also takes `currency` (the goal needs it) and `check` is a `Pick` of the check row (id, created_by, household_id, name, inputs); `goAhead` takes `checkId`, `ownerId`, `homeCurrency` beside `inputs`, `assessment`, `running`, `ctx`.
- `buildGoAheadWrite` throws a `TypeError` when a needed category (`debtCategoryId` for loan/card payoff, `savingsCategoryId` for a monthly investment) or the card account is null, rather than writing an uncounted line; callers (05-29) resolve these before confirming. A replaced series whose id is not in `ctx.replacedSeries` (already gone) is skipped.
- Running-cost series use the counted line's full amount (household), as the plan states.
- Wait/Pass failures park a failed-write record (superseded: see the post-plan fix below).
- No engine edits.

## Known Stubs
None.

## Human/device items
None beyond the OS permission prompt for the Wait and cooling-off reminders (covered by 05-11).

## Self-Check: PASSED

## Post-plan fix (user decision 2026-10-16)
A failed Wait or Pass write now shows an error toast (`decide.toast.outcomeFailed`, a refusal toast) after the failed-write record is parked, in the same definitive-failure branch of `onError` that other mutations use. A write paused offline never reaches `onError`, so it shows no toast until it replays and fails for real. Tests in `decideOutcome.test.tsx`. Go ahead already toasted on a definitive failure from 05-20 (`undo.batchRefused` when nothing landed, `undo.batchSavedNoUndo` when the rows landed but `record_decide_go` was refused) and keeps that copy: `decide.toast.outcomeFailed` ("Nothing was changed") would be false in the landed case, because Go ahead is a row insert followed by a separate RPC.

## Post-plan fix (user decision 2026-10-21): Go ahead failures

- Kept Go ahead's existing truthful refusal toasts (see above); did not switch to `decide.toast.outcomeFailed`.
- A definitive Go ahead failure now also cancels the check's reminders (`cancelCheckReminders`): the cooling-off reminder is scheduled at tap time (so it works offline) and would otherwise fire for a check that stayed open.
- Tests (`decideGoAhead.test.tsx`): "a failed Go ahead write shows the failed-save toast and cancels its cooling-off reminder", "a Go ahead queued offline shows no toast".
