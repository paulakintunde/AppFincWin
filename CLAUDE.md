<!-- GSD:project-start source:PROJECT.md -->
## Project

**FincWin United**

FincWin United is a personal and household money app for iOS and Android. It records money in and out across multiple accounts, currencies, categories and a shared household; it runs real financial maths against a user's actual logged months to answer whether they can afford a specific purchase; and it reveals its own depth gradually, gating ~50 features behind four levels set by an onboarding question flow so a first-time user meets a small app and an expert meets all of it.

It is a **money-management tool, not a financial institution and not a lender.** It holds no money, executes no trades, offers no loans and gives no regulated advice. That distinction governs store compliance and must be reflected in every piece of copy.

**Core Value:** **The Decide tab must give a trustworthy answer.** A user types an item and a price; FincWin tells them whether it fits, what breaks if they buy it, and what the cheaper or later versions look like — computed from their own logged months, not a survey. Everything else in the app is a well-made money app. Decide is the reason to use it, and it is the only place where a wrong answer causes real harm to a real person's finances.

### Constraints

- **Development environment**: Windows 11, no Mac, no Xcode — the single most important architectural driver. Expo managed with config plugins plus EAS is the only path that builds, signs and submits an iOS app from Windows. Expo Go is unusable because Plaid, RevenueCat, Face ID and biometrics all need custom native code; use a development build throughout.
- **iOS test device**: an iPhone XR. Covers Face ID, real haptics and real push, none of which a simulator reproduces. But it is A12, so it tops out at iOS 18 — anything iOS 26-specific needs EAS Simulator. Mostly moot, since native tabs and Liquid Glass are already ruled out.
- **Apple Developer Program**: not yet enrolled. Blocks TestFlight and submission entirely, and enrolment takes days to weeks. Starting it is a day-one task in phase 0, ahead of any code.
- **Tech stack**: settled in `BUILD-PROMPT.md` §3 as amended by Key Decisions below. Do not re-derive it.
- **Architecture**: nothing in `engine/` may import from `db/`, `state/`, `services/`, `ui/` or `react`. This is the most important line in the codebase — it is what lets the financial maths be tested exhaustively and reviewed in isolation. Enforced by lint and by CI.
- **Money**: integer minor units everywhere, with explicit rounding rules. Never floats.
- **Quality gate**: an engine change that drops branch coverage below threshold fails CI. No exceptions.
- **Compliance**: positioned as personal record-keeping and planning. Never "advice", "recommendation" or "you should" in verdict copy — hold the prototype's declarative-not-prescriptive voice. In-app account deletion is mandatory and must actually purge. Sign in with Apple is mandatory because Google sign-in is offered.
- **Compliance caveat — re-verify, do not assume**: the brief's positioning rests on Guideline 3.2.1(viii) applying *"where the app performs those services."* Fetched live on 2026-09-21, the current text no longer carries that qualifier. Dozens of budgeting apps ship as non-institution developers, so practical risk looks low — but the argument must be re-checked against live guideline text at the Compliance phase rather than treated as settled. Separately, the brief miscites the 36% APR / 60-day loan cap as 3.2.1(viii); it is **3.2.2(ix)**, and it does not apply here regardless.
- **Submission hygiene outranks content framing**: the one detailed 2026 rejection account found in this category failed on mechanical IAP issues — subscription not attached to the version (2.1(b)), missing disclosure copy (3.1.2(c)), a bad support URL (1.5) — and then again because the demo video showed Restore Purchases rather than a fresh purchase. Directional rather than proven, but it should shape where the Compliance phase spends its effort.
- **EAS Simulator is still waitlist-only** as of September 2026, with no GA announcement. Plan the iOS loop around the iPhone XR plus the Android emulator as the *certain* path; treat the simulator as a bonus if access arrives.
- **Data residency and privacy**: global from day one, built to GDPR as the standard everywhere — right to erasure, data portability, DPA.
- **Design fidelity**: the §2 token set is the complete palette and type scale. No gradients, no extra shadows, no additional colours, no substituted icon set. The prototype's restraint is deliberate.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Verdict on `BUILD-PROMPT.md` §3
### Staleness table — brief's claim vs. verified September 2026 reality
| Brief claim (Feb 2026) | Verified now (Sept 2026) | Stale? | Source |
|---|---|---|---|
| Expo SDK 55, React Native 0.83, React 19.2 | **Expo SDK 57** (stable, released 2026-06-30, patched to 57.0.24), **React Native 0.86.3**, **React 19.2** (unchanged since SDK 56) | **Yes — two SDKs behind.** SDK 56 (RN 0.85, May 2026) and SDK 57 (RN 0.86, June 2026) both shipped since the brief. SDK 58 is in **preview only** (0.0-preview.0, 2026-09-10) with a breaking Node ≥22.13.0 bump — do not build on it | [expo.dev/changelog/sdk-57](https://expo.dev/changelog/sdk-57), [npmjs.com/package/expo](https://www.npmjs.com/package/expo?activeTab=versions) |
| New Architecture always on, no disable | **Confirmed still true, and more entrenched.** RN 0.82 removed the legacy bridge entirely (not just Expo's default — upstream RN itself) | No — brief was correct and still is | [docs.expo.dev/guides/new-architecture](https://docs.expo.dev/guides/new-architecture/) |
| Expo Router v7 | Router now versions **in lockstep with the SDK number** (`expo-router@57.x`, e.g. 57.0.21/57.0.22) rather than its own vN scheme. Functionally still the same lineage (native toolbars, zoom transitions, Split View Controller beta, React Navigation v7 underneath) | Partially — naming scheme changed, pin `~57.0.22` not `^7.0.0` | [npmjs.com/package/expo-router](https://www.npmjs.com/package/expo-router), [github.com/expo/expo/.../expo-router/CHANGELOG.md](https://github.com/expo/expo/blob/main/packages/expo-router/CHANGELOG.md) |
| Reanimated 4 | **4.5.5** (2026-08-27), compatible with RN 0.83–0.87, requires the separate `react-native-worklets` package (0.12.x) | Minor — still "Reanimated 4," but pin the exact patch and add `react-native-worklets` as an explicit dependency, not implied | [swmansion.com/changelog/react-native-reanimated](https://swmansion.com/changelog/react-native-reanimated/), [docs.swmansion.com/.../compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/) |
| FlashList v2 | Confirmed current, New-Architecture-only (will not run on old arch — irrelevant here since old arch is gone), JS-only recycling, no size-estimate props needed | No, still correct | [shopify.engineering/flashlist-v2](https://shopify.engineering/flashlist-v2), [shopify.github.io/flash-list/docs/v2-migration](https://shopify.github.io/flash-list/docs/v2-migration/) |
| `@gorhom/bottom-sheet` v5 | **5.2.14** current | No, still correct | [npmjs.com/package/@gorhom/bottom-sheet](https://www.npmjs.com/package/@gorhom/bottom-sheet) |
| `react-native-purchases` (RevenueCat) | **10.9.1** current (10.10.1 in flight, bumps purchases-hybrid-common to 19.2.0 / iOS 5.90.x / Android 10.22.x) | No breaking issue, just a version bump | [github.com/RevenueCat/react-native-purchases/releases](https://github.com/RevenueCat/react-native-purchases/releases) |
| `react-native-svg` | **15.15.5** current, Fabric-supported since 13.0.0 | No | [npmjs.com/package/react-native-svg](https://www.npmjs.com/package/react-native-svg?activeTab=versions) |
| `@supabase/supabase-js` v2 | **2.116.0** current, still v2 major line | No | [npmjs.com/package/@supabase/supabase-js](https://www.npmjs.com/package/@supabase/supabase-js) |
| `expo-secure-store`, `expo-local-authentication` | Both now version-locked to SDK: **57.0.3** and **57.0.2** respectively | No breaking issue, just pin to `~57.x` | [npmjs.com/package/expo-secure-store](https://www.npmjs.com/package/expo-secure-store) |
| `expo-haptics` | Current for SDK 57, but **dropped the deprecated `notification()`/`impact()`/`selection()` methods** — only the newer `notificationAsync`/`impactAsync`/`selectionAsync` API surface remains | **Yes, a real breaking change** if any reference code or the prototype-port muscle-memory uses the old names | [github.com/expo/expo/blob/sdk-57/packages/expo-haptics/CHANGELOG.md](https://github.com/expo/expo/blob/sdk-57/packages/expo-haptics/CHANGELOG.md) |
| Jest + fast-check + RNTL + Maestro | fast-check **4.10.1**, Jest **30.x** line, RNTL current and New-Architecture-compatible, Maestro actively maintained (rolling CLI releases, ~10.8k GitHub stars) | No structural change, just confirm patch versions at implementation time | See Testing section |
| Supabase-direct + persisted query cache + write queue (PROJECT.md override) | **TanStack Query v5 (`@tanstack/react-query` 5.102.8)** remains the correct tool; this is a live, actively-developed pattern, not a stale one | N/A — new decision, not in original brief | See Data Layer section |
| Passkeys at onboarding via Supabase Auth on React Native | **Not viable as a first-party, documented path in September 2026.** See dedicated section below | **This is the most important correction in this document** | [supabase.com/docs/guides/auth/passkeys](https://supabase.com/docs/guides/auth/passkeys) |
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Expo SDK | **57** (`~57.0.24`) | Managed framework, config plugins, EAS integration | Current stable as of Sept 2026; SDK 58 is preview-only with a Node version bump — too fresh to build production on. SDK 57 was explicitly marketed by Expo as "the easiest upgrade you've ever made," non-breaking from 56, which de-risks the Windows-only dev loop |
| React Native | **0.86.3** (via Expo SDK 57) | App runtime | Ships inside SDK 57; New Architecture (Fabric/TurboModules) is permanently on since RN 0.82 — no legacy bridge exists to fall back to, so there is no "escape hatch" decision to make, just build for it from day one |
| React | **19.2** | UI library | Unchanged since SDK 56; stable, no migration needed between SDK 56→57 |
| TypeScript | `strict: true` | Language | Unchanged recommendation — the Decide engine's numeric surface demands it |
| Expo Router | **`~57.0.22`** (file-based) | Navigation | Router versioning now tracks the SDK number directly; functionally the same v7-generation feature set (native toolbars, zoom transitions, Split View Controller beta). Use JS `Tabs` with a custom `tabBar`, not `unstable-native-tabs` — unchanged from PROJECT.md's decision to keep the bespoke tab bar |
| EAS Build / Submit / Update / Workflows | current (`eas-cli` tracks Expo SDK) | Cloud build, sign, submit, OTA, CI | Still the only path to a signed `.ipa` from Windows with no Mac. No change in viability or mechanism since Feb 2026 |
### Data Layer (replaces brief §3 entirely — per PROJECT.md)
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@supabase/supabase-js` | **2.116.0** | Postgres client, Auth, Realtime, Storage | Single source of truth per PROJECT.md. v2 API is stable and current; no v3 exists or is signaled |
| `@react-native-async-storage/async-storage` | current (≥2.x) | Session + query-cache persistence backing store | Required by both Supabase Auth's RN storage adapter and TanStack Query's async-storage persister — one dependency serving two needs |
| `@tanstack/react-query` | **5.102.8** | Read cache: fetch, cache, retry, background refetch, `onlineManager` | This *is* the "persisted query cache" PROJECT.md specifies. It is not a local-first/sync engine — it caches server responses and revalidates, which matches "Supabase-direct queries with a persisted cache," not a bidirectional sync engine |
| `@tanstack/query-async-storage-persister` + `@tanstack/react-query-persist-client` | current, same major as react-query (5.x) | Persists the query cache to AsyncStorage across app restarts, and rehydrates on boot | This is the standard, officially documented RN persistence pattern for TanStack Query. `persistQueryClient()` dehydrates/rehydrates the whole client; combine with a `maxAge` and a `buster` string tied to your schema version so stale shapes get discarded on upgrade |
| `@react-native-community/netinfo` | current | Feeds TanStack Query's `onlineManager` | TanStack Query's online/offline detection is a no-op on RN unless you wire `onlineManager.setEventListener` to NetInfo yourself — this is not automatic like it is on web |
| Paused mutations + `queryClient.setMutationDefaults()` | n/a (pattern, not a package) | **This is the write queue** | When a mutation fails while offline, TanStack Query marks it `paused` and — if you registered a default mutation function via `setMutationDefaults(mutationKey, { mutationFn })` before dehydration — it resumes and replays in original order automatically on reconnect via `queryClient.resumePausedMutations()`. This is the exact mechanism the brief's "cached reads, queued writes flushed on reconnect" describes, and it is a first-party, actively maintained TanStack pattern, not a hack |
| Supabase Realtime (`supabase.channel(...).on('postgres_changes', ...)`) | bundled in supabase-js 2.x | Live household data push | Standard pattern: open a channel in a `useEffect`, subscribe to `postgres_changes` filtered by table/household id, and on payload, **invalidate or directly patch the matching TanStack Query cache entry** (`queryClient.setQueryData` for low-latency UI, or `invalidateQueries` for simplicity/correctness). Two real gotchas verified across multiple sources: (1) stale closures in the effect callback if the household/user id isn't in the dependency array — re-subscribe on id change, not on every render; (2) always call `channel.unsubscribe()`/`removeChannel()` in the cleanup function, or channels accumulate across navigations and eventually the app stalls |
### Passkeys on React Native + Supabase Auth — concrete verdict: **viable with significant caveats, not turnkey**
### UI Libraries
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| FlashList | **v2 (2.x)** | Long lists (Activity, search-across-months) | Confirmed current, New-Architecture-only design matches the mandatory-New-Arch runtime, no size-estimate props needed (simpler porting from the prototype than v1 would have been) |
| Reanimated | **4.5.5** + `react-native-worklets` (0.12.x, separate package) | UI-thread animation for the seven prototype animations | Confirmed current. **Add `react-native-worklets` explicitly** — Reanimated 4's architecture split the worklet runtime into its own package; omitting it is a common upgrade-guide gotcha |
| `react-native-gesture-handler` | current, ships with Expo SDK | Sheet drag-to-dismiss, swipes | Unchanged |
| `@gorhom/bottom-sheet` | **5.2.14** | ~14 bottom sheets | Confirmed current, no breaking changes since the brief |
| `react-native-svg` | **15.15.5** | Hand-rolled charts, bespoke tab glyphs | Confirmed current, Fabric-supported since 13.0.0, no porting risk from the prototype's SVG viewBox approach |
| `StyleSheet` + typed theme context, or Unistyles v3 | — | Live accent/font-pairing swap | Unchanged from the brief; no new information changes this call |
| `expo-haptics` | **~57.0.x** | Haptic feedback on verdict/cap breach/toast/commit | **Use only `notificationAsync`/`impactAsync`/`selectionAsync`** — the older `notification()`/`impact()`/`selection()` method names were dropped in the SDK 57 line |
### Services
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `react-native-purchases` (RevenueCat) | **10.9.1** | Pro tier entitlements | Confirmed current; wraps StoreKit 2 / Play Billing with server-side validation, unchanged rationale from the brief |
| `expo-notifications` | current, SDK-locked (~57.x) | Push: bills due, over cap, goal reached, etc. | Unchanged; confirm FCM v1 / APNs config at implementation time, no architectural change found |
| `expo-local-authentication` | **57.0.2** | Face ID / Touch ID / Android biometric + PIN lock | Confirmed current, SDK-locked versioning |
| `expo-secure-store` | **57.0.3** | Token storage (not the query cache, not bulk financial data) | Confirmed current. Scope: session tokens and small secrets only — the persisted query cache goes through AsyncStorage per the TanStack Query persister pattern, not SecureStore, because SecureStore has small per-key size limits and is not designed as a bulk cache store |
| `react-native-passkeys` | **0.4.1** | Native WebAuthn ceremony (see Passkeys section) | Only viable current option for native passkey UX on RN; needs a custom Edge Function backend, see above |
| `@sentry/react-native` | current | Error monitoring | Unchanged |
### Testing
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Jest | **30.x line** | Unit tests, the whole `engine/` suite | Confirmed current major; native TypeScript support improved in the 30 line. Pin exact patch at implementation time — did not verify a specific patch number, MEDIUM confidence on exact patch |
| `fast-check` | **4.10.1** | Property-based tests: money round-trips, `dassess`/bisection invariants | Confirmed current. Pure TypeScript, no RN dependency — runs cleanly inside `engine/`'s no-React, no-I/O boundary, which is exactly where PROJECT.md wants it |
| `@fast-check/jest` | **2.3.0** | Jest integration for fast-check | Optional convenience wrapper; confirmed current |
| `@testing-library/react-native` (RNTL) | current | Component tests: sheets, FAB rules, back-stack, undo-stack | Confirmed actively maintained and New-Architecture-compatible; did not verify an exact pinned version, MEDIUM confidence |
| Maestro | current (rolling CLI releases) | E2E flows on Windows against Android + EAS Simulator/cloud iOS | Confirmed still the standard choice for RN E2E in 2026 — operates at the accessibility layer, zero JS instrumentation required, works identically against a dev build regardless of New Architecture internals. No breaking changes found relative to the brief's assumption |
## Installation
# Core (Expo SDK 57)
# Data layer
# UI
# Auth / passkeys (Path A)
# server-side verification lives in a Supabase Edge Function (Deno), e.g.:
#   import { verifyRegistrationResponse } from "npm:@simplewebauthn/server";
# Services
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| TanStack Query persisted cache + paused mutations | PowerSync / ElectricSQL / WatermelonDB (full sync engines) | Only if the project later reverses the local-first rejection — these solve a harder problem (bidirectional conflict resolution) than PROJECT.md is asking for, and bring their own ops/ownership cost |
| Supabase Realtime `postgres_changes` + manual cache patching | Supabase Realtime Broadcast/Presence channels | Broadcast is lower-latency and doesn't hit the database on every change, but loses the "it's just a row change" simplicity; consider it later only if `postgres_changes` volume becomes a scaling problem, not at launch |
| `react-native-passkeys` + custom Edge Function (Path A) | Clerk + `@clerk/expo-passkeys` fronting Supabase via third-party auth (Path B) | If Apple/Google/passkey friction or Clerk's UX components turn out to save enough engineering time to justify a UUID-vs-string-id schema redesign and an added vendor dependency — a call for `/gsd-discuss-phase`, not this document |
| AsyncStorage-backed TanStack Query persister | MMKV-backed persister | If query-cache rehydration on cold start becomes a measured performance problem — MMKV is faster but isn't AsyncStorage-API-compatible out of the box, so it needs an adapter shim; don't reach for it pre-emptively |
| `@simplewebauthn/server` in an Edge Function | Rely on Supabase's beta first-party passkey REST endpoints directly | Not recommended at all for v1 — those endpoints are undocumented for non-browser callers and the feature is explicitly experimental; revisit once Supabase documents a native-mobile (non-Flutter/Swift) path |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `expo-sqlite` + Drizzle ORM | Explicitly out of scope per PROJECT.md — cloud-first with Supabase as sole source of truth, no local DB | `@supabase/supabase-js` direct queries + TanStack Query cache |
| Any bidirectional sync engine (WatermelonDB, RxDB, PowerSync, ElectricSQL) "for offline support" | Reintroduces the local-first/conflict-resolution ownership PROJECT.md deliberately rejected | TanStack Query persisted cache + paused-mutation write queue |
| `supabase.auth.signInWithPasskey()` called directly from React Native code | Calls `navigator.credentials.get()` internally, which does not exist in the RN/Hermes runtime — will throw | `react-native-passkeys` (native ceremony) + custom Edge Function verification, or Apple/Google as the launch-blocking methods with passkeys as a dedicated follow-up task |
| Expo Router `unstable-native-tabs` | Already correctly excluded in PROJECT.md — would replace the bespoke tab bar and glyphs with the platform's Liquid Glass tabs, losing the brand | JS `Tabs` with a custom `tabBar` component |
| Old `expo-haptics` method names (`notification()`, `impact()`, `selection()`) | Dropped in the SDK 57 line — will not compile/run against current `expo-haptics` | `notificationAsync()`, `impactAsync()`, `selectionAsync()` |
| Building against Expo SDK 58 preview | Preview-only as of Sept 2026 (`58.0.0-preview.0`, 2026-09-10), carries a breaking Node ≥22.13.0 requirement, not stable | Expo SDK 57 stable line for the whole v1 build |
| Expo Go for any real device testing | Unchanged from the brief — Plaid (deferred), RevenueCat, Face ID, passkeys native module all need custom native code | Development builds via EAS, throughout |
## Stack Patterns by Variant
- Ship Apple + Google Sign-In only for the initial TestFlight/internal-testing builds
- Add passkeys as an explicit, separately-scoped task once the Edge Function verification flow is proven in isolation (own test harness, no UI dependency) — mirrors the project's own "engine before UI" discipline
- Move to Broadcast channels driven by a Postgres trigger via `realtime.broadcast_changes()`, which is the documented scaling path, rather than tuning `postgres_changes` filters further
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `expo@~57.0.24` | `expo-router@~57.0.22`, `react-native@0.86.3`, `react@19.2` | All four move together on the SDK train; do not mix-and-match minor versions across them |
| `react-native-reanimated@4.5.5` | `react-native-worklets@0.12.x`, RN 0.83–0.87 | Reanimated 4's worklet runtime is a separate package as of the 4.x line — must be installed explicitly, not implied by installing Reanimated alone |
| `@shopify/flash-list` v2 | New Architecture only | Will not run on old architecture — irrelevant here since RN 0.82+ has no old architecture to fall back to anyway |
| `@clerk/expo-passkeys` | `expo: ">=53 <57"` (verified peer-dep range) | **Does not yet declare SDK 57 support** as of the version checked — a real consideration only if Path B (Clerk) is chosen; re-verify immediately before adopting |
| `@supabase/supabase-js@2.116.0` passkey methods | Browser (web) only | Not usable as-is inside a React Native app — see Passkeys section |
## Sources
- [expo.dev/changelog/sdk-57](https://expo.dev/changelog/sdk-57) — Expo SDK 57 official changelog, RN 0.86, React 19.2, verified
- [expo.dev/changelog/sdk-56](https://expo.dev/changelog/sdk-56) — Expo SDK 56 official changelog
- [npmjs.com/package/expo?activeTab=versions](https://www.npmjs.com/package/expo?activeTab=versions) — confirms 57.0.24 as latest stable, 58.0.0-preview.0 as preview-only
- [docs.expo.dev/guides/new-architecture](https://docs.expo.dev/guides/new-architecture/) — New Architecture mandatory status
- [npmjs.com/package/expo-router](https://www.npmjs.com/package/expo-router) — SDK-locked versioning confirmed
- [swmansion.com/changelog/react-native-reanimated](https://swmansion.com/changelog/react-native-reanimated/) — Reanimated 4.5.5, worklets split
- [docs.swmansion.com/react-native-reanimated/docs/guides/compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/) — RN version compatibility table
- [shopify.engineering/flashlist-v2](https://shopify.engineering/flashlist-v2) — FlashList v2 architecture, official Shopify engineering blog
- [shopify.github.io/flash-list/docs/v2-migration](https://shopify.github.io/flash-list/docs/v2-migration/) — official migration docs
- [npmjs.com/package/@gorhom/bottom-sheet](https://www.npmjs.com/package/@gorhom/bottom-sheet) — v5.2.14 confirmed
- [github.com/RevenueCat/react-native-purchases/releases](https://github.com/RevenueCat/react-native-purchases/releases) — 10.9.1/10.10.1 confirmed
- [npmjs.com/package/react-native-svg?activeTab=versions](https://www.npmjs.com/package/react-native-svg?activeTab=versions) — 15.15.5 confirmed
- [npmjs.com/package/@supabase/supabase-js](https://www.npmjs.com/package/@supabase/supabase-js) — 2.116.0 confirmed
- [supabase.com/docs/guides/auth/passkeys](https://supabase.com/docs/guides/auth/passkeys) — official passkey docs, platform coverage (Flutter/Swift only for native), experimental status, SDK version requirements
- [supabase.com/changelog/46458-passkeys-for-supabase-auth-beta](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta) — official beta announcement
- [github.com/supabase/supabase-js/pull/2675](https://github.com/supabase/supabase-js/pull/2675) — confirms `navigator.credentials.get()` call inside `signInWithPasskey`
- [npmjs.com/package/react-native-passkeys](https://www.npmjs.com/package/react-native-passkeys) — 0.4.1 confirmed, cross-platform native WebAuthn module
- [clerk.com/articles/clerk-compatibility-in-expo-54-and-55](https://clerk.com/articles/clerk-compatibility-in-expo-54-and-55) — `@clerk/expo-passkeys` peer-dep range `>=53 <57`
- [supabase.com/docs/guides/auth/third-party/clerk](https://supabase.com/docs/guides/auth/third-party/clerk) — official third-party auth integration pattern, UUID-vs-string user ID note
- [tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient](https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient) — official persister docs
- [npmjs.com/package/@tanstack/react-query?activeTab=versions](https://www.npmjs.com/package/@tanstack/react-query?activeTab=versions) — 5.102.8 confirmed
- [supabase.com/docs/guides/realtime/subscribing-to-database-changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) — official Realtime subscription docs
- [github.com/expo/expo/blob/sdk-57/packages/expo-haptics/CHANGELOG.md](https://github.com/expo/expo/blob/sdk-57/packages/expo-haptics/CHANGELOG.md) — confirms deprecated-method removal
- [npmjs.com/package/expo-secure-store](https://www.npmjs.com/package/expo-secure-store) / [npmjs.com/package/expo-local-authentication](https://www.npmjs.com/package/expo-local-authentication) — 57.0.3 / 57.0.2 confirmed
- [npmjs.com/package/fast-check](https://www.npmjs.com/package/fast-check) — 4.10.1 confirmed, MEDIUM-HIGH confidence (WebSearch-verified via npm, not Context7)
- Testing tool exact patch numbers (Jest, RNTL) — MEDIUM confidence, WebSearch-only, flagged for re-verification at implementation time; Context7 was not available in this environment session so npm/GitHub were used as the primary verification source throughout
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
