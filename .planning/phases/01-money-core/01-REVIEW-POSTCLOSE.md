---
phase: 01-money-core
reviewed: 2026-09-26T12:00:00Z
depth: deep
files_reviewed: 16
files_reviewed_list:
  - app/_layout.tsx
  - src/features/you/YouScreen.tsx
  - src/features/you/components/DevSyncProbe.tsx
  - src/features/you/__tests__/DevSyncProbe.test.tsx
  - src/i18n/copyStatus.ts
  - src/i18n/locales/en.ts
  - src/config/env.ts
  - src/services/errors/errorReporter.ts
  - src/services/errors/__tests__/errorReporter.test.ts
  - src/data/keys.ts
  - src/features/consent/ConsentScreen.tsx
  - src/features/consent/useConsent.ts
  - src/features/you/useProfile.ts
  - src/features/you/__tests__/useProfile.test.tsx
  - src/ui/AppStatusBar.tsx
  - src/ui/Screen.tsx
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 01: Post-Close Code Review Report (PRs #19, #25, #28, #29, #30)

**Reviewed:** 2026-09-26T12:00:00Z
**Depth:** deep (cross-file; each PR's own diff, then how the merged pieces behave together on `main`)
**Files Reviewed:** 16 source/test files (PR #30 is docs only. I scanned it for secrets and found none: only the public project ref, names and digests)
**Status:** issues_found

## Summary

Scope: the source diffs of merges 147f2f5 (#25), 1f4180a (#30), 787a39f (#19), bbe294b (#28) and 4066051 (#29), with `.planning/` excluded. Line numbers refer to `main` (HEAD 1d5aff9).

The main problem is in PR #28. It moved the profile row, including `analytics_consent`, into the persisted TanStack cache. The "wait for the fresh fetch" guard only protects against a stale `null`. A stale `'granted'` still turns PostHog on and sends an `$identify` before the server copy arrives. Nothing ever turns it off again when the server says `'declined'`. That is a GDPR consent violation.

PR #28 also stopped `decline()` from disabling analytics on the device when the server write fails. It removed the consent screen's redirect loop but left no error feedback in its place.

PR #19 works on its own branch. On today's `main`, though, `initErrorReporting()` runs after the hoisted imports in `app/_layout.tsx`, and those imports load the Supabase client, which calls `getEnv()` as soon as it loads. So the misconfigured-env case PR #19 was built for still crashes before Sentry exists.

The fatal-persist delay is bounded (one `setTimeout`, 3000 ms). It does not call handlers twice, because Sentry's own `handlingFatal` guard stops repeat fatals. It is off under `__DEV__`, so the dev red-box is unaffected. But it is not undone if `Sentry.init` throws, and it also runs on iOS, where the PR's own notes say it is not needed.

PR #29 (status bar / safe area) and PR #25's wiring are sound. The only issues there are minor ones in the dev-only probe and a brittle test.

## Critical Issues

### CR-01: A stale persisted `'granted'` turns on PostHog and identifies the user even when the server says `'declined'`; nothing turns it off again

**File:** `src/features/consent/useConsent.ts:34-37, 78-88` (with `src/features/you/useProfile.ts:74-78` and `src/data/cache/persister.ts` `shouldDehydrateQuery`)

**Issue:** Before PR #28, `useProfile` kept the row in component state that was filled only by a live server fetch. PR #28 moved it into `queryKeys.profile(userId)`, and that key is persisted to disk: `shouldDehydrateQuery` keeps every successful query for 30 days. On a cold start the cached row is restored before any refetch runs.

- `awaitingFresh` (line 36) only holds back the result when the cached `consent === null`. A cached `'granted'` is treated as trustworthy at once.
- The enable-once effect (lines 78-88) then calls `getAnalytics().enable(user.id)`. That calls `client.optIn()` and `client.identify(userId)` in `posthog.ts:75-78`, so an `$identify` event goes to PostHog EU on the first render after the cache is restored.
- If the fresh fetch then returns `'declined'` (for example, the user withdrew consent on another device or through support), the effect has no branch that disables analytics. `enabledOnceRef` stays `true`, and every later `track()` call in `useProfile.setAccent` / `setPairing` still sends events for the rest of the session.

This breaks D-17 / GDPR consent: data is processed after consent was withdrawn. PR #30's acceptance evidence counted exactly `$identify` + `analytics_opted_in` on a clean device, so this path was never tested.

**Fix:** Only act on consent that is confirmed fresh, and follow changes in both directions:
```ts
const trusted = fresh || !fetching; // or: require `fresh` before enabling
useEffect(() => {
  if (!user) { enabledOnceRef.current = false; return; }
  if (!trusted) return;
  if (consent === 'granted' && !enabledOnceRef.current) {
    getAnalytics().enable(user.id);
    enabledOnceRef.current = true;
  } else if (consent !== 'granted' && enabledOnceRef.current) {
    void getAnalytics().disable();
    enabledOnceRef.current = false;
  }
}, [consent, user, trusted]);
```
Also extend `awaitingFresh` to cover any cached consent value, not just `null`. Add a test that seeds the cache with `'granted'`, returns `'declined'` from the fetch, and asserts `enable` was never called (or that `disable` was called).

## Warnings

### WR-01: `decline()` / turning the toggle off no longer disables analytics on the device when the server write fails

**File:** `src/features/consent/useConsent.ts:48, 67-72`

**Issue:** `writeConsent` now returns `false` on a Supabase error (line 48), and `decline()` returns early before `getAnalytics().disable()`. The old code always ran `disable()` after the write attempt. Now a user who turns analytics off in You while offline or on a flaky network stays opted in: PostHog keeps capturing. The only sign is that the toggle does not move. Withdrawing consent must take effect locally straight away (GDPR Art. 7(3): withdrawal must be as easy as giving consent). Retrying the server write is a separate concern.

**Fix:** Disable locally first, whatever the write result, then persist:
```ts
const decline = useCallback(async () => {
  await getAnalytics().disable();          // local effect is unconditional
  return writeConsent('declined');         // server record may retry / surface error
}, [writeConsent]);
```

### WR-02: A failed consent write silently puts the screen back to idle; the user can be stuck on /consent with no feedback

**File:** `src/features/consent/ConsentScreen.tsx:20-30`

**Issue:** `setStatus((await grant()) ? 'done' : 'idle')` gives no error copy, toast or haptic when the write fails. When the device is offline at cold start, the profile fetch is `paused`, so `fetching` is false and `awaitingFresh` is false. A restored `null` consent then sets `needsPrompt = true` and redirects to /consent. Every tap there fails. The screen has `gestureEnabled: false` and no skip control, so the user cannot get into the app until the network comes back, and nothing tells them why. Separately, `grant()` can reject: `getAnalytics()` calls `getEnv()`, and `enable()` throws on a non-UUID. That rejection leaves `status` stuck at `'busy'` with both buttons disabled for good.

**Fix:** Wrap the handlers in `try/finally` so the status always resets, and show an inline error line from the catalogue (for example `consent.saveFailed`) when the result is `false`. Consider not redirecting to /consent while the profile fetch is `paused` and the only copy is a restored one (the offline version of the `awaitingFresh` idea).

### WR-03: The module-level `appliedThemeUserId` lets a stale cached theme win over the server, and it is not reset by the sign-out wipe

**File:** `src/features/you/useProfile.ts:62, 89-99`

**Issue:** There are two problems.

1. The guard is set on the first `profile` value, which is now the row restored from the persisted cache. When the fresh fetch returns a different accent or font pairing (changed on another device), `appliedThemeUserId === profile.id`, so `applyRemote` is skipped and the stale theme stays. Before PR #28 the theme was applied only from a live fetch.
2. The guard is cleared only inside an effect of a mounted `useProfile` consumer that sees `userId === null`. All three consumers (the `(app)` layout, YouScreen, ConsentScreen) live in the `(app)` group, and that group is removed by `Stack.Protected` when auth flips. Nothing guarantees they render once with `user === null`. If they don't, the same user signing back in (after `performSignOut` → `resetTheme()`) never gets `applyRemote`: the saved theme is replaced by the defaults, which are then written to the theme cache. The file's own comment claims the opposite.

**Fix:** Clear the guard from a wipe handler, the way `failedWrites.ts` does:
```ts
registerWipeHandler({ id: 'profile-theme-guard', wipe: async () => { appliedThemeUserId = null; } });
```
Apply the theme only when `fresh` is true, or re-apply when the fresh row's accent or pairing differs from the one last applied, instead of once per user id.

### WR-04: On `main`, `initErrorReporting()` runs after imports that call `getEnv()` as soon as they load, so an env mistake still crashes before Sentry exists

**File:** `app/_layout.tsx:1-19` (together with `src/services/supabase/client.ts:13` `const env = getEnv();` and `src/features/auth/AuthProvider.tsx:6`)

**Issue:** PR #19's stated goal was that "crash reporting must survive a misconfigured environment elsewhere in the app". Its branch had a bare `_layout.tsx`. After PRs #25 and #29 merged, `_layout.tsx` statically imports `AuthProvider` (line 9) and `QueryProvider` (line 13). ES imports are hoisted and run before the module body, so `AuthProvider` → `@/services/supabase` → `client.ts` runs `getEnv()` first. With the exact incident PR #19 describes (a quoted `EXPO_PUBLIC_SUPABASE_URL`), `getEnv()` throws while the imports are loading, the root layout module fails, and line 19 `initErrorReporting()` never runs. The boot crash goes unreported. The comment "before anything else can throw" is false.

**Fix:** Move initialisation into a side-effect module and import it first:
```ts
// src/services/errors/boot.ts
import { initErrorReporting } from './errorReporter';
initErrorReporting();

// app/_layout.tsx — must be the very first import
import '@/services/errors/boot';
import '@/i18n';
```
Alternatively, use a custom `index.js` entry that initialises before `expo-router/entry`. `errorReporter.ts` imports only `@/config/env`, which does not throw when it loads, so it is safe to put first. Add a test that fails if any import comes before the boot import.

### WR-05: The fatal-persist delay stays installed when `Sentry.init` throws, so crashes freeze for 3 s with no reporting

**File:** `src/services/errors/errorReporter.ts:198-201, 222-228`

**Issue:** `installFatalPersistDelay` changes `ErrorUtils` globally before `sentry.init(...)`. If `init` throws, the catch block resets `activeSentry` and returns `'failed'`, but the delaying handler is left in place. Every fatal JS error then leaves the user on a frozen screen for 3 s with no Sentry flush to justify it. During that time the JS thread is not blocked, so timers, queued-mutation resumes and the throttled persister can still run against state that has already failed. The test "returns failed ... when Sentry.init itself throws" does not check the global handler.

**Fix:** Keep the previous handler and put it back on failure:
```ts
const errorUtils = options.errorUtils ?? globalErrorUtils();
const previous = errorUtils?.getGlobalHandler();
const installed = installFatalPersistDelay(errorUtils, delay);
try { sentry.init(...) } catch (e) {
  if (installed && previous) errorUtils!.setGlobalHandler(previous);
  throw e; // into the outer catch
}
```
Add a test that asserts `setGlobalHandler` was restored after `init` throws.

### WR-06: The 3 s fatal delay also runs on iOS, which the fix's own notes say persists fatal events synchronously

**File:** `src/services/errors/errorReporter.ts:94-106, 199-201`

**Issue:** The doc comment says: "iOS stores fatal envelopes synchronously upstream (sentry-react-native PR 3031); Android has no equivalent." The default `fatalPersistDelayMs` is still `__DEV__ ? 0 : 3000` on every platform. So every iOS release crash sits frozen for 3 s for no benefit, and iOS is the platform where a hung screen before termination is most noticeable during App Review.

**Fix:** Gate the default on the platform: `options.fatalPersistDelayMs ?? (__DEV__ || Platform.OS !== 'android' ? 0 : FATAL_PERSIST_DELAY_MS)`. Add a test for the default on each platform. No current test checks the default (every test passes `fatalPersistDelayMs` explicitly).

## Info

### IN-01: The dev sync probe can create duplicate "Sync test" accounts

**File:** `src/features/you/components/DevSyncProbe.tsx:31-44`

**Issue:** `accounts?.find(...)` is `undefined` while `useAccounts` is still loading, so a tap creates a new account. Two quick taps also both miss, because the optimistic row is added in `onMutate` only after `await qc.cancelQueries`. `prefs.home_currency` also falls back to `DEFAULT_MONEY_PREFS` (`USD`) before prefs have loaded, so the probe account can get the wrong currency. The test file's header says the probe never duplicates the account, but the tests only cover already-loaded data. This is dev only.

**Fix:** Return early while `accounts === undefined` or prefs are loading, and use a ref to ignore taps while a press is being handled.

### IN-02: The quote check makes any quoted optional `EXPO_PUBLIC_` var fatal for `getEnv()`, while the DSN is deliberately soft

**File:** `src/config/env.ts:73-79` (vs `readErrorTrackingEnv` at 178-196)

**Issue:** The quote loop runs over every `EXPO_PUBLIC_` key, optional ones included (`POSTHOG_KEY`, `IOS_APP_STORE_ID`, `APPLE_SIGNIN_ENABLED`, `SENTRY_DSN`). Values that used to be tolerated now make `getEnv()` throw, and `client.ts` calls `getEnv()` as soon as it loads, so the app crashes at boot. `readErrorTrackingEnv` handles the same quoted DSN softly on purpose. Failing loudly is a reasonable policy, but the two readers now disagree, and leading or trailing whitespace (the other common paste mistake) is still not caught.

**Fix:** Write down the policy. Either report quoted optional keys the way the DSN is reported, or keep them fatal and add a CI check on `eas env:list` output. Consider catching values that differ from their `.trim()` as well.

### IN-03: `initErrorReporting` returns `'enabled'` for a whitespace or invalid DSN

**File:** `src/config/env.ts` `readErrorTrackingEnv` (`sentryDsnRaw || undefined`) / `errorReporter.ts:186-222`

**Issue:** A DSN of `" "` or any malformed string passes the truthiness check. Sentry logs an error and disables itself, but the new status value reports `'enabled'`, which defeats the "a skipped init is never silent" goal.

**Fix:** Trim, and check the shape roughly (`/^https:\/\/[^@]+@[^/]+\/\d+$/`) before returning a DSN. Otherwise return `disabled-no-dsn` with the reason `'malformed'`.

### IN-04: The module-level `appliedThemeUserId` leaks between tests

**File:** `src/features/you/__tests__/useProfile.test.tsx:58-60` / `useProfile.ts:62`

**Issue:** Each test creates a fresh `QueryClient`, but the module-level guard carries over. Every test uses the same user id, so only the first test that loads a profile can see `applyRemote`. Any later test that asserts `applyRemote` will fail depending on test order. The "signed out" test only resets it by accident.

**Fix:** Export a test-only reset, or reset through the wipe handler recommended in WR-03 and call it in `beforeEach`.

### IN-05: The `AppStatusBar` test checks the root layout by running a regex over its source text

**File:** `src/ui/__tests__/AppStatusBar.test.tsx:26-30`

**Issue:** `readFileSync('app/_layout.tsx')` plus regex breaks on harmless reformatting (a props change, an import alias, the component being moved into a wrapper), and it still passes if the component sits in an unreachable branch.

**Fix:** Render `RootLayout` with the providers mocked and assert that the mocked `StatusBar` received `style: 'dark'`, or drop the second test and rely on the on-device DSG-03 acceptance.

---

_Reviewed: 2026-09-26T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
