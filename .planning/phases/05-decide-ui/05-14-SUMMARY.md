---
phase: 05-decide-ui
plan: 14
subsystem: decide-check-steps
tags: [decide, ui, check-flow, step1, step2, line-editor, tdd]
requires: [05-07, 05-08, 05-09, 05-10, 05-28]
provides:
  - Step1Item, step1Complete (the item, never-past need-by date, replaced expenses)
  - Step2PriceAndPay, step2Complete (price card, four methods side by side, method panels, costs that follow it)
  - LineEditorSheet (shared by every list in the flow)
affects: [05-30, 05-43, 05-44]
key-files:
  created:
    - src/features/decide/check/LineEditorSheet.tsx
    - src/features/decide/check/steps/Step1Item.tsx
    - src/features/decide/check/steps/Step2PriceAndPay.tsx
    - src/features/decide/check/steps/stepUi.tsx
    - src/features/decide/check/steps/step2/PaymentMethods.tsx
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/step2/types.ts
    - src/features/decide/check/__tests__/LineEditorSheet.test.tsx
    - src/features/decide/check/steps/__tests__/Step1Item.test.tsx
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
    - src/features/decide/check/steps/__tests__/helpers/stepProps.tsx
  modified:
    - src/features/decide/ui/RateInput.tsx
    - src/i18n/locales/en.ts
decisions:
  - Step2Props lives in step2/types.ts and is re-exported from Step2PriceAndPay, so the sub-components do not form an import cycle (depcruise no-circular)
  - A name edit and the item-type follow it make one update patch ({ name, ...withItemType(...) }), so an autosaving shell never sees a half-applied pair
  - Interest saved on the loan panel is the no-deposit loan plan (toEngineCheck + resolvePlan on the user's own terms) minus the current plan; the tile is left out when either plan is missing
  - A setback line only asks for an amount when its kind is Once; the other kinds take months, percent or days
metrics:
  tasks: 3
  files: 13
  completed: 2026-10-16
---

# Phase 5 Plan 14: Check steps 1 and 2 Summary

Steps 1 and 2 of the five-step check plus the shared line editor: the item with a suggest-only item type and a need-by date that can never be in the past, and the price and four payment methods compared side by side from the engine's per-method plans, with every credit term the user's own.

## Commits
- 4f8b995: LineEditorSheet and Step1Item (Task 1)
- 3935001: Step2PriceAndPay price card, method cards, running costs (Task 2)
- 369fd9f: method panels (loan, instalment, card, investment term) (Task 3)

## What was built
- **LineEditorSheet**: five contexts (adjust, running, replaces, setback, fee), "From your recurring bills" prefill, Adds/Takes off and Paid on the day, setback kinds with months/percent/days; Save line disabled until valid; a dirty sheet asks the shared discard prompt, Cancel never asks.
- **Step1Item**: kind chips, name (80), MoneyInput price, source, item type Dropdown with "Suggested from the name" (every change through `withItemType`, so an untouched secured toggle follows), offset chips plus `DateField minDate={today}`, "This date has passed" in danger, Why (500), expenses it replaces with local-undo removal. `step1Complete` gates Next.
- **Step2PriceAndPay + PaymentMethods**: Advertised/Edit/adjustment rows (tax lines recomputed from the advertised price)/Final price and "n of m lines counted"; four ChoiceCards from `computation.methodPlans` with Rate needed / Not accepted / Part on the card / Below the price flags; a null total reads "Endless" or "Not within 50 years"; the not-a-lender footer once; costs that follow it with the read-only "ends" rows and net monthly change. `step2Complete` gates Next.
- **MethodPanels**: loan (deposit field + slider in 100-unit steps, Interest saved and Cash left after, term as typed with chips, "Paid off in month m" beside it, rate empty until typed, secured switch with `securedTouched: true` on flip); instalment (note on the instalments alone, fees note on `plan.financed`, below-the-price and missing notes); card (eligibility, account chips, rate saved on blur only when `isValidAprText`, payoff chips, months stepper, Cleared = `payoffMonths`, Interest and Card costs from the engine, the 50-year remaining note, three neutral notes); investment monthly (term chips, put-in total, "worth about" only for a typed rate).

## Verification
- `npx jest src/features/decide src/theme/__tests__/noRawColours.test.ts src/i18n src/ui --silent`: 61 suites, 8998 tests passed (check folder: 80 tests across 3 files).
- `npm run typecheck` clean; `npm run lint` 0 errors (warnings pre-existing); `npm run depcruise` clean.
- Plan grep gates all met, including the four named alignment tests and the lender-wording grep (0 matches).

## Deviations from Plan
**1. [Rule 3 - Blocking] RateInput gains an optional onBlur.** The card rate is saved on blur, and the 05-28 primitive exposed no blur hook. Additive, default unchanged. File: `src/features/decide/ui/RateInput.tsx`.
**2. [Rule 3 - Blocking] Step2Props moved to `step2/types.ts`.** The plan's layout made Step2PriceAndPay and its two sub-components import each other (type imports count for dependency-cruiser no-circular). Re-exported from Step2PriceAndPay so callers import it from there.
**3. [Added files]** `steps/stepUi.tsx` (card, label, text box, money binding shared by both steps) and `steps/__tests__/helpers/stepProps.tsx` (StepProps over a real `computeCheck`), not in the plan's file list.
**4. [Copy keys]** Added `decide.toast.lineRemoved` ("Removed · {{name}}") for the local-undo toasts and `decide.pay.noteInvestCaption` / `decide.pay.unnamedLine`; all other copy was already in the catalogue.
No engine edits. No migrations.

## Known Stubs
None. `onSaveCardRate` and `recurringBills` are props supplied by the flow screen (05-30); 05-43 and 05-44 extend these files for the income-change card, credit terms, running-cost prompts and estimate-gap notes, as the plan states.

## Human / device verification
- At 402 wide, the "A month" strip figure (exact, with cents) and the instalment payment must stay on one line; jest cannot measure layout, so check on the Pixel 9 and the iPhone XR.
- Read-only (decided) checks dim and block their controls through a pointer-events wrapper; confirm TalkBack/VoiceOver treat them as inert.
- Native date picker minimum (iOS inline sheet, Android dialog) with `minDate` = today: already guarded in JS by 05-08, but the picker UI itself needs a device pass.
- MoneyInput commits on blur: confirm tapping "Save line" while a money field is focused saves the typed amount on a real keyboard.

## Self-Check: PASSED
