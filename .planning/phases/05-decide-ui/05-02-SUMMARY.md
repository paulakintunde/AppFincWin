---
phase: 05-decide-ui
plan: 02
subsystem: decide-ui
tags: [i18n, copy, compliance, undo]
requires: [phase-04-decide-engine]
provides: [decide-copy-catalogue, dcu-09-guard, decide-undo-vocabulary]
affects: [05-03..05-53]
tech-stack:
  added: []
  patterns: [copyStatus leafPaths draft marking, interpolated length-cap tests]
key-files:
  created:
    - src/i18n/__tests__/decideCopy.test.ts
    - src/engine/undo/__tests__/types.test.ts
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/copyStatus.ts
    - src/engine/undo/types.ts
    - src/engine/undo/inverse.ts
    - src/engine/undo/__tests__/inverse.test.ts
    - src/db/patches.ts
    - src/db/errors.ts
    - src/db/__tests__/patches.test.ts
key-decisions:
  - "Decide copy pasted verbatim from the plan; titleInvBoth is the single 72-character title exception"
  - "New undo entities all invert an insert with deleted_at (matches the 05-04 allow-list)"
requirements-completed: [DCU-09, DCU-02, DCU-11]
duration: ~20m
completed: 2026-10-16
---

# Phase 5 Plan 02: Decide copy catalogue, DCU-09 guard and undo vocabulary Summary

The full `decide.*` copy catalogue (including the Phase 4 alignment strings, missingRate and cooling-off notification copy) now lives in en.ts, is marked draft, and is held to the banned-word and length caps by a failing test; the undo vocabulary knows checks, debts, links, changes and savings goals.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 decide namespace | d907b89 | Pasted verbatim; all acceptance greps hold (18 alignment keys, 5 "before any interest"); catalogue test 4531 passed. |
| 2 undo vocabulary | edc51e0 | 5 entities, 9 labels, refusal copy, missingRate and coolingTitle/Body; undo folder stays 100% covered. |
| 3 draft marking and guard | f9c5de4 | `leafPaths('decide', ...)` and `shell.quick.newCheck` in copyStatus; decideCopy.test.ts. |

## Verification

- `npx jest src/i18n src/engine/undo src/db/__tests__`: 28 suites, 7247 tests passed
- `npm run typecheck`: clean; `npm run lint`: 0 errors (pre-existing warnings only)
- `src/engine/undo` coverage: 100% across all columns

## Deviations from Plan

**1. [Rule 3 - Blocking] Widened inverse.ts and WriteEntity for the new UndoEntity members**
- **Found during:** Task 2 (typecheck)
- **Issue:** Adding entities to `UndoEntity` broke `insertInversePatch`'s exhaustive switch and assignments to `WriteEntity` in data/mutations and db/patches.
- **Fix:** `insertInversePatch` returns `{ deleted_at: '$now' }` for the five new entities (test added in inverse.test.ts); `WriteEntity` gains the five names.
- **Files:** src/engine/undo/inverse.ts, src/engine/undo/__tests__/inverse.test.ts, src/db/errors.ts
- **Commit:** edc51e0

## Notes

- Docker not running: no local pgTAP; CI's `rls` job covers the DB side (not touched by this plan).
- No device or human-verification items. titleInvBoth three-line fit is checked on device in 05-26.

## Self-Check: PASSED
