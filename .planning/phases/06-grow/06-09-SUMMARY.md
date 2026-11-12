---
phase: 06-grow
plan: 09
subsystem: ui
tags: [i18n, copy-lint, undo, svg-glyphs, react-native]
requires:
  - phase: 06-grow plan 03
    provides: grow schema (holdings, holding_lots) and engine/grow
provides:
  - en.grow copy block (G01..G12, first-open sheet, Calculators GC01..GC40, common states)
  - copyLint test over every en.grow string
  - growFeatureFlags seam (all on until Phase 9)
  - GrowGlyph (27 glyphs), ProgressBar, Stepper, StateBadge
  - 19 Grow undo label keys and holdings / holding_lots undo entities
affects: [06-05, 06-06, 06-07, 06-10..06-22]
tech-stack:
  added: []
  patterns: [copy lint by recursive string walk, two-layer SVG glyphs, shape+word badges]
key-files:
  created:
    - src/features/grow/growFeatureFlags.ts
    - src/features/grow/ui/GrowGlyph.tsx
    - src/features/grow/ui/ProgressBar.tsx
    - src/features/grow/ui/Stepper.tsx
    - src/features/grow/ui/StateBadge.tsx
    - src/features/grow/__tests__/copyLint.test.ts
    - src/features/grow/__tests__/growFeatureFlags.test.ts
    - src/features/grow/ui/__tests__/primitives.test.tsx
    - src/i18n/__tests__/growUndoLabels.test.ts
  modified:
    - src/i18n/locales/en.ts
    - src/engine/undo/types.ts
    - src/engine/undo/inverse.ts
    - src/engine/undo/__tests__/types.test.ts
    - src/engine/undo/__tests__/inverse.test.ts
    - src/db/patches.ts
    - src/db/errors.ts
    - src/ui/failedWriteLabels.ts
key-decisions:
  - "G10 is titled 'Your money rules' and items are rules (owner 2026-11-06), so en.grow.lines uses 'Your rule is at most ...', 'Change a rule', 'Save rule'."
  - "SegmentedToggle is a radiogroup that stacks, not a tablist, and is not in this plan's file list. It was left unchanged; the Grow home plan builds its tab-role segmented control."
  - "Undo keys only appended to UNDO_LABEL_KEYS; unnamed variants exist only for keys whose text holds {{name}}."
requirements-completed: [GRW-01, GRW-02, GRW-03, GRW-04, GRW-05, GRW-06, GRW-07, GRW-08, GRW-09, GRW-10, GRW-11]
duration: long (slow jest runs)
completed: 2026-11-06
---

# Phase 6 Plan 09: Grow shared copy, primitives and undo vocabulary Summary

One en.grow copy block with a compliance lint, a level-gating seam, 27 two-layer glyphs with ProgressBar, Stepper and StateBadge, and the 19-key Grow undo registry with holdings as undoable entities.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Grow copy block, copy lint, feature-flag seam | a09a1b28 |
| 2 | Glyphs and base primitives | aa0881c5 |
| 3 | Grow undo label keys and holdings undo entities | 9c12cff8 |
| 3b | Fix: inverse and failed-write labels for new entities | 217fa121 |

## Verification

- Jest: copyLint, growFeatureFlags, primitives, growUndoLabels, whole src/i18n folder, src/engine/undo, src/theme, decideCopy, v3 copy contract, patches, failedWriteLabels, FailedWritesSheet all pass.
- src/engine/undo stays at 100% branches, functions, lines, statements (checked with a scoped coverage run).
- typecheck: clean. depcruise: no violations. lint: 0 errors (existing warnings only).

## Deviations from Plan

**1. [Rule 3 - Blocking] Widening WriteEntity and UndoEntity broke three exhaustive places**
- Found during: Task 3 typecheck
- Issue: `insertInversePatch` has an exhaustive switch over UndoEntity, and the failed-write sheet types its entity label keys from WriteEntity.
- Fix: soft-delete cases for holdings and holding_lots in `src/engine/undo/inverse.ts` (both tables grant deleted_at), a test row in inverse.test.ts, entity names 'Holding' and 'Holding entry' in `en.sync.failedSheet.entity`, and the two names in the ENTITIES set of `src/ui/failedWriteLabels.ts`.
- Files outside the plan list: inverse.ts, inverse.test.ts, failedWriteLabels.ts.

**2. SegmentedToggle not extended.** It is not in this plan's file list and no Grow screen exists yet; the Grow home plan owns the tablist control. See key-decisions.

## Known Stubs

None.

## Threat Flags

None. The copy lint (T-06-09-01) and the Grow undo label guard (T-06-09-03) are in place; keys match `^[a-zA-Z]{1,40}$` and were only appended (T-06-09-04).

## Self-Check: PASSED
