---
phase: 07-insights
plan: 11
subsystem: insights
tags: [insights, tab-bar, level-gating, expo-router]
requires: [07-05, 07-07, 07-09, 07-10]
provides: [InsightsScreen, insights tab route, GatedTabBar]
affects: [src/shell/tabBar, app/(app)/(tabs)]
key-files:
  created:
    - src/features/insights/InsightsScreen.tsx
    - src/features/insights/__tests__/InsightsScreen.test.tsx
    - app/(app)/(tabs)/insights.tsx
    - src/features/levels/GatedTabBar.tsx
    - src/features/levels/__tests__/GatedTabBar.test.tsx
  modified:
    - app/(app)/(tabs)/_layout.tsx
    - src/shell/tabBar/availableTabs.ts
    - src/shell/tabBar/__tests__/availableTabs.test.ts
    - src/shell/tabBar/__tests__/tabsLayoutStable.test.tsx
    - src/shell/tabBar/__tests__/TabBar.a11y.test.tsx
    - src/shell/__tests__/shellNavigation.test.tsx
    - src/features/grow/home/__tests__/GrowHome.test.tsx
requirements-completed: [INS-01, INS-02, INS-03, INS-04, INS-05, INS-06]
duration: long (slow machine)
completed: 2026-11-23
---

# Phase 7 Plan 11: Insights tab assembly Summary

The Insights tab now exists as the 5th tab: one scope switch and one range control drive Money in and out, Where it went, This month against last, then Net worth and Score (each behind its own level-3 feature id), with whole-tab empty, loading and error states. GatedTabBar shows the tab from level 2.

## What was built
- `InsightsScreen`: shared `useInsightsScope` and one `useInsightsPrepared(scope, householdCurrency)`; range state `6m` default; scope switch only with 2+ members (haptic off); whole-tab empty (no recorded months, household with nothing shared, deep link while insights not visible, T-07-33), error (Try again) and loading placeholders; `SyncStatusLine` above the sections; footer. Gap actions: income/spending open the entry sheet, balance pushes `/accounts`.
- Route `insights.tsx` wrapped in `DecideV3Scope`.
- `GatedTabBar` reads `useFeatureAccess('insights')` and passes availability to `TabBar`; layout uses it. `TAB_AVAILABILITY.insights` true; doc comment updated. Route always declared, so no remount (T-07-35).
- Tests updated for five tabs (availableTabs, TabBar.a11y, shellNavigation with a mocked access hook, tabsLayoutStable, GrowHome); new InsightsScreen and GatedTabBar tests.

## Deviations
- Sections are asserted by their real testIDs (`net-worth-section`, `score-card` stub), not the plan's `insights-net-worth` / `insights-score`.
- No `useSettledLabel` call on the screen: each section already carries its own ChartSummary text, so a second announcer would double-read.
- availableTabs.test tabRoutes "Grow hidden" case now lists insights as visible (a consequence of the flip).

## Checks
- `npx tsc --noEmit`: clean.
- `npm run depcruise`: no violations.
- eslint on changed files: no errors after adding an i18n literal-string disable in the screen test (only no-require-imports warnings, same as existing tests).
- jest (`--coverage=false --testTimeout=120000`): src/shell/tabBar, GatedTabBar, InsightsScreen passed; one availableTabs case fixed after the first run; full src/features/insights, src/features/levels, src/shell, GrowHome run recorded in the hand-back.

## Owner concerns
- Insights is visible to everyone at default level 4 (setup row missing). Net worth/Score visibility is by feature id, not re-checked here.
