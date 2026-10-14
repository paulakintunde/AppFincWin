---
phase: 03-shell
plan: 13
subsystem: shell
tags: [router, tabs, expo-router, navigation]
requires: [03-05, 03-06, 03-07, 03-08, 03-10, 03-12, 03-19, 03-23]
provides: [tabs-group, home-route, APP_HOME_HREF-home, ACTIVITY_HREF, shell-mounting, shellNavigation-test]
key-files:
  created:
    - app/(app)/(tabs)/_layout.tsx
    - app/(app)/(tabs)/home.tsx
    - src/shell/__tests__/shellNavigation.test.tsx
  modified:
    - app/(app)/(tabs)/activity.tsx (git mv from app/(app)/activity.tsx, gate removed)
    - app/(app)/_layout.tsx
    - src/features/auth/appHome.ts
    - src/features/you/YouScreen.tsx
    - src/features/record/setup/SetupHistoryScreen.tsx
    - src/features/navigation/swipeBackGesture.ts
metrics:
  tasks: 3
  completed: 2026-10-14
---

# Phase 3 Plan 13: Router wiring Summary

Expo Router now boots signed-in users into a `(tabs)` JS Tabs group (Home, Activity) with the custom TabBar, TabSlideIn, FAB and quick menu, while every detail screen stays in the outer `(app)` Stack so it covers the bar; the shell providers, Android back handler and toast overlay are mounted once in the `(app)` layout.

## Commits
- fe7ea2a Task 1: tabs group, Home and Activity routes, first-account gate in the tabs layout, `APP_HOME_HREF` -> `/home`, `ACTIVITY_HREF`, SwipeBack exclusion `(tabs)`, setup lands on Home.
- d7d5af3 Task 2: `(app)` layout wrapped in BackHistoryProvider, ShellLayoutProvider, `SheetOverlayProvider overlay={SheetToastOverlay}`, `AndroidBackHandler`; `(tabs)` replaces `activity` in the Stack; You's Activity row uses `ACTIVITY_HREF`; You has a compact Back button.
- 5e42636 Task 3: `shellNavigation.test.tsx`, 9 router-level tests on the real layouts (land on Home, D-02 tab visibility, D-06 back steps 2/3/4, D-22 detail covers tabs and back returns, You back, SwipeBack exclusion, first-account gate).

## Verification
Full `npx jest --silent`: 331 suites, 7971 tests passed. `tsc --noEmit` clean, eslint 0 errors, `npm run depcruise` no violations.

## Deviations from Plan
- [Rule 3] `routes.test.tsx` and `setup.test.tsx` needed mocks for the new providers / tabs layout dependencies (BackHistoryProvider, ShellLayoutProvider, AndroidBackHandler, `SheetToastOverlay` export, TabBar/Fab/FabQuickMenu/FabProvider/js-tabs) once the real layouts changed; the `routes.test` import path update was folded into the Task 1 commit so tsc stayed green.
- Test harness findings (not plan changes): in this RNTL 14 setup `renderRouter` returns a promise-like object carrying `getPathname`/`getRouterState`, and the `toHavePathname` matcher has no TypeScript typing, so the test keeps the pre-await handle and uses `expect(r.getPathname()).toBe(...)`. React Navigation also registers its own `hardwareBackPress` listener, so the test dispatches newest-first until one returns true (as RN does) rather than using only the newest listener. The Android back/tab-switch asserts need `await act(async ...)`.
- All router flows were drivable under `renderRouter`; no skipped tests and nothing added to 03-14's checklist.

## Known Stubs
None.

## Self-Check: PASSED
