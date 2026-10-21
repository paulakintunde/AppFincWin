---
phase: 05-decide-ui
plan: 29
subsystem: decide-ui
tags: [decide, commit, go-ahead, confirm-sheet, decided-checks, depcruise-injection]
requires: [05-11, 05-17, 05-19, 05-20, 05-24, 05-30, 05-46, 05-52]
provides:
  - useCommitDecision (Go ahead confirm, Wait, Pass)
  - CommitMutations context and CommitMutationsProvider (route-injected writes)
  - decided-check view (bought header, Reopen the check)
affects: [05-25, 05-26]
key-files:
  created:
    - src/features/decide/check/useCommitDecision.ts
    - src/features/decide/check/commitMutations.ts
    - src/shell/decide/CommitMutationsProvider.tsx
    - src/features/decide/check/__tests__/commit.test.tsx
  modified:
    - src/features/decide/check/CheckFlowScreen.tsx
    - src/features/decide/check/CheckActionBar.tsx
    - src/features/decide/check/__tests__/CheckFlow.test.tsx
    - app/(app)/decide/check/[id].tsx
    - src/i18n/locales/en.ts
key-decisions:
  - "Go ahead/Wait/Pass writes reach the decide feature only through CommitMutationsContext, provided by the route (decideGoAhead and decideOutcome reach db/fxResolve, which depcruise forbids under features/decide)"
  - "Go ahead availability is decided by a dry run of 05-20's buildGoAheadWrite (the real builder), so the UI and the write never disagree; the builder's defensive throw is unchanged"
requirements-completed: []
metrics:
  tasks: 2
  completed: 2026-10-21
---

# Phase 5 Plan 29: Commit a decision and decided checks Summary

Step 5's primary now commits: Go ahead asks once with the exact `writtenLines` list, then writes through 05-20 with the medium haptic and an Undo toast; Wait and Pass save and toast. Bought checks open read-only on the 05-52 recalculation with a "Decided {date}" header beside it; waiting and passed checks recompute and reopen as a new check at step 3.

## Tasks
1. useCommitDecision, provider, route wiring, confirm sheet, copy and tests (666fe166). Task 2 (decided checks) is in the same commit because both change CheckFlowScreen and share commit.test.tsx.

## What it does
- Go ahead: `ConfirmSheet` "Write this to your records?" with the `writtenLines` sentences (today, cash account, card and investment account names passed); Not yet and dismiss write nothing. Confirm calls `goAhead` once, `hapticMedium`, toast `decide.toast.written` or `writtenBroke` with the undo `stepId`, then back to Decide.
- Before the confirm the hook resolves cash account (goAccountId or largest cash), card account (from the chosen card), Debt, Savings and system Transfer category ids, the invest account and replaced series versions. If the real builder would throw, Go ahead is disabled and the action bar hint gives one line (`goNeedsMonth`, `goNeedsAccount`, `goNeedsCard`, `goNeedsDebtCategory`, `goNeedsSavingsCategory`, `goUnavailable`); Wait with no plan says `waitNeedsPlan`.
- Wait: `waitAndSave` with monthly amount, ready-by, `goalTarget`, `coolingOff` (needs_spreading only), medium haptic, toast with the formatted date or the notifications-off line. Pass: `pass`, no haptic beyond selection, "Passed. Nothing moved." Go ahead keeps its 05-20 refusal toasts on a definitive failure (`undo.batchRefused` / `undo.batchSavedNoUndo`); since 2026-10-21 that failure also cancels the check's cooling-off reminder (see 05-20-SUMMARY, post-plan fix).
- Bought: `computeCore`/`computeDetails` are skipped (the 05-52 hook's computation is shown); decided header = stored verdict chip, "Decided {date}", estimated day and month; primary "Back to Decide", no Reopen. Waiting/passed: live recompute, primary "Reopen the check" (cancels both reminders, `useReopenCheck`, pushes the new check at step 3).
- The decided primary replaces "Next" from step 3 on; steps 4 is reachable from the step bar.

## Carry-overs (05-30) done
onCommit wired (hook inside CheckFlowScreen, writes injected from the route file); categories/card account resolved with a declarative disabled state, tests `a missing Debt category disables Go ahead...`, `a card paid over months resolves...`; `today`/`investAccountName` passed to `writtenLines`; bought checks keep `useBoughtCheckComputation`. The open-check seen-state write (`useMarkCheckSeen`, step 3 first reveal) from 05-30 is unchanged; decided checks do not write it.

## Deviations from Plan
**1. [Rule 3 - Blocking] Writes injected through the route.** `decideGoAhead`/`decideOutcome` reach `db/fxResolve`, so depcruise `fx-fetch-never-from-reads` failed on a direct import. Added `commitMutations.ts` (context, own types) and `src/shell/decide/CommitMutationsProvider.tsx`, mounted in `app/(app)/decide/check/[id].tsx` (05-47 pattern). The `onCommit` prop was removed from `CheckFlowScreen` (the hook is called inside it).
**2. [Rule 3 - Blocking] New copy keys** under `decide.decision`: goNeedsMonth, goNeedsAccount, goNeedsCard, goNeedsDebtCategory, goNeedsSavingsCategory, goUnavailable, waitNeedsPlan. Commit 666fe166.
**3. [Rule 1 - Bug] Bought checks no longer run `computeCore` on the unfiltered snapshot** (05-30 computed it and discarded it); now skipped, as the plan's spy test requires.

No engine edits, no migrations, no change to `buildGoAheadWrite`.

## Known Stubs
None. `goNeedsCard` is a defence that the UI rarely reaches (an unresolved card leaves the verdict unresolved, so `goUnavailable` shows first); no named test covers it.

## Human / device items
- Confirm sheet, medium haptic and the Undo toast on device (05-26); Android back dismisses the sheet.
- Reopen the check on a waiting/passed check pushes a new check over the decided one; confirm the back stack feels right.
- The `bought` header with large font at 402x874.

## Verification
commit.test 15 tests green; CheckFlow 34 green; full jest 528 suites, 16184 passed; typecheck clean; lint 0 errors; depcruise clean; noRawColours green.

## Self-Check: PASSED
