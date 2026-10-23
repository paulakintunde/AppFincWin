---
phase: 05-decide-ui
plan: 75
subsystem: ui
tags: [decide, check-flow, header, clear, undo, save-status, D-73, D-76, D-77]
requires: [05-56, 05-57, 05-58, 05-62, 05-70, 05-74]
provides:
  - CheckFlowHeader onClear and saveStatus props, wrapping title, rule-S right slot
  - CheckFlowScreen clear(), Undo route-back, useCheckSaveStatus wiring, offline Save and close toast
  - route params cleared and clearedStep (uuid and step validated)
  - Go ahead confirm as WrittenList with the whatGetsWritten info title
affects: [05-26 device checklist, entry 05-75]
key-files:
  modified:
    - src/features/decide/check/CheckFlowHeader.tsx
    - src/features/decide/check/CheckFlowScreen.tsx
    - src/features/decide/ui/CombineToggle.tsx
    - src/features/decide/home/checkHref.ts
    - app/(app)/decide/check/[id].tsx
    - src/features/decide/check/__tests__/CheckFlow.test.tsx
    - src/features/decide/check/__tests__/commit.test.tsx
    - src/features/decide/ui/__tests__/depthPrimitives.test.tsx
  created:
    - src/features/decide/check/__tests__/clearAndSave.test.tsx
decisions:
  - "Clear order: draft.saveNow(), abandon(row, 'cleared'), draft.discard(), router.replace to a new empty check, destructive toast with the undo step id"
  - "Undo route-back fires only after the cleared check was seen gone in useDecideChecks, so the optimistic delete cannot bounce the user straight back; guarded by a ref, no setState in the effect"
  - "Untouched empty check = draft.isNew and no pendingEdit"
  - "ConfirmSheet gets no title or body; its children carry an InfoTitle (the existing title string, header role) and the WrittenList"
requirements: [DCU-28, DCU-03, DCU-04, DCU-07, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 75: Check header Clear, save status and Go ahead list Summary

The check header now shows the save status as its own tabLabel text beside "Step N of 5", a wrapping title, and Clear after the combine pill. Clear saves, soft-deletes as one "Check cleared" undo step, disarms the draft and opens an empty check; Undo on the untouched empty check returns to the restored check at its step.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 Header: Clear, save status, wrapping title, rule-S slot | ff3a1390 | optional props so the screen typechecked between tasks; combine pill long-press and about action open the `combined` info sheet |
| 2 Clear flow, Undo route-back, offline Save and close, Go ahead list | 98dad76c | route params, checkHref widened to steps 1-5 plus cleared and clearedStep |

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing tests needed new doubles**
- CombineToggle now mounts an InfoSheet, which needs a SafeAreaProvider: `depthPrimitives.test.tsx` wrap updated.
- The screen now calls `useAbandonCheck`, `useDecideChecks`, `useSyncStatus` and `useCheckSaveStatus`: `CheckFlow.test.tsx` and `commit.test.tsx` mocks extended (source modules).

**2. Screen-level Task 2 tests live in CheckFlow.test.tsx**, not clearAndSave.test.tsx, to reuse its screen mocks. clearAndSave.test.tsx holds the header tests. All five named Task 2 tests exist and pass, plus Undo-after-edit and a save-status test.

## Verification

- `npx jest src/features/decide/check/__tests__/clearAndSave.test.tsx` passes (5).
- CheckFlow.test.tsx, commit.test.tsx, depthPrimitives.test.tsx pass.
- `npx jest src/features/decide src/data`: 2 failing suites at first run, commit.test fixed; one remaining failure, `expectedReturnSurfaces.test.tsx` "D-82 the verdict card reads the same state words with and without a return" (05-87 file, renders Step3Verdict only, not touched by this plan; out of scope).
- `npm run typecheck`, `npm run depcruise` clean; eslint on touched files: 0 errors (pre-existing warnings only).
- grep checks: `numberOfLines` in header 0, `lines.join` in screen 0, `abandon(row, 'cleared')` 1.

## Known Stubs

None.

## Device check

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-75: Clear then Undo on a real check, offline status text, title wrap at large text, Go ahead confirm list.

## Self-Check: PASSED
