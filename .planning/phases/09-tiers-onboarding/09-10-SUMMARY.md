---
phase: 09-tiers-onboarding
plan: 10
subsystem: plans
tags: [revenuecat, plan-state, realtime, tanstack-query]
requires: [09-02 plan_state rpc, 09-07 plan-refresh function]
provides: [usePlanState, purchasesClient seam, catalog change rules, PlanHost, plan routes]
affects: [09-13..09-24]
tech-stack:
  added: ["react-native-purchases 10.16.0 (exact pin)"]
key-files:
  created:
    - src/features/plans/types.ts
    - src/db/plans.ts
    - src/data/queries/plan.ts
    - src/features/plans/usePlanState.ts
    - src/features/plans/store/purchasesClient.ts
    - src/features/plans/store/catalog.ts
    - src/features/plans/store/fakeStore.ts
    - src/features/plans/PlanHost.tsx
    - src/features/plans/routes.ts
    - src/features/plans/__tests__/usePlanState.test.ts
    - src/features/plans/__tests__/catalog.test.ts
    - src/features/plans/__tests__/purchasesPin.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/data/keys.ts
    - app/(app)/_layout.tsx
    - src/features/record/__tests__/routes.test.tsx
    - src/shell/tabBar/__tests__/tabsLayoutStable.test.tsx
    - src/shell/__tests__/shellNavigation.test.tsx
decisions:
  - "usePlanState with no cached value returns loading true, writable false (never locked on a guess)"
  - "changeRule always carries googleMode (iOS callers ignore it); same-plan period change on Apple is renewal"
  - "In-trial upgrade into a plan with no trial (Household, Extended) is now at full price; between Solo and Duo the trial continues"
metrics:
  tasks: 3/3
  commits: [cb5e4827, a318c72a, 7df23423]
---

# Phase 9 Plan 10: Plan state, purchases seam and PlanHost Summary

One server-authoritative plan view (`usePlanState`), the single `react-native-purchases` 10.16.0 import behind `purchasesClient`, a pure change-rule catalog, and an app-wide `PlanHost` for identity, Realtime and refresh.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Types, db/query, usePlanState | cb5e4827 | 8 server states map to 6 statuses; writable always from the server |
| 2 SDK pin, client, catalog, fake | a318c72a | Pinned 10.16.0; one importer; matrix tested |
| 3 PlanHost, routes, layout mount | 7df23423 | logIn per user, household_plans channel with removeChannel, 60 s foreground refresh, `requestPlanRefresh({force})` |

## Verification

- Plan tests (usePlanState, catalog, purchasesPin) pass: 26 tests. The three layout wiring tests also pass (51 tests across 6 suites).
- `tsc --noEmit` clean, `npm run depcruise` clean, eslint 0 errors (1 `import/first` warning in usePlanState.test.ts from the hoisted `jest.mock`).
- Full coverage suite not run, per instruction.

## Deviations from Plan

**1. [Rule 3 - Blocking] Layout wiring tests mocked PlanHost.** Three existing tests render the (app) layout and already stand `HouseholdRealtimeHost` in; they now stand `PlanHost` in too, so they do not need the query client and Supabase. Files: routes.test.tsx, tabsLayoutStable.test.tsx, shellNavigation.test.tsx. Commit 7df23423.

**2. [Interpretation] Change-rule gaps.** The plan matrix did not cover year to month on the same plan (Android: renewal, DEFERRED), a paid upgrade that also changes period (full price now), or a trial upgrade into Household or Extended (taken as the Duo to Household case: now, full price). Recorded in `catalog.ts` and tested.

**3. [Interpretation] `purchasesApiKey()` added** to the client (and fake) as an extra export so PlanHost reads the platform key without touching the SDK. `captureError` area is `'unknown'` because `ErrorArea` has no purchases area.

## Known Stubs

None. `loadOffers` is empty and purchase calls report a not-charged failure until a RevenueCat key is set in `EXPO_PUBLIC_REVENUECAT_*_KEY`; this is by design (store-error state).

## Notes for later plans

- The SDK was installed but never exercised against a device; `purchasesClient.ts` is verified by type check only. Replacement mode, trial detection (`freePhase` on Android, zero-price `introPrice` on iOS) and error-code mapping need a device pass once RevenueCat products exist.
- No `config.toml`, remote Supabase or EAS commands were run.

## Self-Check: PASSED

All created files exist; commits cb5e4827, a318c72a, 7df23423 present on phase/09-tiers-onboarding.
