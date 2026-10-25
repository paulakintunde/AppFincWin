---
phase: 05-decide-ui
plan: 70
subsystem: ui
tags: [decide, step5, wait, D-70, D-71, D-76]
requires: [05-54, 05-55, 05-58, 05-61]
provides:
  - WrittenList, the stacked bullet list shared with the Go ahead confirm (05-75)
  - Step 5 Wait period chips 3/6/12/24 + Custom and the typed Wait amount
  - waitGoal, coolingOff and whatGetsWritten info buttons on step 5
affects: [05-75]
key-files:
  created:
    - src/features/decide/ui/WrittenList.tsx
    - src/features/decide/ui/__tests__/WrittenList.test.tsx
  modified:
    - src/features/decide/check/steps/Step5Decision.tsx
    - src/features/decide/check/steps/__tests__/Step5Decision.test.tsx
    - src/features/decide/ui/ChoiceCard.tsx
decisions:
  - "ChoiceCard takes a titleAccessory node; the info sheet is mounted by Step5 outside the card so a Modal never sits inside the radio Pressable"
  - "The cooling-off info button is a sibling of ToggleRow in a row, not inside the switch Pressable"
  - "WrittenList dot uses minHeight (not height) to keep the plan's no-height grep at 0; first-line centring is the fixed (20.25 - 6) / 2"
requirements: [DCU-26, DCU-07, DCU-21, DCU-22, DCU-25, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 70: Step 5 Wait period, typed amount and written list Summary

Wait is set by period (CustomValueChips 3/6/12/24 + Custom 1-120, amount = ceil(target / N) via `waitAmountForMonths`, selected chip from `waitMonthsFor`) or by a typed amount in SliderWithField (track `waitSliderBounds`, typed `waitTypedBounds`), and "What gets written" is the new stacked WrittenList.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. WrittenList | 336ba9e6 | one wrapping row per line, 6px accent dot centred on the first line |
| 2. Wait chips, amount, step 5 info | c04978c8 | chips hidden when target is 0; read-only locks chips and fields, info stays live |

## Verification

- `jest src/features/decide/check src/features/decide/ui src/features/decide/copy`: 51 suites, 723 tests passed (includes DCU-09 copy guards and the existing step 5 suites).
- `npm run typecheck` clean; eslint clean on the four touched source/test files plus ChoiceCard.
- `grep -cE "numberOfLines|height:" WrittenList.tsx` is 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] ChoiceCard edited (not in files_modified).** The Wait outcome card title needs an info button, so ChoiceCard gained an optional `titleAccessory`. Another executor had an uncommitted head-wrap style change in the same file; it was staged with mine and is in commit c04978c8.

**2. Range line wording.** Field a11y label reads "Monthly saving, custom, amount" (existing `decide.custom.fieldA11y` + `decide.pay.card.field.amount`); no new copy keys were added to en.ts because another executor had it open.

**3. Cooling-off ⓘ placement.** Right of the switch row, since a button cannot nest inside the switch Pressable and stay reachable.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-70: Wait chips and Custom field at 320 wide and 1.3x text scale; slider thumb pin and "Above the slider's range"; info buttons on the Wait card title (selected, dark tone) and cooling-off row; WrittenList wrap at 2.0x.

## Self-Check: PASSED
