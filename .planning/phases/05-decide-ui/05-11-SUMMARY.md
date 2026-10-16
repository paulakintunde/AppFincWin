---
phase: 05-decide-ui
plan: 11
subsystem: decide-notifications
tags: [decide, notifications, expo-notifications, privacy, tdd]
requires: [05-01, 05-02]
provides:
  - waitReminder (schedule/cancel/reconcile/wipe for 'wait' and 'cooling_off' reminders)
  - useNotificationObserver (validated tap routing to /decide/check/[id] step 3)
affects: [05-20, 05-24, 05-25, 05-26]
key-files:
  created:
    - src/features/decide/notifications/waitReminder.ts
    - src/features/decide/notifications/useNotificationObserver.ts
    - src/features/decide/notifications/__tests__/waitReminder.test.ts
    - src/features/decide/notifications/__tests__/useNotificationObserver.test.tsx
    - src/features/decide/__tests__/helpers/mockNotifications.ts
  modified:
    - package.json
    - package-lock.json
    - app.config.ts
decisions:
  - Reminders keyed `${kind}:${checkId}` in AsyncStorage 'fincwin:decide-reminders'; payload data is only { checkId, kind }
  - Reconcile never requests permission; scheduling on Wait/Go ahead does
  - Observer builds the href in-app and ignores any payload url
metrics:
  tasks: 3
  files: 8
  completed: 2026-10-16
---

# Phase 5 Plan 11: Wait and cooling-off reminders Summary

expo-notifications ~57.0.23 installed with its config plugin (no exact-alarm permission), plus a tested reminder module (09:00 local ready-by morning, absolute cooling_off_at instant, fixed copy with no amount or name, wipe handler, reconcile from server state) and a tap observer that routes only validated uuids with a known kind, once per notification, only when enabled. Nothing is mounted yet (05-24 mounts the observer, 05-20 schedules).

## Commits
- ebebfa2: install expo-notifications and plugin, mock helper (Task 1)
- 6751cc5: waitReminder module (Task 2)
- 686aedd: useNotificationObserver (Task 3)

## Verification
- `npx jest src/features/decide/notifications`: 22 passed.
- `npm run typecheck` clean; `npm run lint` 0 errors (existing warnings; 2 new require-import warnings from the plan-mandated mock pattern); `npm run depcruise` clean.

## Deviations from Plan
None. Test note: `renderHook`/`rerender`/`unmount` must be awaited in this RNTL version.

## Human / device items
- 05-26 / 05-25: adding the expo-notifications config plugin changes the native fingerprint, so a new dev build and preview APK are required before device verification. iOS needs the Push capability once Apple enrolment lands. Verify on a device: permission prompt, morning delivery, tap reopens the check at step 3.
- Migrations: none.

## Self-Check: PASSED
