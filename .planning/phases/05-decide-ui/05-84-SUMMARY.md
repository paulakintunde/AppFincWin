---
phase: 05-decide-ui
plan: 84
subsystem: ui
tags: [decide, step2, accordion, method-card, price-card, info, D-79, D-84]
requires: [05-55, 05-58, 05-59, 05-61, 05-67, 05-68, 05-80, 05-83]
provides:
  - methodCardCopy (needsFields, needsText, methodSummary)
  - MethodCard (radio header, Needs line, chips, summary, scroll-on-open)
  - Step 2 accordion (one card open, opening selects) and per-method bodies with a "What it comes to" tile
  - Price card rebuild with price, taxFees, tradeIn and finalPrice info
affects: [05-85, 05-86, 05-87, 05-77]
key-files:
  created:
    - src/features/decide/copy/methodCardCopy.ts
    - src/features/decide/copy/__tests__/methodCardCopy.test.ts
    - src/features/decide/check/steps/step2/MethodCard.tsx
    - src/features/decide/check/steps/__tests__/step2Accordion.test.tsx
  modified:
    - src/features/decide/check/steps/step2/PaymentMethods.tsx
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/Step2PriceAndPay.tsx
    - src/features/decide/check/LineEditorSheet.tsx
    - src/features/decide/ui/SliderWithField.tsx
    - src/i18n/locales/en.ts
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
    - src/features/decide/check/steps/__tests__/lockedReadOnly.test.tsx
decisions:
  - "The header, Needs line (with a nested Edit link), chips and folded summary are one radio Pressable; the ⓘ is nested in it as in FoldRow, with 'about' and 'edit' as accessibility actions"
  - "The open card follows the selection (state derived during render, no effect); tapping the open header folds it and keeps the selection"
  - "Read-only: only accessibilityState.disabled is set on the radio, never the Pressable disabled prop, so the card still opens and closes"
  - "Needs fields come from the engine's own PlanReason list; price and amount come from the inputs"
requirements: [DCU-29, DCU-25, DCU-02, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 84: Step 2 accordion Summary

Step 2 is now an accordion of method cards under a rebuilt Price card. Opening a card selects that method and folds the one that was open; each card holds its own inputs and a "What it comes to" outputs tile; a method that cannot be scored says "Needs: ..." from the engine's own reasons.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. methodCardCopy and MethodCard | 522795dc | 3 copy tests, 6 MethodCard tests |
| 2. Accordion wiring, outputs tiles, Price card | 4bb89a4a | PaymentMethods, MethodPanels, Step2PriceAndPay, LineEditorSheet; 23 accordion tests |

## What changed

- `needsFields(method, reasons, inputs)` returns the R15.2 field words in order and an `edit` flag for price and amount; `needsText` builds "Needs: rate, months". `methodSummary` returns a CopyRef, or a list joined by `joinPreview`, so a missing part is left out ("$2,000 down · 36 months").
- `MethodCard`: surface card, 1.5px `line1` border (`ink` when selected, no ink fill), 64-minimum header with the 19px ring and 9px dot, the name with its ⓘ, a wrapping chips row, the `meta` 600 `warn1` Needs line with "· Edit" for price and amount, the folded summary, and the 8px chevron. The open body fades in (instant under reduced motion) and calls `useScrollIntoView()` with the header after it lays out.
- `PaymentMethods` renders the "How you pay" header (ⓘ `howYouPay` and the sub-copy) and a radiogroup of cards. A press fires `hapticSelection`, updates `inputs.method` and announces "{method} selected. Details shown."; on a read-only check it opens without changing the method. The "Rate needed" flag is gone.
- `MethodPanels` exports `MethodBody` (cash, loan, instalment, card, lump, monthly). Each body is inputs first, then the outputs tile (strip, interest saved and cash left, term note, paid-off line, card tiles and notes, the cash "Leaves {cash}" note). New ⓘ: `deposit`, `loanTerm`, `secured`, `cardClearing`; `apr` and the promo and variable-rate ⓘ stay where 05-67 put them. `MethodPanels` still exists as a thin wrapper for the selected method (used by `depthInputs.test.tsx`).
- Price card: "Price" or "Amount" with ⓘ and an Edit link that wraps, the advertised figure on one line, "Tax, fees and trade-ins" with ⓘ, a "Trade-in or discount" tag with ⓘ `tradeIn` under each take-off row, Final price with ⓘ and "{n} of {m} lines counted". The estimate-gap notes for payment and day-one cost now follow the Costs card.
- `LineEditorSheet`: ⓘ `tradeIn` beside the Adds / Takes off toggle; its sheet mounts inside the editor sheet so it stacks.

## Deviations from Plan

**1. [Rule 2 - a11y] Edit link inside the radio.** The nested Edit link is a separate Pressable, and the radio also exposes an `edit` accessibility action, so screen-reader users reach it without a second focus stop. The ⓘ uses the same 'about' action as FoldRow.

**2. [Rule 3 - Blocking] New en strings.** `decide.pay.card.a11yNeeds` ("needs {{fields}}") for the radio label, and `summaryDown`, `summaryMonths` (plural), `summaryApr`, `summaryTimes` for the folded-summary pieces. The 05-80 plural keys only cover a complete line, and R15.2 leaves missing parts out.

**3. [Rule 3 - Blocking] SliderWithField `labelAccessory`.** The deposit ⓘ needs a slot beside the slider label. Same pattern as 05-67's RateInput change; the file is outside this plan's list.

**4. [Rule 3 - Blocking] `testID` on MethodCard** (`method-{key}`). The body is a sibling of the radio header, so tests need a handle on the whole card.

**5. Test edits outside the list.** `lockedReadOnly.test.tsx` pressed a card by the exact label "On a card"; it now finds the radio by name. `depthStep2.test.tsx` needed no change.

**6. Dropped copy.** The old ChoiceCard notes `noteLoan`, `noteLoanNoRate`, `noteInstalment`, `noteCard*` and the ChoiceCard flag `flagRateNeeded` are no longer rendered. The Needs line and the panels' own notes replace them. The keys stay in `en.ts` for 05-77 to retire.

**7. Not done: stress and late-fee lines behind DetailsToggle.** The plan asks for them behind "Show details". They live in `CreditTermsPanel.tsx` (VariableRateCard, LateFeeField), which is not in this plan's file list and which 05-85 reworks for the instalment card. They stay as they were. The promotion tiles also stay inside the "+ Promotional rate" section rather than in the outputs tile.

## Verification

- `npx jest src/features/decide` (93 suites, 1385 tests) and `npx jest src/features/decide/check src/features/decide/copy src/features/decide/ui src/i18n` (63 suites, 14075 tests, includes the DCU-09 guard) pass.
- `npm run typecheck` clean. `npm run depcruise`: no violations. eslint on `check/steps`, `LineEditorSheet`, `copy` and `SliderWithField`: 0 errors; two `import/no-duplicates` warnings in `investingInstead.test.tsx`, not this plan's file.
- Acceptance greps: `MethodCard` appears 3 times in PaymentMethods.tsx; `rateNeeded|Rate needed` appears 0 times.
- Full `npm run lint` not run (three other executors are editing the worktree).

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-84 (not added by me; the file is shared). Check on the Pixel and iPhone XR: tapping a folded card opens it, selects it and scrolls its header under the sticky header; the open card's inputs are never left at the bottom; the chips and the Needs line wrap at 320 wide and 2.0x; TalkBack reads "{method}, Selected, {summary}, needs {fields}" with the hint, and offers "About {term}" and "Edit"; a decided check opens a card but the radio reads disabled; the trade-in ⓘ opens over the line editor sheet.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED
