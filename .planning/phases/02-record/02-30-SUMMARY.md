---
phase: 02-record
plan: 30
subsystem: onboarding
tags: [expo-router, onboarding, analytics, you-screen]
requires: [02-24, 02-26, 02-29, 02-39]
provides: [first-account-gate, setup-screens, you-money-section, activity-landing]
key-files:
  created:
    - src/features/record/setup/firstAccountGate.ts
    - src/features/record/setup/SetupAccountScreen.tsx
    - src/features/record/setup/SetupHistoryScreen.tsx
    - app/(app)/setup/account.tsx
    - app/(app)/setup/history.tsx
    - src/features/record/setup/__tests__/setup.test.tsx
  modified:
    - app/(app)/activity.tsx
    - app/(app)/_layout.tsx
    - app/index.tsx
    - src/features/you/YouScreen.tsx
    - src/features/you/__tests__/YouScreen.test.tsx
    - src/features/record/__tests__/routes.test.tsx
requirements-completed: [REC-09, ANL-05, REC-08, REC-11, REC-07]
completed: 2026-10-06
---

# Phase 2 Plan 30: Record onboarding and entry points Summary

A user with no active account is redirected from Activity to a first-account step, then offered "Bring your history" or "Start fresh"; You gains a Money group linking every Record screen, and Activity is the signed-in landing.

## Commits
- 683ff1d test(02-30): failing setup tests (RED, module not found)
- 3687018 feat(02-30): gate, setup screens, routes, landing
- b9a25df test(02-30): failing YouScreen Money test (RED, "Money" not found)
- GREEN commit for YouScreen: see git log (`feat(02-30): You Money section`)

## Behaviour
- `needsFirstAccount` is pure: false while loading, on error or with no data; true for none or only archived accounts.
- Activity route waits for `useRecordContext().ready` and the accounts read before redirecting to `/setup/account`.
- Setup account: AccountSheet (context `onboarding`) over the heading/body; on save replaces to `/setup/history` with `accountId`.
- Setup history: `onboarding_history_choice` with a single `choice` property; import goes to `/import` with `entry: 'onboarding'` and `accountId`; fresh replaces to `/activity`. No rendered text contains "CSV" (tested).
- You: Money group, Import statement opens `/import` with `entry: 'you'`; no "Import CSV" text.

## Deviations from Plan
- **[Rule 1] Landing location.** `routeDecision.resolveRoute` returns the abstract route `'app'`, not a path; the signed-in destination constant lives in `app/index.tsx` (`APP_HOME_HREF`). Changed that to `/activity`; `routeDecision.ts` and its test are unchanged, so the plan's `grep "'/activity'" routeDecision.ts` criterion does not apply. `/activity` is covered by a test in setup.test.tsx.
- **Setup route navigation** uses `router.replace` (not push) for both onboarding steps so Back does not return to a finished step.
- `routes.test.tsx` gained mocks for the gate hooks because the Activity route now reads them.
- Layout declares `setup/account` and `setup/history` Stack screens.
- Money rows use plain Pressable rows (like the sign-out row) rather than `Row`, to avoid doubled padding inside SettingsGroup.
- YouScreen test: added an `expo-router` mock and the Money test; the first-render case is unchanged. The added import (`expo-router`) is light.
- Under heavy machine load, YouScreen.test.tsx showed intermittent timeouts/failures (credits case, and an unrelated useStatementImport test once); each passes in isolation.
- Review follow-ups: nothing in the list lands in this plan. Analytics carry only enum properties.

## Known Stubs
None.

## Verification
setup.test.tsx 12/12, routes.test.tsx 8/8, `npm run typecheck` and `npm run depcruise` clean, eslint 0 errors (test-style warnings only, matching existing tests).

## Self-Check: PASSED
