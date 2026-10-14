---
phase: 03-shell
plan: 06
subsystem: shell
tags: [back-history, sheet-stack, expo-router, a11y, test-harness]
requires: [03-01, 03-02, 03-03]
provides:
  - BackHistoryProvider / useBackHistory (observed 8-deep history, goBack)
  - sheetStack module store (pushSheet, removeSheet, useSheetCount, useTopSheetId, useIsTopSheet)
  - useAndroidBackHandler / AndroidBackHandler (D-06 steps 2-4)
  - ShellLayoutProvider / useShellLayout
  - focusAccessibility / useScreenTitleFocus
  - renderWithShellProviders, mockBackHistory, resetShellStores
key-files:
  created:
    - src/shell/backHistory/BackHistoryProvider.tsx
    - src/shell/backHistory/useAndroidBackHandler.ts
    - src/state/sheetStack.ts
    - src/shell/layout/ShellLayoutProvider.tsx
    - src/shell/a11yFocus.ts
    - src/shell/__tests__/testUtils.tsx
    - src/shell/__tests__/testUtils.test.tsx
metrics:
  tasks: 3
  completed: 2026-10-13
---

# Phase 3 Plan 06: Shell cross-cutting state Summary

Observed Expo Router back history with D-06 goBack, a cross-window open-sheet module store, the Android back handler for steps 2-4, shared tab-bar/toast heights, a screen-reader title focus helper and a shared test harness.

## Commits
- d2ac125 BackHistoryProvider
- 6eae8a6 sheetStack store and Android back handler
- c69cc1c ShellLayoutProvider, a11yFocus, testUtils

## Deviations from Plan

**[Rule 1 - lint] Ref sync moved into an effect.** The plan's "keep refs in sync each render" tripped react-hooks/refs (writing refs during render). The sync is now a `useEffect` declared before the observing effect, so ordering is preserved.

**[Addition] `testUtils.test.tsx`** added to cover the harness behaviour listed in the plan's behaviour block.

Test-environment notes: this RNTL version is async (`await render/renderHook/act`); the missing-provider throw is asserted with `render` of a probe component because `renderHook` swallows render errors. Mocks are cleared in `beforeEach` since the jest setup's AccessibilityInfo mocks are shared across tests.

## Verification
`npx tsc --noEmit` clean; eslint 0 errors; jest for src/state, src/shell/backHistory, src/shell/layout and src/shell/__tests__ all pass.

## Known Stubs
None.

## Self-Check: PASSED
