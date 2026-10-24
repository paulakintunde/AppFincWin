---
phase: 05-decide-ui
plan: 60
subsystem: ui
tags: [decide, hint, asyncstorage, D-75]
requires: [05-54]
provides:
  - decideHintsKey, loadFoldHintSeen, markFoldHintSeen (per-user, per-device seen flag)
  - useFoldHint(userId) returning visible and dismiss
  - FoldHint tile
affects: [05-74, 05-59]
key-files:
  created:
    - src/features/decide/hints/decideHints.ts
    - src/features/decide/hints/useFoldHint.ts
    - src/features/decide/ui/FoldHint.tsx
    - src/features/decide/hints/__tests__/decideHints.test.tsx
decisions:
  - "The hook derives visibility from a load result keyed by userId plus a dismissed-for userId, so a user switch never shows another user's state and no setState runs synchronously in an effect"
  - "Fade-out uses Reanimated exiting on a conditionally rendered Animated.View; under reduced motion no entering or exiting is set"
requirements: [DCU-14, DCU-11]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 60: First-run hint Summary

The step 3 hint "Tap a row to see the detail" has its store (`fincwin:decide-hints:{userId}` holding `{"v":1,"foldHintSeen":true}`), a hook that shows it until the first dismiss and writes once, and a plain-text fill1 tile. Read failure counts as not seen; write failure is swallowed. The `fincwin:` prefix means wipeDeviceData removes it on sign-out and account deletion. No analytics reference anywhere in the hints folder.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. decideHints store and useFoldHint | 105a0b25 | |
| 2. FoldHint tile + tests | 429460ff | test file (covering both tasks) committed here |

## Verification

- `npx jest src/features/decide/hints`: 8 tests pass (the five named D-75 store/hook tests, a seen-stays-hidden test, and the two tile tests).
- `npm run typecheck` clean; eslint clean on the touched files; analytics grep prints 0; `accessibilityLiveRegion` absent from FoldHint.tsx.
- The wider `src/features/decide/ui` jest run was not completed within the tool timeout (the other executors are running in the same worktree); only the hints suite was confirmed.

## Deviations from Plan

**1. Test file committed with Task 2**
- Both tasks share one test file that imports FoldHint, so it was committed with the tile rather than split.

**2. Tests await RNTL calls**
- This repo's RNTL is async (`render`, `renderHook`, `act` return promises); the tests follow that. The first `renderHook` already flushes the load, so the pre-load not-visible state is not asserted.

Otherwise as written. No migrations, no Supabase calls.

## Device items

05-EXECUTION-NOTES entry 05-60 stands as written (fresh install shows the hint; one fold tap hides it for good; another user sees it again).

## Self-Check: PASSED
