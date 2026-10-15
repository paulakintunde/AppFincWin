---
phase: 03-shell
plan: 22
subsystem: home
tags: [home, view-model, this-month, engine-figures]
requires: [03-01, 03-04, 03-05, 03-17, 03-21]
provides: [useHomeViewModel, selectComingUp, MonthChips, ThisMonthCard]
affects: [03-23]
key-files:
  created:
    - src/features/home/comingUp.ts
    - src/features/home/useHomeViewModel.ts
    - src/features/home/MonthChips.tsx
    - src/features/home/ThisMonthCard.tsx
    - src/features/home/__tests__/comingUp.test.ts
    - src/features/home/__tests__/useHomeViewModel.test.tsx
    - src/features/home/__tests__/MonthChips.test.tsx
    - src/features/home/__tests__/ThisMonthCard.test.tsx
requirements-completed: [HOME-02, HOME-03, HOME-04]
duration: ~40min
completed: 2026-10-13
---

# Phase 3 Plan 22: Home view model and This month figures Summary

Home's data layer over Activity's existing query keys (engine `monthPosition` for every figure), a tested Coming-up selection, month chips and the This month card.

## Tasks

1. Coming-up selection and Home view model: commit 7122d5d
2. MonthChips and ThisMonthCard: ea9319a

## Notes

- `useHomeViewModel` reuses `useMonthView`, `useTransactionMonths`, `useAccounts`, `useAccountBalances`, `useRowActions`, `useRowFlow` and the shared `useSelectedMonth`; no supabase/db import, no new server call. `refreshKeys` are the six Activity keys (empty without a household).
- `selectComingUp` uses `isUnpaidBill` plus outgoing projections, ordered by date (rows before projections on ties, then name), limit 4 with full total.
- Card has no arithmetic beyond `Math.abs` for display magnitudes; unconverted lines use `activity.totals.unconverted`. Figures use `scale="capped"` and stack above 1.3x.
- Pending bar segment and paid segment carry testIDs `home-bar-paid` / `home-bar-pending`.
- Month chip label is the locale short month trimmed of a trailing dot and cut to 3 characters (en-GB "Sept" becomes "Sep").

## Deviations from Plan

None material. Worktree was reset to 7b3f857 per the branch check.

## Known Stubs

None.

## Verification

`npx jest src/features/home` (20 tests), `npx tsc --noEmit`, `npx eslint src/features/home` all clean. Tests print harmless "overlapping act()" console warnings from ThemeProvider hydration.

## Self-Check: PASSED
