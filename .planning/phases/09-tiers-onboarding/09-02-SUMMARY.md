---
phase: 09-tiers-onboarding
plan: 02
subsystem: database
tags: [supabase, postgres, rls, pgtap, plans]
requires: []
provides:
  - "Store-neutral plan tables (household_plans, plan_products, plan_events, trial_ledger, household_leave_log, plan_join_requests, plan_settings, user_setup, feature_switches)"
  - "household_plan_state, household_writable, household_seats, plan_trial_available, plan_state()"
affects: [09-03, 09-04, 09-05, 09-06, 09-09]
key-files:
  created:
    - supabase/migrations/20261124000100_plans_core.sql
    - supabase/tests/database/111_plans_core.test.sql
  modified:
    - supabase/tests/database/102_household_table_coverage.test.sql
    - supabase/tests/database/104_household_realtime_publication.test.sql
requirements-completed: [TIER-07, TIER-01, TIER-03]
duration: short
completed: 2026-11-18
---

# Phase 9 Plan 02: Plan core Summary

One store-neutral plan record per household with state, seat and writable functions, a launch switch, a once-per-person-and-household trial ledger, and private per-user setup and feature switches, all behind RLS with no client writes.

## Commits
- a1c3ed36 test(09-02): failing pgTAP 111 (RED)
- 2241cfdf feat(09-02): migration 20261124000100 plus 102/104 list updates (GREEN)

## Notes
- plan_state() is the only function granted to authenticated; all others are definer-only.
- 104 now has 34 assertions (added a household_plans published check and added it to the shared-capable list). 102 plan count unchanged (13).
- The realtime publication add is guarded by a pg_publication existence check.

## Deviations from Plan
- Worktree base was not 244fff44 at start; reset --hard to it per the startup check.
- plan_state() picks the household with `order by created_at limit 1` for determinism.

## Verification
- pgTAP NOT run locally: the `supabase` CLI is not installed in this worktree and no local stack is available. The CI rls job runs 111, 102 and 104. Static check only: 9 tables created, one `grant execute ... to authenticated`.
- The 111 test plan count (39) was counted by hand; a CI count mismatch is the first thing to check.

## Known Stubs
None.

## Self-Check: PASSED
Files and commits a1c3ed36, 2241cfdf exist.
