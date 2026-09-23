# Phase 0: Foundation - Research

**Researched:** 2026-09-22
**Domain:** Expo SDK 57 project bootstrap on Windows, Supabase Auth (Apple/Google) + RLS household-of-one, engine-purity CI gates, design-token theming, opt-in PostHog analytics, store-enrolment machinery
**Confidence:** HIGH on package versions and documented Supabase/Expo patterns; MEDIUM on the exact Realtime-free auth/RLS bootstrap sequence and PostHog error-tracking-for-RN maturity (flagged, matches D-19's own spike instruction); LOW→MEDIUM on Windows-specific EAS credential mechanics (no first-party Windows-specific docs beyond "same CLI everywhere")

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Company, enrolment and accounts**
- D-01: Company already a legal entity; D-U-N-S status unknown. First task: Apple's D-U-N-S lookup tool, request if missing (~28 days).
- D-02: User is owner/director, enrols personally with authority to accept the PLA. Registered legal name matches desired seller name — no DBA needed. Verify D&B record matches government registration.
- D-03: Apple enrolment is **organisation only, no individual fallback**. iOS builds (FND-03) and Sign in with Apple (ENV-07) wait on it; Android proceeds at full speed.
- D-04: **Google Play Console organisation account registered in Phase 0** ($25, same D-U-N-S), pulled forward from Phase 9. Update ROADMAP.md dependency table and dependency register.
- D-05: Company domain already owned; DNS already on Cloudflare.
- D-06: Company website exists but unverified against Apple's enrolment bar. Phase 0 audits it against Apple's criteria and remediates if short. Same site later hosts privacy/terms/support.
- D-07: Work email = Cloudflare Email Routing (inbound) + Resend (outbound, SPF/DKIM/DMARC in Cloudflare). Caveat: routing only forwards; replying *as* the domain needs Resend SMTP or Gmail "send mail as." Apple verification only needs inbound.
- D-08: Service accounts use the user's personal login with a company org/team created inside each service.
- D-09: Repo hosting: GitHub `https://github.com/paulakintunde/AppFincWin`, origin added 2026-09-22, remote empty. Local branch `master`; GSD expects `main`. Phase 0 renames to `main` and does first push (needs user approval).

**Sign-in and first launch**
- D-10: First launch = full-screen welcome + sign-in (not dismissible). Base on prototype's signed-out screen (`FincWin United.dc.html` ~line 2941): canvas `#FBFAF7`, wordmark in display face at 34px, one line body copy, pill buttons. Account sheet (~3181–3205, logic ~6437–6451) loses email/password fields.
- D-11: **Both Apple and Google buttons on both iOS and Android.** Apple on Android runs through Supabase's web OAuth flow using the Apple Services ID.
- D-12: Official Sign in with Apple button (native, black, corner radius set to pill) + Google button following Google's branding rules, restyled to match the prototype's outline pill. Provider brand marks are the sanctioned exception to token-colours-only (DSG-02); document the exception.
- D-13: Post-sign-in lands on a minimal "You"/settings screen: identity, accent switcher (4), font-pairing switcher (4), analytics opt-in toggle, sign out, live "connected to Supabase" check. Must look production-real (tokens, type scale, radii) — becomes the real You tab later.
- D-14: Accent/font stored on the user's Supabase profile row, with a local cache so first paint uses the saved theme. No flash of default green on cold start.
- D-15: **Sign-out wipes the encrypted query cache, its key, and any queued writes.** Warn before signing out if unsynced writes exist. The prototype's "figures stay on this device" copy is false under cloud-first — never port it.
- D-16: User supplies welcome/sign-in copy. Planner creates placeholder i18n keys, clearly marked awaiting copy.

**Analytics consent and error tracking**
- D-17: Opt-in asked on one screen immediately after first sign-in. Two equal-weight choices, no dark patterns, changeable later in settings. No event leaves device before explicit yes.
- D-18: Crash/error reports stay on even when analytics is declined — scrubbed to stack traces/technical context only, never amounts/payees/account names/free text/email, under legitimate interest, disclosed in privacy policy. Flag for re-verification at Compliance phase.
- D-19: **Spike PostHog's React Native error tracking first** (symbolicated stack traces from EAS builds, source-map upload). If it holds up, drop Sentry (ENV-13 becomes deferred/not-needed). If not, fall back to Sentry.
- D-20: Claude drafts consent screen and settings copy in the prototype's voice (declarative, plain, British-ish spelling, typographic apostrophes), listing exactly what's never sent. User reviews before final.

**Quality gates and infrastructure**
- D-21: `engine/` branch-coverage thresholds: **100% on `engine/money/`, `engine/decide/`, `engine/payoff/`, `engine/split/`**, **95% on the rest of `engine/`**. Uncovered branches in 100% folders need an explicit, reviewed ignore comment. CI fails below threshold.
- D-22: **Supabase region: US West (us-west-2)** (launch users mostly North American). Record as ENV-18 reasoning. GDPR-everywhere still applies via Supabase's DPA/SCCs.
- D-23: **PostHog stays on its EU host** despite the US database — split geography accepted for the stronger EU consent story.
- D-24: **CI split**: GitHub Actions runs lint, typecheck, dependency-cruiser, Jest with coverage gates, RLS isolation tests (FND-12) against a Supabase CLI stack in Docker, and the credential scan (ENV-02). **EAS Build/Workflows handles native builds and OTA only.**
- D-25: Minimum supported version (FND-09) lives in a **Supabase `app_config` table**, readable pre-sign-in through a public read-only RLS policy, changed only through migrations/controlled updates. Not a PostHog flag.

### Claude's Discretion
- How the Apple button behaves before enrolment clears (config-flag hide vs visible-but-disabled) — keep Android dev builds usable and the layout honest.
- OTA runtime-version policy details (FND-11): fingerprint vs appVersion policy, rollback mechanism.
- Credential-scan tool choice (e.g. gitleaks), lint configuration, format/location of the dependency register (ENV-09).
- Font loading strategy for the four pairings (all at boot vs lazy on switch) — switching must be live, no reload.
- Household-of-one schema shape and RLS policy structure, within PROJECT.md's locked decisions (client-generated UUIDs, `version` column).

### Deferred Ideas (OUT OF SCOPE)
- App Review demo-account sign-in path (allow-listed review login with sample data) — belongs in Compliance & Release.
- Re-verify legitimate interest for always-on crash reports (D-18) against live GDPR guidance and App Privacy/Data safety answers during the Compliance phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Expo SDK 57, TS strict, Expo Router `~57.x` | Standard Stack — verified versions; Installation section |
| FND-02 | Run on local Android emulator with dev build | Environment Availability; Architecture Patterns — dev loop |
| FND-03 | Signed iOS dev build on physical device via EAS Build from Windows | Common Pitfalls (provisioning); EAS Build/Submit section |
| FND-04 | CI fails engine/ importing db/state/services/ui/react, incl. transitively | Don't Hand-Roll + Code Examples — dual lint gate (eslint-plugin-boundaries + dependency-cruiser) |
| FND-05 | CI fails branch-coverage drop below threshold | Validation Architecture — Jest coverageThreshold per-directory |
| FND-06 | Live accent/font-pairing switch, no reload | Architecture Patterns — theme context; BUILD-PROMPT §2 tokens |
| FND-07 | Animations collapse under reduce-motion | Code Examples — ReducedMotionConfig / useReducedMotion |
| FND-08 | Apple Developer Program enrolment submitted day one | Dependency Provisioning (carried from ROADMAP); D-01/D-02/D-03 |
| FND-09 | Min-version gate, update-required screen | Code Examples — app_config table pattern (D-25) |
| FND-11 | OTA runtime-version policy, rollback | Architecture Patterns — EAS Update / runtime policy |
| FND-12 | CI proves cross-user/household row isolation | Validation Architecture — pgTAP + supabase test db in GitHub Actions |
| ENV-01 | Env vars + EAS secrets, `.env.example` | Code Examples — secrets hygiene |
| ENV-02 | `.env` gitignored, CI fails on committed credential pattern | Don't Hand-Roll — gitleaks |
| ENV-03 | Supabase project provisioned, connection verified | Architecture Patterns — Supabase client init |
| ENV-04 | Service-role key as EAS secret, Edge Functions only | Security Domain |
| ENV-05 | EAS project with dev/preview/prod profiles | EAS Build/Submit section |
| ENV-06 | Google OAuth client IDs (iOS/Android/Web), sign-in end to end | Code Examples — Google Sign-In + nonce |
| ENV-07 | Sign in with Apple configured, end to end — deferrable on ENV-10 | Code Examples — Apple Sign-In + nonce |
| ENV-08 | Frankfurter Edge Function deployed, scheduled | Out of this phase's build scope per ROADMAP (Money Core uses it); Phase 0 only provisions Supabase project — noted |
| ENV-09 | Dependency status register maintained | Claude's Discretion — format/location |
| ENV-10 | Apple Developer Program active as org | Dependency Provisioning table |
| ENV-13 | Sentry project + DSN — deferrable pending D-19 spike | Common Pitfalls — PostHog error tracking maturity |
| ENV-14 | PostHog project on EU host, key wired in | Standard Stack — posthog-react-native config |
| ENV-15 | D-U-N-S confirmed/requested day one | Dependency Provisioning table |
| ENV-17 | Local via Supabase CLI + free cloud project; prod separate; migrations via git | Architecture Patterns — Supabase CLI migrations workflow |
| ENV-18 | Supabase region deliberate, reasoning recorded | D-22 — US West (us-west-2) |
| ENV-20 | Company website + work email, gates ENV-10 | Dependency Provisioning table; D-06/D-07 |
| ANL-01 | PostHog EU host, identify by Supabase UUID only | Standard Stack — posthog-react-native |
| ANL-02 | No event before opt-in, changeable later | Code Examples — consent gating pattern |
| ANL-03 | Typed event catalogue, no amounts/payee/account/free text | Don't Hand-Roll — typed analytics catalogue |
| ANL-04 | Session replay excluded from production builds | Code Examples — sessionReplay: false / build-config gate |
| ACC-01 | Sign in with Apple account creation | Code Examples |
| ACC-02 | Google Sign-In account creation | Code Examples |
| ACC-03 | Apple name/email captured on first authorization, persisted immediately | Common Pitfalls — Pitfall 8 (PITFALLS.md, reused) |
| ACC-04 | Household-of-one + RLS auto-provisioned, invisible | Architecture Patterns — auth.users trigger pattern |
| ACC-05 | Session persists across restarts | Code Examples — LargeSecureStore adapter |
| DSG-02 | Colours from documented token set only | BUILD-PROMPT §2 (canonical ref); D-12 exception documented |
| DSG-03 | Safe-area insets respected | BUILD-PROMPT §2 layout section |
| DSG-04 | Typed i18n catalogue | Standard Stack — react-i18next + TypeScript |
| ACC-12 | Session stored encrypted, key in secure storage, works around 2048-byte limit | Code Examples — LargeSecureStore |
</phase_requirements>

## Summary

Phase 0 is unusually broad for a "foundation" phase: it fuses an Expo SDK 57 project bootstrap with a full Supabase Auth + RLS bootstrap, a CI-enforced architecture boundary, a live theming system, opt-in analytics, and the start of two store-enrolment processes with month-long external clocks. Nothing here is exotic engineering — every piece is a documented, first-party pattern — but the phase has an unusual number of "looks done but isn't" traps concentrated in exactly the areas CONTEXT.md calls out: Apple's first-authorization-only name/email quirk, the nonce-mismatch trap in Supabase's `signInWithIdToken`, SecureStore's ~2048-byte ceiling against a JWT+refresh-token session, and RLS policies that are functionally correct but 100x slower than they need to be without the `(select auth.uid())` wrap and supporting indexes.

The project's own `.planning/research/` (STACK.md, ARCHITECTURE.md, PITFALLS.md) already carries HIGH-confidence, September-2026-verified package versions and the engine-boundary/RLS/household-of-one architecture this phase implements — this document does not repeat that work, it fills the gaps CONTEXT.md's key research areas flagged: exact auth code shapes (Apple/Google nonce handling, LargeSecureStore), the CI wiring for coverage-per-folder and RLS isolation tests, PostHog's EU-host/opt-in/session-replay/error-tracking configuration surface, the Supabase CLI migrations workflow, and the reduce-motion API in Reanimated 4.

One environment fact matters for planning: on this machine, Node 24.15/npm 11/git 2.43/eas-cli 24.7.0 are installed and current, but **Docker Desktop's engine was not running** during this research session (client responds, daemon does not) and the **Supabase CLI, Android SDK (`adb`), and a JDK are not yet installed**. FND-02's "local Android emulator" and ENV-17/FND-12's "Supabase CLI local stack" both need these provisioned as literal Wave-0 tasks, not assumed present.

**Primary recommendation:** Sequence Phase 0 as (1) Expo scaffold + engine boundary + CI skeleton first (no external accounts needed, matches ROADMAP's "app boots on Android emulator, first plan" milestone), (2) Supabase project + auth + household-of-one RLS second (minutes to provision, unblocks everything after), (3) theming/i18n/reduce-motion in parallel with auth once the shell exists, (4) PostHog + analytics gating once auth exists (UUID-based identify needs a signed-in user), (5) Apple/Google enrolment and D-U-N-S/domain/website work run the entire time as a background thread with its own tasks, not gating the rest of the phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Expo project scaffold, TS config, Router setup | Client (Expo/RN) | — | Pure client tooling, no backend dependency |
| `engine/` purity boundary (lint + dependency-cruiser) | Client (build tooling) / CI | — | Enforced at lint/CI time, not runtime; engine itself is framework-agnostic pure TS |
| Sign in with Apple / Google Sign-In (native ceremony) | Client (native modules) | API/Backend (Supabase Auth) | Native SDK performs the OS-level auth ceremony; the ID token is verified and a session minted server-side by Supabase Auth (GoTrue) |
| Session token minting, refresh, nonce verification | API/Backend (Supabase Auth) | — | GoTrue is the OAuth/OIDC token exchange authority; client never verifies tokens itself |
| Household-of-one auto-provisioning | Database (Postgres trigger) | API/Backend (Supabase Auth `auth.users` insert event) | Standard pattern: a `security definer` trigger on `auth.users` fires synchronously on the same transaction as signup — no client round-trip, no race |
| RLS policy enforcement (row isolation) | Database (Postgres RLS) | — | The only authorization boundary per ARCHITECTURE.md Pattern 6 — never duplicated in client logic |
| Encrypted session storage on-device | Client (SecureStore + AsyncStorage adapter) | — | Client-local concern; Supabase Auth is storage-adapter-agnostic |
| Design tokens, theme context, live accent/font switch | Client (React context + StyleSheet) | — | Pure UI-tier state, no persistence beyond the profile-row cache (D-14) |
| Typed i18n catalogue | Client (react-i18next) | — | Static resource bundle shipped in the app binary |
| Reduce-motion handling | Client (Reanimated `ReducedMotionConfig` / OS `AccessibilityInfo`) | — | OS-level accessibility signal, read client-side only |
| PostHog analytics capture | Client (posthog-react-native SDK) | API/Backend (PostHog EU host, external) | Client SDK batches and ships events to PostHog's cloud; opt-in gate lives client-side before any network call |
| Error/crash reporting | Client (posthog-react-native SDK / Sentry) | API/Backend (PostHog or Sentry cloud) | Same shape as analytics — client captures, external service stores |
| Minimum-version gate | Database (Supabase `app_config` table, public RLS read) | Client (launch-time fetch) | D-25: server-authoritative so a forced update can be pushed without an app release |
| CI architecture/coverage/RLS gates | CI (GitHub Actions) | — | D-24: GitHub Actions owns everything except native builds |
| Native build, signing, OTA | CI (EAS Build/Update/Workflows) | — | D-24: EAS owns build/submit/update exclusively |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo` | `~57.0.24` | Managed framework | Current stable per project STACK.md, verified against npm 2026-09-21; SDK 58 is preview-only |
| `expo-router` | `~57.0.22` | File-based navigation | Versioning now tracks the SDK number directly (not its own vN scheme) |
| `react-native` | `0.86.3` | Runtime (ships inside SDK 57) | New Architecture permanently on, no legacy-bridge fallback |
| `react` | `19.2` | UI library | Unchanged since SDK 56 |
| TypeScript | `strict: true` | Language | Locked in PROJECT.md/CLAUDE.md |
| `@supabase/supabase-js` | `2.116.0` | Postgres client, Auth, Realtime | [VERIFIED: npm registry, prior session, re-confirmed against project STACK.md] |
| `@react-native-async-storage/async-storage` | `≥2.x` | Session + query-cache backing store | Required by both the LargeSecureStore adapter and later TanStack Query persister |
| `expo-secure-store` | `~57.0.3` | Small-secret storage (the AES key, not the session itself) | SDK-locked; ~2KB practical ceiling on iOS Keychain values [CITED: Expo docs] |
| `expo-apple-authentication` | current, SDK-locked | Native Sign in with Apple ceremony | Official Expo module; the only supported path to the native SIWA button on iOS |
| `@react-native-google-signin/google-signin` | current (≥13.x) | Native Google Sign-In ceremony | Standard RN Google auth module; supports passing a custom nonce (a free tier limitation ruled out an alternative library per WebSearch findings) [CITED: react-native-google-signin docs] |
| `aes-js` | `3.1.2` | AES-CTR encryption for the session blob | [VERIFIED: npm registry 2026-09-22] — this is literally the library named in Supabase's own React Native auth guide for the `LargeSecureStore` pattern |
| `react-native-get-random-values` | `2.0.0` | Crypto-secure random for the AES key and OAuth nonce | [VERIFIED: npm registry 2026-09-22] |
| `posthog-react-native` | `4.75.0` | Product analytics + (candidate) error tracking | [VERIFIED: npm registry 2026-09-22] |
| `@posthog/react-native-plugin` | `≥2.0.1` | Session replay plugin (kept installed but disabled per ANL-04/production gate) | As of `posthog-react-native` 4.47.0+, the old `posthog-react-native-session-replay` package was renamed to this [CITED: PostHog docs via WebSearch] |
| `react-i18next` | `17.0.15` | Typed i18n catalogue | [VERIFIED: npm registry 2026-09-22] |
| `i18next` | `26.4.2` | i18n core engine react-i18next wraps | [VERIFIED: npm registry 2026-09-22] |
| `react-native-reanimated` | `4.5.5` | UI-thread theme/accent transitions, reduce-motion API | Per project STACK.md, requires `react-native-worklets` as an explicit separate dependency |
| `react-native-worklets` | `0.12.x` | Reanimated 4's split worklet runtime | Omitting it is a common upgrade-guide gotcha [CITED: project STACK.md] |
| `expo-font` + `@expo-google-fonts/*` | current, SDK-locked | Loading the 4 font pairings (Archivo Black/Archivo, Manrope, Space Grotesk, IBM Plex Sans) | Standard Expo font-loading path; per BUILD-PROMPT §2 |
| `react-native-safe-area-context` | current, ships with Expo | Safe-area insets (DSG-03) | Standard; BUILD-PROMPT §2 explicitly calls for `insets.top + 21` instead of hardcoded `68px` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dependency-cruiser` | `18.4.0` | CI-level transitive engine-purity gate | [VERIFIED: npm registry 2026-09-22]. Non-bypassable CI step per FND-04/ARCHITECTURE.md Pattern 1 |
| `eslint-plugin-boundaries` | `7.2.0` | Editor-time engine-purity feedback | [VERIFIED: npm registry 2026-09-22]. Fast local feedback; dependency-cruiser is the CI backstop |
| `gitleaks` | current (Go binary, not npm) | Credential-pattern scan in CI (ENV-02) | Claude's Discretion tool choice — chosen here as the standard, actively-maintained option with an official GitHub Action and SARIF output [CITED: gitleaks.org] |
| `jest` | `30.x` | Test runner, coverage engine | Per-directory `coverageThreshold` config implements D-21's split thresholds |
| `@testing-library/react-native` | current | Component tests (theme switch, settings screen) | Standard RNTL |
| `supabase` (CLI) | current | Local dev stack, migrations, `supabase test db` | **Not currently installed on this dev machine — see Environment Availability** |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostHog error tracking (D-19's first choice) | Sentry (`@sentry/react-native`) | Sentry is the more battle-tested RN crash-reporting tool with mature symbolication; PostHog's RN error tracking (source-map upload, EAS-build symbolication) is real and documented but newer — D-19 already scopes this as an explicit spike-then-decide, not a locked choice. Keep the Sentry install commented/ready in `package.json` notes so the fallback costs minutes, not a redesign |
| `react-i18next` (mature, larger) | `typesafe-i18n` (~1KB, generates types from translations) | typesafe-i18n has a smaller runtime and equally strong type safety, but `react-i18next` is the more battle-tested RN combination (paired with `react-native-localize`) and has first-party TypeScript module-augmentation docs — lower risk for a solo/small-team project that needs this working correctly the first time |
| `@react-native-google-signin/google-signin` | Expo `AuthSession` + Google's web OAuth flow | AuthSession works but loses the native "One Tap"-style UX and needs more manual nonce plumbing; the native module is the standard choice when a dev build (not Expo Go) is already mandatory, which this project's constraints already require |
| `gitleaks` | `trufflehog`, GitHub's native secret scanning (Advanced Security) | GitHub secret scanning requires GitHub Advanced Security (paid on private repos below Enterprise) or works differently on public repos; gitleaks is free, self-hosted in the Action, and SARIF-integrates with GitHub code scanning without a paid tier |

**Installation:**
```bash
# Core (Expo SDK 57) — already covered by project STACK.md; auth/theming/analytics additions below
npx expo install expo-apple-authentication expo-secure-store expo-font expo-local-authentication
npm install @react-native-google-signin/google-signin
npm install aes-js react-native-get-random-values
npx expo install react-native-reanimated react-native-worklets react-native-safe-area-context
npm install react-i18next i18next
npm install posthog-react-native
npx expo install expo-application  # for app version comparisons feeding FND-09

# Dev/CI
npm install -D dependency-cruiser eslint-plugin-boundaries jest@^30 @testing-library/react-native
# gitleaks is a standalone binary/GitHub Action, not an npm package — see Don't Hand-Roll
```

**Version verification:** All versions above marked `[VERIFIED: npm registry]` were checked live via `npm view <package> version` on 2026-09-22 during this research session. `expo`/`expo-router`/`react-native`/`@supabase/supabase-js` versions are carried from the project's existing `.planning/research/STACK.md` (verified 2026-09-21, one day prior) and were not re-verified in this session to avoid duplicate work — treat as HIGH confidence, same-week currency.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Client (Expo SDK 57 / React Native, dev build)                     │
│                                                                       │
│  Welcome screen (D-10)                                              │
│     │  taps "Continue with Apple" / "Continue with Google"          │
│     ▼                                                                │
│  Native auth ceremony (expo-apple-authentication /                  │
│  @react-native-google-signin) → identityToken + rawNonce            │
│     │                                                                │
│     ▼                                                                │
│  supabase.auth.signInWithIdToken({ provider, token, nonce })  ──────┼──┐
│     │                                                                │  │
│     ▼                                                                │  │
│  LargeSecureStore adapter persists encrypted session               │  │
│  (AES key → SecureStore, encrypted blob → AsyncStorage)            │  │
│     │                                                                │  │
│     ▼                                                                │  │
│  Settings/"You" screen (D-13): theme switch, analytics opt-in,      │  │
│  connection check, sign out                                         │  │
└───────────────────────────────────────────────────────────────────┬─┘  │
                                                                      │   │
┌─────────────────────────────────────────────────────────────────┐ │   │
│  Supabase (remote, source of truth) — US West region (D-22)      │ │   │
│                                                                    │ │   │
│  Auth (GoTrue) ◄──────────────────────────────────────────────────┼─┘   │
│     │ verifies id_token + nonce against Apple/Google's public     │     │
│     │ keys, mints session, inserts row into auth.users            │     │
│     ▼                                                              │     │
│  AFTER INSERT trigger on auth.users (security definer)            │     │
│     │ creates households row (owner=user) + household_members row │     │
│     │ (role=owner, weight=1) — same transaction, no client round- │     │
│     │ trip, no race condition                                    │     │
│     ▼                                                              │     │
│  Postgres tables (transactions, goals, ... — future phases)       │     │
│  RLS: household_id in (select household_id from household_members │     │
│        where user_id = (select auth.uid()))                       │     │
│                                                                    │     │
│  app_config table (public, RLS-readable pre-auth) ─────────────────────►│
│     min_supported_version → client compares on launch, shows      │
│     update-required screen if below (FND-09)                      │
└─────────────────────────────────────────────────────────────────┘     │
                                                                          │
┌─────────────────────────────────────────────────────────────────┐     │
│  PostHog (EU host) — only reached after explicit opt-in (D-17) ◄──────┘
│     identify(supabase_user_id) — never email/name                │
│     typed event catalogue — amounts/payee/account unrepresentable│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions CI (D-24)                                         │
│    lint (eslint incl. boundaries) → typecheck → dependency-cruiser│
│    → jest --coverage (per-folder thresholds) → gitleaks scan      │
│    → supabase start (Docker) + supabase test db (pgTAP RLS tests) │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  EAS (Build / Submit / Update / Workflows) (D-24)                 │
│    native builds only — Android emulator loop + iOS dev build to  │
│    physical iPhone XR, OTA JS-only updates post-launch             │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

Adopt the structure already specified in `.planning/research/ARCHITECTURE.md` (`src/engine/`, `src/data/`, `src/state/`, `src/ui/`, `src/theme/`, `src/features/`, `src/services/`, `supabase/migrations/`, `supabase/functions/`). Phase 0 populates: `src/engine/types/` (empty scaffold + boundary rules only — no real engine logic ships until Phase 1/4), `src/theme/`, `src/services/supabase.ts` + `src/services/auth/`, `src/services/analytics/`, `supabase/migrations/0001_household_of_one.sql`, `.dependency-cruiser.cjs`, `eslint.config.js`, `.github/workflows/ci.yml`.

### Pattern 1: Apple/Google native auth → `signInWithIdToken` with nonce

**What:** Generate a cryptographically random raw nonce client-side, SHA-256 hash it, pass the **hash** into the native auth request (`ASAuthorizationAppleIDProvider` via `expo-apple-authentication`, or the Google Sign-In SDK's `nonce` parameter), receive back an `identityToken`/`idToken`, and pass the **raw** (unhashed) nonce plus that token to `supabase.auth.signInWithIdToken()`. Supabase hashes the raw nonce server-side and compares it against the digest embedded in the token's claims.

**When to use:** Every native (non-web-redirect) Apple/Google sign-in. For Apple-on-Android (D-11), use Supabase's web OAuth flow instead (`signInWithOAuth`), which handles its own PKCE/state — do not try to force the native nonce flow through a WebView.

**Trade-offs:** The #1 documented failure mode is nonce mismatch — passing the raw nonce where the hash is expected, or vice versa, or forgetting that Google's iOS SDK skips nonces by default while Supabase requires them unless "Skip nonce checks" is explicitly enabled in the Supabase Auth provider settings. [MEDIUM confidence — WebSearch-verified against a live Supabase GitHub Discussion (#35209) documenting this exact failure and Supabase's own quickstart docs; exact code snippet not extracted verbatim from Supabase's docs page in this session, reconstruct from the documented parameter flow below]

**Example (reconstructed from documented parameter flow, not a verbatim doc copy — verify against `supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth` at implementation time):**
```ts
// services/auth/appleSignIn.ts
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabase';

export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce, // hashed nonce goes to Apple
  });

  if (!credential.identityToken) throw new Error('No identity token from Apple');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce, // RAW nonce goes to Supabase — it hashes and compares
  });
  if (error) throw error;

  // First-authorization-only capture — see Common Pitfalls
  if (credential.fullName?.givenName || credential.email) {
    await persistFirstAuthProfile(data.user.id, credential.fullName, credential.email);
  }
  return data;
}
```

### Pattern 2: LargeSecureStore adapter (encrypted session beyond SecureStore's byte ceiling)

**What:** `expo-secure-store`'s practical ceiling (~2KB on iOS, and some iOS releases historically rejected values above ~2048 bytes) is smaller than a Supabase session (JWT + refresh token can exceed it). The documented pattern: generate a 256-bit AES key with `react-native-get-random-values`, store *that key* (small) in SecureStore, encrypt the actual session value with `aes-js` in CTR mode, and store the *encrypted blob* in AsyncStorage (unbounded size, but useless without the key). [MEDIUM-HIGH confidence — WebSearch-verified across multiple independent sources describing the identical pattern, matching Supabase's own React Native auth guidance; exact adapter code not extracted verbatim from a single official source in this session]

**When to use:** As the `storage` option passed to `createClient()` for the Supabase client — this directly satisfies ACC-12.

**Trade-offs:** AES-CTR requires a fresh, unique counter/IV per encryption to remain secure — do not reuse counters across writes. Also: this pattern encrypts the *session* only; PROJECT.md's Key Decision separately covers the *query cache* (goes through AsyncStorage's TanStack Query persister, not this adapter — different concern, different phase).

**Example (reconstructed from the documented pattern — the exact class shape below is standard across the sources found; verify field names against `expo-secure-store` and `aes-js` current APIs at implementation time):**
```ts
// services/supabase/largeSecureStore.ts
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import 'react-native-get-random-values';

class LargeSecureStore {
  private async getKey(keyName: string): Promise<Uint8Array> {
    let keyHex = await SecureStore.getItemAsync(keyName, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
    if (!keyHex) {
      const key = crypto.getRandomValues(new Uint8Array(32));
      keyHex = aesjs.utils.hex.fromBytes(key);
      await SecureStore.setItemAsync(keyName, keyHex, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
    }
    return aesjs.utils.hex.toBytes(keyHex);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    const keyBytes = await this.getKey(`${key}-secure-key`);
    const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(aesCtr.decrypt(aesjs.utils.hex.toBytes(encrypted)));
  }

  async setItem(key: string, value: string) {
    const keyBytes = await this.getKey(`${key}-secure-key`);
    const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
    const encrypted = aesjs.utils.hex.fromBytes(aesCtr.encrypt(aesjs.utils.utf8.toBytes(value)));
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(`${key}-secure-key`);
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: new LargeSecureStore(), autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
```
D-15's sign-out requirement (wipe encrypted cache + key + queued writes) maps directly onto calling `removeItem` for every LargeSecureStore-backed key, not just the session key.

### Pattern 3: Household-of-one via `auth.users` trigger (security definer)

**What:** A `security definer` PL/pgSQL function attached as an `AFTER INSERT ON auth.users` trigger creates the `households` row and `household_members` row (role=owner, weight=1) synchronously, in the same transaction as the signup. This is Supabase's own documented pattern for auto-provisioning related rows on signup. [HIGH confidence — matches Supabase's official "Managing User Data" guide pattern and is independently confirmed by ARCHITECTURE.md Pattern 6, already researched at project level]

**When to use:** This is the mechanism for ACC-04 — "no setup step visible to the user."

**Trade-offs:** If the trigger function errors, it can **block signup entirely** — test it thoroughly, and prefer a function that cannot fail on valid input (no external calls, no nullable-column surprises) over a function with broad error-handling. The function must be owned by a non-login role, have `search_path` pinned explicitly (empty or fixed), and have `execute` revoked from `public` — the same security-definer hardening ARCHITECTURE.md's Pattern 6 already specifies for `redeem_invite`.

**Example:**
```sql
-- supabase/migrations/0001_household_of_one.sql
create table households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'owner',
  weight numeric not null default 1,
  display_name text,
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on household_members(user_id);
create index household_members_household_user_idx on household_members(household_id, user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into households (owner_id) values (new.id) returning id into new_household_id;
  insert into household_members (household_id, user_id, role, weight)
  values (new_household_id, new.id, 'owner', 1);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### Pattern 4: Minimum-version gate as a public-read Supabase table

**What:** A single-row (or versioned-rows) `app_config` table with a public, RLS-scoped `select` policy readable **before** authentication, holding `min_supported_version`. The client compares its own version (`expo-application`'s `Application.nativeApplicationVersion`) against this on launch and renders an update-required screen if below.

**When to use:** FND-09. D-25 explicitly rejects a PostHog flag for this — flags are device-evaluated and tamperable, and analytics is opt-in/gated, so a flag could never be trusted pre-consent anyway.

**Trade-offs:** This table must be readable by the `anon` role (pre-auth), which means it needs its own narrowly-scoped RLS policy separate from every other table's authenticated-only default — an easy place to accidentally leave RLS too permissive if copy-pasted from another policy. Scope the anon `select` policy to only this one table.

**Example:**
```sql
create table app_config (
  key text primary key,
  value text not null
);

alter table app_config enable row level security;

create policy "app_config readable by anyone"
on app_config for select
to anon, authenticated
using (true);

insert into app_config (key, value) values ('min_supported_version', '1.0.0');
```

### Pattern 5: Dual-layer engine-purity gate (already project-researched — restated with exact current versions)

**What:** `eslint-plugin-boundaries` (`7.2.0`) for editor-time direct-import feedback + `dependency-cruiser` (`18.4.0`) for CI-level transitive-import enforcement. See `.planning/research/ARCHITECTURE.md` Pattern 1 for the full config — reused verbatim here, versions confirmed current as of this session.

**When to use:** From the very first commit, both wired as required (non-bypassable) CI checks.

### Pattern 6: Reduce-motion via Reanimated 4's `ReducedMotionConfig`

**What:** Reanimated 4 ships two complementary APIs: `useReducedMotion()` — a synchronous hook returning the OS setting's value **at app start** — and `<ReducedMotionConfig mode={ReduceMotion.System | Always | Never} />`, a component that, in `System` mode (the default), automatically collapses *all* Reanimated-driven animations to near-zero duration when the OS reports reduce-motion enabled, without needing to thread a boolean through every animation call site. [HIGH confidence — CITED: docs.swmansion.com/react-native-reanimated official pages for both APIs]

**When to use:** Mount `<ReducedMotionConfig mode={ReduceMotion.System} />` once, near the app root, and it governs every worklet-driven animation project-wide (the seven named animations from BUILD-PROMPT §2). For non-Reanimated animation (rare, but check any `Animated` API usage or CSS-transition-style RN styling), still read `AccessibilityInfo.isReduceMotionEnabled()` directly and its `reduceMotionChanged` event for live updates — `ReducedMotionConfig` only governs Reanimated's own worklets.

**Trade-offs:** `useReducedMotion()`'s value is captured at app start, not live — if the OS setting changes while the app is foregrounded, that hook's value doesn't update until next launch. For a setting a user might toggle mid-session (unlikely but possible via Settings), prefer `ReducedMotionConfig` (which does react live, per its own docs) as the primary mechanism and reserve `useReducedMotion()` for one-time layout decisions only.

**Example:**
```tsx
// app/_layout.tsx
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';

export default function RootLayout() {
  return (
    <>
      <ReducedMotionConfig mode={ReduceMotion.System} />
      {/* ...rest of app */}
    </>
  );
}
```

### Pattern 7: PostHog — EU host, opt-in gate, UUID identity, no session replay in production

**What:** `posthog-react-native` (`4.75.0`) is configured with `host: 'https://eu.i.posthog.com'` (EU data residency, chosen once at project creation and not changeable later per PostHog's own docs), `defaultOptIn: false` combined with `optOut()` called immediately on client init, and an explicit `optIn()` call only after the user's affirmative consent (D-17). Session replay is a **separate installable plugin** (`@posthog/react-native-plugin`, ≥2.0.1, the current name after a rename from `posthog-react-native-session-replay` at SDK 4.47.0+) — for ANL-04, either don't install it at all in production builds, or install it but explicitly never call its enable/start methods outside a non-production build-config branch. Identity is set via `posthog.identify(supabaseUserId)` — never email or name — immediately after auth succeeds. [MEDIUM-HIGH confidence — WebSearch-verified against PostHog's own docs pages for region selection, session-replay opt control, and the plugin rename; exact `defaultOptIn`/`optOut` method names should be re-checked against `posthog-react-native` 4.75.0's current API at implementation time since the SDK has moved fast]

**When to use:** Client initialization happens once at app boot (host + project key from env), but no event should actually leave the device (`capture()` calls are no-ops) until `optIn()` is called post-consent — this satisfies ANL-02's "no event leaves the device until opt-in" literally, not just in spirit.

**Trade-offs:** PostHog's opt-in/opt-out state is itself persisted by the SDK (so it survives restarts) — verify at implementation time whether that persisted state lives in a location that should also be wiped on sign-out (D-15's cache-wipe requirement) to avoid a returning/different user inheriting a stale opt-in state on a shared device.

**Example:**
```ts
// services/analytics/posthog.ts
import PostHog from 'posthog-react-native';

export const posthog = new PostHog(process.env.EXPO_PUBLIC_POSTHOG_KEY!, {
  host: 'https://eu.i.posthog.com',
  // Do NOT auto-start session replay in production; only reference the plugin
  // in non-production builds if it's installed at all — see ANL-04.
});

// On app boot, before any consent decision, ensure no capture leaves the device:
posthog.optOut();

// After the user answers the D-17 consent screen with "share usage":
export function grantAnalyticsConsent(supabaseUserId: string) {
  posthog.optIn();
  posthog.identify(supabaseUserId);
}

// On decline, or on sign-out (D-15):
export function revokeAnalyticsConsent() {
  posthog.optOut();
  posthog.reset(); // clears local identity/state
}
```

### Anti-Patterns to Avoid

- **Calling `supabase.auth.signInWithPasskey()` from React Native code:** internally calls the browser-only `navigator.credentials.get()`, which doesn't exist in Hermes — will throw. Not relevant to Phase 0 (passkeys are out of scope entirely per PROJECT.md), noted only because it's an easy mis-autocomplete from IDE suggestions given `signInWithIdToken` and `signInWithPasskey` sit next to each other in the SDK.
- **Writing the RLS policy without the `(select auth.uid())` wrap or a supporting index:** functionally correct, catastrophically slow at real data volumes (up to ~170x per Supabase's own published benchmarks) — see ARCHITECTURE.md Anti-Pattern 3, restated here because Phase 0 writes the *first* RLS policy the project ships and sets the pattern every later table copies.
- **Assuming a provisioning profile silently widens when a new capability (Sign in with Apple, notifications) is added to `app.json`:** it doesn't — re-run `eas credentials` / trigger a clean build after every config-plugin change. See Common Pitfalls below.
- **Filing the Google Play Financial features declaration narrowly** at first upload with intent to widen it later — Play's own review checks *observed behaviour*, not just the checkbox, and narrow-then-widen is the documented pattern behind real, multi-round "inaccurate declaration" rejection loops. Not this phase's literal task (Phase 0 registers the Play Console account per D-04, doesn't yet upload a build), but the declaration should be filed broad (full v1 feature set) whenever the first internal-testing upload happens, which may be sooner than the roadmap's later phases if D-04's pull-forward changes the internal-testing timeline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encrypted, large-value secure storage | A custom Keychain/Keystore wrapper | `expo-secure-store` (key) + `aes-js` + AsyncStorage (LargeSecureStore pattern, Pattern 2 above) | This is the exact, repeatedly-documented pattern Supabase's own guidance and multiple independent tutorials converge on; hand-rolling AES key management is a security-bug generator |
| OAuth/OIDC nonce verification | Custom JWT signature/nonce checking against Apple/Google's public keys | Supabase Auth's `signInWithIdToken` | GoTrue already fetches and caches Apple/Google's JWKS and does the verification server-side; reimplementing this client- or Edge-Function-side duplicates a well-tested, security-critical code path for no benefit |
| Engine-purity enforcement | A custom AST-walking import checker | `eslint-plugin-boundaries` + `dependency-cruiser` | Both are mature, actively maintained, and already handle the transitive-import case that a hand-rolled `no-restricted-imports`-only approach misses (per ARCHITECTURE.md Pattern 1) |
| Credential/secret scanning in CI | A regex grep script for API-key-shaped strings | `gitleaks` | Gitleaks ships a maintained, regularly-updated ruleset of secret patterns (AWS keys, Supabase keys, Stripe keys, generic high-entropy strings, etc.) that a bespoke regex list will not keep current with |
| RLS correctness testing | Manual "try to read another user's row" spot-checks | pgTAP via `supabase test db` in CI | pgTAP is Postgres's standard unit-testing framework and integrates natively with `supabase test db`; manual spot-checks don't run on every PR and don't prove the negative case systematically |
| Typed i18n key safety | A hand-rolled `t(key: string)` wrapper with manually-maintained key unions | `react-i18next` + TypeScript module augmentation | react-i18next's official TS integration auto-derives the key union from the translation resource shape — a hand-rolled union drifts the moment a key is added/renamed and not updated in two places |
| Reduce-motion animation collapsing | Threading an `isReduceMotionEnabled` boolean through every individual animation call | Reanimated 4's `<ReducedMotionConfig mode={ReduceMotion.System} />` | One mount point governs every Reanimated worklet project-wide; per-call-site threading is exactly the kind of thing that gets forgotten on the 8th new animation |

**Key insight:** Every "don't hand-roll" item above already has a first-party or de-facto-standard library covering it as of September 2026 — the risk in this phase isn't a missing library, it's wiring an existing library's less-obvious parameter (the nonce direction, the RLS `(select ...)` wrap, the anon-readable `app_config` policy) backwards. The Common Pitfalls section below is the operative content for this phase, more than any build-vs-buy decision.

## Common Pitfalls

### Pitfall 1: Nonce direction reversal in Apple/Google sign-in

**What goes wrong:** The raw nonce and its SHA-256 hash get passed to the wrong side — the native auth SDK gets the raw nonce (it needs the hash) or Supabase gets the hash (it needs the raw value, since it hashes internally to compare). Produces `AuthApiError: Passed nonce and nonce in id_token should either both exist or not` or a silent auth failure.
**Why it happens:** The two nonce parameters (one for the native SDK request, one for Supabase's `signInWithIdToken`) are easy to conflate since both are called "nonce" in their respective APIs, but one wants the hash and one wants the raw value.
**How to avoid:** Follow Pattern 1's exact flow: hash → native SDK, raw → Supabase. Write a one-line comment at each call site stating which form is expected. Test with a fresh (non-cached) sign-in on both platforms before considering auth "done."
**Warning signs:** `AuthApiError` mentioning nonce mismatch; sign-in succeeding on one platform (e.g., Google) but not the other (e.g., Apple) despite structurally similar code.
**Phase to address:** Foundation (this phase).

### Pitfall 2: Apple's first-authorization-only name/email

**What goes wrong:** Apple returns `fullName`/`email` **only on the very first authorization** for a given user+app pair. Every subsequent sign-in returns `null` for those fields. If the first payload isn't captured and persisted server-side immediately, that data is permanently unrecoverable through the sign-in flow itself.
**Why it happens:** This is documented Apple platform behaviour, not a bug — but it doesn't surface in casual testing where a developer keeps generating fresh sandbox Apple IDs (every test "looks like" a first authorization).
**How to avoid:** In the same client call that receives the credential, check for non-null `fullName`/`email` and immediately write them to the Supabase user record (a `profiles` table row, or via the auth trigger reading `raw_user_meta_data` if passed through) before any other logic runs — not deferred, not batched.
**Warning signs:** A user profile showing a null/missing name after what should have been their first Apple sign-in; testing that only ever exercises "first sign-in" and never simulates a second one.
**Phase to address:** Foundation (ACC-03 directly).

### Pitfall 3: Provisioning profile doesn't retroactively gain new entitlements

**What goes wrong:** EAS auto-manages provisioning profiles, but a profile minted for an earlier, simpler build config doesn't automatically widen when a later config-plugin addition (Sign in with Apple capability, `expo-notifications`, `expo-local-authentication`) needs a new entitlement. The first iOS build succeeds; a later one fails with a provisioning/entitlement error that looks unrelated to the actual code change.
**Why it happens:** Profile regeneration is keyed to what's declared at build time, and EAS doesn't proactively diff "what capabilities does this build need vs. what does the existing profile have."
**How to avoid:** After adding any capability-bearing config plugin (Sign in with Apple is added in *this* phase), run `eas credentials` to inspect the current profile and trigger a clean build to confirm the new entitlement was picked up — don't assume the existing profile silently updates. [CITED: project's own PITFALLS.md Pitfall 5, restated here because Sign in with Apple is the specific capability this phase adds]
**Warning signs:** A previously-green EAS Build failing immediately after adding Sign in with Apple, with a provisioning/entitlement error rather than a code error.
**Phase to address:** Foundation, at the point Sign in with Apple is wired in (and re-verify at System phase for notifications/biometrics).

### Pitfall 4: RLS policy correctness without performance

**What goes wrong:** The household-membership RLS policy (Pattern 3 above) is written in its "obviously correct" form (`using (household_id in (select household_id from household_members where user_id = auth.uid()))`) without the `(select auth.uid())` wrap or supporting indexes. It returns correct rows against a handful of seed records in testing and is up to ~170x slower at real data volumes — a fact that won't surface until much later, in a phase where transaction volume actually exists.
**Why it happens:** The unwrapped form is the first thing anyone writes, and Postgres doesn't warn about the missing initPlan caching opportunity.
**How to avoid:** Apply the `(select auth.uid())` wrap and `create index on household_members(user_id)` / `create index on household_members(household_id, user_id)` as a non-negotiable part of the first migration, not a later optimization pass. [HIGH confidence — CITED: Supabase's own published RLS performance benchmarks, already verified in project ARCHITECTURE.md Pattern 6/Anti-Pattern 3]
**Warning signs:** None visible in Phase 0's household-of-one scale (one row per household); this is a "gets it right structurally from day one" pitfall, not a "will be caught by testing this phase" pitfall — worth an explicit code-review checklist item since the failure mode is invisible until Household/Record phases add real volume.
**Phase to address:** Foundation (write it right the first time — every later table's RLS policy copies this one).

### Pitfall 5: SecureStore silently failing on values it can't hold

**What goes wrong:** If the LargeSecureStore pattern (Pattern 2) isn't used and a raw Supabase session is passed directly to `expo-secure-store`, values exceeding the practical ~2048-byte ceiling can fail to persist — sometimes silently, sometimes with a platform-specific error — depending on the OS version and value size. A user appears logged in during the session but is signed out on next app open.
**Why it happens:** A Supabase session (access token + refresh token + metadata, JSON-serialized) is comfortably capable of exceeding 2KB, especially with a verbose JWT.
**How to avoid:** Never pass `expo-secure-store` directly as the Supabase client's `storage` option for the session — always route through the LargeSecureStore adapter (Pattern 2).
**Warning signs:** Session persists in the current app session but the user is unexpectedly signed out after a full app restart (ACC-05's exact failure mode).
**Phase to address:** Foundation (ACC-05, ACC-12 — this is the literal reason those two requirements exist together).

### Pitfall 6: Docker/Supabase CLI not present on this dev machine

**What goes wrong:** ENV-17 and FND-12 both assume a working local Supabase CLI stack (Docker-backed). On the machine this research session ran on, `docker info` returned client-only output (no Server section — daemon not running/Docker Desktop not started) and the Supabase CLI binary is not on `PATH`. If Wave 0 tasks assume these are ready, the first `supabase start` will fail immediately.
**Why it happens:** These are exactly the kind of "assumed present" tools that a fresh Windows dev machine doesn't have until someone deliberately installs them — not a code bug, an environment-setup gap.
**How to avoid:** Make "install Supabase CLI" (via `scoop install supabase` or `npm install -g supabase` — verify current recommended Windows install method at implementation time, Scoop is Supabase's documented Windows path) and "start Docker Desktop" explicit, separate Wave-0 tasks with a verification step (`supabase --version`, `docker info` showing a Server section), not assumed prerequisites.
**Warning signs:** `supabase start` hanging or failing with a Docker-connection error; `command not found` for `supabase`.
**Phase to address:** Foundation, Wave 0 (before any Supabase-dependent task).

## Code Examples

### Google Sign-In with nonce (native, Android + iOS)

```ts
// services/auth/googleSignIn.ts
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabase';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, // "Web" OAuth client ID, not Android/iOS
});

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const userInfo = await GoogleSignin.signIn({ nonce: hashedNonce } as any); // verify current param shape at implementation time — API surface moves between major versions
  const idToken = userInfo.data?.idToken;
  if (!idToken) throw new Error('No ID token from Google');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  return data;
}
```
Note: `GoogleSignin.signIn()`'s exact parameter shape has changed across major versions of `@react-native-google-signin/google-signin` — re-verify the nonce-passing parameter name against the currently-installed version's types at implementation time; do not trust this snippet's exact shape without a type-check pass.

### Jest per-directory branch-coverage thresholds (D-21)

```js
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
    './src/engine/money/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/engine/decide/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/engine/payoff/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/engine/split/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/engine/': { branches: 95, functions: 95, lines: 95, statements: 95 },
  },
};
```
[HIGH confidence — CITED: Jest official docs, `coverageThreshold` supports per-directory-glob keys exactly this way] Note the two-tier structure: the specific 100%-folders are listed individually *and* the broader `./src/engine/` catch-all applies 95% to everything else under `engine/` including those same folders — Jest applies the most specific matching threshold per file, so this correctly implements D-21's "100% on four folders, 95% on the rest."

### GitHub Actions CI skeleton (D-24)

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, push]
jobs:
  lint-typecheck-boundary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npx depcruise src --config .dependency-cruiser.cjs
      - run: npx jest --coverage

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  rls-isolation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - run: supabase test db
```
[HIGH confidence — CITED: gitleaks.org official Action usage, Supabase's own CI testing docs (`supabase/setup-cli` + `supabase start` + `supabase test db`) — pattern independently confirmed across multiple sources in this session] `ubuntu-latest` GitHub-hosted runners ship Docker pre-installed, so `supabase start`'s Docker dependency is satisfied automatically in CI even though it's missing on the local Windows dev machine (Pitfall 6) — the two environments are not symmetric and that's fine; local dev can proceed on the Android-emulator-only loop while CI's RLS job is set up in parallel.

### app_config-driven update-required screen (FND-09)

```ts
// features/system/useMinVersionGate.ts
import { useQuery } from '@tanstack/react-query'; // if landed yet; otherwise a plain useEffect+useState for Phase 0
import * as Application from 'expo-application';
import { supabase } from '../../services/supabase';
import semverLt from 'semver/functions/lt'; // or a hand-rolled 3-part compare — small enough not to need a dependency

export async function checkMinVersion(): Promise<{ blocked: boolean; minVersion: string }> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'min_supported_version')
    .single();
  if (error || !data) return { blocked: false, minVersion: '0.0.0' }; // fail open — never block launch on a network hiccup
  const current = Application.nativeApplicationVersion ?? '0.0.0';
  return { blocked: semverLt(current, data.value), minVersion: data.value };
}
```
Deliberate design note: fail **open** (allow launch) if the version check itself fails (network error, table missing) — a min-version gate that blocks launch when it *can't determine* the version defeats its own purpose and turns a connectivity blip into a full outage.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `posthog-react-native-session-replay` as a separate package | `@posthog/react-native-plugin` (≥2.0.1) | SDK 4.47.0+ | Any install instructions or tutorials referencing the old package name will fail; use the new package name |
| Expo Router versioned independently (`^7.0.0`) | Expo Router versioned in lockstep with the SDK number (`~57.0.22`) | Documented since SDK 56/57 transition, per project STACK.md | Pin `expo-router` to the SDK-matched version string, not a semver-major range |
| `expo-haptics` `notification()`/`impact()`/`selection()` | `notificationAsync()`/`impactAsync()`/`selectionAsync()` | SDK 57 | Not directly a Phase 0 requirement (haptics land with real interactions in later phases) but the settings screen's connection-check/sign-out actions may want haptic feedback — use only the Async methods from day one |
| Manual `no-restricted-imports`-only engine boundary | Dual-layer `eslint-plugin-boundaries` + `dependency-cruiser` | Already the project's locked decision, not new in this session | Confirmed still current tooling; both packages actively maintained through September 2026 |

**Deprecated/outdated:** Nothing else surfaced as newly deprecated beyond what STACK.md/PITFALLS.md already flagged (old `expo-haptics` method names, SDK 55/passkey assumptions from the original brief).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact `supabase.auth.signInWithIdToken` and Apple/Google native-SDK code shapes in Patterns 1/2 and the Google code example, reconstructed from documented parameter flows rather than a verbatim official-doc code block (Supabase's own quickstart page's code samples did not render as extractable text via WebFetch in this session) | Code Examples, Pattern 1, Pattern 2 | LOW-MEDIUM — the parameter *names and directions* are independently confirmed across multiple sources (Supabase GitHub Discussion, multiple tutorials), but exact method signatures (e.g., whether `GoogleSignin.signIn()` takes a `nonce` option directly at the current installed version) should be type-checked against the actually-installed package versions before relying on the snippet verbatim |
| A2 | `gitleaks` chosen as the ENV-02/credential-scan tool | Standard Stack, Don't Hand-Roll | LOW — this was explicitly Claude's Discretion per CONTEXT.md; if the planner or user prefers GitHub's native secret scanning or another tool, swap freely, no architectural dependency on gitleaks specifically |
| A3 | PostHog's exact opt-in/opt-out API method names (`optOut()`, `optIn()`, `defaultOptIn`) for `posthog-react-native` 4.75.0 | Pattern 7, Code Examples | MEDIUM — the *existence* of opt-in/opt-out control is confirmed via WebSearch against PostHog's own docs, but the SDK has moved fast (4.47 → 4.75 in recent months per the version gap) and exact method names should be re-verified against the installed version's TypeScript types before implementation |
| A4 | Recommended Windows install method for the Supabase CLI (`scoop install supabase`) | Common Pitfalls (Pitfall 6), Environment Availability | LOW — Scoop is Supabase's documented Windows path per general knowledge, but was not independently re-verified via WebSearch in this session; `npm install -g supabase` is a viable fallback if Scoop isn't already set up on this machine |
| A5 | `expo-apple-authentication`'s exact `nonce` parameter behavior (whether it accepts the hash directly as shown, or needs a different field) | Pattern 1 | MEDIUM — the SHA-256-then-native-SDK-then-raw-to-Supabase flow is the consistently documented pattern across all sources found, but the exact Expo API surface (`AppleAuthentication.signInAsync({ nonce: ... })`) should be checked against the currently-installed `expo-apple-authentication` version's types |

## Open Questions (RESOLVED)

1. **Exact PostHog error-tracking maturity for React Native, for D-19's spike**
   - What we know: PostHog documents source-map upload and EAS-build symbolication for React Native error tracking, and describes it as a supported path (not clearly labelled beta/experimental in the docs surfaced).
   - What's unclear: Real-world maturity/reliability relative to Sentry specifically for React Native's Hermes-bytecode stack traces — no independent third-party account of a production RN app using PostHog error tracking (vs. Sentry) was found in this session's searches, only PostHog's own documentation.
   - Recommendation: Treat D-19's spike as genuinely necessary, not a formality — budget it as its own small task early in the phase (mint a test error in a dev build, confirm a symbolicated stack trace appears in the PostHog dashboard) before committing to dropping Sentry.
   - **RESOLVED:** operationalised by plan 00-16 Task 2 (spike-and-decide checkpoint).

2. **Windows-specific EAS credential mechanics for Apple**
   - What we know: EAS Build handles provisioning-profile generation and Apple Developer Portal interaction identically regardless of the developer's OS — the CLI talks to Apple's APIs directly, not through Xcode.
   - What's unclear: No Windows-specific gotcha beyond the already-documented general EAS credential-staleness pitfall (Pitfall 3 above) was found — this may genuinely be a non-issue, or it may be under-documented because most EAS users are on macOS and Windows-specific friction goes unreported.
   - Recommendation: Treat the first `eas build --profile development --platform ios` (once Apple enrolment clears) as the actual test of this, per ROADMAP's existing "trigger the first iOS EAS Build on day one" instruction — this phase's D-U-N-S/enrolment critical path already delays that first iOS build regardless, so there's a natural window to discover Windows-specific friction early without it blocking anything else.
   - **RESOLVED:** operationalised by plan 00-20 Task 2 (first real `eas build --platform ios`).

3. **`@react-native-google-signin/google-signin` current major version and its exact nonce-parameter API**
   - What we know: The library supports passing a custom nonce (unlike its free-tier predecessor limitation mentioned in search results).
   - What's unclear: The exact current major version and whether `nonce` is a top-level `signIn()` option or set via a separate `configure()`-time field — this session's searches surfaced the *concept* but not a verbatim current-version code sample.
   - Recommendation: Run `npm view @react-native-google-signin/google-signin version` and check its README/type definitions directly at implementation time before writing the real integration — do not copy the Code Examples section's Google snippet verbatim without that check.
   - **RESOLVED:** operationalised by plan 00-15 Task 1 (read the installed package's `.d.ts` before writing the integration).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything (Expo/EAS/CI tooling) | ✓ | 24.15.0 | — |
| npm | Package installs | ✓ | 11.12.1 | — |
| git | Repo, CI | ✓ | 2.43.0.windows.1 | — |
| eas-cli | EAS Build/Submit/Update | ✓ | 24.7.0 | — |
| Docker Desktop (client) | Local Supabase CLI stack | ✓ (client installed) | 29.7.2 | — |
| Docker Desktop (daemon/engine) | `supabase start` locally | ✗ (not running at research time — `docker info` returned client info only, no Server section) | — | Start Docker Desktop as an explicit Wave-0 step; verify with `docker info` showing a Server section before any `supabase start` task |
| Supabase CLI | Local dev stack, migrations, `supabase test db` | ✗ (not on PATH) | — | Install via `scoop install supabase` (Supabase's documented Windows path) or `npm install -g supabase`; add as an explicit Wave-0 task with a `supabase --version` verification step |
| Android SDK / `adb` | FND-02 local emulator loop | ✗ (not found) | — | Install via Android Studio (includes SDK Manager + AVD Manager); this is expected pre-Phase-0 setup, not a blocker — just not yet done |
| JDK | Android build tooling | ✗ (not found) | — | Ships with Android Studio's bundled JDK, or install separately (Temurin 17+); required for the Android emulator/Gradle build path |
| Expo CLI (`npx expo`) | Project scaffold | Not independently confirmed this session (command did not complete in time) | — | `npx expo` runs via `npx` regardless of global install — low risk, standard Expo dev-loop expectation |

**Missing dependencies with no fallback:**
- None — every missing item above (Docker daemon, Supabase CLI, Android SDK, JDK) has a standard, well-documented install path and is explicitly expected to be provisioned as part of Phase 0's own scope (the ROADMAP's "app boots on Android emulator, first plan" milestone assumes these get installed, not that they pre-exist).

**Missing dependencies with fallback:**
- Docker daemon not running → start Docker Desktop (one-time manual step or scripted via `Start-Process` on Windows), verify before `supabase start`.
- Supabase CLI missing → install via Scoop or npm global install.
- Android SDK/JDK missing → install via Android Studio, standard Expo/RN Windows setup documented at docs.expo.dev.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.x (via `jest-expo` preset) |
| Config file | `jest.config.js` (to be created — Wave 0 gap) |
| Quick run command | `npx jest --watch` (unit/component, no coverage gate) |
| Full suite command | `npx jest --coverage` (enforces D-21's per-directory `coverageThreshold`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-04 | engine/ cannot import db/state/services/ui/react, incl. transitively | static analysis | `npx depcruise src --config .dependency-cruiser.cjs` | ❌ Wave 0 |
| FND-05 | engine/ branch coverage below threshold fails build | coverage gate | `npx jest --coverage` (config enforces thresholds) | ❌ Wave 0 |
| FND-06 | Live accent/font switch, no reload | component | `npx jest src/theme/__tests__/themeSwitch.test.tsx` | ❌ Wave 0 |
| FND-07 | Animations collapse under reduce-motion | component/manual | `npx jest src/theme/__tests__/reducedMotion.test.tsx` + manual OS-setting toggle check on device | ❌ Wave 0 |
| FND-09 | Below-min-version shows update-required screen | unit + component | `npx jest src/features/system/__tests__/minVersionGate.test.ts` | ❌ Wave 0 |
| FND-12 | Cross-user/household row isolation | pgTAP integration | `supabase test db` (against `supabase start` local stack) | ❌ Wave 0 |
| ACC-01/02 | Apple/Google account creation | manual + Maestro (stretch) | Manual sign-in test on device/emulator each platform; Maestro flow optional this phase | ❌ Wave 0 (manual acceptable for Phase 0) |
| ACC-03 | Apple first-auth name/email persisted | manual (two-pass) | Manual: fresh sandbox Apple ID sign-in, verify persisted, sign in again, verify still present (not re-fetched null) | manual-only — justified: requires a real/sandboxed Apple ID ceremony, not mockable in Jest |
| ACC-04 | Household-of-one auto-provisioned | pgTAP integration | `supabase test db` — assert `households`/`household_members` rows exist post-signup trigger | ❌ Wave 0 |
| ACC-05 / ACC-12 | Session persists encrypted across restarts | manual + unit (adapter) | `npx jest src/services/supabase/__tests__/largeSecureStore.test.ts` (adapter round-trip) + manual force-quit/reopen test on device | ❌ Wave 0 |
| ANL-02 | No event before opt-in | unit | `npx jest src/services/analytics/__tests__/consentGate.test.ts` — mock PostHog client, assert no `capture` call pre-opt-in | ❌ Wave 0 |
| ANL-03 | Typed catalogue rejects amounts/free text | typecheck | TypeScript compile-time check on the event-catalogue type definitions (a `tsc --noEmit` pass over a deliberately-invalid fixture, expecting a compile error) | ❌ Wave 0 |
| ANL-04 | No session replay in production build | build-config check | Manual/CI check: grep production build output or bundle for replay-plugin initialization gated behind `__DEV__`/env flag | ❌ Wave 0 |
| DSG-03 | Safe-area insets respected | component/manual | Manual visual check on iPhone XR (notch) + Android emulator (varied insets); no strong automated check for Phase 0 | manual-only — justified: layout-visual correctness across real device insets isn't meaningfully unit-testable |
| DSG-04 | Typed i18n catalogue | typecheck | `tsc --noEmit` against react-i18next's module-augmented types | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --watch` (relevant file's test only) + `npx eslint <changed files>`
- **Per wave merge:** `npx jest --coverage` + `npx depcruise src --config .dependency-cruiser.cjs` + `supabase test db`
- **Phase gate:** Full suite green (Jest coverage thresholds, dependency-cruiser, pgTAP RLS tests, gitleaks scan) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `jest.config.js` with D-21's per-directory `coverageThreshold` — no test framework config exists yet (greenfield repo)
- [ ] `.dependency-cruiser.cjs` — engine-purity CI gate config
- [ ] `eslint.config.js` with `eslint-plugin-boundaries` rules
- [ ] `.github/workflows/ci.yml` — lint/typecheck/coverage/dependency-cruiser/gitleaks/pgTAP jobs
- [ ] `supabase/tests/` — pgTAP test files for household-of-one RLS isolation (FND-12, ACC-04)
- [ ] Framework install: `npx create-expo-app@latest --template blank-typescript` then `npm install -D jest@^30 @testing-library/react-native` — no app scaffold exists yet at all (repo currently holds only planning docs + design prototype handoff)
- [ ] Supabase CLI install + Docker Desktop running — see Environment Availability, blocks `supabase test db` entirely until resolved

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (GoTrue) via native Apple/Google OIDC — never a hand-rolled password/credential path (no password auth exists in this app at all, per PROJECT.md) |
| V3 Session Management | yes | Supabase-managed JWT + refresh token, client-side encrypted at rest via LargeSecureStore (Pattern 2); `autoRefreshToken: true` for rotation |
| V4 Access Control | yes | Postgres RLS as the sole authorization boundary (ARCHITECTURE.md Pattern 6) — never client-side-only checks |
| V5 Input Validation | yes | TypeScript `strict: true` at the boundary; Postgres column types/constraints as the backstop; the `app_config`/`households` migrations in this phase should use `not null` and FK constraints, not application-layer-only validation |
| V6 Cryptography | yes | AES-CTR via `aes-js` for the session-encryption pattern (Pattern 2) — never a hand-rolled cipher; key generation via `react-native-get-random-values` (CSPRNG), never `Math.random()` |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Nonce replay / mismatch in OIDC sign-in | Spoofing | Fresh, cryptographically random nonce per sign-in attempt (`react-native-get-random-values`-backed `Crypto.randomUUID()`); never reuse a nonce across attempts |
| RLS policy gap allowing cross-household row read/write | Elevation of Privilege / Information Disclosure | Every table's RLS policy tested with pgTAP for both the allow case (own household) and the explicit deny case (another household) — CONTEXT.md's D-24 and FND-12 make this a CI gate, not a manual check |
| Session token exfiltration via unencrypted local storage | Information Disclosure | LargeSecureStore (AES-encrypted session, key in SecureStore) rather than plaintext AsyncStorage |
| Security-definer trigger/function privilege escalation | Elevation of Privilege | `handle_new_user()` (Pattern 3) pins `search_path`, is owned by a non-login role, and has `execute` revoked from `public` — mirrors ARCHITECTURE.md's existing guidance for `redeem_invite` |
| Committed secret (Supabase service-role key, API keys) in git history | Information Disclosure | `.env`/`.env.local` gitignored from commit 1; gitleaks in CI on every PR with `fetch-depth: 0` (full history, not shallow) |
| Analytics/crash reports leaking financial data | Information Disclosure | Typed event catalogue (ANL-03) makes amounts/payee/account/free-text unrepresentable at the type level; crash reports scrubbed to stack traces only per D-18 |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <pkg> version`, live 2026-09-22): `posthog-react-native` 4.75.0, `aes-js` 3.1.2, `react-native-get-random-values` 2.0.0, `react-i18next` 17.0.15, `i18next` 26.4.2, `dependency-cruiser` 18.4.0, `eslint-plugin-boundaries` 7.2.0
- [docs.swmansion.com/react-native-reanimated — useReducedMotion](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/) — official Reanimated 4 API docs
- [docs.swmansion.com/react-native-reanimated — ReducedMotionConfig](https://docs.swmansion.com/react-native-reanimated/docs/device/ReducedMotionConfig/) — official Reanimated 4 API docs
- [jestjs.io/docs/configuration — coverageThreshold](https://jestjs.io/docs/configuration) — official Jest docs, confirms per-directory-glob threshold support
- [gitleaks.org](https://gitleaks.org/) — official gitleaks project site, GitHub Action usage
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` (this project, researched 2026-09-21, one day prior — reused, not re-derived)
- `BUILD-PROMPT.md` §2 (canonical design tokens), §3 (stack/dev-loop, as amended by STACK.md), §6 (architecture/testing)
- Local environment probe (this session): `node --version`, `npm --version`, `git --version`, `eas --version`, `docker --version` / `docker info`

### Secondary (MEDIUM confidence)
- [supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth) — official Supabase quickstart; page structure confirmed but exact code blocks did not extract verbatim via WebFetch in this session (see Assumptions Log A1)
- [github.com/orgs/supabase/discussions/35209](https://github.com/orgs/supabase/discussions/35209) — Supabase Discussion documenting the nonce-mismatch failure mode, cross-verified against the quickstart's documented parameter flow
- [react-native-google-signin.github.io/docs/security](https://react-native-google-signin.github.io/docs/security) — nonce-passing capability confirmed
- [posthog.com/docs/references/posthog-react-native](https://posthog.com/docs/references/posthog-react-native), [posthog.com/docs/session-replay/how-to-control-which-sessions-you-record](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record) — EU host, session-replay opt control, plugin rename
- [posthog.com/docs/error-tracking/upload-source-maps/react-native](https://posthog.com/docs/error-tracking/upload-source-maps/react-native) — EAS source-map upload for error tracking (informs D-19 spike)
- [supabase.com/docs/guides/deployment/ci/testing](https://supabase.com/docs/guides/deployment/ci/testing), [supabase.com/docs/guides/local-development/testing/overview](https://supabase.com/docs/guides/local-development/testing/overview) — pgTAP + `supabase test db` + GitHub Actions pattern
- [supabase.com/docs/guides/local-development/cli-workflows](https://supabase.com/docs/guides/local-development/cli-workflows) — migrations workflow (`db pull`/`db push`/`db reset`)
- General WebSearch synthesis on `handle_new_user()` auth.users trigger pattern (security-definer, matches Supabase's documented "Managing User Data" guide pattern already cited in project ARCHITECTURE.md)

### Tertiary (LOW confidence)
- Exact current-version API shapes for `@react-native-google-signin/google-signin`'s `signIn({ nonce })` parameter and `posthog-react-native`'s `optIn()`/`optOut()`/`defaultOptIn` method names — flagged in Assumptions Log A1/A3, needs a direct type-check against installed versions before implementation
- Scoop as the recommended Windows install path for the Supabase CLI (A4) — general knowledge, not independently re-verified via WebSearch this session

## Metadata

**Confidence breakdown:**
- Standard stack (versions): HIGH — every version either verified live against npm this session or carried from the project's own STACK.md verified the prior day
- Architecture (auth flow, RLS, household provisioning): HIGH for the RLS/trigger pattern (matches Supabase's own documented pattern and the project's existing ARCHITECTURE.md); MEDIUM for exact auth SDK code shapes (Assumptions Log A1, A3, A5)
- Pitfalls: HIGH — cross-verified against the project's own PITFALLS.md (Apple first-auth, provisioning-profile staleness) plus independently WebSearch-confirmed nonce-mismatch and SecureStore-size issues
- Environment availability: HIGH — directly probed on the target machine this session, not inferred

**Research date:** 2026-09-22
**Valid until:** ~30 days for architecture/patterns (stable primitives); ~7-14 days for exact SDK method names on fast-moving packages (`posthog-react-native`, `@react-native-google-signin/google-signin`) — re-verify those two specifically at implementation time given the version-churn evidence found (posthog-react-native alone moved from 4.47 to 4.75 within a recent window)
