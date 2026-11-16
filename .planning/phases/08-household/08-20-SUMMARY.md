---
phase: 08-household
plan: 20
subsystem: household-ui
tags: [household, rules, split-defaults, joint-accounts, ui]
requires: [08-15, 08-16]
provides:
  - ApplyToExistingSheet (the "Change the split?" offer with the exact server count)
  - HouseholdDefaultScreen, CategoryDefaultsScreen (categoryRefOf), SharedAccountsScreen (jointAccountsOf)
  - jointAccounts.ts (fetchJointAccountBalances, useJointAccountBalances, jointBalanceOf, countMemberLinesOnAccount)
  - routes household/split-default, household/category-defaults, household/shared-accounts
  - Joint account row in AccountSheet; `joint?: boolean` on the new-account mode
affects: [08-17, 08-21, 08-25]
key-files:
  created:
    - src/features/household/rules/ApplyToExistingSheet.tsx
    - src/features/household/rules/HouseholdDefaultScreen.tsx
    - src/features/household/rules/CategoryDefaultsScreen.tsx
    - src/features/household/rules/SharedAccountsScreen.tsx
    - src/features/household/rules/jointAccounts.ts
    - app/(app)/household/split-default.tsx
    - app/(app)/household/category-defaults.tsx
    - app/(app)/household/shared-accounts.tsx
    - src/features/household/rules/__tests__/ApplyToExistingSheet.test.tsx
    - src/features/household/rules/__tests__/CategoryDefaultsScreen.test.tsx
    - src/features/household/rules/__tests__/SharedAccountsScreen.test.tsx
  modified:
    - src/features/household/WeightsSheet.tsx
    - src/features/record/accounts/AccountSheet.tsx
    - src/db/transactionSplits.ts
    - src/i18n/locales/household/rules.ts
    - src/features/household/__tests__/WeightsSheet.test.tsx
    - src/features/record/accounts/__tests__/accounts.test.tsx (and accountsLife, accountRate, accountUseRow: two mocks each)
decisions:
  - The offer is shown after the rule is saved (default, category, weights), with the plan's primary labels; "Keep current split" and the toggle off both apply nothing
  - The count is always the server's (count_unsettled_for_rule), which already leaves out lines split by hand and lines split by amount (owner answer 7)
  - Category and household defaults offer Even, By weight, Mine only (household: Even, By weight); the server refuses By amount as a default (`invalid_rule`)
completed: 2026-11-15
---

# Phase 8 Plan 20: Household rules on screen Summary

Any member can set the household default split and a default per category; each change is named by the server, toasts with Undo, and is followed by an offer that states exactly how many unsettled lines it could also apply to. The creator of an account can make it Joint, and a Shared accounts list shows each joint account's full balance.

## Commits
- a65df594: apply-to-existing offer, household default, category defaults, WeightsSheet integration
- 4f324cf3: Joint account row in AccountSheet and the shared accounts list

## What was built
- `ApplyToExistingSheet`: on open calls `countUnsettledForRule`; shows "Also apply to the N unsettled lines" only when N > 0, the "Settled lines never change." note, and the primary label it is given. Toggle on applies through `applyRuleToUnsettled` and toasts the changed count; a refusal keeps the sheet open with a plain line. A failed count shows no offer (the rule itself is already saved).
- `HouseholdDefaultScreen`: Even / By weight (Mine only is not offered), Save default with the stored row version, Undo re-saves the previous rule, then the offer.
- `CategoryDefaultsScreen`: gated by `useFeature('hh.categoryDefaults')`; rows use `CategoryGlyph` + `iconForCategory`; sheet with "Use household default" plus the rule list; ref string is `builtin:<key>` or `custom:<id>` (`categoryRefOf`). Empty note "Using the household split for every category" while none is set.
- `WeightsSheet`: after a successful save the sheet turns into the offer ("Save weights") and closes when it is answered; `onSaved(before)` is still called.
- `AccountSheet`: a "Joint account" ToggleRow for the creator in a household of two or more (and in create mode); writes `is_shared` only, never the overdraft limit or account purpose (05.5 D-10). Turning it off asks the server-side rule first (lines other members made) and shows "Other members have lines on this account, so it stays joint."; the server guard remains the authority. A non-creator sees a Shared badge and a one-line note, no toggle. Tombstone accounts get neither.
- `SharedAccountsScreen`: joint accounts only (`is_shared`, not deleted, never `tombstone_of`), opening balance plus paid lines from `joint_account_balances` in the account's currency, creator name through the resolver, SharedBadge, empty state with "Make a joint account" opening the account sheet with Joint on.

## Verification
- `npx tsc --noEmit`: clean
- eslint on src/features/household, src/features/record/accounts, src/db/transactionSplits.ts, app/(app)/household, household locale: 0 errors (one warning in an untouched file, AccountBalanceBlock.test.tsx)
- jest: src/features/household (13 suites) and src/features/record/accounts (9 suites): 184 tests pass
- No database, no package changes, no pushes.

## Deviations from Plan
1. [Rule 3 - Blocking] `setSplitDefault` in `src/db/transactionSplits.ts` (not in files_modified) now accepts a `null` rule. The plan calls for "Use household default" (rule null on a category), which the server supports (it deletes the row) but the 08-15 wrapper's type refused. One-line type widening, no behaviour change.
2. [Plan wording] "SplitRuleList with four rules" for category defaults: By amount is left out because `set_split_default` refuses it (`invalid_rule`); the lists are Even / By weight / Mine only (household default: Even / By weight).
3. [Rule 3 - Blocking] Four existing AccountSheet test files got two mocks each (household members hook, joint-lines check) because AccountSheet now reads the household's members; no assertion changed.
4. `AccountsScreen` is not in this plan's files, so the Shared badge on account list rows (UI-SPEC 4b) is shown in AccountSheet and in the Shared accounts list only. List-row badge is left for whoever owns AccountsScreen.
5. The weights offer counts with `categoryRef null` as planned; a weight change only affects lines whose rule is By weight, so the server count can include lines under the household default that stay Even. The count is still exactly what the server would change, but it is a count of lines the rule "could" apply to.
6. The Household home Rules card links to the three new routes belong to HouseholdHomeScreen (another agent); this plan only provides the routes. The `(app)/_layout.tsx` stack registration is also not touched here.

## Known Stubs
None.

## Self-Check: PASSED
