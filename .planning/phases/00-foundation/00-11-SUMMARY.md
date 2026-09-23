---
phase: 00-foundation
plan: 11
subsystem: ui
tags: [design-tokens, theme, react-context, reanimated, reduce-motion, safe-area, jest, testing-library]

# Dependency graph
requires:
  - phase: 00-foundation (plan 05)
    provides: eslint-plugin-boundaries + dependency-cruiser engine-purity gates, jest coverage gate, @/* alias
provides:
  - "Complete BUILD-PROMPT.md §2 design-token module (src/theme/): palette, category COL/TINT maps, member colours, shadow approximations, 4 accents, 4 font pairings with exact @expo-google-fonts export names, type scale + textRole() builder, radii/spacing, useScreenInsets()"
  - "ThemeProvider with live accent/font-pairing switching (no reload, no remount), fincwin:theme local cache hydrated on mount (D-14), applyRemote() for the future profile-row sync (00-18), reset() for post-sign-out"
  - "useMotion()/useReduceMotion() honouring AccessibilityInfo.isReduceMotionEnabled() live via the reduceMotionChanged event (FND-07)"
  - "src/ui/Screen.tsx: safe-area-aware screen container deriving top padding from insets.top + space.headerExtra, never a hardcoded value (DSG-03)"
  - "DSG-02 automated enforcement: noRawColours.test.ts scans src/ and app/ for hex/rgb literals outside the token files and the D-12 brand exception folder, plus an allow-list pin on every hex actually used in tokens.ts/accents.ts"
  - "docs/design/token-exceptions.md recording the D-12 Apple/Google brand-mark exception"
affects: [00-13, 00-17, 00-18, any-plan-building-a-screen]

# Tech tracking
tech-stack:
  added:
    - "expo-asset ~57.0.18 (expo-font's FontLoader requires it at runtime; not previously declared)"
    - "test-renderer ^1.3.0 (devDependency — @testing-library/react-native@14.0.1's actual peer, a React-19-compatible replacement for the deprecated react-test-renderer)"
    - "@types/node ^26.6.2 (devDependency, declared explicitly; was present transitively)"
  patterns:
    - "Token exception enforcement: any new raw colour needs edits in two places (the token file and noRawColours.test.ts's ALLOWED_HEXES set), making DSG-02 violations a deliberate, reviewable act rather than an accident"
    - "Theme hydration pattern: ThemeProvider reads the local cache once on mount and only starts persisting after ready flips true, so cold-boot hydration never re-writes what it just read"
    - "@testing-library/react-native@14.x's render()/renderHook()/act() are all async in this project — every call site awaits them"

key-files:
  created:
    - src/theme/tokens.ts
    - src/theme/accents.ts
    - src/theme/fonts.ts
    - src/theme/typography.ts
    - src/theme/layout.ts
    - src/theme/themeCache.ts
    - src/theme/motion.ts
    - src/theme/ThemeProvider.tsx
    - src/theme/index.ts
    - src/ui/Screen.tsx
    - src/theme/__tests__/themeSwitch.test.tsx
    - src/theme/__tests__/reducedMotion.test.tsx
    - src/theme/__tests__/noRawColours.test.ts
    - src/theme/__tests__/screenInsets.test.tsx
    - docs/design/token-exceptions.md
  modified:
    - app/index.tsx (boot screen reads colors.canvas/colors.ink instead of hardcoded hex)
    - package.json / package-lock.json (expo-asset, test-renderer, @types/node)
    - tsconfig.json (compilerOptions.types: ["jest", "node"])

key-decisions:
  - "Space Grotesk and IBM Plex Sans ship no 800-weight face; FONT_PAIRINGS maps weight 800 to each pairing's heaviest available face (700), documented inline in fonts.ts"
  - "All four font pairings' faces load at boot (Claude's Discretion per 00-CONTEXT.md) via one useFonts() call in useThemeFonts(), so a live switch has no async gap and no reload"
  - "ThemeProvider persists accent/pairing via a useEffect gated on ready, rather than inside each setter, so cache writes and hydration reads can never race on cold boot"
  - "RN shadow* props support only one shadow layer; tokens.ts's card/fab shadows are single-layer approximations of BUILD-PROMPT §2's two-layer CSS box-shadows, each with an Android elevation fallback"

patterns-established:
  - "Pattern: raw-colour drift is caught by a filesystem-scanning Jest test (noRawColours.test.ts), not just code review — the same technique any future 'no X outside Y' constraint in this codebase can reuse"

requirements-completed: [FND-06, FND-07, DSG-02, DSG-03]

# Metrics
duration: ~35min
completed: 2026-09-23
---

# Phase 00 Plan 11: Design Token Theme System Summary

**Live-switching design-token theme (§2 palette, 4 accents, 4 font pairings, type scale, radii/shadows), a reduce-motion-aware motion hook, a safe-area Screen container, and an automated DSG-02 raw-colour guard test.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-23
- **Tasks:** 3
- **Files modified:** 18 tracked paths (15 created, 3 modified)

## Accomplishments
- `src/theme/tokens.ts`: the full BUILD-PROMPT §2 palette (28 semantic colour tokens), `categoryColor`/`categoryTint` (15 categories each, copied verbatim from `Component.COL`/`Component.TINT`), `memberColors`/`memberColorNames`, and single-layer RN shadow approximations of the two-layer CSS card/fab shadows
- `src/theme/accents.ts` + `src/theme/fonts.ts`: the 4 selectable accents and 4 font pairings, keyed to match the `profiles.accent`/`profiles.font_pairing` check constraints from `supabase/migrations/20260922000100_household_of_one.sql`; `useThemeFonts()` loads every face of all four pairings at boot for an instant, reload-free switch
- `src/theme/typography.ts` + `src/theme/layout.ts`: the type scale, `textRole()` role builder, radii, exact prototype spacing values, and `useScreenInsets()` deriving the header offset from `insets.top + space.headerExtra`
- `src/theme/ThemeProvider.tsx` + `src/theme/themeCache.ts`: live accent/font-pairing switching via context (proven with a mount-count assertion that the consumer never remounts), hydration from the `fincwin:theme` AsyncStorage cache with fallback to green/bold on corrupt JSON or unknown enum values, `applyRemote()` for the future profile-row sync, `reset()` for post-sign-out
- `src/theme/motion.ts`: `useReduceMotion()`/`useMotion()` reading `AccessibilityInfo.isReduceMotionEnabled()` and the live `reduceMotionChanged` event, collapsing JS-computed durations to 0
- `src/ui/Screen.tsx`: safe-area-aware container, `paddingTop` always derived from insets, never hardcoded
- `src/theme/__tests__/noRawColours.test.ts`: recursive scan of `src/` and `app/` failing on any hex/rgb literal outside `tokens.ts`, `accents.ts` or `src/features/auth/brand/`, plus an allow-list pin on every hex actually used in the two token files
- `docs/design/token-exceptions.md`: records the D-12 Apple/Google brand-mark exception

## Task Commits

1. **Task 1: Static tokens (palette, accents, fonts, typography, layout)** — `613dc9c` (feat)
2. **Task 2: ThemeProvider, motion, Screen** — TDD, two commits:
   - Tests: `f421353` (test)
   - Implementation: `cc9bc21` (feat)
3. **Task 3: DSG-02 raw-colour guard test + D-12 exception record** — `d2fa3ef` (feat)

## Files Created/Modified
- `src/theme/tokens.ts` — palette, category maps, member colours, shadows
- `src/theme/accents.ts` — 4 selectable accents
- `src/theme/fonts.ts` — 4 font pairings + `useThemeFonts()`
- `src/theme/typography.ts` — type scale + `textRole()`
- `src/theme/layout.ts` — radii, spacing, `useScreenInsets()`
- `src/theme/themeCache.ts` — `fincwin:theme` AsyncStorage cache, validated
- `src/theme/motion.ts` — `useReduceMotion()` / `useMotion()`
- `src/theme/ThemeProvider.tsx` — live theme context
- `src/theme/index.ts` — barrel re-export
- `src/ui/Screen.tsx` — safe-area screen container
- `src/theme/__tests__/*.test.tsx` / `*.test.ts` — 4 test files, 16 tests
- `docs/design/token-exceptions.md` — D-12 exception record
- `app/index.tsx` — reads theme tokens instead of hardcoded hex
- `package.json` / `package-lock.json` — `expo-asset`, `test-renderer`, `@types/node`
- `tsconfig.json` — `compilerOptions.types` includes `"node"`

## Decisions Made
- Font pairing weight-800 fallback (Space Grotesk, IBM Plex Sans → 700) — see key-decisions above
- All four font pairings load at boot, not lazily — Claude's Discretion per 00-CONTEXT.md, documented in `fonts.ts`
- Cache-write effect gated on `ready` to prevent a hydration/persist race
- Single-layer RN shadow approximation of the two-layer CSS shadows, documented in `tokens.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@testing-library/react-native@14.0.1` requires the `test-renderer` npm package, not installed**
- **Found during:** Task 2, first `npx jest` run against the new theme tests
- **Issue:** This version's `render.js`/`render-hook.js` literally `require('test-renderer')` — a real npm package (`test-renderer`, a React-19-compatible replacement for the deprecated `react-test-renderer`), not a typo for `react-test-renderer`. It was not declared as a project dependency, so every test importing `render`/`renderHook` failed to resolve the module
- **Fix:** Installed `test-renderer@^1.3.0` as a devDependency. Also discovered `render()`, `renderHook()` and `act()` are all `async` in this version (they internally `await` React's act loop) — every call site in the three new test files awaits them
- **Files modified:** package.json, package-lock.json, all three theme test files
- **Verification:** `npx jest src/theme` passes
- **Committed in:** `f421353` (test commit)

**2. [Rule 3 - Blocking] `expo-font`'s FontLoader requires `expo-asset` at runtime, not installed**
- **Found during:** Task 2, same test run
- **Issue:** `expo-font/build/FontLoader.js` unconditionally requires `expo-asset`, which is not declared as an `expo-font` dependency and was not present in this project's `package.json`
- **Fix:** `npx expo install expo-asset` (added `~57.0.18`, SDK-matched)
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx jest src/theme/__tests__/themeSwitch.test.tsx` (which imports `ThemeProvider` → `fonts.ts` → `expo-font`) passes
- **Committed in:** `f421353` (test commit)

**3. [Rule 1 - Bug] `react-hooks/refs` lint error: ref written during render**
- **Found during:** Task 2, `npm run lint` after the tests passed
- **Issue:** The test's `Consumer` component wrote `themeRef.current = theme` directly in the render body, which the project's `eslint-plugin-react-hooks` flags as unsafe (refs must not be mutated during render)
- **Fix:** Moved the ref write into a `useEffect` that runs after every render
- **Files modified:** src/theme/__tests__/themeSwitch.test.tsx
- **Verification:** `npm run lint` exits 0; all 16 theme tests still pass
- **Committed in:** `f421353` (test commit)

**4. [Rule 3 - Blocking] `tsconfig.json`'s explicit `types: ["jest"]` excludes Node globals needed by the raw-colour scan**
- **Found during:** Task 3, `npx tsc --noEmit` after writing `noRawColours.test.ts`
- **Issue:** The DSG-02 guard test needs `fs`, `path` and `__dirname` to walk the filesystem. `@types/node` was present in `node_modules` transitively but tsconfig's explicit `types` array (set in 00-05 to scope Jest globals) excluded its ambient declarations
- **Fix:** Added `"node"` to `compilerOptions.types`, and declared `@types/node` as an explicit devDependency (`^26.6.2`, matching the already-resolved transitive version) rather than relying on an undeclared transitive install
- **Files modified:** tsconfig.json, package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `d2fa3ef`

---

**Total deviations:** 4 auto-fixed (3 blocking/Rule 3, 1 bug/Rule 1)
**Impact on plan:** All four were required to get the plan's own specified tests actually running against the real, currently-published dependency graph. No scope creep beyond the plan's own file list, except the three dependency additions and the tsconfig `types` edit, all of which are corrections to the existing dependency set rather than new features.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `src/theme` is the one import surface every later screen uses for colours, fonts, type scale, spacing and motion — no plan after this one should hardcode a colour, font family, or a `68`/`874`-style layout constant
- `useTheme()` is ready for 00-13 (You screen: accent/font-pairing switchers) and 00-18 (profile-row sync via `applyRemote()`)
- `src/ui/Screen.tsx` is ready for every screen built from 00-17 onward
- `noRawColours.test.ts` will catch any future DSG-02 regression automatically in CI
- `npm run lint && npm run typecheck && npm run depcruise && npm run test:coverage && npm run verify:gates` all pass on a clean tree
- Nothing blocks 00-12 onward

## Known Stubs
None — every file this plan created is fully implemented and tested. `typography.ts`'s `textRole()` and `fonts.ts`'s `useThemeFonts()` have no dedicated unit test (no plan behaviour spec required one and there is no coverage gate on `src/theme` yet), but both are exercised indirectly through `ThemeProvider`/`Screen` tests and are simple, deterministic lookups with no branching logic of their own beyond the documented weight-800 fallback.

## Self-Check: PASSED

All files listed under "Files Created/Modified" verified present on disk:
FOUND src/theme/tokens.ts, src/theme/accents.ts, src/theme/fonts.ts, src/theme/typography.ts, src/theme/layout.ts, src/theme/themeCache.ts, src/theme/motion.ts, src/theme/ThemeProvider.tsx, src/theme/index.ts, src/ui/Screen.tsx, src/theme/__tests__/themeSwitch.test.tsx, src/theme/__tests__/reducedMotion.test.tsx, src/theme/__tests__/noRawColours.test.ts, src/theme/__tests__/screenInsets.test.tsx, docs/design/token-exceptions.md, app/index.tsx, tsconfig.json.
Commits `613dc9c`, `f421353`, `cc9bc21`, `d2fa3ef` all verified present in `git log --oneline`.

---
*Phase: 00-foundation*
*Completed: 2026-09-23*
