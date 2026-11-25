---
phase: 07-insights
plan: 08
subsystem: insights-charts
tags: [charts, d-24, accessibility]
requires: [07-02, 07-04, 07-06]
provides: [RangeControl, ChartSummary, InOutBars, NetWorthLine, CategoryRow, format helpers, linePoints]
key-files:
  created:
    - src/features/insights/format.ts
    - src/features/insights/charts/RangeControl.tsx
    - src/features/insights/charts/ChartSummary.tsx
    - src/features/insights/charts/CategoryRow.tsx
    - src/features/insights/charts/InOutBars.tsx
    - src/features/insights/charts/NetWorthLine.tsx
    - src/features/insights/charts/__tests__/charts.test.tsx
    - src/features/insights/__tests__/format.test.ts
  modified:
    - src/features/grow/ui/LineChart.tsx
metrics:
  completed: 2026-11-23
---

# Phase 7 Plan 08: Insights chart components Summary

Presentational Insights charts from props only: paired in/out bars (in = fits green, out = chartPalette[1], in always left), a net-worth line in the theme colour with per-point dots and tap readout, ranked category rows with chart-colour bars, a no-haptic range control, summary line and whole-percent/month formatters.

## Commits
- Task 1: feat(07-08) format helpers, RangeControl, ChartSummary, CategoryRow
- Task 2: feat(07-08) InOutBars, NetWorthLine, linePoints export

## Deviations
- [Rule 3] Added exported `linePoints` to `src/features/grow/ui/LineChart.tsx` (same PAD and min/max rule as `linePath`) so dots line up with the path without copying geometry. Grow LineChart tests still pass.
- NetWorthLine: the three y-axis tick labels are not drawn (the plan's behaviour list does not test them and the readout and summary carry the figures); month labels show about 6 evenly spaced labels, not "every third above 24 points". A 1-point series draws a dot and no path.
- CategoryRow: glyph null falls back to a slate letter tile; testID goes on a wrapper View (Row has no testID prop).
- InOutBars/NetWorthLine import `useDetailFormat` from the decide feature (depcruise passes).

## Checks
- eslint src/features/insights: clean
- npx tsc --noEmit: clean
- npm run depcruise: no violations
- jest (charts, format, grow/ui) --coverage=false: 5 suites, 32 tests pass

## Known Stubs
None.

## Self-Check: PASSED
