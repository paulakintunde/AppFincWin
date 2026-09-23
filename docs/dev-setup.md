# Windows dev-loop setup

FincWin is developed on Windows 11 with no Mac and no Xcode. The Android emulator is
the primary day-to-day loop; iOS runs through EAS development builds installed on a
physical iPhone XR (see "iOS loop" below). **Expo Go is not used**: Apple/Google
sign-in, secure store and PostHog need custom native code and only run in a
development build (`expo-dev-client`), never in Expo Go.

## Prerequisites

- **Node** 24.x (matches `package.json` engines / CI)
- **Android Studio**, installed via `winget install Google.AndroidStudio` or the
  installer from developer.android.com/studio, Standard install. This brings:
  - The **Android SDK** (platforms, build-tools, platform-tools, emulator)
  - A bundled **JDK** at `Android Studio\jbr` (17+) — FincWin's toolchain instead
    uses the standalone **Microsoft Build of OpenJDK 17** (`java -version` → 17.0.20,
    installed separately), which also satisfies `JAVA_HOME`. Either JDK 17 works;
    only one should be on `JAVA_HOME` at a time.
  - The **Android Emulator** and at least one AVD (Android Virtual Device)
- **Docker Desktop** — required by the Supabase CLI's local stack
- **Supabase CLI**, installed via Scoop (`scoop install supabase`)
- **eas-cli** (`npm install -g eas-cli`, or `npx eas-cli`)

## Environment variables (user-level, Windows)

| Variable | Value | Purpose |
|---|---|---|
| `ANDROID_HOME` | `%LOCALAPPDATA%\Android\Sdk` | SDK root; read by Gradle, `adb`, `expo run:android` |
| `JAVA_HOME` | Path to a JDK 17 install (e.g. `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\`) | Gradle's compiler toolchain |
| `PATH` (append) | `%ANDROID_HOME%\platform-tools`, `%ANDROID_HOME%\emulator`, `%ANDROID_HOME%\cmdline-tools\latest\bin` | `adb`, `emulator`, `sdkmanager`/`avdmanager` on PATH |

Set these as **user** environment variables (System Properties → Environment
Variables), then open a **new** terminal so they take effect. Verify with:

```sh
adb devices
java -version
echo %ANDROID_HOME%
```

## Installing the Android toolchain and creating an AVD

Two equivalent paths exist. The GUI path is Android Studio's own wizard; the
command-line path is what was actually used to bring up this project's toolchain
and is fully scriptable / reproducible without opening the IDE.

### Path A — Android Studio GUI

1. Install Android Studio (Standard install adds the SDK, platform-tools, emulator
   and a bundled JDK).
2. **More Actions → SDK Manager → SDK Platforms**: install the latest stable
   Android API that Expo SDK 57 targets. **SDK Tools**: tick Android SDK
   Build-Tools, Command-line Tools (latest), Emulator, Platform-Tools.
3. **Device Manager → Create device** → pick a device (e.g. Pixel 8) → pick the
   same API image (x86_64, Google APIs or Play) → Finish, then start it.
4. Set the environment variables above and open a new terminal.

### Path B — command line (no Android Studio UI interaction beyond initial install)

Used when Android Studio is installed but its SDK has no `cmdline-tools` yet:

```sh
# 1. Download and unpack the command-line tools into the SDK's cmdline-tools/latest
#    (sdkmanager requires this exact folder shape: .../cmdline-tools/latest/bin/sdkmanager)
curl -L -o cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip
unzip cmdline-tools.zip -d "%ANDROID_HOME%\cmdline-tools"
move "%ANDROID_HOME%\cmdline-tools\cmdline-tools" "%ANDROID_HOME%\cmdline-tools\latest"

# 2. Install a system image (adjust API level to Expo SDK 57's target)
sdkmanager "system-images;android-36;google_apis_playstore;x86_64"
# Note: this sdkmanager build exits with code 9 even on success — check the
# actual package list (sdkmanager --list_installed) rather than trusting $?.

# 3. Create the AVD
avdmanager create avd -n Pixel_8_API_36 -k "system-images;android-36;google_apis_playstore;x86_64" -d pixel_8

# 4. Launch it
emulator -avd Pixel_8_API_36 -no-snapshot-load -gpu auto
```

Wait for boot completion before building:

```sh
adb wait-for-device shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'
```

### Multiple devices attached

`adb devices` can show both the emulator and a physical phone at once, e.g.:

```
emulator-5554    device
55240DLAQ000EQ   device
```

Target the emulator explicitly rather than letting a command pick ambiguously:

```sh
npx expo run:android --device Pixel_8_API_36   # AVD/device name, not the adb serial
# or, for plain adb commands:
adb -s emulator-5554 <command>
```

`expo run:android --device <name>` expects the **AVD name** (`Pixel_8_API_36`) or
a connected device's model name, not the `adb` serial (`emulator-5554`) — passing
the serial fails with `Could not find device with name: emulator-5554`. Find the
running AVD's name with `adb -s emulator-5554 emu avd name`.

## Daily loop

```sh
# First run, or after any native/config-plugin change (app.config.ts plugins,
# new native dependency, android/ios folder regenerated):
npx expo run:android --device Pixel_8_API_36

# Subsequent runs, once the dev client is already installed on the device —
# just restart the JS bundler and reconnect:
npx expo start --dev-client
```

`npx expo run:android` prebuilds `/android` (gitignored, regenerated on demand —
never hand-edit it), compiles the debug dev client via Gradle, installs it on the
target device and starts Metro. The very first Gradle build is slow (15–20
minutes observed on this machine, mostly native module compilation); subsequent
builds reuse Gradle's cache and finish in a fraction of the time.

**Windows long-path errors**: if Gradle fails with a path-length error, enable long
paths (needs an elevated prompt / admin rights, so this is a one-time human step,
not something the build script can do for itself):

```sh
git config --system core.longpaths true
```

...plus enabling the `LongPathsEnabled` registry key
(`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`) to `1` via `regedit` or Group
Policy, then a reboot.

**Known screenshot/screen-recording capture limitation on this AVD**: on the
WHPX-accelerated x86_64 image used here (`-gpu auto`, Windows Hypervisor
Platform), both `adb shell screencap` and `adb shell screenrecord` reliably
return blank/black frames while the app is visibly running correctly and
interactive on the emulator's own window — a known limitation of GPU-passthrough
capture paths on some Windows AVD configurations, not an app rendering bug.
Independent verification during development used `adb shell uiautomator dump`
(the accessibility tree), which reads real drawn content and is unaffected by the
GPU capture path, plus `adb logcat` for `ReactNativeJS: Running "main"` and the
absence of fatal exceptions. Prefer the emulator's own on-screen window for a
visual check; fall back to `uiautomator dump` for scripted/automated checks.

## iOS loop

No Mac is available, so iOS runs through an **EAS development build** installed
on the physical **iPhone XR** test device (A12, tops out at iOS 18 — anything
iOS 26-specific needs EAS Simulator, which is waitlist-only as of September
2026 with no GA date; the iPhone XR plus the Android emulator are the certain
path). This is **blocked on Apple Developer Program organisation enrolment**
(plan 00-20) — building and installing a development build on a physical device
requires a valid Apple Developer account and provisioning profile.

Once unblocked, the loop is:

```sh
eas build --profile development --platform ios
# install the resulting build on the iPhone XR via the EAS-provided link/QR code
npx expo start --dev-client
```

## Debug signing SHA-1

Needed for Google OAuth's Android client registration (plan 00-15). A debug SHA-1
is not secret — it identifies a locally-generated debug key, not a production
signing identity (EAS's managed keystore signs release builds, see plan 00-14).

```sh
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey \
  -storepass android -keypass android
```

This project's debug keystore (checked in as part of the Expo prebuild template
at `android/app/debug.keystore`, gitignored along with the rest of `/android`
since it's regenerated by `expo prebuild` on every native rebuild — re-run this
command after any full `android/` regeneration to confirm it hasn't changed):

```
SHA1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
SHA256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

Note: this is Expo's standard template debug keystore, shared across many Expo
projects that haven't customized it — it uniquely identifies "a debug build from
this template," not uniquely "this project." That's expected and fine for a debug
key; it never signs anything released to a store.
