---
phase: 10-system
plan: 02
subsystem: database
tags: [supabase, rls, pgtap, alerts, devices, archive]
requires: []
provides:
  - "devices, push_tokens, alert_settings, alert_prefs, alert_log, archived_months tables"
  - "register_push_token / unregister_push_token RPCs, alert_setting() defaults function"
affects: [10-03, 10-12, 10-15, 10-16, 10-22, 10-24]
key-files:
  created:
    - supabase/migrations/20261126000100_system_tables.sql
    - supabase/tests/database/120_system_tables.test.sql
key-decisions:
  - "DDL follows the plan contract exactly; no renames"
requirements-completed: [ACC-06, ACC-07, ALR-01, ALR-02, ALR-03, ALR-04, ALR-05, DAT-01]
duration: 15min
completed: 2026-11-22
---

# Phase 10 Plan 02: System tables Summary

Six owner-only RLS tables (devices, push_tokens, alert_settings, alert_prefs, alert_log, archived_months), session-cascading device and token rows, SECURITY DEFINER push-token RPCs that move a token to the next signed-in user, and a server-only `alert_setting()` defaults function.

## Tasks
1. pgTAP 120 (37 assertions) and migration 20261126000100 written together in one commit.

## Verification
- `npm run lint:migrations`: OK (114 files).
- **pgTAP not run locally**: Docker was not running, so `supabase db reset` and `supabase test db` were not executed. The SQL and pgTAP 120 are unverified against a live stack. The FK to `auth.sessions` (plan fallback condition) is therefore also unconfirmed. The orchestrator should run `npx supabase db reset && npx supabase test db` where Docker is available.

## Deviations from Plan
- RED phase skipped (no local stack to see it fail); test and migration committed together.
- Added extra indexes `devices_user_idx`, `push_tokens_user_idx`, `push_tokens_session_idx` (cascade/FK lookup performance; no contract change).
- `alert_setting()` is `stable` SQL using union-all with a not-exists default branch.

## Known Stubs
None.

## Self-Check: PASSED (files exist; lint OK)
