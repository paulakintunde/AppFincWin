---
phase: 05-decide-ui
plan: 04
subsystem: database
tags: [supabase, migrations, rpc, undo, pgtap, decide]
requires:
  - phase: 05-decide-ui
    provides: 05-03 decide tables, 05-32 depth tables and one_off/goal_id columns
provides:
  - undo_log_fill and apply_patches accept decide_checks, debts, decide_links, decide_changes, savings_goals; transactions one_off and goal_id patchable
  - record_decide_go (one call, one undo step) and record_decide_outcome (wait, pass)
affects: [05-05, 05-19, 05-20, 05-25]
tech-stack:
  added: []
  patterns: [server-only decision columns patchable only inside allow_system_keys replay, fincwin.decide_rpc pin window]
key-files:
  created:
    - supabase/migrations/20261016000200_decide_patches.sql
    - supabase/migrations/20261016000300_decide_outcomes.sql
    - supabase/tests/database/55_decide_patches.test.sql
    - supabase/tests/database/56_decide_outcomes.test.sql
  modified: []
key-decisions:
  - "Owner-private entities (checks, links, changes, goals) also get an owner branch in apply_patches' already-applied pre-read, not only the main ownership check"
  - "Series ended by Go ahead must come back status applied, otherwise the whole call fails with 22023 (a stale expected_version aborts rather than half-applies)"
requirements-completed: []
duration: 40min
completed: 2026-10-16
---

# Phase 5 Plan 04: Decide undo allow-list and decision RPCs Summary

Two additive migrations and two pgTAP files: the undo machinery now covers the Decide entities and depth writes, and `record_decide_go` / `record_decide_outcome` record a decision atomically with split estimates, link roles, a server-computed 48 hour cooling-off time and the Wait savings goal.

## Tasks
1. Migration 20261016000200_decide_patches.sql + pgTAP 55, 23 assertions (c998481)
2. Migration 20261016000300_decide_outcomes.sql + pgTAP 56, 61 assertions (b992ace)

## Deviations from Plan
- [Rule 1 - Bug] The plan's pgTAP bullet for `{one_off: 'yes'}` expects a refusal, but Postgres casts 'yes' to boolean true. The test uses `'maybe'` (22P02) instead.
- Added an owner-private branch to apply_patches' already-applied pre-read (not listed in the plan) so a replay never reports another user's check, link, change or goal row version.
- Otherwise executed as written. No engine edits.

## Verification
- `npm run lint:migrations` OK, `npm run verify:migrations` OK, `npm run typecheck` clean, `npm run lint` 0 errors.
- NOT run: `supabase db reset --local` / `supabase test db` (Docker down; no local Postgres). pgTAP 55 and 56 are unexecuted; CI's `rls` job must confirm and may surface fixes on first run.
- Nothing pushed to production (05-25 is the push).

## Human verification
Confirm pgTAP 55, 56 (and 52, 53, 44 still) pass in the CI `rls` job.

## Known Stubs
None.

## Self-Check: PASSED
