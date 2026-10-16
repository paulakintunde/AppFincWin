---
phase: 05-decide-ui
plan: 44
subsystem: decide-ui
tags: [decide, step2, running-costs, loss-of-value, estimate-bias]
requires: [05-12, 05-14, 05-37, 05-39]
provides:
  - useEstimateBias (read hook over bought decisions)
  - RunningCostPrompts with LossOfValueRow, promptedLineIds
  - EstimateGapNote
affects: []
key-files:
  created:
    - src/features/decide/check/useEstimateBias.ts
    - src/features/decide/check/steps/step2/RunningCostPrompts.tsx
    - src/features/decide/check/steps/step2/EstimateGapNote.tsx
    - src/features/decide/check/__tests__/useEstimateBias.test.tsx
    - src/features/decide/check/steps/__tests__/depthStep2.test.tsx
  modified:
    - src/features/decide/check/steps/Step2PriceAndPay.tsx
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
    - src/features/decide/ui/CheckRow.tsx
    - src/features/decide/ui/MoneyInput.tsx
    - src/features/decide/ui/RateInput.tsx
    - src/i18n/locales/en.ts
key-decisions:
  - "A prompt row owns the first line of its category; Step2's plain list skips those ids so a category is never listed twice"
  - "Switching the loss-of-value mode clears the entry so the blank field and the stored value always agree"
metrics:
  tasks: 2
  completed: 2026-10-16
requirements: [DCU-02, DCU-07, DCU-09, DCU-20]
---

# Phase 5 Plan 44: Running-cost prompts and estimate gap Summary

Step 2's "Costs that follow it" now pre-lists the engine's categories for the item type as unchecked rows with blank "Add amount" fields (counted only once typed), a user-typed loss-of-value row (amount a month or % a year, non-cash, kept out of the month), and neutral estimate-gap notes from past decisions.

## Tasks
1. useEstimateBias (commit 34607bf): composes bought checks, links and one linked-lines query keyed `['transactions', hh, 'decide-linked', 'bias', ...]` through toPastDecisions and estimateBias in a useMemo; never cached.
2. RunningCostPrompts, EstimateGapNote and Step2 wiring (commit ea1b999).

## Verification
- `npx jest src/features/decide src/i18n`: 55 suites, 9154 tests passed
- `npm run typecheck` clean; `npm run lint` 0 errors; `npm run depcruise` clean

## Deviations from Plan

**1. [Rule 3 - Blocking] MoneyInput/RateInput lacked placeholder and read-only props**
- Added optional `placeholder`/`readOnly` to MoneyInput and `readOnly` to RateInput; backward compatible.

**2. [Rule 3 - Blocking] CheckRow accessibility label produced a trailing comma for an empty amount**
- Label now joins only non-empty parts; identical output for existing rows.

**3. [Rule 3] New keys `decide.depth.running.amountA11y`, `lossAmountA11y`, `lossPercentA11y` in en.ts** for the field labels.

**4. Acceptance count note:** `grep -c useEstimateBias Step2PriceAndPay.tsx` is 2 (import and call), not 1; the intent (one hook use) holds.

**5. Hook bound:** linked-lines ids are capped at 200 per list (fetchLinkedLines' filter limit) so a large journal cannot throw.

Existing Step2PriceAndPay.test.tsx now mocks useEstimateBias (no QueryClient in those tests). No engine edits, no migrations.

## Human/device items
- Look at the vehicle prompt list plus loss-of-value segmented control at 402x874 and with large font scale; TalkBack on prompt rows (checkbox plus amount field per category).

## Known Stubs
None.

## Self-Check: PASSED
