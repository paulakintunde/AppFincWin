---
phase: 05-decide-ui
plan: 116
subsystem: decide-home
tags: [notice-row, problems-sheet, you-screen]
requires: [05-110, 05-111]
provides: [HomeNoticeRow, HomeProblemsSheet, CURRENCIES_HREF, syncLabelText]
affects: [05-114]
key-files:
  created:
    - src/features/decide/home/HomeNoticeRow.tsx
    - src/features/decide/home/HomeProblemsSheet.tsx
    - src/features/decide/home/__tests__/HomeNoticeRow.test.tsx
    - src/features/decide/home/__tests__/HomeProblemsSheet.test.tsx
  modified:
    - src/features/you/YouScreen.tsx
    - src/features/you/components/HomeCurrencyRow.tsx
    - src/features/you/__tests__/YouScreen.test.tsx
    - src/ui/Screen.tsx
decisions:
  - The waiting-writes text (online, over 5 s) has no decide.home key, so it renders from the existing sync.waiting_one/other key; offline, offline-waiting and Saving use decide.home.notice.*.
  - Stacked sheets (rough figures, FailedWritesSheet, card terms) render inside HomeProblemsSheet's Sheet tree. The problems sheet stays up while a stacked sheet it opened is open, even if its last entry clears.
  - Exchange rates closes the sheet and pushes /you?focus=currencies (CURRENCIES_HREF).
  - The notice dot and chevron use width plus aspectRatio, not height, so the D-76 rule F allowlist is unchanged.
requirements: [DCU-34, SYN-06, DCU-23, DCU-24]
metrics:
  completed: 2026-10-24
  tasks: 2
---

# Phase 5 Plan 116: Notice row and Needs a look sheet Summary

One quiet notice row renders `noticeRowModel`, and the "Needs a look" sheet lists every `homeProblems` entry with its affects line and one fixing action.

## What was built

- `HomeNoticeRow({ model, onPress })`: hidden when the model is hidden; minHeight 44, no fill; an 8px `warn1` dot only when the model says so; label in `ink`; `inkSoft3` chevron; role button, label = the text, hint "Opens the list". Exports `syncLabelText` mapping sync label codes to the 05-110 notice keys (and `sync.waiting` for online waiting writes).
- `HomeProblemsSheet({ entries, visible, onClose, source, settings, userId, currency })` on the app's `Sheet`: entries in order with 1px `fill2` separators, each a group "{title}. Affects {affects}." then one action. Add rough figures stacks `RoughFiguresSheet`; Review changes and Review edits stack the shipped `FailedWritesSheet`; Card minimum payment stacks `CardMinimumSheet` (wired with `useSaveCardTerms` as CheckFlowScreen does, inside a host that mounts only while open); Exchange rates (missing and stale rates) closes and pushes `/you?focus=currencies`; offline shows "They send when the connection returns." with no action. Focus moves to the title from its layout event. The sheet hides when `entries` is empty.
- `YouScreen` reads `focus` with `useLocalSearchParams`. On `currencies`, the Home currency row's layout event (once) scrolls the row into view and focuses it. `HomeCurrencyRow` takes optional `rowRef` and `onRowLayout`; `Screen` takes an optional `scrollRef`. The Add group (05-98) is untouched and its tests pass.

## Verify

- `HomeNoticeRow.test.tsx` 5 passed, `HomeProblemsSheet.test.tsx` 9 passed, `YouScreen.test.tsx` 24 passed (2 new), `src/features/decide/home` and `src/i18n` suites and `decideTextFit` all passed (23 suites, 14545 tests).
- `npm run typecheck` clean (at last run). eslint: 0 errors on touched files (test-file `require` warnings only, as in sibling tests).

## Deviations from Plan

- **[Rule 3 - Blocking]** `Screen.tsx` was not in the plan's file list; it gained an optional `scrollRef` so YouScreen can scroll to the currency row. Backwards compatible.
- `getInnerViewRef` is used to measure the row for scrolling; it exists at runtime but is missing from RN's typings, so it is reached through a narrow cast.
- The stacked failed-writes sheet keeps the problems sheet mounted while open (a small addition beyond the plan) so it does not vanish under the user when the last failure clears.

## Known Stubs

None. Nothing mounts these components yet: 05-114 places `HomeNoticeRow` and `HomeProblemsSheet` on the home screen and passes `homeProblems` output, `source`, `settings`, `userId` and `currency`.

## Device item

05-EXECUTION-NOTES entry 05-116 (each action opens its target; the sheet closes when the last problem is fixed). Scrolling and screen-reader focus on You are device checks; not ticked.

## Self-Check: PASSED
Commits 45d699bf, dd73f302 exist.
