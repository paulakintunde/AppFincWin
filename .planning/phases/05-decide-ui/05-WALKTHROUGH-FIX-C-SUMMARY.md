# Walkthrough Fix C Summary

Two Pixel 9 walkthrough findings fixed on phase/05-decide-ui.

## 1. False "This check isn't here" after Run the full check

Root cause: `DecideHomeScreen.runFull` queues the create (`useCreateCheck`) and navigates at once. The create runs on the serial WRITE_SCOPE queue, so it can wait behind other writes. The optimistic row is written in `onMutate`, but a checks refetch while it waits replaces the list without the row. `useCheckDraft` had seen the row (`seenRow`) and the create was made by another screen (`createdState` false), so the vanished row read as not_found until the create settled (about 3 s).

Fix: `useCreateCheck` now also returns `pendingIds` (via `useMutationState`, status pending). `useCheckDraft` reports `loading` (the existing blank busy view) while the id has a pending create and no row; not_found still shows for a row that vanishes with no create pending.

Tests (useCheckDraft.test.tsx): "a just-created check shows loading, never 'This check isn't here'" and "a truly missing check still resolves to not_found once no create is pending for it".

## 2. Month details chip and pill alignment

Root cause: `StateChip` sets `alignSelf: 'flex-start'`, overriding the header's `alignItems: 'center'`, so the shorter chip sat at the top beside the 44pt Activity pill. The chip is now wrapped in a `headerChip` view (`alignSelf: 'center'`), so both sit on the header centre line. Also applies to the dark Your month card, which shares the body.

Test (MonthDetailsSheet.test.tsx): structural check of the header row, centre alignment and the chip wrapper.

## Verify

- `npx jest src/features/decide`: 133 suites, 1804 tests passed (run before the test-type fix; the two touched suites re-run green).
- `npx tsc --noEmit`: clean.
- eslint: 0 errors (existing require-import warnings only).

## Deviations

None. Touched `src/data/mutations/decideChecks.ts` (outside decide/) to expose `pendingIds`; no copy, en.ts or LimitEditorSheet changes.
