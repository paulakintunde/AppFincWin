---
phase: 02-record
plan: 42
subsystem: database
tags: [fx, pg_cron, migration, pgtap]
requires: [02-41]
provides: [daily FX crons unscheduled, monitor-only functions revoked and deprecated]
key-files:
  created:
    - supabase/migrations/20261007000300_fx_retire_daily_jobs.sql
    - supabase/tests/database/41_fx_retire_daily_jobs.test.sql
  modified:
    - supabase/tests/database/10_fx_monitor_jobs.test.sql
    - supabase/tests/database/13_restamp_window.test.sql
    - supabase/tests/database/20_fx_monitor_secret.test.sql
decisions:
  - fx_pending_rows_count / fx_restamp_pending revoked and marked DEPRECATED instead of dropped (user decision 2026-10-08); drop at next min_supported_version raise
metrics:
  completed: 2026-10-08
---

# Phase 2 Plan 42: Retire daily FX jobs Summary

Migration 20261007000300 unschedules fx-sync-daily and fx-monitor-daily (guarded, idempotent), revokes all execute rights on the two monitor-only functions and marks them DEPRECATED, and retires the staleness column by comment. pgTAP 41 proves it and 10/13/20 are trimmed.

## Deviations from Plan

**[Rule 4 - user decision] Drop replaced by revoke + deprecate.** `lint:migrations` rejects `drop function` without a min_supported_version raise. User chose "revoke, drop later" on 2026-10-08. Test 41 asserts no role (anon, authenticated, service_role) can execute either function and the DEPRECATED comment is present. Plan truth line, 02-REVIEW-FOLLOWUPS item 22 and the decision consequences were updated.

## Gates
Full pgTAP PASS (41 files, 760 tests); lint:migrations OK (one non-fatal warning because the mandated comment text contains "min_supported_version"); verify:migrations, check:money-mirror, check:recurring-mirror pass.

## Known Stubs
None.

## Self-Check: PASSED
