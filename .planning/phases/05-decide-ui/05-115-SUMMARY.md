---
phase: 05-decide-ui
plan: 115
subsystem: decide-home
tags: [sheet, month-details, home-row, dcu-09]
requires: [05-110, 05-111]
provides: [MonthDetailsBody, MonthDetailsSheet, HomeRow]
key-files:
  created:
    - src/features/decide/home/MonthDetailsSheet.tsx
    - src/features/decide/home/HomeRow.tsx
    - src/features/decide/home/__tests__/MonthDetailsSheet.test.tsx
    - src/features/decide/home/__tests__/HomeRow.test.tsx
  modified:
    - src/features/decide/home/YourMonthCard.tsx
requirements: [DCU-34, DCU-14, DCU-10]
completed: 2026-10-24
---

# Phase 5 Plan 115: Month details sheet and the quiet HomeRow Summary

Your month's detail now lives in a sheet built on the app's own Sheet, and the home's lists have a quiet full-width row (`HomeRow`) ready for 05-117 to place.

## Commits
- 24fdc2f6 feat(05-115): MonthDetailsBody and the Month details sheet
- 527ee535 feat(05-115): HomeRow quiet row

## What was built
- `MonthDetailsBody` (exported from `YourMonthCard.tsx`): the logged and rough content of the old card, with a `dark` flag. `YourMonthCard` is now the ink wrapper around it with `dark`, so the card renders as before (LinesAndMonth tests unchanged and green). The light variant uses `Pill` secondary for Activity and Edit, and an ink/fill1 segmented basis control.
- `MonthDetailsSheet`: Sheet, title Text (the card label), a SheetScroll holding the body, the sources note and a Close pill, with `RoughFiguresSheet` rendered inside the Sheet's children (stacked). Activity closes the sheet and then navigates. For `card.state` `unavailable` or `first_run` it shows only the reason line and its one action (See lines waiting for a rate goes to Activity; Add rough figures opens the stacked rough sheet).
- `HomeRow`: Pressable, minHeight 52, `rowPadDense`, 1px `line1` bottom separator unless `isLast`, label body 500 ink, value meta 600 inkMuted stacking under the label by `useShouldStack(value length)`, optional warn1 second line, 8px `inkSoft3` chevron, pressed `fill6`, `hapticSelection`, a11y `"{label}, {value}"` via `decide.home.rows.a11y`, role button. No numberOfLines.

## Verification
- `npx jest src/features/decide/home`: 13 suites, 138 tests pass (including the three named MonthDetailsSheet tests and `D-95 a quiet row reads label and value and fires a selection haptic`).
- `npm run typecheck` clean. eslint on the five touched files: 0 errors, 0 warnings.
- `decideTextFit` and `src/i18n` (copy guards): 9 suites pass, no allowlist change (the chevron uses `aspectRatio`, so no fixed `height` was added).

## Deviations from Plan
- The plan names the sheet's `card` prop `HomeCardState`; the shipped type from 05-111 is `HomeCardModel`, which I used.
- `MonthDetailsSheet` takes `currency` and `sourcesNote` and owns the stacked rough-figures state itself, instead of using an `onEditRough` prop; the screen no longer needs to host that sheet for this path.
- Added a fourth test (first run shows the reason and Add rough figures only) and two HomeRow tests beyond the named ones.

## Notes for 05-117/05-118
- Callers pass the card label as `title` and the built sources note (`decide.home.sources` / `sourcesRough`) as `sourcesNote`; today's `DecideHomeScreen` still builds both.
- Old `decide.month.*` keys are reused for the body; `decide.home.monthDetails.close`, `unavailable.*` and `rows.a11y` come from 05-110.
- Device item: 05-EXECUTION-NOTES entry 05-115 (basis control changes the label and hero; Edit stacked; sheet scrolls at 2.0x). Requirements not ticked because the device check is open.

## Self-Check: PASSED
