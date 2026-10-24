---
phase: 05-decide-ui
plan: 143
subsystem: decide
tags: [judge-on, device-preference, snapshot, changed-markers]
requires: [05-138, 05-142]
provides:
  - useJudgeOn(userId) shared store (null until read, month default)
  - useChooseJudgeOn(userId).choose(v)
  - rebaselineSeen / withJudgeOn pure helpers in homeRowsModel
affects: [05-140, 05-145]
key-files:
  created:
    - src/features/decide/judgeOn/judgeOnStore.ts
    - src/features/decide/judgeOn/useChooseJudgeOn.ts
    - src/features/decide/judgeOn/__tests__/judgeOnStore.test.tsx
    - src/features/decide/judgeOn/__tests__/useChooseJudgeOn.test.tsx
    - src/data/queries/__tests__/decideJudgeOn.test.tsx
  modified:
    - src/features/decide/hints/decideHints.ts
    - src/features/decide/home/homeRowsModel.ts
    - src/data/queries/decide.ts
    - src/features/decide/hints/__tests__/decideHints.test.tsx
    - src/features/decide/home/__tests__/homeRowsModel.test.ts
    - src/data/queries/__tests__/decide.test.tsx
    - src/features/decide/home/__tests__/DecideHomeScreen.test.tsx
    - src/features/decide/__tests__/r18ReadingOrder.test.tsx
requirements-completed: [DCU-40, DCU-39]
duration: ~1h
completed: 2026-10-24
---

# Phase 5 Plan 143: Judge-on choice Summary

A device-local, shared Judge-on choice (month / worst / average) that drives the snapshot, writes basis_override for Worst/Average only, and re-baselines open checks' last-seen states so a basis switch never reads as "changed since you looked".

## Commits
- 195207bd feat(05-143): device-local Judge-on record and shared store
- 592f9358 feat(05-143): snapshot is built on the stored Judge-on choice
- 86fac951 feat(05-143): choose() with basis_override rule and changed-marker re-baseline

## What was built
- decideHints: `judgeOn` field (exact three strings else null), `loadJudgeOn`, `saveJudgeOn`, exported `JudgeOn` type.
- judgeOnStore: module store (useSyncExternalStore), `null` until read, `userId` null is 'month', rejected read is 'month', per-user live guard, wipe handler, `resetJudgeOnStoreForTest`. No state set in effect bodies.
- useDecideSnapshot: calls `useJudgeOn(userId)`; source is null (status loading) until read; `judgeOn` joins memo deps and `sourceKey`.
- homeRowsModel: `withJudgeOn` (logged only; month under monthUnconverted gives basisOverride 'worst' and monthFallback), `rebaselineSeen` (pure, only checks whose old-basis logged state equals last_seen_state and differs on the new basis), `changedOpenCount` refactored onto a shared `chipOf`.
- useChooseJudgeOn: markSeen for each re-baselined row, basis_override write for Worst/Average only when settings differ, then ONE `notifyManager.batch` that patches the checks cache synchronously and schedules the store flip after the cache notifications.

## Plan-checker notes applied
1. `useChooseJudgeOn` names its inputs: `useJudgeOn`, `useDecideSnapshot` (current result), `useOpenChecks(userId, householdId)`, `useDecideSettings`, `useUpdateDecideSettings`, `useMarkCheckSeen`, `useRecordContext`, `useQueryClient`. See "What later plans must mock" below.
2. DecideHomeScreen.test.tsx already spread `jest.requireActual('../homeRowsModel')` in the shared tree, so rebaselineSeen/withJudgeOn are present; its decideHints mock gained loadJudgeOn/saveJudgeOn.
3. useMarkCheckSeen is NOT synchronously optimistic (its onMutate awaits `cancelQueries` first), so ordering markSeen before the flip is not enough. choose() patches the checks cache itself (same key, `last_seen_state`/`last_seen_basis`) and queues the store flip in the same `notifyManager.batch`. Test 'changedOpenCount stays 0 on the first render after a switch' records every render's count after the switch; verified it fails (count 1) when the cache patch is removed.

## What later plans must mock (05-140: dropdown, JudgeOnSheet, Month details; r18Matrix, HomeSummaryCard.test, MonthDetailsSheet.test)
Anything rendering `useChooseJudgeOn` pulls these data-layer hooks. Either mock `useChooseJudgeOn` itself (simplest: `jest.mock('.../judgeOn/useChooseJudgeOn', () => ({ useChooseJudgeOn: () => ({ choose: jest.fn() }) }))`) or provide: a QueryClientProvider, and mocks for `@/data/queries/decide` (`useDecideSnapshot`, `useOpenChecks`, `useDecideSettings`), `@/data/mutations/decideChecks` (`useMarkCheckSeen`), `@/data/mutations/decideSettings` (`useUpdateDecideSettings`), `@/features/record/useRecordContext`. Pattern to copy: src/features/decide/judgeOn/__tests__/useChooseJudgeOn.test.tsx.
- Anything using `useJudgeOn` alone (display of the current choice) needs only `decideHints` (real AsyncStorage mock works, default resolves 'month'; async, so `waitFor`) or a `jest.mock('.../hints/decideHints')` with `loadJudgeOn: () => Promise.resolve(null)` and `saveJudgeOn: () => Promise.resolve()`.
- Tests that call the real `useDecideSnapshot` must `resetJudgeOnStoreForTest()` in beforeEach and `waitFor` ready (status is loading until the read resolves).
- The store flip in `choose` lands one macrotask later (notifyManager scheduling); wrap in `act(async () => { choose(v); await new Promise(r => setTimeout(r, 20)); })`.
- Tests that mock `@/data/queries/decide` wholesale and render components that call `useJudgeOn` indirectly via the real snapshot hook are unaffected (the mock replaces it).

## Verification
- `npx jest --silent`: 633 suites passed, 24628 tests passed, 14 skipped (includes other executors' uncommitted work present in the shared tree).
- `npm run typecheck`: clean. `npm run lint`: 0 errors (4 warnings in my useChooseJudgeOn test: `require()` inside jest.mock factory, the established pattern). `npm run depcruise`: no violations.

## Deviations from Plan
- [Rule 2] The plan's wording "choose first captures source and rows; calls markSeen" would still flash because markSeen's optimistic cache update is asynchronous; added the synchronous cache patch plus batched store flip (note 3). No files outside the plan beyond the plan's list (r18ReadingOrder and DecideHomeScreen mocks were in the list).
- decide.test.tsx needed only a store reset in `resetMocks`; its other expectations held unchanged. CheckFlow.test.tsx needed no change (it spies decideHints and mocks `@/data/queries/decide`).
- Judge-on tests for the snapshot live in a new file decideJudgeOn.test.tsx (as listed), duplicating decide.test.tsx's mock header.

## Known Stubs
None.

## Issues / for the caller
- Store flip is deferred by one macrotask (setTimeout 0 inside TanStack's notifyManager); the UI in 05-140 sees the new choice a few ms after the tap. Intentional to keep cache and store in one render.
- `rebaselineSeen` only rewrites checks with a `logged` chip on both bases; first-read (rough) checks have no basis to switch and are untouched.

## Self-Check: PASSED
