# Walkthrough 2 Fix C Summary

Two Pixel 9 (411 dp, 1.15x) findings fixed on phase/05-decide-ui.

## 1. BasisOutcomeCard (Step 3)

Root causes: the rows only stacked under rule S (width < 360, scale > 1.3), so at 411 three columns of about 80 dp held real amounts and the "Doesn't fit right now" chip. The title used the `heading` role (display size).

Fix: `check/basisOutcomeFit.ts` (`basisRowsStack`, pure, same style as heroOneLineMax) stacks when the widest figure, basis name or chip would not fit a column on one line at the window width and font scale. Each row has a wrapping name + chip line (chip box `flexShrink: 0`) and the figure under it as one line (`numberOfLines 1`, `adjustsFontSizeToFit`, min 0.8) so a number never breaks. Title uses `sheetTitle` like the sibling folds. In practice every phone width stacks (the real chip alone needs more than a third of the card); columns remain for wide windows.

Tests: 'D-107 outcome card never breaks an amount', 'D-107 outcome card stacks at 411 wide with real amounts', 'D-107 the title uses the section title role...'; r18Matrix outcome cell updated (always stacked, figure one line); decideTextFit allowlist gained exactly one figure entry for BasisOutcomeCard.

## 2. Blank page after "Run the full check"

Root causes: (a) the flow showed a fully blank View for `loading` and for the no-computation state; (b) the flow waited for the create to appear in the checks list, but the create sits behind the serial write queue and a checks refetch drops the optimistic row, so the row (and also `checks.data` on a cold list) was missing for seconds. The exact 6-13 s is the queue wait plus the snapshot computation; the queue itself was not changed.

Fix: `optimisticCheckRow` (exported from data/mutations/decideChecks.ts, reused by onMutate) and `useCreateCheck().pendingRows`; `useCheckDraft` falls back to the queued create's row, and no longer requires `checks.data` when it has one. The flow renders step 2 from it immediately. New `CheckFlowLoading` skeleton (busy, "Loading your figures") replaces both blank views.

Tests: useCheckDraft 'a pending create renders from the optimistic row without waiting for the server'; CheckFlow 'a pending create renders the loading treatment, never a blank page, then step 2 once the row is usable'.

## Verify

Named tests, BasisOutcomeCard, r18Matrix, decideTextFit, CheckFlow, useCheckDraft pass. tsc clean, eslint 0 errors. In the wider run (check, decide/__tests__, data) remaining failures are outside this scope and come from the other executors' uncommitted work: data/queries decideJudgeOn, r18MatrixPots, r18ReadingOrder.

## Deviations

Touched data/mutations/decideChecks.ts (outside decide/) to expose pendingRows. No en.ts change.
