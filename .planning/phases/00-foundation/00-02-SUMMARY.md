---
phase: 00-foundation
plan: 02
subsystem: infra
tags: [expo, expo-router, react-native, typescript, supabase, posthog, i18next, eas, sdk57]

# Dependency graph
requires:
  - phase: 00-foundation (plan 01)
    provides: dependency register and Apple org checklist scaffolding (docs/) — not consumed directly by this plan, ran in parallel
provides:
  - Bootable Expo SDK 57 + Expo Router project at the repo root, next to the untouched prototype files
  - Every Phase 0 native/runtime/dev dependency installed in one approved step (no later plan edits package.json concurrently)
  - app.config.ts as the single dynamic config source (identifier com.fincwin.app, owner fincwin, fingerprint OTA policy)
  - tsconfig.json strict with @/* -> src/* path alias
  - src/ folder map (engine/db/data/state/ui/theme/i18n/config/features/services) documented ahead of code landing in it
affects: [00-03, 00-04, 00-05, engine-boundary-setup, ci-setup]

# Tech tracking
tech-stack:
  added:
    - "expo ~57.0.24, expo-router ~57.0.22, react-native 0.86.3, react 19.2.3"
    - "react-native-reanimated 4.5.1 + react-native-worklets 0.10.1 (separate package, per CLAUDE.md)"
    - "@supabase/supabase-js 2.116.0, aes-js 3.1.2 (pinned exact)"
    - "posthog-react-native 4.75.0 (pinned exact, no session-replay/plugin packages installed)"
    - "i18next 26.4.2, react-i18next 17.0.15 (pinned exact)"
    - "@react-native-google-signin/google-signin 16.1.5 (latest major, unpinned per plan)"
    - "jest-expo, jest, @testing-library/react-native — test stack"
    - "eslint, eslint-config-expo, eslint-plugin-boundaries 7.2.0, eslint-plugin-i18next, eslint-import-resolver-typescript, dependency-cruiser 18.4.0 — lint/boundary stack"
    - "babel-preset-expo ~57.0.12 (added as explicit devDependency, see deviations)"
  patterns:
    - "Dynamic app.config.ts only — no app.json coexists; identifier and owner are hardcoded constants set by the Task 1 decision, non-secret build values (EAS project ID, Google iOS URL scheme) read from env"
    - "src/ folder map documented via README before any code lands, establishing the engine/ purity boundary early"
    - "Runtime install via `npx expo install` (SDK-resolved versions), pinned security/analytics libs via `npm install --save-exact`, dev tooling via `npx expo install --dev` / plain `npm install --save-dev`"

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - app.config.ts
    - babel.config.js
    - app/_layout.tsx
    - app/index.tsx
    - assets/icon.png, assets/splash-icon.png, assets/android-icon-*.png, assets/favicon.png
    - src/README.md
  modified:
    - .gitignore

key-decisions:
  - "App identifier: com.fincwin.app; Expo org slug: fincwin (Task 1, user-approved)"
  - "edgeToEdgeEnabled dropped from android config — the field no longer exists in SDK 57's @expo/config-types because edge-to-edge is now mandatory/always-on in Android, not opt-in"
  - "tsconfig baseUrl removed (paths alone resolves relative to tsconfig location in modern TS); avoids TS 6.0's baseUrl deprecation warning without behaviour change"
  - "babel-preset-expo pinned explicitly at ~57.0.12 as a devDependency since babel.config.js requires it directly and it was only present nested inside expo's own node_modules, not hoisted to root"
  - "Installs requiring --save-dev via `npx expo install <pkgs> -- --save-dev` landed in dependencies instead of devDependencies (expo CLI's actual flag is `--dev`, not a passthrough); corrected by hand-editing package.json and re-running npm install"
  - "npm install commands run with --legacy-peer-deps to route around an optional react-dom@19.3.0 peer (pulled in by @expo/dom-webview, Expo's web dev-tools UI) that conflicts with the CLAUDE.md-mandated react@19.2.3; does not affect the shipped mobile app"

patterns-established:
  - "Pattern: app.config.ts is the only Expo config file; any app.json the CLI auto-generates while adding config plugins gets folded in and deleted, never left to coexist"
  - "Pattern: dependency installs happen in the exact approved-list batches from the checkpoint decision, each batch's actual package.json landing spot verified (not just its version) before moving to the next batch"

requirements-completed: [FND-01]

# Metrics
duration: ~45min
completed: 2026-09-22
---

# Phase 00 Plan 02: Expo SDK 57 Scaffold Summary

**Expo SDK 57 + Expo Router project scaffolded at the repo root with every Phase 0 native/runtime/dev dependency installed in one approved step, TypeScript strict, and app.config.ts as the single dynamic config source for identifier `com.fincwin.app`.**

## Performance

- **Duration:** ~45 min (install-heavy: 6 sequential npm/expo install batches)
- **Completed:** 2026-09-22
- **Tasks:** 2 (Task 1 was a checkpoint:decision resolved by the user before this session; Task 2 executed here)
- **Files modified:** 10 tracked paths (15 files including individual asset PNGs)

## Accomplishments
- Bootable Expo SDK 57 (`~57.0.24`) + Expo Router (`~57.0.22`) project at the repo root, prototype files (`FincWin United.dc.html`, `ios-frame.jsx`, `support.js`, `doc-page.js`, `BUILD-PROMPT.md`, `screens/`) left untouched
- Every Phase 0 dependency from the Task 1 approved list installed: 30 `expo install` runtime packages, 6 exact-pinned packages (`@supabase/supabase-js@2.116.0`, `aes-js@3.1.2`, `posthog-react-native@4.75.0`, `i18next@26.4.2`, `react-i18next@17.0.15`, `@react-native-google-signin/google-signin`), and the full dev/test/lint/boundary tooling set
- Confirmed absent: `expo-sqlite`, `drizzle`, session-replay packages, `@sentry/react-native`, anything named passkey
- `app.config.ts` created with the user's identifier (`com.fincwin.app`) and Expo owner (`fincwin`), fingerprint OTA runtime policy, and env-driven EAS/Google config
- `tsconfig.json` strict with `noUncheckedIndexedAccess` and the `@/*` → `src/*` path alias
- `app/_layout.tsx` (root Stack) and `app/index.tsx` (wordmark boot screen) as the Expo Router entry, both explicitly flagged for replacement by plan 00-17
- `src/README.md` documents the full folder map (`engine/`, `db/`, `data/`, `state/`, `ui/`, `theme/`, `i18n/`, `config/`, `features/`, `services/`) and restates the `engine/` purity boundary ahead of any code landing there
- `.gitignore` extended with CNG native-folder exclusions, coverage/tsbuildinfo artifacts, gate-probe test scaffolding, and Supabase local-dev temp paths

## Task Commits

1. **Task 1: Choose app identifier, Expo owner, approve install list** — checkpoint:decision, resolved by user (`identifier: com.fincwin.app; expo owner: fincwin; install: approved`), no commit (decision only)
2. **Task 2: Scaffold Expo SDK 57 + Expo Router and install the approved dependency set** — `18a651f` (feat)

**Plan metadata:** this commit (docs: complete plan) — created alongside this SUMMARY

## Files Created/Modified
- `package.json` — name `fincwin`, version `0.1.0`, `main: expo-router/entry`, full Phase 0 dependency set correctly split across `dependencies`/`devDependencies`
- `package-lock.json` — lockfile for the full install
- `tsconfig.json` — `expo/tsconfig.base` extended, `strict: true`, `noUncheckedIndexedAccess: true`, `@/*` path alias, `supabase/functions` excluded (Deno, typechecked separately)
- `app.config.ts` — dynamic Expo config: identifier, scheme, plugins, fingerprint runtime policy, env-driven EAS/Google values
- `babel.config.js` — `babel-preset-expo` only; confirmed the preset auto-adds `react-native-worklets/plugin` when `react-native-worklets` is installed (no manual plugin entry needed)
- `app/_layout.tsx` — root Expo Router `Stack`, header hidden
- `app/index.tsx` — boot screen rendering the `FincWin` wordmark on `#FBFAF7`
- `assets/*.png` — icon, adaptive-icon layers, splash, favicon copied from the SDK 57 scaffold template
- `src/README.md` — folder map and engine boundary documentation
- `.gitignore` — CNG native folders, build artifacts, gate-probe scaffolding, Supabase local temp paths appended (existing secret patterns preserved)

## Decisions Made
- App identifier `com.fincwin.app` and Expo owner `fincwin` per the user's Task 1 resume signal
- Dropped `edgeToEdgeEnabled` from `app.config.ts`'s android block — no longer a valid field in SDK 57's `@expo/config-types` since Android edge-to-edge is mandatory now, not opt-in
- Removed `baseUrl` from `tsconfig.json` (kept `paths`), avoiding TypeScript 6.0's `baseUrl` deprecation error with no functional change, since paths without baseUrl resolve relative to the tsconfig's own location
- Added `babel-preset-expo` as an explicit pinned devDependency (`~57.0.12`, matching expo's own required version) since the plan's `babel.config.js` requires it directly by name and it was not hoisted to root `node_modules`
- Deleted the `app.json` the Expo CLI auto-generated mid-install (holding only a `plugins` array) once `app.config.ts` existed as the complete, self-sufficient config — avoids two coexisting/ambiguous config sources

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `babel-preset-expo` dependency**
- **Found during:** Task 2, step 6 (babel.config.js)
- **Issue:** `babel.config.js` requires `babel-preset-expo` directly, but it was not in the Task 1 approved package list and was only present nested inside `expo`'s own `node_modules` (not resolvable from the repo root)
- **Fix:** Added `babel-preset-expo@~57.0.12` (matching the exact version `expo@57.0.24` itself depends on) as a pinned devDependency and reran `npm install`
- **Files modified:** package.json, package-lock.json
- **Verification:** `node_modules/babel-preset-expo` now resolves at root; its README confirms `worklets: true` is the default, so `react-native-worklets/plugin` is added automatically — no manual babel plugin entry needed
- **Committed in:** `18a651f`

**2. [Rule 1 - Bug] `-- --save-dev` did not route packages into devDependencies**
- **Found during:** Task 2, step 3 (installing jest-expo/jest/@types/jest and eslint/eslint-config-expo/typescript)
- **Issue:** The plan's literal command syntax (`npx expo install <pkgs> -- --save-dev`) does not work as intended — `npx expo install --help` confirms the correct flag is `--dev`, not a passthrough after `--`. The affected packages (`jest-expo`, `jest`, `@types/jest`, `eslint-config-expo`, and a duplicate `typescript` entry) landed in `dependencies` instead of `devDependencies`
- **Fix:** Hand-edited `package.json` to move all five entries to `devDependencies`, removed the duplicate `typescript` key, then reran `npm install --legacy-peer-deps` to reconcile the lockfile (no version or install-tree changes, only the dev/prod classification)
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx expo install --check` reports "Dependencies are up to date"; `npx tsc --noEmit` passes
- **Committed in:** `18a651f`

**3. [Rule 3 - Blocking] Optional `react-dom` peer conflict blocked npm install**
- **Found during:** Task 2, step 3 (installing the pinned exact-version package batch)
- **Issue:** `npm install --save-exact @supabase/supabase-js@2.116.0 ...` failed with ERESOLVE: `react-dom@19.3.0` (an optional transitive dependency of `@expo/dom-webview`, Expo's web dev-tools UI, unrelated to the mobile app) requires `react@^19.3.0`, conflicting with the CLAUDE.md-mandated `react@19.2.3`
- **Fix:** Reran all subsequent `npm install`/`npx expo install --dev` batches with `--legacy-peer-deps`. This does not change any pinned or resolved package version — it only tells npm not to hard-error on this optional-peer mismatch from an unused web dev-tools path
- **Files modified:** none beyond the normal install batches (package.json/package-lock.json already covered above)
- **Verification:** `npx tsc --noEmit` and `npx expo install --check` both pass; `react` stays at `19.2.3` as CLAUDE.md requires
- **Committed in:** `18a651f`

**4. [Rule 1 - Bug] `android.edgeToEdgeEnabled` no longer exists in SDK 57's config types**
- **Found during:** Task 2, step 4 verification (`npx tsc --noEmit`)
- **Issue:** The plan's `app.config.ts` template set `edgeToEdgeEnabled: true` in the `android` block, but `@expo/config-types` for SDK 57 no longer declares this field — Android edge-to-edge is mandatory/always-on now, with no opt-in toggle
- **Fix:** Removed `edgeToEdgeEnabled: true` from the android config, with an inline comment explaining why
- **Files modified:** app.config.ts
- **Verification:** `npx tsc --noEmit` passes; `npx expo config --type public` resolves the config cleanly
- **Committed in:** `18a651f`

**5. [Rule 1 - Bug] `tsconfig.json`'s `baseUrl` triggers a TypeScript 6.0 deprecation error**
- **Found during:** Task 2, step 5 verification (`npx tsc --noEmit`)
- **Issue:** The plan's `tsconfig.json` template set `baseUrl: "."` alongside `paths`. TypeScript `~6.0.3` (the version SDK 57's scaffold resolved) treats `baseUrl` as deprecated and errors under `--noEmit` unless silenced
- **Fix:** Removed `baseUrl` entirely — with modern TypeScript, `paths` alone resolves relative to the `tsconfig.json` file's own location, which is functionally identical here since `baseUrl` was already `"."`
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` passes with no errors
- **Committed in:** `18a651f`

**6. [Rule 1 - Bug] Auto-generated `app.json` coexisting with `app.config.ts`**
- **Found during:** Task 2, step 4 (after the plugin-installing `expo install` runs)
- **Issue:** With no config file present yet, the Expo CLI auto-created `app.json` mid-install to record the `plugins` array as config plugins were added (`expo-router`, `expo-status-bar`, `expo-splash-screen`, `expo-font`, `expo-secure-store`, `expo-web-browser`, `expo-localization`). The plan's step 4 creates `app.config.ts` as the sole config file and never mentions this auto-generated `app.json`
- **Fix:** Deleted `app.json` once `app.config.ts` was written and confirmed to declare the complete config (including all seven plugins from the auto-generated list, plus `expo-apple-authentication` and the conditional Google Sign-In plugin) — `app.config.ts` is fully self-sufficient and does not spread `app.json`
- **Files modified:** app.json (deleted, never committed)
- **Verification:** `npx expo config --type public` resolves correctly using only `app.config.ts`
- **Committed in:** n/a — deleted before staging, never entered git history

---

**Total deviations:** 6 auto-fixed (3 blocking/Rule 3, 3 bug/Rule 1)
**Impact on plan:** All fixes were required for the scaffold to actually install and typecheck against the real, currently-published SDK 57 dependency graph (not the graph as it existed when the plan was written). No scope creep — no package outside the Task 1 approved list was added except `babel-preset-expo`, which is a direct, pinned-to-SDK-version requirement of the plan's own `babel.config.js`.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None — no external service configuration required. This plan only touches local scaffolding and dependencies; Supabase/EAS/Google/Apple credentials are out of scope for 00-02.

## Next Phase Readiness
- The project typechecks (`npx tsc --noEmit` exits 0) and every dependency matches Expo's SDK 57 compatibility check (`npx expo install --check`)
- `app/_layout.tsx` and `app/index.tsx` are intentionally minimal placeholders — plan 00-17 replaces both with the real welcome/sign-in flow (D-10 through D-16 in `00-CONTEXT.md`)
- `src/` contains only `README.md` — no code folders exist yet; they are created on demand by the plans that need them (engine boundary tooling, theme system, i18n catalogue, Supabase client, etc.)
- No blockers for 00-03 onward; the dependency set installed here is intended to cover all of Phase 0 so no later Phase 0 plan needs to touch `package.json` concurrently

## Known Stubs
- `app/index.tsx` renders a hardcoded `FincWin` wordmark with no navigation, auth check, or data — this is the plan's explicit intent ("Plan 00-17 replaces both files") and not a gap to close in this plan.

## Self-Check: PASSED

All files listed under "Files Created/Modified" verified present on disk (package.json, package-lock.json, tsconfig.json, app.config.ts, babel.config.js, app/_layout.tsx, app/index.tsx, assets/icon.png, src/README.md, this SUMMARY.md). Commit `18a651f` verified present in `git log`.

---
*Phase: 00-foundation*
*Completed: 2026-09-22*
