---
phase: 06-grow
plan: 28
subsystem: grow-ui
tags: [restyle, shadows, calculators, debts, investing]
requires: [06-23, 06-24, 06-26]
provides: [AccTile shared 36 px tile, D-31 depth on Debts, Investing and calculators]
affects: [06-31, 06-33]
key-files:
  created: [src/features/grow/ui/AccTile.tsx]
  modified:
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/debts/PayoffPlanCard.tsx
    - src/features/grow/debts/DebtDetailScreen.tsx
    - src/features/grow/investing/InvestingSegment.tsx
    - src/features/grow/investing/HoldingDetailScreen.tsx
    - src/features/grow/calculators/record/DebtExtraCalculator.tsx
    - src/features/grow/calculators/record/GoalCalculator.tsx
    - src/features/grow/calculators/record/useRecordLinks.ts
    - src/features/grow/calculators/typed/CalcFields.tsx
    - src/features/grow/calculators/typed/CalculatorsScreen.tsx
    - src/features/grow/calculators/typed/DebtPayoffCalculator.tsx
    - src/features/grow/ui/CalcResultCard.tsx
metrics:
  completed: 2026-11-07
---

# Phase 6 Plan 28: Grow restyle part B Summary

Debts, Investing and calculator page cards now use `surface` + `radii.card` + `shadows.card` with no line1 border, and one shared `AccTile` (36 px tinted lead tile) serves the Debts rows and the Calculators page.

## Commits
- b4d4a62c Task 1: Debts and Investing
- Task 2 commit: calculators (see git log, `style(06-28): calculators ...`)

## What changed
- `ui/AccTile.tsx` extracted from DebtsSegment (pixel-identical); DebtsSegment uses it; `ACCENT_TINT_OPACITY` import dropped there.
- Page cards to `shadows.card`: DebtsSegment (3 card sites), PayoffPlanCard card, DebtDetailScreen card, InvestingSegment (6 sites), HoldingDetailScreen (2), CalcFields card, CalculatorsScreen cards, DebtPayoffCalculator `debt` block, DebtExtraCalculator and GoalCalculator missing/loading cards, CalcResultCard.
- bodyStrong: debt row name and balance (DebtsSegment), holding row name and value (InvestingSegment).
- C2: Calculators page rows and "With your records" rows lead with `AccTile`.
- C1: record-link subtitles for goal and growth use the whole-unit debt formatter (`useDebtFormat().money`) with the home currency; the debt link already used it. Calculator results keep cents. (`useRecordLinks.ts` was not in the plan's file list but is where the subtitles are built.)

## Borders kept (inner blocks)
- PayoffPlanCard: order columns (2 px, selection) and scenario rows (1 px, selection); T-06-28-01 unchanged, no default highlight added.
- DebtExtraCalculator `order` and DebtPayoffCalculator `order` comparison columns: equal-weight side-by-side blocks inside the page, kept bordered like PayoffPlanCard's columns.
- CalcFields `valueRow` hairline dividers, Investing/Holding row hairline dividers, AddDebtSheet radios (inside a sheet). AddDebtSheet has no page cards.

## inkFaint audit
No inkFaint text on canvas in these files. Remaining inkFaint uses: DebtsSegment chevron glyph (on a surface card), and input placeholders in AddDebtSheet, AddHoldingSheet, LotSheet, CalcFields (inputs on fill/surface). Nothing changed.

## Deviations
- [Rule 3] `useRecordLinks.ts` edited for C1 (outside listed files, required by the task).
- No test file edits were needed: existing tests did not assert the border style or the cents subtitles.

## Verification
- `npx jest src/features/grow/debts src/features/grow/investing`: 6 suites, 78 tests pass.
- `npx jest src/features/grow/calculators`: 4 suites, 54 tests pass.
- typecheck and lint: see hand-back report.

## Self-Check: PASSED
