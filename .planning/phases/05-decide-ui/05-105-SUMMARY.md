---
phase: 05-decide-ui
plan: 105
subsystem: decide-data
tags: [speed, memo, structural-sharing, D-88]
requires: [05-108]
provides:
  - useDecideSnapshot shares one SnapshotResult/source per source key across consumers
  - useOpenChecks (stable-equality select of live open checks)
  - saveCheckDraft patches only its own row (replaceRow), other rows and unmatched lists keep identity
affects: [05-26]
key-files:
  modified:
    - src/data/queries/decide.ts
    - src/data/queries/__tests__/decide.test.tsx
    - src/data/mutations/decideChecks.ts
    - src/data/mutations/__tests__/decideChecks.test.tsx
    - src/features/decide/home/useDecideHomeViewModel.ts
    - src/features/decide/home/__tests__/DecideHomeScreen.test.tsx
decisions:
  - "Source key is household|today|home currency|region; the data version is the identity of the reads' data (TanStack keeps it stable across a refetch of equal data), not dataUpdatedAt"
  - "The shared memo is a module-level Map (max 4 entries); a hit needs every read's data reference to match, so a changed read always rebuilds"
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 105: D-88 speed, data side Summary

Three consumers of the Decide snapshot now run the engine once, and an autosave keystroke in one check leaves every other check row (and its chips) at the same identity.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. One snapshot per source | ae41ec51 | `sharedSnapshot(key, deps, source)` in `decide.ts`; `clearSharedSnapshots` test seam |
| 2. Draft saves keep other rows stable | 2bf235bc | `replaceRow` in `decideChecks.ts`; `useOpenChecks`; home view model uses it |

## Verification

- `npx jest src/data/queries src/data/mutations/__tests__/decideChecks`: 13 suites, 148 tests passed. `src/features/decide/home`: all suites passed (run together with the above).
- Named tests present and passing: `D-88 snapshot built once per source` (spy on `@/features/decide/snapshot/buildSnapshot`, three consumers, one build), `D-88 draft save keeps other rows' identity` (`===` on the other rows). Extra: a data change rebuilds for every consumer (T-05-105-01), a changed region is a different source, `useOpenChecks` keeps row identity.
- `npm run typecheck` clean, `npm run depcruise` clean, eslint: no errors (9 pre-existing `no-require-imports` warnings in DecideHomeScreen.test.tsx). `src/features/decide/snapshot` not touched.

## Deviations from Plan

**1. [Spec reading] Data version is reference identity, not dataUpdatedAt**
A first version keyed on `dataUpdatedAt`; a second consumer mounting triggers a refetch that bumps it with equal data, so the engine ran twice. The key is now household|today|currency|region and the version check is the reads' data references (stable under structural sharing).

**2. [Rule 3 - Blocking] DecideHomeScreen.test.tsx mock**
Added `useOpenChecks` to its `@/data/queries/decide` mock, since the view model now uses it.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES entry 05-105: type in one open check while others are listed; the other open-check chips do not flicker, and the verdict appears without a visible lag.

## Self-Check: PASSED
