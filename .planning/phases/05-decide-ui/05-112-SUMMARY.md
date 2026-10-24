---
phase: 05-decide-ui
plan: 112
subsystem: ui
tags: [decide, dark-card, D-95, R17.3]
provides:
  - tone 'dark' on Chip, CustomValueChips, CustomValueField, RateInput, MoneyInput; dark on SegmentedToggle, CombineToggle; onInk on StateChip
  - DarkPill (solid / tint)
  - QuickCheckForm and QuickResult variant 'dark', placeholder / placeholderShort / onResultOpenChange props
key-files:
  modified: [src/ui/Chip.tsx, src/features/decide/ui/CustomValueChips.tsx, SegmentedToggle.tsx, RateInput.tsx, MoneyInput.tsx, StateChip.tsx, CombineToggle.tsx, src/features/decide/quick/QuickCheckForm.tsx, QuickResult.tsx]
  created: [src/features/decide/ui/DarkPill.tsx]
requirements: [DCU-34, DCU-01, DCU-12]
metrics:
  tasks: 2
  completed: 2026-10-24
---
# Phase 5 Plan 112: Dark quick check Summary

The quick check and the shared controls it uses now render on the ink card, with the light variant unchanged.

## Commits
- 87e527de Task 1: dark Chip, custom value chips, toggle, rate/money fields
- ef080071 Task 2: QuickCheckForm / QuickResult variant 'dark' (plus StateChip, CombineToggle, DarkPill)

## Verification
- jest quick, onboarding, decide/ui, decide/check, ui/Chip: all pass. Named D-95 tests present.
- `npm run typecheck` clean; eslint 0 errors.

## Deviations
1. [Rule 2] Chip selected style follows R17.13 (surface fill, ink text; unselected surface@.12 with inkSoft1 text), not the plan truth's "selected surface@.12 tint, surface text", which makes selected and unselected indistinguishable. Matches YourMonthCard's existing dark controls.
2. [Rule 3] Added files outside the list: DarkPill.tsx, StateChip (onInk) and CombineToggle (dark), needed for a legible result block on ink.
3. `onResultOpenChange` fires from an effect on result-open changes (also covers live edits that drop the result), not only from event handlers.
4. Dark loading and error states styled per M5. Dark result order is result, then Cash/Credit toggle (light order unchanged).
5. The "Out of range:" prefix word (R17.13) is not added: no catalogue key exists and this plan adds none. The line renders in surface text with the bounds only. A key could be added by a later copy pass.

## Device items
05-EXECUTION-NOTES entry 05-112.
