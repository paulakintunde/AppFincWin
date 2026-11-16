---
phase: 08-household
plan: 10
subsystem: database
tags: [splits, sharing, fx-stamp, household, pgtap]
requires: [08-02, 08-03, 08-06, 08-07]
provides:
  - transaction_splits, household_split_defaults, transaction_member_categories
  - hh_allocate (engine mirror), share_transaction, bulk_share_transactions, make_line_private, set_line_split, set_paid_by
  - set_split_default, count_unsettled_for_rule, apply_rule_to_unsettled, set_household_currency (shared_lines_exist)
  - joint-account and shared-series auto-share trigger, hourly restamp job
affects: [08-11, 08-12, 08-14]
key-files:
  created:
    - supabase/migrations/20261122000600_household_splits.sql
    - supabase/tests/database/107_household_splits.test.sql
decisions:
  - Debt- and goal-linked lines stay personal everywhere (share, bulk, series, joint auto-share)
  - Lines paid into a joint account are not auto-shared; only money going out is (D-17 top-ups are not tracked)
  - A series share and a joint line are finished by one BEFORE/AFTER INSERT trigger instead of re-creating materialise_series
metrics:
  completed: 2026-11-15
---
# Phase 8 Plan 10: Sharing lines and stored splits Summary

A line becomes shared only through the creator's Shared switch, a bulk action with a count, a joint account (money out) or a shared series. Each shared line stores its own split and a household-currency amount stamped once, computed on the server with the engine's largest-remainder rule.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Migration M6 `20261122000600_household_splits.sql` | 6ca5d0ae, joint top-up fix 28f23199 | `supabase db reset` applies it |
| 2 pgTAP 107 (65 assertions) | ed50f0dc | passes alone and in the full run |

## What was built

- **Engine mirror.** `hh_allocate` returns 334/333/333 for 1000 over 3, 601/400/0 for 1001 over 60/40/0, mirrors sign, and raises 22023 for all-zero weights (107 uses the same vectors as the engine tests).
- **Sharing.** `share_transaction` (creator only, version-checked, `line_locked`, `no_household`, `rate_unavailable`, `linked_line_personal`), series scope shares this line and every already-materialised future line, never past ones. `bulk_share_transactions` returns `{shared_count, skipped_count}`. `make_line_private` (creator only, `joint_account_line`, writes a `made_private` notice with the line id and nothing else). `set_line_split` (any member, names before/after, returns `before` for Undo). `set_paid_by`. Category and household default rules with the exact unsettled count and re-split.
- **Owner decision (debt and goal lines stay personal).** `share_transaction` refuses a line with `debt_id` or `goal_id` (`linked_line_personal`); a series linked to a goal or debt is refused; `bulk_share_transactions` skips them (counted); the joint-account trigger leaves them personal. 107 covers each.
- **Stamping (D-39).** `household_amount`, `household_currency`, `household_rate` are stamped once at share time from the line's own date through `per_eur_rate` and `convert_minor`. A later rate change moves nothing (asserted). Lines made shared with no rate available are marked pending and `hh_restamp_pending()` (hourly pg_cron job, service role only) stamps them and fills in the shares from the stored weights.
- **Privacy.** A line the caller cannot see is refused exactly like a missing id (asserted by jsonb equality for share and split). `transaction_splits` select follows the parent line. A member's own category on a shared line is guarded by a trigger (own category, shared line of their household).
- **Not touched.** `hh_move_rows` and `hh_move_tables` are unchanged; the new household tables are already in 106's stay-list, and 106 and 102 stay green with them present.

## Deviations from Plan

**1. [Rule 2 - owner privacy rule] B sharing A's personal line answers `not_found`, not `not_creator`.** The plan test said `not_creator`; the 08-05 rule says a row the caller cannot see is refused exactly like a missing id. `not_creator` is returned only for a line the caller can see (A's shared line). 107 asserts both.

**2. Materialiser not re-created.** The plan asked to re-issue `materialise_series`. 20261122000300 already copies `is_shared` from the series onto each new line, so a BEFORE INSERT trigger (`share_on_insert`: stamp, rule from the series, debt/goal and household-of-one guards) plus an AFTER INSERT trigger (`store_splits_on_insert`) finish the job for both joint-account and series lines with no change to a function copied from 20261122000300. 107 materialises later lines and asserts they arrive shared with a split.

**3. [Rule 1 - Bug] Money paid into a joint account is not auto-shared.** First version shared every line on a joint account; 101's fixture (A pays 50,000 into the joint account, personal) failed three assertions. Under D-17 top-ups are not tracked, so only lines with a negative amount are auto-shared. Series-copied lines keep the series' sharing whatever the sign.

**4. Provisional rates are stamped.** `per_eur_rate` returns a nearby or older rate when no exact one exists; the household figure is stamped from it and never moves (D-39). `rate_unavailable` / pending only applies when no rate exists at all.

**5. src/data/exportManifest.ts not changed.** The new tables are already in 101's `-- export-tables:` block and 102's table list. The manifest drives the app's export selection and the plan did not list it; the new transaction columns (`household_amount`, `household_currency`, `household_rate`, `split_rule`, `shared_at`) and the new tables are not yet in the export manifest (see below).

## Verification

- Final full run after both plans (`npx supabase db reset` then `npx supabase test db`): Files=107, Tests=2689, Result: PASS.
- 107 alone: 65/65.

## Before the eventual production push

- `transactions_active` is re-created (column list grows); `transactions` gets six new nullable or defaulted columns (no table rewrite for the default-false boolean on modern Postgres).
- pg_cron job `household-restamp-hourly` is created; check it appears once in `cron.job`.
- Export and deletion: the new tables (`transaction_splits`, `household_split_defaults`, `transaction_member_categories`, `household_invites`) and the new transaction columns are not yet in `src/data/exportManifest.ts` or the account-deletion path; the plan that owns export/deletion (08-22 / 08-26) must add them.

## Known Stubs

`hh_line_locked` returns false until plan 08-11 re-creates it (by design, named in the plan).

## Self-Check: PASSED (commits 6ca5d0ae, ed50f0dc; files present)
