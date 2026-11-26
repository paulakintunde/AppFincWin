---
phase: 10-system
plan: 21
subsystem: lock
tags: [app-lock, device-lock, pin, app-switcher-cover, biometrics, security-settings]
requires: [10-04, 10-11]
provides: [src/features/lock/*, src/features/security/LockSection.tsx]
affects: [10-27 Security screen, 10-30 device checks]
key-files:
  created:
    - src/features/lock/PinPad.tsx
    - src/features/lock/PinDots.tsx
    - src/features/lock/BrandMark.tsx
    - src/features/lock/AppCover.tsx
    - src/features/lock/useLockController.ts
    - src/features/lock/LockScreen.tsx
    - src/features/lock/LockGate.tsx
    - src/features/lock/LockSetupSheet.tsx
    - src/features/lock/PinCheckSheet.tsx
    - src/features/lock/LockOfferCard.tsx
    - src/features/lock/lockEvents.ts
    - src/features/lock/timing.ts
    - src/features/lock/currentUser.ts
    - src/features/security/LockSection.tsx
    - src/features/lock/__tests__/{PinPad,AppCover,LockGate,LockSetupSheet}.test.tsx
    - src/features/security/__tests__/LockSection.test.tsx
  modified:
    - app/_layout.tsx
    - src/features/home/HomeScreen.tsx
    - src/features/home/__tests__/HomeScreen.test.tsx
    - src/services/lock/lockStore.ts
    - src/services/lock/biometric.ts
    - src/services/lock/__tests__/lockStore.test.ts
    - src/i18n/locales/system/appLock.ts
    - src/i18n/locales/system/security.ts
    - jest.setup.ts
requirements-completed: [ACC-08, ACC-09, DSG-08]
completed: 2026-11-23
---

# Phase 10 Plan 21: Phone lock and app-switcher cover Summary

The phone lock now defaults to the phone's own lock (biometric with the device passcode as fallback) on iOS and Android, with the FincWin 6-digit PIN as an optional "Extra FincWin PIN" mode (D-33), plus a one-time Home offer, a setup sheet, a Security lock section, and an always-on app-switcher cover.

## What was built

- **D-33 pre-task (services):** `lockMethod: 'device' | 'appPin'` (default `'device'`, junk values fall back) in the persisted lock settings; `authenticateDevice` (`disableDeviceFallback: false`, no `biometricsSecurityLevel`); `deviceLockAvailable()` via `getEnrolledLevelAsync() > SecurityLevel.NONE`. `authenticateBiometric` (strong, no fallback) is kept for app-PIN mode. jest mock gained `getEnrolledLevelAsync`.
- **Components:** `PinPad` (3x4, 64 dp keys), `PinDots` (reads the count only), `BrandMark` (splash-icon at 48), `AppCover` (page tint plus mark; no Text node), `useLockController` (AppState cover and lock, ignores AppState while the biometric prompt is open, treats first load as a cold start).
- **LockScreen:** device mode shows IconTile, heading and an "Unlock" pill, runs the prompt once on appear, no pad, no ladder, no re-sign-in; footer is Sign out only. App-PIN mode keeps the pad, 1-4 wrong-try line, 5th-try wait with `StatusBadge locked` and an mm:ss countdown (spoken every 10 s, polite live region), the 10th try or "Forgot PIN?" sign-in again with Apple and Google, then `decideAfterReauth` (keep: clear tries and open the PIN step; wipe: `performSignOut`). Android back is consumed. 150 ms fade, none under Reduce Motion.
- **LockGate:** unmounts the app while locked; `AppCover` is always the top-most child; pass-through when signed out; `registerLockWipe()` at module init. Wrapped around `<Gate />` in `app/_layout.tsx` inside `AuthProvider`.
- **LockSetupSheet:** device path (phone has a screen lock: "Use your phone's lock to open FincWin", then "Lock is on"); no-screen-lock path offers the app PIN with the plain line; extra-PIN path with biometric explainer, PIN twice, mismatch line in ink; denied biometric continues PIN-only; nothing saved before the last step; timing "Change" saves at once.
- **LockOfferCard:** Home, under `PlanNoticeSlot`, after first setup while the lock is off and unanswered; exact title "Lock FincWin with Face ID?" (Touch ID / phone-lock / PIN variants); either answer removes it for good.
- **LockSection:** `Lock FincWin` toggle (on opens setup; off asks the phone's lock, or biometrics then PIN in app-PIN mode, then toast), four timing `RadioDot` rows (After 1 minute default, tick haptic), `Extra FincWin PIN` toggle, and `Change PIN` and the biometric toggle only in app-PIN mode. Exports `SwitcherMetaLine` too (see below).

## Tests
- `npx jest src/features/home/__tests__/HomeScreen.test.tsx src/features/auth src/features/lock src/features/security src/i18n/__tests__/systemCopy.test.ts` : 13 suites, 421 tests passed. `catalogue.test.ts` passed earlier after the first copy change.
- `src/services/lock` : 3 suites, 39 tests passed (new device-lock tests included).
- tsc and eslint on touched files: see the final report.

## Deviations from Plan

**1. [Rule 3 - Blocking] `currentUser.ts` helper.** The re-sign-in needs the new user's id; the lazy `import('@/services/supabase')` could not be reached under Jest, so it sits in its own module that the tests mock. Same lazy-import rule as `signOut.ts`.

**2. [Rule 2 - Missing] Splash hide.** The app's own `Gate` hides the splash screen and is unmounted while locked, so `LockScreen` hides it on mount.

**3. [Rule 2 - Missing] Not-ready hold.** Until the lock state has loaded, `LockGate` renders only the cover so the app never flashes before the cold-start lock; a read failure fails open (never a blank trap).

**4. Extra files** beyond the plan list: `PinCheckSheet` (current-PIN check for Change PIN, turn-off, extra-PIN off), `lockEvents` (re-read after setup/Security changes), `timing`, `currentUser`. `LockSetupSheet` is committed with Task 2 because `LockScreen` imports it (re-sign-in PIN step).

**5. Copy.** New draft keys under `system.appLock.*` (the six plan keys plus `offerTitleDevice`, `offerBodyPin`, fingerprint variants, `setNewPin`, `currentPinTitle`, `verifyTurnOff`, `waitShort`, `promptOpen`, `promptCancel`, `lockedBodyDevice`, `setupDoneBody*`) and `system.security.*` (`lockToggleSubDevice`, `methodDevice`, `methodPin`, `biometricRowFingerprint`). `offerBody` now carries the device-lock wording from D-33. All tracked as draft automatically; `systemCopy.test.ts` green.

**6. UI-SPEC items dropped or deferred.** The "Use PIN instead" link is omitted (the pad is always up in app-PIN mode, so it would do nothing). "Biometrics changed in system settings" detection is not built. The ToggleRow has no icon-tile slot, so the Lock toggle shows no `faceId`/`pinLock` tile. Turning the extra PIN off does not delete the stored PIN hash (no `clearPin` in 10-11; the hash is unused in device mode and wiped by `clearLock`).

## Known caveats for 10-30 / orchestrator
- The cover is a JS cover (RESEARCH A4). RN `Modal` sheets are separate native windows, so an open sheet is not covered by it; the 10-30 device check decides whether a native fallback is needed. Android secure-window flag is not set.
- Unlocking remounts the app tree (required so nothing is mounted or readable while locked), so navigation position and unsaved sheet input are lost on every lock.
- `expo-local-authentication` is still not installed in node_modules (10-11 note): the orchestrator must run the real install; tsc "Cannot find module 'expo-local-authentication'" is expected until then. No package changes in this plan.
- 10-27 composes `LockSection` first on the Security screen; pass `showSwitcherMeta={false}` and place `SwitcherMetaLine` at the bottom to match UI-SPEC item 6 order. `system.security.rowSubOn` takes `{{method}}`: use `methodDevice` / `methodPin`.
- Device checks to run on the iPhone XR and the Pixels: Face ID dialog does not flash the cover or restart the timer; cover appears in the app switcher; device passcode fallback on Android.

## Threat model
T-10-21-01 (children unmounted while locked), -02 (cover always on; device check pending), -03 (`decideAfterReauth` wipes on a different user), -04 (Forgot PIN re-sign-in, cloud untouched), -05 (AppState ignored while biometric pending) are all implemented and covered by `LockGate.test.tsx` and `AppCover.test.tsx`.

## Known Stubs
None.

## Self-Check: PASSED
