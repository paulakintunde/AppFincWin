# Pattern: "What gets written"

Added by 05.4-39 (BO-04). A pattern note, not a component: there is no shared file to import. Grow and Household use it when a choice writes rows to the user's records.

## Purpose

Before anything is saved, the user sees the exact rows that will be written: each line names the record, the amount and the month, in the words the app will store. Nothing is written that was not on the list. After saving, the same list reads in the past tense, so the user can see what changed.

## The two steps

1. **Step A: ask.** A sheet titled for the action (for example "Mark {item} as bought"), a one-line body, then a "What gets written" heading and the list of lines. Two buttons: a secondary "Not yet" that closes the sheet and writes nothing, and a primary confirm. This is the only confirm step in the flow. If a write is blocked (read-only household member, a failed earlier write), the reason shows in place of the confirm.
2. **Step B: done.** The title moves to the past tense ("Written"), the list repeats the same lines in the past tense, and the buttons become a secondary "Undo" and a primary "Back to {screen}".

Actions that need no confirm (for example "Plan it" or "Not buying") write at once and open straight on step B.

## Undo

- Step B's Undo reverses every row the step wrote, as one undo step (`useUndo` with the step id).
- No toast shows while the sheet is open; the sheet is the confirmation.
- When the sheet closes without Undo (backdrop, drag or Back), one Undo toast shows, with the usual 10-second window.
- A closed sheet forgets its own Undo press; reopening starts clean.

## Shared parts

| Part | Use |
|------|-----|
| `src/ui/WrittenList.tsx` | the list of lines, one wrapping row per line with a dot (D-76) |
| `src/ui/LabelValueRow.tsx` | any label-and-figure line above the list |
| `src/ui/CheckRow.tsx` | when the user may leave a line out before confirming |
| `src/ui/textFit.ts` | `useShouldStack`: the buttons stack below 360 wide or above 1.3x text (D-76 rule S) |
| `src/ui/Sheet.tsx`, `src/ui/Pill.tsx` | the sheet and the two buttons |

## Styling

Design tokens only (`useTheme`, `space`, `textRole`, `fontSize`). No new colours, shadows or gradients. The list sits on the sheet surface; no card around it.

## Copy

Declarative: the lines say what is written, never why the user should write it. No "advice", "recommend" or "you should".

## Reference

The parked 05.3 sheet that first used this pattern is on `origin/phase/05.3-decide-screens-v3`:

- `src/features/decide/v3/record/RecordSheet.tsx` (the two steps, Undo and the close toast)
- `src/features/decide/v3/model/recordLines.ts` (how the lines are built)

These are **reference only, not to copy** (BO-09): the parked screens were never merged. A new screen builds the pattern from the shared parts above and its own line builder.
