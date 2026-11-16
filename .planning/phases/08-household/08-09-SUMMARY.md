---
phase: 08-household
plan: 09
subsystem: database
tags: [invites, rate-limit, join, household, pgtap]
requires: [08-02, 08-06, 08-07, 08-08]
provides:
  - household_invites, redeem_attempts; create_invite, my_open_invites, cancel_invite, restore_invite, preview_invite, redeem_invite
  - hh_move_tables allow-list, hh_move_rows, hh_personalise_category_rules
  - household_id pin triggers and guard_category_rule that honour fincwin.household_rpc
affects: [08-10, 08-11, 08-14]
key-files:
  created:
    - supabase/migrations/20261122000500_household_invites.sql
    - supabase/tests/database/105_household_invites.test.sql
    - supabase/tests/database/106_household_join_movein.test.sql
decisions:
  - No global blocking brake on redemption; the global failure rate is only logged and readable by service role (T-08-109)
  - A joiner's membership is stamped with clock_timestamp() so join order is always last, even inside one transaction
  - Dismissal and payer-prompt live keys are per person (household_id, created_by, key) so a move-in cannot collide with another member's row
metrics:
  completed: 2026-11-15
---
# Phase 8 Plan 09: Invites and joining Summary

Owner-only invites with 12-symbol Crockford codes (60 bits, sha256 at rest), a persisted per-user rate limit, and one atomic `redeem_invite` that moves the joiner's household of one into the target with every row kept personal.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Migration M5 `20261122000500_household_invites.sql` | 16afb298 | `supabase db reset` applies it |
| 2 pgTAP 105 (41) and 106 (49) | 5b10cd08 | both pass alone and in the full run |

## What was built

- **Invites.** 7 days, one use, owner only, cancel and undo (24 hours), cap of 6 counting members plus open invites (`full`). Expiry is checked by the server on every use. `code` and `code_hash` have no client grant; the plain code is kept only while open and nulled on use, expiry, or 24 hours after a cancel.
- **Guessing is futile (SC6).** Limits are enforced and tested: 5 failures in the last hour or 20 in the last 24 hours per user, then `slow_down` even for a valid code. Failures are written before the call returns jsonb (never raises), so the counter persists (105: five wrong codes leave five rows). 105 also asserts 60 bits and `20 / 2^60 < 1e-16`. There is no global brake: 200 foreign failures an hour do not stop a valid redemption; `hh_redeem_failure_rate()` is service-role only and a `raise log` fires at 200 or more.
- **No oracle.** Unknown, used, expired and cancelled codes all return exactly `{"ok": false, "reason": "invalid"}` (asserted four ways). Cancelling or restoring another member's invite is refused identically to a missing id (the 08-05 privacy rule; asserted by jsonb equality).
- **Join (D-01).** `hh_move_rows` moves rows through an explicit allow-list (`hh_move_tables`, 13 tables, ordered so guard triggers see accounts, series, debts, checks and holdings first), forces `is_shared = false`, and moves statement periods with their card. The three account/household composite FKs are now `deferrable initially immediate` and deferred for the move. `hh_personalise_category_rules` converts the joiner's shared rules to personal rules on their own category (clash and no-match rules are dropped). Weights re-split 34/33/33 style in join order; `joined` and `weights_changed` events are written.
- **Pin triggers (Pitfall 7).** Eleven guard functions re-issued from their newest bodies (`guard_debt`, `guard_savings_goal`, `guard_holding` from 20261122000300; `guard_holding_lot` from 20261110000200; the rest from their last file) with the `household_id` pin conditional on `fincwin.household_rpc`; `guard_category_rule` also lets scope and owner change under the flag. `redeem_invite` switches the flag off again at the end (a privileged writer is pinned again; 106 asserts it). `apply_patches` and every function in 20261122000300 are not re-issued.

## Deviations from Plan

**1. [Rule 1 - Bug] Dismissal and payer-prompt unique keys widened.** `recurring_dismissals_live_key (household_id, payee_key, direction)` and `income_payer_prompts_live_key (household_id, payer_key)` were household-wide while the rows are owner-only since 08-01: a second member dismissing the same payee would hit a duplicate they cannot see, and a join would abort on it. Both are replaced with `created_by` in the key (106 covers the move-in case). Commit 16afb298.

**2. Acceptance `grep -c "raise exception" <= 3` cannot hold.** The pin-trigger bodies re-issued from older files carry their own `raise exception` lines (23 in the file). The new invite code raises nothing itself (only `hh_uid()` does, in 08-02).

**3. `hh_move_rows` sets the household flag itself** (and `redeem_invite` clears it), so the helper is safe when called from the leave paths in 08-14.

## Verification

- 105: 41/41, 106: 49/49 (alone); 101, 102, 68, 51 re-run green after M5.
- Full run after both plans: Files=107, Tests=2689, Result: PASS.

## Before the eventual production push

- M5 takes brief locks: `alter constraint ... deferrable` on `transactions`, `recurring_series`, `statement_periods`, and two unique-index rebuilds. Widening cannot fail on existing data. Do it at a quiet time.
- `pgcrypto` must be in the `extensions` schema in production (Supabase default); M5 runs `create extension if not exists`.
- `grep -c share_pct supabase/migrations/202611220*` is unchanged by this plan (none added).
- The 11 re-issued guard functions replace the production bodies; if 05.5 Band B or another migration changes any of them before the push, copy the newer body and keep the one-line pin change.

## Known Stubs

None.

## Self-Check: PASSED (commits 16afb298, 5b10cd08; files present)
