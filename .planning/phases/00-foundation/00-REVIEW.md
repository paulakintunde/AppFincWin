---
phase: 00-foundation
reviewed: 2026-09-26T00:00:00Z
depth: standard
files_reviewed: 119
files_reviewed_list:
  - .dependency-cruiser.cjs
  - .env.example
  - .github/workflows/ci.yml
  - .gitignore
  - .gitleaks.toml
  - .npmrc
  - app.config.ts
  - app/(app)/_layout.tsx
  - app/(app)/consent.tsx
  - app/(app)/you.tsx
  - app/(auth)/_layout.tsx
  - app/(auth)/welcome.tsx
  - app/_layout.tsx
  - app/index.tsx
  - app/update-required.tsx
  - babel.config.js
  - eas.json
  - eslint.config.js
  - jest.config.js
  - jest.setup.ts
  - metro.config.js
  - package.json
  - scripts/check-coverage-ignores.mjs
  - scripts/verify-gates.mjs
  - src/README.md
  - src/config/__tests__/env.test.ts
  - src/config/env.ts
  - src/engine/guards/__tests__/assertNever.test.ts
  - src/engine/guards/assertNever.ts
  - src/features/auth/AppleSignInButton.tsx
  - src/features/auth/AuthProvider.tsx
  - src/features/auth/GoogleSignInButton.tsx
  - src/features/auth/WelcomeScreen.tsx
  - src/features/auth/__tests__/AuthProvider.test.tsx
  - src/features/auth/__tests__/WelcomeScreen.test.tsx
  - src/features/auth/__tests__/signOut.test.ts
  - src/features/auth/brand/AppleMark.tsx
  - src/features/auth/brand/GoogleMark.tsx
  - src/features/auth/signOut.ts
  - src/features/consent/ConsentScreen.tsx
  - src/features/consent/__tests__/ConsentScreen.test.tsx
  - src/features/consent/useConsent.ts
  - src/features/system/UpdateRequiredScreen.tsx
  - src/features/system/__tests__/minVersionGate.test.ts
  - src/features/system/__tests__/routeDecision.test.ts
  - src/features/system/minVersion.ts
  - src/features/system/routeDecision.ts
  - src/features/system/useMinVersionGate.ts
  - src/features/you/YouScreen.tsx
  - src/features/you/__tests__/YouScreen.test.tsx
  - src/features/you/__tests__/useProfile.test.tsx
  - src/features/you/components/AccentSwitcher.tsx
  - src/features/you/components/AnalyticsToggle.tsx
  - src/features/you/components/ConnectionStatus.tsx
  - src/features/you/components/FontPairingSwitcher.tsx
  - src/features/you/components/SettingsGroup.tsx
  - src/features/you/useProfile.ts
  - src/i18n/__tests__/catalogue.test.ts
  - src/i18n/__tests__/keys.typecheck.ts
  - src/i18n/copyStatus.ts
  - src/i18n/i18next.d.ts
  - src/i18n/index.ts
  - src/i18n/locales/en.ts
  - src/services/analytics/__tests__/catalogue.typecheck.ts
  - src/services/analytics/__tests__/config.test.ts
  - src/services/analytics/__tests__/consentGate.test.ts
  - src/services/analytics/catalogue.ts
  - src/services/analytics/index.ts
  - src/services/analytics/posthog.ts
  - src/services/auth/__tests__/apple.test.ts
  - src/services/auth/__tests__/firstAuthProfile.test.ts
  - src/services/auth/__tests__/nonce.test.ts
  - src/services/auth/apple.ts
  - src/services/auth/firstAuthProfile.ts
  - src/services/auth/google.ts
  - src/services/auth/index.ts
  - src/services/auth/nonce.ts
  - src/services/errors/__tests__/errorReporter.test.ts
  - src/services/errors/__tests__/scrub.test.ts
  - src/services/errors/errorReporter.ts
  - src/services/errors/index.ts
  - src/services/errors/scrub.ts
  - src/services/storage/__tests__/wipe.test.ts
  - src/services/storage/wipe.ts
  - src/services/supabase/__tests__/connection.test.ts
  - src/services/supabase/__tests__/largeSecureStore.test.ts
  - src/services/supabase/client.ts
  - src/services/supabase/connection.ts
  - src/services/supabase/index.ts
  - src/services/supabase/largeSecureStore.ts
  - src/theme/ThemeProvider.tsx
  - src/theme/__tests__/noRawColours.test.ts
  - src/theme/__tests__/reducedMotion.test.tsx
  - src/theme/__tests__/screenInsets.test.tsx
  - src/theme/__tests__/themeSwitch.test.tsx
  - src/theme/accents.ts
  - src/theme/fonts.ts
  - src/theme/index.ts
  - src/theme/layout.ts
  - src/theme/motion.ts
  - src/theme/themeCache.ts
  - src/theme/tokens.ts
  - src/theme/typography.ts
  - src/ui/Screen.tsx
  - supabase/.gitignore
  - supabase/config.toml
  - supabase/functions/fx-sync/deno.json
  - supabase/functions/fx-sync/index.ts
  - supabase/functions/fx-sync/parse.test.ts
  - supabase/functions/fx-sync/parse.ts
  - supabase/migrations/20260922000100_household_of_one.sql
  - supabase/migrations/20260922000200_app_config.sql
  - supabase/migrations/20260922000300_fx_rates.sql
  - supabase/migrations/20260922000400_fx_sync_schedule.sql
  - supabase/tests/database/01_household_of_one.test.sql
  - supabase/tests/database/02_rls_isolation.test.sql
  - supabase/tests/database/03_app_config.test.sql
  - supabase/tests/database/04_fx_rates.test.sql
  - tsconfig.json
findings:
  critical: 2
  warning: 20
  info: 10
  total: 32
status: issues_found
---

# Phase 0: Code Review Report

**Reviewed:** 2026-09-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 119
**Status:** issues_found

## Summary

I reviewed the Foundation phase: auth (Apple/Google, nonce, PKCE, first-authorization profile capture), encrypted session storage, the sign-out device wipe, consent-gated analytics, Sentry scrubbing, the min-version gate, the four Phase 0 migrations and their pgTAP proofs, the fx-sync Edge Function entry point, and the CI gates.

Several things are correct. The nonce goes hashed to Apple and raw to Supabase. PKCE is configured for the Android web flow. RLS uses the initPlan form with a locked-down security-definer helper, and column-level grants on `profiles` keep `version` server-owned. The fx-sync secret is compared in constant time with `verify_jwt = false` scoped to that function. The analytics catalogue type guard is live.

The main problems:

1. **Availability.** One malformed `min_supported_version` value leaves every installed client on a blank screen.
2. **Device-wipe completeness.** The wipe only runs on user-initiated sign-out. Session expiry or revocation, a SIGNED_OUT event, never wipes.
3. **Consent handling.** Consent is enable-only. A withdrawal made on another device, or made while offline, does not stop tracking.
4. **CI self-test.** `verify-gates.mjs` has probes that cannot fail independently, so the gate self-test proves less than it claims.

## Critical Issues

### CR-01: A malformed `min_supported_version` bricks every client (blank screen, no recovery)

**File:** `src/features/system/useMinVersionGate.ts:26-33`, `src/features/system/minVersion.ts:33-52`, `supabase/migrations/20260922000200_app_config.sql:8-12`
**Issue:** `fetchMinSupportedVersion()` correctly fails open on network/timeout errors. But its result goes into `isBelowMinimum(current, min)` inside the `.then()` callback, and `compareVersions` **throws** on any non-numeric segment (`"1.2.0-beta"`, `"v1.2"`, `" 1.2.0"`, `"1.2.x"`). The throw rejects the `.then()` chain, which has no `.catch`, so `setState` is never called and the gate stays `'checking'`. `resolveRoute` then returns `'splash'`. After 5s, `Gate` forces `ready` via `timedOut`, but every `Stack.Protected` guard is false and `app/index.tsx` returns `null`, so every user sees a permanent blank screen. The same applies if `Application.nativeApplicationVersion` is ever non-numeric.

The value is server-controlled and shared by every client, and `app_config.value` is unconstrained `text`. A single typo in a migration is therefore a global outage, which directly contradicts the module's own contract ("a malformed response must never turn into an outage"). The fix can only ship through another migration.
**Fix:**
```ts
// minVersion.ts — make the gate total: malformed input fails open
export function isBelowMinimum(current: string, min: string): boolean {
  try {
    return compareVersions(current, min) < 0;
  } catch {
    return false; // malformed server/app version never blocks
  }
}
// useMinVersionGate.ts — never leave the promise chain unhandled
fetchMinSupportedVersion()
  .then((min) => { /* ... */ })
  .catch(() => { if (!cancelled) setState({ status: 'ok' }); });
```
```sql
-- new migration: constrain the value at the source
alter table public.app_config add constraint app_config_min_version_semver
  check (key <> 'min_supported_version' or value ~ '^\d+(\.\d+){0,2}$');
```

### CR-02: Device data is never wiped when the session ends without an explicit sign-out

**File:** `src/features/auth/AuthProvider.tsx:52-56`, `src/features/auth/signOut.ts:76-90`
**Issue:** D-15's wipe (`wipeDeviceData`, the analytics reset, the theme reset) only runs through `performSignOut()` from the You screen. `onAuthStateChange` handles `SIGNED_OUT` by setting `status = 'signedOut'` and nothing else. supabase-js also emits `SIGNED_OUT` when a refresh fails permanently: refresh token revoked or expired, "sign out other sessions", admin user deletion or ban, or `LargeSecureStore.getItem` dropping the blob (see WR-03). In all of these cases the app routes to Welcome and leaves the following on the device for the next person:

- every `fincwin:` key: the persisted query cache (Phase 1 handlers registered in `src/data/*`), the pending Apple profile (name and email), the theme and the failed-write log
- the PostHog identity, still opted in and identified with the previous UUID
- the Google account cache

On a shared device, the next user who signs in inherits this data. That breaks the "sign-out wipes the device" guarantee and the GDPR erasure posture. It also enables WR-09, where the pending profile replays against a different user.
**Fix:** Wipe on every transition from signed-in to signed-out, not just the button path. Keep `performSignOut` idempotent.
```tsx
const prevUserId = useRef<string | null>(null);
supabase.auth.onAuthStateChange((event, newSession) => {
  const nextId = newSession?.user.id ?? null;
  if (event === 'SIGNED_OUT' || (prevUserId.current && nextId !== prevUserId.current)) {
    void performSignOut({ /* supabase signOut already happened */ }).catch((e) => captureError(e, { area: 'auth' }));
  }
  prevUserId.current = nextId;
  setSession(newSession);
  // ...
});
```

## Warnings

### WR-01: The splash timeout fires on every launch and reports a false Sentry error

**File:** `app/_layout.tsx:52-58`
**Issue:** The timeout effect has `[]` deps and only clears its timer on unmount. `Gate` never unmounts, so 5s after every cold start, including ones that were ready in 300ms, it calls `setTimedOut(true)` and `captureError(new Error('Splash timeout…'), { area: 'boot' })`. Every release launch sends a bogus boot error, which floods Sentry and hides real boot stalls.
**Fix:** Clear the timer once `ready` is reached, and only report if boot really did not settle:
```tsx
useEffect(() => {
  if (ready) return;
  const timer = setTimeout(() => { setTimedOut(true); captureError(...); }, SPLASH_TIMEOUT_MS);
  return () => clearTimeout(timer);
}, [ready]);
```
(Compute `settled` without `timedOut` so the effect does not depend on itself.)

### WR-02: The boot-stall fallback renders a blank screen, and `getSession()` rejection is unhandled

**File:** `app/_layout.tsx:60-86`, `src/features/auth/AuthProvider.tsx:39-48`
**Issue:** When `timedOut` forces `ready` while `route === 'splash'`, all three `Stack.Protected` guards are false and `IndexRoute` returns `null`. The "render into whatever route is current" promise in the comment yields an empty screen. A primary way to reach this state is `supabase.auth.getSession()` rejecting (for example a storage or SecureStore error bubbling out of `LargeSecureStore.removeItem` inside `getItem`'s catch). The `.then()` has no `.catch`, so `status` stays `'loading'` forever.
**Fix:** Add `.catch(() => { setSession(null); setStatus('signedOut'); captureError(...) })` to `getSession()`. In `Gate`, map a timed-out `'splash'` to `'welcome'` (or render a retry screen) instead of rendering nothing.

### WR-03: A transient keychain/keystore error permanently destroys the session

**File:** `src/services/supabase/largeSecureStore.ts:60-70, 36-42`
**Issue:** `getItem`'s catch calls `removeItem(key)` on **any** error, including `SecureStore.getItemAsync` throwing transiently. The key is stored with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so any JS that runs while the device is locked (background refresh, notification handlers in later phases) gets `errSecInteractionNotAllowed`. The adapter then deletes both the blob and the key, the user is signed out, and via CR-02 no wipe runs. Android Keystore has comparable transient failures.
**Fix:** Distinguish "cannot decrypt" from "cannot read the key right now". Only delete on a definite integrity failure, and rethrow or return `null` without deleting on SecureStore read errors. Consider `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` for the session key.

### WR-04: `getItem` creates a fresh key for an orphaned blob, and the ciphertext is unauthenticated

**File:** `src/services/supabase/largeSecureStore.ts:29-45, 60-66`; `app.config.ts:21-28`
**Issue:**
- **Orphaned blob.** `getItem` calls `getOrCreateKey`. If the blob exists but the key does not, a new random key is generated and registered, and the blob is "decrypted" with it. That happens after an Android auto-backup restore, because `allowBackup` is left at the default, AsyncStorage is backed up, and expo-secure-store excludes its own prefs. It also happens after a keychain reset. `aesjs.utils.utf8.fromBytes` does not throw on garbage, so a garbage string is returned to supabase-js instead of `null`. Recovery depends on supabase-js rejecting the malformed session.
- **Tampering goes undetected.** AES-CTR has no MAC, so the blob is malleable: bit-flips go undetected.
- **Backups.** The same default `allowBackup` sends every plaintext `fincwin:` key to Google Drive: the pending profile, the Phase 1 persisted query cache and the theme. That undermines the sign-out and erasure story.

**Fix:** In `getItem`, read the key with `SecureStore.getItemAsync` and, if it is missing, delete the blob and return `null`. Never create a key on the read path. Add an HMAC-SHA256 (encrypt-then-MAC with a second derived key) or use AES-GCM, and reject on verification failure. Set `android.allowBackup: false`, or add backup rules that exclude AsyncStorage, in `app.config.ts`.

### WR-05: Consent is enable-only, so a server-side withdrawal never disables analytics

**File:** `src/features/consent/useConsent.ts:78-88`
**Issue:** The effect only ever calls `enable()` when `consent === 'granted'`. It never calls `disable()` when fresh data shows `'declined'` or `null`.
- If the user withdraws consent on device B, device A keeps tracking for the rest of the session.
- On cold start, a persisted-cache `'granted'` from an earlier session enables PostHog *before* the fresh fetch confirms it. That is the same stale-cache hazard `awaitingFresh` guards against for the prompt, but it is not guarded here.
- `enabledOnceRef` is per hook instance, and `useConsent` is mounted three times (the layout, You and Consent), so `enable()`/`identify()` runs repeatedly.

**Fix:** Drive the analytics state from `(fresh, consent)` in one place, for example in `(app)/_layout`. Only enable when `fresh && consent === 'granted'`, and call `disable()` whenever the value turns anything other than `'granted'`.

### WR-06: Withdrawing consent while offline silently keeps tracking

**File:** `src/features/consent/useConsent.ts:67-72`, `src/features/you/YouScreen.tsx:100-106`
**Issue:** `decline()` only calls `getAnalytics().disable()` *after* the server write succeeds. Offline, `writeConsent` returns `false`, analytics stays enabled, and the toggle silently stays on with no error shown. GDPR requires withdrawal to take effect locally at once, whatever the network state.
**Fix:** Call `await getAnalytics().disable()` first and unconditionally, then persist the answer. Queue it with a paused mutation if offline, and show a failure state if the write cannot be saved.

### WR-07: The consent copy says "anonymous" but events are keyed to the persistent account UUID

**File:** `src/i18n/locales/en.ts` (`consent.heading`, `you.analytics.label`), `src/services/analytics/posthog.ts:69-78`
**Issue:** `enable()` calls `client.identify(userId)` with the Supabase user UUID, a stable identifier tied to the account. Under GDPR that is pseudonymous personal data, not anonymous. "Share anonymous usage?" is therefore inaccurate copy on the consent screen itself, which is a store-review and compliance risk given the project's compliance constraints. Separately, "Not now" suggests the question will come back, but `decline` records a terminal `'declined'` that is never prompted again.
**Fix:** Change the copy to "Share usage data?" and state that it is linked to a random account ID, or stop calling `identify` and send only anonymous distinct IDs. Rename "Not now" to "Don't share", or re-prompt later.

### WR-08: The consent timestamp is client-supplied, so the consent record is forgeable

**File:** `supabase/migrations/20260922000100_household_of_one.sql:146`, `src/features/consent/useConsent.ts:43-47`
**Issue:** `analytics_consent_at` is granted as a writable column and set from the device clock (`new Date().toISOString()`). Any client can write any timestamp, or a timestamp without a consent value. The GDPR record of when consent was given or withdrawn therefore has no integrity.
**Fix:** Revoke the grant on `analytics_consent_at`. Add a `before update` trigger that sets `new.analytics_consent_at := now()` when `new.analytics_consent is distinct from old.analytics_consent`, and remove the client-side value.

### WR-09: The pending Apple profile replays without checking the signed-in user, and treats a no-op as success

**File:** `src/services/auth/firstAuthProfile.ts:44-51, 80-97`, `src/features/auth/AuthProvider.tsx:43-47`
**Issue:** `retryPendingFirstAuthProfile` replays `{ userId, patch }` without checking that `pending.userId` matches the current session user. If user A's payload survives (CR-02) and user B signs in:
- The `profiles` update matches 0 rows, which under RLS is *not* an error, so the replay counts as success and A's data is discarded.
- `supabase.auth.updateUser({ data: { full_name } })` then writes **A's name into B's auth metadata**.

`updateUser`'s error is also ignored, so the pending key is cleared even when the metadata write failed. Finally, the payload (name and email) sits in plaintext AsyncStorage.
**Fix:** Before replaying, require `pending.userId === (await supabase.auth.getUser()).data.user?.id`, and drop the payload otherwise. Use `.update(patch).eq('id', userId).select('id')` and treat 0 rows as failure. Check `updateUser`'s `error`.

### WR-10: The Android Apple web-OAuth path never captures the first-authorization name

**File:** `src/services/auth/apple.ts:59-86`
**Issue:** ACC-03 says Apple's name only arrives on the first authorization. The iOS path persists it, but the Android path goes straight to `exchangeCodeForSession` and never calls `persistFirstAuthProfile`. Unless GoTrue maps Apple's form-post `user` JSON into `raw_user_meta_data.full_name`/`name` (which `handle_new_user` reads), an Android-first Apple user loses their name for good. No test or doc in scope shows that GoTrue does this mapping.
**Fix:** Verify live that GoTrue's Apple provider fills `raw_user_meta_data` with the name on a first web authorization. If it does not, capture it through a server-side hook. Either way, add a note or test that pins the behaviour.

### WR-11: The Android OAuth redirect has no route, so it can land on "Unmatched Route"

**File:** `src/services/auth/apple.ts:13, 60`; `app/` (no `auth-callback` route, no `+native-intent`)
**Issue:** `redirectTo = fincwin://auth-callback?code=…`. On Android the redirect intent is also delivered to the app's activity, and Expo Router will try to navigate to `/auth-callback`. No such route exists and there is no `+native-intent.tsx` to swallow it, so users can be left on Expo Router's unmatched-route screen after a successful sign-in. The authorization code also ends up in the navigation state.
**Fix:** Add `app/auth-callback.tsx` that renders nothing and redirects to `/`, or add `app/+native-intent.tsx` that maps `auth-callback` to `/`.

### WR-12: Sign-out failure paths leave a half-wiped device with no feedback

**File:** `src/features/auth/signOut.ts:79-89`, `src/features/you/YouScreen.tsx:37-51, 117-121`
**Issue:**
- `await resolved.analytics.disable()` runs first and is not wrapped. If PostHog's `optOut()` rejects, the session is never cleared and nothing is wiped.
- If `wipeDeviceData()` throws its `AggregateError`, `resetTheme()` is skipped and the promise rejects.
- `YouScreen` calls both entry points with `void`, so the rejection is unhandled and invisible, even though Supabase has already emitted SIGNED_OUT and the UI has moved to Welcome with data still on the device.

**Fix:** Wrap each step in `performSignOut` in its own try/catch and always run every step. Report failures with `captureError(err, { area: 'auth' })`, and surface a retry if the wipe failed.

### WR-13: Sign-out does not clear the cached Google account

**File:** `src/features/auth/signOut.ts:76-90`, `src/services/auth/google.ts`
**Issue:** `@react-native-google-signin/google-signin` keeps the last-signed-in account natively. Without `GoogleSignin.signOut()` (or `revokeAccess()`), the next "Continue with Google" on a shared device can reuse the previous user's account without showing the account chooser. The device wipe is incomplete.
**Fix:** Register a wipe handler, or add a `performSignOut` step, that calls `GoogleSignin.signOut()` and ignores errors if no Google session exists.

### WR-14: Once blocked, the version gate unblocks after a failed re-check

**File:** `src/features/system/useMinVersionGate.ts:28-32, 38-40`
**Issue:** The gate re-checks on every foreground event and sets `{ status: 'ok' }` whenever `min` is `null`, which includes any network failure or timeout. A blocked user can go into airplane mode, background the app, foreground it, and get past the update gate, which undermines T-00-17-01.
**Fix:** Fail open only while the status is not yet known. Once `'blocked'` has been observed with a real value, keep it until a *successful* fetch returns a lower or equal minimum.

### WR-15: `verify-gates.mjs` probes 2, 3 and 4 cannot fail independently

**File:** `scripts/verify-gates.mjs:85-122`
**Issue:** Probe files accumulate across probes, and cleanup only runs in `finally`.
- **Probe 2** (`depcruise fails on the React import`) runs while Probe 1's `engine → services` violation is still on disk, so depcruise fails no matter what.
- **Probe 3** asserts the output contains `engine-no-reach-impure`. Probe 1's direct import into `src/services/` already produces that exact rule name, because `^src/services` is in its `to.path`. The transitive-detection proof is vacuous: it passes even if transitive detection is broken.
- **Probe 4** asserts only that `jest --coverage` exits non-zero. It would also pass on any unrelated test failure, or on the `./src/engine/` 95% threshold tripping over Probes 1–3's uncovered files, rather than the `money/` 100% rule it claims to prove.

The script this CI relies on to show the gates work therefore does not show it.
**Fix:** Clean up after each probe (move `cleanup()` per probe, with a fresh `createdPaths`). For Probe 3, create only the transitive chain, and use a shared module outside `services` so only `engine-no-reach-impure` can fire. For Probe 4, assert that the output mentions `src/engine/money` and "coverage threshold".

### WR-16: The engine-purity gate has package holes

**File:** `.dependency-cruiser.cjs:17-19`, `eslint.config.js:66-101`
**Issue:** CLAUDE.md calls engine purity "the most important line in the codebase", but the checks leave gaps:
- The depcruise `engine-no-reach-impure` regex only matches `node_modules/(react|react-native|expo…|@supabase|posthog-react-native)/`. `react-native-svg`, `react-native-reanimated`, `@react-native-async-storage/*`, `@tanstack/react-query`, `@sentry/react-native`, `i18next`, `aes-js` and others are all reachable from `src/engine` without a depcruise error.
- The ESLint `no-restricted-imports` backstop only applies to `src/engine/**/*.ts`, so `.tsx` files are unchecked, and it does not list `@tanstack/*`, `@sentry/*` or `i18next`.

**Fix:** Invert the rule to an allow-list: from `^src/engine`, forbid any `node_modules` dependency except an explicit pure list (for example `fast-check` in tests only). Extend the ESLint `files` to `src/engine/**/*.{ts,tsx}`.

### WR-17: No guard against a privileged Supabase key in the client bundle

**File:** `src/config/env.ts:89-98, 140`, `.github/workflows/ci.yml:32-33`
**Issue:** ENV-04's CI check greps *source code* for `SERVICE_ROLE|service_role|sb_secret_`. It cannot see *values*. A `sb_secret_…` key or a `service_role` JWT pasted into the EAS variable `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` would be inlined into the shipped bundle. That bypasses RLS entirely for anyone who extracts the key. `readClientEnv` validates the URL's format but not the key's. Gitleaks only scans git, not EAS environments.
**Fix:** In `readClientEnv`, reject values starting with `sb_secret_`. Also decode JWT-shaped keys and reject `role !== 'anon'`, or require the `sb_publishable_` prefix. Because `getEnv()` runs at module load, a misconfigured build then fails loudly in QA instead of shipping.

### WR-18: Gitleaks allowlists `.env.example` wholesale

**File:** `.gitleaks.toml:25-27`
**Issue:** `.env.example` lists every sensitive variable name (`SUPABASE_SERVICE_ROLE_KEY=`, `FX_SYNC_SECRET=`, `RESEND_API_KEY=`, …). It is exactly the file a developer is most likely to paste a real value into by mistake, and the path allowlist exempts it from every rule, the custom Supabase and PostHog rules included.
**Fix:** Remove the path allowlist. If the empty `KEY=` lines trip default rules, allowlist them with a narrow regex such as `'''^[A-Z0-9_]+=\s*(#.*)?$'''`, or use `stopwords`.

### WR-19: The fx-sync Edge Function entry point is never typechecked or linted in CI

**File:** `tsconfig.json:12`, `eslint.config.js:15`, `.github/workflows/ci.yml`
**Issue:** `supabase/functions` is excluded from both `tsc` and ESLint, with the comment "typechecked/linted separately". No CI step does this: there is no `deno check` or `deno lint`. `index.ts`, which holds the auth check and the service-role client, gets no static analysis, and none of its code paths are unit-tested; only the pure helpers are, through Jest.
**Fix:** Add a CI step: `denoland/setup-deno` followed by `deno check supabase/functions/*/index.ts && deno lint supabase/functions`.

### WR-20: The Sentry scrubber leaves identifier and free-form channels unscrubbed

**File:** `src/services/errors/errorReporter.ts:45-69`, `src/services/errors/scrub.ts:8-37`
**Issue:**
- **Unscrubbed fields.** `scrubSentryEvent` only scrubs `message` and `exception.values[].value` and frames. `extra`, `contexts`, `tags`, `request`, `logentry` and `exception.values[].mechanism.data` pass through untouched.
- **UUIDs.** `scrubMessage` does not redact UUIDs: hex with digit runs under 4 is mostly kept. Postgres and PostgREST messages routinely include them (`Key (user_id)=(…)`), linking crash reports to an account UUID, which D-18 forbids.
- **Small integers.** Integers of 3 digits or fewer with no currency symbol, such as minor-unit amounts under 1000, are not redacted.
- **Native crashes.** Native crash events from `enableNativeCrashHandling` bypass the JS `beforeSend` entirely.

**Fix:** Allowlist the event: rebuild it from known-safe fields and drop `extra`, `contexts.*` (except device and os), `request` and `user`. Add a UUID regex (`/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi → '<id>'`). Document or configure native `beforeSend` for the native SDKs.

## Info

### IN-01: The nonce entropy comment is overstated
**File:** `src/services/auth/nonce.ts:13-14`
**Issue:** Two v4 UUIDs give 244 random bits, not 256. That is still ample.
**Fix:** Correct the comment, or use `Crypto.getRandomBytes(32)` hex-encoded for a true 256 bits.

### IN-02: fx-sync returns raw internal error messages
**File:** `supabase/functions/fx-sync/index.ts:154-156`
**Issue:** `e.message` (upstream URLs, PostgREST error text) is echoed in the 502 body. The caller is authenticated, but the text ends up in `net._http_response`.
**Fix:** Return a fixed error code and log the detail server-side.

### IN-03: Dependency versions drift from the documented stack
**File:** `package.json:14, 45, 50, 57, 68`
**Issue:** The versions differ from the documented stack:
- `react-native-reanimated` 4.5.1 with `react-native-worklets` 0.10.1, against the documented 4.5.5 / 0.12.x
- Jest 29.7 and `@types/jest` 29, against the documented Jest 30 line
- `@sentry/react-native ~7.11.0`, while the comment in `errorReporter.ts:103` reasons about 8.28
- The Edge Function pins `supabase-js@2.116.0` while the app uses 2.117.0

**Fix:** Align them or update the docs. Remove the stale Sentry version reference.

### IN-04: `legacy-peer-deps` is set globally
**File:** `.npmrc:1`, `.github/workflows/ci.yml:19`
**Issue:** Peer-dependency conflicts are silently ignored in CI and locally.
**Fix:** Document which conflict needs it, and remove it once that conflict is resolved.

### IN-05: The SecureStore key index has a read-modify-write race
**File:** `src/services/storage/wipe.ts:46-50`
**Issue:** Two concurrent `registerSecureKey` calls, for example the auth key and the code-verifier key, can each read the old array, and one name is lost. That key is then never deleted by `wipeDeviceData`.
**Fix:** Serialise the writes through a module-level promise chain.

### IN-06: A failed pending-profile save turns a successful sign-in into an error
**File:** `src/services/auth/firstAuthProfile.ts:69-72`, `src/services/auth/apple.ts:54`
**Issue:** If `AsyncStorage.setItem` throws inside the catch, `signInWithAppleIOS` rejects after the session is already established. The user sees "Sign-in didn't go through" while actually being signed in.
**Fix:** Wrap the queue write in its own try/catch and report the failure with `captureError`.

### IN-07: The single-quote scrub misfires on apostrophes
**File:** `src/services/errors/scrub.ts:10, 32`
**Issue:** In "Can't find O'Brien", the regex redacts the span `'t find O'` and leaves `Brien` exposed. Unbalanced apostrophes redact the wrong span.
**Fix:** Only match quotes at word boundaries, for example `(?<![A-Za-z])'[^']*'(?![A-Za-z])`.

### IN-08: The ENV-04 grep passes if grep itself errors, and misses config files
**File:** `.github/workflows/ci.yml:33`
**Issue:** `! grep …` inverts exit code 2 (grep error, such as a missing path) into success. It also does not scan `app.config.ts` or `eas.json`.
**Fix:** `out=$(grep -rnE '…' src app app.config.ts eas.json; echo "rc=$?")`, then fail on rc 0 or rc 2.

### IN-09: The store-link `openURL` rejection is unhandled on iOS
**File:** `src/features/system/UpdateRequiredScreen.tsx:25-27, 51-53`
**Issue:** The iOS `Linking.openURL` has no catch, and the caller uses `void`, so a failure is an unhandled rejection on the only interactive control of a blocking screen.
**Fix:** Catch the error and fall back to the `https://apps.apple.com/…` URL.

### IN-10: Some pgTAP lookups do not specify a schema
**File:** `supabase/tests/database/01_household_of_one.test.sql:61-74`
**Issue:** `pg_proc where proname = 'handle_new_user'` does not filter by namespace. A same-named function in another schema would make the scalar subquery error out or check the wrong function.
**Fix:** Add `and pronamespace = 'public'::regnamespace`.

---

_Reviewed: 2026-09-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
