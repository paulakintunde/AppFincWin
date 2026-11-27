---
phase: 10-system
plan: 30
subsystem: verification/devices
tags: [device-checks, DSG-08, ALR-01, ALR-05, ALR-06, ENV-19, validation]
requires: [10-29]
provides:
  - Pixel 9 device checks 1-15 pass; step 16 (iPhone XR) blocked on Apple setup
  - Four gaps found on the device and fixed (two in production)
  - 10-VALIDATION.md signed with nyquist_compliant true
key-files:
  created:
    - docs/acceptance/phase-10-device-checks.md
    - plugins/withRecentsCover.js
    - src/services/lock/secureWindow.ts
    - src/services/lock/__tests__/secureWindow.test.ts
    - src/features/lock/__tests__/recentsCoverPlugin.test.ts
    - supabase/migrations/20261127090000_alerts_cross_currency.sql
    - supabase/migrations/20261127090100_alert_prefs_upsert_grant.sql
    - supabase/tests/database/128_alerts_cross_currency.test.sql
    - supabase/tests/database/129_alert_prefs_upsert.test.sql
  modified:
    - app.config.ts
    - package.json (expo-screen-capture ~57.0.4)
    - src/features/lock/useLockController.ts
    - .planning/phases/10-system/10-VALIDATION.md
requirements: [DSG-08, ALR-01, ALR-05, ALR-06, ENV-19]
metrics:
  completed: 2026-11-27
  status: COMPLETE except step 16 (iPhone XR), blocked on 00-20
---

# Phase 10 Plan 30: Full suite, builds, device checks Summary

## Builds
- The full suite was green before the device round: app Jest (rerun with maxWorkers=3 after load timeouts), engine coverage, pgTAP, Deno, and the checks.
- **No EAS build this round.** The EAS free-plan Android quota is used up until 2026-12-01, so the owner chose a local Gradle debug dev client: arm64, Pixel 9, JS from Metro :8076. Its final form is built from this branch with the native plugin and expo-screen-capture.
- iOS was not built. The Apple portal steps (00-20) are still open.

## Device results (docs/acceptance/phase-10-device-checks.md)
1-15 pass on the Pixel 9. 16 is blocked.

## Gaps found on the device and fixed
1. **App-switcher cover (steps 1-2).** On Android the JS AppCover draws too late. Two fixes:
   - `withRecentsCover` (setRecentsScreenshotEnabled(false)) blanks the stored card.
   - The Pixel's *live* card is a frozen frame that no cover can beat. A JS cover on window blur was tried and reverted.
   - **Owner decision 2026-11-27 (amends D-04 on Android):** FLAG_SECURE only while "Lock FincWin" is on, via `secureWindow.ts`. With the lock on, the card is black and screenshots are blocked. With the lock off, screenshots stay allowed and the live card may show figures.
   - Verified by adb on the Pixel 9.
2. **Partner alerts across currencies (step 9).** A USD threshold never fired for a CAD line in a CAD household: `alerts_pick_amount` returned null. Migration 20261127090000 converts the original amount at stored rates (per_eur_rate + convert_minor). Pushed to production 2026-11-27 (owner-approved). Tested by pgTAP 128.
3. **Alert settings never saved (step 10).** The PostgREST upsert names user_id in DO UPDATE SET, but user_id had INSERT and not UPDATE, so every save failed with 42501. As a result, quiet hours could not be switched off, the time zone stayed UTC, and partner opt-out was ignored. Migration 20261127090100 grants UPDATE (user_id); the RLS policy still pins it to auth.uid(). Pushed to production 2026-11-27 (owner-approved). Tested by pgTAP 129. The time zone then saved as America/Vancouver.
4. **No push delivered (ENV-19).** Expo answered "Unable to retrieve the FCM server key" (InvalidCredentials). The 26 Nov service-account key was in the Expo account but not attached to the app's FCM V1 slot, although the setup sheet (row 5) said it was proven. The owner attached it with `eas credentials` on 2026-11-27, and a test push returned an ok receipt.

## Notes for later
- Partner push says "Someone spent ..." when the line has no category the receiver can see (text.ts partnerLargePrivate), even when the name is visible. This is a possible wording change, owner to decide.
- Metro's watcher went stale twice and served single-module bundles, which gave a white screen. Restart Metro with `--clear` before device checks (memory: dev-client-launch).
- `C:\dev\fincwin` (main checkout) node_modules lacks expo-local-authentication, so `eas` fails there. Run EAS from a worktree with `EAS_PROJECT_ID` set.
- The PC's Node has older tzdata (Vancouver at UTC-8). The phone and the server use UTC-7. Check zones in the server runtime.
- Migrations were pushed from this worktree with the five applied 10.1 files staged temporarily (removed after). Production also holds 20261127000100..0500 from feat/10.1-build.

## Open
- Step 16: iPhone XR Face ID, cover and APNs push, after the Apple portal steps (00-20).
