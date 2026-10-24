---
phase: 05-decide-ui
plan: 32
subsystem: database
tags: [supabase, migrations, rls, pgtap, decide]
requires:
  - phase: 05-decide-ui
    provides: 05-03 decide_tables migration (decide_checks, decide_links, debts)
provides:
  - decide_changes table (D-27) and savings_goals table (D-34), owner-private
  - decide_checks cooling_off_at, estimate_monthly_payment, estimate_running (no client grant)
  - decide_links.role (day_one, payment, running_cost)
  - transactions.one_off and transactions.goal_id with guard_transaction_goal; transactions_active re-created
affects: [05-04, 05-25, phase-06-goals]
tech-stack:
  added: []
  patterns: [owner-private RLS with RPC-only decision state, fincwin.decide_rpc pin window]
key-files:
  created:
    - supabase/migrations/20261016000110_decide_depth_tables.sql
    - supabase/migrations/20261016000120_record_one_off_goal_tag.sql
    - supabase/tests/database/58_decide_depth_tables.test.sql
    - supabase/tests/database/59_record_one_off_goal_tag.test.sql
  modified: []
key-decisions:
  - "Savings goals have no stored balance; saved-so-far is computed from tagged transfers"
  - "Goals have no client insert grant and only update(deleted_at); record_decide_outcome (05-04) inserts"
requirements-completed: []
duration: 25min
completed: 2026-10-16
---

# Phase 5 Plan 32: Decide depth schema Summary

Two additive migrations and two pgTAP files: dated changes and savings goals tables (owner-private RLS, RPC-only decision state), split estimates and link roles, and Record's one-off flag plus a guarded goal tag on transactions with the view re-created.

## Tasks
1. Migration 20261016000110_decide_depth_tables.sql (f4a37fb)
2. Migration 20261016000120_record_one_off_goal_tag.sql (c3ee577)
3. pgTAP 58 (23 assertions) and 59 (13 assertions) (d1fe3b1)

## Deviations from Plan
None - plan executed as written. `guard_savings_goal` also fills created_by/updated_by on insert (the RPC and postgres-role test inserts need it); the guard on `transactions.goal_id` only checks when the tag is new or changed, so an existing tag on a soft-deleted goal does not block unrelated edits.

## Verification
- `npm run lint:migrations` OK (squawk-cli is not installed locally, so the squawk step is skipped here), `npm run verify:migrations` OK, `npm run lint` 0 errors, `npm run typecheck` clean; acceptance greps checked.
- NOT run: `supabase db reset --local` and `supabase test db` (Docker is down). CI's `rls` job runs pgTAP 58 and 59; the assertions are unexecuted and may need a fix on first CI run.
- Nothing pushed to production.

## Human verification
Confirm 58 and 59 pass in CI (`rls` job). Production push is 05-25.

## Known Stubs
None.

## Self-Check: PASSED
