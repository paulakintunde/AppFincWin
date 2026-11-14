# 06.1 deferred items (out of scope for the plan that found them)

## Found during 06.1-32 Task 1

- `.maestro/back-stays-short.yaml` (line 7) and `.maestro/save-offline.yaml` (lines 7, 28) still tap `"Activity, tab, 2 of 3"`. With Decide and Grow on, the tab bar has 4 tabs, so the label is now "Activity, tab, 2 of 4" and these two flows fail at their first tap. Fix: use `"Activity, tab, 2 of [0-9]"` as `record-as-bought.yaml` and `common/undo-latest.yaml` now do. Not changed in 06.1-32 because neither flow is in its file list.

## From 06.1-49 (2026-11-12)
- iOS swipe-back on a stepper step still goes to Decide home (only Android system Back is caught by StepFrame). Fix in 06.1-57 (stepper): either push steps instead of replace, or disable the swipe gesture on stepper routes. Not testable on the Pixel; check on the iPhone XR.

- **2026-11-13, from 06.1-53 (deviation 1):** `furthest_step` never moves past 1. The stepper writes back `current.furthest_step`, so the column keeps its create value. 53's `editTarget()` works around this by taking the max of furthest_step, L0.visited_steps and firstStepFor. The real fix belongs in check/useStepCheck.ts. **Route to 06.1-78** (Check it lands on the check), whose orchestrator prompt must include it.

## Open checks never leave Draft (found by 06.1-56, routed to 06.1-78)
`useSaveCheckAnswer` is the only writer of `answer_v3`, and nothing in the app calls it, so every open check on Decide home stays "Draft" (DS-12 answered state). Fix in 06.1-78: call it from the answer screen once the answer is shown (once per check/inputs, idempotent), so the open-checks row shows the answered state. No schema change.

## decideTextFit static guard fails on files outside 06.1-72 (found by 06.1-72, 2026-11-13)
`src/features/decide/__tests__/decideTextFit.test.ts` rule T (numberOfLines on system copy: BoughtScreen.tsx, EnvelopeAccountSheet.tsx) and rule F (fixed text heights: StepFrame.tsx, YourMonthCard.tsx, SetupBanner.tsx, SetupChecklist.tsx) fail on the branch head. 06.1-72 touched none of these files; they come from the parallel 56/77 work. Route to the plan that owns each file (56 for YourMonthCard/SetupBanner/SetupChecklist, 77 for BoughtScreen) or 06.1-74.

## Android in-app edge swipe on steps skips the stepper Back rule (found by 06.1-64, routed to 06.1-57/60)
`SwipeBack` on the step screens calls `router.back()` directly. From the answer it lands on the same answer (fine); on the forward path from Decide home it goes to Decide home instead of one step back. Fix in StepFrame (57/60) with `setSwipeBackInterceptor` calling `useStepNav`'s Back.

## QuickEstimatesRoute dead onSave binding (found by 06.1-65, routed to 06.1-61)
Quick estimates now save inside the screen via `useSaveSetupStep` (with Undo). The screen's `onSave` prop is optional and never called. Remove `onSave` and its `useUpdateDecideSettings` binding from `src/shell/decide/QuickEstimatesRoute.tsx`. Also: `SetupDone` component and its strings are unreachable since 06.1-64 deleted the route; remove them.

## Resolved by 06.1-78 (2026-11-13)
- furthest_step: the stepper flush now writes the furthest step visited (`furthestStepOf`, f703f8e7).
- Open checks never leave Draft: the answer stores the shown answer through useSaveCheckAnswer (6e0a27f1).
- G-72-2: record-context and savings-goal reads keep the five-minute Decide freshness on Decide screens (46b1f06e).
- New from 06.1-78 for 06.1-74: G-78-1 (device walks on a Metro serving an edited checkout reload mid-tap) and G-78-2 (the open-check sheet can lose its panel and leave an invisible backdrop). See 06.1-78-SUMMARY.md.

## Open-check sheet sometimes leaves an invisible backdrop (G-78-2, found by 06.1-78, routed to 06.1-74)
Just after opening, the open-check sheet occasionally loses its panel and leaves a full-screen invisible backdrop that swallows the next tap; Android Back clears it. Seen once in Maestro, once by hand. Lives in `src/ui/Sheet.tsx` (06.1-76 H-13 area). 74 must reproduce on the Pixel 6 preview build and fix or route.
Method note G-78-1: device walks must run on a frozen worktree or a preview build; Metro serving a checkout under edit full-reloads mid-tap (that was DN-1/DN-2).

## Resolved by 06.1-57 (2026-11-13)
- Android in-app edge swipe on steps: StepFrame claims the swipe with `setSwipeBackInterceptor` while focused and runs `useStepNav`'s Back (one step back on the forward path; the same answer when `from=answer`). Released on blur/unmount. Needs a Pixel check (61).
- iOS swipe-back on a stepper step (from 06.1-49): already closed by 06.1-64, which turned the native iOS edge swipe off on the three step routes. iPhone XR check stays with 61.

## For 06.1-68 (from 06.1-57)
- The plan name key is `L0.plan_name` (`KEY_PLAN_NAME` in `src/features/decide/screens/check/planName.ts`, with `withPlanName`), not a bare `plan_name`: the stored-check reader drops any answer key without a layer prefix. The answer's `usePlan(pay, planName)` should call `withPlanName({ ...c, pay }, planName)` in the same `step.update`.

## Plan 74 gap rows (2026-11-13), routed to 06.1-80; resolved by 06.1-81, not 80 (2026-11-13)
**Resolved by 06.1-81 (not plan 80):** G-78-2, G-74-2 and G-74-1 below were fixed in quick plan 06.1-81 (see 06.1-81-SUMMARY.md). G-78-2: the backdrop takes taps only after the panel's first layout, and that layout sets the open slide again. G-74-2: until the panel lays out, Android Back reaches the sheet through BackHandler and closes it (or asks, when dirty). G-74-1: a draft save for a check deleted on this device that comes back not-found is dropped silently; other rows still park. The device repro (4 of 16 opens) still needs a Pixel/emulator round.
- **G-78-2 (blocker, reproduced 4/16 on emulator):** open-check sheet loses its panel; only `sheet-gesture-root` and `sheet-backdrop` stay mounted and swallow taps; Android Back clears it. Fix in `src/ui/Sheet.tsx` (mount/animation race; the backdrop must never outlive or precede the panel). Add a test that a sheet whose panel failed to lay out does not leave a pointer-catching backdrop.
- **G-74-2:** a Back pressed while a sheet is still opening can be lost and the sheet then appears. Same Sheet.tsx area.
- **G-74-1 (trust):** after deleting a check, a late stepper draft save fails and Home shows red "2 changes couldn't save: The item was removed elsewhere before this change saved." A save for a deleted check must be dropped silently (or cancelled on delete), never reported as a failure.

## Not ready card caveat still in view (found by 06.1-59, routed to 06.1-67)
The Not ready card shows two sentences: "First: <item> …" and "More may follow once this is done." The G-10 rule moves the caveat behind a `MoreRow` (`src/features/decide/screens/ui/MoreRow.tsx`). 06.1-59 did not change it because 06.1-68 owns `StatusCards.tsx`, `notReadyCard.test.tsx` and `answerScreen.test.tsx` in the same wave, and those tests assert the caveat is visible. 06.1-67 (H-6, the answer's short line first) should move it. Then drop the `ROUTED_TO_67` exception in `src/features/decide/screens/__tests__/oneLineBudget.test.tsx` and update the three test files.

## Resolved by 06.1-68 (2026-11-13)
- For 06.1-68 (from 06.1-57): the answer's plan sheet now calls `usePlan(pay, planName)`, which writes `withPlanName({ ...c, pay }, planName)` in one `step.update` (`L0.plan_name`, never a bare key). Commit 67c21eec.

## Maestro text moved by 06.1-60 (routed to 06.1-61)
- `.maestro/common/decide-quick-estimates.yaml` line 15 taps "Before your records are ready\. Round numbers are fine\." to close the keyboard; tap "Round numbers are fine\." instead.
- `.maestro/decide-safety-net.yaml` line 18 waits for "Money kept for emergencies\. Set in Grow\." (now behind Why?); wait on `id: net-word`.
- 06.1-61 should grep every .maestro flow for text moved behind Why?/More by plans 59, 60 and 67.

## Resolved by 06.1-67 (2026-11-13)
- Not ready card caveat (from 06.1-59): "More may follow once this is done." now opens under the card's MoreRow (`answer-not-ready-more`). The `ROUTED_TO_67` exception is gone from oneLineBudget.test.tsx; the card reads as one sentence. notReadyCard and answerScreen tests open the row first.

## DN-4 residual: "Updating…" line shifts the answer (found by 06.1-67, routed to 06.1-79)
Rows now ignore taps while updating, but the "Updating…" line appears above the verdict and leaves when the update lands, so content jumps and a tap can land on the wrong row right after. Reserve that line's space (fixed slot, opacity change only) so the answer never shifts. Small layout fix in AnswerFrame.

## "1 months" plural (found by 06.1-79, routed to 06.1-33)
`home.footerRecords` ("Answers use {{months}} months of pay…") has no plural form; with the answer's own count it can read "1 months". Add _one/_other forms during the wording sign-off.

## Resolved by 06.1-61 (2026-11-13)
- Found during 06.1-32 (tab labels): `.maestro/back-stays-short.yaml` (already fixed by 06.1-74) and `.maestro/save-offline.yaml` (lines 7 and 28) now tap `"Activity, tab, 2 of [0-9]"`. No flow carries "2 of 3".
- QuickEstimatesRoute dead onSave binding (from 06.1-65): the route no longer passes `onSave` or binds `useUpdateDecideSettings`, and the screen's optional `onSave` prop is gone. **Not done:** removing the unreachable `SetupDone` component and its `decide.screens.setup.done.*` strings touches about a dozen files outside 61 (hints, home facts, banner, checklist, oneLineBudget and textFitMatrix tests, locale). Routed to 06.1-33 (wording sign-off, which owns the strings) as gap row G-61-4.
- Maestro text moved by 06.1-59/60/67: `common/decide-quick-estimates.yaml` and `decide-first-answer.yaml` no longer tap a sentence to close the keyboard (06.1-56/58 keep taps with the keyboard open); `decide-safety-net.yaml` waits for "Safety net settings|No safety net yet" and drops the helper-sentence tap; `decide-stepper-loan.yaml` and `decide-waiver.yaml` open the answer's Why? (`answer-facts-why`) before looking for a fact. Every other flow's tapped or awaited text was checked against the locale files.
- decideTextFit (from 06.1-72): passes on the branch head. The EnvelopeAccountSheet account name no longer has numberOfLines (allowlist entry removed); the StepFrame / SetupChecklist / SetupBanner / YourMonthCard / SetupItemFrame chevrons are allowlisted as "chevron glyph (no text)" (a66fbec1, 9e543e63).

## 06.1 close-out (2026-11-14)
Owner direction: close the phase fast. Device testing and the remaining gaps go to a post-05.5 test audit (Pixel 6) and an audit-fix
round after it. The wording is signed (06.1-33, hash 8611378a…); any change to a locked Decide string in these rounds needs a new sign-off.

### To 05.5 (engine)
- **G-PD-2 root fix:** compute unexplained money only from the as-given reading (not the thin-history reading). This changes engine
  output, so it needs a `DECIDE_ENGINE_REVISION` bump. Until then a thin-history account that confirms spare money is asked "What is
  the $X for?" once (06.1-85-SUMMARY.md).
- **SN-18:** still draft; owner routed it to the engine maths review.
- **Same-day roll-forward (06.1-85-SUMMARY.md):** lines dated on the anchor day are not rolled forward (`l.date <= anchor.at`). So a
  same-day "I bought it" recorded after a confirm does not reduce the confirmed spare money until it is confirmed again.
- **Reviewed-answers page helper:** `sayLine` in `src/engine/decide/v3/__tests__/reviewed/page.ts` ignores `_one` forms, so the
  reviewed-answers page can show the many form for a count of 1.

### To the post-05.5 test audit (Pixel 6)
- 06.1-61 Task 3 owner device pass: steps 1-9 and the 17 "needs Pixel" walk rows (06.1-61-SUMMARY.md).
- G-61-1 recheck on device (a sheet opened during a screen change shows only its backdrop; 06.1-81 code fix not yet device-proven).
- Real Pixel 6 timings (the 72/73/74 numbers were accepted for now).
- DN-1, DB-1 and DP-1 rechecks.

### To the audit-fix round
- G-61-5 (Back lost just after a sheet closes / on the open plan sheet), G-61-7 (font-size change restarts Decide at Home),
  G-61-9 (verdict area keeps "busy" in TalkBack), G-61-15 (decide-check-lands chip scroll; record-as-bought undo).
- G-PD-1, G-PD-3.
- `record-as-bought` Maestro flow red.
- decide-bought 9000 stepper subflow.
- Undo/History label "Unspent money confirmed": signed as-is in 06.1-33; reword in the audit (contains "unspent").
- Emulator test-data cleanup (spare Google test account, production; see 06.1-61 and 06.1-85 summaries).
- The owner's own-account test items: the headphones 180 check and the used car 9000 draft.
