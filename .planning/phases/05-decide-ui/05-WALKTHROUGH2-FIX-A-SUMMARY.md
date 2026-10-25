# Walkthrough 2 fix A Summary

## 1. Undo after "Pot saved" did nothing
Root cause: `invalidateAfterUndo` (src/data/mutations/undo.ts) refreshed transactions, accounts, series, categories and the undo log, but no Decide cache. The toast, label mapping (`potAdded`) and the add step (inverse = soft-delete at version 1) were all correct; the server reverted, but the `savings-goals` cache still held the pot, so the screen never changed. Fix: an undo now also invalidates savings goals, decide checks, links, changes and debts.
Test: `undo.test.tsx` "walkthrough 2: undoing a pot add marks the pots cache stale..." (real useUndo + queue). Existing tests cover the host label mapping (UndoToastHost.pots), PotSheet passing `potAdded`/`potEdited` with the step id, the add step's soft-delete inverse and the edit step's restore of previous values (decidePots.test).

## 2. + Pot placement
`+ Pot` now sits in the DetailScreen right slot beside the info button (44 target, disabled and dimmed at 50, hidden when empty/loading). The body no longer has the lone heading row. Structural test added; the DetailScreen mock now renders `right`.

## Verify
`npx jest src/features/decide/pots src/data src/ui`: all pass except `decideJudgeOn.test.tsx` (2 tests), which belongs to the concurrent judge-on executor's uncommitted work. tsc clean; eslint 0 errors.
