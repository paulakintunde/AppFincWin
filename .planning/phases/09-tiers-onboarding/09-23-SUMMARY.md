---
phase: 09-tiers-onboarding
plan: 23
subsystem: onboarding / routing
tags: [first-run, onboarding-route, consent, partner, rerun, setup-records, features-preview]
requires: [09-14, 09-16, 09-20, 09-21, 09-22]
provides: [firstRunTarget, setupDone, modeFromParam, applyOnboardingRecords, setupRecordId, useSetupRecordsDeps, useFirstRunPending, onboarding route, onboardingHref, featuresPreviewHref, FeaturesScreen preview]
affects: [09-24 (look-around and paywall on Home while status is 'sample'), 09-25]
requirements: [TIER-01, TIER-04, ANL-07]
key-files:
  created:
    - src/features/onboarding/firstRun.ts
    - src/features/onboarding/applyOnboardingRecords.ts
    - src/features/onboarding/useSetupRecordsDeps.ts
    - src/features/onboarding/useFirstRunPending.ts
    - src/db/setupRecords.ts
    - app/(app)/onboarding.tsx
    - src/features/onboarding/__tests__/firstRun.test.ts
    - src/features/onboarding/__tests__/applyOnboardingRecords.test.ts
  modified:
    - app/index.tsx
    - app/(app)/_layout.tsx
    - app/(app)/features.tsx
    - src/features/auth/appHome.ts
    - src/features/plans/routes.ts
    - src/features/plans/LockHost.tsx
    - src/features/household/join/JoinScreen.tsx
    - src/features/levels/FeaturesScreen.tsx
    - src/features/levels/useFeatureAccess.ts
    - src/features/onboarding/OnboardingFlow.tsx
    - src/features/navigation/swipeBackGesture.ts
    - src/data/mutations/growGoals.ts
    - tests: LockHost, JoinScreen, planInviteFlows, FeaturesScreen, shellNavigation, tabsLayoutStable, routes
decisions:
  - "A setup counts as done when completed_at is set OR a level is set (an abandoned partner run lands on Everyday and must not be sent back to the questions)"
  - "Android back on question 1 of a first run signs out (Welcome is the signed-out screen), with the existing pending-writes confirm"
  - "The setup goal is made with locked false, no ready-by date and no monthly record (setup did not ask D-23's question)"
  - "Entry waits at most 4 s for the setup, plan and household reads; then an unread setup goes Home and an unread plan counts as a home of one"
metrics:
  tasks: 2/2
  completed: 2026-11-19
---

# Phase 9 Plan 23: First-run routing and setup records Summary

After sign-in a new person goes to the questions (the partner version if they joined someone else's home), consent is asked inside onboarding instead of by redirect, re-runs come back to Features, and the setup account and goal become real records exactly once when the household is covered.

## Commits

| Task | Commit | Result |
|------|--------|--------|
| 1 firstRunTarget, applyOnboardingRecords, goal id | aa71e821 | pure routing and idempotent records, 24 tests |
| 2 entry, route, consent exemption, partner hand-off, records host, Features preview | 6faf9b8c | wiring plus LockHost, JoinScreen and FeaturesScreen tests |

## What was built

- `firstRunTarget` (pure): pending invite first ('join'), then 'checking' while the setup row loads, 'home' on a read error or a done setup (completed, backfilled existing user, or a level set by an abandoned partner run), `{ onboarding: 'partner' }` when the row says partner or the person is a non-owner in a home of two or more, else `{ onboarding: 'first_run' }`. `setupDone` and `modeFromParam` are shared helpers.
- `app/index.tsx` AppEntry uses it with `useUserSetupQuery`, `usePlanState` (members) and `useHousehold` (owner), and redirects to `/household/join`, `/onboarding?mode=` or Home. Household and plan reads are only waited on when they matter. A 4 s cap stops an offline cold start with nothing cached from leaving the person on a blank screen (T-09-78).
- `app/(app)/onboarding.tsx` renders `OnboardingFlow` with `onFinished` (first run and partner: replace with Home, where 09-24 adds the look-around and paywall while the status is 'sample'; re-run: back, or Features if there is no history), `onExitFirst` (first run: sign out to Welcome through `requestSignOut`, with the existing confirm when writes are pending; partner: Home; re-run: back) and `payerName` from `plan_state` (omitted when the person is the payer). Registered in the app stack with `gestureEnabled: false`, and added to the no-swipe-back list.
- Consent (ANL-07): the app layout skips the `/consent` redirect when `pathname.startsWith('/onboarding')` or while `useFirstRunPending()` (setup read and not done). Only the screen is skipped; `track()` stays consent-gated (T-09-77).
- JoinScreen: after a join, a person with no finished setup saves `partner_version: true` and goes to `/onboarding?mode=partner` (after the "what is shared" card if it shows). A new person who leaves the join screen without joining goes to the first-run questions instead of back.
- Setup records (owner P3): `applyOnboardingRecords` runs from LockHost once per session when the plan is writable, setup is completed, there is an account or goal answer and `records_applied_at` is null. Ids are `setupRecordId(userId, 'account' | 'goal')` (SHA-256, UUID v5 shape). Each add is skipped when `recordExists`, which checks the mutation cache for an unfinished add carrying the id (a paused offline add restored by the persister) and then the server (`src/db/setupRecords.ts`, any row with that id, deleted ones included). `records_applied_at` is written last. A failed lookup adds nothing and retries on the next foreground. The account is `checking` with the answer's name and opening balance in Q2's currency (home currency if skipped). The goal has the answer's name, target and monthly amount, no monthly record. `useSaveGoalPlan` takes an optional `id` (`input.id ?? Crypto.randomUUID()`).
- Features preview: `featuresPreviewHref(level, switches)` opens `/features?preview=1&level=&on=&off=`. The route parses it with `parseFeaturesPreview` (unknown ids and bad levels are dropped), and `FeaturesScreen` shows that level and those switches read-only (`ReadOnlyScope`). It has no "Run setup again", no plan link and no "Set up sharing" link. `useAllFeatureAccess(preview?)` takes the override. The summary's "See what is on" now uses it.

## Deviations from Plan

1. **[Rule 1] Done means completed or levelled.** The plan's rule ("setup null or completedAt null goes to onboarding") would send an abandoned partner, whose setup is Everyday with no completed_at (09-21 `abandon()`), back into the questions on every launch. `setupDone` also accepts a set level.
2. **[Rule 2] Entry wait cap.** The old entry waited only for AsyncStorage. The new one waits for network reads, so it now has a 4 s cap (T-09-78).
3. **[Interpretation] onboarding_started is not tracked by the route.** `useOnboardingFlow` already tracks it once on hydrate, so a second track would double count.
4. **[Interpretation] The partner abandon write is not in the route.** 09-21's flow already saves `{ level: 2, levelSource: 'skipped', partnerVersion: true }` on unmount when a partner leaves unfinished, so the route does not repeat it.
5. **[Rule 2] Swipe-back off for onboarding**, so an edge swipe cannot pop out of the flow (UI-SPEC 3: the flow owns Back).
6. **[Rule 3] Hooks split for testability.** `useSetupRecordsDeps` and `useFirstRunPending` sit in `src/features/onboarding` so LockHost and the layout tests can mock them. The server lookup is in `src/db/setupRecords.ts`, and the supabase client is required lazily (writeClient pattern).
7. **[Interpretation] The pending-mutation scan ignores `error` as well as `success`.** A mutation that failed for good will not run again, so it does not count as an existing record.
8. **[Scope, orchestrator item 3] Features preview mode** added (route param and `FeaturesScreen` prop), as asked.
9. **Test fixes:** the LockHost P3 tests sit above the explainer block, because that block's fire-and-forget storage push overlaps `act()` for any block after it (an existing harness quirk). JoinScreen, planInviteFlows, shellNavigation, tabsLayoutStable and routes tests got setup mocks.
10. **TDD gate:** Task 1's test and implementation went in one commit (`feat`), not separate RED and GREEN commits.

## Copy needing owner review

None. No new copy keys. The re-run toast ("Nothing changed") and the sign-out confirm reuse signed keys.

## Verification

- jest: `src/features/onboarding`, `src/features/household/join`, `planInviteFlows`, `src/features/consent`, `src/features/levels`, `LockHost`, `src/features/navigation`, `src/features/devHarness` gave 23 suites and 329 tests passing. `src/data/mutations` plus the Task 1 tests gave 78 suites and 846 tests passing.
- `shellNavigation` (12 tests) passes when run with dummy local `EXPO_PUBLIC_*` values. Without them, `setup.test`, `routes.test`, `tabsLayoutStable` and `shellNavigation` fail to load with EnvError via `(tabs)/_layout` → LockBanner, which is the known root cause another fixer is handling. With the dummy env, `setup.test` and `routes.test` still fail to load on the native Google sign-in module through AuthProvider (also via `usePlanState`, so this is not new).
- `tsc --noEmit`: clean apart from the known `purchasesClient.ts` errors.
- eslint on the changed files: 0 errors; warnings are only existing `require()` lines in tests. `npm run depcruise`: no violations.
- Acceptance greps: `firstRunTarget(` in app/index.tsx (join first), `startsWith('/onboarding')` in the app layout, `applyOnboardingRecords(` in LockHost, `'partner'` in JoinScreen, `export async function setupRecordId`, `recordExists`, `recordsAppliedAt`/`records_applied_at`, "does not duplicate the account after a kill", `input.id ?? Crypto.randomUUID()`.
- No SQL migration touched; no production access.

## Known Stubs

None.

## Left for 09-24 / 09-25

- 09-24: the look-around and paywall after a first run (Home while status is 'sample'). This route just replaces to Home.
- Device check: Android back on question 1 signs out to Welcome. Confirm on the Pixel that this feels right. Exiting the app is the gentler alternative if the owner prefers it.
- People who signed up after the 09 backfill migration ran but before this build ships have no `user_setup` row, so they will get the questions once. Testers created that way are included.
- A re-run by someone who never had records applied (an existing user) creates the account and goal they type, once. If that is not wanted, re-run answers need a marker.
- The setup goal is made with `locked: false` (D-23 normally asks this). An owner sign-off item.

## Threat Flags

None new. T-09-77: only the redirect is skipped and `track()` stays gated. T-09-78: read errors and slow reads go Home, and every question is skippable. T-09-79: stable ids, a server and queue check before each add, and the marker written last, with kill-between-steps tests.

## Self-Check: PASSED
All created files exist; commits aa71e821 and 6faf9b8c are on the branch.
