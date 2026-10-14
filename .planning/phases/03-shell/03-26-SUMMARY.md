---
phase: 03-shell
plan: 26
subsystem: engine
tags: [tdd, gap-closure, activity-filters, entry-draft]
requires: []
provides:
  - "inAmountRange shared by filterRows and filterProjections (H9)"
  - "barShares refund-safe paid share (L6)"
  - "DraftForm.repeats validated in parseForm (H1a); toCurrency cap 12 (L7); skipped coerced to paid (H4 engine)"
affects: [03-28]
key-files:
  modified:
    - src/engine/activity/filters.ts
    - src/engine/activity/monthFigures.ts
    - src/engine/activity/__tests__/activity.test.ts
    - src/engine/activity/__tests__/monthFigures.test.ts
    - src/engine/entryList/draft.ts
    - src/engine/entryList/__tests__/draft.test.ts
decisions:
  - "A bad or transfer repeat in a stored form degrades to never; the form is kept"
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 26: Engine gap fixes Summary

Range filters now exclude amounts with no home figure through one shared helper, refund-heavy months show 0% paid, and the v2 draft form carries a validated Repeats choice with a correct toCurrency cap and skipped-to-paid coercion.

## Commits
- `test(03-26)` failing tests for H9/L6; `79c8ea8` fix: inAmountRange, barShares clamp
- `test(03-26)` failing tests for draft form; `1b5e26b` fix: repeats, toCurrency cap, skipped coercion

## Deviations from Plan
- [Rule 1] Existing tests that encoded the old native-amount fallback (filterRows amountMin/Max cases, filterProjections amountMin 5000) were updated in the RED commit to the H9 behaviour.
- [Rule 1] The draft form round-trip property test had toCurrency up to 64 chars and status 'skipped'; narrowed to 12 chars and paid/pending (skipped and the cap are covered by explicit tests).

## Verification
- engine/activity and engine/entryList at 100% branch coverage; full `src/engine` suite: 77 suites, 1978 tests pass.
- eslint 0 errors (pre-existing warnings); depcruise clean.
- tsc: only the known environmental `expo-blur` error in src/shell/tabBar/TabBar.tsx.
- Full-engine coverage run reports `src/engine/statement/` at 99.88% statements (threshold 100%). Plan did not touch that directory; not investigated, flagged for the orchestrator.

## Known Stubs
None.

## Self-Check: PASSED
