---
phase: 10-system
plan: 17
subsystem: data-export
tags: [export, csv, diagnostic, rpc, pgtap, archive]
requires: [10-03, 10-04]
provides: [my_server_export RPC, migration-aware export guard, server-records.csv, archived-months export filter, diagnostic export]
affects: [10-18 (data-import route), 10-24 (Export the archive link)]
key-files:
  created:
    - supabase/migrations/20261126000450_server_export.sql
    - supabase/tests/database/126_server_export.test.sql
    - src/data/__tests__/exportManifestMigrations.test.ts
    - src/features/export/exportFiles.ts
    - src/features/export/parseMonthsParam.ts
    - src/features/export/__tests__/csvExport.serverRecords.test.ts
    - src/features/export/__tests__/csvExport.archiveMonths.test.ts
    - src/features/export/__tests__/ExportScreen.test.tsx
    - src/features/diagnostic/diagnosticFields.ts
    - src/features/diagnostic/buildDiagnostic.ts
    - src/features/diagnostic/DiagnosticScreen.tsx
    - src/features/diagnostic/__tests__/buildDiagnostic.test.ts
    - src/features/diagnostic/__tests__/DiagnosticScreen.test.tsx
    - app/(app)/diagnostic.tsx
  modified:
    - src/data/exportManifest.ts
    - src/features/export/csvExport.ts
    - src/features/export/ExportScreen.tsx
    - app/(app)/export.tsx
    - src/i18n/locales/system/ownData.ts
metrics:
  completed: 2026-11-23
---

# Phase 10 Plan 17: Server export, coverage guard and diagnostic export Summary

Complete CSV export coverage (DAT-02) with a migration-aware guard and a server-records file, an archived-months filter for Export, and a diagnostic export (DAT-06) built from a single allow-list.

## Commits
- c2d87ff2 feat(10-17): my_server_export RPC and migration-aware export coverage guard
- 883f86a3 feat(10-17): server records and archived-months filter in CSV export, file list on Export screen
- feat(10-17): diagnostic export module, screen and route (task 3, see git log)

## What was built
- `my_server_export()` (security definer, search_path empty, execute to authenticated only): the caller's `decide_shadow_runs`, the `household_plans` of their households and their own `plan_events`.
- `exportManifestMigrations.test.ts` reads every migration: each `create table/view public.x` must be in EXPORT_MANIFEST or NOT_USER_DATA, and each manifest column must appear in that table's create/alter statements (SQL comments stripped first). The checker function is itself tested with a fake table.
- `csvExport`: optional `fetchServerRecords` adds `server-records.csv` (table_name,row JSON); `months` option filters transactions per month through `dateRange`, child tables client-side by transaction id, accounts and categories in full, nothing else. Folder `fincwin-archive-export-YYYY-MM-DD`. Constants live in `exportFiles.ts` (re-exported from csvExport) so the screen can list files without the file system.
- `ExportScreen`: collapsible file list, Import from CSV link to `/data-import`, `system.archive.exportScope` heading when filtered. Route parses `?months=` through `parseMonthsParam` (only `/^\d{4}-(0[1-9]|1[0-2])$/` items).
- Diagnostic: `DIAGNOSTIC_FIELDS` (15 keys), `DIAGNOSTIC_ROWS` partitions them into the UI rows, `buildDiagnostic` (pure; no place in its deps for a record; error codes regex-filtered and capped at 20; row counts integers per safe table name), `rowCountsFromCache` (array lengths only), screen with preview sheet, confirm, `mailto:` send, `Share` save copy, soft WarningCard on failure.

## Tests run
- `npx jest src/data/__tests__/exportManifest.test.ts src/data/__tests__/exportManifestMigrations.test.ts`: pass (10 + 5)
- `npx jest src/features/export src/features/plans/__tests__/OfflineSavesNotice.test.tsx`: pass (6 suites)
- `npx jest src/features/diagnostic src/i18n`: pass (copy guards included)
- `npm run lint:migrations`: OK
- tsc and eslint on touched files: see below
- pgTAP 126: NOT run here (wave 2 rule). pgTAP run by orchestrator after merge.

## Deviations from Plan
1. [Rule 1 - Spec vs schema] `plan_events` has no household column (it is keyed by `app_user_id`, a text user id, with `type`, `environment`, `received_at`, `applied_at`). The RPC returns the caller's own events (`app_user_id = auth.uid()::text`) as kind/environment/dates, not "events for households where the caller is a member". No payload, rc_event_id or other ids are exported. `household_plans` rows also carry `household_id` (the caller's own household) in addition to the listed columns.
2. [Rule 3] The guard found 11 older server-only tables with no src/db module; each was read and marked NOT_USER_DATA with a reason: app_config, currencies, debt_line_applied, fx_alerts, fx_rate_fetch_failures, fx_rate_holds, fx_rate_lookups, fx_rates, fx_resolve_calls, redeem_attempts, settlement_nudges. Plus the four Phase 10 entries from the plan.
3. [Rule 3] `fetchServerRecords` is optional in BuildDeps so the existing full-export tests stay unchanged; `exportCsv` always supplies it for a full export.
4. [Rule 2] Added copy keys to 10-04's `ownData.ts`: `exportFiles.*` (file list toggle, intro, server-records label, Import link) and `diagnostic.rowCounts`, `rowCountsMeta`, `mailSubject` (a counts row was needed so every DIAGNOSTIC_FIELDS key has a row, per UI-SPEC 10 item 6). Draft wording, subject to the owner sign-off like the rest of 10-04.
5. `expo-device` is not installed, so the device model comes from `Platform.constants.Model` (Android) with a generic label on iOS. The diagnostic "tight WarningCard" is `WarningCard tone="soft"` (the component's tones are hard/soft).
6. `parseMonthsParam` lives in `src/features/export/parseMonthsParam.ts` rather than the route file (route files should export only the default).

## Notes for the orchestrator
- Run pgTAP 126 (and 101 for export-tables markers; unchanged) after merge. Test is written to delete any auto-created household_plans row for its two users before inserting; if the signup trigger does not create a household for a new auth user in this repo's version, adjust the seed.
- Link targets pending: `/data-import` (10-18) and the Export the archive link (10-24) pass `?months=`; the Diagnostic row in You is not added by this plan.
- No packages installed.

## Known Stubs
None.

## Threat Flags
None beyond the plan's register (T-10-17-01..05 mitigated).

## Self-Check: PASSED (files exist, commits present)
