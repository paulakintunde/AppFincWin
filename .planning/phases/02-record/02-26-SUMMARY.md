---
phase: 02-record
plan: 26
subsystem: import
tags: [import, csv, ofx, qfx, expo-document-picker, pipeline]
requires: [02-03, 02-04, 02-14, 02-15, 02-18, 02-22, 02-34, 02-36, 02-37]
provides:
  - pickStatementBytes (on-device byte read, size cap, cache copy removed)
  - importPipeline (prepareImport, resolveCsvDraft, resolveProfile, buildPreview, toImportCommit, sizeBand, suggestionToSeries, statementOptions)
affects: [02-27, 02-39]
tech-stack:
  added: [expo-document-picker ~57.0.3]
  patterns: [pure pipeline, typed reject reasons, suggestions set aside rather than dropped]
key-files:
  created:
    - src/services/files/pickStatement.ts
    - src/services/files/__tests__/pickStatement.test.ts
    - src/features/record/import/importPipeline.ts
    - src/features/record/import/__tests__/importPipeline.test.ts
  modified:
    - package.json
    - package-lock.json
requirements-completed: [REC-09, REC-10, REC-13, REC-14, REC-15, REC-16, REC-17, REC-18, REC-05]
completed: 2026-10-06
---

# Phase 2 Plan 26: Statement import data pipeline Summary

One pure pipeline takes a picked CSV, OFX or QFX file from raw device bytes to a reconciled, correctable preview and an exact commit input for 02-15's `useImportCommit`, with no network path for the file.

## NEW DEVELOPMENT BUILD NEEDED

`expo-document-picker` 57.0.3 is a **native module**. A new EAS development build is required before plan 02-31's device check, or the file picker will not open. It has a config plugin (`app.plugin.js`), but the plugin only sets the iCloud container entitlement option. The default behaviour needs no entitlement, so the plugin was **not** added. The project uses `app.config.ts`, not `app.json`, and neither was changed. Installed with `npx expo install`, which keeps the version locked to SDK 57. No other package was upgraded.

## Tasks

| Task | Commits | Result |
|------|---------|--------|
| 1. Picker service and prepareImport | RED dda5a93, GREEN 7cf6c12 | Bytes read on device, 5 MB cap, cache copy deleted in `finally`, file name never returned. BOM, UTF-8 and Windows-1252 decode, content sniff, OFX/QFX/CSV adapters, typed reject reasons. |
| 2. resolveProfile, buildPreview, toImportCommit | RED 574a2bf, GREEN f14a977 | Full D-40 pipeline in one pure module, plus the commit input, `sizeBand` and `suggestionToSeries`. |

83 tests pass across the two suites, including a fast-check property: for any generated ledger, in either sign convention, held or owed, either row order, with or without balances, converted amounts equal the ledger. `npm run typecheck`, `npm run depcruise` and `npx eslint` on the touched files are clean. All acceptance greps pass.

## Review follow-ups applied

- **Item 5 (E-WR-07):** `availableSigned` replaces `availableDelta`. `buildPreview` reconciles on `balance ?? availableSigned`, so an available-credit file with no known limit still verifies.
- **Item 8 (C-CR-01, E-WR-06):** every `ImportMarkPaid` carries a `line`, the same `NewTransaction` that would have been inserted. Every `ImportLink` carries `storedTransferId`.
- **E-CR-04:** `resolveProfile` returns the engine's `ProfileResult` unchanged. An ambiguous OFX card result (up to 4 candidates) is surfaced as-is. `buildPreview` accepts only a `FormatProfile`, so an ambiguous result cannot produce a preview.
- **E-CR-02:** a `none` or `ambiguous` date guess sets `dateAmbiguous`. The default order comes from the region, and the user is asked. dd/mm/yy is never assumed.
- **E-WR-05:** the 7-day FITID window comes from the engine's `findDuplicates`. A test covers a FITID match that is too old.
- **E-WR-06:** a "choose" suggestion reserves both legs. A test asserts that no stored id appears in two row suggestions.
- D-39: no network code path. Greps for fetch, invoke, storage and upload return 0. No statement text appears in errors, logs or events.

## Deviations from Plan

**1. [Rule 2 - Missing critical] `ExistingInfo` gained `transfer_id`.** The plan's `existingById` value type had no `transfer_id`, but `ImportLink.storedTransferId` is required. A stored leg already in a transfer is now never linked (E-WR-06). Such a link is set aside and the row is inserted plain.

**2. [Rule 2 - Missing critical] Suggestions that cannot be applied exactly as previewed are set aside, and their line is still inserted.** This covers an unknown stored row, a stored leg already linked, one stored leg claimed by two rows, a missing Transfer category, a pending row that is unknown or no longer `pending`, an orphan to the same or an unknown account, and a cross-currency orphan without a typed amount. A link, orphan or mark-paid decision is honoured only if it matches what the row's own suggestion offered. Without these guards `useImportCommit` would throw, or a statement line would be lost.

**3. [Plan naming] Task 1 tests share `importPipeline.test.ts` with Task 2.** The plan names one test file, so Task 2's tests were appended to it.

**4. [Plan wording] Exports.** The plan's `app.json` entry became `app.config.ts`, which was left unchanged. `CommitContext`, `ExistingInfo`, `PrepareResult` and `PrepareRegion` are exported as extra types. `PreparedCsv` also carries `dateGuess` and `notationGuess`.

**5. [Plan defaults] Limit offer.** It is made only when `statedLimit` is positive and the account has no limit of that kind. A card gets `credit_limit`. A deposit account gets `overdraft_limit`, and only when the engine's gated heuristic produced `statedLimit`.

## Behaviour notes for 02-27 and 02-39

- A pay-matched row is excluded from `rows` and appears only in `finalize.markPaid`. A mark-paid whose pending row is not in `existingById` as `pending` becomes an ordinary row.
- Pass `existingById` entries for every stored row that can be offered: pair and choose options, and pending rows.
- `suggestionToSeries` reads only the suggestion's own row ids. The caller must not feed transfer legs to `detectRecurring` (D-56).
- `resolveCsvDraft` throws `RangeError` only for an account currency with no exponent. That comes from the account, never from file content.
- `statementOptions` and `prepareImport` expose no account number.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema change.

## Self-Check: PASSED

- Files exist: `pickStatement.ts`, `importPipeline.ts` and both test files.
- Commits exist: dda5a93, 7cf6c12, 574a2bf, f14a977.
