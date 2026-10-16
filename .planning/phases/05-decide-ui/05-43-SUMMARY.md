---
phase: 05-decide-ui
plan: 43
subsystem: decide-ui
tags: [decide, step1, step2, credit-terms, promo, deferred-interest, late-fee]
requires: [05-10, 05-14, 05-28, 05-37]
provides:
  - IncomeChangeCard (step 1 income-change input)
  - PromoRow, VariableRateCard, LateFeeField (step 2 credit terms)
affects: [05-44]
key-files:
  created:
    - src/features/decide/check/steps/step1/IncomeChangeCard.tsx
    - src/features/decide/check/steps/step2/CreditTermsPanel.tsx
    - src/features/decide/check/steps/__tests__/depthInputs.test.tsx
  modified:
    - src/features/decide/check/steps/Step1Item.tsx
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/i18n/locales/en.ts
key-decisions:
  - "Card panel shows the promo 'Then' rate read-only with 'Change it above'; the loan panel edits loan.aprText"
metrics:
  tasks: 2
  completed: 2026-10-16
requirements: [DCU-02, DCU-08, DCU-09, DCU-17, DCU-19]
---

# Phase 5 Plan 43: Income change and credit terms Summary

Step 1 gains an optional income-change card (raise or lower, amount, no-past start date, likelihood), and step 2 gains the promotional-rate row with the D-42 deferred-interest toggle, the variable-rate stress card and the instalment late fee, all fed by the engine's plan.promo, plan.lateFees and decision.stress.

## Tasks
1. IncomeChangeCard in Step1Item (purchase checks only), commit 9e6a137.
2. PromoRow / VariableRateCard / LateFeeField in the loan, card and instalment panels, commit 91d80f2.

## Verification
- `npx jest src/features/decide/check/steps`: 143 passed; `npx jest src/features/decide src/i18n`: 9123 passed
- `npm run typecheck` clean; `npm run lint` 0 errors; depcruise clean

## Deviations from Plan
- [Rule 3] Added catalogue key `decide.depth.credit.promoThenAbove` ("Change it above"); the plan names the text but no key existed.
- IncomeChangeCard also takes `source` and `exact` (currency and date formatting). The StateChip tone for a stress line is derived from the state key.
- Late-fee and stress results are the engine's figures through lateFeeCopy / stressCopy; no new engine or migration work.

## Device / human items
- Visual pass of the expanded promo row and stress card at 402x874 and large font scale.
- Date picker past-day refusal on a real device (guarded in code by DateField and covered by a prop test only).

## Known Stubs
None.

## Self-Check: PASSED
