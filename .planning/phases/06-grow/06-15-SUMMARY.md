---
phase: 06-grow
plan: 15
subsystem: ui
tags: [grow, home, goals, safety-net, tabs, fab]
requires: ["06-09", "06-12", "06-13"]
provides:
  - "app/(app)/(tabs)/grow.tsx: Grow tab route (tab hidden, href null, until 06-20)"
  - "src/features/grow/home/GrowHome.tsx: segments, FAB config, onNewGoal hook point, sheets slot"
  - "GoalsSegment, SafetyNetCard, GoalRow, ToolsRow; DebtsSegment and InvestingSegment (empty states)"
affects: [06-16, 06-17, 06-18, 06-19, 06-20, 06-22]
key-files:
  created:
    - app/(app)/(tabs)/grow.tsx
    - src/features/grow/home/GrowHome.tsx
    - src/features/grow/home/GoalsSegment.tsx
    - src/features/grow/home/SafetyNetCard.tsx
    - src/features/grow/home/GoalRow.tsx
    - src/features/grow/home/ToolsRow.tsx
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/investing/InvestingSegment.tsx
    - src/features/grow/home/__tests__/GrowHome.test.tsx
  modified:
    - app/(app)/(tabs)/_layout.tsx
requirements-completed: [GRW-01, GRW-02, GRW-03]
completed: 2026-11-06
---

# Phase 6 Plan 15: Grow tab shell and Goals segment Summary

The Grow home (G01): a tab-role segmented control, hero, safety net card first, goal rows with a reach date, a Tools row to Calculators, and empty Debts and Investing segments. The tab stays hidden.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Grow tab route, home shell, segment control, FAB, states | 939a47b8 |
| 2 | Goals segment, safety net card, goal rows, Tools row, empty segments | a8df07c3 |

Task 1's commit does not compile on its own: GrowHome imports the segment files that Task 2 adds. The two commits together typecheck.

## What was built

- Segment control is a `tablist` of `tab` Pressables (44 px, selected announced), not SegmentedToggle (a radiogroup). Switching is in place: no navigation, no haptic.
- FAB follows the segment ('New goal' / 'Add a debt' / 'Add a holding'). In the Basics state (flags off) there is no FAB. Goals FAB calls `onNewGoal`, which sets `newGoalOpen`. GrowHome takes an optional `sheets({ newGoalOpen, closeNewGoal })` render prop, drawn in TabRootScreen's overlay, so 06-22 mounts NewGoalSheet without restructuring.
- `(tabs)/_layout.tsx`: one import and `{isTabAvailable('grow') ? null : <Tabs.Screen name="grow" options={{ href: null }} />}`. `TAB_AVAILABILITY.grow` is still false; `availableTabs()` is still 4-less-Grow (3 visible plus no Grow) and a test asserts it plus the layout's `href: null`.
- Goals segment reads `useGoalsRead`. Hero count = goals plus the safety net. Reach date comes from `goalPlanByMonthly` (first deposit the first of next month). The spoken row label matches the G01 form: "Trip to Lisbon, 640 dollars of 1,800 dollars, 36 percent, 50 dollars a month, reaches target November 2028". Goal rows push `/grow/goal/<id>` (06-22), the net card pushes `/grow/safety-net` (06-16), Tools pushes `/grow/calculators`.
- Hero rule ("Your rule is at least $150") reads `saving_floor` from `useDecideSettings`; with none it uses the NoRule line.
- Basics: safety net card plus the "Choose what to track" card, which pushes `/you` (the O10 target was not defined; change it if O10 gets its own route).
- Loading is three grey blocks, error is the generic card with Try again.

## Expo Router route registration

Expo Router lists file-based stack routes that are not declared as `Stack.Screen` automatically, so plans 16-19 and 22 add `grow/safety-net`, `grow/lines`, `grow/goal/[id]`, `grow/debt/[id]`, `grow/holding/[id]` and the record-calculator routes without editing `app/(app)/_layout.tsx`. I did not touch that file. This is from router behaviour, not run on a device; the first of those plans should confirm a push resolves.

## Deviations from Plan

- `app/(app)/_layout.tsx` is in the plan's file list but unchanged (see above).
- Rule 3: queries for the tablist use test ids, because RNTL role queries need `accessible` and a tablist container should not be one.

## Wiring left (no 06-14 hooks were needed)

- DebtsSegment and InvestingSegment ship as empty states only. They take `onAdd` props; GrowHome passes no-ops for `onAddDebt` and `onAddHolding` until 06-17 and 06-18 add the sheets and the populated segments (`useDebtsRead`, `useInvestingRead`). Debts/Investing never show data yet, even if records exist.
- The safety net card uses `cardLineNoPlan` ("No Decide answer spends it."). The prototype line "$100 a month reaches $2,300 by Aug 2027" needs the net's monthly amount, which `SafetyNetPoint` does not carry; 06-16 can add it.
- `onNewGoal` only sets state until 06-22.

## Missing strings (en.ts untouched)

- A goal row whose monthly amount never reaches the target has no wording; it falls back to `goalRowNoMonthly`, which says "no monthly amount yet". A "does not reach target" row string would be more exact.
- "Choose what to track" has no destination route (using `/you`).

## Verification

- `npx jest src/features/grow/home src/features/grow/__tests__/copyLint src/shell/tabBar`: all pass (14 GrowHome tests).
- `npm run typecheck`, `npm run depcruise`: clean. eslint on the changed folders: 0 errors, 3 warnings in the new test (same kind as sibling tests).
- Not run: full coverage, device check. Note this RNTL is async: `fireEvent`, `render` and `unmount` must be awaited, or later tests in a file fail.

## Known Stubs

- `onAddDebt` and `onAddHolding` in GrowHome are no-ops (see Wiring left).

## Self-Check: PASSED
