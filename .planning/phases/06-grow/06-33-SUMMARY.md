---
phase: 06-grow
plan: 33
subsystem: grow-investing
tags: [grow, investing, crud, D-32]
requires: [06-26, 06-28]
provides: [edit and remove an entry, edit a holding, holding row actions]
affects: [src/features/grow/investing]
key-files:
  modified:
    - src/features/grow/investing/LotSheet.tsx
    - src/features/grow/investing/UpdateValueSheet.tsx
    - src/features/grow/investing/AddHoldingSheet.tsx
    - src/features/grow/investing/HoldingDetailScreen.tsx
    - src/features/grow/investing/InvestingSegment.tsx
    - src/features/grow/investing/__tests__/investingScreens.test.tsx
decisions:
  - "Entry removal is confirmed by the detail screen's ConfirmSheet; the edit sheets only raise onRemove, so no modal nests inside a modal."
  - "Edit sheets send changed keys only and close without a write when nothing changed."
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 6 Plan 33: Investing edit and remove Summary

Entries and holdings are now editable and removable from Grow, with the same row actions Goals and Debts use.

## What was built
- **Entry edit/remove:** entry rows are 44 px buttons with a chevron and label "Buy, Oct 1, $150. Edit the entry." A buy, sale, dividend or fee opens `LotSheet` prefilled (kind chip shown but read-only). A value entry opens `UpdateValueSheet` prefilled. Save calls `useEditHoldingLot().edit` with changed keys only; a sale above units held shows `sellExceedsUnits` inline and does not save. "Remove entry" (danger text) opens a ConfirmSheet, then `.remove` once with an Undo toast.
- **Holding edit:** header "Edit" opens `AddHoldingSheet` in edit mode (name, type, put in, regular amount, day, rate; Value now and As of hidden; "Edit holding" / "Save holding"). Sends changed keys via `useEditHolding().edit`, passing entries so a put-in change that breaks a sale is refused.
- **Rows and polish:** holding rows use `DeletableRow` (swipe and the more menu: Update value, Edit, Delete) with an `AccTile` lead (pension/retirement -> pension glyph, else invest). "+ Add a holding" is the last row inside the Holdings card. Investing shows three grey loading blocks. Detail: fewer than 2 value points shows "The chart starts after your second value." instead of a chart; the gain badge is no longer repeated beside the gain line; "Remove holding" is a left-aligned danger text button; the empty entries state has an "Update value" action.

## Verification
- `npx jest src/features/grow/investing src/features/grow/__tests__/copyLint`: 3 suites, 1378 tests pass (14 new tests in investingScreens).
- `npm run typecheck`, `npm run depcruise`: clean. eslint on the folder: 0 errors (warnings are the pre-existing test-file require/import-order ones).

## Deviations from Plan
- **Row action word.** `DeletableRow` is shared and fixed to "Delete" / "Keep it" (`decide.delete.*`); the plan's menu said "Remove". I did not edit the shared component (06-31 uses it in parallel). The confirm title/body are the holding's own ("Remove {name}?"). If the owner wants "Remove" on these rows, `DeletableRow` needs an optional word prop, a one-line follow-up.
- **Net worth drop in the row confirm** uses the holding's own value and currency, not a home-converted net-worth difference (the detail screen still computes the exact drop). Same figure for single-currency households.
- **Value-entry edit** changes the amount only (date shown, not editable).
- Both commits are split by task, but the detail screen's task 2 changes (chart, remove style, empty action) landed in the task 1 commit because they are in the same file.

## Missing strings
None. All copy already existed in en.ts (no en.ts edits).

## Known Stubs
None.

## Self-Check: PASSED
Commits 6b09eb63 and ac8a2f7b exist; changed files present.
