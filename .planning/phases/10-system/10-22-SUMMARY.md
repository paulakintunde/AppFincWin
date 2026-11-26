---
phase: 10-system
plan: 22
subsystem: alerts-client
tags: [alerts, push, permission, expo-notifications, settings]
requires: [10-02, 10-03, 10-04, 10-05, 10-15]
provides:
  - "src/features/alerts/* (channels, pushRegistration, useAlertTimeZoneSync, useAlertDefaults, alertText, AlertsScreen, AlertKindRow, AlertKindSheet, PermissionPreAsk, AlertLogScreen)"
  - "routes /alerts and /alert-log"
affects: [10-23, 10-27]
requirements-completed: [ALR-01, ALR-02, ALR-03, ALR-04, ALR-05, ENV-19]
completed: 2026-11-23
---

# Phase 10 Plan 22: Alerts settings, permission flow and alert log Summary

The Alerts screen, kind sheets, pre-ask, push-token registration and 30-day log on the phone. Permission is asked in exactly one place, after a person switches an alert on and presses Continue.

## Commits
- 12c2dff8 feat(10-22): channels, push registration, time-zone sync, suggested defaults
- 1ab3b3b0 feat(10-22): Alerts screen, kind sheets, pre-ask, alert log, routes (task 2)

## Key points
- `requestPushPermissionAndRegister` is the only caller of `requestPermissionsAsync`; it reads permission first, skips the OS ask for a permanent denial, creates channels, gets the Expo token with the project id and calls rpc `register_push_token`. Missing project id returns 'denied' without throwing. `getPushPermission` reads only (used when the screen opens).
- Opening the screen never asks. A default-on alert (bills due, goal reached) shows on; the pre-ask appears when any switch is turned on and OS permission is not granted. Denied keeps the switch on and shows the permission card with Open settings.
- Large and low amounts: switching on saves the suggested amount (home currency, integer minor units) so the server has a number to compare; sheet MoneyInput saves on blur with a "Saved" toast; "Use the suggested amount" resets.
- Household members: Partner alerts switch, and `ensurePartnerThreshold` saves an off `large_txn` row once so partner alerts use the receiver's own amount.
- Alert log text is built from whitelisted params by `alertText`; hidden-names and private-category variants use the matching `system.push.*` templates.

## Deviations from Plan
- [Rule 3] `pushRegistration.ts` imports `@/services/supabase` statically instead of a lazy `import()`: dynamic import fails under jest (no vm-modules flag) and the module is already loaded in the app.
- [Rule 2] Added i18n keys: `system.push.whenToday/whenTomorrow/whenInDays` (bills due log text) and `system.alerts.done/leadGroup/quietFromLabel/quietToLabel`. All drafts, covered by existing copy tests.
- AlertKindRow is a custom row (body opens the sheet, switch toggles) because `ToggleRow` toggles on any press; track geometry copied from ToggleRow.
- The lookback for suggestions fetches the current month plus the three before so the 3-month engine window is covered.
- The You screen row linking to Alerts is not added here (plan 10-27 hosts boot and navigation wiring); the screen links to /alert-log itself.

## Tests run
- `npx jest src/features/alerts src/i18n`: alerts 4 suites / 28 tests pass; i18n suites pass.
- `npx tsc --noEmit -p .`: clean (apart from the known expo-local-authentication note, none emitted).
- eslint on touched files: clean after fixing two warnings.
- pgTAP: not applicable (no SQL).

## Notes for the orchestrator
- expo-notifications is already installed in node_modules and pinned `~57.0.23`; tests mock it per file. No install needed.
- Mount `ensureAlertChannels()` at boot and `useAlertTimeZoneSync(userId)` in plan 10-27 (not mounted here). Add a You row to `/alerts` there.
- Owner wording sign-off still applies to the draft Alerts copy.

## Known Stubs
None.

## Self-Check: PASSED
