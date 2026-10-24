---
phase: 05-decide-ui
plan: 87
subsystem: ui
tags: [decide, invest, expected-return, projection, D-82, R15.5]
requires: [05-61, 05-63, 05-74, 05-80, 05-83, 05-84, 05-85, 05-86]
provides:
  - Step 2 expected-return field and lump-sum horizon chips on both investment cards
  - VerdictCard `projection` prop and the verdict projection line
  - Assumptions "Expected return" row
affects: [05-26 device checklist]
key-files:
  created:
    - src/features/decide/check/steps/__tests__/step2Invest.test.tsx
    - src/features/decide/check/__tests__/expectedReturnSurfaces.test.tsx
  modified:
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/VerdictCard.tsx
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/check/sections/AssumptionsSection.tsx
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
decisions:
  - "The projection is display only: Step3Verdict computes expectedReturnProjection and passes it to VerdictCard, which reads it for one line and the key-figures group label and nothing else"
  - "A projection past the engine's safe range shows 'Too large to project at this rate' on step 2 and no verdict line (a line without a figure would drop the 'Not a forecast' sentence's meaning)"
  - "The horizon chips use years labels for 12/60/120/240 and months for a custom value, through CustomValueChips formatPreset"
requirements: [DCU-30, DCU-18, DCU-25, DCU-26]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 87: Optional expected return on investment checks Summary

Both investment cards take an optional expected return (0-100% a year, blank, never pre-filled). Once typed, the lump-sum card offers a horizon (1/5/10/20 years or Custom 1-600, default 60), the outputs tile says what the money could grow to, and the verdict card and Assumptions repeat it as "Not a forecast". It never reaches the verdict.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Step 2 field, horizon, projection note | 09796988 | tests "D-82 ..." in step2Invest.test.tsx; `projectionRates[0]` no longer read in MethodPanels |
| 2. Verdict line and Assumptions row | 2d7eb0b6 | tests in expectedReturnSurfaces.test.tsx |

## Verification

- `jest src/features/decide/check/steps` : 17 suites, 301 tests passed (includes step2Invest, updated Step2PriceAndPay).
- `jest src/features/decide/check/__tests__/expectedReturnSurfaces`: 8 passed, including the named test that `verdict`, `decision`, `alternatives`, `options`, `setbacks` and `waitPlan` are deeply equal with return 0, 5, 100 and with none, for a lump sum, a monthly contribution and a failing amount.
- Full `jest src/features/decide` earlier: only CheckFlow.test.tsx and commit.test.tsx failed (`useAbandonCheck` missing, the concurrent 05-75 work); not this plan.
- `npm run typecheck` clean at the end. eslint clean on every file touched.
- `grep -c "projectionRates\[0\]" MethodPanels.tsx` returns 0.

## Deviations from Plan

**1. [Rule 1 - Test] Replaced an obsolete test.** `Step2PriceAndPay.test.tsx` asserted the old "At 5% it would be worth about" note from `projectionRates`; it now asserts the new "About ... at 5% a year" sentence from `investReturnText`.

**2. Projection note shown for a lump sum with a return but no resolved plan.** The outputs tile appears when a valid return is typed even if the plan is null, so the figure is not hidden.

**3. Too-large case.** Superseded by the post-plan fix below: the verdict card now shows the too-large line when `fv` is null.

No new copy keys were added; all strings come from 05-80.

## Post-plan fix (3efae655)

- **Verdict card, out-of-range projection.** When `fv` is null, VerdictCard shows `decide.alt.reasonTooLarge` ("Too large to project at this rate"), the same line as step 2, read in the key-figures group and with no "Not a forecast" text. New test: "D-82 a projection beyond the supported range reads Too large to project at this rate" (100% over 600 months).
- **Test fix.** "D-82 the verdict card reads the same state words with and without a return" failed at HEAD when run after the other tests. Cause: it called `view.unmount()` and then a second `wrap(...)`, which rendered an empty tree. The component was not at fault. Three tests used that pattern (that one, "nothing shows without a return" and the purchase-check test); the other two could have passed vacuously. All three now use `view.rerender(...)`, which keeps the providers mounted.
- Verified: `jest src/features/decide src/data` 158 suites, 2107 tests green; typecheck and eslint clean.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-87: type a return on an investment check, confirm the horizon chips appear (lump sum), the tile sentence, the verdict line under the basis marker, and the Assumptions row; clear the field and confirm all three vanish.

## Known Stubs

None.

## Self-Check: PASSED
