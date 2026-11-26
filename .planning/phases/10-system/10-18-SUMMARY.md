---
phase: 10-system
plan: 18
subsystem: data-import
tags: [import, csv, DAT-03, offline-queue]
requires: [10-04, 10-07, 10-13]
provides: [DataImportScreen, /data-import route, toCreateInputs, buildTemplate]
affects: [10-27 (You row links to /data-import)]
key-files:
  created:
    - src/features/dataImport/importRows.ts
    - src/features/dataImport/templates.ts
    - src/features/dataImport/files.ts
    - src/features/dataImport/DataImportScreen.tsx
    - src/features/dataImport/DataImportPreview.tsx
    - src/features/dataImport/__tests__/importRows.test.ts
    - src/features/dataImport/__tests__/DataImportScreen.test.tsx
    - app/(app)/data-import.tsx
  modified:
    - src/i18n/locales/system/ownData.ts
requirements-completed: [DAT-03]
completed: 2026-11-23
---

# Phase 10 Plan 18: Import from CSV Summary

People can bring accounts, goals, debts and investments in from a CSV (including a file saved by FincWin Export) through the existing queued create mutations, with a preview first and an up-front refusal over the 500-change cap.

## Commits
- 39e75f41 feat(10-18): row mapping to existing create inputs and import templates
- 17aeb98f feat(10-18): Import from CSV screen, preview and route

## What was built
- `importRows.ts` (pure): `reportRows` gives each row ready / check (first reason) / exists; `toCreateInputs` returns the create inputs for ready rows plus overridden "exists" rows. File ids and account links are never reused (T-10-18-02); money passes through as the engine's integer minor units; values a create would refuse (negative limits, out of range) are flagged "A value is out of range" instead of throwing.
- `templates.ts`: header = export column order without server bookkeeping, plus one example row that itself imports with no issues (tested for all four tables). `files.ts`: picker read (5 MB cap, cache copy removed) and template save (Share on iOS, folder picker on Android).
- `DataImportScreen` / `DataImportPreview`: UI-SPEC section 9: four segments, template card, Choose a file, preview summary, Check badge plus reason, Already exists with an Import anyway switch, `Import {n} rows`, hapticMilestone and the "{n} goals added" toast, one plain WarningCard for any whole-file failure. The only `canAdd(` call is before any create; a refusal shows QueueNote (blocked) and writes nothing.
- Copy: added reason and kind keys (nameMissing, badAmount, badDate, badChoice, badId, outOfRange, kind*, templateSaved) to `system.ownData.dataImport`.

## Verification
- `npx jest src/features/dataImport`: importRows 12 tests, DataImportScreen 6 tests, all pass.
- `tsc --noEmit`: no errors (the known expo-local-authentication error filtered). eslint on touched files: clean.
- Acceptance greps: no `parseFloat`; one `canAdd(` line in the screen; route file exists.

## Deviations from Plan
- [Scope] The preview has no per-row fix sheet (UI-SPEC says problem rows reuse the statement import's row-edit sheet). That sheet is tied to statement lines; problem rows are skipped with their reason and the person fixes the file and picks it again. Flag for owner if the edit sheet is wanted.
- [Scope] Mapped fields are the ones the existing create inputs accept: accounts (name, kind, currency, opening balance, limits, shared), goals (name, currency, target, monthly amount, ready by, opening saved, locked, protect, up-front only), debts (name, kind, currency, balance, rate, minimum, due day, started balance, card pays-in-full, secured), holdings (name, type, currency, value, as-of date, put-in, monthly amount, day, rate). Other export columns (icons, colours, goal bucket/kind, safety-net flag, account links, use/joint fields) are accepted in the header but not applied.
- Added `files.ts` (not in files_modified) to keep file I/O out of the screen.

## Known Stubs
None.

## Notes for the orchestrator
- The 10-17 Export screen already links to `/data-import`; the You row is 10-27.
- pgTAP not involved.

## Self-Check: PASSED
