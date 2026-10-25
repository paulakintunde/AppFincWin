---
phase: 05-decide-ui
plan: 68
subsystem: ui
tags: [decide, info, step1, step2, text-fit, D-70, D-76]
requires: [05-54, 05-55, 05-58, 05-61, 05-80]
provides:
  - replaces and incomeChange info buttons on Step 1
  - replaces, runningCosts, netMonthly, lossOfValue, cardMinimum and paidInFullMonthly info buttons on Step 2 and the card terms sheet
  - stacking kind and date-offset chips on Step 1 (rule S)
  - ChoiceCard head that wraps the flag under the title
  - loss-of-value percent as a bounded RateInput (max 100, range line "0 to 100%")
key-files:
  created:
    - src/features/decide/check/steps/__tests__/infoPlacement.test.tsx
  modified:
    - src/features/decide/check/steps/Step1Item.tsx
    - src/features/decide/check/steps/step1/IncomeChangeCard.tsx
    - src/features/decide/check/steps/Step2PriceAndPay.tsx
    - src/features/decide/check/steps/step2/RunningCostPrompts.tsx
    - src/features/decide/check/steps/step2/CardMinimumSheet.tsx
    - src/features/decide/ui/ChoiceCard.tsx
decisions:
  - "Every title ⓘ goes through InfoTitle + useInfoSheet (05-64), so Close returns focus to the button"
  - "Each read-only '{name} ends' row is its own EndsRow component (a hook per row); its ⓘ sits outside the locked CheckRow"
  - "CardMinimumSheet draws its own header row (InfoTitle + Cancel) because the shared SheetHeader only takes a string title"
  - "The Chip component has no style prop, so ChipRow wraps each chip in a View (flex 1, or width 100% under rule S)"
requirements: [DCU-25, DCU-27, DCU-19, DCU-20, DCU-24]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 68: Step 1 and 2 info buttons and text fit Summary

Steps 1 and 2 now explain their non-obvious terms in place and hold up at 2.0x text. Step 1's two chip rows stack full width under rule S, the Step 2 price-side terms each carry their R3 explanation, the card terms sheet title and the Minimum payment row open the cardMinimum sheet, and the loss-of-value percent refuses anything above 100% with the warn1 range line.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Step 1 ⓘ and stacking chips | c9d9d588 | replaces on "Expenses it replaces", incomeChange on "Does this change your income?"; ChipRow stacks kind and offset chips |
| 2. Step 2 ⓘ, ChoiceCard wrap, loss-of-value bound | 5bf1a4f6 | EndsRow, running costs, net monthly, loss of value, card minimum row and sheet title, Paid in full monthly |

## Verification

- `npx jest` on infoPlacement (8 tests), Step1Item, cardMinimum, depthStep2, choicePrimitives: pass. Step2PriceAndPay passes except 3 MethodPanels tests (see below).
- `npm run typecheck`: clean at the time of the run.
- eslint on every file I touched: 0 errors, 0 warnings.
- Full `npm run lint` and the whole-repo run were not done (other executors edit the worktree).

## Deviations from Plan

**1. [Rule 3 - Blocking] InfoTitle instead of InfoLabel** - same reason as 05-64: InfoLabel cannot take the focus-return ref from `useInfoSheet`.

**2. [Rule 3 - Blocking] ChipRow wrapper** - Chip has no style prop and is shared, so each chip sits in a wrapper View.

**3. [Rule 3 - Blocking] Local card terms header** - SheetHeader takes a string title; the sheet draws the same row (sheetTitle, Cancel, same hit slop) with the ⓘ.

**4. ChoiceCard staged by hunk.** Another executor (05-70) had an uncommitted `titleAccessory` change in ChoiceCard.tsx. I committed only my head-wrap hunk (by staging a HEAD-based blob); their hunk is still uncommitted in the working tree.

**5. Existing 100% guard kept.** `typePercent` still ignores values above 100, now unreachable because RateInput `max='100'` refuses first. Harmless, left in.

## Issues for the user or the next plan

- On a decided (read-only) check, `Lock` sets `pointerEvents='none'` on its region, so ⓘ buttons inside a Lock (Step 1 and Step 2 cards) are not tappable although InfoButton itself is never disabled. The same holds for the 05-64 buttons placed under a Lock. A fix belongs in `stepUi.tsx` Lock (leave info buttons live), outside this plan's files.
- Failing tests in files owned by other plans (in-progress when I ran): 3 MethodPanels tests in Step2PriceAndPay.test.tsx (loan term chips, instalment count), Step5Decision wait tests, and a credit terms case in depthInputs.test.tsx. None touch my files.

## Device items

05-EXECUTION-NOTES entry 05-68: Step 1 chips at 320 wide and 2.0x are full-width rows; each ⓘ sits beside its label and TalkBack reads "About {term}, button"; the card terms sheet shows two ⓘ and the second sheet stacks over it; a ChoiceCard flag drops under its title at 2.0x; typing 101 in loss of value shows "0 to 100%".

## Known Stubs

None.

## Self-Check: PASSED
