---
phase: 09-tiers-onboarding
plan: 20
subsystem: household / plans
tags: [invites, approval, switch-rule, leave, solo, plan-line]
requires: [09-04, 09-10, 09-14, 09-16]
provides: [ApprovePlanScreen, MoveToSoloSheet, useChangePlan, redeemInvite store-country argument, cancelJoinRequest, fetchJoinRequest, LeaveScreen mode solo/own]
affects: [09-19 (opens MoveToSoloSheet and the approval route from notices), 09-21, 09-25]
key-files:
  created:
    - src/features/household/approve/ApprovePlanScreen.tsx
    - app/(app)/household/approve.tsx
    - src/features/plans/MoveToSoloSheet.tsx
    - src/features/plans/useChangePlan.ts
    - src/features/household/__tests__/planInviteFlows.test.tsx
    - src/features/household/__tests__/planLeaveFlows.test.tsx
  modified:
    - src/db/householdInvites.ts
    - src/features/household/InviteSheet.tsx
    - src/features/household/join/JoinScreen.tsx
    - src/features/household/leave/LeaveScreen.tsx
    - app/(app)/household/leave.tsx
    - src/features/household/HouseholdHomeScreen.tsx
    - src/features/plans/usePurchaseFlow.ts
    - src/i18n/locales/household/join.ts
    - tests: InviteSheet, JoinScreen, LeaveScreen, HouseholdHomeScreen
requirements-completed: [TIER-06, TIER-07]
completed: 2026-11-19
---

# Phase 9 Plan 20: Household plan flows Summary

Invites, approvals, joins, leaving and the household plan line now follow the plan: a Solo payer changes plan before the first invite, an invitee past the plan size waits for the payer, a refused switch shows the open date, and leaving can be combined with a no-trial Solo purchase.

## What was built
- `useChangePlan` (plans): loads store offers, works out timing with `changeRule`, runs the change through `usePurchaseFlow`; `previewChange` is pure. Shared by the invite confirm, the approval screen and MoveToSoloSheet.
- InviteSheet: Solo payer sees the D-20 confirm (store prices, "New plan: Duo, 2 people", "Takes effect"), "Change to Duo" / "Keep Solo". The invite is created only after the server plan shows room (the `soloPayer` condition clears when plan_state shows size 2). Solo trial uses the "trial continues" wording. Locked: the LockedSheet "Inviting someone needs a plan" opens and the sheet closes. Full for the plan: "{Plan} holds {n} people." with See plans (payer) or "Ask {payer} to change the plan." The invite is still made (invites past the size go to approval).
- JoinScreen: `storefrontCountry()` read at join time and passed to `redeem_invite`, never stored or shown; `needs_approval` shows the waiting state; `switch_rule` shows the soft WarningCard with the open date, "Contact support" (mailto) and no country text.
- ApprovePlanScreen at `/household/approve?request=`: plan now / after, both store prices, timing (now or renewal date), the D-17 trial lines, Approve and change plan, Cancel invite (`cancel_join_request`), Decide later.
- LeaveScreen: member and payer plan lines, "Continue on Solo" link; `mode` param: `solo` opens "Leave and continue on Solo" (leave, then Solo no-trial purchase, then wait for the server; a failed or cancelled purchase goes to the lock explainer); `own` ("Start your own plan", owner answer Q3) shows the short sheet first.
- MoveToSoloSheet: other members present gives "To move to Solo, remove other members first." with See members; otherwise renewal-timed Solo with "Move to Solo" / "Keep my plan" (accent, not danger).
- HouseholdHomeScreen: plan line, Covered badge, owner-not-payer line, plan-full line; the fixed cap of six no longer applies while a plan covers the home.
- `usePurchaseFlow.start` now returns `'submitted' | 'cancelled' | 'failed'` (additive).

## Deviations from Plan
1. [Rule 3] Added `useChangePlan.ts` (not in the plan's file list) so three screens share the change logic; added a return value to `usePurchaseFlow.start` so LeaveScreen can tell a failed purchase from a waiting one (state changes batch, so observing them missed it).
2. [Rule 3] `leave.tsx` route now reads `?mode=`. The `(app)` layout is not edited: the approve route is picked up by file routing.
3. [Interpretation] The waiting screen names the inviter (previews carry no payer name). The approval screen uses the `name` route param, else "Someone you invited" (new key `household.join.waitingPerson`), because the server does not expose the invitee's name to the payer. A copy row for it and for `household.join.gotIt` ("Close") needs sign-off.
4. [Interpretation] Support link is `mailto:support@fincwin.com` (address from existing docs).
5. [Interpretation] The "invite expired" waiting line (`plans.invite.waiting.expired`) is not wired: the waiting screen does not poll. It needs the invitee side to re-check the request.
6. Existing tests (InviteSheet, JoinScreen, LeaveScreen) gained mocks for the fake store and plan view; JoinScreen's redeem expectation gained the `null` country argument.

## Lock explainer "7 days after leaving ended" (EXTRA from 09-16): not wired, server change needed
`PlanView` has no way to tell "locked because you left a home and your 7 days ended" from a plain lapse: after the 7 days `plan_state()` returns `lapsed`, and `household_leave_log` is revoked from `authenticated` (09-01 core). Not done here: it needs a server change outside this plan. Needed: `plan_state()` returns one extra field, for example `left_at timestamptz` (the caller's newest `household_leave_log.left_at` while they are in a household of one with no covering plan, else null), and `toPlanView` maps it to `PlanView.leftAt`. Then `PlanEndedScreen` shows `lock.explainer.afterSeven` when `status === 'locked' && leftAt !== null` (copy already exists). A device-local flag set at leave time was rejected: it misses a leave made on another device.

## Verification
- tsc: no errors outside `purchasesClient.ts` (react-native-purchases is not in this worktree's node_modules).
- eslint: 0 errors in plan files; the only error is `import/no-unresolved` for `react-native-purchases` in `purchasesClient.ts` (same missing package).
- `npm run depcruise`: no violations.
- jest (planInviteFlows 15 tests, planLeaveFlows, JoinScreen, LeaveScreen, InviteSheet, HouseholdHomeScreen, plansModel, RemoveMemberScreen, pendingInvite): 9 suites, 112 tests pass.
- Many unrelated suites (record, grow, decide, home) fail in this worktree for environment reasons (EnvError, native Google sign-in module, timeouts under load); they do not touch these files.

## Known Stubs
None.

## Threat mitigations
T-09-69: the UI only shows the waiting state; admission is the server's. T-09-70: store country is a local variable passed to the RPC; grep gate clean (no storeCountry with setItem/AsyncStorage/upsert) and the switch-rule text names no country. T-09-71: the approval screen shows both prices and now/renewal before the store sheet opens.

## Commits
- a15c5b77 feat(09-20): invite confirm, join waiting, switch-rule refusal and payer approval
- (task 2) feat(09-20): leave lines, Leave and continue on Solo, Move to Solo, household plan line

## Self-Check: PASSED
All created files exist; both task commits are on the branch.
