# Walkthrough fix A (D-105 copy and housing editor) Summary

Copy-only changes in `src/i18n/locales/en.ts` plus `LimitEditorSheet.tsx`.

## New strings
- `decide.quick.line.cashMonthShort`: "Cash covers it. Even with saving paused, the month would end {{short}} short."
- `decide.warn.monthTitle`: "Still short with saving paused" (was "The month does not close"; also used by the first-read card and WARNING_TITLE)
- `decide.warn.monthBody`: "Even with saving and investing paused, every month would need {{short}} more than comes in."
- `decide.warn.monthPaused` already named the pause; unchanged. Headline and Left a month unchanged (full figure).
- `decide.lines.shareField`: "Share of money in" (visible % field label in the dsr and housing editors; accessibilityLabel stays the line name).
- `decide.pots.empty`: "No pots yet. A car service in March is one."
- `decide.pots.deleteConfirm`: `{ title: 'Delete {{name}}?', body: 'Its set-aside stops coming off net free cash flow. Undo is available right after.', confirm: 'Delete', cancel: 'Cancel' }` (no prior plain-pot confirm existed; the next executor wires it).

## Housing/dsr editor
Both showed an empty field at default. Now the engine default is the placeholder (housing 28, debt 36); a stored value shows as the value. Placeholder rather than prefilled value keeps "blank = default" semantics, the dirty check and Use the default intact.

## For the next executor (PotsScreen.tsx, not edited)
- The duplicate "Pots" heading on the empty screen (screen title plus section heading) needs a PotsScreen.tsx change; not done here.
- Wire `decide.pots.deleteConfirm.*` into the delete flow.

## Tests
- `src/i18n/__tests__/decideNamePause.test.ts` (D-105: quick result, What breaks title and body, 44-char fit, Pots empty, delete confirm)
- `LinesAndMonth.test.tsx`: three D-105 editor tests (housing placeholder and label, stored value, dsr).
- Step3Verdict test updated to the new month title.

## Verify
`npx jest src/features/decide src/i18n`: 143 suites, 17086 tests pass. eslint 0 errors. tsc: only errors are in the other executor's `MonthDetailsSheet.test.tsx` (lines 97-101), not mine.

## Follow-up: no-pause variant
When nothing is pausable (`assessment.context.pausable === 0`, saving + investing = 0) the pause is not named:
- `decide.quick.line.cashMonthShortNoPause`: "Cash covers it, but the month would end {{short}} short."
- `decide.warn.monthTitleNoPause`: "The month does not close"
- `decide.warn.monthBodyNoPause`: "Every month would need {{short}} more than comes in."
Chosen in `warningCopy.ts` (month card) and `quickCopy.ts` (`monthShortKey`). The rough first read (quick first-read line and `WarningList` first-read card) has no saving or investing, so it always uses the no-pause keys. Named test "D-105 nothing to pause uses the plain month wording" in `quickCopy.test.ts` and `decideNamePause.test.ts`; Step3Verdict test now expects the plain title for its no-saving fixture.
