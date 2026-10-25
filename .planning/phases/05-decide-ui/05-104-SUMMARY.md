---
phase: 05-decide-ui
plan: 104
subsystem: decide-ui
tags: [decide, ui, card-limit, item-types, D-91, D-92]
requires: [05-88, 05-93, 05-94, 05-95, 05-101]
provides:
  - CardPanel check-limit box with ⓘ cardCheckLimit, and the fee and block notes
  - basisDetailItems card-limit rate item (step 3 basis row and Assumptions)
  - On a card ⓘ with the converted cap
  - ITEM_CHIP_ORDER (R16.8) for the Step 1 chips and Treat like
key-files:
  modified:
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/step2/PaymentMethods.tsx
    - src/features/decide/check/steps/step2/MethodCard.tsx
    - src/features/decide/copy/depthVerdictCopy.ts
    - src/features/decide/check/CheckFlowScreen.tsx
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/check/steps/Step1Item.tsx
    - src/features/decide/copy/__tests__/depthVerdictCopy.test.ts
    - src/features/decide/check/steps/__tests__/step1Custom.test.tsx
  created:
    - src/features/decide/check/steps/__tests__/step2Card.test.tsx
requirements: [DCU-32, DCU-02, DCU-25, DCU-23]
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 5 Plan 104: Card limit, card notes and new item types (UI) Summary

The card card now explains the check limit, the fee and block notes, and the card-limit rate basis; Step 1 offers Property, Tuition and Cash-like.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Card limit box, notes, basis item | 2ea516c1 | MethodPanels, PaymentMethods, MethodCard, depthVerdictCopy, callers, tests |
| 2. Step 1 chips and Treat like | 0c367572 | ITEM_CHIP_ORDER, step1Custom tests |

## What was built

- **Check-limit box:** when the plan's `card.capBy` is `check_limit`, the eligibility box takes the capped state with "Only {cap} of this goes on a card in checks. The other {rest} is counted as cash on the day." and the line "This is a limit of these checks, not of your card issuer." carrying the ⓘ cardCheckLimit (converted cap and USD-limit figures; USD-home variant). `{cap}` is the engine's card portion, which equals `snapshot.cardMaxPurchase` when the limit binds; `{rest}` is `remainderOnDay`. The ⓘ cap comes straight from `source.cardMaxPurchase`. When `capBy` is `dealer` the dealer-cap copy shows unchanged. The "Part on the card" chip already followed `remainderOnDay`.
- **No USD rate:** `cardMaxPurchase === null` makes the card method missing; the existing header line reads "Needs: USD rate" (from 05-94). Tested through the accordion.
- **Notes:** `cardEligibility(itemType, source.region)` now reads the real region (05-93 had passed null). Its note renders under the box as `meta` muted: tuition fee, tax processing fee (any region but GB), HMRC line (GB, blocked). No note writes Card fees (tested: no `update` call, fees stay null).
- **Basis item:** `basisDetailItems` takes `basisNotes` and adds `decide.pay.cardLimitBasis` with the formatted date; CheckFlowScreen and Step3Verdict pass `source.basisNotes`, so step 3's basis row and Assumptions both show it. No confidence input changes.
- **On a card ⓘ:** `MethodCard` gains an optional `infoDynamic`; PaymentMethods passes the formatted `cardMaxPurchase`. With a null or absent limit the no-cap body shows. Tests assert no `{{` in the sheet.
- **Loan no-deposit comparison** now builds its context with `engineCtxOf(source)` instead of the hand-built loan-only one.
- **Step 1:** chips follow General, Vehicle, Property, Rent or bill, Loan repayment, Tax, Insurance premium, Tuition, Cash-like, Custom…; Treat like lists General then the same order. The itemType ⓘ copy was already updated in 05-88.

## Verification

- Named tests pass: D-91 large purchase / dealer cap lower / older USD rate basis item, D-92 tax note by region / step 1 new types / Treat like, R16 On a card explanation.
- `npm run typecheck` clean. eslint: 0 errors on touched files (one pre-existing unused-import warning in CheckFlowScreen.tsx).
- `npx jest src/features/decide src/i18n`: 120 suites, 15500 tests pass.

## Deviations from Plan

- **[Rule 3] MethodCard.tsx** (not in the plan's file list) gained `infoDynamic` so the On a card ⓘ can carry the cap; CheckFlowScreen.tsx and Step3Verdict.tsx changed to pass `basisNotes`.
- The non-USD cardCheckLimit body is covered by the existing infoTerms unit test; the UI tests run on the USD-home fixture and so check the USD-home variant.

## Known Stubs

None.

Device item: 05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-104 (check-limit box on a large card purchase, tax note in GB and elsewhere, new chips).

## Self-Check: PASSED
