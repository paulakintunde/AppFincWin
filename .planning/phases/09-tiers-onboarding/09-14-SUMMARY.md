---
phase: 09-tiers-onboarding
plan: 14
subsystem: plans
tags: [paywall, plans-screen, disclosure, purchase-flow]
requires: [09-10, 09-12]
provides: [PlansScreen, plansModel, usePurchaseFlow, DisclosureBlock, PlanCard, PeriodToggle, plans route]
affects: [09-15 Subscription (reuses DisclosureBlock), later lock and invite plans]
key-files:
  created:
    - app/(app)/plans.tsx
    - src/features/plans/plansModel.ts
    - src/features/plans/usePurchaseFlow.ts
    - src/features/plans/PlansScreen.tsx
    - src/features/plans/formatPlanDate.ts
    - src/features/plans/legalLinks.ts
    - src/features/plans/components/PlanCard.tsx
    - src/features/plans/components/PeriodToggle.tsx
    - src/features/plans/components/DisclosureBlock.tsx
    - src/features/plans/components/metaRole.ts
    - src/features/plans/__tests__/plansModel.test.ts
    - src/features/plans/__tests__/PlansScreen.test.tsx
decisions:
  - "Lock lifts only when plan_state says covered; a change that starts at renewal finishes once the forced refresh returns, because the server still shows the old plan"
  - "Terms and privacy URLs are https://www.fincwin.com/terms and /privacy (no constants existed; both answer 200 per docs/enrolment/website-audit.md)"
metrics:
  tasks: 2/2
  commits: [feat(09-14) model+flow, feat(09-14) screen]
---

# Phase 9 Plan 14: Plans screen (paywall) Summary

The Plans screen per UI-SPEC section 5: Yearly selected on open, plans that fit the household, store-localised prices only, always-visible disclosure block with the exact pledge, pinned purchase button, Restore purchases in every state, and a purchase flow that waits for the server before the lock lifts.

## Verification
- `npx jest src/features/plans`: 5 suites, 57 tests pass (24 in plansModel.test.ts incl. usePurchaseFlow, 7 in PlansScreen.test.tsx), all through the fake store.
- `tsc --noEmit`: no errors in plan files. Remaining errors are only in `store/purchasesClient.ts` (react-native-purchases not installed in this worktree's node_modules; the same cause makes eslint report `import/no-unresolved` on that file).
- eslint: 0 errors in plan files; `npm run depcruise`: no violations.
- Greps: no price literals and no hex colours in plan `.tsx` files.

## Deviations from Plan
1. [Rule 3] No `meta` text role exists in `textRole`; added `components/metaRole.ts` (body role at `fontSize.meta`, same derivation as StatusBadge).
2. [Rule 3] The existing `ChoiceCard` selects with an ink fill, not an accent ring, so `PlanCard` is its own radio Pressable (accent ring and `RadioDot`, `shadows.card`), as UI-SPEC requires.
3. [Rule 3] `WarningCard` has title/value/body props and `hard|soft` tones; the spec's "tight" amber card uses tone `soft` with an empty value.
4. [Rule 3] The plan named `plans.paywall.states.restoreNothing` and `plans.member.alreadyCovered`; the signed keys are `states.restoreNone` and `plans.member.title` ("Your home already has a plan"), which are used. No new copy keys added.
5. [Interpretation] No signed copy exists for "trial continues" (Solo to Duo in trial); the card line and confirm use `changeConfirm.now` ("This change starts now."). Needs a wording row if the owner wants trial-specific text.
6. [Interpretation] `{{period}}` in the disclosure lines is passed as the English word month or year from the model; no signed period-word key exists. Localise when other languages arrive.
7. [Interpretation] Heading rule: trial heading only at `first_run` with a trial available (per the plan behaviour list), "Choose a plan" otherwise, even if a trial is available in change mode.
8. `usePurchaseFlow` state `done` is derived (covered by server) rather than set from an effect, to satisfy the react-hooks lint rules.
9. Task 2 acceptance grep for `$[0-9]` covers `.tsx` non-test files only; the test file asserts store strings through the fake store.

## Known Stubs
None. Offers are empty until RevenueCat keys exist (09-10), which produces the store-error state by design. "See members" calls `router.push('/household')` from the route; no Phase 8 route constant was imported.

## Notes
- Device pass still needed for the real store sheet, replacement mode and Ask to Buy ('pending' outcome is treated as waiting for the server).
- DisclosureBlock takes `DisclosureLine[]` so 09-15 can reuse it with its own lines.

## Self-Check: PASSED
All files above exist and both task commits are present on the branch.
