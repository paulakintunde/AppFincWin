---
phase: 06-grow
plan: 27
subsystem: grow-ui
tags: [restyle, depth, stepper, money-rules]
requires: [06-23, 06-26]
provides: [grow-goals-side-depth, stepper-value-fix]
affects: [06-28]
key-files:
  modified:
    - src/features/grow/home/GoalRow.tsx
    - src/features/grow/home/GoalsSegment.tsx
    - src/features/grow/home/SafetyNetCard.tsx
    - src/features/grow/goals/GoalDetailScreen.tsx
    - src/features/grow/safetyNet/SafetyNetScreen.tsx
    - src/features/grow/lines/GrowLinesScreen.tsx
    - src/features/grow/ui/Stepper.tsx
    - src/features/grow/ui/GrowGlyph.tsx
    - src/features/grow/ui/StackedBar.tsx
    - src/features/grow/lines/__tests__/lines.test.tsx
  created:
    - src/features/grow/ui/__tests__/stepper.test.tsx
metrics:
  completed: 2026-11-07
---

# Phase 06 Plan 27: Grow restyle part A Summary

Goals, safety net and money-rules page cards now use `shadows.card` with no line1 border, names and figures read in bodyStrong, and the shared Stepper, debt glyph and allocation bar are fixed.

## Commits
- 43153ae8 style(06-27): Goals and safety net cards use the card shadow and bodyStrong (D-31)
- 3b2e595b fix(06-27): stepper value visible, debt glyph, round allocation bar, money-rules polish

## What changed
- Task 1: GoalsSegment, GoalDetailScreen, SafetyNetScreen and GrowLinesScreen page cards dropped `borderWidth`/`line1` and spread `shadows.card`. The safety-net tinted cards (SafetyNetCard, the explainer card on SafetyNetScreen) keep their state tint and border. GoalRow name and SafetyNetCard title/figure use `bodyStrong`.
- Task 2: Stepper group and buttons row get `alignSelf: 'stretch'` so the `flex: 1` value has width (D1). `debt` glyph is now a document with a down arrow (D13). StackedBar is clipped in a `radii.pill` view (I6). Money rules (R1/R2): no Met/Not yet badge when the rule is $0; whole amounts have no cents, non-whole keep them; "Default" is its own sub line (`grow.lines.defaultSub`); the safety-net row uses the blue swatch tile and shows `grow.lines.safetyNetStatusReach` using `planFromMonthly` on the net row's monthly amount.

## inkFaint audit
Every inkFaint use in the listed files is the `chev` glyph (GoalRow, SafetyNetCard, GoalDetailScreen, GrowLinesScreen), not text. Decision: left as is, since a chevron is a decorative non-text glyph and no inkFaint text sits on canvas in these screens. Not changed: FirstOpenNetSheet and NetSizeSheet bordered blocks (inside sheets, keep line1); home/ToolsRow (not in this plan's file list).

## Deviations from Plan
- GrowLinesScreen holds both the Task 1 card change and the Task 2 fixes, so its card-shadow change landed in the Task 2 commit (the file could not be split cleanly).
- Task 1 touched no test files: no test asserted the old border style.
- Lines test now mocks `@/data/queries/growGoals`, and the old `default` text assertion became `Default`.
- en.ts was not edited; all 06-26 keys existed.

## Verification
Jest for grow home, goals, safetyNet, lines, ui, calculators and src/theme passed; typecheck and depcruise clean; eslint 0 errors (pre-existing require() warnings only).

## Self-Check: PASSED
