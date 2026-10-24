---
phase: 05-decide-ui
plan: 28
subsystem: decide-ui
tags: [input, slider, accessibility, money]
requires: [05-01, 05-02]
provides: [StepSlider, RateInput, MoneyInput]
affects: [05-13, 05-14, 05-16, 05-17, 05-23, 05-27]
key-files:
  created:
    - src/features/decide/ui/StepSlider.tsx
    - src/features/decide/ui/RateInput.tsx
    - src/features/decide/ui/MoneyInput.tsx
    - src/features/decide/ui/__tests__/inputPrimitives.test.tsx
metrics:
  completed: 2026-10-16
---

# Phase 5 Plan 28: Decide input primitives Summary

Step slider (adjustable role, one-step increment/decrement, snapped to min + k x step), string-only rate field filtered to the engine percent() grammar, and a money field that reports integer minor units only through useAmountParser.

## Commits
- 5270c00 StepSlider
- fb44df2 RateInput, MoneyInput, tests

## Verification
Phase 4 gate passed (verification status passed). `npx jest src/features/decide/ui src/theme` (75 tests), `npm run typecheck`, eslint on src/features/decide/ui all clean. noRawColours passes. No new package.

## Deviations from Plan
- [Rule 3] Inputs import `TextInput` from `@/ui/TextInput` (lint rule DSG-07) rather than react-native.
- [Rule 3] The textRole type has no `s13_5`; `label` role used for hints, errors and the compact money field.
- StepSlider uses `Gesture.Pan().runOnJS(true)` with plain layout styles rather than Reanimated shared values; the thumb is controlled by the `value` prop, so no worklet is needed.
- MoneyInput resyncs external value changes during render (not in an effect) to satisfy react-hooks/set-state-in-effect.

## Human verification
Pan gesture feel on a device is not covered by RNTL (only accessibility actions are); check on the Pixel when 05-14 composes the slider.

## Migrations
None. Docker not needed; no DB tests.

## Self-Check: PASSED
