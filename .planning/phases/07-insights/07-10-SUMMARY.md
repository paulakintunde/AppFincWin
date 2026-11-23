---
phase: 07-insights
plan: 10
subsystem: insights
tags: [net-worth, health-score, charts]
requires: [07-01, 07-03, 07-04, 07-06, 07-07, 07-08]
provides: [NetWorthSection, NetWorthSectionView, ScoreCard]
affects: [07-11 screen assembly]
key-files:
  created:
    - src/features/insights/sections/NetWorthSection.tsx
    - src/features/insights/sections/ScoreCard.tsx
    - src/features/insights/sections/cardBits.tsx
    - src/features/insights/sections/__tests__/netWorthSection.test.tsx
    - src/features/insights/sections/__tests__/scoreCard.test.tsx
  modified:
    - src/features/insights/charts/NetWorthLine.tsx
    - src/features/insights/charts/__tests__/charts.test.tsx
requirements: [INS-01, INS-06]
completed: 2026-11-23
---

# Phase 07 Plan 10: Net worth and Score sections Summary

The two Full picture cards: Net worth over time (figure, change in words with a glyph, theme-colour line, fixed notes, empty/one-point/loading/error states) and the Score card (number, fixed sentence, four parts, Short badge, thin-data gap, Household replacement).

## Commits
- 5d66cd20 feat: NetWorthLine value labels and thinned month labels (D-29, extra scope)
- 4ac1ebb9 feat: NetWorthSection (container + view) and shared cardBits
- 136b051a feat: ScoreCard

## Deviations from Plan

**1. [Owner decision D-29, extra task] NetWorthLine value and month labels.** Added three value labels (low, middle, high) in the meta style on the line's own scale (min includes 0, as `linePoints`), formatted as money in the chart currency. Month labels now count back from today, every third once there are more than 24 points, and never closer than one label width (so a dense chart shows fewer than every third). Two tests added to charts.test.tsx. The middle tick is a rounded midpoint for display only.

**2. [Rule 3] Shared helper file.** `sections/cardBits.tsx` (Card, TextButton 44 px, LoadingBlock, ErrorCard) added so both cards share the error card and text button without copying.

Notes:
- The grep acceptance `Strong|Steady|Tight|healthy` returns 3 on ScoreCard.tsx only because of the `bodyStrong` text-role identifier; no grade word is in any rendered text (regex test passes).
- The Short badge uses tone `short` with the `sDown` shape (StateBadge has no stateShort shape).
- Net worth sections render the chart summary only as the chart's accessibility label (not as extra visible text).
- Net-worth and score tests use one render per test: several renders in one test left an open act() and broke later tests in this suite.

## Checks
- `npx jest src/features/insights/sections` : 22 passed; charts NetWorthLine tests 4 passed.
- eslint clean, `npx tsc --noEmit` clean, `npm run depcruise` clean (after routing the Prepared type through the decide v3 barrel), `npx jest src/features/insights src/features/grow/ui`: 8 suites, 58 tests passed.

## Self-Check: PASSED
Files and commits above exist.
