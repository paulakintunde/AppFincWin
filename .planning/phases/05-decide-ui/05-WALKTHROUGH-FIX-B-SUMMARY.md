# Walkthrough fix B (D-105 Pots UI) Summary

## 1. Missing Undo: root cause and fix
`UndoToastHost` only offers Undo when `undoableLabel(toast)` finds an engine label key. Plain toasts must use an `undo.label.*` text key; Decide toasts that keep their own words are mapped in `DECIDE_TOAST_LABEL`. The pot toasts (`decide.pots.toast.saved|deleted|done|reopened`) were in neither, so the toast carried a step id but the host returned no label and drew only the close button. The mutations were fine.

Fix (`src/features/record/history/UndoToastHost.tsx`): mapped the four pot toasts to `potEdited|potDeleted|potDone|potReopened`, plus the transfer tag/untag toasts (`decide.depth.goal.tagged|untagged`, same gap, used from PotSheet). "Pot saved" serves add and edit, so a toast may carry `params.undoLabel` (a valid label key) to say which step it recorded; PotSheet passes `potAdded` / `potEdited`. The housing switch already used `undoLabelText`, so it had no gap.

Test: `UndoToastHost.pots.test.tsx` (each pot toast shows Undo and calls the undo stack with the step id and label; no step id, no Undo).

## 2. Delete confirm
`PotsScreen` holds the row to delete; the ⋯ menu and swipe both open a ConfirmSheet with `decide.pots.deleteConfirm.*` (destructive). Confirm deletes and toasts with Undo; Cancel writes nothing. Tests in `PotsScreen.test.tsx`.

## 3. Pots layout
The body heading text is gone (the header already says Pots); the ⓘ moved to the DetailScreen `right` slot. The `+ Pot` link sits alone, right-aligned. The body is a `gap: space.gapMd` column, so the summary line has the standard gap under the description. Structural tests added.

## 4. PotSheet money fields
`MoneyInput` gained `boxed`: fill6, card radius and padding, body type (same as the Name `Box`), and a leading currency symbol read from `formatMoney` of zero with digits stripped (so "$" only for USD; other dollars keep their marker, via formatAmount). Target and Already saved use it. `Box`-matching test and symbol test added.

## 5. By is a month choice
New `pots/MonthField.tsx`: a Row opening a Sheet list of months from this month (or the pot's own earlier month when editing) to the 50-year maximum; picking one closes the list and stores the first of that month (`lastDayOfMonth` still gives the stored last day). Starts empty ("—"); no calendar. Range line kept. The old far-month test became list-bounds tests.

## Verify
`npx jest src/features/decide src/ui src/features/record/history`: 166 suites, 2085 tests pass. tsc clean. eslint 0 errors (pre-existing warnings only).

## Notes
- Month list is 601 simple rows at the widest; shown only while open.
- Did not touch en.ts, copy builders, CheckFlowScreen or MonthDetailsSheet.
