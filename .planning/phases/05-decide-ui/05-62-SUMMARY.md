---
phase: 05-decide-ui
plan: 62
subsystem: ui
tags: [decide, delete, swipe, dropdown, confirm-sheet, D-73]
requires: [05-54]
provides:
  - Dropdown variant 'glyph' (44x44 glyph-only trigger) and option tone 'danger'
  - ConfirmSheet optional body plus children (component body); title is a header
  - DeletableRow (swipe or ⋯ menu, then confirm, then caller's onDelete)
affects: [05-72, 05-73, 05-75]
key-files:
  created:
    - src/features/decide/ui/DeletableRow.tsx
    - src/features/decide/ui/__tests__/DeletableRow.test.tsx
  modified:
    - src/ui/Dropdown.tsx
    - src/ui/ConfirmSheet.tsx
    - src/ui/__tests__/Dropdown.test.tsx
    - src/ui/__tests__/ConfirmSheet.test.tsx
decisions:
  - "SwipeAction requires a11yLabel, which the plan's interface omitted; DeletableRow passes the Delete word as both"
  - "ConfirmSheet body is now optional so a children-only sheet is possible; string-body callers render the same"
requirements: [DCU-28, DCU-04, DCU-07, DCU-15]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 62: Delete pattern (Dropdown glyph, ConfirmSheet body, DeletableRow) Summary

A saved Decide row is deleted by a full swipe or the ⋯ menu, then a confirm sheet. The swipe only opens the confirm. Only the sheet's Delete calls the caller's `onDelete`, once. Keep it, the backdrop, drag and back all keep the row.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Dropdown glyph + danger; ConfirmSheet children | 216fa068 | New props optional, pill and row render as before; title gains accessibilityRole header |
| 2. DeletableRow | b62645b3 | SwipeRow right action only, MoreGlyph in inkMuted, Dropdown action menu titled with the name |

## Verification

- Dropdown and ConfirmSheet tests: 14 passed. DeletableRow tests: 8 passed (all named acceptance tests present).
- `npm run typecheck` clean; `npm run depcruise` clean; eslint 0 errors on touched files (3 warnings each in the two test files for `require()` in jest mocks, a pattern already used by SwipeRow and ConfirmSheet tests).
- Wider run over src/ui, src/features/decide/{ui,home,past,check}, home, record/{accounts,entry,activity}, you and i18n: 14906 of 14907 passed. The one failure was `decide/check/__tests__/commit.test.tsx`, which passes alone (22/22) and is outside this plan; it ran while other executors were editing en.ts and codeMaps in the same tree.
- Callers of the shared components (Step1Item, ChangeSheet, DecisionDetailSheet, HomeScreen, AccountRemoveRow, ActivityScreen, ActivityMoreMenu, OccurrenceActions, TransactionSheet, ExtrasDetail, SampleBanner, WeekStartRow) are covered by that run.

## Deviations from Plan

**1. [Rule 3 - Blocking] SwipeAction needs `a11yLabel`**
- The plan listed `{ word, tone, onCommit }`; SwipeRow's type requires `a11yLabel`. DeletableRow passes the Delete word. No SwipeRow change.

Otherwise as written. No migrations, no Supabase calls.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-62: swipe a saved row left on the Pixel (word Delete in danger, light haptic, confirm opens, row closes); the ⋯ opens a menu titled with the row name with Delete in danger; Keep it leaves the row.

## Known Stubs

None. DeletableRow is not yet adopted by a screen (05-72, 05-73 do that).

## Self-Check: PASSED
