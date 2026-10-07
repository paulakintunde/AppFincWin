---
phase: 02-record
plan: 22
subsystem: ui
tags: [react-native, activity, flash-list, transfers, mark-paid]
requires: [02-14, 02-15, 02-19, 02-20]
provides:
  - ActivityScreen (grouped month list, switcher, totals, Add entry points)
  - buildActivityItems (pure, tested)
  - ActivityRow / ProjectionRow, MonthSwitcher, MonthTotalsBar
affects: [02-23]
tech-stack:
  added: ["@shopify/flash-list 2.0.2 (JS-only, no native code)"]
key-files:
  created:
    - src/features/record/activity/activitySections.ts
    - src/features/record/activity/ActivityScreen.tsx
    - src/features/record/activity/ActivityRow.tsx
    - src/features/record/activity/MonthSwitcher.tsx
    - src/features/record/activity/MonthTotalsBar.tsx
    - src/features/record/activity/__tests__/activitySections.test.ts
    - src/features/record/activity/__tests__/ActivityScreen.test.tsx
  modified:
    - package.json
    - package-lock.json
requirements-completed: [ACT-01, ACT-02, REC-06, REC-03, REC-18]
duration: n/a
completed: 2026-10-06
---

# Phase 2 Plan 22: Activity month screen Summary

The Activity screen lists a month as Still to come (pending rows plus expected projections), Paid and Skipped in a FlashList v2, with a month switcher, a paid In/Out/Net line plus a separate Still to come figure, overdue flags, one-tap Mark paid, and Add / row-tap entry into the transaction sheet.

## Commits
- 2952885 test: failing section-builder tests (RED)
- 567f592 feat: buildActivityItems and `@shopify/flash-list` 2.0.2 (GREEN)
- 4659faf test: failing ActivityScreen tests (RED)
- f892b0d feat: ActivityScreen, ActivityRow, MonthSwitcher, MonthTotalsBar (GREEN)

## Native code
`@shopify/flash-list` 2.0.2 is JS-only on the New Architecture. It adds no native module, so this plan does not require a new development build. (The datetimepicker from 02-20 still does.)

## Review follow-ups applied
- Item 7: Mark paid uses the hook's `string | null` step id and passes it straight to `showToast`; a null step id shows the toast with no Undo (tested).
- Item 13: see deviation below.
- Items 2/3 are handled inside the 02-15 hooks used here.

## Deviations from Plan
- **[Follow-up note vs. plan, item 13]** `AmountDisplay`'s `dim` tone was not used in the list. `AmountDisplay` is the entry sheet's display-size figure (the `amountDisplay` size, outside the 4-size type scale), which would dominate a list row. Transfer legs instead use the same `inkDim` colour token on the standard body text role. No new colour added.
- **Transfer glyph tint:** `CategoryGlyph` only accepts the 7 `categorySwatch` keys, so a transfer leg takes the system Transfer category's stored `color_key` (as the plan specifies), not the `#5A6472` / `#EDEAE1` pair. If the seeded Transfer row's `color_key` is `slate`, the tint is the Utilities pair. Matching the UI-SPEC grey exactly needs a `Transfer` entry in `categorySwatch` or a glyph prop; left for a design call.
- **Tags** (queued, Overdue, Due, Expected) use `fill1` background with `inkMuted` text. Accent is used only for the Add and Mark paid pills, and `danger` is not used.
- **Add menu** is a Sheet of three Rows (Money out / Money in / Transfer), reusing the existing `record.sheet.direction*` copy, rather than new copy.
- **Money formatting** goes through `money()` to satisfy the branded `CurrencyCode` type.
- Tests replace FlashList with a plain map (its layout pass needs native measurement) and mock `TransactionSheet` with a stub that exposes the mode it was opened with.

## Known Stubs
None. `selectable={false}` is passed to nothing yet; the 02-23 slot is a comment in `ActivityScreen.tsx` as the plan specifies. `selectable` is declared on `ActivityRowProps` but not yet used by the row (02-23 wires it).

## Verification
- `npx jest src/features/record/activity` green (16 tests).
- `npm run typecheck`, `npm run depcruise` and `npx eslint src/features/record/activity` clean.
- Plan greps: FlashList present, the 02-23 slot comment present once, transferTo/transferFrom on two lines in ActivityRow, no hex colours in the activity components.

## Self-Check: PASSED
