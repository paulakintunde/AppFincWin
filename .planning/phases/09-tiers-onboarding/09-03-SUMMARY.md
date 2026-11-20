---
phase: 09-tiers-onboarding
plan: 03
subsystem: database
tags: [supabase, postgres, triggers, pgtap, plans, lock]
requires: ["09-02"]
provides:
  - "guard_plan_lock() and plan_lock trigger on 27 records tables (PT402 / hint plan_locked)"
  - "plan_backfill_testers(), run inside the same migration"
  - "fincwin.plan_bypass GUC contract; seed/clear sample RPCs hold it"
affects: [09-04, 09-05, 09-06, 09-08]
key-files:
  created:
    - supabase/migrations/20261124000200_plans_lock.sql
    - supabase/tests/database/112_plans_lock.test.sql
requirements-completed: [TIER-09, TIER-07]
completed: 2026-11-18
---

# Phase 9 Plan 03: Plans lock Summary

A BEFORE insert/update/delete trigger refuses records writes with PT402 when `household_writable()` is false, fires for SECURITY DEFINER RPCs too, and ships with the tester backfill in one migration.

## Commits
- ea5b2246 test(09-03): failing pgTAP 112 (RED)
- 398af3b8 feat(09-03): migration 20261124000200 (GREEN)

## Notes
- No session (auth.uid() null: service role, cron, signup triggers) is never locked. Owner-only tables (categories etc.) are judged by the caller's oldest household membership.
- The bypass GUC is set first and reset to 'off' before every return in seed_sample_data and clear_sample_data, so it cannot leak into later statements in the same transaction (test 112 asserts this). redate_sample_data_if_stale is security invoker and calls those two, so it was not redefined.
- Trigger list is the plan's 27 tables. decide_shadow_runs (consent telemetry) is in the test's exclusion list; debt_line_applied has no client policy and is not triggered.
- The plan's acceptance grep `fincwin.plan_bypass', 'on', true` >= 3 matches 3 lines, but one is the header comment; real set_config calls: 2 (seed, clear). hh_depart (09-04) and plan_apply (09-05) add their own.
- Test plan count 26, counted by hand.

## Deviations from Plan
- Trigger function uses `case when tg_op = 'DELETE'` instead of `coalesce(new, old)` (safer for DELETE).
- Added `drop trigger if exists` before create so the migration is re-runnable.
- Worktree base reset to 632b1655 at start.

## Verification
- pgTAP NOT run locally: no Supabase CLI or Docker stack in this worktree. CI rls job runs 112 and the full suite. If 112 fails in CI, first suspects: the plan count (26), RLS on the authenticated `lives_ok` writes, and share_transaction's argument shape.
- Reviewed by diff: the two sample function bodies differ from 20261122000300 only by the bypass lines.
- Risk to check in CI: any definer RPC an authenticated new member runs while their household is locked (e.g. join flows) now gets PT402; 09-04 owns hh_depart/join bypass.

## Known Stubs
None.

## Self-Check: PASSED
Files and commits ea5b2246, 398af3b8 exist.
