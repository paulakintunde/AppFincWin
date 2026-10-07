---
phase: 02-record
plan: 39
subsystem: import
tags: [import, hook, state-machine, csv, ofx, analytics]
requires: [02-13, 02-14, 02-15, 02-18, 02-26]
provides:
  - useStatementImport (the whole statement import as one tested state machine)
affects: [02-27]
key-files:
  created:
    - src/features/record/import/useStatementImport.ts
    - src/features/record/import/__tests__/useStatementImport.test.tsx
requirements-completed: [REC-09, REC-10, REC-13, REC-15, REC-16, REC-17, REC-18, ANL-05, REC-05]
completed: 2026-10-06
---

# Phase 2 Plan 39: useStatementImport Summary

One hook drives 02-26's pure pipeline through pick, statement choice, format confirmation, mapping, review, match suggestions, one-step commit and recurring suggestions, with the ANL-05 funnel events carrying literal properties only.

## Tasks

| Task | Commits | Result |
|------|---------|--------|
| 1. Pick, statement choice, format, mapping | RED 2d69ebd, GREEN 5940b34 | idle to reading to rejected / choose-statement / format / mapping. Remembered readings skip the format step. |
| 2. Review, matches, commit, suggestions | RED b3d77c5, GREEN 21e53bd | Reads with fallbacks, `buildPreview`, accept-only matches, `useImportCommit`, toast, `import_committed`, recurring suggestions. |

33 hook tests pass (102 across `src/features/record/import`). `npm run typecheck`, `npm run depcruise` and `npx eslint src/features/record/import` are clean. All acceptance greps pass and `useCsvImport.ts` does not exist.

## Review follow-ups applied

- **Item 5 (E-WR-07):** the hook builds the preview through `buildPreview`, which reconciles on `balance ?? availableSigned`. Nothing in the hook reads `availableDelta`.
- **Item 8 (C-CR-01, E-WR-06):** `ImportMarkPaid.line` and `ImportLink.storedTransferId` come from `toImportCommit`. The hook supplies `existingById` entries (with `transfer_id`) for every stored row in the file range (pending rows included) and every transfer candidate. `linkTransfer` refuses an id the row never offered, a leg that already has a `transfer_id`, and a leg another row already claimed.
- **E-CR-04:** an ambiguous card profile (up to 4 candidates) leaves `profile` null and sets `candidates`; `confirmFormat` and `commit` are no-ops until `chooseCandidate` selects one. Nothing is auto-picked. The chosen reading is remembered per layout: `commit` passes `finalize.profile` (account, `draft.layoutSignature`, new id) and `useImportCommit`'s finalize saves it through `saveImportProfile`. A reading that was already remembered is not saved again.
- **E-CR-02:** an ambiguous date order (and ambiguous decimal mark) must be answered. `dateNeedsChoice` / `notationNeedsChoice` block `continue()` from mapping until `setDateFormat` / `setDecimalMark` is called.
- **From 02-26:** a pay-matched row appears only in `finalize.markPaid`. Pending rows are passed to the pipeline as `pending` and kept out of the duplicate-detection `existing` list. Recurring detection only sees committed ordinary rows: linked imported rows, orphan counter-legs and mark-paid lines are excluded (D-56).
- **C-CR-01 / C-WR-02:** left to `useImportCommit` and finalize. The hook only calls `commit(...)`.
- **D-39:** no statement text, file name or amount goes into an analytics property, toast parameter, log or error. A test serialises every tracked call and toast and asserts the descriptions and amounts are absent. The picker returns no file name and the hook never keeps the bytes after `prepareImport`.

## Deviations from Plan

**1. [Plan wording] `start()` takes no entry.** The entry comes from the hook argument (`useStatementImport({ entry, accountId })`), as in the action text.

**2. [Rule 2 - Missing critical] Format step precedes mapping for CSV, as the plan states, so the mapping step re-resolves the reading.** `continue()` from mapping re-runs `resolveProfile` only when the amount, debit, credit, balance, direction or limit roles changed. If the new result is ambiguous, or decided differently from what the user confirmed, the hook returns to `format` and never swaps the reading silently.

**3. [Rule 2 - Missing critical] Ambiguity flags.** The plan returns `dateAmbiguous` and `notationAmbiguous`; the hook also returns `dateNeedsChoice` and `notationNeedsChoice` (still unanswered), because E-CR-02 requires the question to be asked and the screen needs to know whether it was.

**4. [Plan wording] `continue()` from review.** With no transfer or pay-match suggestions it commits straight away (the plan's "commit-ready"); `commit()` is also exposed. From `matches`, `continue()` commits.

**5. [Rule 2 - Missing critical] Extra members for the screens.** `rowState(i)`, `limitAccepted`, `reconcile`, `back()`, and per-row `answer`, `linkedId`, `orphanAccountId`, `needsCounterAmount` on `transferRows` and `answer` on `payMatchRows`.

**6. [Rule 2] Commit guards.** A double tap cannot write twice (held until the next `start`/`cancel`). Commit does nothing without a selected profile, outside review/matches, or with 0 rows and 0 accepted mark-paid. A link or orphan with no Transfer category is set aside by `toImportCommit` (the line is inserted plain).

**7. [Plan wording] `committing` stage.** It stays in the stage union for the screens, but the commit is a synchronous enqueue, so the hook goes straight from review/matches to `done`.

**8. [Plan wording] Fallback for a failed existing-rows read** uses cached `transactionsRoot` query data filtered to the account and range. A failed candidate or learned-name read falls back to none. A failed `fetchHasRowsBefore` is treated as no earlier rows.

## Known Stubs

None. The `committing` stage is declared but never rendered (deviation 7); it is not a stub of missing data.

## Threat Flags

None. No new endpoint, auth path or schema change.

## Self-Check: PASSED

- Files exist: `useStatementImport.ts` and `useStatementImport.test.tsx`.
- Commits exist: 2d69ebd, 5940b34, b3d77c5, 21e53bd.
