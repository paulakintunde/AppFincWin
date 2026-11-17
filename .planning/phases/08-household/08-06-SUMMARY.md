---
phase: 08-household
plan: 06
subsystem: database
tags: [pgtap, rls, household, tests]
requires: [08-01, 08-02, 08-05]
provides:
  - existing pgTAP suite green under personal-unless-shared and the is_owner member column
  - 102_household_table_coverage meta-test (every household_id table classified, policies checked per class)
affects: [08-07, 08-10]
key-files:
  created:
    - supabase/tests/database/102_household_table_coverage.test.sql
  modified:
    - 29 existing pgTAP files under supabase/tests/database (listed below)
decisions:
  - Fixture rows that stand for "A's data" carry created_by = A; a fixture that needs another member to write uses a joint account or a shared line
  - Where Phase 8 turned a 42501 refusal into the not-found refusal, the test asserts the new refusal plus that nothing was written
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 06: pgTAP suite under the new household rules Summary

The 20 two-member fixtures moved from `role` to `is_owner`, every expectation that assumed household-wide visibility now asserts the personal-unless-shared rule, nine more files broken by wave 1-2 outside the role fixtures were fixed, and meta-test 102 classifies every `household_id` table.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Role fixtures and visibility expectations | bb1f8cc9 | 22 files |
| 3 Wave 1-2 fallout outside the role fixtures | 8992f01c | 9 files (33, 44, 60, 66, 69, 71, 73, 82, 89) |
| 2 Meta-test 102 | a9b1b53a | 13 assertions |

## Changed expectations (file:test, old -> new, reason)

Mechanical, all 20 files: `(household_id, user_id, role, weight)` and `'member'` -> `(household_id, user_id, is_owner, weight)` and `false` (08-02 members v2).

- 01_household_of_one:7 role = 'owner' -> is_owner = true (08-02); weight 1 -> 100 (signup weight is now 100, D-30); new assertion role_label = 'Owner' (plan 16 -> 17).
- 02_rls_isolation:9 role 'owner' -> is_owner true; weight 1 -> 100 (08-02, D-30).
- 29_undo_log:22 "op on B's row throws 42501" -> apply_patches returns `conflict` with reason `not-found` (08-05, D-14: an invisible row is refused like a missing id). Added a second assertion that a missing id gets the identical refusal. Plan 72 -> 73.
- 29_undo_log:29-32 "A's undo is refused once B has edited the same row" kept as is, but B's edit is now made on a shared line through the household-RPC flag (`fincwin.household_rpc`), because B can no longer see or edit A's personal line (D-12) and cannot edit A's shared line directly (D-14, creator only). The refusal text and updated_by assertions are unchanged.
- 36_account_deletion (all): B's series in A's household now sits on a joint account (A's Savings is made joint) because a member can only use own or joint accounts (08-05, D-13). Deletion assertions unchanged.
- 53_entry_list (all): A's Checking is created joint (`is_shared`) so B's own row in A's household is allowed (08-05, D-13).
- 54_decide_tables:30 period on another household's account: 23503 -> 42501 (statement_periods insert policy now checks the card account, D-43; the refusal is still a refusal).
- 54_decide_tables:32 "B reads A's household debt" 1 -> 0, message "owner-only" (D-12; debts creator-only).
- 54_decide_tables:33 "B reads the household's statement period" 1 -> 0 for A's personal card account (D-43); new assertion that B reads it once the account is joint. Plan 37 -> 38.
- 55_decide_patches:7 "a household member patches a household debt" `applied` -> `conflict` (debts are owner-only, refused like a missing id); new assertion that the creator A still patches their own debt. Plan 23 -> 24.
- 68_decide_new_tables:25 "a household member can read the household's dismissals" (>= 1) -> count = 0 (recurring_dismissals owner-only, D-12).
- 69_apply_patches_v3:30-32 fixture accounts carry created_by (A, C); they were invisible under 08-01.
- 69_apply_patches_v3:37 "another household's dismissal is refused" 42501 -> `applied` as a no-op: a soft delete of an invisible row is treated as "already gone", exactly like a missing id (08-05). New final assertion proves the other household's dismissal is not deleted. Plan 47 -> 48.
- 71_series_end_reason_and_debt_paid_off:41,42 another household writing end_reason / paid_off_on: 42501 -> `conflict` (not-found refusal, D-14).
- 73_series_stop_from_first_day:25,26 another household stopping a series: 42501 -> apply_patches `conflict:not-found` and edit_recurring_series_from `not-found` (D-14); new assertion that the series version is untouched. Plan 26 -> 27.
- 76_undo_skips_undone_steps:12,13,17 (cases 5 and 9, "another member writes the row"): the vehicle changed from debts to two joint accounts, because B can no longer write A's debt (D-12). Same assertions on the undo-skip logic.
- 33_transfer_pairs:11,17 claims cleared before the superuser fixture accounts so they are B's own and the 08-05 account guard does not pre-empt the pair trigger under test.
- 44_record_polish_patches, 60, 66, 69, 82, 89: fixture accounts and series now carry created_by (08-01: rows with null created_by are invisible). No assertion changed.

Not weakened: 91 (B sees none of A's holdings), 92 (B acts only on B's goals), 97 (D-20 "another household member cannot flip A's net" and history 0 rows), 58 and every Decide owner-private assertion are untouched apart from the fixture column.

## Meta-test 102

13 assertions: unclassified `household_id` tables (RESEARCH Pitfall 1), select/all policies on owner and shared-or-owner tables name created_by/owner_id/user_id, every such table has a select-capable policy, shared-or-owner policies mention is_shared, statement_periods derives from accounts, later tables pre-listed (rows filtered by `to_regclass`), RLS on for every classified table and for every `household_id` table, `decide_check_history` owner-only through created_by, `debt_line_applied` RLS on with no policy and no grant.

## Verification

Per-file runs through psql in the db container: all 31 touched files and 102 pass. Final full `npx supabase db reset && npx supabase test db` result is recorded in the wave report.

## Deviations from Plan

None to the plan's intent. Two notes: Task 3 was committed before Task 2 (order in git: 1, 3, 2); the 01/02 weight assertions moved to 100, not only `role`.

## Self-Check: PASSED
