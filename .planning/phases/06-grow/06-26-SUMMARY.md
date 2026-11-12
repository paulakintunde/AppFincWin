---
phase: 06-grow
plan: 26
subsystem: i18n
tags: [copy, undo, grow]
requires: [06-20]
provides: [gap-plan copy keys, debtOneOffRecorded undo label]
affects: [06-27..06-37]
key-files:
  modified:
    - src/i18n/locales/en.ts
    - src/engine/undo/types.ts
    - src/engine/undo/__tests__/types.test.ts
    - src/i18n/__tests__/growUndoLabels.test.ts
    - src/features/grow/__tests__/copyLint.test.ts
decisions:
  - Debt row end-date variants use a new {{end}} param (rowEnds, rowEndsNoRate, rowEndsNoDay, rowEndsNoDayNoRate)
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 6 Plan 26: Gap-plan copy and undo label Summary

All en.grow strings for the gap plans (06-27..06-37) added in one en.ts edit, plus the `debtOneOffRecorded` undo label registered on the client.

## Commits
- af4d2f78 feat(06-26): copy for the Grow gap plans (D-30..D-33)
- 18e07fc7 feat(06-26): debtOneOffRecorded undo label (D-33)

## What was built
- Task 1: every key listed in the plan under grow.home, grow.goals.detail, grow.goals.move, grow.debts, grow.debts.detail, grow.investing (+ detail, entry, add) and grow.lines. Add-only, no existing value changed. copyLint gained a case for useOnceOn, onceToast, rowEnds and goalsHeroLabelNet_one.
- Owner addendum (D-34, for 06-35): `grow.debts.rowEnds` ('{{rate}} · {{payment}} a month · due the {{day}} · ends {{end}}'), `rowEndsNoRate`, `rowEndsNoDay`, `rowEndsNoDayNoRate`. `{{end}}` is the formatted month and year (e.g. Sep 2041); 06-35 passes it.
- Task 2: 'debtOneOffRecorded' appended to UNDO_LABEL_KEYS; en.undo.label 'One-off payment · {{name}}', en.undo.labelUnnamed 'One-off payment recorded'. Grow undo tests now expect 21 keys.

## Deviations from Plan
None in behaviour. The branch base was reset to 37ad9f0e per the worktree check. No catalogue/wordingScope registration was needed.

## Verification
- jest on src/features/grow/__tests__/copyLint, src/i18n, src/engine/undo (coverage off): 21 suites passed, 25906 tests passed.
- typecheck: see the report returned with this summary.

## Known Stubs
None.

## Self-Check: PASSED
Both commits present; en.ts holds debtOneOffRecorded twice; types.ts once.
