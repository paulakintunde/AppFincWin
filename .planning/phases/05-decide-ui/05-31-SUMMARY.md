---
phase: 05-decide-ui
plan: 31
subsystem: i18n
tags: [copy, dcu-09, drafts]
requires: [05-02]
provides: [decide.depth copy namespace, record one-off copy keys, extended DCU-09 guard]
affects: [part-2 depth UI plans]
tech-stack: {added: [], patterns: [draft copy via leafPaths]}
key-files:
  modified: [src/i18n/locales/en.ts, src/i18n/__tests__/decideCopy.test.ts]
decisions: []
metrics: {tasks: 2, files: 2}
completed: 2026-10-16
requirements: [DCU-09, DCU-11, DCU-16, DCU-17, DCU-18, DCU-20]
---

# Phase 5 Plan 31: Depth copy catalogue Summary

Added the full `decide.depth` copy namespace (combined checks, cushion, edge, cash path, changes, confidence, credit, card minimum, investing, card costs, income, runway, running costs, estimate gap, goal, cooling-off, currency) plus the record one-off keys, all draft, with an extended DCU-09 guard.

## Commits
- 5c68394 feat(05-31): decide.depth copy and record one-off keys
- 8279a97 test(05-31): extend DCU-09 guard to depth copy

## Deviations from Plan
- The plan's record paths `record.toggle.oneOff` / `record.note.oneOff` are actually `record.sheet.toggle.oneOff` / `record.sheet.note.oneOff` in en.ts; keys were added there and the test uses the real paths. copyStatus.ts needed no change (leafPaths already covers them).

## Verification
`npx jest src/i18n` 8368 passed; `npm run typecheck` clean; `npm run lint` 0 errors. No engine edits, no migrations, no analytics events.

## Human verification
None. Copy additions flagged "addition" in en.ts remain drafts for UI-SPEC review.

## Self-Check: PASSED
