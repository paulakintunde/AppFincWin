---
phase: 09-tiers-onboarding
plan: 22
subsystem: levels
tags: [features-screen, offers, holds-data, tiers]
requires: [09-12, 09-13]
provides: [FeaturesScreen, FeatureRow, OfferCard, OfferSlot, canShowOffer, pickOffer, deriveHolds, fetchHoldsFlags]
affects: [09-15]
requirements: [TIER-02, TIER-03, TIER-05, TIER-06, ANL-08]
key-files:
  created:
    - app/(app)/features.tsx
    - src/features/levels/FeaturesScreen.tsx
    - src/features/levels/components/FeatureRow.tsx
    - src/features/levels/OfferCard.tsx
    - src/features/levels/OfferSlot.tsx
    - src/features/levels/offers.ts
    - src/features/levels/offerTriggers.ts
    - src/features/levels/offerStore.ts
    - src/features/levels/useChangeFeatureSwitch.ts
    - src/features/levels/holdsDataModel.ts
    - src/db/holdsData.ts
    - src/data/queries/holdsFlags.ts
  modified:
    - app/(app)/_layout.tsx
    - src/features/home/HomeScreen.tsx
    - src/features/levels/useHoldsData.ts
    - src/data/keys.ts
metrics:
  tasks: 2 plus the holds-data handover
  completed: 2026-11-19
---

# Phase 9 Plan 22: You > Features and in-context offers Summary

You > Features lists every built feature by area with a switch that writes at once, and Home carries at most one inline offer a week; the 11 holds-data probes left unsourced by 09-13 now all have a real source.

## Commits

| Part | Commit | Notes |
|------|--------|-------|
| Holds-data handover | f3dafecc | 11 probes sourced, `UNSOURCED` now empty, pure `deriveHolds` |
| Task 1: offer cadence, triggers, store | a067d6ce | 29 tests |
| Task 2: Features screen, rows, offer card and slot, Home placement | 31381a2e | 8 screen tests |

## Holds-data sources (D-34)

Seven read caches other screens already fill, no new fetch: `categoryCaps` (a live category with `monthly_cap`), `goalContributions` (a live goal with a monthly amount), `debtPlan` (a live debt with `payoff_extra`, `payoff_order` or `extra_series_id`), `categoryDefaultSplits` (`useSplitDefaults`, a row with a category ref), `sharedAccounts` (a live account with `is_shared`), `settlements` (`useSettlements`), `refundLinks` (the existing `queryKeys.refundLinks` read).
Four use one new light read, `fetchHoldsFlags` (`src/db/holdsData.ts`, limit 1 per probe against `transactions_active` and `import_profiles`, under the transactions key root so a write refreshes it): `transfers` (`transfer_id` set), `importedLines` (`import_batch_id` set, or a saved import layout), `weightSplits` and `amountSplits` (`is_shared` with `split_rule` weight or amount). No server change was needed, so none stays unsourced. RLS scopes every read; `engine/` is untouched.
Tests (`holdsData.test.ts`, 60+ cases) prove for each probe that a record flips it, that nothing loaded answers true, and that the feature is shown and fixed on at level 1.

## Decisions and notes

- Two probes are proxies for the map's wording, not exact: "goal contribution" is read as a goal with a monthly amount (the plan writes the repeating line), and "debt plan" as the plan fields on a debt. Both over-show rather than hide.
- Offer body uses `features.offer.body` with `what` set to the feature's existing one-line sub, first letter lowered. Some read stiffly ("Savings goals a target, a monthly amount and a date."). No new copy keys were added because `plansCopy.test.ts` rejects unsigned `features.*` keys; a signed `what` line per offered feature is a sign-off item.
- An offer shown this session is latched until answered (a module map), since showing it uses up the week and would otherwise make it vanish on the next render.
- Level, plan and household checks come straight from `useAllFeatureAccess`; a switch above the level works (owner Q6), only plan and household disable it.
- "Your level" chip is a non-pressable `Chip` as the spec names it.
- Disabled rows use ToggleRow's 0.5 opacity; they stay focusable and the reason is in the spoken label.
- Payment-notice day is read from `usePlanState` (grace, or a trial ending within 3 days), as the plan said, not from 09-19.
- The You > Features row itself is 09-15's job; this plan adds the route and screen only (`/features`, registered in `app/(app)/_layout.tsx`).

## Deviations from Plan

**1. [Rule 3 - Blocking] HomeScreen.test.tsx** now mocks `OfferSlot` and asserts its place between the coming-up and accounts cards.
**2. [Rule 2] `import_profiles`** added to the Import probe because the signed map says "import profile or imported line".
**3. [Scope] No OfferSlot component test.** Its rules are covered purely (`offers.test.ts`); a render test was left out for time. Worth adding at the wave-end check.

## Verification

- jest: `src/features/levels` (7 suites, 137 tests), HomeScreen (11), `src/db/__tests__/holdsData.test.ts` all pass.
- `tsc --noEmit`: clean apart from the missing `react-native-purchases` package in this worktree's node_modules (not caused by this plan).
- eslint on changed files: no errors (only existing fast-check warnings in older tests). `npm run depcruise`: no violations.
- Acceptance greps: `feature_switch_changed` in `useChangeFeatureSwitch.ts` (called by the row), `<OfferSlot` in HomeScreen, no `Modal`/`Alert.alert` in the offer files, `7 * DAY_MS` and `30 * DAY_MS` in `offers.ts`.

## Known Stubs

None.

## Threat Flags

None. T-09-75: locked rows are disabled (plan reason) and the server lock still refuses writes. T-09-76: triggers read only the person's cached lines; the event carries the feature id only, and only with consent.

## Self-Check: PASSED
