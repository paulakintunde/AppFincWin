---
phase: 08-household
plan: 11
subsystem: database
tags: [settle-up, settlements, locks, cron, household, pgtap]
requires: [08-02, 08-05, 08-10]
provides:
  - settlements, settlement_lines, settlement_nudges, transactions.is_settlement / settlement_id
  - propose_settlement, confirm_settlement, record_received, set_settlement_payer_account, reject_settlement, cancel_settlement, undo_settlement, write_off_balance, ask_to_settle
  - hh_line_locked (real body), hh_pair_owed, hh_settlement_lapse, hh_write_settlement_records, hh_settlement_sweep (cron household-settlement-sweep)
affects: [08-13, 08-15, 08-12, 08-30]
key-files:
  created:
    - supabase/migrations/20261122000700_household_settlements.sql
    - supabase/tests/database/108_household_settlements.test.sql
  modified:
    - supabase/tests/database/102_household_table_coverage.test.sql
decisions:
  - Lapse outcome (ROADMAP flag) is D-20 and is implemented and tested lazily and by cron
  - Settlement records on a joint account are never shared or split
  - Clients cannot edit or delete a settlement record by hand (23514 settlement_record_locked)
metrics:
  completed: 2026-11-15
---
# Phase 8 Plan 11: Settle-up state machine Summary

The server side of settling up: a payer proposes, the receiver says Got it, and exactly the ticked lines lock while two settlement records move the chosen account balances without ever counting as spending or income.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Migration M7 `20261122000700_household_settlements.sql` | 5199eeaf | `supabase db reset` applies it |
| 2 pgTAP 108 (73 assertions) and 102 classification of `settlement_nudges` | see git log | passes alone and in the full run |

## What was built

- **States:** pending, confirmed, rejected ("Not yet"), cancelled, lapsed, undone, written_off. Server recomputes the amount from stored splits (`hh_pair_owed`, mirrors the engine's settleUpTotal; expenses are stored negative so "owed" is the negated share); a mismatch answers `lines_changed` with the server amount.
- **Locks:** `hh_line_locked` is real now: a live settlement line locks while confirmed, written off, or pending and not expired. `guard_shared_line_edit` blocks amount, currency, date and deletion of a locked line even for the creator (23514 `line_locked`). One live settlement per line (partial unique index).
- **Records (D-22):** confirm writes a negative record on the payer's account and a positive one on the receiver's, each `is_settlement`, `settlement_id`, not shared, converted from household currency at today's rate with both rates stored. Settlement records are never auto-shared on a joint account (`hh_share_on_insert` re-created with one guard line).
- **Receiver-recorded payment (D-24):** `record_received` settles at once with only the receiver record; the payer gets `settled` with `needs_account`, then `set_settlement_payer_account` writes the payer record once. `ask_to_settle` is limited to once per 24 hours per pair.
- **Undo (D-42):** either person within 24 hours of confirming; both records are soft-deleted, lines free, both told. After that `undo_window_closed`.
- **Write-off (D-25):** only for someone who is no longer a member (`member_still_here` otherwise); accepts a user id or the stable former-member key; lines stay locked so the balance never returns; no money moves.

## Decision: what happens when the expiry window lapses unresolved (ROADMAP research flag)

The plan and D-20 already answer it, so nothing was invented. Day 7: reminder to the receiver. Day 14: the settle-up lapses, lines unlock, the balance is owed again, both people get one `settle_lapsed` notice, nothing settles. It does not depend on cron: `hh_line_locked` treats an expired pending settle-up as unlocked, every RPC that touches an expired pending row lapses it and writes the notice (once, via the unique index), and Got it after day 14 answers `lapsed` and writes no records. The hourly sweep (`household-settlement-sweep`, minute 17) does the same in bulk and is idempotent. 108 proves each of these, including a lapse with no sweep, two sweeps adding nothing, and a reminder for a settle-up still inside its window.

## ARC-18 server review

Every SQL function that sums `transactions` was found by grep: `account_balances`, `account_pending_split`, `account_paid_before`, `joint_account_balances`, `change_home_currency` (no total), `transaction_months`. All are balance or listing figures where settlements must count (they move balances). No SQL function produces a spending or income total; those are computed on the device from the engine's `excludeSettlements` (05.5 and 08-30). Header comment `ARC-18 reviewed` lists each; none changed.

## Deviations from Plan

**1. [Rule 2 - owner privacy rule] A third member (or any non-party) is refused like a missing id.** The plan test said C confirming gets `not_receiver`. Settlements are pair-private, so for C the settle-up does not exist: `not_found`, byte-identical to a random id (108 asserts equality). `not_receiver` / `not_payer` go only to the other party.

**2. [Rule 3] `hh_pair_owed` takes a household as its first argument** (`(household, payer, receiver, lines)`), so an internal helper can never be fed another household's lines.

**3. Reminder test shape.** The plan's test expected a reminder and a lapse for the same settlement. The sweep sends a reminder only while a settle-up is still inside its window (a reminder on one that already lapsed would be wrong), so 108 uses one settle-up for the reminder and another for the lapse.

**4. [Rule 2] Settlement records are locked against hand edits** (`settlement_record_locked`, 23514) in `guard_shared_line_edit`; and `hh_share_on_insert` skips them. Without this a member could delete one record and unbalance both accounts.

**5. [Rule 1] Pre-existing tables classified.** `settlement_nudges` has a `household_id` column, so 102 needed a row for it (class `household`, no client policy).

## Known limitation

A line whose payer's account was deleted (`paid_by` and `created_by` both null) cannot be matched to a person, so it is not counted in a write-off of that person's balance. Leaving (not deleting) keeps `created_by`, so the normal case works.

## Notes for later plans

- **08-13 / 08-15 (export, client columns):** add `settlements`, `settlement_lines` to the export manifest (already in 101's `-- export-tables:` block, so no 101 edit was needed; `settlement_nudges` is server-only and must not be exported). New `transactions` columns `is_settlement` and `settlement_id` (select only) need to be in the client column list and the export manifest. `transactions_active` was re-created.
- **08-26 / account deletion:** settlements keep `payer_former_key` / `receiver_former_key` (the user ids at creation) when `payer_id` / `receiver_id` are nulled by a deleted account. Settlement records are normal `transactions` rows and go with their owner.
- **08-12 / UI:** reasons the client must word: `lines_changed` (with `server_amount`), `nothing_owed`, `not_member`, `account_not_yours`, `payer_account_gone`, `rate_unavailable`, `not_pending`, `lapsed`, `not_confirmed`, `undo_window_closed`, `member_still_here`, `too_soon` (with `sent_at`), `already_set`, `line_locked`.
- Realtime: `settlements` and `settlement_lines` are not yet in the realtime publication (08-23 adds them, per 20261122000400).

## Production checks (before the eventual push)

- `household-settlement-sweep` appears exactly once in `cron.job`.
- `transactions` gains `is_settlement boolean default false` (no rewrite) and `settlement_id`; `transactions_active` is re-created.
- `hh_move_tables()` unchanged; 106 stays green with the new tables present.

## Verification

`npx supabase db reset` then `npx supabase test db`: Files=108, Tests=2768, Result: PASS.

## Known Stubs

None. (`hh_line_locked` is now real.)
