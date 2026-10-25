---
phase: 05-decide-ui
plan: 73
subsystem: ui
tags: [decide, delete, past-decisions, detail-sheet, undo, D-73, D-75, D-76, D-70]
requires: [05-54, 05-55, 05-56, 05-58, 05-59, 05-62]
provides:
  - useDeleteDecision (confirmCopy, deleteDecision) and writtenCount
  - Past decisions rows on DeletableRow (swipe or menu, per-outcome confirm, Undo toast)
  - Decision detail sheet Delete, linked-lines reveal, stacking and whatGetsWritten info
affects: [05-75]
key-files:
  created:
    - src/features/decide/past/useDeleteDecision.ts
  modified:
    - src/features/decide/past/PastDecisionsScreen.tsx
    - src/features/decide/past/DecisionDetailSheet.tsx
    - src/features/decide/past/__tests__/PastDecisionsScreen.test.tsx
    - src/features/decide/past/__tests__/DecisionDetailSheet.test.tsx
    - src/features/decide/past/__tests__/goalTagging.test.tsx
decisions:
  - "Written-line count = live links with source 'written' (the server-forced origin), not role"
  - "The info on the Linked lines heading comes from check/InfoTitle + useInfoSheet so closing returns focus to the button"
  - "DecisionDetailSheet keeps its header title as the shared DetailSheet renders it (wraps, no line cap)"
requirements: [DCU-07, DCU-21, DCU-22, DCU-28, DCU-25, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 73: Delete on Past decisions and the detail sheet Summary

A decided check is deleted from the list (swipe or the ⋯ menu) or from its detail sheet through one hook. The confirm copy differs per outcome, the check row (and a Waiting decision's own goal) is soft-deleted in one undo step, reminders are cancelled, and the toast says "Decision deleted" with Undo. No line Go ahead wrote and no tagged transfer is ever touched.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. useDeleteDecision and Past decisions rows | 85468aae | Rows are DeletableRows; menu Open, Reopen (Waiting and Passed only), Delete; names 2 lines; delta strip stacks under rule S |
| 2. Detail sheet | cf56f6a6 | Delete pill and confirm via the hook; linked lines past 3 behind Show details; heading with whatGetsWritten ⓘ; LabelValueRow tiles; fixed height now minHeight |

## Verification

- `npx jest src/features/decide/past`: 3 suites, 40 tests pass (all named acceptance tests present). `npx jest src/i18n` (includes the DCU-09 copy guard): 13240 pass.
- `npm run typecheck` clean. eslint on `src/features/decide/past`: 0 errors (9 `require()` warnings in jest mocks, the established pattern).
- `grep -c "decide.past.remove\|decide.toast.removed"` in the sheet = 0; `grep -cE "^\s+height:"` = 0; `grep -c "export function useDeleteDecision"` = 1.

## Deviations from Plan

**1. [Rule 3 - Blocking] Safe-area mock in tests** - the whatGetsWritten InfoSheet reads safe-area insets, so the three past test files mock `useSafeAreaInsets` (same as InfoButton.test.tsx). goalTagging.test.tsx was touched for this only.

**2. Header title not capped** - the plan asks names to follow the 2-line rule. The sheet's header title is rendered by the shared `DetailSheet` (src/ui), outside this plan's files, and already wraps without truncation. Linked-line names in the sheet and list row names are capped at 2 lines with the full name in the accessibility label. A cap on the header title would need a `DetailSheet` prop.

**3. Row accessibility label** - rows pass `accessibilityLabel` to DeletableRow, a prop another executor added to DeletableRow.tsx (uncommitted when this plan finished). Typecheck and tests pass against the working tree; it must land with that executor's commit.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-73: swipe a Past decision left (Delete), the ⋯ menu lists Open, Reopen (Waiting and Passed only), Delete; the bought confirm names the number of lines that stay in Activity; deleting a Waiting decision removes its goal and reminder and Undo brings both back (reminder reschedules when the date is ahead); the detail sheet shows 3 linked lines then Show details; ⓘ on Linked lines opens What gets written.

## Self-Check: PASSED
