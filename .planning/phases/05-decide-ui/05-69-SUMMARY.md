---
phase: 05-decide-ui
plan: 69
subsystem: ui
tags: [decide, step4, cheaper, investing, custom-value, D-70, D-71, D-74, D-76, D-83]
requires: [05-54, 05-55, 05-58, 05-59, 05-61, 05-82, 05-83]
provides:
  - Step 4 cheaper price as a typed exact amount beside a display-only percent slider
  - Kept info button on step 4, unclamped descriptors and reasons
  - InvestingInsteadBody (views 2-4 behind Show details) and a Custom 1-600 horizon
affects: [05-74]
key-files:
  modified:
    - src/features/decide/check/steps/Step4Alternatives.tsx
    - src/features/decide/check/steps/step4/InvestingInsteadSection.tsx
    - src/features/decide/check/steps/step4/RateChips.tsx
    - src/features/decide/check/steps/__tests__/Step4Alternatives.test.tsx
    - src/features/decide/check/steps/__tests__/investingInstead.test.tsx
decisions:
  - "The cheaper control is built inline from MoneyInput compact plus StepSlider, not SliderWithField, because the plan wants a 30-100 percent slider with a money field, while SliderWithField sliders in money units"
  - "One Kept header line (Meta with the kept info button, via InfoTitle) sits above the four rows, because FigureStrip cells are single accessible elements and would hide a per-cell button from screen readers"
  - "After Use the cheaper price the patch sets cheaperPrice to null so the cheaper row returns to the engine default (05-83 open point)"
requirements: [DCU-26, DCU-05, DCU-06, DCU-18, DCU-25, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 69: Step 4 exact cheaper price, Kept info, investing body Summary

The cheaper price on step 4 is a compact money field plus a 30-100% slider (stacked under rule S). A typed amount inside `cheaperBounds(advertised)` is stored exactly; dragging stores `ceilDivide(advertised x pct, 100)`. The percent is display only. "Use the cheaper price" writes the exact amount and resets `cheaperPrice` to null.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Exact cheaper field, Kept info, no clamps | 6052cf93 | replaces the 05-83 bridge; named D-83, D-71, D-70, D-76 tests |
| 2. InvestingInsteadBody, Custom horizon | b1421f41 | `InvestingInsteadSection` stays as the step 4 wrapper until 05-74 |

## Verification

- `jest Step4Alternatives`: 38 passed. `jest src/features/decide/check/steps`: 13 suites, 244 tests passed (after the horizon `selected` fix in the tests).
- eslint clean on the touched files (2 pre-existing `import/no-duplicates` warnings in investingInstead.test.tsx).
- `npm run typecheck`: no errors in this plan's files. Two errors outside it: `step2/MethodCard.tsx(52)` (another executor, new file) and `quick/__tests__/QuickCheckForm.test.tsx(114)`.
- `jest src/i18n/__tests__/decideCopy.test.ts src/features/decide/check`: 34 of 36 suites passed. The 2 failing suites (`depthSections`, `tableSections`, 3 tests, all AssumptionsSection) belong to files another executor is editing. No copy was added by this plan, so the DCU-09 guard is unchanged and passes.
- `grep numberOfLines` and `grep cheaperRatioPercent` on Step4Alternatives.tsx return 0.

## Deviations from Plan

**1. Inline control, not SliderWithField.** See decisions. Behaviour matches the plan (percent slider, compact field, hint "From {min} to {max}" in warn1).

**2. Kept info placement.** One header line above the rows, not on each row's caption (the row strips are single accessible elements). Because of that header, `getAllByText('Kept')` is now 5 and `'Kept, at 5%'` is 5 in the existing tests; both were updated.

**3. Horizon chip labels.** `HorizonChips` now renders through `CustomValueChips`, so presets read "36 months" (non-breaking space) with that as the accessibility label, replacing "Over 36 months". Existing tests were updated. The unused `decide.depth.invest.over` and `horizonChip` keys are left in place.

**4. 05-83 open point handled.** "Use the cheaper price" sets `cheaperPrice: null`; named test added.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-69: typed cheaper amount keyboard, stacked layout at 320 / 1.3x, Kept info button focus return, horizon Custom field.

## Known Stubs

None.

## Self-Check: PASSED
