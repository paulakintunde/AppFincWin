---
phase: 02-record
plan: 27
subsystem: import
tags: [import, screens, statement, reconciliation, transfers, i18n]
requires: [02-19, 02-20, 02-24, 02-26, 02-39]
provides:
  - ImportScreen (all stages of useStatementImport)
  - FormatStep, MappingStep, ReviewStep, MatchesStep, SuggestionsStep
  - formatSentenceKeys / renderSentence (the D-42 plain-words reading)
  - suggestionCap (accepted-suggestion cap for one finalize)
affects: [02-31]
key-files:
  created:
    - src/features/record/import/ImportScreen.tsx
    - src/features/record/import/FormatStep.tsx
    - src/features/record/import/MappingStep.tsx
    - src/features/record/import/ReviewStep.tsx
    - src/features/record/import/MatchesStep.tsx
    - src/features/record/import/SuggestionsStep.tsx
    - src/features/record/import/formatSentence.ts
    - src/features/record/import/suggestionCap.ts
    - src/features/record/import/importUi.tsx
    - src/features/record/import/__tests__/formatSentence.test.ts
    - src/features/record/import/__tests__/suggestionCap.test.ts
    - src/features/record/import/__tests__/ImportScreen.test.tsx
  modified:
    - src/features/record/import/useStatementImport.ts
    - src/features/record/import/__tests__/useStatementImport.test.tsx
    - src/i18n/locales/en.ts
requirements-completed: [REC-09, REC-10, REC-13, REC-15, REC-16, REC-17, REC-18, REC-05]
completed: 2026-10-06
---

# Phase 2 Plan 27: Import screens Summary

The statement import is now usable end to end on screen: pick an account and file, confirm or flip the reading in plain words, correct the CSV mapping, review with the reconciliation sentence and tags, answer transfer and bill-match suggestions, commit, and answer recurring suggestions.

## Tasks

| Task | Commits | Result |
|------|---------|--------|
| 1. formatSentence, ImportScreen shell, FormatStep, MappingStep | RED bda9cb1, GREEN ca2241e | Pick (accounts, privacy line, helper, Add an account), rejected copy, statement choice, format read-back with example row and flip, ambiguous candidates, mapping with errors |
| 2. ReviewStep | RED 56f0e2f, GREEN 641dedd | Reconciliation sentence per state, Can't verify and Possible duplicate tags, issues, category edit, rates note, limit offer, commit CTA |
| 3. MatchesStep, SuggestionsStep, cap | RED 2af9037, GREEN 6fc7ff4 | Transfer pair / choose / orphan and pay-match cards, suggestion cap, Import finished with recurring suggestions |

Verification: full suite 139 suites / 4202 tests pass; `npm run typecheck`, `npm run depcruise` and `npx eslint src/features/record/import src/i18n` are clean (`npm run lint` shows only pre-existing warnings, 0 errors). All plan acceptance greps pass (7 reconcile keys in ReviewStep, 0 `danger|warn1` in ReviewStep, 0 `flipSigns` in MappingStep, no hex colours in any step).

## Review follow-ups applied (02-REVIEW-FOLLOWUPS.md)

- **E-CR-04:** an ambiguous reading shows one selectable row per candidate (sign meaning plus balance meaning), pre-selects nothing, and "Use this reading" stays disabled until `chooseCandidate` has set a profile. The flip control is hidden while candidates are shown.
- **E-CR-02:** an ambiguous date order shows the prompt with DD/MM/YYYY and MM/DD/YYYY rows, an ambiguous decimal mark shows point and comma rows; neither shows a tick until chosen (`dateNeedsChoice` / `notationNeedsChoice`), and Continue is disabled until both are answered.
- **Item 12 (C-IN-02):** `suggestionCap.ts` caps accepted suggestions at `min(2999, 6000 - includedLines - 1)`. That single rule keeps the finalize (two patches per link) and the undo step (a delete per inserted row, a reversal per stored row) under 6000 ops for any mix of links, orphans and mark-paids. At the cap the accept actions (link, orphan picker and amount field, mark paid) are disabled and `importCsv.suggestionCap` explains it; declining stays possible.
- **Item 7:** the screens never offer Undo. The import toast belongs to the hook and carries a real step id; `SuggestionsStep` has no Undo (a test asserts it).
- **Item 5 / 8:** no screen reads `availableDelta`; mark-paid `line` and link `storedTransferId` come from the hook's `toImportCommit`.
- Hook API rendered as 02-39 exposes it: `candidates` + `chooseCandidate`, `dateNeedsChoice`, `notationNeedsChoice`, `rowState`, `limitAccepted`, `reconcile`, `back`, per-row `answer` on `transferRows` / `payMatchRows`. The flat hook members are passed as one `state` object to each step (the plan's `{ state, actions }` split does not exist).
- D-39: statement text is rendered as plain `Text` only, never logged, tracked or put in a toast; the new screens add no analytics calls.
- Voice and tokens: no "advice", "recommendation" or "you should" in any new copy; colours from `useTheme()` tokens; every control is at least 44px; no hex literals; no haptics added.

## Deviations from Plan

**1. [Rule 3 - Blocking] The hook did not expose what the screens must show.** `useStatementImport` returned neither the CSV header row (the mapping step cannot name a column from an index), the stated closing balance / limit the D-42 sentence quotes, nor the account and name of the stored rows a suggestion points at. Added three additive members with hook tests: `headers`, `formatFigures` (`{ closing, limit, overLimit, currency }`, null until a reading is selected) and `storedLegs` (`id -> { accountId, name }` for stored rows and transfer candidates). No existing member changed.

**2. [Plan wording] Selection uses rows, not accent chips.** The plan says the date format and decimal mark use "chips"; the shared Chip draws a selected state in the accent colour, which UI-SPEC reserves for the commit CTA. Candidate readings, date order and decimal mark are `Row`s with a tick value instead (the `OptionPicker`/`CategoryPicker` convention).

**3. [Plan wording] Continue, Use this reading, Link, Mark paid and the limit actions are `secondary` pills.** Only the import CTA (review without matches, and matches) is the primary (accent) pill, per the accent rule.

**4. [Rule 2] Limit offer feedback without colour.** "Add limit" disables once accepted instead of drawing a selected state, so the choice is visible without the accent.

**5. [Rule 2] Suggestion cards carry the line they refer to.** Each transfer and pay-match card adds a muted line (description and amount) under the sentence, so several suggestions can be told apart. The approved sentence is unchanged and the accessibility label is attached to the sentence text, not the card, so the action buttons stay reachable by a screen reader.

**6. [Rule 3] New catalogue keys.** `importCsv.format.candidateBalanceOwed`, `importCsv.format.candidateBalanceHeld` (candidate labels have no amount to quote), `importCsv.decimalMarkAmbiguous`, `importCsv.categoryA11y` ("Category for {{name}}") and `importCsv.suggestionCap_one/_other`. All are declarative.

**7. [Rule 2] Cross-currency orphan field stays visible.** The hook's `needsCounterAmount` becomes false as soon as a valid amount is accepted, which would make the field vanish while the user is still editing; the screen also derives it from the picked account's currency vs the line's.

**8. [Plan wording] Layout.** Review renders a `FlashList` (header: heading, reconciliation, limit card; footer: actions) inside a non-scrolling `Screen`; every other stage uses a scrolling `Screen`. Rows' ticks use the ink colour, not accent. `committing` (never reached, per 02-39) renders "Importing…".

**9. [Test environment] RNTL's `render` and `fireEvent` are async in this repo.** The screen tests await them, as the other screen tests do.

## Known Stubs

None. `ImportScreen` is not yet mounted from a route or the You/onboarding entry points; wiring it to navigation belongs to the plans that own those entries (02-31 and the onboarding work), as in the plan's scope.

## Threat Flags

None. No new endpoint, auth path, file access or schema change; file text is rendered as plain Text.

## Self-Check: PASSED

- Files exist: ImportScreen.tsx, FormatStep.tsx, MappingStep.tsx, ReviewStep.tsx, MatchesStep.tsx, SuggestionsStep.tsx, formatSentence.ts, suggestionCap.ts, importUi.tsx and the three test files.
- Commits exist: RED bda9cb1, 56f0e2f, 2af9037; GREEN ca2241e, 641dedd, 6fc7ff4.
