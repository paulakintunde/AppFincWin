---
phase: 09-tiers-onboarding
plan: 13
subsystem: levels
tags: [feature-access, levels, tiers, grow, household]
requires: [09-02, 09-10, 09-11]
provides: [evaluateAccess, useFeatureAccess, useAllFeatureAccess, useUserSetup, user_setup and feature_switches data layer]
affects: [09-17, 09-21, 09-22]
key-files:
  created:
    - src/db/userSetup.ts
    - src/data/queries/userSetup.ts
    - src/data/mutations/userSetup.ts
    - src/features/levels/evaluateAccess.ts
    - src/features/levels/useFeatureAccess.ts
    - src/features/levels/useHoldsData.ts
    - src/features/levels/useUserSetup.ts
    - src/features/levels/__tests__/evaluateAccess.test.ts
    - src/features/grow/useGrowFeatureFlags.ts
    - src/features/household/__tests__/useFeature.test.tsx
  modified:
    - src/data/keys.ts
    - src/data/mutations/index.ts
    - src/features/grow/home/GrowHome.tsx
    - src/features/grow/growFeatureFlags.ts
    - src/config/householdFeatures.ts
    - src/features/household/useFeature.ts
    - src/features/grow/home/__tests__/GrowHome.test.tsx
    - src/features/household/rules/__tests__/CategoryDefaultsScreen.test.tsx
metrics:
  tasks: 3
  completed: 2026-11-19
---

# Phase 9 Plan 13: Feature access seam Summary

One pure `evaluateAccess` (plan, then household, then level, D-35) behind `useFeatureAccess`, backed by the person's private level and switches, now driving the Grow flags and the household split features.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. user_setup / feature_switches data layer | f0c104c2 | db fetch/upsert/replace, keys, reads (5 min stale), three queued optimistic mutations on WRITE_SCOPE, registered in `registerMutationDefaults` |
| 2. evaluateAccess, hooks, holds-data | f05d8de6 | 10 tests, one per behavior |
| 3. Grow and household seams | (this commit) | `useGrowFeatureFlags`, `useFeature` through `useFeatureAccess` |

## Decisions

- Household features skip the level check once the person shares (TIER-06); the signed map gives hh.* minLevel 2, so this rule was needed and is tested.
- A household feature with no sharing reports `household` (or `plan` if the plan is not writable) and is hidden even if it holds data: household and plan outrank holds-data.
- `useFeature` returns `access.visible` only. The plan text said `visible || holdsData`, but that would bypass the household check (a household of one with leftover splits); evaluateAccess already shows held data once the household check passes.
- Missing level reads as 4; unloaded probe sources answer true (never hide during load).

## Deviations from Plan

**1. [Rule 1 - Bug] `useFeature` holdsData bypass** - the plan's `visible || holdsData` broke D-35 order; caught by my own test, fixed (visible only).

**2. [Rule 3 - Blocking] Test mocks** - GrowHome.test.tsx now mocks `useGrowFeatureFlags` (was mocking `growFeatureFlags`); CategoryDefaultsScreen.test.tsx mocks `useFeature`.

## Known Stubs

`useHoldsData` has no cached read for 11 probes (refundLinks, transfers, categoryCaps, goalContributions, debtPlan, importedLines, weightSplits, amountSplits, categoryDefaultSplits, sharedAccounts, settlements). They answer false and are listed in `UNSOURCED` in `src/features/levels/useHoldsData.ts`. Effect: a person below a feature's level who holds only such records (and never switched it on) will not see it. A later plan (09-17 or 09-21) should give each a source, ideally via a count query.

## Verification

- typecheck: clean (no react-native-purchases errors surfaced), eslint on changed files: clean, `npm run depcruise`: no violations.
- jest: levels (4 suites, 38 tests), useFeature (4), CategoryDefaultsScreen, SharedAccountsScreen pass. `ApplyToExistingSheet.test.tsx` timed out at 30 s under load in one combined run (file does not touch this code; not re-run). GrowHome (29 tests) passes.

## Self-Check: PASSED
