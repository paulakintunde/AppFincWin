---
phase: 10-system
plan: 06
subsystem: engine
tags: [archive, engine, tdd, DAT-01]
requires: []
provides:
  - src/engine/archive (monthKeyOf, isArchivedMonth, visibleMonths, canArchiveMonth, withoutArchivedRows, archivedCount)
affects: [10-16, 10-24]
key-files:
  created:
    - src/engine/archive/archive.ts
    - src/engine/archive/index.ts
    - src/engine/archive/__tests__/archive.test.ts
metrics:
  completed: 2026-11-22
---

# Phase 10 Plan 06: Archive view rules Summary

Pure engine functions that hide archived months from the month list and search results only; no money maths, no imports outside engine (D-13).

## Tasks
- RED: `test(10-06)` failing tests (example + fast-check properties).
- GREEN: `feat(10-06)` implementation. `monthKeyOf` reuses `monthOf` from engine/time (throws RangeError on malformed dates); `canArchiveMonth` compares 'YYYY-MM' strings so only past months qualify.

## Verification
- `npx jest -c jest.engine.config.js src/engine/archive`: 9 passed.
- Coverage of archive.ts: 100% statements, branches, functions, lines.
- No `@/` or `react` imports in archive.ts.

## Deviations from Plan
None. The worktree started at a different commit than the stated base SHA, so it was reset to 493c04d9 as the brief directs.

## Self-Check: PASSED
