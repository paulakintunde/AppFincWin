---
phase: 05-decide-ui
plan: 85
subsystem: ui
tags: [decide, instalment, apr, first-payment, written-lines, D-80]
requires: [05-61, 05-80, 05-81, 05-83, 05-84]
provides:
  - instalmentNotes (pure CopyRef notes for the instalment card)
  - InstalmentPanel with Has a rate?, Annual rate, Payment as quoted, First payment
  - writtenLines instalment case that follows every payment run
affects: [05-87]
key-files:
  created:
    - src/features/decide/copy/instalmentCopy.ts
    - src/features/decide/copy/__tests__/instalmentCopy.test.ts
    - src/features/decide/check/steps/__tests__/step2Instalment.test.tsx
  modified:
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/step2/CreditTermsPanel.tsx
    - src/features/decide/ui/MoneyInput.tsx
    - src/features/decide/check/writtenLines.ts
    - src/features/decide/check/__tests__/writtenLines.test.ts
    - src/data/mutations/__tests__/decideGoAhead.test.tsx
    - src/features/decide/check/steps/__tests__/depthInputs.test.tsx
decisions:
  - "Payment (No) and Payment as quoted (Yes) are bound to the same stored amount, so a typed figure survives the switch; aprText stays in the inputs on Yes to No and the engine input ignores it"
  - "A single-month run, first or later, is written as 'A last payment of {payment} in month {n}' rather than '1 times'"
  - "buildGoAheadWrite needed no change: it is generic over paymentSteps; a test pins the next_month and worked-out schedules"
requirements: [DCU-29, DCU-17, DCU-07, DCU-25]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 85: Instalment card with a rate Summary

The instalment card asks "Has a rate?" (No by default). No keeps Payment and How many; Yes shows How many, the Annual rate (refuses above 999.99, with the range line) and an optional Payment as quoted. Both show First payment (Today or In a month) and the late fee. The note reads the scored payment back, and adds "The rate works out to ... the quote is ..." when a quote differs from the worked-out payment. What gets written and Go ahead follow the engine's payment runs.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 2. What gets written follows the schedule | 1bcae883 | 2 writtenLines tests, 1 Go ahead test |
| 1. instalmentNotes and the card inputs | 3e23d60e | 5 copy tests, 7 panel tests |

## What changed

- `instalmentNotes(inputs, plan, reasons, { whole, exact }, resolvedPrice)` returns CopyRefs. No: the implied-rate, fees, below-price and missing notes as before. Yes: `instalmentRateNote` (or the `Month` variant) with the scored payment (`plan.monthly`), the typed rate and the interest, then `instalmentCalcNote` when `plan.computedPayment` differs from the typed amount.
- `InstalmentPanel`: Seg "Has a rate?" with ⓘ `hasRate`; Annual rate through `RateInput` (`max` 999.99, range line, ⓘ `apr`, never pre-filled); Seg "First payment" with ⓘ `firstPayment`; late fee with ⓘ `lateFee`; the outputs tile maps the notes.
- `CreditTermsPanel`: the late-fee lines and the variable-rate stress lines sit behind a `DetailsToggle` ("Show details"). The promotion tiles stay inside "+ Promotional rate". This is the 05-84 carry-over.
- `writtenLines` instalment case: the day-one line only when `plan.dayOne > 0`, then one line per run (level run, "Then ..." for a later run of 2+, "A last payment ..." for a single month).

## Deviations from Plan

**1. [Rule 3 - Blocking] MoneyInput `labelAccessory`.** The late-fee ⓘ needs a slot beside the MoneyInput label. Same pattern as RateInput (05-67) and SliderWithField (05-84). `MoneyInput.tsx` is outside the plan's file list.

**2. [Rule 1 - follow-on] depthInputs.test.tsx.** Two existing tests (stress lines, late-fee lines) pressed nothing before reading the lines; they now press "Show details" first. This is the named carry-over from 05-84, so the edit is intended.

**3. Carry-over test.** The Show details behaviour is named in `step2Instalment.test.tsx` ("D-80 the late-fee lines sit behind Show details, and the info buttons are present"). The stress lines are covered by the amended depthInputs test.

**4. Write-ups of one-month runs.** A first run of length 1 now reads as a last payment, not "1 times" (it was reachable with a two-payment plan).

## Verification

- `npx jest src/features/decide/check src/features/decide/copy src/features/decide/ui src/i18n`: 68 suites, 14101 tests passed (includes the DCU-09 guard).
- `npx jest writtenLines decideGoAhead`: 63 passed.
- `npm run typecheck` clean.
- eslint on the touched files: 0 errors. `decideGoAhead.test.tsx` carries 16 pre-existing warnings (fast-check named exports, an unused import).
- No `Number()` on money; no new copy keys (05-80 supplied them all).

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-85 (not added by me; the file is shared). Check on both devices: Has a rate? No/Yes switch keeps the typed payment; the rate field refuses 1000 and shows its range line; In a month moves the first instalment out and the written list shows only the fees on the day; the Show details toggles open and close the late-fee and stress lines; the three new ⓘ open over the card.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED
