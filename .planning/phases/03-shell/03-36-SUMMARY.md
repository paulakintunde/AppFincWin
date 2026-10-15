---
phase: 03-shell
plan: 36
subsystem: navigation
tags: [android, gesture, swipe-back, reduced-motion, gap-closure]
requires: []
provides: [D-40 Android edge swipe-back that follows the finger]
affects: [03-38 device re-check A7]
key-files:
  modified:
    - src/features/navigation/swipeBackGesture.ts
    - src/features/navigation/SwipeBack.tsx
    - src/features/navigation/__tests__/swipeBackGesture.test.ts
    - src/features/navigation/__tests__/SwipeBack.test.tsx
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 36: Android edge swipe-back (G7 / D-40) Summary

Android in-app swipe-back now has a 40dp start zone, moves the screen with the finger (Reanimated translateX), slides away and pops past the threshold, snaps back otherwise, and pops at release with no motion under reduced motion.

## Commits
- 8112177: 40dp zone (`SWIPE_BACK_EDGE_WIDTH = 40`) and pure `dragOffset`
- see git log: finger-follow SwipeBack (completion timer in a ref, cleared on unmount; canvas backdrop; `failOffsetX(-12)`)

## Deviations
- [Rule 3 - lint] React-compiler lint rules (react-hooks/refs, immutability) rejected the planned ref-mirroring of `reduced`/`width` and `.value =` writes. Used `reduced`/`width` as `useMemo` deps and `translateX.set(...)`; one scoped eslint-disable on `.onEnd` for the timer ref, which is only touched from gesture callbacks and unmount cleanup.
- Test renders use async `await act`/`await unmount` (RNTL async).

## Verification
- `npx jest src/features/navigation src/shell`: 276 tests pass; 2 suites fail to resolve `expo-blur` (known environmental, junctioned install). tsc clean apart from expo-blur. eslint and depcruise clean.
- Device re-check A7 deferred to 03-38 (area revealed behind the dragged screen is canvas colour).

## Self-Check: PASSED
