---
phase: 09-tiers-onboarding
plan: 17
subsystem: plans/lock-ui
tags: [write-gate, lock, decide-entitlements, d-04, read-only]
requires: [09-16]
provides: [gated write entry points, canStartDecide, DECIDE_PARTS, SAFETY_PARTS, LockedLabel, Pill locked prop]
affects: [09-18, 09-20]
key-files:
  created:
    - src/features/plans/components/LockedLabel.tsx
    - src/features/plans/__tests__/writeGateWiring.test.tsx
  modified:
    - src/ui/Pill.tsx
    - src/shell/fab/FabQuickMenu.tsx
    - src/features/record/entry/ShellEntryHost.tsx
    - src/features/decide/DecideShellHost.tsx
    - src/features/home/QuickActions.tsx
    - src/features/decide/screens/home/DecideHome.tsx
    - src/features/decide/screens/home/CheckCard.tsx
    - src/features/record/activity/TransactionDetailSheet.tsx
    - src/features/household/settle/SettleUpSheet.tsx
    - src/features/grow/home/GoalsSegment.tsx
    - src/features/grow/home/GrowHome.tsx
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/investing/InvestingSegment.tsx
    - src/features/record/accounts/AccountsScreen.tsx
    - src/features/decide/entitlements.ts
    - src/features/decide/__tests__/entitlements.test.ts
    - src/features/decide/screens/past/DecisionDetailScreen.tsx
    - src/features/decide/screens/past/PastDecisionsScreen.tsx
    - .planning/phases/05-decide-ui/05-CONTEXT.md
    - .planning/research/DECIDE-FIX-PLAN.md
decisions:
  - "Quick-menu entries are gated where the handler is registered (ShellEntryHost, DecideShellHost), not in FabQuickMenu, so the FAB, You > Add and the screen-reader actions are all covered by one gate each"
  - "Pill gains an optional locked prop (pinLock glyph before the label) so every pill-shaped write control keeps its place and shows the mark"
requirements: [TIER-09, TIER-02]
---

# Phase 9 Plan 17: Lock on every write control Summary

Every main write control (add, import, new Decide check, edit and delete, settle up, Grow add goal, debt and holding, add account) keeps its place when the plan is read-only, carries a pinLock mark and a spoken "needs a plan", and opens the 09-16 sheet that names the tapped action. Decide's entitlements are rewritten to D-04: one paid entitlement and a lock, with no per-part switches.

## Tasks

| Task | Result |
|------|--------|
| 1 Gate the write entry points (441c3d1e) | useWriteGate wired into the entry points below; one wiring test file |
| 2 D-04 entitlements, saved-answer line, decision notes (a17e825d) | entitlements.ts rewritten; journal gate removed; locked detail shows "Saved answer. Not recalculated while read-only."; D-04 recorded in 05-CONTEXT D-17 and DECIDE-FIX-PLAN APP-18 (both mentions) |

Entry points gated: addTransaction (FAB default and quick actions Add expense, Add income, Transfer; Home Add tile), importStatement (quick menu, Home Import tile), newDecideCheck (quick menu, DecideHome Check it pill), editRecord (transaction detail: status action, Edit, Clone, Delete), settleUp (SettleUpSheet CTA), addGoal (GoalsSegment empty-state pill and New goal row, Grow FAB on Goals), addDebt (DebtsSegment add row, Grow FAB on Debts), addHolding (InvestingSegment pill and add row, Grow FAB on Investing), addAccount (AccountsScreen Add pill).

## Deviations from Plan

1. [Rule 2 - design] runQuickActionAfterDismiss.ts is unchanged. The plan gated per id in the dispatcher by passing the gate in from FabQuickMenu; but the FAB default, You > Add (YouScreen), and the screen-reader actions call the registered handler directly and would have bypassed that gate. The gate now sits in ShellEntryHost and DecideShellHost (the registrations), and FabQuickMenu only adds the lock mark and spoken suffix per row. Same behaviour, no bypass.
2. [Rule 3] Added `LockedLabel` (plans/components) and a `locked` prop on `Pill`: the app had no shared lock-mark for pills and text-link rows.
3. [Rule 3] Fourteen existing suites (decideHome, GrowHome, debtScreens, investingScreens, accounts, accountsLife, homeLife, debtsInvestingLife, refundDetailRows, TransactionDetailSheet, createFromDecide, ShellEntryHost, FabQuickMenu, QuickActions) now mock `usePlanState` as writable: the gate imports the plan query, which reads the client env at import and fails in suites that render these screens bare. No assertions changed.
4. [Scope] The addDebt and addHolding gates also cover the Grow FAB; invite stays for 09-20 as planned.

## Verification
- tsc: clean except `react-native-purchases` errors (package missing from the junctioned node_modules, not from this plan).
- eslint on all touched folders: no new problems; the only error is the same unresolved `react-native-purchases` import.
- depcruise: no dependency violations. engine/ untouched.
- jest: about 715 tests across plans, decide home/past, shell/fab, home, record activity/entry/accounts, household, you and grow pass. TransactionSheet.test and recurringControls.test (files not touched here) timed out at 5 to 30 s per test while the machine was loaded; YouScreen.test failed the same way in the loaded run and passes alone (36/36). Those two were not re-run alone.

## Known Stubs
None.

## Threat Flags
None. T-09-61 mitigated (canStartDecide plus the locked Decide entry gate; SAFETY_PARTS documented as always travelling with an answer). T-09-60 accepted as planned: the gate is explanatory, the server decides.

## Self-Check: PASSED
