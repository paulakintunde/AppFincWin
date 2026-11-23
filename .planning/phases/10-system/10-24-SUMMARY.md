---
phase: 10-system
plan: 24
subsystem: system/archive
tags: [archive, write-gate, activity-search, restore, export]
requires: [10-03, 10-04, 10-06, 10-13, 10-16, 10-17]
provides: [ArchiveScreen, ArchivedMonthScreen, archived write-gate variant, routes /archive and /archive/[month], archived months out of Activity search]
affects: [useWriteGate, lockTypes, useActivityViewModel, activityShellHarness]
key-files:
  created:
    - src/features/archive/ArchiveScreen.tsx
    - src/features/archive/ArchiveMonthRow.tsx
    - src/features/archive/ArchivedMonthScreen.tsx
    - src/features/archive/archivedMonthGate.tsx
    - src/features/archive/monthLabel.ts
    - app/(app)/archive/index.tsx
    - app/(app)/archive/[month].tsx
  modified:
    - src/features/plans/useWriteGate.tsx
    - src/features/plans/lockTypes.ts
    - src/features/record/activity/useActivityViewModel.ts
    - src/features/record/activity/__tests__/activityShellHarness.tsx
    - src/i18n/locales/system/archive.ts
requirements: [DAT-01]
---

# Phase 10 Plan 24: Archive list and read-only archived month Summary

The Archive list, the read-only archived-month view with restore (one or all), an 'archived' write-gate variant, and archived months leaving Activity search.

## What was built
- **Write gate (Task 1):** `LockVariant` gains `'archived'`. `ArchivedMonthGateProvider` (archivedMonthGate.tsx) holds the restore sheet ('Restore to change this month', 'Restore month', 'Keep reading'); `useWriteGate` returns gated, variant `'archived'`, a11ySuffix 'restore to change' inside it. The plan lock keeps precedence. Outside a provider behaviour is unchanged (all 20 plans suites, 179 tests, pass).
- **Screens (Task 2):** `ArchiveScreen` lists archived months newest first (each `ArchiveMonthRow` shows 'In {$} · Out {$}' from `monthTotals` over the month's rows, same row mapping as Activity), Restore all behind a ConfirmSheet, 'Export the archive' pushing `/export?months=<sorted, comma-joined>` (only shown when something is archived), empty state. `ArchivedMonthScreen` shows the month title, `StatusBadge` archived, the 'This month is archived...' card with instant 'Restore month' (restore, toast, `setSelectedMonth`, `router.replace('/activity')`). Personal rows open a detail sheet inside the archive scope (every write button explains the restore step; quick Mark paid opens the restore sheet). Shared rows (`is_shared`) get 'Shared row. Still editable.' under them and open the normal detail sheet outside the scope, with the normal entry sheet. Both screens redirect to Activity when archive is off; `/archive/[month]` validates the param with `/^\d{4}-(0[1-9]|1[0-2])$/` (T-10-24-04), and the month screen also redirects when the month is not archived.
- **Search (Task 3):** `useActivityViewModel` filters `search.rows` with `withoutArchivedRows(…, useArchiveState().archived)` before narrowing and returns `search: { ...search, rows }`; the count and totals follow because they derive from `narrowed`. Restoring (archived set emptied) brings rows back on the next render with no search refetch. Month-scope search, monthView, balances, totals and Decide untouched. 10-13's `useQueueGuard` call kept.

## Verification (tsc: clean apart from the known expo-local-authentication error, after a test-helper type fix)
- `src/features/plans`: 20 suites, 179 tests pass (incl. new `useWriteGate.archived.test.tsx`).
- `ArchiveScreen.test`, `ArchivedMonthScreen.test`: 10 tests pass.
- `activitySearch.archive.test` (2 tests), `activityTools.test`, `ActivityScreen.test`, `archiveImportGuard.test`, `archiveInvariance.test`: all pass.
- eslint on touched files: 0 errors (warnings only for `require()` inside jest mock factories, the repo's existing pattern).
- tsc: see Notes (one genuine error found and fixed during the work: `'meta'` is not a text role; `'label'` used).
- pgTAP: not applicable (no SQL).

## Deviations from Plan
**1. [Rule 3 - Blocking] Added a copy key** `system.archive.rowTotals` ('In {{income}} · Out {{spend}}') to src/i18n/locales/system/archive.ts; 10-04 had no key for the row sub-line.
**2. [Rule 3] Test harness:** `activityShellHarness.tsx` now exposes `setArchiveStateForTests(archived)` (archive off by default, so existing Activity tests are unchanged); needed because the harness's own `jest.mock` of `useArchiveState` would override any per-file mock.
**3. Shared-row label** is drawn as a `label`-role text under each shared row (ActivityRow has no meta slot for it), not inside the row.
**4. Month figures** in the Archive row use rows only (no projections), so they show money recorded, not "still to come". Household share-scoping (Activity's Mine figure) is not applied; the row shows the line totals.

## Known limits
- Read-only is a client promise, not a database rule (RESEARCH Pattern 9; T-10-24-03 accepted): a queued write from another device is never refused.
- The archive restore sheet stacks above the detail sheet when Edit is tapped (the detail stays open behind it).

## Threat Flags
None.

## Notes for the orchestrator
- Full-project `tsc --noEmit` was started late; if it reports anything beyond the known expo-local-authentication error, it is outside the files covered by the jest runs above.
- No installs needed; no SQL; nothing to run against Supabase.

## Self-Check: PASSED
Created files exist; commits a14c89c5, 023c8d0d, e849ad03 present on this branch.
