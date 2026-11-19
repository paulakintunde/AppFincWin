---
phase: 09-tiers-onboarding
plan: 19
subsystem: plans/notices
tags: [notices, trial-reminder, double-cover, home, subscription, household-notices]
requires: [09-15, 09-16, 09-18, 09-20]
provides: [planNotices, NOTICE_ORDER, hasPaymentNoticeToday, takeoverToast, syncTrialReminder, useDoubleCover, useChooseDoubleCover, DOUBLE_COVER_KEY, DoubleCoverNotice, PlanNoticeSlot, PlanNoticeList]
affects: [09-22 (hasPaymentNoticeToday available), 09-23, 09-24, 09-25]
key-files:
  created:
    - src/features/plans/notices/planNotices.ts
    - src/features/plans/notices/trialReminder.ts
    - src/features/plans/notices/doubleCover.ts
    - src/features/plans/notices/DoubleCoverNotice.tsx
    - src/features/plans/notices/PlanNoticeSlot.tsx
    - src/features/plans/notices/__tests__/planNotices.test.ts
    - src/features/plans/notices/__tests__/trialReminder.test.ts
    - src/features/plans/notices/__tests__/DoubleCoverNotice.test.tsx
    - src/features/plans/notices/__tests__/PlanNoticeSlot.test.tsx
    - src/features/household/__tests__/noticeText.test.ts
  modified:
    - src/features/home/HomeScreen.tsx
    - src/features/plans/SubscriptionScreen.tsx
    - src/features/plans/PlanHost.tsx
    - src/features/plans/components/NoticeCard.tsx
    - src/features/household/noticeText.ts
    - src/i18n/locales/plans/notices.ts
    - .planning/phases/09-tiers-onboarding/09-WORDING.md
    - src/features/home/__tests__/HomeScreen.test.tsx
    - src/features/plans/__tests__/SubscriptionScreen.test.tsx
decisions:
  - "Home order: lockExplainerPrompt > paymentFailed > payerLeft > memberLeft > payerAfterLeaving > doubleCover > oldPlanRecovered > trialEndsToday > trialEndsSoon > approvalWaiting > offlineSaves > downgradeOffer > testerEnding > existingUser (memberLeft and payerAfterLeaving were unplaced in UI-SPEC; put with the payer-left group)"
  - "Dismissals: 'day' (trial soon, payment failed for members, payer left, member left, payer after leaving, approval) or 'ever' keyed by event id (downgrade offer, old plan recovered, tester ending); stored under fincwin:plan-notice-dismissed, wiped at sign-out"
  - "The double-cover pick runs with networkMode 'always' and no mutation default: tried now, never queued and replayed"
  - "Trial reminder waits for the store price; it is not scheduled with a placeholder price"
metrics:
  tasks: 3/3
  commits: [449041a8, bc9d4d13, f5b40d8e, e692fbd2]
  completed: 2026-11-19
requirements: [TIER-07, TIER-10]
---

# Phase 9 Plan 19: Plan notices, trial reminder and the double-cover choice Summary

Every UI-SPEC section 7 notice now comes from one tested pure model (`planNotices`) and shows on Home (one at a time, above This month), in You > Subscription (all of them) and in the Household notices list (one sentence per plan_* event). A local reminder fires 2 days before a renewing trial ends, and both payers of a doubly covered home can pick which plan stays (Owner P4).

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Model and trial reminder | 449041a8 | `planNotices` (14 ids, `NOTICE_ORDER`), `takeoverToast`, `hasPaymentNoticeToday`, `syncTrialReminder` (never asks permission); 22 + 6 tests |
| 3 Double-cover query, pick, notice | bc9d4d13, f5b40d8e | `useDoubleCover` / `useChooseDoubleCover` / `DOUBLE_COVER_KEY`; `DoubleCoverNotice` with one Keep button per fitting plan, the default line, no dismiss; 7 RNTL tests |
| 2 Home, Subscription, PlanHost, household text | e692fbd2 | `PlanNoticeSlot` on Home above This month, `PlanNoticeList` in `SubscriptionNoticeSlot`, PlanHost reminder sync + tap to Subscription + double-cover refresh on realtime, noticeText for the eight plan kinds; 6 slot tests, 6 noticeText tests |

Task 3 was committed before Task 2 because the slot renders `DoubleCoverNotice`.

## Carried-over items (wave 4)
1. `OfflineSavesNotice` now sits on Home through the slot, at its priority place (after approval waiting, before the downgrade offer). It remains on Subscription through the list.
2. No SQL migration touched. `lock.explainer.afterSeven` / plan_state `left_at` stays deferred; PlanEndedScreen unchanged.

## Verification
- jest `src/features/plans src/features/home src/features/household` plus `plansCopy.test.ts`: 55 suites, 901 tests; one failure (memberNameOnly, D-32) was caused by this plan and fixed in f5b40d8e; the notices folder and memberNameOnly rerun green (44 tests).
- `tsc --noEmit`: only the known `purchasesClient.ts` errors (react-native-purchases missing from the junctioned node_modules).
- eslint on changed files: 0 errors (warnings only: the usual `require` / `import/first` patterns in tests).
- `npm run depcruise`: no violations.
- Acceptance greps all pass (no `requestPermissionsAsync` in trialReminder, `NOTICE_ORDER`, `'doubleCover'` x3, `defaultLine`, `<PlanNoticeSlot`, `syncTrialReminder` and `DOUBLE_COVER_KEY` in PlanHost, 8 plan kinds and `plans.doubleCover.title` in noticeText, both RPC names in doubleCover.ts, 5 `plans.doubleCover.` lines in the notice, no cancel call).

## Deviations from Plan
1. [Rule 3] `NoticeCard` actions gained optional `disabled` and `testID` (additive) so the pick buttons can be held while pending and carry `double-cover-keep-new/old`. No foot slot was added; the default line is appended to the body as the plan said.
2. [Rule 1 / D-32] Payer names on the pick buttons go through `useMemberLabel`, not `useHouseholdMembers` display names (the memberNameOnly guard forbids reading `display_name` outside the resolver). The viewer's own button therefore reads "Keep Household, paid by You".
3. [Rule 1] A fast second tap could send a second pick before the mutation's pending flag arrived; a component `busy` state set in the tap blocks it.
4. [Interpretation] `planNotices` input has extra optional fields beyond the plan's signature: `locale`, `homeName`, `nameOf`, `planNameOf`, `periodWord`, `priceFor`, `inviteeName`. The model stays pure; the slot resolves words.
5. [Interpretation] `plan_recovered_after_takeover` uses `plans.doubleCover.notChosen.*` (per the plan's interfaces block and Owner P4) in both the model and the household list; `plans.notices.oldPlanRecovers.*` is used only for `plan_double_cover` mode `extra`. Task 2's action text said oldPlanRecovers for both, which contradicts the interfaces block.
6. [Interpretation] When a notice's badge word equals its title (trial and payment failed, signed as "Badge and title"), the slot shows it once, as the title.
7. [Interpretation] Dismissible notices that have no "Not now" of their own (trial soon, old plan not needed, tester ending, payer after leaving) get a "Not now" text link under the card, reusing `plans.notices.payerLeft.actions.notNow`.
8. [Interpretation] The household list line for `plan_double_cover` mode `choose` is `plans.doubleCover.body` (it opens with the title sentence); `plan_downgrade_offer` shows its title (the price is not known there); `plan_locked` reuses `lock.bannerHousehold`.
9. [Interpretation] The pick failure toast reuses `grow.common.notSaved` ("Couldn't save that. Nothing was changed."); no new copy. The trial push title reuses `plans.notices.trialReminder.title`; its Android channel is named with `plans.subscription.title`.
10. [Rule 2] Tests written alongside rather than strictly before the code for Task 1 (they passed on first run); Task 3's RNTL test drove the in-flight fix.

## Copy needing owner review
- `plans.notices.paymentFailed.bodyPayer`: "Your payment did not go through. Your home keeps full access until {{date}}." (the signed body is third person and read "You's payment" for the payer)
- `plans.notices.approvalWaiting.actions.review`: "See the request" (approval-waiting notice action)
Both rows are in 09-WORDING.md marked "needs owner review". The plans.doubleCover.* rows were already marked.

## Known Stubs / limits
- `payerAfterLeaving` follows the plan's rule (payer, one member, plan size > 1). A payer who bought Duo and has not invited anyone yet also matches it, and `{{home}}` is the current household's name, not the home that was left: the client has no leave record (household_leave_log is revoked). The same server field proposed for `lock.explainer.afterSeven` (`left_at` in plan_state) would fix both. Deferred with that item.
- The trial reminder tap is handled while the app is running (response listener in PlanHost); a cold start from the tap opens the app without routing to Subscription.
- `hasPaymentNoticeToday` is exported for 09-22; 09-22 already reads plan state itself and was not changed here.

## Left for 09-23 / 09-24 / 09-25
- Server `left_at` in plan_state for `lock.explainer.afterSeven` and a precise `payerAfterLeaving` (needs a migration; parallel CI fixer owns the Phase 9 migrations now).
- Device check of Home with each notice (Pixel / iPhone XR), the trial reminder on a real device, and the pick against the live RPC.
- Owner review of the two new copy rows and the plans.doubleCover.* rows.

## Threat model
T-09-66 (push text has only date and price, data only `{ kind }`), T-09-67 (always-visible end date, 3-day notice, last-day notice that cannot be dismissed, local reminder), T-09-68 (notices name payer and dates only; double-cover state is null for non-payers), T-09-69 (choice shown only to the two payers; server refuses others), T-09-70 (both payers see the choice and default line; not-picked payer gets Manage subscription) are covered.

## Self-Check: PASSED
All created files exist; commits 449041a8, bc9d4d13, f5b40d8e, e692fbd2 are on the branch. STATE.md and ROADMAP.md untouched.
