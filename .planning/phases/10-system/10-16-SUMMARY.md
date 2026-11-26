---
phase: 10-system
plan: 16
subsystem: system/archive
tags: [archive, month-switcher, level-registry, decide-invariance]
requires: [10-03, 10-04, 10-06]
provides: [archive feature row, useArchiveState, month sheet archive link and footer, D-13 proof]
affects: [09-LEVEL-MAP.md, featureRegistry, MonthRow, MonthSwitcher]
key-files:
  created:
    - src/features/archive/useArchiveState.ts
    - src/features/archive/ArchiveMonthConfirm.tsx
    - src/features/archive/__tests__/useArchiveState.test.tsx
    - src/features/archive/__tests__/archiveImportGuard.test.ts
    - src/features/decide/__tests__/archiveInvariance.test.tsx
    - src/features/record/activity/__tests__/MonthSwitcher.archive.test.tsx
  modified:
    - src/features/levels/featureRegistry.ts
    - src/features/levels/__tests__/featureRegistry.test.ts
    - .planning/phases/09-tiers-onboarding/09-LEVEL-MAP.md
    - src/i18n/locales/features/index.ts
    - src/services/analytics/catalogue.ts
    - src/features/record/activity/MonthSwitcher.tsx
    - src/features/record/activity/header/MonthRow.tsx
    - header MonthRow/ActivityHeaderBands tests and activityShellHarness.tsx (archive mock)
requirements: [DAT-01]
---

# Phase 10 Plan 16: Archive in the month switcher Summary

Archive is a level-4 System feature; past months get an Archive link in Activity's month sheet, archived months leave the archiver's switcher with an "Archived months (n)" footer, and Decide is proven unchanged by a fixture test, a fast-check property test and a static import guard.

## What was built
- Registry row `archive` (System, level 4, glyph history) and the exact 09-LEVEL-MAP row after undoHistory; `features.items.archive` copy; `'archive'` added to the analytics feature-id union (catalogue.ts) so FeatureId stays assignable.
- `useArchiveState()` returns `{ enabled, archived, count, shared, archive, restore }`; empty when the feature is off (archived months show normally). `shared` (household of 2+) drives the "Only you. Partners still see this month." line.
- `MonthSwitcher`: optional `archivable`, `onArchive`, `archivedCount`, `onOpenArchive` props; trailing Archive link on archivable rows, footer row. `MonthRow` filters with `visibleMonths`, shows `ArchiveMonthConfirm`, archives with an Undo toast (no haptic), moves selection to the nearest visible month, routes the footer to `/archive` (built in 10-24).
- D-13 proof: `archiveInvariance.test.tsx` (useDecideV3 over the demo fixture with the archivedMonths cache empty / populated / all / 25 random subsets: inputs and evaluation deep-equal) and `archiveImportGuard.test.ts` (no money module under decide, engine/decide, home, grow, data/queries, engine/month, engine/activity references archive; under src/features/record only MonthRow, MonthSwitcher and useActivityViewModel may; the checker is unit-tested with a fake importer). No Decide code was changed.

## Owner awareness: signed level map edited
Beyond the two places the plan names (the new archive row and the line-20 note), the same file's counts section had to move from 32 to 33 features (`33 features are listed`, `Everything: 33 of 33 on`; the other levels now read "of 33") and the "Not built" table row "Archive | Phase 10 builds it" was removed, otherwise the drift test (row count 32, count lines, not-listed ids) fails. The featureRegistry test was updated to match (33 rows, counts [5,19,29,33], `archive` no longer in the not-listed ids). Level counts at Basics, Everyday and Full picture are unchanged.

## Deviations from Plan
**1. [Rule 3 - Blocking] Existing Activity tests broke because MonthRow now reads feature access.** useArchiveState goes through useFeatureAccess, which reads many queries (useHoldsData) and useAuth. Added a `useArchiveState` mock (archive off) to MonthRow.test, ActivityHeaderBands.test and activityShellHarness.tsx (shared by the Activity screen tests).
**2. [Rule 3] Counts and not-listed edits to the level map** (see above).
**3. Archive link layout:** `Row` has no trailing-link slot, so a past month renders as a flex row of the existing Row plus a separate Pressable text link (label style, accent colour). Archive footer uses Row with chevron.

## Verification
- Passed: `src/features/levels` (8 suites, 145 tests), `useArchiveState`, `archiveImportGuard`, `archiveInvariance`, `MonthSwitcher.test`, `MonthSwitcher.archive`, `header/` (MonthRow, ActivityHeaderBands and the rest): all green. `tsc --noEmit` clean apart from the known expo-local-authentication error; eslint on touched files: 0 errors.
- All of src/features/record/activity/__tests__ plus record routes.test: 38 suites, 420 tests green.
- pgTAP: not applicable (no SQL in this plan).

## Notes for the orchestrator
- `/archive` route does not exist until 10-24; the footer pushes `'/archive' as Href`.
- Activity search filtering (`withoutArchivedRows`) is 10-24 Task 3; the import guard already allows `useActivityViewModel.ts`.
- 10-13 also edits files in the Activity area (useActivityViewModel); this plan did not touch that file.

## Self-Check: PASSED (files and commits verified below)
