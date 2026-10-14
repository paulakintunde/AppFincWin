---
phase: 03-shell
plan: 35
subsystem: navigation
tags: [gap-closure, G3, H7, L13]
requirements: [NAV-02, HOME-01]
key-files:
  created: [src/features/record/import/importReturn.ts, src/features/record/import/__tests__/importReturn.test.ts]
  modified: [app/(app)/import.tsx, src/features/home/QuickActions.tsx, src/features/record/entry/ShellEntryHost.tsx, app/(app)/(tabs)/activity.tsx, app/(app)/accounts/index.tsx, src/shell/__tests__/shellNavigation.test.tsx, src/features/record/__tests__/routes.test.tsx]
metrics:
  completed: 2026-10-14
---

# Phase 3 Plan 35: Import return and pushOnce call sites Summary

Import finishes with `canDismiss ? dismissTo : replace` via importReturn.ts, so the root state holds exactly one (tabs); Home-started imports return to Home via an allow-listed `from` param; remaining tap-driven pushes use pushOnce.

## Commits
- 82bc596: importReturn helper, import route, router tests A/B/C (one (tabs) route proven on the real layouts)
- f0b20f0: QuickActions (from=home, pushOnce, ACTIVITY_HREF, PRESSED_OPACITY), ShellEntryHost origin from useBackHistory, Activity links and Accounts row via pushOnce
- final commit: routes.test.tsx adjustments

## Deviations from Plan
- [Rule 3] src/features/record/__tests__/routes.test.tsx (not listed) asserted the old replace/push behaviour; updated the router mock (canDismiss false) and spaced the two Activity pushes past the pushOnce guard.
- ShellEntryHost tests use ShellTestProviders' backHistory option (default current is Home) instead of mocking the provider.
- No dedicated double-press tests for the Activity links / Accounts row (covered by pushOnce's own tests); QuickActions and ShellEntryHost double-press are tested.

## Verification
tsc clean, eslint 0 errors, depcruise clean, jest src/shell src/features app: all pass after the routes.test fix (re-ran routes.test only).

## Self-Check: PASSED
