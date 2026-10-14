---
phase: 03-shell
plan: 23
subsystem: home
tags: [home, quick-actions, coming-up, accounts-card, home-screen]
requires: [03-04, 03-05, 03-09, 03-11, 03-21, 03-22]
provides: [HomeScreen, QuickActions, ComingUpCard, AccountsCard, ProjectionDetailSheet]
affects: [03-13]
key-files:
  created:
    - src/features/home/QuickActions.tsx
    - src/features/home/AccountsCard.tsx
    - src/features/home/ComingUpCard.tsx
    - src/features/home/ProjectionDetailSheet.tsx
    - src/features/home/HomeScreen.tsx
    - src/features/home/__tests__/QuickActions.test.tsx
    - src/features/home/__tests__/AccountsCard.test.tsx
    - src/features/home/__tests__/ComingUpCard.test.tsx
    - src/features/home/__tests__/HomeScreen.test.tsx
requirements-completed: [HOME-01, HOME-02, HOME-03, HOME-04, NAV-06, DSG-07]
completed: 2026-10-14
---

# Phase 3 Plan 23: Home cards and HomeScreen Summary

Home is now assembled: quick actions, This month, Coming up (Pay on recorded rows, read-only detail for projections) and an Accounts summary under the shared TabRootScreen header with pull-to-refresh keys.

## Tasks

1. QuickActions and AccountsCard: 1c01d2a
2. ComingUpCard, ProjectionDetailSheet, HomeScreen: see git log (feat(03-23): Coming up card...)

## Notes

- Pay bills sets the activity focus (Unpaid, Home's month) before `router.navigate('/activity')`; Add uses `openEntry`; Import pushes `/import` with `entry: 'you'`.
- Coming up shows Pay only for `kind === 'row'` (D-34, T-03-23-01). Unconverted rows show the native amount plus `activity.balance.waiting`. Overdue uses `activity.tag.overdue` in danger.
- HomeScreen calls `useAccounts` as well as the view model so archived accounts still resolve names in the transfer-delete prompt and projection detail; same query key, no extra fetch.
- Projection detail labels reuse `record.sheet.field.*` and `activity.detail.empty`; no new copy keys.
- HomeScreen test replaces TabRootScreen and all children with probes; order, refreshKeys and overlay hosting are asserted against those.

## Deviations from Plan

- Worktree was reset to fba4769 per the branch check (merge-base differed).
- No dedicated ProjectionDetailSheet test (not in the plan's file list; the sheet is a thin DetailSheet wrapper and is covered only through type checks and the HomeScreen probe).

## Known Stubs

None.

## Verification

`npx jest src/features/home` (all suites), `npx tsc --noEmit` (only the environmental expo-blur error in TabBar.tsx), `npx eslint src/features/home` (0 errors; 4 require-import warnings in the HomeScreen test mocks).

## Self-Check: PASSED
