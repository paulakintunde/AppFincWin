---
phase: 08-household
plan: 05
subsystem: database
tags: [rls, security-definer, privacy, household, pgtap]
requires: [08-01]
provides:
  - apply_patches v4 (invisible rows refused as missing; D-14 payer/creator rule)
  - shared-or-owner scope in undo_adjusted_ops, undo_replay, undo_log_fill, series RPCs, add_activity_month, sample data
  - owner-only Grow debt RPCs, own-or-joint account checks, tightened guard_* triggers
  - guard_shared_line_edit, guard_joint_account_flag, guard_transaction_account, hh_account_usable
  - joint_account_balances(p_household_id)
affects: [08-06, 08-07, 08-10]
key-files:
  created:
    - supabase/migrations/20261122000300_household_privacy_rpcs.sql
    - supabase/tests/database/103_household_shared_line_guard.test.sql
decisions:
  - apply_patches looks an invisible row up as no row (visibility predicate inside the SELECT ... FOR UPDATE), so the refusal is the not-found one and no lock is taken
  - guard_shared_line_edit skips when auth.uid() is null (service role, FK cascades); clearing created_by/paid_by to null stays allowed (ON DELETE SET NULL)
  - series RPCs set fincwin.household_rpc around their soft-delete of pending lines (D-16: a member may edit/end a shared series)
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 05: Household privacy RPCs Summary

Every security-definer path now applies "personal unless shared": `apply_patches` v4 refuses another member's personal row exactly like a missing id, a trigger and the RPC both enforce the creator/payer column rule on shared lines, only the creator can flip an account to joint, and `joint_account_balances` shows members a joint account's full balance.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Migration M3 `20261122000300_household_privacy_rpcs.sql` | 3dd16641 | `supabase db reset` applies it |
| 2 pgTAP 103 | e1641d47 | 17/17 pass |

## What was re-created (newest bodies)

- `apply_patches` from `20261115000100` (icon_key, 261114 answered lines, decide_may_use, holdings and holding_lots all kept). Changes: replay pre-check and Phase A lookup filter by the visibility predicate; D-14 refusal `shared_line_creator_only` (42501) before the version check; debts/dismissals/prompts owner-only.
- `undo_adjusted_ops`, `undo_replay` (series lookup scoped; system steps set `fincwin.household_rpc`), `undo_log_fill` (series generations only for visible series).
- `create_recurring_series` (own lines only become anchors/links, account own-or-joint, `is_shared` stored), `edit_recurring_series_from`, `end_recurring_series` (shared-or-owner, account check, flag around the line soft-delete), `materialise_series` (lines copy `is_shared`), `add_activity_month` (only own or shared series), `seed_sample_data`, `clear_sample_data` (own rows only).
- Grow: `record_debt_one_off`, `record_debt_sale`, `remove_debt`, `save_debt_plan`, `save_goal_plan`, `confirm_goal_contribution`, `grow_end_series`, `grow_stop_series_for_removal`, plus guards `guard_transaction_debt`, `guard_series_goal`, `guard_holding`, `guard_debt`, `guard_savings_goal`, `guard_decide_settings_account`.
- New: `hh_account_usable`, `guard_transaction_account`, `guard_shared_line_edit`, `guard_joint_account_flag`, `joint_account_balances`.
- Every other inventory function carries a `-- reviewed, no change:` comment.

## Deviations from Plan

**1. [Rule 2] Extra tightening beyond the classified list.** `guard_debt`, `guard_savings_goal`, `guard_decide_settings_account` (account own-or-joint, debt series own), `undo_log_fill` (series generations of invisible series), `save_debt_plan` other-debts loop and `save_goal_plan` series lookup (own only), and a new `guard_transaction_account` trigger (a line can only sit on its creator's own or a joint account, same household only, client writes only). Without them a member could attach lines, debts or goals to another member's personal account.

**2. [Rule 1] guard_shared_line_edit allows clearing created_by/paid_by and skips null auth.uid().** Found by existing test 18 (created_by cleared by the ON DELETE SET NULL simulation) and needed for the service role materialiser.

**3. [Rule 3] Series RPCs set `fincwin.household_rpc`** around their pending-line soft-delete, otherwise a member editing a shared series (D-16) would trip the new trigger. The plan limited the flag to 08-09..14 RPCs.

**4. add_activity_month no longer materialises other members' personal series.** The horizon is still household-wide; their series catch up through their own materialiser run.

**5. `joint_account_balances` sums paid lines per currency** (like `account_balances`); the client adds the account's `opening_balance`.

## Test results (local DB only)

- 103: 17/17 pass (via CLI and direct psql).
- Wave 1/2 known red (household_members.role fixtures) not re-triaged.
- **Newly failing existing tests because of this migration** (fixtures insert accounts/series/lines with `created_by` null or cross-user, or expect the old 42501 for another household, now the missing-row refusal). All belong to 08-06's fixture work:
  - 33_transfer_pairs 11, 17 (account created by A used by B's line; new guard_transaction_account)
  - 44_record_polish_patches 7, 10, 17, 18 (null-created_by account/series now invisible; 9 and 19 were already red)
  - 69_apply_patches_v3 30, 31, 37 (32 was already red)
  - 71_series_end_reason_and_debt_paid_off 41, 42
  - 73_series_stop_from_first_day 25, 26 (expect 42501 for another household, now not-found)
- 93-96 (Grow RPC tests) pass; 18 and 05 pass after fixes 2 and a same-household limit on the account guard.
- The CLI `db reset`/`test db` was unreliable (shared local stack, host load, container restarts); results above were obtained with direct psql on the same local container.

## Before the eventual production push

- **05.5 Band B conflict:** this migration re-issues `apply_patches` from the 06.2 body, which still lists `share_pct` (allow-list and type map, 2 lines). If Band B (`20261121000300`) lands before the push, remove those two lines from M3 or it will put `share_pct` back (M3 sorts after Band B).
- Review wave-1 backfill with `disable trigger user` (08-01 note) together with M3: the new triggers (guard_shared_line_edit, guard_joint_account_flag, guard_transaction_account) are created in this migration, after the backfill.
- Check production for any `transactions`/`accounts`/`recurring_series` rows with null `created_by` after the backfill; they are invisible to apply_patches and RLS by design.
- `recurring_series.is_shared` and `transactions.is_shared` values existing in production (should all be false until 08-10).

## Known Stubs

None.

## Self-Check: PASSED (commits 3dd16641 and e1641d47 exist; both files present)
