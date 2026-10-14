---
phase: 03-shell
plan: 33
subsystem: shell
tags: [gap-closure, tabSlide, activityFocus, fab, back-history]
requirements: [NAV-01, NAV-02, NAV-05, HOME-02]
key-files:
  modified:
    - src/shell/tabBar/tabSlide.ts
    - src/shell/backHistory/BackHistoryProvider.tsx
    - src/state/activityFocus.ts
    - src/shell/fab/FabProvider.tsx
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 33: Shell state hygiene (L1, L4, L8) Summary

tabSlide is wiped on sign-out and a no-op back switch clears its flags, the shared month drops a stale pick on month rollover, and a screen's FAB cleanup only clears its own config.

## Tasks

1. L1 (commit cbf05ee): `clearBackStep()` and a `tab-slide` wipe handler in tabSlide.ts. goBack's switchTab branch checks after two animation frames; if the location is unchanged it clears `pendingBackRef` and calls `clearBackStep()`. Tests cover the wipe, clearBackStep, and both rAF paths (changed / unchanged location).
2. L4 + L8 (commit 2a2329c): activityFocus gains `anchor` and `lastFallback`; `useSelectedMonth` drops a pick made under an earlier fallback month. FabProvider gains `clearScreenFab(config)` (identity compare), used by `useRegisterFab` cleanup. Tests cover rollover, unchanged fallback, post-rollover pick, wipe resetting anchor, and A-unmount-while-B-registered.

## Deviations from Plan

None to the plan's logic. The L8 test unmounts A while B is registered (rather than reordering cleanup within one commit, which React does not allow); it fails against the old `setScreenFab(null)` cleanup.

## Verification

- jest: tabSlide, backHistory, activityFocus, fab suites pass; `npm run -s depcruise` clean; eslint clean on touched files.
- `tsc --noEmit`: only the known environmental `expo-blur` error in TabBar.tsx.

## Self-Check: PASSED
