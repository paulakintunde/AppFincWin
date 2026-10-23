---
phase: 05-decide-ui
plan: 61
subsystem: ui
tags: [decide, custom-value, slider, D-71, D-83]
requires: [05-54, 05-55, 05-82]
provides:
  - customValues.ts, the pure D-71/D-83 bounds and Wait maths (100% covered)
  - CustomValueChips and CustomValueField
  - SliderWithField, MoneyInput compact variant, RateInput max and rangeText
affects: [05-67, 05-69, 05-70, 05-76, 05-85, 05-87]
key-files:
  created:
    - src/features/decide/snapshot/customValues.ts
    - src/features/decide/snapshot/__tests__/customValues.test.ts
    - src/features/decide/ui/CustomValueChips.tsx
    - src/features/decide/ui/SliderWithField.tsx
    - src/features/decide/ui/__tests__/customValue.test.tsx
  modified:
    - src/features/decide/ui/MoneyInput.tsx
    - src/features/decide/ui/RateInput.tsx
decisions:
  - "RateInput max is the engine's '.' text form (string, e.g. '999.99') and reuses typedRateAbove from snapshot/checkInputs, not a number"
  - "The meta line is textRole 'label' at fontSize.meta (no 'meta' TextRole exists), matching the other decide primitives"
requirements: [DCU-26, DCU-12]
metrics:
  tasks: 3
  completed: 2026-10-23
---

# Phase 5 Plan 61: Custom value primitives Summary

Pure bounds and Wait maths in `customValues.ts` (bigint ceilDivide / divideHalfUp through the engine barrel, no `Number()` on money), the Custom chip and inline field, the slider with a typed field, and RateInput's `max` / `rangeText`.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. customValues.ts | 4c21010e | 100% statements, branches, functions, lines |
| 2. CustomValueChips / CustomValueField | 764ff041 | draft follows the value prop by derived state; no effect-set state, no ref reads |
| 3. SliderWithField, compact MoneyInput, RateInput bounds | 9e2a66da | also fixes the `meta` role in Task 2's file |

## Verification

- customValues.ts per-file coverage run: 100% across the board (threshold passed).
- `jest src/features/decide/ui src/features/decide/snapshot`: 19 suites, 307 tests passed (existing inputPrimitives green).
- `npm run typecheck` clean, `npm run depcruise` clean, eslint clean on `src/features/decide/ui` and the snapshot files.
- `grep Number(target|amount|...)` gate on customValues.ts returns 0.
- Full `npm run test:coverage` was not run (other executors share the worktree); the snapshot folder's only new file is at 100%.

## Deviations from Plan

**1. [Rule 3 - Blocking] RateInput `max` is a string, not a number.** The plan says `max?: number` in the scaled-percent unit, but `typedRateAbove(text, max: string)` already lives in `snapshot/checkInputs.ts` (not local to MethodPanels), so RateInput imports it and takes the same string form (`'999.99'`). No call site changes needed.

**2. [Rule 3 - Blocking] `meta` is not a TextRole.** The `meta` line is rendered as `textRole('label')` with `fontSize.meta`, the pattern used by CheckRow/FoldRow.

**3. [Rule 3 - Blocking] Rule N on the compact field.** `adjustsFontSizeToFit` is not on `TextInputProps` in this RN typing, so the compact figure is `body` at the capped TextInput scale with no shrink-to-fit.

**4. Stored value above max.** With the field closed, the Custom chip shows "{n} months" selected and the range line shows in warn1 under the row; opening the field shows the stored figure unchanged.

**5. `wholeUnits`.** The slider step is rounded up to a multiple of the currency's minor unit (`resolveExponent`); typed values are never snapped.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-61: Custom field keyboard (numeric), focus on open, compact field width at 320 / 1.3x text scale, thumb pin and "Above the slider's range" line.

## Known Stubs

None. The components are not yet placed; 05-67, 05-69, 05-70, 05-76, 05-85 and 05-87 wire them.

## Self-Check: PASSED
