---
phase: 05-decide-ui
plan: 53
subsystem: decide-ui
tags: [step2, card, minimum-payment, card-fees]
requires: [05-19, 05-31, 05-43, 05-44]
provides: [cardTermsCopy, CardMinimumRow, CardMinimumSheet, onSaveCardTerms prop, card fees field]
affects: [05-30]
key-files:
  created:
    - src/features/decide/copy/cardTermsCopy.ts
    - src/features/decide/copy/__tests__/cardTermsCopy.test.ts
    - src/features/decide/check/steps/step2/CardMinimumSheet.tsx
    - src/features/decide/check/steps/__tests__/cardMinimum.test.tsx
  modified:
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/step2/types.ts
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
    - src/features/decide/check/steps/__tests__/depthInputs.test.tsx
    - src/features/decide/check/steps/__tests__/depthStep2.test.tsx
requirements-completed: [DCU-02, DCU-07, DCU-09, DCU-17, DCU-24]
duration: 30min
completed: 2026-10-16
---

# Phase 5 Plan 53: Card minimum terms Summary

A 'Minimum payment' row and terms sheet in the step 2 card panel (D-40) that edit the card's own debt record through `onSaveCardTerms`, plus a never-pre-filled 'Card fees (optional)' field feeding the card costs tile (D-44).

## Tasks
1. cardTermsCopy: `cardTermsSummary`, `parseCardTermsForm`, `cardCostsCopy` (458c08c). Integer and string maths only; the floor goes through the engine `parseAmount`.
2. CardMinimumRow / CardMinimumSheet, card panel wiring, fees field and breakdown line (db9ef92).

## Decisions
- `Step2Props.onSaveCardTerms` is required; the three existing step 2 test fixtures pass a no-op. 05-30 wires it to `useSaveCardTerms`.
- Sheet holds the floor as minor units (MoneyInput) and converts to plain decimal text for `parseCardTermsForm`, so one validation path serves both.
- Field errors reuse `money.amountInput.error.invalid` (no new catalogue keys).
- The fees field shows even before a card is chosen; the Minimum payment row needs a chosen card.

## Deviations from Plan
None - plan executed as written. No engine edits, no migrations.

## Deferred Issues
- `npm run depcruise` reports one pre-existing violation (`fx-fetch-never-from-reads`: `check/sections/DayByDaySection.tsx` to `src/db/fxResolve.ts`, introduced by 05-42). Identical with and without this plan's changes; out of scope.

## Human / device items
- Visual check of the row, chevron and sheet on device; TalkBack on the row and the paid-in-full toggle; keyboard behaviour of the At least field when Save is pressed without blurring (MoneyInput commits on blur).

## Self-Check: PASSED
