---
phase: 05-decide-ui
plan: 24
subsystem: decide-ui
tags: [navigation, autosave, tanstack-query, expo-router]
requires: [05-07, 05-11, 05-12, 05-19, 05-22, 05-23]
provides:
  - useCheckDraft (load, create on first edit, debounced autosave)
  - setSwipeBackInterceptor / interceptSwipeBack
  - Phase 5 routes registered in app/(app)/_layout.tsx, notification observer mounted after consent
affects: [05-29, 05-30]
key-files:
  created:
    - src/features/decide/check/useCheckDraft.ts
    - src/features/decide/check/__tests__/useCheckDraft.test.tsx
  modified:
    - app/(app)/_layout.tsx
    - src/features/navigation/SwipeBack.tsx
    - src/features/navigation/swipeBackGesture.ts
    - src/features/navigation/__tests__/swipeBackGesture.test.ts
    - src/features/navigation/__tests__/SwipeBack.test.tsx
    - src/shell/__tests__/shellNavigation.test.tsx
decisions:
  - "not_found means a row that was seen and then vanished (deleted or RLS) with no create of ours; an unknown id never seen is a new check (the hook has no other signal)"
metrics:
  tasks: 2
  completed: 2026-10-17
---

# Phase 5 Plan 24: Check flow plumbing Summary

Layout route registrations plus a consent-gated notification observer, an Android edge-swipe interceptor, and `useCheckDraft`, which creates a check on its first edit and debounce-autosaves through the persisted write queue.

## Tasks

1. Layout and swipe interceptor (337774e): registered `decide/check/[id]`, `decide/past`, `setup/rough`, `setup/first-check`; `DecideNotificationObserver` (local to `_layout.tsx`) mounted beside `UndoToastHost` with `enabled={!needsPrompt}`; `SwipeBack` checks `interceptSwipeBack()` before popping and snaps back when handled.
2. `useCheckDraft` (5cf921f0): known open row loads parsed inputs; first edit of an unknown id calls `useCreateCheck` and fires `check_started` with `{}` once; later edits debounce 600 ms into `useSaveCheckDraft`; `furthest_step` only rises; unmount flushes; decided rows ignore `update`; `inputs.currency` is stamped from the snapshot currency on first save when null and never changed (D-37).

## Verification

Check draft + navigation + shell jest suites green (334 tests), typecheck clean, lint 0 errors (713 warnings, unchanged), depcruise clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] shellNavigation test mocks the observer.** The real layout now mounts `useNotificationObserver`, which calls the native expo-notifications module and crashed 7 tests in `src/shell/__tests__/shellNavigation.test.tsx`. Added a one-line `jest.mock` there. No behaviour change.

**2. [Interpretation] not_found semantics.** The plan's wording cannot be satisfied literally (an RLS-hidden id and a fresh id look the same). Implemented as: row seen then gone, and not created by this hook, gives `not_found`; otherwise an absent id is a new check.

No engine edits, no migrations.

## Known Stubs

None. The route file `app/(app)/decide/check/[id].tsx` is created by 05-30; the `Stack.Screen` entry for it is registered here ahead of that.

## Human / device items

- Edge swipe on Android with an interceptor set (05-30 wires it) and reminder tap after a cold start.

## Self-Check: PASSED
