---
phase: 00-foundation
plan: 04
subsystem: infra
tags: [android, expo-dev-client, gradle, emulator, avd, windows]

# Dependency graph
requires:
  - phase: 00-foundation (plan 02)
    provides: Bootable Expo SDK 57 + Expo Router scaffold with expo-dev-client already installed, app.config.ts with android.package = com.fincwin.app
provides:
  - A working, reproducible Windows dev loop against a local Android emulator, running a real development build (not Expo Go)
  - docs/dev-setup.md documenting both the Android Studio GUI and the command-line AVD-creation path, env vars, daily loop, and the debug signing SHA-1
  - The debug keystore SHA-1 needed for Google OAuth's Android client registration (plan 00-15)
affects: [00-15, 00-20, any-later-plan-touching-android-native-build]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "expo run:android --device <AVD-name> (not the adb serial) targets a specific emulator when multiple adb devices are attached"
    - "adb shell uiautomator dump (accessibility tree) as the fallback device-state verification method when adb screencap/screenrecord return blank frames on WHPX-accelerated AVDs"

key-files:
  created:
    - docs/dev-setup.md
  modified: []

key-decisions:
  - "Debug keystore SHA-1 read from android/app/debug.keystore (the Expo prebuild template's checked-in debug key), not a fresh ~/.android/debug.keystore — Gradle never had to auto-generate one since the template ships its own"
  - "Screenshot verification done via adb shell uiautomator dump instead of adb shell screencap/screenrecord, both of which return alpha=0 / all-black frames on this machine's WHPX-accelerated AVD regardless of capture method (exec-out pipe, device-file pull, or MediaCodec screenrecord all produced the same non-visual buffer) — documented as a known environment limitation in docs/dev-setup.md, not an app defect"

patterns-established:
  - "Pattern: when adb devices lists more than one target, pass --device <AVD-or-device-name> to expo run:android explicitly rather than relying on the default picker"

requirements-completed: [FND-02]

# Metrics
duration: ~55min
completed: 2026-09-23
---

# Phase 00 Plan 04: Android Dev Client on Emulator Summary

**`npx expo run:android --device Pixel_8_API_36` builds and installs the `com.fincwin.app` development client on a local Windows AVD, with the full command-line (non-Android-Studio-GUI) toolchain and daily-loop steps written down in `docs/dev-setup.md`.**

## Performance

- **Duration:** ~55 min (first Gradle build alone: 18m57s; remainder split between toolchain verification, a system-level ANR recovery, and diagnosing an emulator screenshot-capture limitation)
- **Completed:** 2026-09-23
- **Tasks:** 2 (Task 1 was a `checkpoint:human-action` toolchain install, resolved by the orchestrator per the user's "try launching with command line" request before this session started; Task 2 executed here)
- **Files modified:** 1 (`docs/dev-setup.md`, new)

## Accomplishments
- Verified the Android toolchain end to end: `adb devices` shows both `emulator-5554` (AVD `Pixel_8_API_36`) and a physical phone, `java -version` reports 17.0.20, `ANDROID_HOME`/`JAVA_HOME` both set
- `npx expo run:android --device Pixel_8_API_36` ran the full Expo prebuild → Gradle debug build → install → Metro bundle → launch pipeline successfully; `com.fincwin.app` is installed (`adb shell pm list packages` lists it) and its `MainActivity` is the resumed, focused activity
- JS bundle loaded with no fatal errors (`ReactNativeJS: Running "main" with {"rootTag":1,...,"fabric":true}` in logcat) and the app's own `FincWin` wordmark (from `app/index.tsx`) was confirmed rendered and centered on screen via `adb shell uiautomator dump`
- Recorded the debug signing SHA-1 (`android/app/debug.keystore`) for the Google OAuth Android client to be registered in plan 00-15
- `docs/dev-setup.md` written with every section the plan specifies: Prerequisites, Environment variables, both the Android Studio GUI and the command-line AVD-creation paths (the latter matching what was actually used for this machine's toolchain, including the `sdkmanager` exit-code-9 quirk and the `--device <AVD-name>`-not-serial gotcha when two adb devices are attached), Daily loop, "Expo Go is not used" rationale, iOS loop (blocked on Apple org enrolment), and the Debug signing SHA-1

## Task Commits

1. **Task 1: Install Android Studio (SDK, JDK, emulator) and create an AVD** — `checkpoint:human-action`, resolved by the orchestrator before this session (Android Studio installed, cmdline-tools added, system image + AVD `Pixel_8_API_36` created, `ANDROID_HOME`/`JAVA_HOME` set). No commit — install-only, no repo changes.
2. **Task 2: Build and launch the development build on the emulator, and document the dev loop** — `de38a03` (feat)

**Plan metadata:** this commit (docs: complete plan) — created alongside this SUMMARY

## Files Created/Modified
- `docs/dev-setup.md` — full Windows Android dev-loop documentation: prerequisites, env vars, GUI and CLI AVD setup, multi-device targeting, daily loop, Windows long-path fix, the screenshot-capture limitation note, iOS loop, and the debug SHA-1

## Decisions Made
- Debug keystore SHA-1 read from the project-local `android/app/debug.keystore` (part of the gitignored, regenerate-on-demand `/android` prebuild output) rather than a global `~/.android/debug.keystore`, since no global one existed and Expo's prebuild template ships its own
- Documented `uiautomator dump` as the verification fallback for automated agents on this machine, since both `adb shell screencap` and `adb shell screenrecord` (tried via `exec-out` pipe, on-device file + `adb pull`, and MediaCodec `screenrecord` extraction through `ffmpeg`) consistently returned blank/fully-transparent-or-black frames despite the app rendering correctly and interactively on the emulator's own window — a WHPX-accelerated-AVD GPU capture limitation, not an app defect

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `expo run:android --device emulator-5554` failed with "Could not find device with name"**
- **Found during:** Task 2, step 2 (first build attempt)
- **Issue:** The plan's own multi-device guidance (adb serial `emulator-5554`) isn't what `expo run:android --device` expects — the flag matches against the AVD/device *name*, not the adb serial, so the first invocation failed immediately with `CommandError: Could not find device with name: emulator-5554`
- **Fix:** Looked up the AVD's actual name via `adb -s emulator-5554 emu avd name` (`Pixel_8_API_36`) and reran with `--device Pixel_8_API_36`, which built and launched successfully
- **Files modified:** none (build command only); documented the correct usage in `docs/dev-setup.md`'s "Multiple devices attached" section
- **Verification:** Build proceeded past the device-selection step and completed
- **Committed in:** `de38a03` (docs update only; the failed first attempt made no repo changes)

**2. [Rule 1 - Bug] System-level ANR ("Process system isn't responding") appeared mid-launch, and screenshot capture APIs returned unusable frames**
- **Found during:** Task 2, step 3 (post-install screenshot verification)
- **Issue:** Two related but distinct problems surfaced together: (a) the emulator's `system` process threw an ANR dialog, most likely from CPU contention during the 19-minute first Gradle build, which had to be dismissed (tapped "Wait") before the launch could proceed to the dev client's own home/dev-menu screen; (b) independently, `adb shell screencap -p` (both via `exec-out` pipe and on-device-file-plus-`pull`) and `adb shell screenrecord` all returned frames that decoded as blank/fully-black or fully-transparent, even though the app was demonstrably running correctly (no crash, correct JS bundle load, and `adb shell uiautomator dump`'s accessibility tree showed the real `FincWin` text centered on screen at the expected layout position)
- **Fix:** Dismissed the ANR via `adb shell input tap` on "Wait", then dismissed the dev client's own overlay menu via a back-key event to reach the actual app screen; switched screenshot verification to `adb shell uiautomator dump` (accessibility tree, unaffected by the GPU capture path) plus `adb logcat` for `ReactNativeJS: Running "main"` and the absence of fatal exceptions, since three different pixel-capture methods all failed identically
- **Files modified:** none (verification-only); documented the capture limitation and the `uiautomator`-based fallback in `docs/dev-setup.md`
- **Verification:** `uiautomator dump` showed `text="FincWin"` at bounds consistent with a centered `flex:1, alignItems:center, justifyContent:center` layout; logcat showed no `FATAL`/`AndroidRuntime` entries for the `com.fincwin.app` process after JS start
- **Committed in:** `de38a03` (docs note only; no code changed)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug/investigation)
**Impact on plan:** Both deviations were tooling/environment friction, not app defects. No scope creep — no code outside `docs/dev-setup.md` was touched.

## Issues Encountered
- The first Gradle build took ~19 minutes (native module compilation for a from-scratch `/android` prebuild); this is expected for a first build on this dependency set and was not treated as a blocker
- See "Deviations" above for the ANR and screenshot-capture investigation, both resolved without touching app code

## User Setup Required
None — no external service configuration required. This plan only builds and documents the local Android toolchain; the debug SHA-1 it records is consumed by plan 00-15 (Google OAuth), not configured here.

## Next Phase Readiness
- FND-02 holds: a development build (not Expo Go) runs on a local Android emulator from Windows, and the loop to reproduce it is written down in `docs/dev-setup.md`
- The debug SHA-1 is recorded and ready for plan 00-15's Google OAuth Android client registration
- iOS loop remains blocked on Apple Developer Program organisation enrolment (ENV-10, plan 00-20) as expected — `docs/dev-setup.md`'s iOS section documents the intended EAS-development-build-to-iPhone-XR path for when that unblocks
- Metro is left running in the background from this session's final build (`npx expo run:android --device Pixel_8_API_36`, background task) for any immediate follow-on manual testing; it is not required for future plans, which will start their own `expo start --dev-client` as needed

## Known Stubs
None introduced by this plan — `app/index.tsx`'s hardcoded wordmark stub was already documented as an intentional placeholder in the 00-02 Summary (replaced by plan 00-17).

## Self-Check: PASSED

`docs/dev-setup.md` verified present on disk and containing `npx expo run:android`, `Expo Go is not used`, and a SHA-1 pattern matching the plan's acceptance regex (confirmed via the same `grep -qE` checks the plan specifies). Commit `de38a03` verified present in `git log --oneline -5`. `com.fincwin.app` verified installed via `adb -s emulator-5554 shell pm list packages`.

---
*Phase: 00-foundation*
*Completed: 2026-09-23*
