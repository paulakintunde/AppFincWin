---
quick: 261013-kf4
status: complete
commits: [c678528, 6918c34]
---

# 261013-kf4 Summary

Removing an entry-list item (swipe or the "Remove from list" accessibility action) now shows a
6 s destructive toast "Removed · {name}" with Undo, which puts the item back at its original index.

- `undoToast.ts`: optional in-memory `onUndo`, null by default, dropped on dismiss; stepId behaviour unchanged.
- `UndoToastHost`: Undo shown when `onUndo` is set; pressing it dismisses and calls the callback, no step replay.
- `useEntryList`: `remove` returns `{item,index,epoch}`; `restore` refuses after clearAll (save or discard), after unmount, for a duplicate id, or over the 30 cap. The debounced draft save follows both changes.
- `TransactionSheet`: `removeFromList` wires the toast (transfers use "{from} → {to}" as the name).
- Copy `record.sheet.list.removed`; 02.3-UI-SPEC.md updated (swipe line and destructive-confirmations row).
- Tests added in undoToast, history (host), useEntryList, TransactionSheet.list.

Verification: jest src/state src/ui src/features/record all green after fixing one test expectation; typecheck clean; lint 0 errors (447 pre-existing warnings).
Deviations: none. STATE.md and ROADMAP.md untouched; not pushed.
