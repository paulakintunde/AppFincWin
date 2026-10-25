---
phase: 05-decide-ui
plan: 41
subsystem: decide-ui
tags: [verdict, confidence, edge, basis-row, warnings]
requires: [05-15, 05-36, 05-37]
provides:
  - VerdictCard depth (line one, confidence chip, edge tag), ConfidenceSheet, BasisDetailRow, D-59 fact card, D-42 notice
affects: [05-30, 05-42]
key-files:
  created:
    - src/features/decide/check/ConfidenceSheet.tsx
    - src/features/decide/check/BasisDetailRow.tsx
    - src/features/decide/check/__tests__/verdictDepth.test.tsx
  modified:
    - src/features/decide/check/VerdictCard.tsx
    - src/features/decide/check/WarningList.tsx
    - src/features/decide/check/steps/Step3Verdict.tsx
    - src/features/decide/check/steps/__tests__/Step3Verdict.test.tsx
key-decisions:
  - Body is one Text (numberOfLines 2) holding line one then the sentence, split by a newline; the live-region label still goes through useSettledLabel and now includes the edge wording, basis strength and line one.
  - The confidence chip's 44 hit target sits in a row with -8 vertical margins so the layout stays inside the 27 budget.
  - Step3Verdict takes onEditCardMinimum and passes it to BasisDetailRow; WarningList takes stackedApplied for the stacked D-59 wording.
duration: single session
completed: 2026-10-16
---

# Phase 5 Plan 41: Verdict depth Summary

Step 3's top now states the combined position and worst month on body line one, a Strong/Fair/Rough basis chip with a "What this rests on" sheet, an "On the edge" tag with the margin in the chip name, one optional basis detail row, a neutral D-59 cash fact card and the D-42 deferred-interest notice.

## Tasks
1. VerdictCard depth and ConfidenceSheet. 2. BasisDetailRow, WarningList fact and notice, Step3Verdict wiring. Both landed in one commit (28aacc1) because VerdictCard's new props and Step3Verdict's wiring must typecheck together.

## Verification
- `npx jest src/features/decide` : 45 suites, 710 tests pass (check folder 216, verdictDepth 14).
- typecheck clean, `npm run lint` 0 errors, depcruise clean.

## Deviations from Plan
**1. [Rule 1 - Test update] Step3Verdict label tests.** Every verdict now carries a basis chip, and the default test fixture (zero investing floor) reads "on the edge", so the live-region label gains "Rough basis." (first read) and an edge phrase. The doubled-full-stop test now matches `/^It fits/` over `getAllByLabelText` (the chip group carries a matching label); expectations otherwise unchanged.
**2. Extra VerdictCard props** `formatDate` and `locale` (plus the planned `conversions`, `fullMonths`) to name the month and the tight fact date.
No engine edits.

## Human / device items
- On a device: confirm the 44pt confidence chip hit area works despite the -8 row margins on Android (touch outside parent bounds) and that TalkBack reaches the chip inside the grouped live-region card.

## Known Stubs
None.

## Self-Check: PASSED
