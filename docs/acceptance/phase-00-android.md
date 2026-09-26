# Phase 0 (foundation) — Android Acceptance Record

Plan: `.planning/phases/00-foundation/00-19-PLAN.md`. Executed against the
single (production) Supabase project, ref `cohmcbdfgqmiwykztrdg`. No secret
value appears anywhere in this document.

iOS-specific criteria (Sign in with Apple, iPhone XR EAS build) are not in
scope here — they land in `00-20-PLAN.md`, which stays blocked on Apple
Developer Program enrolment (itself blocked on the D-U-N-S number, requested
2026-09-15, ETA 2026-10-13). **Phase 0 is not complete until 00-20 lands.**

---

## Task 1: Full automated suite, register consolidation, acceptance checklist

**Date:** 2026-09-26

### Full automated suite

Run against a fresh `npm ci --legacy-peer-deps` install in a clean worktree
(`fincwin-close`, merged to `origin/main` at commit `45cacd2`):

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass, 0 errors |
| `npx eslint .` | pass, 0 errors (20 pre-existing `import/no-named-as-default-member` warnings on `fast-check`/`i18next` default-import style, unrelated to this plan's scope) |
| `npx depcruise src --config .dependency-cruiser.cjs` | pass — "no dependency violations found (148 modules, 434 dependencies cruised)" |
| `npx jest --coverage --ci` (`npm run test:coverage`) | pass — **73 suites / 1202 tests**, all green. (The 01-16 acceptance record from the same day noted 2 tests failing on a 5s async timeout under fresh-`npm ci` CPU contention; both passed individually there and both passed in this run's single pass — no code was touched) |
| `npm run verify:gates` | `GATES OK` — all 5 probes (engine-purity depcruise+eslint, coverage gate, coverage-ignore reasoning) |
| `npm run check:ignores` | `check:ignores OK — no unreasoned coverage ignores in 100% folders` |
| `npx supabase test db` (local Docker stack) | `Result: PASS` — 24 files, 339 tests |
| Docker gitleaks scan (`ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0...`, v8.30.1, `--redact --no-banner --exit-code 1`) | **no leaks found** — 320 commits scanned. Run against a throwaway local clone of the worktree (`git clone` to the session scratchpad, deleted after) because gitleaks' Docker mount cannot resolve a Windows-path `.git` worktree pointer file directly |

All automated commands from Task 1 step 1 exit 0.

### Fresh dev-build device run (Task 1 step 2)

Plan Task 1 step 2 calls for `npx expo run:android` against the production
project with 00-10 through 00-18 in place. This was carried out as part of
the combined on-device session recorded under Task 2 below, on a **Pixel 9**
physical device (Android SDK 37, adb 55240DLAQ000EQ) rather than the
`Pixel_8_API_36` emulator the plan names.

**Deviation — emulator abandoned, real device substituted (environment
note, not a Rule 1-3 fix):** the `Pixel_8_API_36` AVD segfaulted twice on
boot (once in the GPU path, once under `swiftshader`) on this machine's
Intel Iris Xe graphics. Rather than debug AVD GPU acceleration further, the
session moved to the Pixel 9 dev client (debug build, arm64) against the
same production project. This is a stronger acceptance run than the plan
asked for (real hardware, not an emulator) and every step below was carried
out on it.

### Register consolidation (Task 1 step 3)

`docs/dependency-register.md` updated in this session — every row now carries
today's date or an explicit earlier date for rows with no new information.
Notable status changes made from the SUMMARYs and this session's live checks:

- Supabase prod project: `pending` → **provisioned** (migrated through Phase 1, all eleven migrations `local=remote`)
- Supabase dev project: `pending` → **deferred** (collapsed into the single production project by quick task 260922-tsn; the row was stale)
- EAS project + profiles: `pending` → **provisioned**
- Google OAuth client IDs: `pending` → **provisioned** (Google Sign-In confirmed end to end on device; a second Android OAuth client for the other keystore SHA-1 remains a tracked non-blocking gap)
- Frankfurter v2: `pending` → **provisioned** (`fx-sync` live on production, cron confirmed)
- Resend (FX operator digest): `pending` → **provisioned** (secrets + Vault row created in plan 01-16)
- PostHog: date refreshed, ANL-01 device confirmation added
- Sentry: date refreshed, live-event delivery confirmed (PR #19)
- App identifier: `pending` → **provisioned** (`com.fincwin.app`)
- Company website: re-audited live 2026-09-26, verdict improved from `REMEDIATE (9 items)` to `READY pending D-U-N-S name match + a "registered in Canada" line` — see `docs/enrolment/website-audit.md` §"Re-audit — 2026-09-26"
- Added a `gitleaks (Docker scan image)` row, pinned digest, per this session's re-run
- D-U-N-S, Apple Developer Program, Google Play Console: unchanged status, dates refreshed, still blocked on the D-U-N-S issuing (ETA 2026-10-13)

`grep -c "^| " docs/dependency-register.md` → 28 rows, every one carrying a
Status in `{provisioned, pending, deferred}`.

---

## Task 2: On-device acceptance

**Date:** 2026-09-26
**Device:** Pixel 9, Android SDK 37, adb serial `55240DLAQ000EQ`, dev client (debug build, arm64) against the production Supabase project. Google account `lifecreativewordministry@gmail.com`.
**Environment note:** the `Pixel_8_API_36` AVD was abandoned after segfaulting twice on boot (GPU path, then `swiftshader`) on this machine's Intel Iris Xe graphics; the Pixel 9 physical device was substituted for the entire session, including 01-16 Task 3's device checks (recorded separately in `docs/acceptance/phase-01-money-core.md`).

This session combined 00-19 Task 2 (this table) with 01-16 Task 3 in one
continuous on-device pass, since both needed the same fresh dev-client build.

| # | Requirement | Step | Expected | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | — | Welcome screen | Wordmark, tagline "Money with a purpose. Win every month.", Google button, Apple disabled with note, no email/password fields | **PASS** | Visual confirmation on device |
| 2 | ACC-02, ENV-06 | Continue with Google, pick test account | Consent screen next; Management API shows one profile row, one household membership, role owner, weight 1 | **PASS** | `select p.id, p.email, h.id, m.role, m.weight from profiles p join household_members m on m.user_id = p.id join households h on h.id = m.household_id where p.email = '<test account>'` returned exactly one row: role `owner`, weight `1` |
| 3 | ANL-01 | Consent screen, tap "Share usage" | `analytics_opted_in` event lands on PostHog EU keyed by the Supabase UUID, no email/name properties, nothing before opt-in | **PASS after one auto-fix** — see Deviations. PostHog (EU) confirmed exactly two events for the test user's UUID: `$identify` and `analytics_opted_in`, both at `2026-09-26T10:10:31Z`, no email or name properties, nothing recorded before opt-in |
| 4 | ENV-03, FND-06 | You screen | "Connected to Supabase" (ENV-03), "synced just now", exchange-rate credit line, "Queue a test entry (dev)"; accent/font switches apply instantly and persist | **PASS** | All elements present. Switched accent (Navy → Rust) and font pairing (Grotesk → Neutral); applied with no reload. `profiles.accent`/`profiles.font_pairing` confirmed changed on the production project; PostHog `theme_*` events matched the tap sequence |
| 5 | ACC-05, D-14 | Force-quit and reopen with rust/neutral set | Still signed in; rust/neutral applied immediately; no green flash | **PASS** | Production row confirmed `accent=rust`, `font_pairing=neutral`. Observation: dev-build cold start shows a native splash, a long wait for the JS bundle over USB from Metro, then a second logo flash before the screen renders — expected for a dev client; logged as a follow-up to re-check the double-splash behaviour on a preview/release build, not a bug in this build |
| 6 | FND-07 | OS "Remove animations" on, toggle analytics off/on | Switch jumps without animating | **PASS** | Confirmed; consent state ended `granted` |
| 7 | DSG-03 | Safe areas | Nothing sits under the status bar or gesture bar; status-bar icons legible | **PASS after one auto-fix** — see Deviations. Re-verified on the Pixel 9 after the fix landed |
| 8 | FND-09 | Version gate: raise `min_supported_version` to `9.9.9`, relaunch, then restore to `0.1.0` | Update-required screen shows, Back does not dismiss it; restoring clears it | **PASS** | `app_config.min_supported_version` set to `9.9.9` via the Management API (user-authorised), relaunch showed the update-required screen and Back did not dismiss it; restored to `0.1.0` immediately and re-read to confirm the restore before continuing |
| 9 | D-15 | Sign out | No dialog (0 pending); lands on welcome; relaunch stays on welcome with default green | **PASS** | Confirmed |
| 10 | ENV-09, ENV-20 | Confirm/correct Apple/Play/D-U-N-S/website statuses | Register reflects current reality | **Done** | D-U-N-S and the two store enrolments remain pending, unchanged, blocked on the D-U-N-S ETA (2026-10-13). Website re-audited live 2026-09-26 — see `docs/enrolment/website-audit.md`; register updated accordingly |
| 11 | ENV-17 | Confirm Supabase migrated, fx-sync deployed | Production current | **Done** | Confirmed via `supabase migration list --linked` (all four Phase 0 migrations `local=remote`) and a live `fx-sync` invocation returning `ok:true`, both captured in `docs/acceptance/phase-01-money-core.md` Task 1/2 (run in the same session) |

**User approval:** approved, with results for steps 1-9 as recorded above (two steps required an auto-fix before passing — both documented under Deviations, PR #28 and PR #29).

---

## Task 3: Confirm production schema and fx-sync, finalise register and acceptance doc

**Date:** 2026-09-26

1. Link target confirmed as the production project (`cohmcbdfgqmiwykztrdg`); `supabase/.temp/project-ref` matches `SUPABASE_PROD_PROJECT_REF`.
2. `supabase migration list --linked` shows `20260922000100` through `20260922000400` (the four Phase 0 migrations) as `local=remote`, alongside all seven Phase 1 migrations pushed in plan 01-16 — full excerpt in `docs/acceptance/phase-01-money-core.md`.
3. `fx-sync` confirmed live: a correct-secret invocation returns `{"ok":true,"source":"frankfurter-v2",...}`; a wrong secret returns 403 (both captured in the same 01-16 acceptance record, run in this combined session rather than repeated here).
4. Task 2's results and the register rows above are final as of this document.

**Acceptance criteria:**

- `supabase migration list --linked` shows all four Phase 0 migrations on the production project as `local=remote`, and the `fx-sync` invocation returns `ok:true` — **confirmed** (see `docs/acceptance/phase-01-money-core.md`)
- `supabase/.temp/project-ref` equals `SUPABASE_PROD_PROJECT_REF` — **confirmed**
- Every step in this document has a Result filled in — **confirmed**

The Android half of Phase 0 is accepted. The production project is confirmed
current. The register is final as of 2026-09-26. **Phase 0 remains
incomplete pending 00-20 (iOS)**, which stays blocked on Apple Developer
Program enrolment.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Consent screen redirect loop ("Maximum update depth exceeded")**
- **Found during:** Task 2, step 3 (consent screen)
- **Issue:** Tapping "Share usage" triggered a redirect loop between `(app)/_layout` and `ConsentScreen` — each held its own per-instance `useProfile` state, so a write from one component's optimistic update raced the other's read and re-triggered navigation.
- **Fix:** Share one profile row across consumers via the shared TanStack Query cache instead of independent per-instance state.
- **Files modified:** `src/features/consent/useConsent.ts`, `src/features/consent/ConsentScreen.tsx`, `src/features/you/useProfile.ts`, plus test updates in both features' `__tests__` directories.
- **Verification:** Re-ran the consent flow on the Pixel 9 after the fix — PASS. A regression test (`src/features/consent/__tests__/useConsent.test.tsx`) reproduces the two-consumer race and asserts it no longer loops.
- **Committed in:** PR #28 (merged: `2d32e4f`, `78ab7f2`, `e3a504c`, `bbe294b`).

**2. [Rule 1 - Bug] Safe-area insets and status-bar contrast**
- **Found during:** Task 2, step 7 (safe areas)
- **Issue:** Scrolled content drew under the status bar, and status-bar icons rendered light-on-light against the light canvas.
- **Fix:** Added a top-inset scroll band to the shared `Screen` component and set the app status-bar style to dark, both JS-only (no native rebuild required).
- **Files modified:** `src/ui/Screen.tsx` and the app-level status-bar configuration.
- **Verification:** Re-verified on the Pixel 9 after the fix — PASS.
- **Committed in:** PR #29 (`fix/status-bar-safe-area`, present on this branch via the merge from `origin/main`).

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs), both discovered live on device and re-verified passing before this document was finalised.
**Impact on plan:** Both fixes were necessary for the plan's own acceptance criteria (ANL-01's consent flow, DSG-03's safe areas) to pass at all. No scope creep — no unrelated code was touched.

## Issues Encountered

- The `Pixel_8_API_36` AVD could not boot on this machine (Intel Iris Xe, GPU and `swiftshader` paths both segfaulted). Resolved by substituting a real Pixel 9 device for the entire on-device session — see the Environment note above. This is an environment limitation, not a product defect, and does not block any acceptance criterion.
- The Docker gitleaks scan could not resolve this worktree's `.git` file (a Windows-path pointer into the shared `C:/dev/fincwin/.git/worktrees/...` gitdir) when mounted directly. Resolved by cloning the worktree to a self-contained repo in the session scratchpad, scanning that, then deleting it. No leaks found either way; this is a container-mount limitation specific to git worktrees on Windows, not a scan gap.

---
*Phase: 00-foundation*
*Completed: 2026-09-26*
