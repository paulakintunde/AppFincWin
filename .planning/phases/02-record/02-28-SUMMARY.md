---
phase: 02-record
plan: 28
subsystem: ui
tags: [undo, toast, history, accessibility, i18n]
requires: [02-14, 02-16, 02-19]
provides:
  - UndoToastHost (mount once in the signed-in layout, plan 02-29)
  - HistoryScreen
  - stepLabel, refusalText, conflictText copy helpers
affects: [02-29]
key-files:
  created:
    - src/features/record/history/undoCopy.ts
    - src/features/record/history/UndoToastHost.tsx
    - src/features/record/history/HistoryScreen.tsx
    - src/features/record/history/__tests__/undoCopy.test.ts
    - src/features/record/history/__tests__/history.test.tsx
  modified:
    - src/i18n/locales/en.ts
key-decisions:
  - "Toast Undo derives labelKey/labelParams from the 'undo.label.<key>' toast text; count-only params map to n"
  - "Series refusals with updated_by null get their own sentence (undo.refusal.seriesScheduled)"
metrics:
  tasks: 2
  completed: 2026-10-06
---

# Phase 2 Plan 28: Undo toast host and History screen

Undo toast host (3200 ms ordinary, 6000 ms destructive/refusal, no auto-dismiss under a screen reader) plus a History screen listing the last twelve steps with "Undo to here" and greyed, explained refusals.

## Commits
- bfa7d72: copy helpers + UndoToastHost (+ new copy key)
- 074a56d: HistoryScreen + host/screen tests

## Review follow-ups
- [x] Item 7: Undo is offered only for ordinary/destructive toasts with a non-null stepId (tested).
- [x] Item 9: host uses `toastDurationMs(kind, screenReaderEnabled)` with `AccessibilityInfo.isScreenReaderEnabled` and the `screenReaderChanged` event; a Dismiss control is always present (tested).
- [x] Item 10: toast and History render labels via `undoLabelText()` (nameless rows show `undo.labelUnnamed.*`).
- [x] Item 11: `conflictText` handles series refusal with `updated_by = null` (new key `undo.refusal.seriesScheduled`) and both-null refusals (falls back to "this line ... changed elsewhere"). The stored `refusal` JSON on a History row is parsed with `parseConflict`; an unparseable one shows "Can't undo" with no reason.

## Deviations from Plan
1. [Rule 2] Added `conflictText` and the `undo.refusal.seriesScheduled` key to en.ts (plan listed only stepLabel/refusalText); required by follow-up 11. Plan files_modified did not list en.ts.
2. Follow-up wins over plan on timing: refusal toasts use 6000 ms (as `toastDurationMs` defines), plan said 3200 ms for refusal.
3. A refusal toast from rollback that undid some steps shows "Undid N changes" followed by the refusal sentence.
4. Undo action is `accessibilityLabel`ed "Undo to here, {label}" on History rows for screen readers.
5. TDD note: undoCopy had a genuine RED (module missing) then GREEN. Host/screen tests were written after the implementation in the same pass, so they had no separate RED run.
6. Tests use RNTL 14 async render/act/fireEvent.

## Verification
- `npx jest src/features/record/history`: 20 tests pass (9 copy + 11 host/screen).
- `npm run typecheck`, `npm run depcruise`, `npx eslint src/features/record/history`: clean.

## Known Stubs
None.

## Self-Check: PASSED
