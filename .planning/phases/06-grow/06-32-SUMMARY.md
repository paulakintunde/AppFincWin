---
phase: 06-grow
plan: 32
subsystem: grow-goals
tags: [grow, goals, safety-net, D-32, crud]
requires: [06-26, 06-27, 06-29]
provides:
  - shared GoalHistoryCard + goalHistoryOf (goal detail and safety net)
  - useGoalRecordDetail (Activity's TransactionDetailSheet and row actions from Grow)
  - NetAccountSheet (change the safety net's account)
  - DateField renderTrigger (chip opener)
key-files:
  created:
    - src/features/grow/goals/GoalHistory.tsx
    - src/features/grow/goals/useGoalRecordDetail.tsx
    - src/features/grow/safetyNet/NetAccountSheet.tsx
  modified:
    - src/data/mutations/growGoals.ts
    - src/data/mutations/__tests__/growGoals.test.tsx
    - src/features/grow/goals/GoalDetailScreen.tsx
    - src/features/grow/goals/MoneyMoveSheet.tsx
    - src/features/grow/goals/__tests__/goalScreens.test.tsx
    - src/features/grow/safetyNet/SafetyNetScreen.tsx
    - src/features/grow/safetyNet/__tests__/safetyNetScreens.test.tsx
    - src/features/record/entry/pickers/DateField.tsx
    - src/i18n/locales/en.ts
decisions:
  - "Expected history lists every line dated today or before (each waits for a confirm) plus only the next one after today"
  - "Inline Confirm shows only on waiting lines (dated today or before); a future Expected row still opens the confirm sheet from its text"
  - "Goal and net history share one component; the History header sits above the card on both screens"
  - "Plan card amounts show whole units when the amount is whole for the currency's exponent (GD3)"
requirements-completed: [GRW-01, GRW-02, GRW-03]
completed: 2026-11-10
---

# Phase 6 Plan 32: Goal detail and safety net editing (D-32) Summary

Goal and safety-net history rows now read date / source / amount, open Activity's record sheet when paid, and confirm waiting Expected lines in one tap; the safety net's account can change and the kept-in account's rate is two taps from Grow. The "starts confirmed" fix is client-only so far: see Owner decision.

## Commits

- 794fddc5 fix(06-32): a safety net made in the app starts confirmed
- e9d01b17 feat(06-32): goal history opens records, one-tap Confirm, detail polish (D-32)
- b6c0ee5a feat(06-32): safety net account and rate rows, history records (D-32)

## What was built

- **Task 1:** the optimistic row of a flagged insert carries `net_confirmed_at = now` (a plain goal stays null). Test: `buildGoalsModel` gives `needsNetConfirm: false` for the new net.
- **Task 2 (goal detail):**
  - `GoalHistoryCard`: Row with label = date, sublabel = "Starting amount" / "From {account}" / "Back to {account}", value = amount.
  - Expected rows: one Expected badge, no "· Expected" in the text, only the next future month.
  - Paid rows: a chevron, and they open `TransactionDetailSheet` through `useGoalRecordDetail`. That hook uses Activity's `useRowActions` and `useRowFlow`, so a transfer leg deletes both legs with Undo, and edit and clone work as they do in Activity. The counterpart account comes from `useTransferLegs`. The start row stays plain text.
  - Waiting Expected rows have an inline secondary "Confirm" Pill: one `useConfirmGoalContribution` call, then the toast with Undo, and no sheet. Tapping the row text opens the confirm sheet, titled "Confirm $50 on {date}".
  - Empty history: the "Add money" action, which opens MoneyMoveSheet.
  - Plan card: "$200", not "$200.00" (GD3). "Remove goal" is left-aligned (GD4).
  - MoneyMoveSheet: the net titles ("Add to the safety net" / "Take from the safety net") and two chips, Today and Pick a date. The picked day shows on the second chip (N3).
- **Task 3 (safety net):**
  - "Kept in" is a chevron row (label "Kept in {account}. Change the account.").
  - `NetAccountSheet` ("Where is it kept?") lists live accounts in the net's currency. Save stays off until a different account is picked, and sends `useEditGoal(net, { account_id }, …)` only. The toast says "Now kept in {account}." with Undo (`goalEdited`).
  - "Interest a year · 4.1%" appears on the net screen and on goal detail when the kept-in account has `interest_rate`, and opens `/accounts/[id]`. There is no row when the rate is null or empty.
  - History uses the shared card, with the header above it (N1).
  - "What it covers" uses `sheetTitle` (N2).
  - "Add money" is secondary on both screens (N4, D-34).
- **en.ts:**
  - Added `grow.goals.detail.interestValue` ('{{rate}}%').
  - Removed `historyRow` and `historyStart`, which are now unused.
  - Kept `historyExpected`: `DebtDetailScreen.tsx:195` still reads it.

## Verification

- `npx jest src/data/mutations/__tests__/growGoals`: 31 passed.
- `npx jest src/features/grow`: 33 suites, 1804 tests passed.
- `npx jest src/features/record/entry/pickers` (DateField) and copyLint: passed.
- `npx jest --findRelatedTests` on DateField / en.ts / growGoals.ts: 325 suites run, 29715 passed. One failure, `record/samples/SampleBanner.test.tsx`, passes alone (5/5) and does not touch any file changed here. It looks like a timing flake under the full parallel load.
- `npm run typecheck`: clean. `npm run depcruise`: no violations (1042 modules).
- eslint on the changed files: 0 errors (test-file `require` warnings follow the existing pattern). `npm run lint` across the repo had 1 error before the last fix. It was the React Compiler memo error in SafetyNetScreen, which I introduced and fixed by moving the line filter into `useGoalRecordDetail`. The changed files now lint with 0 errors.

## Deviations from Plan

1. **[Rule 4-type finding, not fixed] The server half of "starts confirmed" is missing.**
   - Nets made in the app are created through the `save_goal_plan` RPC, not through a direct insert.
   - That RPC keeps its own key list, which has no `net_confirmed_at`, and its insert does not set the column. Migration 20261106000400 only granted the column for direct inserts and re-issued `set_safety_net`.
   - The client's `GOAL_PLAN_GOAL_KEYS` (`src/db/goalPlan.ts`, owned by 06-30) also throws on an unknown key.
   - So the insert payload cannot carry `net_confirmed_at`. Only the optimistic row does. After the save's refetch the server row reads null again, and the first-open sheet can still show for a net made in Grow.
   - A follow-up `useConfirmSafetyNet` patch was rejected. It bumps the goal's version and so breaks the server-built Undo of the new net, which holds an exact `expectedVersion`.
   - See Owner decision.
2. **[Rule 3] New shared files** `GoalHistory.tsx` and `useGoalRecordDetail.tsx`, which are not in files_modified. Both screens need the same rows and the same record wiring, and one copy avoids drift.
3. **[Rule 3] `DateField` gained an optional `renderTrigger`.** It is in record/entry and not in the list, and the change is additive. It is used for the Pick a date chip, so the time-zone-safe picker logic is not duplicated.
4. **The insert payload was not changed** (see 1). The plan's acceptance grep still passes: the create path now reads `net_confirmed_at: flag ? now : null`.
5. **TDD order:** Tasks 2 and 3 tests were written with the code, not committed RED first. Task 1 was RED, then GREEN, in one commit.

## Owner decision

- **Safety net made in the app still shows "We moved your safety net here" after the refetch.** The full fix needs a small additive migration. It would re-issue `save_goal_plan` so that an insert with `is_safety_net` true sets `net_confirmed_at = now()`, and 06-30 or a later plan would add the key to `GOAL_PLAN_GOAL_KEYS` if the client should send it. That is a third production push, under the same stop rules as 06-29. The alternative is to accept the one-time "Looks right" tap for nets made in the app.

## Known Stubs

None.

## Threat Flags

None. All writes reuse existing hooks: confirm_goal_contribution, useEditGoal with its EDITABLE_KEYS guard, and Activity's delete-both-legs.
