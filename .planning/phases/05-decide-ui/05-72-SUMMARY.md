---
phase: 05-decide-ui
plan: 72
subsystem: ui
tags: [decide, open-checks, changes, delete, swipe, D-72, D-73]
requires: [05-54, 05-55, 05-56, 05-62]
provides:
  - OpenChecksCard and ChangesCard hidden when empty
  - both cards' rows are DeletableRow (swipe or ⋯, confirm sheet, Undo toast)
  - DeletableRow optional accessibilityLabel prop
key-files:
  modified:
    - src/features/decide/home/OpenChecksCard.tsx
    - src/features/decide/home/ChangesCard.tsx
    - src/features/decide/home/__tests__/OpenChecksCard.test.tsx
    - src/features/decide/home/__tests__/ChangesCard.test.tsx
    - src/features/decide/ui/DeletableRow.tsx
decisions:
  - "DeletableRow gains an optional accessibilityLabel (forwarded to SwipeRow) so the row carries the full name when the visible one is clamped"
  - "ChangesCard stays mounted while its sheet is open even with no rows, so deleting the last row never unmounts an open edit"
requirements: [DCU-04, DCU-15, DCU-28, DCU-03, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 72: Open checks and Changes coming up delete pattern Summary

Both cards return null while empty (Open checks takes its heading and + Purchase / + Investment links with it). Rows are DeletableRow: a swipe or the ⋯ menu (Open / Edit, Delete) opens the confirm sheet, and only its Delete calls `abandon(row, 'deleted')` / `remove(row)` and shows the destructive Undo toast (`decide.delete.toastCheck` / `toastChange`). The `check_abandoned` event is unchanged. The old 'x' controls, empty blocks and the old copy keys are no longer read. Names clamp at two lines with the full name in the row's accessibility label; the chip sits in a flexWrap row; sub-lines wrap.

## Tasks

| Task | Commit |
|------|--------|
| 1. Open checks | 507ed57a |
| 2. Changes coming up | 7cf55642 |

## Verification

- `npx jest` OpenChecksCard + ChangesCard + decide/ui: all pass except `decide/ui/__tests__/textFit.test.tsx` (SegmentedToggle accessibilityState shape, another executor's in-progress work).
- `npx jest src/features/decide/home`: DecideHomeScreen.test.tsx fails (no SafeAreaProvider), which is 05-71's in-progress file, not this plan.
- `npm run typecheck` clean. eslint: 0 errors on touched files (5 `require()` warnings in jest mocks, an existing pattern).
- grep for removed keys in both cards returns 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] DeletableRow accessibilityLabel prop**
- 05-62's DeletableRow had no way to set the row label required by D-76; added an optional prop forwarded to SwipeRow (file outside the plan's list). Commit 507ed57a.

Row presses in tests now go through the visible text (the label sits on SwipeRow's wrapper, the Pressable is inside it).

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-72: swipe and ⋯ on an open check and a change; confirm copy; Undo toast restores the row; a long name clamps at two lines with the chip wrapping under it.

## Known Stubs

None. The `currency` prop on OpenChecksCard was already unused before this plan.

## Self-Check: PASSED
