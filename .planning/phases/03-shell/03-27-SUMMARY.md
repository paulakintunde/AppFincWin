---
phase: 03-shell
plan: 27
subsystem: ui
tags: [sheet, gap-closure, repeats, discard]
requirements: [NAV-04]
key-files:
  modified:
    - src/ui/Sheet.tsx
    - src/ui/__tests__/Sheet.dismissal.test.tsx
    - src/features/record/entry/RepeatsField.tsx
    - src/features/record/entry/__tests__/recurringControls.test.tsx
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 27: Sheet onDiscard and Repeats restore Summary

Shared Sheet gains an `onDiscard` callback, single-fire drag dismissal, a fling-aware dirty prompt and prompt reset; the Repeats sheet snapshots on open and restores on Discard.

## Commits
- db1deb5: Sheet (G2 plumbing, H5, H6, L9, L10)
- 379b2db: RepeatsField Discard restore (G2)

## What changed
- `SheetProps.onDiscard` (falls back to `onDismiss`).
- H5: `dismissTimerRef` cleared on unmount, close and open; `dismissingRef` makes `requestDismiss` ignore backdrop/back during the 190ms slide-out.
- H6: the dirty branch uses `sheetDragOutcome(dy, velocityY) === 'dismiss'`, so a fast fling asks.
- L9: prompt state resets when `!visible || !dirty`.
- L10: file-level eslint-disable removed; 9 line-level disables with reasons.
- RepeatsField: `opening { value, countText }` snapshot; `discard` calls `onChange(opening.value)`, restores the count text, closes.

## Tests
Sheet.dismissal gained 6 tests (onDiscard, double-dismiss, unmount, reopen, fling, prompt reset); recurringControls gained 4 (discard, keep, Done, no-op open). Final gate: `jest src/ui src/shell src/features/record` 126 suites / 1521 tests pass; tsc, eslint (no errors) and depcruise clean.

## Deviations
None. Sheet.drag.test.tsx was not modified (all new cases fit in the dismissal file, which has the dirty helpers); in tests `scheduleOnRN` flushes asynchronously so the drag tests advance 20ms before racing the backdrop.

## Self-Check: PASSED
