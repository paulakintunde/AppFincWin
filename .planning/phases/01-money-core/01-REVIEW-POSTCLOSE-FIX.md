---
phase: 01-money-core
fixed_at: 2026-09-26T00:00:00Z
review_path: .planning/phases/01-money-core/01-REVIEW-POSTCLOSE.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report (post-close PRs)

**Fixed at:** 2026-09-26
**Source review:** .planning/phases/01-money-core/01-REVIEW-POSTCLOSE.md
**Iteration:** 1
**Scope:** Critical + Warning (CR-01, WR-01..WR-06). The IN-01..IN-05 items were out of scope and were not attempted.

**Summary:**
- Findings in scope: 7
- Fixed: 7 (CR-01 and WR-03 are flagged for human verification because they change logic)
- Skipped: 0

**Checks after all fixes:** `npx tsc --noEmit` clean. `npm run lint` shows 0 errors and 20 warnings, all in files this pass did not touch. Full `npx jest` passed: 76/76 suites, 1227/1227 tests. One earlier full run had a single timeout failure in `src/features/you/__tests__/YouScreen.test.tsx` ("renders the user's full name and email sub-label"), the first test in that file. That file and `YouScreen.tsx` are untouched, both hooks are mocked there, the file passed 13/13 on every run on its own, and the next full run was green. It is a cold-render timeout under load that was already there before this pass, not a regression.

## Fixed Issues

### CR-01: A stale persisted `'granted'` turns on PostHog and identifies the user even when the server says `'declined'`

**Files modified:** `src/features/consent/useConsent.ts`, `src/features/consent/__tests__/useConsent.test.tsx`
**Commit:** 34d7bb2
**Status:** fixed: requires human verification
**Applied fix:** The enable effect now runs only when the profile row is `fresh`, meaning it was fetched or written this session. A persisted `'granted'` never calls `enable()`/`identify` before the server has confirmed it. A fresh value that is no longer `'granted'` (declined or null) calls `disable()` and resets the guard. `grant()`/`decline()` now keep `enabledOnceRef` in sync, so the effect does not call `enable` a second time. The D-17 redirect gate (`loading`/`needsPrompt`/`awaitingFresh`) is left unchanged on purpose: a cached `'granted'`/`'declined'` never redirects, so extending `awaitingFresh` would only add a network wait to every cold start. Tests added: a cached granted row with the server returning declined never enables; a cached granted row enables once after the fresh fetch; a later fresh refetch returning declined disables. Two of the three fail against the old code.

### WR-01: `decline()` no longer disables analytics on the device when the server write fails

**Files modified:** `src/features/consent/useConsent.ts`, `src/features/consent/__tests__/useConsent.test.tsx`
**Commit:** db5d441
**Applied fix:** `decline()` now calls `getAnalytics().disable()` before the server write and returns the write result, so it still returns `false` on failure. After a failed write the stored row still reads `'granted'`, which would let any other or later-mounted `useConsent` consumer turn analytics back on. To prevent that, a module-level "declined on this device" flag blocks the enable effect for that user. A successful `grant()` clears the flag, and so does a registered sign-out wipe handler (`consent-declined-locally`). The test covers a failed decline (disable is called and the result is `false`) followed by a remount and refetch that must not re-enable. A mutation check confirmed the test fails without the flag.

### WR-02: A failed consent write silently resets the screen to idle

**Files modified:** `src/features/consent/ConsentScreen.tsx`, `src/features/consent/__tests__/ConsentScreen.test.tsx`, `src/i18n/locales/en.ts`, `src/i18n/copyStatus.ts`
**Commit:** 61d3095
**Applied fix:** Both buttons now go through one `choose()` handler. It catches a thrown `grant()`/`decline()` (reported with `captureError(..., { area: 'unknown' })`), always puts the status back to `idle` on failure, and shows an inline `accessibilityRole="alert"` line with the new `consent.saveFailed` copy ("Your choice didn’t save. Try again."). The line uses the `colors.danger` token and the existing `space`/`fontSize` tokens, styled like WelcomeScreen's sign-in error. The new key is listed in `DRAFT_COPY_KEYS`. Tests: the error appears on a `false` result and clears on a retry that saves; a thrown `grant()` leaves both buttons enabled and shows the error. Not applied: the review's optional idea of not redirecting to /consent while the profile fetch is paused offline. The inline error now tells the user why they are stuck, so that change is left as a follow-up.

### WR-03: A stale cached theme wins over the server, and the guard is not reset by the sign-out wipe

**Files modified:** `src/features/you/useProfile.ts`, `src/features/you/__tests__/useProfile.test.tsx`
**Commit:** 858a58e
**Status:** fixed: requires human verification
**Applied fix:** `applyRemote` now runs only once the row is `fresh`, so a persisted copy can no longer satisfy the once-per-user guard. On cold start the ThemeProvider's own theme cache covers the gap before the fetch. `appliedThemeUserId` is now also cleared by a registered wipe handler (`profile-theme-guard`), so a same-user sign-out and sign-in gets the saved theme back even though the `(app)` group never renders a signed-out caller. Tests: a stale cached row does not apply its theme and the fresh fetch applies the server theme exactly once; unmount, wipe and remount for the same user applies the theme again. `beforeEach` now calls `wipeDeviceData()`, which also removes the order dependence described in IN-04.

### WR-04: `initErrorReporting()` runs after imports that call `getEnv()` at load time

**Files modified:** `src/services/errors/boot.ts` (new), `app/_layout.tsx`, `src/services/errors/__tests__/boot.test.ts` (new)
**Commits:** 49aa640, e7bfe3e (lint-only follow-up in the test)
**Applied fix:** A new side-effect module, `src/services/errors/boot.ts`, calls `initErrorReporting()`. `app/_layout.tsx` now imports it first, before `@/i18n`, and the old body-level call is gone. Tests: importing boot runs init; loading the real `app/_layout` with `getEnv()` mocked to throw records `initErrorReporting` before `getEnv`; a source check keeps `import '@/services/errors/boot';` as the layout's first import. The first two tests fail against the old layout.

### WR-05: The fatal-persist delay stays installed when `Sentry.init` throws

**Files modified:** `src/services/errors/errorReporter.ts`, `src/services/errors/__tests__/errorReporter.test.ts`
**Commit:** fb5fcec
**Applied fix:** The previous global handler is saved before `installFatalPersistDelay`. If `sentry.init` throws and the delay had been installed, that handler is put back, and the error is re-thrown into the existing outer catch (`'failed'` plus a warning). Test: when init throws, the global handler is the original again and a fatal reaches it at once, with no timer.

### WR-06: The 3 s fatal delay also runs on iOS

**Files modified:** `src/services/errors/errorReporter.ts`, `src/services/errors/__tests__/errorReporter.test.ts`
**Commit:** 5e62adc
**Applied fix:** A new export, `defaultFatalPersistDelayMs()`, returns `FATAL_PERSIST_DELAY_MS` only when `!__DEV__ && Platform.OS === 'android'` and 0 otherwise. `initErrorReporting` uses it when no explicit `fatalPersistDelayMs` is passed. Tests: a table of android/ios by `__DEV__` values, plus checks that `initErrorReporting` leaves the handler alone on an iOS release build and installs the delay on an Android release build.

---

_Fixed: 2026-09-26_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
