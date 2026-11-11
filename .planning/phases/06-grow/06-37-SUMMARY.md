---
phase: 06-grow
plan: 37
status: complete
subsystem: grow, decide/snapshot, record/activity
tags: [gap-closure, D-35, D-36, D-37, D-38, gate]
requires: [06-23, 06-24, 06-25, 06-26, 06-27, 06-28, 06-29, 06-30, 06-31, 06-32, 06-33, 06-34, 06-35, 06-36]
provides:
  - Decide reads a debt_id line as a debt payment (D-35)
  - DeletableRow actionWord; Grow rows say Remove (D-37)
  - useGoalLinePay shared by Activity row actions and the record sheet's occurrence actions
  - needsNetConfirm limited to nets created on or before the Grow push (D-36)
  - Activity route ?debt=<id> with a clearable debt chip (D-38)
affects: [06-20 (finalised after the device check), Task 3 of this plan]
tech-stack:
  added: []
  patterns:
    - route-parameter filter held in the view model beside the engine ActivityFilter (no engine change)
key-files:
  created:
    - src/features/grow/goals/goalLine.ts
    - src/features/grow/goals/useGoalLinePay.ts
    - src/features/record/activity/debtFilter.ts
    - src/features/record/activity/__tests__/debtFilter.test.ts
  modified:
    - src/features/decide/snapshot/v3/buildV3Inputs.ts
    - src/features/decide/snapshot/buildSnapshot.ts
    - src/features/decide/snapshot/v3/__tests__/debtOneOffCounted.test.ts
    - src/features/decide/ui/DeletableRow.tsx
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/home/GoalRow.tsx
    - src/features/grow/investing/InvestingSegment.tsx
    - src/features/grow/goals/useGoalsRead.ts
    - src/features/grow/debts/DebtDetailScreen.tsx
    - src/features/record/activity/useRowActions.ts
    - src/features/record/activity/useActivityViewModel.ts
    - src/features/record/activity/ActivityScreen.tsx
    - src/features/record/activity/header/activeFilters.ts
    - src/features/record/entry/OccurrenceActions.tsx
    - app/(app)/(tabs)/activity.tsx
    - src/i18n/locales/en.ts
decisions:
  - D-35 applies to an outgoing single line with debt_id (role debt_payment); an incoming debt-tagged line keeps its old role.
  - Goal line with its goal not loaded shows a new info hint (record.sheet.goalLineNotReady) instead of waiting; there was no existing goal "not ready" copy.
  - The record sheet does not offer "Adjust, then mark paid" for a goal line (it would save status paid through the plain form).
  - The moved-net cutoff counts the whole minute 04:03Z as "on or before"; an unreadable created_at counts as after.
  - The debt filter is month-scoped like every other Activity filter; it hides projections; with the debt not loaded it matches only lines tagged with debt_id and the chip reads "Debt".
  - DebtsModel.focus is kept: DebtsSegment still reads focus.id to pick the "Record calculator" row.
metrics:
  completed: 2026-11-10 (owner approved the Pixel 9 device check)
  tasks: "Tasks 1-3 done"
---

# Phase 6 Plan 37: Gap closure gate

The owner addendum items are built: a one-off debt payment is a debt payment in Decide, Grow rows say Remove, Mark paid on a goal line goes through the goal confirm everywhere, the moved-net sheet is only for nets made before the Grow push, and "See all in Activity" opens Activity filtered to the debt. The local gate is green apart from the cache-version check, which feat/06-grow has already fixed, and two load timeouts in untouched files (see Gate). The owner approved the Pixel 9 device check on 2026-11-10 after the fixes below, and 06-20 is finalised.

## What was built

- **D-35** (`3df83ded`, `f8bf48b8`): `buildV3Inputs` gives an outgoing single line with `debt_id` the role `debt_payment`. `debtOneOffCounted.test.ts` now checks four things. The pending one-off is a debt payment. A paid one-off that carries a category stays out of every category total and out of everyday spending. The month gains exactly one line. An incoming line tagged to a debt is not read as a payment. `SnapshotRow` now names `debt_id`, which the history query already selects. No approved right-answer case moved: `check:right-answers` is clean and the right-answer suites pass.
- **(a) D-37** (`c7685cce`): `DeletableRow` takes an optional `actionWord`, used in the swipe, the ⋯ menu and the confirm button. Goal, holding and debt rows pass `grow.home.rowRemove` ("Remove"). Decide rows keep Delete. No new key was needed.
- **(b)** (`1819dd1a`): the new `useGoalLinePay` holds Grow's confirm and its Undo toast. If the goal has not loaded, nothing is written and an info toast says "This line's goal hasn't loaded yet, so it can't be marked paid. Try again in a moment." Both cases are tested: the goals are still loading, or the goal is missing from the list.
- **(c)** (`e8caf681`): `OccurrenceActions.tsx` had the bypass. "Mark paid" on a goal Expected line called the plain `markPaid`. It now uses `useGoalLinePay`, and the sheet stays open when the goal is not ready. "Adjust, then mark paid" is hidden for goal lines.
- **(d) D-36** (`851238c5`): `needsNetConfirm` also needs the net's `created_at` to be on or before `NET_MOVED_BY_MIGRATION_AT = '2026-11-07T04:03:00Z'`. Times are normalised for Hermes: the space becomes T and microseconds are trimmed. Tests cover both sides of the cutoff, the Postgres time forms and an unreadable time. 06-32's instant on-screen confirm is unchanged.
- **(e) D-38** (`9544210d`): the Activity route reads `?debt=<id>` and checks it is a uuid. The view model keeps lines that have that `debt_id` or sit on the debt's `series_id` or `extra_series_id`. A chip named after the debt leads the chip row. Removing it (or Clear all) drops the route parameter. The detail screen navigates with `{ pathname: '/activity', params: { debt: id } }`. The engine's `ActivityFilter` is unchanged.
- **Plan Task 1 step 1, `focus`:** not removed. `DebtsSegment.tsx:288` reads `whatIf.focus.id` to choose the "Record calculator" row. Only the debt detail screen stopped reading it in 06-36.

## Gate (local)

These were run on this branch (base 4ba0bbbf plus the 06-37 commits). There was no push and no CI run, as instructed.

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 1446 warnings. All the warnings were already there; the touched files add none new. |
| `npm run depcruise` | no violations (1046 modules, 8151 dependencies) |
| `npm run lint:migrations` | MIGRATION COMPAT OK (79 files, floor 0.1.0); 2 old warnings |
| `npm run check:ignores` | OK |
| `npm run check:cache-version` | **fails on this branch**: "persisted shapes changed". The cause is 06-30 and 06-36 keys.ts edits, not this plan. feat/06-grow already has the fix (c2d5b88d, version 7). The orchestrator re-runs `--update` at merge. 06-37 changes no `src/db` or `src/data/keys.ts` file. |
| `npm run check:money-mirror` | up to date |
| `npm run check:right-answers` | no approved expected block changed |
| advice-word grep on src/features/grow (*.tsx, no tests) | prints nothing |
| `npm run test:coverage`, run 1 | 7 suites failed. All were TransactionSheet suites that hit EnvError, because OccurrenceActions now imports the goal confirm hook. I caused this and fixed it in `12437eab` by mocking `useGoalLinePay`, as those suites already mock their data hooks. |
| `npm run test:coverage`, run 2 | 987 suites passed, 3 skipped, 2 failed; 39784 tests passed, 2 failed, 19 skipped, 7 todo. The 2 failures were 5 s timeouts under load in SampleBanner and useStatementImport.closingBalance. Neither file was touched, both passed in run 1, and both pass alone (7/7). No coverage-threshold failure. Every engine folder is 100%, and decide/snapshot `buildV3Inputs.ts` is 100%. All files: 95.69 / 89.74 / 93.92 / 97.26. |
| jest.config.js and jest.engine.config.js | unchanged |

## Deviations from Plan

1. **[Rule 2] Hint copy for a goal that has not loaded.** The plan pointed to an "existing not ready hint". The only one in en.ts is about the account (`accounts.sheet.notReady`), so I added `record.sheet.goalLineNotReady`.
2. **[Rule 1] "Adjust, then mark paid" is hidden for goal lines** in the record sheet. It is the same bypass as (c).
3. **[Rule 3] `debt_id` added to the `SnapshotRow` type.** Without it the D-35 change does not typecheck.
4. **The `focus` field is kept**, as the plan allows when something still reads it.
5. **[Rule 1] TransactionSheet suites** (`12437eab`): they mock `useGoalLinePay` because OccurrenceActions now uses it.
6. **Cache version:** I bumped it 6 -> 7 (`4935e612`), then reverted that (`691388ae`) on the orchestrator's instruction. It is already bumped on feat/06-grow in `c2d5b88d`. This plan changes nothing that is persisted: no `src/db` or `src/data/keys.ts` edits.
7. **Not done here, by instruction:** push, CI run id, 06-VALIDATION.md rows, the device check, and finalising 06-20.

## Owner questions

1. The record sheet's own Paid/Expected status chips can still save a goal Expected line as paid through the plain form (TransactionSheet edit). Should they be locked for goal lines, or should saving go through the goal confirm?
2. The debt filter covers only the month on screen, like the other filters. Should "See all in Activity" also search every month?
3. D-36 uses `created_at`. A goal made before the push and turned into the net later (Use as my safety net) would still get the moved-net sheet if `net_confirmed_at` is null. Is that acceptable?

## Device check (Task 2, owner, Pixel 9)

Run the plan's Task 2 steps 1-10. Also check these items added in this plan:

1. Grow > Goals, Investing and Debts: swipe a row and open its ⋯ menu. Both say **Remove**, and the confirm button says Remove. Decide's Open checks and Past decisions still say Delete.
2. Debt detail > "See all in Activity": Activity opens with a chip named after the debt. It shows that debt's payment, extra and one-off lines and nothing else. Clear the chip and the whole month is back. Switching months keeps the filter.
3. Activity > open a goal's Expected line > "Mark paid" in the record sheet: the goal grows once and both legs show. "Adjust, then mark paid" is not offered.
4. Use "Use $1,000 once" on a debt, then mark it paid. Decide's This month does not show it as spending in any category, and money out counts it once.
5. Make a fresh net in the app, or use "Use as my safety net" on a new goal: "We moved your safety net here" never appears.
6. Text-fit matrix (402 dp and 320 dp, at 100% and 200%) on the Activity debt chip with a long debt name.

## D-39 follow-up (2026-11-10): the record sheet's Paid chip on a goal line

This answers owner question 1. Commit `188bdddc` changes `TransactionSheet.tsx`, adds one key to `en.ts`, and adds the new suite `TransactionSheet.goalPaid.test.tsx` (7 tests; 4 failed on the old code, then all 7 passed).

- **Paid with nothing else changed:** a goal's Expected line now saves through `useGoalLinePay`. That runs `confirm_goal_contribution` and shows the Undo toast, the same as Mark paid. The goal grows once, and no plain edit is sent. The goal comes from the line's own `goal_id`, or else from its series' `goal_id`.
- **Paid together with other changes** (amount, date, name, note, account, category, a new repeat): nothing is written. An info toast shows `record.sheet.goalLinePaidAlone`: "A goal line is marked paid on its own. Save your other changes first, then choose Paid." The sheet stays open.
  - *Why we block instead of "save as Expected, then confirm":* the edit and the confirm are separate queued writes in WRITE_SCOPE. The version chain does let a confirm follow a successful edit. But an edit can fail or be parked while the confirm still goes through on the old, unedited row. A change to a series' template opens the scope prompt. "This and future" rewrites the row through the series RPC, which does not add to the version chain, so the confirm would then conflict. Blocking writes nothing that could be half-done. It also matches (c), which hid "Adjust, then mark paid" for goal lines.
- **Goal not loaded:** nothing is written, `record.sheet.goalLineNotReady` shows (from the hook), and the sheet stays open.
- **A paid goal line set back to Pending:** this is still allowed, as a plain status patch. I checked that this is correct:
  - A single-line contribution (the goal has no account of its own) is paid by setting `status = 'paid'` and keeping `goal_id`. The RPC's own Undo is exactly `status: 'pending'`, and `goalSaved` adds up only paid lines tagged to the goal. So Pending takes the line out of the goal once, and paying again goes through the confirm.
  - A paired contribution turns into a transfer (`transfer_id` set, `goal_id` null). The sheet opens it as a transfer edit, where the status chips are not shown, so the chips can't unpay it.
  - Activity's own Mark unpaid makes the same plain patch.
- **Lines with no goal, and transfers:** no change. A test covers a plain Expected line marked Paid in the form.
- **Checks:**
  - eslint on the changed files: no errors and no warnings.
  - `npm run typecheck`: exit 0.
  - `npm run depcruise`: no violations.
  - `npm run check:cache-version`: unchanged (version 7).
  - `jest --findRelatedTests` (TransactionSheet, the new test, en.ts): 323 suites passed. 3 shell suites timed out under load and passed when re-run alone (33/33).
  - `jest src/features/record src/features/grow`: 144 suites passed. 3 suites timed out under load (two jest runs were going at once); all passed when re-run alone.

## Device check result (Task 2, 2026-11-10): approved

The owner ran Parts A to C on the Pixel 9 and reported five items. I then checked the phone and the data myself. Every fix below was pushed to feat/06-grow, and CI passed all five jobs on 0f39d52a.

| Found by | Problem | Fix | Commit |
|---|---|---|---|
| Owner (1) | Activity row lines too thin to tell rows apart | Separator 2 px, colour `line4` | 70e068c2 |
| Owner (2) | Debt messages (plan saved, stop, one-off, sale, add, edit, remove) showed no Undo | Mapped the debt toast keys to their undo labels in `UndoToastHost` | ce894b6a |
| Owner (7) | A goal's "Kept in" row could not be tapped | Row opens `NetAccountSheet`; its toast offers Undo | e05b9281 |
| Owner (4) | Could not find the payments list | No change: it is under "Payments" at the bottom of the debt screen | none |
| Owner (5) | "Change" in the payoff plan lands at the top of Debts | Works as built; jumping straight to the plan is offered as a follow-up | none |
| Me | Each save or stop of an extra left one more Expected extra line on its first date (6 duplicates seen) | Migration 20261110000100: `grow_end_series` drops a series that never reached its first date; `save_debt_plan` and `record_debt_sale` re-issued | 77742ef6 |
| Me | A paid one-off did not lower the debt's balance (owner chose: lower it) | Trigger `debt_balance_follows_line` moves the balance by the paid amount (0 to 10^13); unpaid, delete and Undo put it back; debts query invalidated after line writes | af722d55, 0f39d52a |
| Me | Goal form showed the "Locked" helper when "No, Decide can count it" was picked | New `lockHelperNo` copy | 5914a46a |

- Migration 20261110000100 was pushed to production (`cohmcbdfgqmiwykztrdg`) on 2026-11-10, with the owner's approval. The preflight passed and CI `rls` passed first; pgTAP 93 and 95 (24 checks) pass.
- Old test data is not corrected after the fact: the 6 duplicate extra lines and the $1,000 already marked paid. The owner removes Test Visa during cleanup.
- Small follow-ups, not fixed: the "Add a debt" button covers "Use $50 extra"; the payoff figure columns wrap at font scale 1.15; the goal form's first Continue tap only closes the keyboard; a goal can be kept in the same account it is paid from.

## Task 3: 06-20 finalised

06-20-SUMMARY.md is marked complete. Goals cases GL-01, GL-02, GL-03 and GL-05 were approved by the owner on 2026-11-10 (021189fd). GL-04 went back to draft with the owner's note: the next answer should use what is in the net now, and after a withdrawal the app should ask whether to lock the net or leave it unlocked.
