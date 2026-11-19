---
phase: 09-tiers-onboarding
plan: 15
subsystem: plans/you
tags: [subscription, free-help, delete-account, you-rows]
requires: [09-10, 09-12, 09-13, 09-14, 09-16]
provides: [SubscriptionScreen, subscriptionModel, PlanStatusCard, SubscriptionNoticeSlot, FreeHelpScreen, PlanYouRows]
affects: [09-18 (fills SubscriptionNoticeSlot, builds the export route), 09-20/09-21 (leave as Solo screen)]
key-files:
  created:
    - src/features/plans/subscriptionModel.ts
    - src/features/plans/SubscriptionScreen.tsx
    - src/features/plans/components/PlanStatusCard.tsx
    - src/features/plans/FreeHelpScreen.tsx
    - src/features/you/components/PlanYouRows.tsx
    - app/(app)/subscription.tsx
    - app/(app)/free-help.tsx
    - src/features/plans/__tests__/subscriptionModel.test.ts
    - src/features/plans/__tests__/SubscriptionScreen.test.tsx
    - src/features/you/__tests__/FreeHelpYouRow.test.tsx
  modified:
    - src/features/you/YouScreen.tsx
    - src/features/you/DeleteAccountScreen.tsx
    - src/features/you/components/youRowIcons.ts
    - src/features/you/__tests__/YouScreen.test.tsx
    - src/features/you/__tests__/DeleteAccountScreen.test.tsx
metrics:
  tasks: 2/2
  commits: [6a93f439, fe91b851]
requirements: [TIER-10, TIER-08, TIER-07]
---

# Phase 9 Plan 15: Subscription, Free help and delete billing warning Summary

You > Subscription for every variant (payer on trial or active, member of a covered home, tester, owner, no plan, locked), a Free help screen that never reads plan state, four new You rows (Subscription, Features, Free help, Export your data), and the D-23 billing warning on Delete account.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Model, screen, status card, route | 6a93f439 | Manage subscription first row for the payer, opens the store page via `openManageSubscription()`; trial end with date, time and zone abbreviation in the person's timezone; first charge from the store offer ("..." while loading); member card with own-plan ConfirmSheet leading to `/household/leave` with `mode: 'solo'` |
| 2 You rows, Free help, delete warning | fe91b851 | Rows in the signed order; Free help lists the region entry else every entry, https only; Delete shows "Billing keeps going" with the exact D-23 sentence and a Manage link when the payer holds an active store plan; confirm never disabled by plan state |

## Verification
- Jest (run per file group): subscriptionModel (9), SubscriptionScreen (8), YouScreen (all existing plus 5 new), FreeHelpYouRow (3), DeleteAccountScreen (existing plus 4 new) all pass. Other `src/features/you` suites passed in an earlier run; one unrelated suite (HomeCurrencyChangeSheet) hit the 5 s default timeout while three jobs shared the machine and was not rerun.
- `tsc --noEmit`: only the four known errors in `store/purchasesClient.ts` (react-native-purchases missing from the junctioned node_modules).
- eslint: 0 errors (4 warnings, the same `import/first` and `require` patterns as existing tests).
- `npm run depcruise`: no violations.
- Greps: no `usePlanState` and no "advice" in FreeHelpScreen.tsx; all four hrefs present in the You rows.

## Deviations from Plan
1. [Interpretation] You rows live in a new `src/features/you/components/PlanYouRows.tsx` (SubscriptionYouRow, FeaturesYouRow, FreeHelpYouRow, ExportYouRow) instead of inline in YouScreen, so FreeHelpYouRow sits in a file the test can render with `usePlanState` throwing. YouScreen's own `grep` for the four hrefs still matches.
2. [Interpretation] The "Ends {date}. Not renewing" row is a full sentence with no label (`fullLine` on the model row), because the signed copy has no "Ends" label.
3. [Interpretation] Tester and owner status cards show the badge only (no title), since a "Free access" title beside a "Free access" badge would read twice.
4. [Interpretation] Plan period words in "{price} a {period}" are the English words month/year from the model, the same stopgap as 09-14 (no signed period-word key).
5. [Rule 3] Free help reuses `decide.screens.answer.help.*` copy (group title, link a11y, "not paid by these services" note) and the typed FREE_HELP table; no new copy keys.
6. [Interpretation] Test dates use midday UTC and Platform.OS defaults to iOS in jest (App Store line); the Google Play line is covered in the model test.
7. Features sublabel reads level 4 ("Everything") while the setup row is unknown, matching `useFeatureAccess`.

## Known Stubs
- `SubscriptionNoticeSlot` returns null by design; 09-18 replaces its body.
- The "Export your data" row pushes `/export`, built by 09-18; until then the route does not exist.
- The leave-as-Solo screen (`/household/leave` with `mode: 'solo'`) is changed by 09-20/09-21; the push target is in place.

## Self-Check: PASSED
All files above exist; commits 6a93f439 and fe91b851 are on the branch. STATE.md and ROADMAP.md untouched.
