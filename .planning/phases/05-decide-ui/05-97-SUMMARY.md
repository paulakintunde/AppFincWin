---
phase: 05-decide-ui
plan: 97
subsystem: shell
tags: [fab, sheet-stack, watchdog, D-85, R16.1]
requires: [05-87]
provides:
  - fabSurface(location, segments): null location inside (tabs) is a tab root
  - sheetStack mounted registry, prune, noteVisible, STALE_MS
  - FabProvider watchdog with counts-only Sentry breadcrumb
affects: [05-98]
key-files:
  modified:
    - src/shell/fab/shouldHideFab.ts
    - src/state/sheetStack.ts
    - src/ui/Sheet.tsx
    - src/shell/fab/FabProvider.tsx
    - src/shell/fab/__tests__/shouldHideFab.test.ts
    - src/state/__tests__/sheetStack.test.ts
    - src/shell/fab/__tests__/FabProvider.test.tsx
decisions:
  - "The watchdog runs in FabProvider off the derived 'tabRoot' surface (effect keyed on it), since the provider sits above the screens and has no focus of its own"
  - "noteVisible's anyVisible is 'at least one sheet is mounted'; prune handles unmounted ids, noteVisible is the backstop"
requirements: [NAV-05, REC-01]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 97: FAB root cause and sheet-stack watchdog Summary

A null navigation location inside `(tabs)` now counts as a tab root, and a leaked sheet id can no longer hide the FAB: each Sheet releases its id in an effect cleanup, and a 2 s watchdog (also run on reaching a tab root) drops ids with no mounted sheet and clears a stale stack, leaving a counts-only breadcrumb.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. fabSurface + watchdog reducers | 15c1989a | `fabSurface(location, segments)`; `markMounted`/`markUnmounted`/`prune`/`noteVisible` with injected clock |
| 2. Sheet cleanup + FabProvider watchdog | 3ec92aa5 | `useSegments` feeds the surface; breadcrumb `{ dropped, cleared }` only |

## Verification

- `jest src/shell/fab src/state src/ui/__tests__/Sheet*`, ShellEntryHost, setup and src/features/decide: pass, except one unrelated failure (below).
- typecheck clean; eslint on touched files: 0 errors.
- Named tests present: the three Task 1 "D-85" tests and `D-85 an unmounted sheet no longer hides the FAB` (in FabProvider.test.tsx), plus a counts-only breadcrumb test and a null-location-in-tabs FabProvider test.

## Deviations from Plan

**1. [Rule 3 - Blocking] expo-router mocks lacked `useSegments`**
- FabProvider now calls `useSegments`; the mocks in Fab, FabQuickMenu, ShellEntryHost and setup tests gained `useSegments: () => []`.

**2. Named test lives in FabProvider.test.tsx, not Fab.test.tsx**
- The behaviour is the provider's, and that file already drives the store directly. Fab.test.tsx only got the mock change.

## Notes

- `src/features/decide/__tests__/engineBarrel.test.ts` ("payoff barrel exports exactly this surface") fails in the shared worktree: another executor's engine export change, not this plan.
- Fab.test.tsx's first test timed out once at 5 s when jest ran under load (cold start); it passes alone.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-97: open and swipe-dismiss several sheets, switch tabs quickly; the Add button is back on every tab root within 2 s.

## Self-Check: PASSED
