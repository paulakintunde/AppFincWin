---
phase: 05-decide-ui
plan: 03
subsystem: database
tags: [supabase, rls, pgtap, decide]
requires: []
provides:
  - decide_checks, decide_settings, debts, decide_links, statement_periods tables with RLS and column grants
affects: [05-04, 05-06, 05-20]
key-files:
  created:
    - supabase/migrations/20261016000100_decide_tables.sql
    - supabase/tests/database/54_decide_tables.test.sql
metrics:
  completed: 2026-10-16
requirements-completed: [DCU-03, DCU-04, DCU-07, DCU-10, DCU-24]
---

# Phase 5 Plan 03: Decide tables Summary

Five Decide tables (owner-private checks and links, per-user settings, household debts and statement periods) with RLS, narrow column grants, ownership/household guard triggers and a 37-assertion pgTAP file.

## Tasks
- Task 1: migration, commit fd0c62b
- Task 2: pgTAP 54_decide_tables, commit 08e4e11

## Verification
- `npm run lint:migrations` and `npm run verify:migrations` pass; acceptance greps match (5 tables, 5 RLS, 0 decision-column grants, 9 cascades, 2 paid_in_full grants).
- Not run: `supabase db reset --local` / `supabase test db` (Docker not running). CI's `rls` job runs pgTAP 54. Human/CI verification item: confirm 54 passes there (notably the 32 KB inputs case and the erasure cascade).

## Deviations from Plan
None in behaviour. Additions: FK-covering indexes (household_id, reopened_from, series_id, check_id, created_by) for lint/performance; guard_debt and guard_decide_link keep `created_by` pinning tolerant of ON DELETE SET NULL. The foreign-account period test expects 23503 (composite FK) since the household is A's.

## Known Stubs
None.

## Self-Check: PASSED
