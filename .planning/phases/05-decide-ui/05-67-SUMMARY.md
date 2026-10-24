---
phase: 05-decide-ui
plan: 67
subsystem: ui
tags: [decide, step2, custom-value, info, D-70, D-71]
requires: [05-54, 05-55, 05-58, 05-61, 05-80]
provides:
  - Step 2 durations 1 to 120 with Custom values, MAX_TERM 120
  - Deposit as one slider with a typed field
  - Bounded rate fields and credit-term info buttons on step 2
affects: [05-26 device checklist]
key-files:
  modified:
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/step2/CreditTermsPanel.tsx
    - src/features/decide/ui/RateInput.tsx
    - src/i18n/locales/en.ts
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
    - src/features/decide/check/steps/__tests__/depthInputs.test.tsx
  created:
    - src/features/decide/check/steps/__tests__/step2Custom.test.tsx
decisions:
  - "RateInput gained a labelAccessory slot so the apr and promoRate info buttons sit as the label's next flex sibling"
  - "The promotion length is capped at min(120, loan term); a card promotion has no term to compare, so it caps at 120"
requirements: [DCU-26, DCU-02, DCU-17, DCU-25, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 67: Step 2 method panels Summary

Step 2 now takes typed values everywhere a duration or amount is chosen: loan and investment terms use Custom chips, the instalment count, card months and promotion length use an inline field, all 1 to 120; the deposit is one slider with a typed field; every rate field is bounded at 999.99% with the range line; the four credit terms carry their info buttons.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Loan, instalment, card, invest panels | 462b8fa1 | MAX_TERM 120, SliderWithField, CustomValueChips and CustomValueField, card tiles `kind: 'words'` |
| 2. Credit terms | 462b8fa1 | promo length bound, apr / promoRate / deferredInterest / variableRate info |

Both tasks landed in one commit: they edit the same files and share one test file.

## Deviations from Plan

**1. [Rule 3 - Blocking] RateInput `labelAccessory`.** RateInput draws its own label, so an info button beside it needed a slot. Added an optional `labelAccessory` node (a row with the label shrinking) in `src/features/decide/ui/RateInput.tsx`, outside the plan's file list.

**2. [Rule 3 - Blocking] Two new en strings.** `decide.pay.instalmentCountUnit` ("payments") for the count field and `decide.pay.cardMonthsEdit` ("Months, type a number") for the tappable card figure.

**3. Info buttons beside toggles.** `ToggleRow` is a single switch Pressable, so the deferredInterest and variableRate buttons are flex siblings of the row, not inside the label.

**4. Promotion cap.** Loan: min(120, term), range line "From 1 to {term}" when the term is shorter. Card: 120 (no term to compare).

**5. Tests.** The old 'Term' box and 'How many' / 'For' box assertions moved to the Custom field labels ("Term, custom, months" and so on); the R6 words test sits in Step2PriceAndPay.test.tsx beside the other card tile tests.

## Verification

- `npx jest src/features/decide/check/steps src/features/decide/ui src/features/decide/copy`: 481 tests pass.
- `npm run typecheck` clean; eslint clean on step2, RateInput and the touched tests.

## Needs a decision

**Decided check: info buttons are inert.** `Lock` sets `pointerEvents="none"` on the whole region, so on a decided (read-only) check every info button inside step 2's Lock, including these four, cannot be tapped. The plan asks for them to stay active. Step1Item has the same problem. A fix belongs in `Lock` (for example, scope-only locking with per-control disabling), which is shared and was left alone.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-67: Custom field keyboard on step 2, deposit slider and compact field at 320 / 1.3x, card months figure hit target, info buttons beside rate labels and toggles.

## Known Stubs

None.

## Self-Check: PASSED
