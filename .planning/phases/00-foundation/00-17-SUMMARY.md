---
phase: 00-foundation
plan: 17
subsystem: ui
tags: [expo-router, root-layout, welcome-screen, apple-sign-in, google-sign-in, reanimated, splash-screen, min-version-gate]

# Dependency graph
requires:
  - phase: 00-foundation (plan 11)
    provides: "ThemeProvider, useTheme, useThemeFonts, Screen, theme tokens/layout/typography"
  - phase: 00-foundation (plan 12)
    provides: "typed i18n catalogue (react-i18next), auth.welcome.*/auth.apple.*/auth.google.*/update.* keys already final"
  - phase: 00-foundation (plan 15)
    provides: "AuthProvider/useAuth (status, signInWithApple, signInWithGoogle), src/services/auth"
  - phase: 00-foundation (plan 16)
    provides: "src/services/errors (initErrorReporting, captureError), already wired at app/_layout.tsx module load"
provides:
  - "src/features/system/{minVersion,useMinVersionGate,routeDecision}.ts + UpdateRequiredScreen.tsx -- FND-09/D-25 minimum-version gate and blocking update screen"
  - "src/features/auth/{WelcomeScreen,AppleSignInButton,GoogleSignInButton}.tsx + brand/{AppleMark,GoogleMark}.tsx -- D-10/D-11/D-12 welcome/sign-in screen"
  - "app/_layout.tsx, app/index.tsx, app/(auth)/*, app/update-required.tsx -- the composed root: providers, splash gating, Stack.Protected routing, RouteContext"
affects: ["00-18 (creates the (app) group / you.tsx that app/index.tsx already redirects to via a forward-cast Href)", "00-19 (device persistence proof runs against this same root)", "00-20 (Apple provider config flips EXPO_PUBLIC_APPLE_SIGNIN_ENABLED, which this plan's disabled-state UI already reads live)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveRoute({gate, auth}) is one pure function with no React/Router import: 'blocked' always wins over auth state (version gate can never be bypassed by being signed in), 'checking'/'loading' collapse to 'splash', otherwise auth decides welcome vs. app"
    - "app/_layout.tsx's Gate component renders null (splash stays up) until theme.ready && fontsLoaded && route !== 'splash', with a 5s hard timeout that force-renders and captureError(area:'boot') rather than risk a stuck splash forever"
    - "The resolved route is shared via a RouteContext from app/_layout.tsx to app/index.tsx, rather than app/index.tsx re-running useMinVersionGate()/useAuth() itself -- avoids a second version-gate network round-trip and a possible blank-screen flash on every cold boot"
    - "AppleSignInButton/GoogleSignInButton: a single outer Pressable owns accessibilityRole/disabled/onPress on both platforms; the platform-specific visual (native AppleAuthenticationButton on iOS, a hand-drawn HIG pill on Android) is wrapped in a pointerEvents='none' View so touch handling and disabled/in-flight state are identical regardless of which visual is showing"
    - "Brand marks (Apple, Google) are fetched from each platform's own live asset endpoints, not hand-drawn -- see file-header comments in src/features/auth/brand/ for exact source URLs and the reasoning per mark"

key-files:
  created:
    - src/features/system/minVersion.ts
    - src/features/system/useMinVersionGate.ts
    - src/features/system/routeDecision.ts
    - src/features/system/UpdateRequiredScreen.tsx
    - src/features/system/__tests__/minVersionGate.test.ts
    - src/features/system/__tests__/routeDecision.test.ts
    - app/update-required.tsx
    - src/features/auth/WelcomeScreen.tsx
    - src/features/auth/AppleSignInButton.tsx
    - src/features/auth/GoogleSignInButton.tsx
    - src/features/auth/brand/AppleMark.tsx
    - src/features/auth/brand/GoogleMark.tsx
    - src/features/auth/__tests__/WelcomeScreen.test.tsx
    - app/(auth)/_layout.tsx
    - app/(auth)/welcome.tsx
    - assets/brand/google-g-mark.png
  modified:
    - app/_layout.tsx
    - app/index.tsx

key-decisions:
  - "Google's official Sign-in-with-Google button asset (fetched live from developers.google.com/identity/branding-guidelines's signin-assets.zip, 2026-09-25) has been redesigned since the brief was written: the flat four-colour G is gone, replaced by a masked group of blurred gradient ellipses. Confirmed by downloading the real asset and cross-checking against the guidelines page's own standalone g-logo.png, which matches"
  - "GoogleMark.tsx renders that official mark as a pre-rasterised PNG (Google's own standalone g-logo.png), not an SVG reproduction -- react-native-svg's <Filter>/<FeGaussianBlur>+<Mask> combination passed in Jest but rendered nothing on a real Android device (confirmed live via APK screenshot before and after the fix); the PNG approach is guaranteed to render identically cross-platform"
  - "app/index.tsx reads the already-resolved route from a RouteContext provided by app/_layout.tsx's Gate, rather than re-invoking useMinVersionGate()/useAuth() a second time -- avoids doubling the version-gate network call and a possible blank-screen flash on cold boot"
  - "The '/you' redirect target (created by 00-18) is force-cast through Href since it doesn't exist as a route yet; Expo Router's generated route types (when present) would otherwise fail tsc on that literal forward reference"

patterns-established:
  - "A single outer Pressable owns interaction/accessibility state for any button whose visual differs by platform (native SDK component vs. hand-drawn), with the platform-specific visual wrapped pointerEvents='none' underneath"
  - "Brand-mark components live in src/features/*/brand/, are the sole DSG-02 token exception, and document their exact fetch source and any live-device rendering caveats in a file-header comment"

requirements-completed: [FND-09, DSG-03, ACC-01, ACC-02, FND-07]

# Metrics
duration: ~2h (including live Android emulator verification and a real-device rendering bug found and fixed)
completed: 2026-09-25
---

# Phase 00 Plan 17: Root Welcome Summary

**The composed app root (providers, 5s-timeout splash gating, Stack.Protected routing) and the D-10/D-11/D-12 welcome/sign-in screen with Apple and Google buttons, plus the FND-09 minimum-version gate and its blocking update-required screen -- verified rendering correctly on a real Android emulator against the production Supabase environment.**

## Performance

- **Duration:** ~2h (three autonomous tasks, no checkpoints; included a full live-device verification pass and a real bug found/fixed during it)
- **Completed:** 2026-09-25
- **Tasks:** 3 (all `type="auto"`, Task 1 and Task 2 `tdd="true"`)
- **Files modified:** 16 created, 2 modified

## Accomplishments
- **FND-09 / D-25 minimum-version gate**: `compareVersions`/`isBelowMinimum` (hand-rolled, no semver dependency) and `fetchMinSupportedVersion` (fail-open on error, exception or a >3s timeout) against `public.app_config`; `useMinVersionGate` re-checks on `AppState` 'active'; `resolveRoute` is one pure function where a blocked gate always wins over auth state
- **`UpdateRequiredScreen`**: blocking, no dismiss, Android `BackHandler` traps the hardware back button, deep-links to the platform store listing (`market://`/Play Store web fallback on Android, `itms-apps://`/apps.apple.com on iOS)
- **D-10/D-11/D-12 welcome screen**: wordmark + tagline + Apple/Google sign-in pills, in-flight disabling of both buttons, a generic sign-in-failed error routed through `captureError(area:'auth')`, the Apple button's pre-enrolment disabled state (opacity .4 + pending-enrolment note) driven live by `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED`
- **Official brand marks**: Apple's logo fetched from `developer.apple.com/apple-logo.svg` (no login gate); Google's mark fetched from its `signin-assets.zip` / standalone `g-logo.png` (see Decisions below for the live-discovered redesign and the PNG-vs-SVG fix)
- **The composed root** (`app/_layout.tsx`): `GestureHandlerRootView` > `SafeAreaProvider` > `ThemeProvider` > `AuthProvider` > `ReducedMotionConfig(System)` > `Gate`, which holds the splash (`SplashScreen.preventAutoHideAsync()`) until theme, fonts and the version/auth gate all settle (or a 5s hard timeout fires and reports via `captureError(area:'boot')`), then renders a `Stack` with three `Stack.Protected` groups keyed off `resolveRoute()`
- **Live verification on a real Android emulator**: installed a pre-built dev-client APK (native deps unchanged since 00-04), ran Metro from this worktree, deep-linked into it, and confirmed via both a `uiautomator` accessibility dump and a real `screencap` screenshot that the welcome screen renders exactly per D-10/D-11/D-12 -- wordmark, tagline, disabled Apple pill with its pending-enrolment note, and the Google outline pill

## Task Commits

1. **Task 1: Min-version gate logic, route decision, update-required screen** (TDD) -- `6d2b137` (feat)
2. **Task 2: Welcome screen with Apple and Google buttons and the brand marks** (TDD) -- `a5d13fb` (feat)
3. **Task 3: Root layout (providers, splash gating, protected routing, reduce-motion, error reporting)** -- `ed1c945` (feat), includes the live-discovered `GoogleMark` fix (see Deviations)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `src/features/system/minVersion.ts` -- `compareVersions`, `isBelowMinimum`, `fetchMinSupportedVersion`
- `src/features/system/useMinVersionGate.ts` -- gate hook, re-checks on `AppState` active
- `src/features/system/routeDecision.ts` -- `resolveRoute({gate, auth})`
- `src/features/system/UpdateRequiredScreen.tsx` -- blocking update screen
- `app/update-required.tsx` -- route wrapper
- `src/features/auth/WelcomeScreen.tsx` -- welcome/sign-in screen
- `src/features/auth/AppleSignInButton.tsx` -- native iOS button / Android HIG pill
- `src/features/auth/GoogleSignInButton.tsx` -- outline pill with the official G mark
- `src/features/auth/brand/AppleMark.tsx` -- official Apple logo SVG + `APPLE_BUTTON_BLACK`
- `src/features/auth/brand/GoogleMark.tsx` -- official Google G mark (PNG, see Decisions)
- `assets/brand/google-g-mark.png` -- the official standalone mark asset
- `app/(auth)/_layout.tsx`, `app/(auth)/welcome.tsx` -- non-dismissible auth route group
- `app/_layout.tsx` -- composed root, `Gate`, `RouteContext`
- `app/index.tsx` -- redirect off `RouteContext`

## Decisions Made
See `key-decisions` in the frontmatter. In brief: Google's live sign-in button asset has been redesigned since the brief was written (gradient-blob G, not flat four-colour); the SVG reproduction of that redesign doesn't render on real Android devices via react-native-svg's filter/mask support, so `GoogleMark` uses Google's own official pre-rasterised PNG instead; `app/index.tsx` shares the already-resolved route via context rather than re-running the gate hooks a second time; the forward-referenced `/you` route (created by 00-18) is explicitly cast through `Href`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Google's live sign-in button asset is a different design than the plan assumed, and its SVG reproduction didn't render on a real Android device**
- **Found during:** Task 3's live emulator verification (a real screenshot, not Jest)
- **Issue:** The plan's action text for `GoogleMark.tsx` assumed the classic flat four-colour "G" and instructed extracting SVG path/fill data. Live-downloading Google's actual current asset (`signin-assets.zip` from `developers.google.com/identity/branding-guidelines`) showed Google redesigned the mark to a masked group of blurred, gradient-coloured ellipses. The first implementation reproduced that faithfully via `react-native-svg`'s `<Mask>`/`<Filter>`/`<FeGaussianBlur>`, which passed unit tests but rendered as a blank gap on a real Android device (react-native-svg's Android/Canvas backend doesn't support that filter+mask combination -- no error was logged, it just silently drew nothing).
- **Fix:** Switched `GoogleMark.tsx` to render Google's own official pre-rasterised standalone mark (`g-logo.png`, fetched directly from the same guidelines page, transparent background, confirmed pixel-identical to the button asset's "G") via a plain `Image`, bundled at `assets/brand/google-g-mark.png`. Re-verified on-device: the mark now renders correctly.
- **Files modified:** `src/features/auth/brand/GoogleMark.tsx`, `assets/brand/google-g-mark.png` (new)
- **Verification:** Real Android emulator screenshot (before: empty gap where the mark should be; after: the multicolour G renders correctly), plus the full Jest suite and `noRawColours.test.ts` still passing
- **Committed in:** `ed1c945`

**2. [Rule 3 - Blocking] `app/index.tsx`'s literal `<Redirect href="/you" />` fails `tsc` once Expo Router's generated route types are present**
- **Found during:** Task 3, after running `expo start` locally generated `.expo/types/router.d.ts` (gitignored, not present by default, but present once a dev server has run)
- **Issue:** Expo Router's typed-routes feature narrows `Href` to a union of known routes once its type generator runs. `/you` (created by 00-18, not this plan) isn't a known route yet, so the literal string fails `tsc --noEmit` whenever that generated file exists.
- **Fix:** Extracted the target to a `const APP_HOME_HREF = '/you' as Href` with an explanatory comment, so it type-checks whether or not the generated file is present, and becomes literally correct once 00-18 adds the route.
- **Files modified:** `app/index.tsx`
- **Verification:** `npx tsc --noEmit` clean both with and without `.expo/types/router.d.ts` present
- **Committed in:** `ed1c945`

---

**Total deviations:** 2 auto-fixed (1 live-device-discovered rendering bug, 1 blocking type-check fix). Both are corrections to code this plan itself introduced, not scope creep.
**Impact on plan:** No scope change. The Google mark now renders correctly on real devices (the whole point of D-12); the `/you` forward-reference type-checks in every environment.

## Issues Encountered

- **Metro's default port (8081) was already bound** by an orphaned process from an earlier background-command attempt in this same session; resolved by reusing that already-running, correctly-configured Metro instance rather than fighting `EADDRINUSE`.
- **The dev-client app first opened into Expo's Dev Launcher / Dev Menu**, not the app itself -- resolved by deep-linking directly to the Metro URL (`fincwin://expo-development-client/?url=...`) rather than relying on mDNS auto-discovery inside the launcher UI.
- **This worktree had no `.env.local`** (gitignored, per-worktree). Copied it from the main checkout (`C:/dev/fincwin/.env.local`, same single production Supabase project per `CLAUDE.md`) so the live verification could run against real config rather than being skipped.

## User Setup Required

None. Everything needed for this plan's own scope was available (Google/Apple assets were live-fetchable without authentication; the Supabase config already existed in another worktree's `.env.local`).

## Next Phase Readiness

- 00-18 can now add the `(app)` route group and `you.tsx` -- `app/_layout.tsx`'s `Stack.Protected guard={route === 'app'}` and `app/index.tsx`'s `/you` redirect are both already wired and waiting for that screen to exist (Expo Router currently logs an unknown-screen-name warning for `(app)`, which is expected and resolves itself once 00-18 lands)
- 00-19's device-persistence proof and 00-20's Apple-provider config both build on this same root layout and welcome screen as-is
- The `AWAITING_COPY_KEYS` list in `src/i18n/copyStatus.ts` was already empty before this plan (the welcome tagline was supplied 2026-09-25) -- no outstanding user-copy blocker remains from this screen

## Known Stubs

None. `app/(app)` itself doesn't exist yet (that's 00-18's own scope, not a stub in this plan's own deliverables), and `Stack.Protected guard={route === 'app'}`/the `/you` redirect are both fully implemented against that eventual screen, not hardcoded or faked.

---
*Phase: 00-foundation*
*Completed: 2026-09-25*

## Self-Check: PASSED

All 17 key files verified present on disk. All 3 task commits (`6d2b137`, `a5d13fb`, `ed1c945`) confirmed present in `git log --oneline --all`.
