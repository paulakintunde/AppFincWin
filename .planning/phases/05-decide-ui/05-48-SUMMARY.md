---
phase: 05-decide-ui
plan: 48
subsystem: decide-ui
tags: [decide, dated-changes, home]
requires: [05-27, 05-28, 05-31, 05-37, 05-40]
provides:
  - ChangesCard on Decide home
  - ChangeSheet (add / edit) with toMonthKey and monthLabel
affects: []
key-files:
  created:
    - src/features/decide/home/ChangesCard.tsx
    - src/features/decide/home/ChangeSheet.tsx
    - src/features/decide/home/__tests__/ChangesCard.test.tsx
  modified:
    - src/features/decide/home/DecideHomeScreen.tsx
    - src/features/decide/home/__tests__/DecideHomeScreen.test.tsx
    - src/i18n/locales/en.ts
key-decisions:
  - "Months are stored as 'YYYY-MM' by slicing the picked local 'YYYY-MM-DD' (no Date round trip, no toISOString)"
metrics:
  tasks: 2
  completed: 2026-10-20
requirements: [DCU-03, DCU-08, DCU-15]
---

# Phase 5 Plan 48: Changes coming up Summary

Decide home now lists the user's dated income and spending changes between Open checks and Past decisions, with an add / edit sheet and a removal that toasts "Change removed" with Undo.

## Behaviour
- ChangeSheet: Income | Spending, Goes up | Goes down (down stores a negative integer), optional name, MoneyInput amount, native DateField start (minDate = first of this month; an existing past start stays reachable on edit), 'No end date' on by default, end field with minDate = start, inline refusal when the end month precedes the start. Save disabled until amount > 0. Edit sends only changed keys through useEditChange; no changes writes nothing. Cancel with edits asks the discard question (ConfirmSheet with the shared `sheet.discard` copy); Sheet's own dirty prompt covers drag, back and backdrop.
- ChangesCard: heading row with "+ Add a change", rows (name or unnamed label, Income / Spending tag in words, `changeRowCopy` from/until line), tap to edit, 44px CloseGlyph "Remove this change" calling useRemoveChange and a destructive toast keyed `decide.depth.changes.removed` with the step id. Empty state per D-27. Open checks recompute through the changes query cache invalidation from 05-40.
- DecideHomeScreen reads `useDecideChanges` and renders the card; order test extended.

## Deviations from Plan
- [Rule 2] New catalogue key `decide.depth.changes.endBeforeStart` for the inline end-before-start refusal (the catalogue had no such copy).
- Both tasks committed together (one commit) since the card and sheet are tested in one file.
- The two toggles carry accessibility labels built from their option words ("Income · Spending", "Goes up · Goes down") to keep labels unique against the amount field.

## Verification
- `npx jest src/features/decide/home` 58 tests green (ChangesCard.test.tsx 13); full suite 526 suites / 16127 tests pass; typecheck clean; lint 0 errors; depcruise no violations.

## Human / device items
- Sheet at 402x874 and large font; real native date picker (past-month refusal, month display); TalkBack on the row and the "x".

## Known Stubs
None.

## Self-Check: PASSED
