---
phase: 03-shell
plan: 30
subsystem: shell
tags: [accounts, home, d-39, gap-closure]
requires: [03-25]
provides:
  - compactBalanceLine, useCompactBalance, compact AccountBalanceBlock
key-files:
  modified:
    - src/features/record/accounts/standingText.ts
    - src/features/record/accounts/AccountBalanceBlock.tsx
    - src/features/record/accounts/AccountsScreen.tsx
    - src/features/home/AccountsCard.tsx
    - src/ui/Chip.tsx
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 3 Plan 30: Compact account rows (G6 / D-39) Summary

Home's Accounts card and the Accounts list now show the balance plus at most one short line ("≈ £585", "Waiting for a rate", "Overdrawn", "Over limit"); the detail screen keeps the full block.

## Commits
- 733240b: compactBalanceLine, useCompactBalance, compact block
- 2448c93: AccountsCard, AccountsScreen, Chip

## What changed
- G6/D-39 on both list surfaces; row a11y labels carry name, kind, figure and short line.
- M1 shadow on outer view with inner clip; M2 spacer removed (padding gapSm inside); M4 cash tile and selected Chip use accent at ACCENT_TINT_OPACITY over fill1; M7 13px gap and weight-500 sub-line; L3 emoji-safe locale upper-cased initial; L12 header role and line4 placeholders; L13 PRESSED_OPACITY; H7 pushOnce; G5 SyncProblemLine on the Accounts list.

## Deviations from Plan
- Existing accounts.test S-WR-14 assertion updated to the compact label (D-39 supersedes the standing sentence); useSyncStatus mocked there because the screen now mounts SyncProblemLine.
- Worktree base was reset to 67902ed per the launch instructions.

## Verification
- jest on home, record/accounts, ui, theme: 345 passed; depcruise clean; eslint 0 errors (pre-existing warnings only); tsc shows only the environmental expo-blur error.

## Known Stubs
None.

## Self-Check: PASSED
