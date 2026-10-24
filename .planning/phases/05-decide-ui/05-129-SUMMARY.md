---
phase: 05-decide-ui
plan: 129
subsystem: decide
tags: [wait, pots, copy, D-101, R18.2]
requires: [05-124, 05-127, 05-131]
provides: [Wait copy says pot, own-pot exclusion wired at every call site and proven through computeCheck]
affects: [en.ts, CheckFlowScreen, useBoughtCheckComputation, homeRowsModel, OpenChecksCard]
key-files:
  modified: [src/i18n/locales/en.ts, src/features/decide/check/writtenLines.ts, src/features/decide/check/CheckFlowScreen.tsx, src/features/decide/check/useBoughtCheckComputation.ts, src/features/decide/home/homeRowsModel.ts, src/features/decide/home/OpenChecksCard.tsx, src/features/decide/snapshot/computeCheck.ts]
  created: [src/features/decide/snapshot/__tests__/computeCheck.waitPot.test.ts]
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 5 Plan 129: Wait becomes a pot Summary

The Wait copy now says pot and net free cash flow (R18.2), and a reopened Waiting check passes its own id so its pot is not counted twice.

## Commits
- 1ff0f47c feat(05-129): Wait copy
- 1181f995 feat(05-129): pass check id for own-pot exclusion + computeCheck.waitPot test

## What was built
- Edited en.ts: the goal preview/written strings ("A pot of ..."), outcome card, waitGoal body and changes, whatGetsWritten body, waitingBody delete confirm, writtenWaitNoChange ("No balance moves. {{amt}} a month comes off net free cash flow."). writtenLines passes `amt` (the Wait monthly amount).
- Tests updated to the new wording; named D-101 tests added (bullets, outcome card, delete confirm, own pot).
- `computeCore`/`settledCoreFor`/`computeCheck`/`computeChip` callers now pass the check id: CheckFlowScreen, useBoughtCheckComputation, homeRowsModel, OpenChecksCard.
- computeCheck.waitPot.test.ts: reopened Waiting check equals the never-created figures and verdict; another check's Wait pot and an open pot stay counted.

## Deviations
- [Rule 3] Files outside files_modified were edited to pass the id (the plan said it must; 05-124 only added the parameters): CheckFlowScreen.tsx, useBoughtCheckComputation.ts, homeRowsModel.ts, OpenChecksCard.tsx, computeCheck.ts (optional `ownCheckId` on `settledCoreFor`).
- No defect found in 05-124's exclusion. Past decisions screen/sheet/useDeleteDecision needed no code change (copy comes from en.ts).
- The "savings goal" label in the undo-entity string (en.ts line 1377) was left, since R18.2 does not list it.

## Verification
- `npx jest src/features/decide src/i18n`: 137 suites, 17142 tests pass. Snapshot folder at 100% branch/function/line/statement coverage.
- typecheck clean; eslint 0 errors (800 pre-existing warnings); depcruise clean.

## Device item
05-EXECUTION-NOTES "05-26 device checklist additions (Money concepts R18)", entry 05-129 (not ticked).

## Self-Check: PASSED
