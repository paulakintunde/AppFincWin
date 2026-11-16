---
phase: 08-household
plan: 14
subsystem: database
tags: [leave, remove, transfer, reconnect, account-deletion, household, pgtap]
requires: [08-09, 08-10, 08-11]
provides:
  - household_former_members, member_departures
  - leave_household, remove_member, transfer_ownership, reinvite_removed, my_departed_balances, account_deletion_preview
  - record_paid (new), record_received / confirm_settlement / redeem_invite / hh_pair_owed (re-issued)
  - hh_depart, hh_move_personal_rows, hh_reconnect, hh_tombstone_accounts, hh_before_user_delete (trigger on auth.users)
affects: [08-15, 08-22, 08-24, 08-25, 08-26]
key-files:
  created:
    - supabase/migrations/20261122000800_household_leave_remove_delete.sql
    - supabase/tests/database/109_household_leave_remove.test.sql
    - supabase/tests/database/110_household_account_deletion.test.sql
  modified:
    - supabase/tests/database/36_account_deletion.test.sql
    - supabase/tests/database/54_decide_tables.test.sql
decisions:
  - Pending settle-ups are left alone when someone leaves, is removed or deletes (the plan is silent); see "Owner decisions"
  - The former-member key is random (as the plan says) and is also stamped on the payer of a line (new column transactions.paid_by_former_key), which closes the 08-11 known limitation
  - A tombstone account is archived and shared only so its lines keep a home; hh_pair_owed no longer treats it as a joint account
metrics:
  completed: 2026-11-15
---

# Phase 8 Plan 14: Leaving, removal, transfer, reconnect and deletion Summary

A person can leave or be removed with their personal records moving to a new household of one and a personal copy of every shared line they were on; the household keeps the originals so nobody's balance moves; removal can be undone for 24 hours; and deleting an account is never blocked, erases everything personal, hands the household to the earliest joiner and leaves the remaining members' balances exactly as they were.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Migration M8 `20261122000800_household_leave_remove_delete.sql` | 154b573e (in place fix in the final commit) | `supabase db reset` applies it |
| 2 pgTAP 109 (88 assertions) | 68c499b3 (extended in the final commit) | passes alone and in the full run |
| 3 pgTAP 110 (39) and edits to 36 and 54 | see git log | passes alone and in the full run |

## What was built

- **Departure (D-26, D-28, HH-13).** `hh_depart` creates the household of one, gives every personal account that carries shared lines (or a shared series) an archived shared tombstone and re-points those lines to it, writes one personal copy per shared line the person was on (full amount on their own account with `copy_share` = their share when they paid from it; their share on one archived tracking account otherwise), then moves their rows through the 08-09 allow-list only (`hh_move_personal_rows`; `hh_move_rows` is untouched and has no overload). Settlements, splits, member categories, shared category rules, former members and departures never move. Weights of the rest re-split to 100 (largest remainder).
- **Leaving with a balance (D-25).** `leave_household` is allowed with an open balance and returns it signed (`open_balances`, positive = the caller owes them). An owner must pick the new owner (`pick_new_owner`); a household of one answers `alone`. `my_departed_balances()` shows the leaver "A owes you 2700" read-only, recomputed live. A, who stays, can still settle with the former member (`record_received` re-issued, `record_paid` new: only the caller's record is written, there is no confirmer) or write it off (08-11, unchanged).
- **Removal and 24-hour reconnect (D-28).** `remove_member` (owner only) uses the same departure and writes "You're no longer in [household]" for the removed person. `reinvite_removed` makes a code that expires when the 24 hours end; `redeem_invite` (re-issued from 000500, normal join path unchanged) reconnects: copies erased, rows moved back with the 4-argument 08-09 mover, tombstoned lines back on their own account, tombstones deleted, role and colour restored (next free colour if taken), weights even, the household of one deleted, `departure_undone` written.
- **Deletion (D-27, D-29, CMP-F23, HH-14).** `households.owner_id` is now `on delete set null` (Pitfall 3). A `before delete on auth.users` trigger: stamps a stable key on the person's splits, on the payer of their lines and on both sides of their settle-ups; hands ownership to the earliest joiner (told, and only they); tombstones; erases every personal row in dependency order; deletes the membership; re-splits weights; notes "left (deleted)". A person alone has their whole household deleted. A person who left earlier and then deletes keeps their former-member row, now with the name erased and reason deleted. Only data-integrity errors (SQLSTATE class 23) are re-raised; anything else logs a warning and deletion continues.
- **SC6 proof.** 110 records the balance of B and C against A and between B and C before the deletion and asserts the same values against A's former-member key afterwards (and against C's key after C leaves and then deletes).

## Deviations from Plan

**1. [Rule 1 - Bug] hh_pair_owed re-issued.** A shared line on a tombstone account was ignored as "on a joint account", which would have changed every balance on leaving; and a line whose payer's account was deleted could not be matched (the 08-11 known limitation), which would have changed balances on deletion. The new body ignores tombstones when deciding "joint" and finds the payer through the new `transactions.paid_by_former_key` (order: `paid_by`, former key, `created_by`).

**2. [Rule 1 - Bug] confirm_settlement re-issued** with `payer_account_gone` also when the payer's account is no longer in the settle-up's household. Without it, "Got it" on a settle-up whose payer had left failed on the account/household constraint.

**3. [Rule 2 - correctness] Shared series, joint-account rows, goal and holding links.** The plan only re-pointed shared lines. A shared series on a moving account would have broken the same constraint, and would keep writing lines for someone who is gone, so it is re-pointed and ended (old end date kept for the reconnect). A person's own rows resting on a joint account (a top-up line, a series) are re-pointed to their tracking account; links from their debts, goals, holdings and Decide reserve to a joint account are cleared (a moved row may not point back across households). Shared lines written by a personal series of theirs (a joint account shares outgoing lines at once) let go of that series.

**4. [Rule 2] A line the person paid for others with no share of their own** is also copied in full (copy_share 0), otherwise their account would lose money they really spent.

**5. copy_share is signed.** Expenses are stored negative, so the share is negative (-4200 for the plan's 4200).

**6. [Rule 3] Edits to existing tests.**
- 36: the departed non-owner's personal series is now erased instead of staying with created_by cleared; one added assertion that the owner's series is untouched; plan 19 to 20. Nothing weakened.
- 54: A's card account is made joint inside that test, so after A's deletion the joint account (a shared record, D-29) and its statement period stay. The "purges every Decide row" assertion keeps checks, settings, links and debts at zero and the statement period now has its own assertion (it stays with the joint account); plan 38 to 39. Personal Decide rows are still all purged.

## Owner decisions needed (plain options)

1. **Settle-ups still waiting when someone goes.** The plan does not say. Built: they are left exactly as they are, lines stay locked, and they lapse on day 14 like any other. The person who stays can say "Not yet" or cancel; "Got it" answers payer_account_gone. Options: (a) keep this (nothing is invented, balances do not move); (b) cancel them automatically when someone goes and tell the other person, so the lines free up at once.
2. **The person who left cannot record a payment themselves.** D-25 says "either person can still settle it". The plan gives the leaver a read-only view. The person who stays can record a payment or write it off. Options: (a) keep read-only; (b) add a way for the leaver to mark "I paid" that the person who stayed then confirms.
3. **Undo of a confirmed settle-up after the payer left.** Within the 24 hours the person who stayed can still undo it, which softly deletes the leaver's record in their new household. Options: (a) allow (the balance goes back on both sides); (b) refuse once a party has left.

## Notes for later plans

- **08-15 (client columns):** new server-only `transactions` columns `copied_from`, `copy_share`, `paid_by_former_key`; `accounts.tombstone_of`. Hide accounts with `tombstone_of` from account lists and pickers (they are archived and shared only to hold lines) and treat them as normal accounts, not joint ones, when working out who owes whom. The engine's "joint account lines create no owing" rule must not apply to a tombstone. `household_former_members` and `member_departures` (client select grant is columns `id, household_id, user_id, actor_id, kind, undo_until, restored_at, created_at` only) go in the export manifest (already in 101's list); `household_invites.departure_id` has no client grant.
- **Payer lookup everywhere:** the payer of a line is `paid_by`, else `paid_by_former_key`, else `created_by`. A line whose payer was deleted cannot be re-split by the server (the former payer is not a member); it answers `not_member`.
- **Realtime (08-23):** add `household_former_members` and `member_departures` to the publication.
- **08-22 (account deletion UI/Edge Function):** call `account_deletion_preview()` for the paragraph (`in_shared_household`, `is_owner`, `next_owner_user_id`, `household_name`). Deleting through the Admin API now runs the trigger first; no extra server step is needed. Reasons to word: `alone`, `pick_new_owner`, `not_owner`, `not_member`, `member_still_here`, `already_restored`, `window_closed`, `full`, `payer_account_gone`.
- **08-24 / 08-25:** "my share" of a copy that carries the full paid amount is `copy_share`, not `original_amount`. Former-member display: `household_former_members.display_name` (null once deleted) and `colour_key`; the key to pass to `write_off_balance` / `record_received` / `record_paid` is the user id for someone who left or was removed, and `former_key` once their account is deleted.
- **The reconnect** does not restore: lines of the person's that were re-pointed from a joint account, links cleared from goals/holdings/debts, or the link of a joint line to its series.
- Events written: `left`, `removed` (also in the removed person's new household, audience them), `owner_changed`, `weights_changed`, `departure_undone`. `left` from a deletion carries `{deleted: true}`.

## Production checks (before the eventual push)

- M8 changes `households.owner_id` to nullable with `on delete set null` (brief lock on `households`), adds nullable columns to `transactions`, `accounts`, `household_invites`, and re-creates `transactions_active`. Quiet time.
- It adds a trigger on `auth.users` (`hh_before_user_delete`). Check it exists once, and run a deletion of a throwaway test account with a shared household before relying on it.
- It re-issues `hh_pair_owed`, `record_received`, `confirm_settlement` and `redeem_invite`; if another migration changes any of them before the push, copy the newer body and keep these changes.
- `grep -c share_pct supabase/migrations/202611220*` is unchanged by this plan.

## Verification

`npx supabase db reset` then `npx supabase test db`: Files=110, Tests=2897, Result: PASS (was Files=108, Tests=2768). The reset printed a storage-container health-check timeout on the last run, after every migration had applied; the suite ran against the reset database.

## Known Stubs

None.
