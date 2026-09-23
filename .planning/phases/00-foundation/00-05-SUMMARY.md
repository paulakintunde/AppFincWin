---
phase: 00-foundation
plan: 05
subsystem: infra
tags: [eslint, dependency-cruiser, jest, boundaries, coverage, env-config, ci-gates]

# Dependency graph
requires:
  - phase: 00-foundation (plan 02)
    provides: Expo SDK 57 scaffold, TypeScript strict, @/* -> src/* alias, package.json/tsconfig.json baseline
provides:
  - Dual-layer engine-purity gate (eslint-plugin-boundaries + dependency-cruiser with reachable:true) that fails on direct and transitive imports from src/engine/ into db/data/state/services/ui/features or react/react-native/expo
  - jest coverage gate with D-21 per-directory thresholds (95% src/engine/, 100% money/decide/payoff/split once they contain source) that dynamically activates as those folders arrive in later phases
  - scripts/verify-gates.mjs — a self-test proving all of the above gates actually fail on real violations, with guaranteed cleanup
  - scripts/check-coverage-ignores.mjs — fails on any istanbul/c8 ignore comment in a 100% engine folder lacking a written reason (D-21)
  - src/config/env.ts — the one typed, validated env reader every later service/feature must read through (ENV-01), enforcing the EU PostHog host (D-23)
  - .env.example documenting all 11 EXPO_PUBLIC_ keys plus build-time and tooling-only keys
  - First real, tested engine module (src/engine/guards/assertNever.ts)
affects: [00-06, 00-07, 00-08, engine-implementation-phases (1, 4), ci-setup, any-plan-touching-env-vars]

# Tech tracking
tech-stack:
  added:
    - "eslint-plugin-boundaries 7.2.0 (boundaries/dependencies rule, v7 entity-selector shape)"
    - "dependency-cruiser 18.4.0 (reachable:true transitive rule)"
    - "eslint-plugin-i18next 6.x (no-literal-string, jsx-text-only mode)"
    - "eslint downgraded from ^10.11.0 to exact 9.39.5 (see deviations)"
    - "@react-native/jest-preset 0.86.3 (exact) — jest-expo peer dependency, was missing"
    - "jest-expo 57.0.5 preset wired via jest.config.js"
  patterns:
    - "Dynamic jest coverageThreshold: only adds a threshold entry for a folder once fs.readdirSync finds real source in it, so 100%-coverage engine folders (money/decide/payoff/split) activate automatically in later phases with zero config edits"
    - "Gate self-test pattern: scripts/verify-gates.mjs injects real rule violations into temp files, asserts each gate's exit code and output, and always cleans up in a finally block — this is now the template for any future CI gate this project adds"
    - "Typed env module: readClientEnv(src) is pure and unit-testable; getEnv() is the only place process.env is touched, using literal EXPO_PUBLIC_* property accesses (required for Expo's inliner) and caching the result"

key-files:
  created:
    - eslint.config.js
    - .dependency-cruiser.cjs
    - jest.config.js
    - jest.setup.ts
    - scripts/verify-gates.mjs
    - scripts/check-coverage-ignores.mjs
    - src/engine/guards/assertNever.ts
    - src/engine/guards/__tests__/assertNever.test.ts
    - .env.example
    - src/config/env.ts
    - src/config/__tests__/env.test.ts
  modified:
    - package.json (lint/typecheck/depcruise/test/test:coverage/verify:gates/check:ignores scripts; eslint pinned to 9.39.5; @react-native/jest-preset added)
    - tsconfig.json (added compilerOptions.types: ["jest"])

key-decisions:
  - "eslint pinned to exact 9.39.5 instead of the ^10.11.0 from 00-02: eslint-plugin-react (pulled in transitively by eslint-config-expo) only declares ESLint peer support through ^9.7 and crashes outright under ESLint 10's flat-config linter API — no compatible eslint-plugin-react release exists yet"
  - "eslint.config.js ignores the pre-existing prototype reference files at repo root (ios-frame.jsx, support.js, doc-page.js, screens/**) — these predate the Expo app and are deliberately left untouched per 00-02-SUMMARY.md, not part of the shipped app"
  - "jest.config.js sets EXPO_PUBLIC_USE_RN_FETCH=1 for the test environment only: expo's winter runtime installs global.fetch as a lazy getter backed by a native-module lookup, and jest-expo 57.0.5's own native-module auto-mocker hits a null path in its stack-trace-derived package.json walk and throws — reproduces even with an empty jest.setup.ts, independent of anything this plan added. No effect on the shipped app, which never sets this var"
  - "jest.config.js sets resolver: 'react-native-worklets/jest/resolver' (shipped by the package itself) so requiring react-native-reanimated in Jest resolves worklets to its non-native build"
  - "posthogHost defaults to the EU host when EXPO_PUBLIC_POSTHOG_HOST is unset rather than throwing, since the PostHog project doesn't exist until 00-13 — it only throws if a value is explicitly set and wrong (D-23 is still enforced, just not before the key exists)"

patterns-established:
  - "Pattern: any new CI gate this project adds should ship with a verify-gates-style self-test that injects a real violation and asserts failure, not just a config that's assumed correct"
  - "Pattern: config env reads only ever happen through src/config/env.ts's getEnv(); no other file touches process.env.EXPO_PUBLIC_* directly (enforced by convention here, ready for a future lint rule if needed)"

requirements-completed: [FND-04, FND-05, ENV-01, DSG-04]

# Metrics
duration: ~50min
completed: 2026-09-22
---

# Phase 00 Plan 05: Quality Gates + Typed Env Config Summary

**Dual-layer engine-purity gate (eslint-plugin-boundaries + dependency-cruiser with `reachable: true`) and a D-21 per-directory jest coverage gate, both proven to actually fail via a self-test script, plus a typed/validated env reader enforcing the EU PostHog host.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-09-22
- **Tasks:** 3 (Task 3 ran TDD: RED then GREEN)
- **Files modified:** 15 tracked paths (13 created, 2 modified)

## Accomplishments
- `eslint.config.js`: `eslint-config-expo/flat` + `eslint-plugin-boundaries` (`boundaries/dependencies` policy using the v7 entity-selector shape) enforcing engine/ purity at edit time, a belt-and-braces `no-restricted-imports` on `src/engine/**`, and `eslint-plugin-i18next`'s `no-literal-string` (jsx-text-only) on `app/`, `src/features/`, `src/ui/` for DSG-04
- `.dependency-cruiser.cjs`: CI-level transitive engine-purity rule (`reachable: true`) plus a `no-circular` rule
- `src/engine/guards/assertNever.ts`: the engine's first real, 100%-covered module
- `jest.config.js` + `jest.setup.ts`: jest-expo preset, dynamic D-21 coverage thresholds (95% on `src/engine/`, 100% on `money/decide/payoff/split` once they have source), AsyncStorage mock, Reanimated 4 `setUpTests()`
- `scripts/verify-gates.mjs`: injects 5 real violations (direct impure import, React import, transitive impure import, uncovered 100%-folder branch, unreasoned ignore comment) and proves every gate actually fails, cleaning up unconditionally
- `scripts/check-coverage-ignores.mjs`: fails on any istanbul/c8 ignore comment in a 100% engine folder without a `-- reason: ...` of 10+ characters
- `src/config/env.ts` + `.env.example`: the one typed env reader (`readClientEnv`/`getEnv`/`EnvError`), validating `EXPO_PUBLIC_APP_ENV`, requiring the three core client keys, enforcing the EU PostHog host (D-23), and requiring `https://` on the Supabase URL except for a development-only loopback/emulator exception — all 11 `EXPO_PUBLIC_` keys documented with no real values

## Task Commits

1. **Task 1: ESLint flat config + dependency-cruiser + first engine module** — `2202abe` (feat)
2. **Task 2: Jest coverage gate + gate self-test** — `533ea78` (feat)
3. **Task 3: Typed env module + .env.example** — TDD, two commits:
   - RED: `2f18cf4` (test) — confirmed failing (`Cannot find module '../env'`) before implementation
   - GREEN: `e724add` (feat) — 19/19 tests pass

**Plan metadata:** this commit (docs: complete plan) — created alongside this SUMMARY

## Files Created/Modified
- `eslint.config.js` — flat config: expo config + boundaries + no-restricted-imports + i18next, with ignores for build artifacts, config files, and the untouched prototype reference files
- `.dependency-cruiser.cjs` — `engine-only-internal-src`, `engine-no-reach-impure` (transitive, `reachable: true`), `no-circular`
- `src/engine/guards/assertNever.ts` / `__tests__/assertNever.test.ts` — exhaustive-switch helper, 100% covered
- `jest.config.js` — dynamic `coverageThreshold`, `jest-expo` preset, worklets jest resolver, `EXPO_PUBLIC_USE_RN_FETCH=1` test-env-only workaround
- `jest.setup.ts` — AsyncStorage mock, Reanimated `setUpTests()`
- `scripts/verify-gates.mjs` — 5-probe gate self-test with guaranteed cleanup
- `scripts/check-coverage-ignores.mjs` — D-21 ignore-reason enforcement
- `.env.example` — 11 `EXPO_PUBLIC_` keys + build-time + tooling-only keys, all documented, no values
- `src/config/env.ts` / `__tests__/env.test.ts` — typed env reader, 19 tests
- `package.json` — new scripts (`lint`, `typecheck`, `depcruise`, `test`, `test:coverage`, `verify:gates`, `check:ignores`); `eslint` pinned to `9.39.5`; `@react-native/jest-preset@0.86.3` added
- `tsconfig.json` — `compilerOptions.types: ["jest"]` added

## Decisions Made
- Downgraded `eslint` from `^10.11.0` to exact `9.39.5` — see Deviations
- Excluded the repo-root prototype reference files from lint scope — they predate the Expo app and are explicitly out of scope per 00-02-SUMMARY.md
- `posthogHost` defaults to the EU host rather than requiring it be set, since no plan before 00-13 populates `EXPO_PUBLIC_POSTHOG_HOST` — D-23 is enforced the moment a value is present and wrong, not before the key exists
- Used the v7 `boundaries/dependencies` entity-selector policy shape (`{ from: { element: { type } }, disallow: [{ to: { element: { types } } }] }`) rather than the plan's v1-style `boundaries/element-types` example, confirmed against the installed `eslint-plugin-boundaries@7.2.0`'s own JSON schema

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint 10 crashes under eslint-config-expo's transitive eslint-plugin-react dependency**
- **Found during:** Task 1, first `npm run lint` run
- **Issue:** `eslint-plugin-react@7.37.5` (the latest release, pulled in transitively by `eslint-config-expo`) only declares ESLint peer support through `^9.7`. Under the pinned `eslint@^10.11.0` from 00-02, it crashed on every file with `TypeError: contextOrFilename.getFilename is not a function` — a real incompatibility with ESLint 10's flat-config linter API, not a config mistake
- **Fix:** Pinned `eslint` to exact `9.39.5` (the latest 9.x release) via `npm install eslint@9.39.5 --save-exact --save-dev --legacy-peer-deps`. No compatible `eslint-plugin-react` exists yet for ESLint 10 as of 2026-09-22; revisit when one ships
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm run lint` exits 0 with no errors
- **Committed in:** `2202abe`

**2. [Rule 3 - Blocking] Prototype reference files at repo root crashed/failed lint**
- **Found during:** Task 1, after fixing deviation 1
- **Issue:** `ios-frame.jsx`, `support.js`, `doc-page.js`, `screens/**` — pre-existing design-prototype files left untouched by 00-02 — are not part of the Expo app but were being linted anyway, producing 40+ pre-existing errors (`no-var`, deprecated React APIs, etc.) unrelated to this plan's scope
- **Fix:** Added these paths to `eslint.config.js`'s `ignores` array
- **Files modified:** eslint.config.js
- **Verification:** `npm run lint` exits 0
- **Committed in:** `2202abe`

**3. [Rule 1 - Bug] boundaries/dependencies policy used the wrong (v1/legacy) selector shape**
- **Found during:** Task 1, `npm run lint` warnings
- **Issue:** The plan's `boundaries/element-types` example predates `eslint-plugin-boundaries` v7, which renamed the rule to `boundaries/dependencies` and requires policies to wrap selectors in `{ element: { type } }` rather than a bare `{ type }`. Running with the old shape produced plugin warnings and (per the plugin's own migration-guide links) would not enforce correctly
- **Fix:** Rewrote the policy using the current schema (verified against the installed package's own JSON schema and TypeScript types), confirmed via a live probe that it correctly fails on an `engine -> services` import
- **Files modified:** eslint.config.js
- **Verification:** `npm run lint` produces zero plugin warnings; the manual probe and `scripts/verify-gates.mjs` both confirm the rule fires
- **Committed in:** `2202abe`

**4. [Rule 1 - Bug] TypeScript 6.0.3 did not auto-include @types/jest globals**
- **Found during:** Task 1, `npx tsc --noEmit` after adding the first test file
- **Issue:** `describe`/`it`/`expect` were unresolved even though `@types/jest` is installed and `tsconfig.json` sets no `types` array (which should auto-include every `@types/*` package)
- **Fix:** Added `"types": ["jest"]` to `tsconfig.json`'s `compilerOptions`
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** `2202abe`

**5. [Rule 3 - Blocking] jest-expo's `@react-native/jest-preset` peer dependency was not installed**
- **Found during:** Task 2, first `npm run test:coverage` run
- **Issue:** `jest-expo@57.0.5`'s own preset requires `@react-native/jest-preset@^0.86.3` and its documented fallback to `react-native/jest-preset.js` does not actually trigger (the try/catch's `MODULE_NOT_FOUND` check does not match in this dependency graph), so jest-expo failed to load entirely
- **Fix:** Installed `@react-native/jest-preset@0.86.3` (exact, matching the project's pinned `react-native@0.86.3`) as a devDependency
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx jest` loads the preset without error
- **Committed in:** `533ea78`

**6. [Rule 3 - Blocking] expo's lazy `global.fetch` getter crashes jest-expo's native-module auto-mocker**
- **Found during:** Task 2, `npm run test:coverage` after fixing deviation 5
- **Issue:** `expo/src/winter/runtime.native.ts` installs `global.fetch` as a lazy getter backed by a native-module lookup. Something in the jest-expo bootstrap (reproduces with an empty `jest.setup.ts`, so independent of anything this plan adds) eagerly reads that getter, which triggers jest-expo's `attemptLookup()` native-module auto-mocker; that function walks up from a stack-trace-derived file path looking for the nearest `package.json`, the walk never finds one for `ExpoFetchModule`, and `path.join(null, ...)` throws
- **Fix:** Set `process.env.EXPO_PUBLIC_USE_RN_FETCH = '1'` at the top of `jest.config.js` (test environment only — has no effect on the shipped app, which never sets this var), which opts expo's runtime into using React Native's own fetch polyfill instead of the broken code path
- **Files modified:** jest.config.js
- **Verification:** `npm run test:coverage` passes; confirmed the same crash reproduces with an empty `jest.setup.ts`, ruling out this plan's own mocks as the cause
- **Committed in:** `533ea78`

**7. [Rule 3 - Blocking] Requiring react-native-reanimated in Jest tried to load the real native worklets module**
- **Found during:** Task 2, `npm run test:coverage` after fixing deviation 6
- **Issue:** `require('react-native-reanimated').setUpTests()` in `jest.setup.ts` transitively requires `react-native-worklets`, whose `.native.js` entry point tries to initialize the real native module and throws (`Cannot read properties of undefined (reading 'loadUnpackers')`)
- **Fix:** Added `resolver: 'react-native-worklets/jest/resolver'` to `jest.config.js` — a resolver the `react-native-worklets` package itself ships specifically to strip `.native.js` resolution for its own files under Jest
- **Files modified:** jest.config.js
- **Verification:** `npm run test:coverage` passes with `setUpTests()` active
- **Committed in:** `533ea78`

---

**Total deviations:** 7 auto-fixed (5 blocking/Rule 3, 2 bug/Rule 1)
**Impact on plan:** All fixes were required to get the gates actually running against the real, currently-published dependency graph (not the graph as it existed when the plan was written, or as documented in library READMEs that assume a simpler setup). No scope creep beyond the plan's own file list, except the `eslint` downgrade and the two added devDependencies (`@react-native/jest-preset`), both of which are corrections to 00-02's dependency set rather than new features.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None — no external service configuration required. This plan only touches local tooling, config, and the env-reading module; it validates the *shape* of environment variables but does not require any real secret to be set to pass its own tests or gates.

## Next Phase Readiness
- `npm run lint && npm run typecheck && npm run depcruise && npm run test:coverage && npm run verify:gates` all pass on a clean tree
- The engine-purity gate is proven (not just configured) to fail on direct and transitive violations — any later plan adding real code to `src/engine/` is protected from day one
- The coverage gate will automatically start enforcing 100% on `src/engine/money/`, `src/engine/decide/`, `src/engine/payoff/`, `src/engine/split/` the moment those folders gain real source files, with zero config changes needed in Phase 1/4
- `src/config/env.ts` is ready for every later service (Supabase client, Google/Apple sign-in, PostHog) to read config through — no plan after this one should touch `process.env.EXPO_PUBLIC_*` directly
- `.env.example` documents `FX_SYNC_SECRET`, `EAS_PROJECT_ID`, and other keys that later plans (00-09, 00-14, 00-15) will populate — no action needed now
- Nothing blocks 00-06 onward

## Known Stubs
None — every file this plan created is either fully implemented and tested (`assertNever.ts`, `env.ts`) or is gate/tooling config with no runtime behaviour of its own.

## Self-Check: PASSED

All files listed under "Files Created/Modified" verified present on disk:
FOUND eslint.config.js, .dependency-cruiser.cjs, jest.config.js, jest.setup.ts, scripts/verify-gates.mjs, scripts/check-coverage-ignores.mjs, src/engine/guards/assertNever.ts, src/engine/guards/__tests__/assertNever.test.ts, .env.example, src/config/env.ts, src/config/__tests__/env.test.ts, package.json, tsconfig.json.
Commits `2202abe`, `533ea78`, `2f18cf4`, `e724add` all verified present in `git log --oneline`.

---
*Phase: 00-foundation*
*Completed: 2026-09-22*
