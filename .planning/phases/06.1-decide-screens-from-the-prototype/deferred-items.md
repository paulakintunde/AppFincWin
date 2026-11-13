# 06.1 deferred items (out of scope for the plan that found them)

## Found during 06.1-32 Task 1

- `.maestro/back-stays-short.yaml` (line 7) and `.maestro/save-offline.yaml` (lines 7, 28) still tap `"Activity, tab, 2 of 3"`. With Decide and Grow on, the tab bar has 4 tabs, so the label is now "Activity, tab, 2 of 4" and these two flows fail at their first tap. Fix: use `"Activity, tab, 2 of [0-9]"` as `record-as-bought.yaml` and `common/undo-latest.yaml` now do. Not changed in 06.1-32 because neither flow is in its file list.

## From 06.1-49 (2026-11-12)
- iOS swipe-back on a stepper step still goes to Decide home (only Android system Back is caught by StepFrame). Fix in 06.1-57 (stepper): either push steps instead of replace, or disable the swipe gesture on stepper routes. Not testable on the Pixel; check on the iPhone XR.

- **2026-11-13, from 06.1-53 (deviation 1):** `furthest_step` never moves past 1. The stepper writes back `current.furthest_step`, so the column keeps its create value. 53's `editTarget()` works around this by taking the max of furthest_step, L0.visited_steps and firstStepFor. The real fix belongs in check/useStepCheck.ts. **Route to 06.1-78** (Check it lands on the check), whose orchestrator prompt must include it.

## Open checks never leave Draft (found by 06.1-56, routed to 06.1-78)
`useSaveCheckAnswer` is the only writer of `answer_v3`, and nothing in the app calls it, so every open check on Decide home stays "Draft" (DS-12 answered state). Fix in 06.1-78: call it from the answer screen once the answer is shown (once per check/inputs, idempotent), so the open-checks row shows the answered state. No schema change.
