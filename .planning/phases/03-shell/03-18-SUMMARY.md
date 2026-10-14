---
phase: 03-shell
plan: 18
subsystem: engine/entryList
tags: [draft, validation, tdd]
requires: []
provides: [ENTRY_DRAFT_VERSION=2, DraftForm, EntryDraft, parseEntryDraft, draftEntryCount]
affects: [03-24 (hook and sheet wiring)]
key-files:
  modified:
    - src/engine/entryList/draft.ts
    - src/engine/entryList/__tests__/draft.test.ts
decisions:
  - "Form ids are only length-bounded in the engine (64); the feature layer resolves them against loaded data"
metrics:
  tasks: 1
  completed: 2026-10-13
---

# Phase 3 Plan 18: Entry draft v2 Summary

Entry draft payload moves to v2 with an optional raw form snapshot beside the list items; v1 drafts still parse, and a malformed form is dropped alone while a malformed item still discards the draft.

## What was built
- `draft.ts`: version 2, `DraftForm`, `EntryDraft`, `serialiseDraft(items, savedAt, form?)`, `parseEntryDraft` (accepts v1 and v2), `parseDraft` (delegates, items only), `draftEntryCount` (items + 1 for a form). Form fields type- and length-checked (amount text 32, name/note 500, currency 1-12, paymentType 32, ids 64, valid local date, enums, booleans).
- Tests: literal v1 JSON fixture, v3/'2'/missing version, 25 malformed-form cases, count cases, fast-check form round-trip. Storage key unchanged.

## Verification
- entryList jest at 100% statements/branches/functions/lines; existing useEntryDraft test passes.
- No tsc errors in entryList files (repo has pre-existing unrelated tsc errors in other files); eslint 0 errors.

## Deviations from Plan
None. The RED and GREEN steps were done in one commit (tests written first and a failing run was not committed separately), so the TDD gate shows a single `feat` commit: 8733e8f.

Note: the worktree node_modules junction could not be re-pointed to C:/dev/fincwin-p3 (shell refused the commands); the existing junction to fincwin-w1 was used, no dependencies changed.

## Self-Check: PASSED
