---
phase: 05-decide-ui
plan: 71
subsystem: ui
tags: [decide, home, fold, info, a11y, D-72, D-78, D-70, D-76]
requires: [05-54, 05-55, 05-58, 05-59]
provides:
  - AddChangeRow ("+ Add a change coming up" and "Check an investment" on one line)
  - Decide home in R2b order, Past decisions as one row hidden at zero
  - Lines you will not cross as one fold row with five ⓘ rows
  - Your month basis control with the basisMonth ⓘ and a radio list under rule S
  - Limit editor title ⓘ (SheetHeader gains an optional titleAccessory)
affects: [05-72, 05-76]
key-files:
  created:
    - src/features/decide/home/AddChangeRow.tsx
  modified:
    - src/features/decide/home/DecideHomeScreen.tsx
    - src/features/decide/home/LinesCard.tsx
    - src/features/decide/home/YourMonthCard.tsx
    - src/features/decide/home/LimitEditorSheet.tsx
    - src/ui/SheetHeader.tsx
    - src/features/decide/home/__tests__/DecideHomeScreen.test.tsx
    - src/features/decide/home/__tests__/LinesAndMonth.test.tsx
    - src/features/decide/home/__tests__/homeDepth.test.tsx
decisions:
  - "showInvest is true when no check has status open and deleted_at null, matching when 05-72 hides Open checks"
  - "Past decisions keeps the shared Row (label plus count value); its a11y label is built from pastRow and pastCount, so no new copy key"
  - "LimitEditorSheet exports LIMIT_INFO_KEY (reserve, dsrLine, unsecuredMultiple, investingFloor, savingFloor), reused by the Lines rows"
  - "Each Lines row is its own LineRow component, so its useInfoSheet hook is not called in a loop; its InfoSheet is a sibling of the row Pressable"
  - "The basis control gets a visible 'Judge on' label (existing basisA11y copy) to carry the ⓘ"
metrics:
  tasks: 2
  completed: 2026-10-23
requirements: [DCU-01, DCU-03, DCU-15, DCU-25, DCU-27]
---

# Phase 5 Plan 71: Decide home trim Summary

Decide home now shows only what has content: the quick check, one slim line to start a change or an investment check, Your month, Open checks and Changes (their own hiding is 05-72), a one-row Past decisions, and Lines you will not cross as a single fold row whose five rows each carry an ⓘ.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Home order, AddChangeRow, one-row Past decisions | 48f439fa | ChangeSheet add mode owned by the screen; `pastNone` no longer read |
| 2. Lines fold, Your month ⓘ and stacking, limit editor ⓘ | f3c3721b | FoldRow in a white card, closed by default, state in the card |

## Verification

- `npx jest src/features/decide/home src/ui`: 284 tests pass, including every named test in the plan.
- `npm run typecheck`: clean.
- eslint on `src/features/decide/home` and `SheetHeader.tsx`: 0 errors (only the existing require-imports warnings in tests).
- Full `npm run lint` not run (other executors are editing the worktree).

## Deviations from Plan

**1. [Rule 3 - Blocking] SheetHeader** - `src/ui/SheetHeader.tsx` is not in the plan's file list. The limit editor title needs an ⓘ beside it, so SheetHeader gained an optional `titleAccessory` (additive, no change for other callers).

**2. [Rule 3 - Blocking] Tests** - the Lines fold is closed by default, so the editor tests in `LinesAndMonth.test.tsx` and `homeDepth.test.tsx` open it first (`wrapOpen`). `DecideHomeScreen.test.tsx` renders inside the providers `wrap` gives, because the info sheets read safe-area insets, and mocks `ChangesCard` as a probe (05-72 is changing it).

**3. Formatting** - `LinesCard.tsx` was run through prettier with the repo's observed style, which re-wrapped a few unrelated lines.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES entry 05-71: add row and investment link on one line, stacked at 2.0x text; Past decisions row hidden at zero; Lines fold closed by default and keeps its state while switching tabs; each Lines ⓘ opens its sheet and the limit editor title ⓘ stacks over the editor; Worst / Average radio list under rule S.

## Self-Check: PASSED
