---
phase: 10-system
plan: 12
subsystem: auth-devices
tags: [devices, sessions, security-definer, remote-signout, ACC-06, ACC-07]
requires: [10-02, 10-03, 10-04]
provides: [touch_my_device, list_my_devices, revoke_my_session, DevicesSection, remote sign-out wipe]
affects: [10-27 (composes DevicesSection into Security screen)]
key-files:
  created:
    - supabase/migrations/20261126000400_devices_rpcs.sql
    - supabase/tests/database/123_devices_rpcs.test.sql
    - src/services/devices/deviceInfo.ts
    - src/services/devices/useDevices.ts
    - src/services/devices/useDeviceHeartbeat.ts
    - src/services/devices/__tests__/devices.test.tsx
    - src/features/auth/signOutReason.ts
    - src/features/auth/__tests__/remoteSignOut.test.tsx
    - src/features/security/DevicesSection.tsx
    - src/features/security/DeviceRow.tsx
    - src/features/security/DeviceDetailSheet.tsx
    - src/features/security/__tests__/DevicesSection.test.tsx
  modified:
    - src/features/auth/signOut.ts
    - src/features/auth/AuthProvider.tsx
    - src/features/auth/__tests__/AuthProvider.test.tsx
metrics:
  tasks: 3
  completed: 2026-11-23
---

# Phase 10 Plan 12: Devices list and revoke Summary

Three SECURITY DEFINER RPCs over auth.sessions (touch, list, revoke-own), a throttled heartbeat, the Devices group UI, and a remote sign-out that wipes the phone copy.

## Commits
- 5830c00e feat(10-12): devices RPCs and pgTAP 123
- 5ab12e27 feat(10-12): device services, heartbeat and remote sign-out wipe
- 6feffd4f feat(10-12): DevicesSection, DeviceRow and DeviceDetailSheet

## Verification
- `npm run lint:migrations`: OK.
- `npx jest src/services/devices src/features/auth src/features/security`: passing (devices 6, remoteSignOut 3, AuthProvider existing, DevicesSection 8).
- **pgTAP 123 NOT run here** (wave 2 rule: no local stack). **Research assumption A5 (a SECURITY DEFINER function can `delete from auth.sessions`) is to be proven by the orchestrator pgTAP run.** If it fails, the plan's stated fallback is an Edge Function with service-role delete, needing a plan revision (not improvised here). pgTAP 123 has 14 assertions; planned count is declared in the file.

## Decisions / notes
- AuthProvider remote branch: a SIGNED_OUT while `isLocalSignOutInProgress()` is false sets reason `remote` and calls `performSignOut({ supabase })` once. performSignOut raises the local flag for its duration, so its own SIGNED_OUT is ignored (no recursion), and it does not overwrite a `remote` reason with `local`. AuthProvider passes its already-imported supabase client because Jest cannot run `await import(...)` (no vm-modules).
- Hooks take an injectable `getClient` (default lazy `await import('@/services/supabase')`, T-00-18) for the same reason; the only `@/services/supabase` references in `src/services/devices/*.ts` are dynamic imports.
- Remote wipe path has no theme `reset` available in AuthProvider, so theme reset is not run on a remote sign-out (device data wipe, analytics disable and session removal are).
- Addresses Phase 0 review item CR-02 for the session-ended-elsewhere case.
- Nothing consumes `consumeSignOutReason()` yet: the Welcome/signed-out screen showing `system.security.signedOutRemote` ("You were signed out of this device.") is not wired in this plan (not in its file list); `signOutReason.ts` provides the store for it.
- DevicesSection is not yet mounted anywhere (10-27 composes it); `useDeviceHeartbeat` is likewise not yet mounted in an app shell (not in this plan's file list). Both need wiring by a later plan.
- Place and IP are never rendered; `system.security.place*` keys are unused.

## Deviations from Plan
None of Rules 1-4 beyond: existing `AuthProvider.test.tsx` gained a `jest.mock('../signOut')` (necessary since SIGNED_OUT now triggers the wipe).

## Orchestrator follow-ups
- Run pgTAP (123) after merge; confirms A5.
- Run tsc: only expected error is the missing `expo-local-authentication` module.
- Mount `useDeviceHeartbeat(user.id)` in the signed-in shell and consume `consumeSignOutReason()` on the signed-out screen (plan 10-27 or the owner of those screens).

## Self-Check: PASSED (files and commits exist; jest green; pgTAP pending orchestrator)
