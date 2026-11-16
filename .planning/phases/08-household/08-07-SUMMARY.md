---
phase: 08-household
plan: 07
subsystem: database
tags: [pgtap, privacy, export, ci, household]
requires: [08-01, 08-02, 08-05, 08-06]
provides:
  - pgTAP 101 SC7 two-user privacy suite (147 assertions)
  - EXPORT_MANIFEST carries is_shared, paid_by and the household columns
  - Jest guard tying EXPORT_MANIFEST to the 101 export-tables block
affects: [08-09 onward]
key-files:
  created:
    - supabase/tests/database/101_household_privacy_two_user.test.sql
  modified:
    - src/data/exportManifest.ts
    - src/data/__tests__/exportManifest.test.ts
    - .github/workflows/ci.yml
decisions:
  - 101 drives its per-table checks from VALUES lists (one statement, many assertions) and three invoker helpers (t101_n, t101_probe, t101_same), so a table is one row, not a paragraph
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 07: SC7 two-user privacy suite Summary

Member B, who shares A's household, is tested against A's personal rows on every household table and every read surface; A's shared rows and joint account stay visible; the export manifest now says what is shared and who paid, and a Jest guard keeps every exported table inside the 101 coverage list.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 pgTAP 101 | b61266a9 | 147 assertions, passes (also inside the full run) |
| 2 Manifest, guard, CI note | 1e81222c | exportManifest jest 9/9, eslint clean, ci.yml valid YAML |

## What 101 covers

- Read as B: none of A's rows in 18 owner-only tables and 3 shared-or-owner tables (personal rows); positive controls (2 shared lines, joint account, shared series); statement periods (personal card 0, joint 1, D-43).
- Update (0 rows or no grant) on 17 tables, soft delete (0 rows) on 6, hard delete (no grant) on 6; views `transactions_active` and `statement_periods_live`.
- Definer RPCs: `joint_account_balances` (joint account only, full balance 48000 including A's personal line), `account_balances`, `record_entry_list`, `add_activity_month`, `apply_patches` on 12 entity rows, `apply_undo_step`, `rollback_undo_to`; Grow and 06.1 RPCs `record_debt_one_off`, `record_debt_sale`, `save_debt_plan`, `remove_debt`, `remove_goal`, `save_goal_plan`, `confirm_goal_contribution`, `set_safety_net`, `set_net_answer_use`.
- Export: all 26 manifest tables selected with the manifest's own columns as B, expected counts per table.
- Profiles (no A profile, no email/full_name column on household_members), spoofing (created_by = A refused, line on A's personal account refused), Grow guards (`guard_transaction_debt`, `guard_holding`, `guard_series_goal`), shared series materialise shared lines readable by B, and a closing check that none of A's rows changed version or deleted state.

## Findings (decision needed, not changed here)

08-05's "invisible row is refused like a missing id" holds for transactions, accounts, recurring_series, debts, recurring_dismissals and income_payer_prompts, and for the RPCs record_debt_one_off, record_debt_sale, save_debt_plan, remove_debt, remove_goal, confirm_goal_contribution and set_net_answer_use (101 asserts the identical refusal for each). It does NOT hold for:

- `apply_patches` on another member's savings_goals, holdings, holding_lots, decide_answers, decide_changes, decide_checks: B gets `42501 not writable by the caller`, a missing id gets `conflict not-found`.
- `save_goal_plan` on another member's goal: 42501 "that goal is not yours" vs `{"status":"conflict"}` for a missing id.
- `set_safety_net` on another member's goal: 42501 vs 22023 "that goal does not exist".

Effect: a caller who guesses a random UUID can learn that a row exists. No data or name is returned, nothing is written, and 101 asserts the refusal and (at the end) that nothing of A's changed. The plan text asked for identical refusals on the 08-05 Grow RPCs; for these three the test asserts "refused with 42501" instead, because making them identical means editing the 08-05 migration and changing existing expectations in 55 (two tests) and 92 (two tests). Options for the owner: (a) fix in the 08-05 migration and flip those four expectations, (b) accept the existence signal for random ids (low risk).

Also noted: `account_balances` (security invoker) returns a row for A's personal account when it carries one shared line; the figure counts only that shared line, never A's personal lines (101 asserts -1000, not the personal total). The client should not show a balance for an account it cannot see.

## Deviations from Plan

**1. [Rule 1 - test assumption] B's insert spoofing.** `created_by` has no client insert grant (the session stamps it), so inserting `created_by = A` fails on the column privilege (42501) before any policy runs. 101 asserts the 42501 and states the cause; the positive and guard inserts omit `created_by`.
**2. Assertion count in acceptance.** The plan's `grep -c` >= 60 counts lines; 101 has 61 such lines and 147 executed assertions, because per-table checks come from VALUES lists.
**3. The `-- export-tables` block** lists all 26 manifest keys plus the later-plan tables.

## Verification

- 101 passes alone and in the full `npx supabase db reset && npx supabase test db` (103 files, 2513 tests, Result: PASS).
- `npx jest src/data/__tests__/exportManifest.test.ts` 9/9; eslint clean on the two TS files.

## Known Stubs

None.

## Self-Check: PASSED

## Follow-up fix (2026-11-15)

The relaxed assertions are now strict. In `101_household_privacy_two_user`, apply_patches on A's savings_goals, holdings, holding_lots, decide_answers, decide_changes, decide_checks and recurring_dismissals, `save_goal_plan` and `set_safety_net` are asserted identical to the same call on a missing id (`t101_same`), no longer "42501 or conflict". Flipped in other files: two in `55_decide_patches` plus its decide_checks case (now compared to a missing id), two in `92_grow_goal_plan` (22023 "that goal does not exist" for set_safety_net, conflict identical to a missing goal for save_goal_plan), and one in `69_apply_patches_v3` (decide_answers). 103 needed no change. See 08-05-SUMMARY.md for the migration edits.
