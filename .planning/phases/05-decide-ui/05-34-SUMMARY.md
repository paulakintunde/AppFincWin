---
phase: 05-decide-ui
plan: 34
subsystem: data
tags: [record, one-off, savings-goal, tanstack-query]
requires: [05-32 column contract]
provides: [one_off and goal_id through Record insert, patch and select paths]
affects: [05-50 toggle UI, 05-06, 05-12]
key-files:
  modified:
    - src/db/rows.ts
    - src/db/transactions.ts
    - src/db/__tests__/transactions.test.ts
    - src/data/mutations/transactions.ts
    - src/data/mutations/batchInsert.ts
    - src/data/mutations/__tests__/cloneMonth.test.tsx
requirements-partial: [DCU-03, DCU-07, DCU-16, DCU-21]
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-16
---

# Phase 5 Plan 34: Record one_off / goal_id data layer Summary

`one_off` (D-29) and `goal_id` (D-34) now travel through every Record insert key list, patch key list (so edits are undoable), the select string, and the three optimistic row builders (always `?? false` / `?? null`); `AddTransactionInput.isOneOff` is spread conditionally; a named test proves a cloned month never copies one-off.

## Commits
- 37a81a7: row types, key lists, TRANSACTION_COLUMNS, tests
- 6caf45e: optimistic rows, isOneOff, clone test

## Verification
- `npx jest src/db src/data/mutations`: 45 suites, 617 tests pass
- `npm run typecheck`: clean; `npm run lint`: 0 errors (pre-existing warnings)

## Deviations from Plan
None. cloneMonth.ts unchanged (explicit field list). No engine edits, no migrations.

## Notes
Requirement IDs (DCU-03, -07, -16, -21) span later plans (toggle UI 05-50 etc.); none marked complete in REQUIREMENTS.md.

## Self-Check: PASSED
