---
phase: 02-record
plan: 24
subsystem: ui
tags: [react-native, accounts, standing, overdraft, credit-limit]
requires: [02-14, 02-17, 02-19, 02-20, 02-22, 02-37]
provides:
  - AccountSheet (create/edit/archive, limits, opening-balance sign control)
  - AccountBalanceBlock (balance, standing line, other currencies, still to come, approximate home figure)
  - AccountsScreen, AccountDetailScreen (Import statement entry point)
  - standingText (pure Standing -> copy key mapping)
key-files:
  created:
    - src/features/record/accounts/standingText.ts
    - src/features/record/accounts/AccountSheet.tsx
    - src/features/record/accounts/AccountBalanceBlock.tsx
    - src/features/record/accounts/AccountsScreen.tsx
    - src/features/record/accounts/AccountDetailScreen.tsx
    - src/features/record/accounts/__tests__/standingText.test.ts
    - src/features/record/accounts/__tests__/accounts.test.tsx
requirements-completed: [REC-08, ANL-05, REC-09, REC-17]
completed: 2026-10-06
---

# Phase 2 Plan 24: Accounts screens Summary

Account list, detail and create/edit sheet with per-account balances, an engine-driven standing sentence on every account, optional overdraft/credit limits, and a defaulted sign control so negative opening balances never need a typed minus.

## Commits
- 77e00e1 test: failing standingText tests (RED, confirmed module-not-found)
- 80fba48 feat: standingText, AccountSheet, AccountBalanceBlock
- dc44867 feat: AccountsScreen, AccountDetailScreen, sheet/block/screen tests

## Behaviour
- Sheet: unsigned strict parser; sign chips per kind (In credit/Overdrawn for cash, current, savings, investment, other; I owe this / I'm in credit for cards; loan has "Amount owed", no control, stored negative). Overdraft limit for current/savings, credit limit for cards, blank = null, only the relevant field is sent. Overdrawn 240.00 with a 500.00 overdraft saves -24000 / 50000 with no warning copy.
- Edit: currency read-only with the fixed-currency note; only changed fields patched; Archive/Restore is an edit with undo.
- Block: standing line in Label role with the sentence as accessibility label; `warn1` only for overdrawn-beyond and over-limit; a negative balance is plain ink unless standing is null (then `danger`). Balances go through `useMoneyFormatter`, never Number()/parseFloat on strings.
- `account_created` fires with context `onboarding` or `later`.

## Review follow-ups applied
- Item 7: `useEditAccount().edit` returns a boolean; the toast carries `stepId` only when it is true, otherwise `null` (tested). Detail-screen Mark paid passes the hook's possibly-null step id through.
- Items 2/3 live inside the 02-17 hooks (expected version is passed from the cached row).

## Deviations from Plan
- **[Process] TDD order.** Only standingText had a genuine RED run. The sheet, block and screen tests were written after the components and run GREEN only (one fix pass for three test-side mistakes: ambiguous text matchers and a missing GBP rate in the FX mock).
- **[Rule 1] Typed i18n.** A union of copy keys defeats the typed `t()` overloads, so `AccountBalanceBlock` calls `t` through a narrow cast; `StandingKey` keeps the key set closed.
- **Overflow copy.** The plan asks for "the unconverted meta copy" on overflow, but the only such key (`activity.totals.unconverted`) reads "waiting for a rate", which would be wrong for a too-large balance. The block shows an em dash with the "Balance now" accessibility label and nothing numeric. A dedicated copy line would need a user copy decision.
- Plan lists `useAccountBalances(...)` as returning string balances in the brief; the 02-14 hook returns numbers (BigInt-summed upstream, overflow flagged), so no string handling was needed.
- Acceptance grep for the four sign keys returns 2 by line count (two keys per line); `grep -o` finds all 4.
- Account detail uses the current month's lines only (as the plan states), via `filterRows` with `accountIds`.

## Known Stubs
None. Navigation chrome is left to Phase 3 as planned.

## Verification
`npx jest src/features/record/accounts` 27/27 passing; `npm run typecheck`, `npm run depcruise` and `npx eslint src/features/record/accounts` clean.

## Self-Check: PASSED
