---
phase: 03-shell
plan: 25
subsystem: shell
tags: [i18n, tokens, navigation, gap-closure]
requires: []
provides:
  - gap-closure copy keys (home.state, home.month.emptyPast, accounts.compact, activity.unpaidBanner, activity.projection)
  - PRESSED_OPACITY, ACCENT_TINT_OPACITY, FAB_CLEARANCE
  - monthRefreshKeys, pushOnce, SyncProblemLine inset prop
affects: [03-26..03-37]
key-files:
  modified:
    - src/i18n/locales/en.ts
    - src/shell/__tests__/shellCopy.test.ts
    - src/theme/layout.ts
    - src/theme/tokens.ts
    - src/shell/fab/useShellPositions.ts
    - src/shell/header/SyncProblemLine.tsx
  created:
    - src/features/record/activity/refreshKeys.ts
    - src/shell/navigation/pushOnce.ts
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 25: Wave-1 shared contracts Summary

Catalogue strings, two opacity tokens, FAB_CLEARANCE, shared refresh keys, a 600 ms push guard and a SyncProblemLine inset prop are in place for the later gap plans.

## Commits
- 18d19b4: catalogue (Home says "Expected", five unused keys removed, new strings, voice test extended)
- d33ef89: tokens, FAB_CLEARANCE (82), monthRefreshKeys, pushOnce, SyncProblemLine inset, tests

## Deviations from Plan
- syncProblem test asserts the default inset against `space.screenH` (22) rather than a literal 16; the plan's 16 was wrong about the token value. No source change.
- No change to copyStatus.ts: activity and accounts are already covered as whole namespaces; home is not in the draft list.

## Verification
- Jest on touched suites passed (i18n catalogue, shellCopy, shell header/fab/navigation, refreshKeys, noRawColours); depcruise clean; eslint clean.
- tsc reports only the known environmental `expo-blur` error in TabBar.tsx.

## Known Stubs
None.

## Self-Check: PASSED
