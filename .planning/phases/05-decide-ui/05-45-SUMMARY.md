---
phase: 05-decide-ui
plan: 45
subsystem: decide-ui
tags: [decide, step4, investing-instead, projections, holding-fee]
requires: [05-10, 05-17, 05-28, 05-35, 05-37]
provides:
  - RateChips, HorizonChips, HoldingFeeInput
  - InvestingInsteadSection (step 4)
affects: []
key-files:
  created:
    - src/features/decide/check/steps/step4/RateChips.tsx
    - src/features/decide/check/steps/step4/InvestingInsteadSection.tsx
    - src/features/decide/check/steps/__tests__/investingInstead.test.tsx
  modified:
    - src/features/decide/check/steps/Step4Alternatives.tsx
    - src/i18n/locales/en.ts
key-decisions:
  - "The section writes the check's one rate list (inputs.projectionRates); no rate or fee literal exists in the code"
  - "The holding fee field keeps local text so a trailing point can be typed; only a complete valid text up to 100 reaches update, and an over-100 text is refused with no change"
metrics:
  tasks: 2
  completed: 2026-10-16
requirements: [DCU-05, DCU-09, DCU-11, DCU-18]
---

# Phase 5 Plan 45: Investing instead Summary

Step 4 gains a collapsed "If it went into investing instead" section (after the trade, below the fold) with rate chips (fixed 0% plus up to three typed rates), an optional holding fee, horizon chips defaulting to the plan term (60 for cash), and four captioned projection tiles including the net-worth chart with a rate toggle.

## Tasks
1. RateChips, HorizonChips, HoldingFeeInput and tests (commit fa5f135).
2. InvestingInsteadSection and Step4 wiring (commit fa5f135, same commit as the pieces interlock).

## Verification
- `npx jest src/features/decide/check/steps`: 8 suites, 167 tests passed; `src/i18n` and `src/features/decide/copy` green
- `npm run typecheck` clean; `npm run lint` 0 errors; depcruise clean
- Phase 4 gate passed (22 summaries, status passed, engineBarrel test green)

## Deviations from Plan

**1. [Rule 3] Three new keys** `decide.depth.invest.horizonChip`, `horizonA11y`, `netWorthRateA11y` in en.ts (chip text, radiogroup name, toggle name).

**2. Tasks 1 and 2 landed in one commit** because the section imports the chips and the tests share a file.

**3. Caption test count:** with a single typed rate the pause tile shows its "pauses no investing" note and no rows, so the caption appears on at least two tiles in that test, not three.

No engine edits, no migrations.

## Human/device items
- Look at the expanded section at 402x874 and large font; TalkBack on the horizon radio chips and the rate toggle; decimal-keyboard typing in the fee field.

## Known Stubs
None.

## Self-Check: PASSED
