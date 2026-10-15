---
phase: 03-shell
plan: 37
subsystem: shell
tags: [sync, G5, D-15, gap-closure]
requires: [03-25, 03-30, 03-32]
provides: ["SyncProblemLine on all pushed outer screens"]
key-files:
  modified:
    - src/features/record/accounts/AccountDetailScreen.tsx
    - src/features/record/categories/CategoriesScreen.tsx
    - src/features/record/categories/RulesScreen.tsx
    - src/features/record/history/HistoryScreen.tsx
    - src/features/record/import/ImportScreen.tsx
    - src/features/record/setup/SetupAccountScreen.tsx
    - src/features/record/setup/SetupHistoryScreen.tsx
metrics:
  completed: 2026-10-14
---

# Phase 3 Plan 37: SyncProblemLine on pushed screens Summary

`<SyncProblemLine inset={false} />` is now the first child of `<Screen>` on all seven pushed outer screens (account detail found-branch, categories, rules, history, import, both setup steps), closing the outer-screen half of G5 and, with 03-30/03-31/03-32, threat T-03-10-02 (OT-01). The stale first-account-gate comment in SetupAccountScreen (L13) now points at the tabs layout (D-38).

Commit: 324901c (single task).

## Verification
tsc clean; eslint 0 errors (pre-existing warnings only); depcruise clean; full `jest src app` 325 suites / 7964 tests pass.

## Notes
- AccountsScreen already had its line from 03-30 (verified, not duplicated). YouScreen and the tab roots untouched.
- consent.tsx deliberately excluded: it is shown before first account setup, before there is any synced data, and was not in the plan's file list.
- Tests: representative offline test on History, queued test plus all-well test on Categories. Because the screens now mount useSyncStatus (needs a QueryClient), a `useSyncStatus` mock was added to setup.test.tsx, ImportScreen.test.tsx and rules.test.tsx.

## Deviations
[Rule 3 - Blocking] Added useSyncStatus mocks to three additional test files (setup, import, rules) that failed with "No QueryClient set" once the line mounted. No production deviations.

## Self-Check: PASSED
