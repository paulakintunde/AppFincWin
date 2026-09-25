---
phase: 00-foundation
plan: 15
subsystem: auth
tags: [supabase, apple-sign-in, google-sign-in, oauth, nonce, pkce]

# Dependency graph
requires:
  - phase: 00-foundation (plan 06)
    provides: profiles table with update grants on full_name/email (ACC-03's write target)
  - phase: 00-foundation (plan 10)
    provides: configured Supabase client (flowType 'pkce'), AUTH_STORAGE_KEY, D-15 wipe registry
  - phase: 00-foundation (plan 14)
    provides: EAS project/environments, the EAS-managed Android keystore SHA-1 for Google's Android OAuth client
provides:
  - src/services/auth module -- signInWithApple, configureGoogle/signInWithGoogle, createNonce, persistFirstAuthProfile/retryPendingFirstAuthProfile
  - src/features/auth/AuthProvider -- status/session/user context, useAuth()
  - Three Google OAuth clients (web, iOS, one of two Android) and a live Supabase Google provider on production
  - docs/ops/auth-providers.md -- provider config, nonce decisions, the one still-pending Android client
affects: [00-17 (welcome screen calling signInWithApple/signInWithGoogle), 00-18 (sign-out, AuthProvider consumer), 00-19 (device persistence proof), 00-20 (Apple provider config once enrolment clears)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nonce direction: SHA-256 hash to the native Apple SDK, raw value to supabase.auth.signInWithIdToken (it hashes and compares server-side) -- never the reverse"
    - "Apple's fullName/email are captured and written in the same call that receives the credential, awaited before sign-in resolves, and queued to AsyncStorage for retry if the write fails -- never deferred, since they are only ever present on the first authorization"
    - "D-11: Apple on Android runs Supabase's own web OAuth/PKCE flow (signInWithOAuth + WebBrowser.openAuthSessionAsync + exchangeCodeForSession) through the Apple Services ID, not a forced native nonce flow"
    - "Supabase's Google-provider client-id list is one underlying comma-joined value; the Management API's external_google_additional_client_ids input field is merged into external_google_client_id at write time and always reads back empty on GET -- verified live against the API in this session, re-PATCH the full list on any client-ID change rather than trying to append incrementally"

key-files:
  created:
    - src/services/auth/nonce.ts
    - src/services/auth/apple.ts
    - src/services/auth/google.ts
    - src/services/auth/firstAuthProfile.ts
    - src/services/auth/index.ts
    - src/services/auth/__tests__/nonce.test.ts
    - src/services/auth/__tests__/apple.test.ts
    - src/services/auth/__tests__/firstAuthProfile.test.ts
    - src/features/auth/AuthProvider.tsx
    - src/features/auth/__tests__/AuthProvider.test.tsx
    - docs/ops/auth-providers.md
  modified:
    - .env.example

key-decisions:
  - "Google client-id verification uses the Web client ID as the primary audience (external_google_client_id), with iOS and Android as external_google_additional_client_ids -- google.ts configures GoogleSignin with webClientId as the serverClientId, so both platforms' returned ID tokens carry the web client ID as aud"
  - "No nonce sent for Google sign-in (T-00-15-02, accepted risk): the installed @react-native-google-signin/google-signin 16.1.5's signIn() SignInParams has no nonce field -- verified against the installed package's own .d.ts, not assumed from docs"
  - "Google's web client secret was rotated in Google Cloud Console mid-plan after briefly appearing in an executor session's own tool-call transcript (not committed, not sent anywhere) -- Supabase now holds only the new value"
  - "One of the two required Android OAuth clients (debug SHA-1 vs EAS-keystore SHA-1) still does not exist -- documented as a known gap in docs/ops/auth-providers.md rather than blocking the rest of the plan, since the code path, the other four requirements, and the web/iOS flows are all complete and correct"

patterns-established:
  - "Any jest.mock() factory referencing a jest.fn() declared outside it must name that variable with a `mock` prefix (case-insensitive) -- Jest's out-of-scope-variable guard in this project's babel/jest config rejects any other naming, including a `Mock` suffix"
  - "RNTL v14's render/act/unmount are all async in this project's installed version -- use `await act(async () => ...)` and `await unmount()`, not the sync forms, or state-transition assertions become flaky/wrong depending on test ordering"

requirements-completed: [ACC-01, ACC-02, ACC-03, ENV-06, ENV-07]

# Metrics
duration: ~2h (across three sessions: initial build, a human-action checkpoint pause for Google Cloud Console setup, and a secret-rotation/production-PATCH follow-up)
completed: 2026-09-25
---

# Phase 00 Plan 15: Apple/Google Sign-In Services and AuthProvider Summary

**Apple (native iOS + Android web-OAuth/PKCE) and Google sign-in services with correct nonce handling, first-authorization-only profile capture, an AuthProvider context, and a live Supabase Google provider on production with three real OAuth clients.**

## Performance

- **Duration:** ~2h total across three sessions (autonomous build, a blocking human-action checkpoint for Google Cloud Console setup, and a secret-rotation + corrected production-PATCH follow-up)
- **Tasks:** 3 (2 autonomous TDD tasks, 1 checkpoint:human-action)
- **Files modified:** 11 created, 1 modified (`.env.example`)

## Accomplishments
- `src/services/auth/nonce.ts`: `createNonce()` -- 256-bit raw value, SHA-256 hashed, fresh per attempt (T-00-15-01)
- `src/services/auth/apple.ts`: native Sign in with Apple on iOS (hashed nonce to Apple, raw nonce to Supabase, `persistFirstAuthProfile` awaited before resolving) and Supabase's web OAuth/PKCE flow through the Apple Services ID on Android (D-11)
- `src/services/auth/google.ts`: Google Sign-In with no nonce (the installed SDK doesn't support one -- T-00-15-02, accepted and documented)
- `src/services/auth/firstAuthProfile.ts`: writes Apple's first-authorization-only name/email immediately, builds the patch from non-empty fields only (never `full_name: null`), queues a failed write to AsyncStorage and replays it on next launch (ACC-03)
- `src/features/auth/AuthProvider.tsx`: `{status, session, user, signInWithApple, signInWithGoogle}` from `getSession`/`onAuthStateChange`, with unsubscribe-on-unmount and a one-shot `retryPendingFirstAuthProfile()` when a session already exists on mount
- Three Google OAuth clients created (Web, iOS, one Android) under the FincWin Google Cloud project; the Supabase Google provider is live on production (`external_google_enabled: true`, the merged client-id list, `uri_allow_list: fincwin://auth-callback`, a rotated client secret)
- 100% line/branch coverage on `nonce.ts`, `apple.ts`, `firstAuthProfile.ts`; ~97%/100% on `AuthProvider.tsx`. 30 tests across 4 suites, all green. `tsc`, `eslint`, `depcruise` all clean

## Task Commits

Each task was committed atomically, on `main` up to the checkpoint, then on a dedicated branch (`phase0/00-15-google-signin`, off `main`) for the post-checkpoint work, per this session's routing instructions (the shared checkout was in use by another session):

1. **Task 1: Nonce, first-auth profile, Apple and Google sign-in services** (TDD)
   - RED: `e5e6128` (test) -- nonce/firstAuthProfile/apple tests, confirmed failing
   - GREEN: `e00bdf0` (feat) -- all five service files, 100% coverage on the three tested files
2. **Task 2: AuthProvider** (TDD)
   - RED: `6d0c671` (test)
   - GREEN: `22ada00` (feat)
3. **Task 3: Google OAuth clients + Supabase provider config** (checkpoint:human-action, then completed across two follow-up turns)
   - `2a9e8d8` (docs, on `main`) -- `.env.example` tooling-only lines for `GOOGLE_WEB_CLIENT_SECRET`/`GOOGLE_ANDROID_CLIENT_IDS`, plus EAS env vars set remotely (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME` across all three environments)
   - `71c6eaa` (docs, on `phase0/00-15-google-signin`) -- `docs/ops/auth-providers.md`, after the corrected production Supabase PATCH

**Plan metadata:** this commit (docs: complete plan), on `phase0/00-15-google-signin`

## Files Created/Modified
- `src/services/auth/nonce.ts` -- `createNonce()`
- `src/services/auth/apple.ts` -- `signInWithApple()`, iOS native + Android web-OAuth
- `src/services/auth/google.ts` -- `configureGoogle()`, `signInWithGoogle()`
- `src/services/auth/firstAuthProfile.ts` -- `persistFirstAuthProfile()`, `retryPendingFirstAuthProfile()`
- `src/services/auth/index.ts` -- barrel re-export
- `src/features/auth/AuthProvider.tsx` -- `AuthProvider`, `useAuth()`
- `docs/ops/auth-providers.md` -- provider config, SHA-1s, nonce decisions, the pending second Android client
- `.env.example` -- `GOOGLE_WEB_CLIENT_SECRET=`, `GOOGLE_ANDROID_CLIENT_IDS=` (tooling-only, no values)
- Five `__tests__` files (see key-files)

## Decisions Made
- Google's Web client ID is the primary Supabase-verified audience; iOS and Android client IDs are additional accepted audiences, matching how `google.ts` configures `GoogleSignin` with `webClientId` as the serverClientId
- No nonce is sent for Google sign-in (T-00-15-02) -- verified against the installed SDK's own type definitions, not assumed
- The Google web client secret was rotated after being briefly visible in an executor tool-call transcript during this plan's execution (see Deviations) -- Supabase now holds the new value only
- One Android OAuth client (of two needed, one per signing SHA-1) is still missing -- documented as a known, non-blocking gap rather than holding up the rest of the plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added coverage for defensive error branches the plan's own action text implies but doesn't separately list as behaviors**
- **Found during:** Task 1, reviewing initial coverage output
- **Issue:** `apple.ts`'s non-cancellation error rethrow, missing-identity-token throw, and Supabase-rejects-OAuth-start/exchange branches, plus `firstAuthProfile.ts`'s corrupted-pending-JSON discard path, were implemented per the plan's `<action>` text but not covered by the plan's explicit `<behavior>` list
- **Fix:** Added seven tests across `apple.test.ts` and `firstAuthProfile.test.ts` covering these branches
- **Files modified:** `src/services/auth/__tests__/apple.test.ts`, `src/services/auth/__tests__/firstAuthProfile.test.ts`
- **Verification:** 100% line/branch coverage on `apple.ts` and `firstAuthProfile.ts`
- **Committed in:** `e00bdf0`

**2. [Rule 3 - Blocking] The plan's literal Supabase PATCH field for multiple Google client IDs needed correction, then a self-inflicted shell bug delayed the fix**
- **Found during:** Task 3, applying the production Supabase auth PATCH
- **Issue:** The plan's literal curl example puts all four client IDs into a single `external_google_client_id` field. Live inspection of the Management API's GET response showed two fields exist: `external_google_client_id` (primary) and `external_google_additional_client_ids`. Separately (and this was the actual root cause of the first two failed PATCH attempts, not a schema issue): the PATCH bodies were built with `node -e "...code referencing process.env.X..." X="$value"`, placing the variable assignment *after* the script -- in Bash this becomes a positional argument (`process.argv`), not an environment variable, so `process.env.X` was `undefined` and `JSON.stringify` silently dropped that key from the request body entirely. Two PATCH attempts across two sessions consequently sent incomplete bodies while returning HTTP 200, which read as a schema mismatch until the actual bug was found.
- **Fix:** Exported every value the script needed (`export ADDITIONAL_IDS=...` before the `node -e` call, or relying on `set -a; source .env.local; set +a`'s already-exported vars) instead of passing them as trailing arguments. Also confirmed empirically (not assumed) that Supabase's `external_google_additional_client_ids` input is merged into the single underlying `external_google_client_id` value at write time -- a GET afterward returns the full merged, comma-joined list under `external_google_client_id` alone, and `external_google_additional_client_ids` always reads back empty. Documented this in `docs/ops/auth-providers.md` so a future re-PATCH sends the full list rather than trying to append.
- **Files modified:** none (operational/session-only; the resulting live config and the explanatory doc are `docs/ops/auth-providers.md`, commit `71c6eaa`)
- **Verification:** GET on the production auth config after the corrected PATCH confirms `external_google_client_id` contains all three known client IDs (web primary, iOS, the one existing Android ID), `external_google_enabled: true`, `uri_allow_list: fincwin://auth-callback`, and the secret is set
- **Committed in:** `71c6eaa` (docs only; the PATCH itself is a remote API call, not a file change)

---

**Total deviations:** 2 auto-fixed (1 test-coverage completeness, 1 blocking operational bug plus a genuine plan-vs-live-API correction)
**Impact on plan:** No scope change. The Google provider is now correctly and completely configured for every client ID that currently exists; only the second Android OAuth client (a Google Cloud Console action, not code) remains outstanding, tracked explicitly in `docs/ops/auth-providers.md`.

## Issues Encountered

- **Secret briefly visible in an executor tool-call transcript.** While diagnosing why `GOOGLE_ANDROID_CLIENT_IDS` appeared empty, a ranged `Read` over `.env.local` (rather than a scoped `grep -n "^VAR="`, the pattern used everywhere else in this plan) surfaced `GOOGLE_WEB_CLIENT_SECRET`'s value in that tool's output. It was never written to a file, git commit, or external request. Disclosed to the user in-session; the user rotated the secret in Google Cloud Console as a precaution, and the rotated value is what's now live in Supabase's config (see Deviation 2 and `docs/ops/auth-providers.md`).
- **The sandbox's own permission classifier blocked two production-PATCH attempts** (reasons: "Secret-Store Writes", then "Credential Materialization") even after the user's prior explicit approval for the exact same change. Per the agent's own operating instructions, further attempts were not made in that session; the user re-approved and the classifier allowed the corrected PATCH through in the follow-up session.
- **One Android OAuth client is still missing.** `.env.local`'s own `GOOGLE_ANDROID_CLIENT_IDS` comment documents this as a TODO with both candidate SHA-1s listed; it isn't recorded anywhere which of the two the one existing Android client actually covers, so `docs/ops/auth-providers.md` documents this honestly as unconfirmed rather than guessing.

## User Setup Required

**Outstanding, non-blocking:** create the second Android OAuth client in Google Cloud Console (package `com.fincwin.app`, whichever of the two SHA-1s in `docs/ops/auth-providers.md` is not yet covered), append its client ID to `GOOGLE_ANDROID_CLIENT_IDS` in `.env.local`, and re-run the full Supabase auth PATCH documented there. Until then, Google sign-in will fail with a native `DEVELOPER_ERROR` on whichever build variant (debug vs. EAS) used the not-yet-registered SHA-1.

Everything else required no further manual configuration beyond what this plan's checkpoint already covered.

## Next Phase Readiness

- Google sign-in is functionally complete end to end for at least one Android signing configuration, plus iOS and any web fallback (00-19 does the device verification)
- The Apple code path is fully implemented and unit-proven; it waits only on Apple Developer Program organisation enrolment (00-20) to configure the Services ID/key on Supabase's side -- `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=false` already keeps the button hidden/disabled until then, per 00-14's environment setup
- 00-17's welcome screen can call `signInWithApple()`/`signInWithGoogle()` and read `useAuth()`'s status directly
- 00-18 (sign-out, wipe flow) can build on `AuthProvider` as-is -- sign-out was deliberately not implemented here
- Blocker for full production readiness: the second Android OAuth client (see User Setup Required above) -- not a code blocker, tracked for whoever picks up Google sign-in device verification next

---
*Phase: 00-foundation*
*Completed: 2026-09-25*

## Self-Check: PASSED

All 8 key files verified present on disk (`src/services/auth/{nonce,apple,google,firstAuthProfile,index}.ts`, `src/features/auth/AuthProvider.tsx`, `docs/ops/auth-providers.md`, `.env.example`). All 6 commits (`e5e6128`, `e00bdf0`, `6d0c671`, `22ada00`, `2a9e8d8`, `71c6eaa`) verified present in `git log --oneline --all`.
