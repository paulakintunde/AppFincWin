---
phase: 00-foundation
plan: 18
subsystem: ui
tags: [expo-router, supabase, theme, posthog, reanimated, consent, sign-out, settings]

# Dependency graph
requires:
  - phase: 00-foundation (plan 17)
    provides: "app/_layout.tsx's Stack.Protected guard={route === 'app'} and app/index.tsx's /you redirect, both already wired and waiting for this plan's (app) group"
  - phase: 00-foundation (plan 13)
    provides: "src/services/analytics — getAnalytics(): { enable, disable, track, isEnabled }"
  - phase: 00-foundation (plan 10)
    provides: "src/services/storage/wipe.ts (registerWipeHandler, getPendingWriteCount, wipeDeviceData), src/services/supabase (supabase, checkConnection)"
  - phase: 00-foundation (plan 11)
    provides: "ThemeProvider/useTheme (applyRemote, reset, live accent/font-pairing switching), useMotion, Screen"
provides:
  - "src/features/you/useProfile.ts — loads the own profiles row, applies its saved theme once per signed-in user id (D-14), and setAccent/setPairing update the theme immediately then persist only the changed column"
  - "src/features/consent/useConsent.ts + ConsentScreen.tsx — the D-17 one-screen, equal-weight analytics consent prompt, wired to profiles.analytics_consent/_at"
  - "src/features/auth/signOut.ts — requestSignOut/performSignOut: the D-15 pending-write warning gate and the ordered wipe (analytics.disable → supabase signOut scope:local → wipeDeviceData → resetTheme), resilient to an offline Supabase call"
  - "src/features/you/YouScreen.tsx + components/{AccentSwitcher,FontPairingSwitcher,AnalyticsToggle,ConnectionStatus,SettingsGroup} — the D-13 settings screen"
  - "app/(app)/_layout.tsx, app/(app)/consent.tsx, app/(app)/you.tsx — the signed-in route group that 00-17 forward-referenced"
affects: ["00-19 (device-persistence proof runs against this same signed-in surface)", "phase-1 (the write queue's pendingWriteCount registers into src/services/storage/wipe.ts, which requestSignOut already reads)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "signOut.ts mirrors 00-10's connection.ts lazy-import pattern: the real Supabase client is resolved via `await import('@/services/supabase')` only when no fake is injected, so importing this module never requires Supabase env vars under Jest"
    - "useProfile's mount effect mirrors useMinVersionGate.ts's shape for react-hooks/set-state-in-effect: the effect calls a synchronous wrapper (refresh) that never itself calls a state setter — every setState call happens inside the query's own .then() callback, one async boundary away from the effect"
    - "AccentSwitcher/FontPairingSwitcher read the live theme (theme.accent/theme.pairing), not the persisted profile row, so FND-06's live switching is visible in the same render tree before the Supabase write resolves"
    - "A ref mirroring a hook value (themeRef) is written from a no-deps useEffect (runs after every render), never during render itself — react-hooks/refs disallows a direct render-body write"

key-files:
  created:
    - src/features/you/useProfile.ts
    - src/features/you/__tests__/useProfile.test.tsx
    - src/features/consent/useConsent.ts
    - src/features/consent/ConsentScreen.tsx
    - src/features/consent/__tests__/ConsentScreen.test.tsx
    - src/features/auth/signOut.ts
    - src/features/auth/__tests__/signOut.test.ts
    - src/features/you/YouScreen.tsx
    - src/features/you/__tests__/YouScreen.test.tsx
    - src/features/you/components/AccentSwitcher.tsx
    - src/features/you/components/FontPairingSwitcher.tsx
    - src/features/you/components/AnalyticsToggle.tsx
    - src/features/you/components/ConnectionStatus.tsx
    - src/features/you/components/SettingsGroup.tsx
    - app/(app)/_layout.tsx
    - app/(app)/consent.tsx
    - app/(app)/you.tsx
  modified: []

key-decisions:
  - "useConsent also exposes the underlying profile's `loading` and folds it into needsPrompt (!loading && consent === null), not just `consent === null` as Task 1's literal spec implied — see Deviations"
  - "signOut.ts's default Supabase client is a lazy dynamic import, never a static top-level import — mirrors 00-10's connection.ts fix for the same eager-getEnv() problem"
  - "useProfile derives the signed-out profile/loading values (user ? profile : null / user ? loading : false) rather than calling setState synchronously in that branch, to satisfy react-hooks/set-state-in-effect without changing the observable behaviour"
  - "The font-pairing and accent selection indicators use a plain accent-filled dot rather than a checkmark glyph — Phase 0 ships no icon set (00-UI-SPEC.md)"

patterns-established:
  - "Any hook whose mount effect needs to run a data fetch should shape it as a synchronous wrapper that only calls setState inside the fetch's own .then()/resolved callback — never synchronously at the wrapper's own top level — to satisfy react-hooks/set-state-in-effect"

requirements-completed: [ANL-02, ENV-03, FND-06, ACC-05, DSG-03]

# Metrics
duration: ~2h
completed: 2026-09-26
---

# Phase 00 Plan 18: Signed-In Surface (Consent, You Screen, Sign-Out) Summary

**The full D-13/D-14/D-15/D-17 signed-in surface: a one-screen equal-weight analytics consent prompt, a live theme-switching You/settings screen with a real Supabase connection indicator, and a sign-out flow that warns before wiping the device and always wipes locally even when offline.**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-09-26
- **Tasks:** 3 (all `type="auto" tdd="true"`, each RED then GREEN)
- **Files modified:** 17 created, 0 modified

## Accomplishments

- **D-14 profile/theme sync** (`useProfile.ts`): loads the signed-in user's own `profiles` row, applies its saved accent/font pairing to the live `ThemeProvider` once per signed-in user id, and `setAccent`/`setPairing` update the theme immediately (before the network write resolves) then persist only the changed column and track `theme_accent_changed`/`theme_font_changed`; a failed write keeps the local choice and surfaces `saveError`
- **D-17 consent** (`useConsent.ts` + `ConsentScreen.tsx`): `grant()`/`decline()` write `analytics_consent`/`analytics_consent_at` and enable/disable the analytics service; a stored `'granted'` consent re-enables analytics once per sign-in; the consent screen renders the heading, body and all five "never sent" items, with two equal-size pill choices (accent-filled Share usage, outlined Not now), neither pre-selected, and no third close/skip control
- **D-15 sign-out** (`signOut.ts`): `requestSignOut()` warns with the pending-write count (0 today, since Phase 1's write queue hasn't registered yet — the gate is fully proven with an injected count) before `performSignOut()` runs `analytics.disable()` → `supabase.auth.signOut({ scope: 'local' })` → `wipeDeviceData()` → `resetTheme()` in order, still wiping locally and resolving when the Supabase call rejects (offline)
- **D-13 You screen** (`YouScreen.tsx` + 5 components): identity row (full name or email fallback, email sub-label), `AccentSwitcher`/`FontPairingSwitcher` driven by the live theme so a press is visible in the same render tree, a custom Reanimated `AnalyticsToggle` whose thumb slide collapses under reduce-motion, `ConnectionStatus` calling `checkConnection()` on mount and on `AppState` 'active', and the sign-out row wired to an `Alert` only when writes are pending
- **The `(app)` route group** (`app/(app)/_layout.tsx`, `consent.tsx`, `you.tsx`): redirects to `/consent` when `needsPrompt` is true (skipped when already there), otherwise renders the you/consent `Stack` — completing what 00-17 forward-referenced
- 1184/1184 tests pass across the full suite (71 suites), `tsc --noEmit`, `npm run lint`, `npm run depcruise` and `npm run verify:gates` all clean on the final tree

## Task Commits

Each task followed RED then GREEN (TDD):

1. **Task 1: Profile hook (theme + consent persistence) and the sign-out flow**
   - RED: `c929211` (test)
   - GREEN: `f10d67f` (feat)
2. **Task 2: Consent screen and the signed-in group layout**
   - RED: `48e2251` (test)
   - GREEN: `8181265` (feat)
3. **Task 3: You screen (identity, switchers, analytics toggle, connection status, sign out)**
   - RED: `1bf3f6e` (test)
   - GREEN: `16955ba` (feat)

## Files Created/Modified

- `src/features/you/useProfile.ts` — profile load + live theme sync + accent/font persistence
- `src/features/you/__tests__/useProfile.test.tsx` — 5 tests covering load/apply-theme, setAccent/setPairing success and failure, and signed-out behaviour
- `src/features/consent/useConsent.ts` — grant/decline/setEnabled built on useProfile
- `src/features/consent/ConsentScreen.tsx` — the D-17 consent prompt
- `src/features/consent/__tests__/ConsentScreen.test.tsx` — 4 tests covering copy, equal-size buttons, grant/decline + redirect
- `src/features/auth/signOut.ts` — requestSignOut/performSignOut
- `src/features/auth/__tests__/signOut.test.ts` — 4 tests covering the pending-write gate, ordered wipe, and offline resilience
- `src/features/you/YouScreen.tsx` — the settings screen
- `src/features/you/__tests__/YouScreen.test.tsx` — 10 tests covering identity, live accent/font switching, the analytics toggle, connection states, and sign-out
- `src/features/you/components/AccentSwitcher.tsx` — four accent swatches, live-theme-driven
- `src/features/you/components/FontPairingSwitcher.tsx` — four font-pairing rows, live-theme-driven
- `src/features/you/components/AnalyticsToggle.tsx` — Reanimated custom switch
- `src/features/you/components/ConnectionStatus.tsx` — live Supabase reachability indicator
- `src/features/you/components/SettingsGroup.tsx` — shared group-heading + row-card shell
- `app/(app)/_layout.tsx` — consent-gated signed-in route group
- `app/(app)/consent.tsx`, `app/(app)/you.tsx` — route wrappers

## Decisions Made

See `key-decisions` in the frontmatter. In brief: `useConsent` now also exposes `loading` (see Deviations below); `signOut.ts` resolves the real Supabase client lazily, mirroring 00-10's `connection.ts`; `useProfile`'s signed-out state is derived rather than set synchronously in an effect, to satisfy `react-hooks/set-state-in-effect`; the font/accent selection indicator is a plain accent dot, since Phase 0 ships no icon set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `useConsent`'s `needsPrompt` would misread a still-loading profile as "no consent on record"**
- **Found during:** Task 2, writing `app/(app)/_layout.tsx` per the plan's own instruction ("While the profile loads it returns null")
- **Issue:** Task 1's literal `useConsent` interface had no `loading` field, and `needsPrompt = consent === null`. Since `consent` defaults to `null` before the profile fetch resolves, an already-answered user would briefly see `needsPrompt === true` on every cold start and get redirected to `/consent`, then immediately redirected back once the real value loaded — a visible flash, and a real correctness bug the plan's own layout design (checking loading first) was clearly trying to avoid.
- **Fix:** `useConsent` now also returns `loading` (from the underlying `useProfile`) and computes `needsPrompt = !loading && consent === null`. `app/(app)/_layout.tsx` renders an empty `Screen` while loading, exactly as specified.
- **Files modified:** `src/features/consent/useConsent.ts`
- **Verification:** `ConsentScreen.test.tsx`'s mock of `useConsent` is unaffected (it doesn't use `loading`); `tsc --noEmit` and the full suite pass
- **Committed in:** `8181265` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] A static `import { supabase } from '@/services/supabase'` in `signOut.ts` made the module (and every test importing it) throw under Jest**
- **Found during:** Task 1, first `npx jest` run against `signOut.test.ts`
- **Issue:** Identical root cause to 00-10's `connection.ts` deviation: `client.ts` calls `getEnv()` eagerly at module load, which throws in a Jest process with no `EXPO_PUBLIC_*` env set. A static import of `@/services/supabase` in `signOut.ts` triggered this before any test body ran.
- **Fix:** Resolve the real client via `overrides?.supabase ?? (await import('@/services/supabase')).supabase` inside the (now-async) `resolveDeps`, never a static import. Tests always inject a fake `supabase` dep, so the dynamic import is never reached.
- **Files modified:** `src/features/auth/signOut.ts`
- **Verification:** `signOut.test.ts` passes without any `EXPO_PUBLIC_*` env set; `tsc --noEmit` clean
- **Committed in:** `f10d67f` (Task 1 GREEN commit)

**3. [Rule 1 - Bug] `useProfile`'s first draft failed two `react-hooks` lint rules: a ref write during render, and a synchronous `setState` call reachable from an effect**
- **Found during:** Task 1, `npm run lint` after the tests passed
- **Issue:** (a) `themeRef.current = theme` was written directly in the render body (disallowed — refs must only be read/written outside render). (b) The mount effect called `void refresh()` directly, and `refresh`'s first synchronous statement (before any `await`) called `setLoading(true)`/`setProfile(null)` — flagged by `react-hooks/set-state-in-effect` as a synchronous `setState` reachable from an effect.
- **Fix:** (a) Moved the ref write into a no-deps `useEffect` (runs after every render, per 00-11's identical prior fix). (b) Restructured `refresh()` as a promise-returning function with no synchronous `setState` at its top level — every `setState` call now lives inside the query's own `.then()` callback — and derived the signed-out `profile`/`loading` values (`user ? profile : null` / `user ? loading : false`) instead of calling `setState` for that branch at all.
- **Files modified:** `src/features/you/useProfile.ts`
- **Verification:** `npm run lint` exits 0 on this file; `useProfile.test.tsx`'s 5 tests still pass unchanged
- **Committed in:** `f10d67f` (Task 1 GREEN commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 2/missing-correctness, 1 Rule 3/blocking, 1 Rule 1/bug). None change the plan's observable behaviour or acceptance criteria; all three were required to make the plan's own specified design (the layout's loading gate, Jest-testability, and clean lint) actually hold.

## Issues Encountered

None beyond the deviations documented above. One transient, unrelated `EPERM` jest-cache read failure was seen on the very first full-suite run (a shared Windows `%TEMP%\jest` transform cache being written concurrently by another worktree's session) — re-running that single suite in isolation passed immediately, and every later full-suite run was clean.

## User Setup Required

None. This plan only adds local modules and screens; no new external service configuration is needed (Supabase, PostHog and Sentry were already provisioned by earlier plans).

## Next Phase Readiness

- `npx jest` (1184/1184), `npx tsc --noEmit`, `npm run lint`, `npm run depcruise`, and `npm run verify:gates` all pass on a clean tree
- 00-19's device-persistence proof can now run against a complete signed-in surface: welcome → sign-in → consent (first time) → You screen, with a live theme switch and a real sign-out
- Phase 1's TanStack Query write queue registers into `src/services/storage/wipe.ts` (`registerWipeHandler({ id, wipe, pendingWriteCount })`) with zero changes needed to `signOut.ts` — `getPendingWriteCount()` will start reporting a real count the moment that handler registers
- Nothing blocks 00-19 or Phase 1

## Known Stubs

None — every file this plan created is fully implemented and tested. `app/(app)/_layout.tsx`'s `<Stack.Screen name="you" />`/`<Stack.Screen name="consent" />` both now resolve to real screens (this plan created both), so the "unknown screen name" warning 00-17 anticipated is resolved.

## Self-Check: PASSED

All 17 files listed under "Files Created/Modified" verified present on disk. All 6 task commits (`c929211`, `f10d67f`, `48e2251`, `8181265`, `1bf3f6e`, `16955ba`) verified present in `git log --oneline`.

---
*Phase: 00-foundation*
*Completed: 2026-09-26*
