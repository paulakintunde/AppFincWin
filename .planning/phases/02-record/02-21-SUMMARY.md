---
phase: 02-record
plan: 21
subsystem: ui
tags: [react-native, recurring-series, transaction-entry, undo]
requires: [02-18, 02-20]
provides:
  - RepeatsField, EditScopePrompt, OccurrenceActions
  - recurringForm.ts (repeatsToSchedule, templateFieldsChanged, needsScopePrompt, nonTemplatePatch)
  - TransactionSheet recurring wiring (create, convert, scoped edit)
affects: [02-22, 02-31]
key-files:
  created:
    - src/features/record/entry/recurringForm.ts
    - src/features/record/entry/RepeatsField.tsx
    - src/features/record/entry/EditScopePrompt.tsx
    - src/features/record/entry/OccurrenceActions.tsx
    - src/features/record/entry/__tests__/recurringForm.test.ts
    - src/features/record/entry/__tests__/recurringControls.test.tsx
  modified:
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/entry/__tests__/TransactionSheet.test.tsx
    - src/i18n/locales/en.ts
requirements-completed: [REC-05, REC-06]
completed: 2026-10-06
---

# Phase 2 Plan 21: Recurring controls on the entry sheet Summary

Repeats (weekly to yearly; ends never, on a date, or after N times), the "This one / This and future" prompt, and mark paid / adjust / skip / end series are all reachable from the transaction sheet.

## Commits
- 0cadaaf test(02-21): failing recurring form rules (RED)
- 98a2bf7 feat(02-21): pure recurring form rules (GREEN)
- fa7403d test(02-21): failing recurring controls tests (RED, modules missing)
- b64d087 feat(02-21): components and sheet wiring (GREEN)

## Behaviour
- New entry with Repeats: `add()` without `undo`, then `create({ anchorTransactionId, anchorIsNew: true })`. One Undo removes entry and series (user decision 2026-10-06, follow-up row 20). Toast is `seriesCreated` with the series step id.
- Existing one-off entry with Repeats: `create({ anchorIsNew: false })`; any other edits go first through the normal edit hook. Only the series toast is shown.
- Template-field edit on an occurrence asks the scope question. "This one" is the normal row edit. "This and future" calls `editFrom` with `effectiveFrom = occurrence_date`, series version from `useRecurringSeries`. Pending to paid (recording the real payment) never asks.
- OccurrenceActions (pending rows only): Mark paid (planned values, today or due date if earlier via the hook), Adjust then mark paid (sets form to Paid, sheet stays open), Skip (series rows), End series (series rows, destructive ConfirmSheet, end date today). A pending row past its date shows "Overdue".
- No `insertUndoStep` / `inverseOfSeriesChange`; series undo is server-side. A null step id is passed to the toast as null, so no Undo is offered.

## Deviations from Plan
1. **[Follow-up note over plan]** `anchorIsNew: true` for a new entry (plan 02-18 had dropped it; the server now supports it).
2. **[Rule 2] Non-template keys on "This and future".** The plan sent only the series patch, which would silently drop a note or status typed alongside. Those keys are sent as a separate row edit (own undo step) before `editFrom`; only the series toast shows. The row edit can be undone from History.
3. **[Rule 3] Copy keys added** to `en.ts`: `record.repeats.countField`, `endCountInvalid`, `done` (the plan named `record.repeats.endCount`, which exists only as plural forms, used for the summary label).
4. **Mark paid / Adjust also shown for pending rows outside a series** (Skip and End stay series-only), matching "Skip (recurring rows only)".
5. **`needsScopePrompt` uses a falsy test** for `recurring_series_id` so a row object without the field is treated as non-series.
6. **Existing TransactionSheet.test.tsx** gained mocks for the new hooks (the sheet now calls them).
7. "End this series" toast kind is `destructive` (6 s).

## Known limitations
- Edit or end of a series cannot be undone once the daily job has scheduled newer occurrences (D-CR-01); the refusal copy is 02-28's.
- The count input and end-date picker are covered only through the component test (count); the native date picker was not exercised (needs the new dev build, follow-up 18a).

## Known Stubs
None.

## Threat Flags
None. T-02-21-01..03 mitigated: explicit scope prompt, no auto-mark-paid, destructive confirmation for ending.

## Verification
`npx jest src/features/record/entry src/i18n` green (79 entry tests); `npm run typecheck`, `npm run depcruise`, `npx eslint src/features/record/entry` clean. Acceptance greps: `anchorIsNew: true` count 1, slot comment count 0.

## Self-Check: PASSED
