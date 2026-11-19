---
phase: 09-tiers-onboarding
plan: 04
subsystem: database
tags: [supabase, postgres, pgtap, plans, invites]
requires: ["09-02"]
provides:
  - "Plan-sized invite caps, payer-approval join requests, the 12-month switch rule, and plan moves on leave/removal/deletion"
affects: [09-03, 09-05, 09-18]
key-files:
  created:
    - supabase/migrations/20261124000300_plans_seats_invites.sql
    - supabase/tests/database/113_plans_seats_invites.test.sql
    - supabase/tests/database/114_plans_switch_rule_departures.test.sql
requirements-completed: [TIER-06, TIER-07]
completed: 2026-11-18
---

# Phase 9 Plan 04: Plan seats, approval, switch rule, departures Summary

Membership RPCs now follow the plan: seats from `household_seats()`, a person beyond the plan size waits for the payer (join request plus a `plan_approval_needed` notice), a once-a-year switch rule outside the free countries, and the plan moves or graces when a payer or member leaves.

## Commits
- f149fe54 test(09-04): pgTAP 113 (37 assertions) and 114 (31 assertions), RED
- 92153123 feat(09-04): migration 20261124000300

## What was built
- Notice kinds: the CHECK is dropped by lookup and re-added with the 22 old plus 8 new kinds. `plan_event_notice()` inserts with a null actor.
- `plan_country_rule_free`, `plan_switch_blocked_until` (country used only here, never stored; null or blank country means no rule).
- `hh_join_member(user, household, invite)` holds the join steps (including the 24-hour reconnect), used by `redeem_invite` and `plan_admit_waiting`.
- `redeem_invite(p_code, p_store_country default null)`: old one dropped. Results: `switch_rule` (with `open_from`), `needs_approval` (with `request_id`), `full`.
- `create_invite`, `restore_invite`, `reinvite_removed`, `preview_invite` redefined by extracting the newest bodies with a script and patching only the cap. Cap is 12 total while the plan is trial/active/grace, otherwise `household_seats()` (6 prelaunch, member count when lapsed or none). `preview_invite` adds `needs_approval`, `plan_key`, `seats`.
- `plan_admit_waiting`, `cancel_join_request` (requester or payer), `plan_on_departure`.
- `hh_depart` sets `fincwin.plan_bypass` first, resets it last, and calls `plan_on_departure(p_user, p_household, v_h2, p_kind)`. `hh_before_user_delete` calls it with a null new household and kind `deleted`.

## Deviations from Plan
- **[Rule 3] Worktree base:** HEAD was not the expected base at start; `reset --hard` to 632b1655 per the startup check.
- **Downgrade offer only for active or grace:** a trial is not offered a smaller plan (trial plan size is moot). The plan text did not say.
- **`hh_join_member` also sets `fincwin.plan_bypass`** for the join and resets it, so moving a person's rows out of a lapsed household of one is not blocked by the 09-03 lock.
- **`needs_approval` in `preview_invite`** is true only while the plan is covered (trial/active/grace) and members are under 12; lapsed or unpaid households show `full` instead.

## Issues for the owner / next plans
1. **Colour cap blocks the 7th member.** `household_members.colour_key` is 0..5 and unique per household, and `assign_member_defaults` raises `household_full` when none is free. Household(6) fits, but an Extended(12) plan cannot take a 7th member. The plan's 12-seat cases were therefore tested only as far as 6 members (create_invite and `household_seats`), not a 12th-seat refusal. This needs a later plan or fix (widen the colour range and the client picker) before Extended is sold.
2. **Leave while locked depends on 09-03.** `leave_household` and `remove_member` run `hh_cancel_pending_settlements` and `hh_transfer_owner` before `hh_depart`; if the 09-03 lock trigger covers tables they touch, those calls need the `fincwin.plan_bypass` flag too. Test 114 part 5 will show it in CI once 09-03 lands.
3. The payer-takes-plan move requires a non-owner payer (as `hh_depart` already does); an owner-payer leaving transfers ownership first, which is unchanged.

## Verification
- pgTAP NOT run locally: no Supabase CLI, psql or local stack in this worktree. CI runs 113 and 114 and the existing 105, 106, 109, 110. Assertion counts were checked by grep: 113 has 37 (plan 37), 114 has 31 (plan 31). If CI reports a count mismatch or a failure, start with the 12-seat colour issue and the `leave_household` flow in 114.
- Static checks on the migration: `household_seats(` appears 6 times; no `>= 6` left; one `insert into public.household_leave_log`; `drop function public.redeem_invite(text)` and `p_store_country text default null` present; `plan_on_departure(p_user, p_household, v_h2, p_kind)` present.
- Phase 8 tests call `redeem_invite(code)` with one argument and still resolve through the default.

## Threat mitigations
T-09-14 seat check under household `for update` and join only through `hh_join_member`; T-09-15 country never stored, tested by a column check; T-09-16 `cancel_join_request` checks requester or payer (tested); T-09-17 `plan_bypass` in `hh_depart` (tested in 114 part 5). T-09-13 accepted.

## Known Stubs
None.

## Self-Check: PASSED
Files exist (migration, 113, 114); commits f149fe54 and 92153123 exist.
