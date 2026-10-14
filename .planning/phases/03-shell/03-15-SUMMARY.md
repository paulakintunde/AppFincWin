---
phase: 03-shell
plan: 15
subsystem: shell
tags: [activity, fab, entry-host, tab-root]
requires: [03-07, 03-11, 03-12, 03-13, 03-21]
provides:
  - "Activity as a shell tab root (header, avatar, refresh, scroll-to-top, bulk-select FAB hiding)"
  - "ShellEntryHost: FAB default action, quick actions and the one app-wide TransactionSheet"
affects: [home quick action (openEntry), tabs layout]
key-files:
  created:
    - src/features/record/entry/ShellEntryHost.tsx
    - src/features/record/entry/__tests__/ShellEntryHost.test.tsx
    - src/features/record/activity/__tests__/activityShellHarness.tsx
  modified:
    - src/features/record/activity/ActivityScreen.tsx
    - app/(app)/(tabs)/activity.tsx
    - app/(app)/(tabs)/_layout.tsx
    - src/features/record/activity/__tests__/{ActivityScreen,ActivityIntegration,ActivityViews,ActivityNoOffers,unpaidFocus}.test.tsx
    - src/features/record/__tests__/routes.test.tsx
    - src/shell/__tests__/shellNavigation.test.tsx
    - src/features/record/setup/__tests__/setup.test.tsx
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 15: Activity becomes a tab root Summary

Activity now uses `useTabRootChrome` (large/compact header with avatar, pull-to-refresh with the shell toast, scroll-to-top) and `ShellEntryHost` gives the FAB, its quick menu and Home's Add one hosted TransactionSheet.

## Tasks
1. Activity tab root - commit 8fcbdd6. ActivityScreen is a plain View holding an Animated FlashList (and an Animated.ScrollView for Calendar); all controls moved into the list header. Add pill, Add sheet, `onOpenYou` and the You link removed. `useHideFab('bulkSelect', selection.active)`. refreshKeys cover month transactions, series, fx, months and accounts.
2. ShellEntryHost - commit 18e3488. Registers default action (new money-out), quick actions addExpense / addIncome / transfer / importStatement (no newCheck), holds `useHideFab('entryFlow')` while open, mounted in `(tabs)/_layout` after FabQuickMenu.

## Deviations from Plan
- **[Rule 3 - Blocking]** The tabs layout now imports ShellEntryHost -> TransactionSheet -> Supabase client (env check). `shellNavigation.test.tsx` and `setup.test.tsx` stub ShellEntryHost as a leaf (commit 18e3488 and the final docs commit for setup.test).
- Test infrastructure: a shared `activityShellHarness.tsx` (real chrome, stubbed expo-router/a11yFocus/useShellRefresh/profile/sync/auth; FlashList mock now renders header and exposes refresh/scroll props) replaces per-file FlashList mocks in five Activity test files. Not listed in the plan but required because the controls moved into the list header.
- `react-hooks/refs` disabled at file level in ActivityScreen (same justification as TabRootScreen).
- Unused locale keys `activity.add` / `activity.you` / `activity.title` left in en.ts (harmless; not removed).

## Verification
Full `npx jest --silent`: all suites pass (after the setup.test stub); `tsc --noEmit` clean; eslint 0 errors; `npm run depcruise` no violations.

## Known Stubs
None.

## Self-Check: PASSED
