---
phase: 09-tiers-onboarding
plan: 18
subsystem: export/plans
tags: [csv, export, locked-writes, offline-saves, gdpr-portability]
requires: [09-09, 09-16]
provides: [exportCsv, buildCsvFiles, toCsv, ExportScreen, OfflineSavesNotice, OfflineSavesChip, LockedWritesSheet, useOfflineSavesCount]
affects: [09-19]
key-files:
  created:
    - src/features/export/csvSerialize.ts
    - src/features/export/csvExport.ts
    - src/features/export/ExportScreen.tsx
    - app/(app)/export.tsx
    - src/features/plans/OfflineSavesNotice.tsx
    - src/features/plans/OfflineSavesChip.tsx
    - src/features/plans/LockedWritesSheet.tsx
    - src/features/export/__tests__/csvSerialize.test.ts
    - src/features/export/__tests__/csvExport.test.ts
    - src/features/plans/__tests__/OfflineSavesNotice.test.tsx
  modified:
    - src/features/record/activity/header/ActivityHeaderBands.tsx
    - app/(app)/_layout.tsx
    - src/i18n/locales/en.ts
decisions:
  - "Export reads stay open: ExportScreen never checks writable; plan state only feeds the csv_exported { locked } event"
  - "Kept writes export as saved-on-this-phone.csv (kept_at, kind = mutationKey joined with '.', details = JSON of variables)"
metrics:
  tasks: 2/2
  commits: [67d1d96c, a698389a]
requirements: [TIER-09]
---

# Phase 9 Plan 18: CSV export and saved-on-this-phone notice Summary

A CSV export that works in every plan state (one file per EXPORT_MANIFEST table, paged by 1000, plus saved-on-this-phone.csv for lock-kept writes), an export screen at `/export`, and the D-40 notice, Activity count chip and kept-items sheet.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 CSV serializer and exporter | 67d1d96c | `toCsv` (quoting, CRLF, formula-injection guard, integers untouched), `buildCsvFiles`, `exportCsv` (cache folder, Android folder pick, iOS share, folder deleted after) |
| 2 Export screen, notice, sheet, chip | a698389a | `ExportScreen` + route, `OfflineSavesNotice` (hidden in sample), `OfflineSavesChip`, `LockedWritesSheet` (no delete) |

## Verification
- jest: `src/features/export` (10 tests) and the notice/export-screen test plus ActivityHeaderBands test (19 tests) pass.
- eslint clean on the plan's files. tsc and depcruise: see Self-Check below; any error from the missing `react-native-purchases` package is the junctioned node_modules and not from this plan.

## Deviations from Plan

1. [Rule 3] `ActivityHeader.tsx` does not exist; the Activity header is `src/features/record/activity/header/ActivityHeaderBands.tsx`, which carries the chip.
2. [Rule 3] The chip lives in its own `OfflineSavesChip.tsx`, not in `OfflineSavesNotice.tsx`: importing the notice pulled `usePlanState` (and the Supabase env check) into the existing ActivityHeaderBands test and broke it. The notice still exports `useOfflineSavesCount`.
3. [Rule 2] Added `sync.exportFailed` ("The export could not be made. Nothing was changed.") for a failed export toast. 09-WORDING.md has no failure line; this is Claude-drafted and needs sign-off. It sits in the `sync` namespace so the phase-9 copy test is unaffected.
4. [Interpretation] The chip is a small custom Pressable (glyph plus count) because `Chip` has no icon slot. Its a11y label reuses `lock.savedOffline.title` and `.body`; no new copy.
5. [Interpretation] Entity labels in the kept-items sheet come from the mutation key head (`custom-currencies` -> `custom_currencies`) through `failedEntityKey`; unknown heads read "Unknown" per that map.
6. [Interpretation] iOS shares each CSV in turn through `Share.share({ url })`; `expo-sharing` is not installed. Android saves into a folder picked with `Directory.pickDirectoryAsync()`. Neither path was run on a device here.
7. Added `<Stack.Screen name="export" />` in the (app) layout.

## Known Stubs
None. 09-19 still has to place `OfflineSavesNotice` on Home.

## Threat model
T-09-62 (reads as the signed-in user under RLS), T-09-63 (apostrophe guard, tested), T-09-64 (cache folder deleted in `finally`), T-09-65 (screen never reads `writable`; tested with a locked plan) are covered.

## Self-Check: PASSED (files and commits present; tsc/depcruise result reported in the hand-back)
