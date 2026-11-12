---
phase: 06-grow
plan: 21
subsystem: ui
tags: [calculators, charts, react-native-svg, accessibility]
requires:
  - phase: 06-grow plan 09
    provides: en.grow.calc copy, GrowGlyph
provides:
  - CalcResultCard, HowWorkedOutBox, LinkedPairFields, ChangeRows
  - StackedBar, LineChart, BarChart
affects: [06-13, 06-18, 06-19, 06-22]
key-files:
  created:
    - src/features/grow/ui/CalcResultCard.tsx
    - src/features/grow/ui/HowWorkedOutBox.tsx
    - src/features/grow/ui/LinkedPairFields.tsx
    - src/features/grow/ui/ChangeRows.tsx
    - src/features/grow/ui/StackedBar.tsx
    - src/features/grow/ui/LineChart.tsx
    - src/features/grow/ui/BarChart.tsx
    - src/features/grow/ui/__tests__/calcPrimitives.test.tsx
    - src/features/grow/ui/__tests__/charts.test.tsx
key-decisions:
  - "Components take already-formatted strings and numbers and do no money maths; charts do only pixel geometry."
  - "Whole-percent StackedBar widths use largest-remainder rounding so they always sum to 100."
requirements-completed: [GRW-03, GRW-06, GRW-08, GRW-09, GRW-10, GRW-11]
completed: 2026-11-06
---

# Phase 6 Plan 21: Grow calculator blocks and charts Summary

Seven shared, tested, token-only components: four calculator blocks (polite live-region result card with 600 ms settled announcement, always-visible worked-out box, linked-pair fields, before-to-after rows) and three react-native-svg charts with no animation.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Calculator blocks | aae93f88 |
| 2 | Grow charts | 291fd481 |

## Verification

- Jest: calcPrimitives, charts, primitives, and all src/theme tests (including noRawColours) pass, 73 tests.
- typecheck clean; depcruise no violations; eslint 0 errors on src/features/grow/ui.

## Deviations from Plan

**1. [Rule 1 - Bug] Lint error in StackedBar.** A running `x` offset was reassigned during render (react-hooks/immutability). Replaced with precomputed offsets. Fixed before commit.

**2. Copy key name.** The plan names `en.grow.calc.workedOutTitle`; the real key from 06-09 is `en.grow.calc.worked` ('How it was worked out'). Used the real key. No copy was added or edited.

## Notes for consumers

- `useSettledLabel` is imported from `@/features/decide/check/useSettledLabel` (a cross-feature import, accepted by depcruise).
- LinkedPairFields takes a `derivedAnnouncement` string (e.g. "Reaches October 2028"); the screen supplies it.
- Missing strings: none.

## Known Stubs

None.

## Self-Check: PASSED
