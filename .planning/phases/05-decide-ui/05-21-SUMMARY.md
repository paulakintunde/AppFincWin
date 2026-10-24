---
phase: 05-decide-ui
plan: 21
subsystem: decide-ui
tags: [decide, tab, home, open-checks, reminders, shell]
requires: [05-11, 05-12, 05-13, 05-19]
provides: [DecideHomeScreen, OpenChecksCard, DecideShellHost, useDecideHomeViewModel, checkHref, openNewCheck, Decide tab route]
affects: [05-22, 05-27, 05-30]
key-files:
  created:
    - app/(app)/(tabs)/decide.tsx
    - src/features/decide/DecideShellHost.tsx
    - src/features/decide/home/DecideHomeScreen.tsx
    - src/features/decide/home/OpenChecksCard.tsx
    - src/features/decide/home/useDecideHomeViewModel.ts
    - src/features/decide/home/checkHref.ts
    - src/features/decide/home/__tests__/DecideHomeScreen.test.tsx
    - src/features/decide/home/__tests__/OpenChecksCard.test.tsx
  modified:
    - app/(app)/(tabs)/_layout.tsx
    - src/shell/tabBar/availableTabs.ts
    - src/shell/tabBar/__tests__/availableTabs.test.ts
    - src/shell/tabBar/__tests__/TabBar.a11y.test.tsx
    - src/shell/__tests__/shellNavigation.test.tsx
    - src/features/record/setup/__tests__/setup.test.tsx
requirements-completed: []
---

# Phase 5 Plan 21: Decide tab root Summary

The Decide tab is live as the centre tab: quick check first, then Open checks (each verdict recomputed per render through `computeChip` with the other open checks stacked), the Past decisions row and the sources note, with a "New check" FAB and quick-menu entry and reminder reconcile that leaves out reopened decisions.

## What was built
- **Tab flip**: `TAB_AVAILABILITY.decide = true`; `app/(app)/(tabs)/decide.tsx` route; `DecideShellHost` mounted beside `ShellEntryHost` registers the `newCheck` quick action.
- **`useDecideHomeViewModel`**: composes the record context, snapshot, checks and settings; builds the open list (newest first), decided count, and the two reconcile lists (waiting ready-by dates; every decided check's `cooling_off_at`), both leaving out decided checks named by a live check's `reopened_from`. Reconcile runs once data is ready and again only when the list content changes.
- **`DecideHomeScreen`**: header, subtitle, `QuickCheckForm` (surface home, retry wired), `OpenChecksCard`, Past decisions row (`pastCount` plural / `pastNone`) pushing `/decide/past`, sources note (logged counts / rough / nothing). FAB via `useRegisterFab`. "Run the full check" calls `useCreateCheck` (furthest_step 2) and pushes the check route with `step: '2'`. No `refreshKeys`.
- **`OpenChecksCard`**: `computeChip(source, inputs, selectOtherChecks(...).otherChecks)` for every row in one memo over `[open, source, today]` (so another check's edit can flip a marker); StateChip (Draft / Missing terms / verdict state, none when there are no figures), sub-line, "Changed since you looked · was {state}" in words when the state differs from `last_seen_state`; row opens step 3 when price and method exist, else step 1; 44x44 abandon target with destructive toast + Undo and property-less `check_abandoned`; `+ Purchase` / `+ Investment` gated through `canUse('multipleOpenChecks')`.
- `checkHref.ts`: the check-route href builder and `openNewCheck(kind)` (client uuid via `expo-crypto`), shared by the screen, card and shell host.

## Verification
- `npx jest src/features/decide/home src/shell` green (319 tests); full suite `npx jest --forceExit`: 511 suites, 15894 passed, 14 skipped.
- `npm run typecheck` clean; `npm run lint` 0 errors; `npm run depcruise` clean.
- Named tests present: `reconcile leaves out a reopened decision`, `another check can flip the changed marker`.
- No migrations; pgTAP/DB tests not run (Docker down).

## Deviations from Plan
- **[Rule 3 - Blocking] Existing tests assumed two tabs.** `availableTabs.test.ts`, `TabBar.a11y.test.tsx` (default availability pinned to two tabs for the old cases, plus a new "Home, Activity and Decide by default" case), `shellNavigation.test.tsx` (labels "of 3", `decide` leaf route, `DecideShellHost` stubbed) and `setup.test.tsx` (`DecideShellHost` stubbed) were updated.
- Added `src/features/decide/home/checkHref.ts` (not in the plan's file list) so the href and uuid minting live in one place.
- The Changed marker renders as its own line above the sub-line rather than fused into it, to keep both readable at large font; the sub-line text is unchanged.
- No new i18n keys were needed; no engine edits.

## Known Stubs
None. `/decide/check/[id]` (05-30) and `/decide/past` (05-22) routes are linked with `as Href` and do not exist yet, as the plan states.

## Human/device items
- Pixel/iPhone: Decide tab bar ordering and label "Decide, tab, 3 of 3", FAB label, large-font wrap of the open-check rows, TalkBack reading of the row label and the abandon target (not run; no device steps).

## Self-Check: PASSED
