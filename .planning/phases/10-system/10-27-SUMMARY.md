---
phase: 10-system
plan: 27
subsystem: wiring
tags: [security, you, alerts, push, deno, ci]
requires: [10-09, 10-12, 10-14, 10-17, 10-18, 10-19, 10-21, 10-22, 10-23, 10-24, 10-25]
provides:
  - Security screen and route (/security)
  - You rows: Security, Alerts, Archive, Import from CSV, Diagnostic export
  - SystemHosts boot wiring
  - every new Deno test in test:deno and the CI deno job
affects: [YouScreen, app/(app)/_layout.tsx, package.json, ci.yml]
key-files:
  created:
    - src/features/security/SecurityScreen.tsx
    - app/(app)/security.tsx
    - src/features/you/components/SystemYouRows.tsx
    - src/features/system/SystemHosts.tsx
  modified:
    - src/features/you/YouScreen.tsx
    - src/features/security/LockSection.tsx
    - src/services/lock/lockStore.ts
    - src/features/alerts/pushRegistration.ts
    - app/(app)/_layout.tsx
    - package.json
    - .github/workflows/ci.yml
metrics:
  completed: 2026-11-23
---

# Phase 10 Plan 27: Wiring Summary

Phase 10 is wired into the app: Security screen (lock, then devices, then the app-switcher line), five new You rows with live sublabels, a boot host for alert channels, time zone, push token refresh and the device heartbeat, and CI coverage of every Deno test. Tasks 1 and 2 are complete. Task 3 is done except the three google-services.json parts, which wait on the owner (10-01).

## Commits
- 0a4bb8d5 clearPin (follow-up 6)
- 2b2de607 Security screen and You rows (Task 1, follow-ups 1, 5)
- 1a14b5d0 SystemHosts (Task 2, follow-ups 2, 4)
- 56e12459 Deno registration (Task 3, part)

## Follow-up outcomes (wiring-followups.md)
1. Security composition: done. `LockSection showSwitcherMeta={false}`, `DevicesSection`, then `SwitcherMetaLine`; the You row sub uses `rowSubOff` or `rowSubOn` with `methodDevice`/`methodPin` and the timing word lower-cased ("Phone lock · after 1 minute").
2. `useDeviceHeartbeat(userId)`: mounted in SystemHosts for signed-in users.
3. Signed-out reason lines: already done by 10-25 in `WelcomeScreen` (renders `system.security.signedOutRemote` for `remote` and `system.ownData.deleted` for `deleted`, reading `lastSignOutReason()` then `consumeSignOutReason()` in an effect). Not duplicated.
4. Alerts: `ensureAlertChannels()` runs in SystemHosts before the token refresh; `useAlertTimeZoneSync(userId)` mounted; You row Alerts with sub "{n} on". New `refreshPushTokenIfGranted()` in `pushRegistration.ts`: re-registers the token only when permission is already granted, never requests it.
5. You rows: security first in Privacy and data; alerts above Haptics (always shown); archive after Features only when `useFeatureAccess('archive').on`; importCsv and diagnostic under Export. Opens via `pushOnce` to /security, /alerts, /archive, /data-import, /diagnostic.
6. `clearPin()` added to `src/services/lock/lockStore.ts` (deletes hash, salt and try counters, keeps settings); called when "Extra FincWin PIN" is turned off after the PIN check. Unit-tested in lockStore and LockSection tests.
7. `expo-local-authentication` real install and new dev build: left to 10-29/10-30 (orchestrator, real-node_modules checkout).
8. Double resume (`resumeRestoredMutations` and the online listener's `resumePausedMutations`): NOT changed. Not a safe one-line guard: a restored mutation can be both `pending` and `isPaused`, and a guard in either path risks dropping a real offline write. Harmless because writes use idempotent ids. Recorded for 10-29/30 verification.

## Pending owner (10-01)
Not done because `C:/dev/fincwin/google-services.json` does not exist and the gitleaks answer is outstanding:
1. Copy `C:/dev/fincwin/google-services.json` to the repo root and commit it.
2. In `app.config.ts` android block add: `googleServicesFile: './google-services.json', // 10-27 (ENV-19): FCM v1 for Expo push; identifiers only, not a secret (Firebase docs); gitleaks allow-listed by exact path`
3. In `.gitleaks.toml` `[allowlist]` add an exact-path entry matching `''' ^google-services\.json$ '''` (no spaces; `paths = [...]`), only if the owner approves.
Changing app.config.ts changes the native fingerprint; the phase-end build (10-30) is the new dev build.

## Copy gaps closed
None. Every key already existed (`system.security.*`, `system.alerts.*`, `system.archive.*`, `system.ownData.*`).

## Deviations
- [Rule 2] Added `refreshPushTokenIfGranted()` to `pushRegistration.ts` (10-22 file) because the plan requires a grant-only token refresh and none existed.
- [Rule 3] Added the SystemYouRows component file so YouScreen row hooks stay out of the screen file.
- CI: the plan said add one deno step; added a second step with the full list (pdf test stays in the first step). `test:deno` already listed the alerts-deliver, delete-account and plan-grant tests; only rateLimit and reviewer-signin were added.
- Archive route has no `Stack.Screen` entry in the layout (matches the other undeclared Phase 10 routes; they resolve by file).

## Tests
- `npx jest --no-watchman -i` YouScreen, system, SecurityScreen: 5 suites, 77 passed. lock services + security: 5 suites, 57 passed.
- `deno test` for rateLimit, reviewer-signin, alerts-deliver (3), delete-account, plan-grant: 61 passed.
- No pgTAP in this plan.

## Known stubs
None.

## Self-Check: PASSED
