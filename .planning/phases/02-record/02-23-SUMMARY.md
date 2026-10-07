---
phase: 02-record
plan: 23
subsystem: ui
tags: [react-native, activity, search, filters, bulk-select]
requires: [02-16, 02-22]
provides:
  - useActivitySelection, SearchBar, FilterSheet, BulkBar
  - ActivityScreen search (month / every month), filters and bulk actions
affects: [02-28]
key-files:
  created:
    - src/features/record/activity/useActivitySelection.ts
    - src/features/record/activity/SearchBar.tsx
    - src/features/record/activity/FilterSheet.tsx
    - src/features/record/activity/BulkBar.tsx
    - src/features/record/activity/__tests__/activityTools.test.tsx
  modified:
    - src/features/record/activity/ActivityScreen.tsx
    - src/features/record/activity/ActivityRow.tsx
    - src/features/record/activity/activitySections.ts
    - src/features/record/activity/__tests__/ActivityScreen.test.tsx
    - src/i18n/locales/en.ts
requirements-completed: [ACT-03, ACT-04, ACT-05, REC-06, REC-18]
completed: 2026-10-06
---

# Phase 2 Plan 23: Activity search, filters and bulk select Summary

Activity now searches the current month instantly or every month through the server (flat newest-first list), filters by category (incl. Uncategorised), account, direction (All / Money out / Money in / Transfers) and a home-currency amount range parsed by the strict amount parser, and supports bulk Mark paid / Mark unpaid / confirmed Delete as one undo step.

## Commits
- 1d7f60e test: failing selection / SearchBar / FilterSheet tests (RED)
- ba1adc1 feat: selection hook, SearchBar, FilterSheet (GREEN)
- a073a84 test: failing ActivityScreen search, filter and bulk tests (RED, 9 failing before wiring)
- 2194580 feat: BulkBar and ActivityScreen / ActivityRow wiring (GREEN)

## Review follow-ups applied
- Item 7: bulk delete / mark paid / mark unpaid pass the step id straight to `showToast` typed `string | null`; a null id shows the toast with no Undo (tested for delete).
- Items 2/3/6 are handled inside the 02-16 bulk hooks (dedupe by id, `expectedVersion`, undo step). The screen only passes rows, and the hooks dedupe.
- D-51: selected legs carry `transfer_id`; the hook fetches the partner leg at flush. Transfer legs are excluded from bulk mark paid/unpaid.

## Deviations from Plan
- **[Rule 2 - copy]** Added three catalogue keys not in the plan's list: `activity.searchClear` ("Clear search", the required labelled clear button), `activity.filter.title` ("Filter", chip and sheet title) and `activity.filter.rangeInvalid` (min above max is refused rather than silently applied). No forbidden voice.
- **[Test location]** Screen-level tests live in the existing `ActivityScreen.test.tsx` (its module mocks are file-wide) rather than `activityTools.test.tsx`; hook, SearchBar and FilterSheet tests are in `activityTools.test.tsx`. The screen test mocks `@/data/mutations/patches` and `useTransactionsSearch`.
- **[Rule 1 - lint]** `react-hooks/set-state-in-effect` forbids syncing state in effects, so selection pruning and SearchBar's term sync use React's adjust-state-during-render pattern. Checkbox tick is a small filled dot (the `i18next/no-literal-string` rule rejected a glyph literal).
- **BulkBar is presentational**; the data hooks (`useBulkDelete()` etc.) are called in `ActivityScreen`, which satisfies the plan's grep across both files.
- **Empty eligible set:** bulk Mark paid with no pending non-transfer row selected (or Mark unpaid with no paid row) shows the existing "Select some rows first." hint rather than inventing copy; the hooks throw on an empty target set so the screen pre-filters. Mark actions keep select mode on and clear the selection; Delete exits select mode.
- **Search/filter view:** projections (expected rows) are hidden while a search term or filter is active, and the month totals bar is hidden for an every-month result list, since neither describes a filtered set.
- **FilterSheet** takes an optional `region` prop (for the amount parser's separators) in addition to the planned props.
- No haptics were added (not required by the plan).

## Known Stubs
None.

## Verification
- `npx jest src/features/record/activity src/i18n` green (38 activity tests, catalogue tests incl. forbidden-voice).
- `npm run typecheck`, `npm run depcruise`, `npx eslint src/features/record/activity src/i18n/locales/en.ts` clean.
- Plan greps: no `parseFloat`/`Number(` in FilterSheet; `activity.filter.transfers` referenced once; slot comment removed; `useBulkDelete()` in ActivityScreen.

## Self-Check: PASSED
