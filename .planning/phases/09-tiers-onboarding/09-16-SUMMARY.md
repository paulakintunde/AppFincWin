---
phase: 09-tiers-onboarding
plan: 16
subsystem: plans/lock-ui
tags: [lock, read-only, write-gate, replay, notice-card]
requires: [09-09, 09-10, 09-12]
provides: [useWriteGate, LockedSheetProvider, NoticeCard, PlanLink, LockBanner, PlanEndedScreen, LockHost, formatPlanDate]
affects: [09-17, 09-18, 09-19, 09-23, 09-24]
key-files:
  created:
    - src/features/plans/lockTypes.ts
    - src/features/plans/components/NoticeCard.tsx
    - src/features/plans/LockedSheet.tsx
    - src/features/plans/useWriteGate.tsx
    - src/features/plans/LockBanner.tsx
    - src/features/plans/PlanEndedScreen.tsx
    - src/features/plans/LockHost.tsx
    - src/features/plans/formatPlanDate.ts
    - app/(app)/plan-ended.tsx
    - src/features/plans/__tests__/lockedSheet.test.tsx
    - src/features/plans/__tests__/useWriteGate.test.tsx
    - src/features/plans/__tests__/LockHost.test.tsx
    - src/features/plans/__tests__/PlanEndedScreen.test.tsx
  modified:
    - app/(app)/_layout.tsx
    - app/(app)/(tabs)/_layout.tsx
decisions:
  - "useWriteGate never gates while plan_state is still loading (a guess must not block a write; the server trigger still decides)"
  - "Replay: one in-flight ref; didSessionReplay set whenever any replay starts, so the cold-start path runs once per mount and a stillLocked result never loops"
metrics:
  tasks: 2/2
  commits: [ec55fa06, 11f9607a]
requirements: [TIER-09]
---

# Phase 9 Plan 16: Lock UI core Summary

A tested write gate (`useWriteGate`, locked and sample sheets), the shared `NoticeCard`, a tab-top `LockBanner` (locked, household, grace), the lock explainer route, and a `LockHost` that replays kept writes on unlock, once per session on cold start, and on foreground.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 NoticeCard, LockedSheet, write gate | ec55fa06 | gate by name, sample and locked variants, haptic on primary only |
| 2 LockBanner, PlanEndedScreen, LockHost, mounts | 11f9607a | banner above Tabs, `/plan-ended` route, LockedSheetProvider and LockHost in the (app) layout |

## Verification
- jest (four plan test files, 18 tests) pass; run per file group, not the full suite.
- tsc clean for this plan files (remaining errors are only the missing react-native-purchases package); eslint clean on the plan's files (the only error, `react-native-purchases` unresolved in purchasesClient.ts, is the junctioned node_modules lacking that package and is not from this plan); depcruise clean (no dependency violations).

## Deviations from Plan

1. [Rule 3] `PlanLink` (accent text link, 44 dp target) is exported from NoticeCard.tsx so LockedSheet, LockBanner and the explainer share one link look. Extra export, no new file.
2. [Rule 3] `formatPlanDate.ts` added (device-locale long date) for the grace banner; no existing helper fit.
3. [Interpretation] LockBanner pads by the top inset itself because it sits above Tabs; screens below add their own inset, so a small extra gap shows while the banner is up.
4. [Interpretation] The banner text opens the explainer (UI-SPEC 9c "reachable later from the banner"); the link opens Plans.
5. [Interpretation] The explainer "seen" flag is stored in AsyncStorage under `fincwin:plan-ended-shown:<household>:<coveredUntil>`, so a sign-out wipe clears it.

## Known Stubs
None. "Your 7 days after leaving ended" (lock.explainer.afterSeven) is not shown: PlanView carries no signal that separates it from the plain lock. Left for the plan that adds the leaver state (09-20/09-21).

## Notes for later plans
- 09-17 wraps write buttons with `useWriteGate(action)`: `gate.run(fn)`, add a `pinLock` glyph when `gate.gated`, and append `gate.a11ySuffix` to the accessible name.
- The offline-saves NoticeCard and Activity count chip (UI-SPEC 9d) are not part of this plan.
- Leave-to-Solo pushes `/household/leave` with `mode: 'solo'`; the screen change is 09-20.

## Self-Check: PASSED
