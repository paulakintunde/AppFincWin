---
phase: 01-money-core
plan: 01

subsystem: engine
tags: [money, bigint, tanstack-query, jest, fast-check, typescript]

# Dependency graph
requires:
  - phase: 00-foundation
    provides: engine purity enforcement (dependency-cruiser + eslint-plugin-boundaries), jest.config.js auto-threshold wiring for src/engine/money
provides:
  - "engine/money core: branded MinorUnits/CurrencyCode/Money types, one half-up rounding function, EUR-routed BigInt currency conversion, ISO 4217 exponent table, integer arithmetic, one public barrel"
  - "supabase/tests/fixtures/money-conversion-cases.json, the canonical fixture plan 01-05's SQL mirror must reproduce exactly (D-16)"
  - "Phase 1 npm dependencies installed and pinned: @tanstack/react-query family, @react-native-community/netinfo, fast-check, @fast-check/jest, squawk-cli"
affects: [01-02, 01-03, 01-04, 01-05, 01-10, 01-12, 01-13, 04-decide]

# Tech tracking
tech-stack:
  added: ["@tanstack/react-query@5.103.2", "@tanstack/query-async-storage-persister@5.103.2", "@tanstack/react-query-persist-client@5.103.2", "@react-native-community/netinfo@12.0.1", "fast-check@4.10.2", "@fast-check/jest@2.3.0", "squawk-cli@2.66.0"]
  patterns: ["branded-integer money types with all arithmetic centralized through minorUnits()", "one shared JSON fixture consumed by both Jest and a future pgTAP mirror", "BigInt-only currency conversion, no parseFloat/Number() on rate strings"]

key-files:
  created:
    - src/engine/money/types.ts
    - src/engine/money/rounding.ts
    - src/engine/money/rates.ts
    - src/engine/money/currencyExponents.ts
    - src/engine/money/arithmetic.ts
    - src/engine/money/index.ts
    - src/engine/money/__tests__/types.test.ts
    - src/engine/money/__tests__/rounding.test.ts
    - src/engine/money/__tests__/rates.test.ts
    - src/engine/money/__tests__/currencyExponents.test.ts
    - src/engine/money/__tests__/arithmetic.test.ts
    - supabase/tests/fixtures/money-conversion-cases.json
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "formatRate has no sign handling: ScaledRate is always positive by construction (parseRate rejects <=0, crossRate/customPerEur only ever divide positive scaled values), so the negative branch documented in RESEARCH.md's draft was dead code and was removed rather than padded with a synthetic test"
  - "ISO_EXPONENT_EXCEPTIONS cross-checked against currency-codes@2.2.0 in a scratch npm project (not a runtime dependency): zero mismatches and zero missing entries against Frankfurter-servable currencies, resolving RESEARCH.md Assumption A4"

requirements-completed: [MON-01, MON-13]

# Metrics
duration: 55min
completed: 2026-09-24
---

# Phase 1 Plan 1: Money Core Foundation Summary

**Hand-rolled `engine/money/`: branded integer MinorUnits/Money types, one half-up-away-from-zero BigInt rounding function, EUR-routed currency conversion, the ISO 4217 exponent table, and integer arithmetic -- all at 100% branch coverage, with the canonical Jest/pgTAP-shared conversion fixture and Phase 1's npm dependencies installed.**

## Performance

- **Duration:** ~55 min (includes an extended investigation into a Windows-only Jest test-discovery bug; see Issues Encountered)
- **Started:** 2026-09-24T16:14:00Z (approx, per STATE.md session start)
- **Completed:** 2026-09-24T16:59:57Z
- **Tasks:** 3 (Task 2 and Task 3 each ran a RED then GREEN TDD sub-cycle)
- **Files modified:** 14 (12 created under src/engine/money + fixture, package.json/package-lock.json modified)

## Accomplishments
- Phase 1's runtime and dev dependencies installed and pinned exactly at the versions RESEARCH.md verified (TanStack Query 5.103.2 family, NetInfo 12.0.1 via `expo install`, fast-check 4.10.2, @fast-check/jest 2.3.0, squawk-cli 2.66.0); `currency-codes` deliberately NOT added as a runtime dependency
- The canonical `supabase/tests/fixtures/money-conversion-cases.json` fixture created verbatim from the plan, ready for plan 01-05's SQL mirror to consume
- `engine/money/` core built test-first (RED/GREEN per file group): branded `MinorUnits`/`CurrencyCode`/`Money`, `divideHalfUp` (the one rounding function, D-21), `ScaledRate`/`parseRate`/`formatRate`/`convertMinor`/`crossRate`/`customPerEur` (all BigInt, zero `parseFloat`), the ISO 4217 exponent exception table, and `add`/`subtract`/`negate`/`multiplyByInteger`/`sum`/`compare`/`isZero`
- 100% branch/function/line/statement coverage across every `engine/money/` source file (index.ts barrel has 0 coverable statements, which does not affect the aggregate threshold)
- `engine/money` verified to import nothing outside `src/engine` (`npm run depcruise` clean), and `npm run lint`/`npm run typecheck` both exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Phase 1 dependencies and write the shared fixture** - `1c26145` (feat)
2. **Task 2: Types, rounding, rates and exponents (TDD)** - `a6f0d83` (test, RED) then `9fc4bd6` (feat, GREEN)
3. **Task 3: Integer arithmetic and the engine/money barrel (TDD)** - `2063136` (test, RED) then `f34ac00` (feat, GREEN)

_TDD tasks each have a RED commit (failing tests against the not-yet-implemented API) followed by a GREEN commit (implementation makes them pass)._

## Files Created/Modified
- `package.json` / `package-lock.json` - Phase 1 dependencies added
- `supabase/tests/fixtures/money-conversion-cases.json` - canonical halfUp/convert/customPerEur/crossRate/exponents cases shared by Jest and the future pgTAP mirror
- `src/engine/money/types.ts` - `MinorUnits`/`CurrencyCode`/`Money` brands, `minorUnits`/`currencyCode`/`money` constructors, `MAX_ABS_AMOUNT_MINOR`
- `src/engine/money/rounding.ts` - `divideHalfUp`, the one rounding function (D-21)
- `src/engine/money/rates.ts` - `ScaledRate`, `parseRate`/`formatRate`, `convertMinor`/`crossRate`/`customPerEur`
- `src/engine/money/currencyExponents.ts` - `ISO_EXPONENT_EXCEPTIONS`, `currencyExponent`, `resolveExponent`
- `src/engine/money/arithmetic.ts` - `add`/`subtract`/`negate`/`multiplyByInteger`/`sum`/`compare`/`isZero`
- `src/engine/money/index.ts` - the one public barrel for `engine/money/`
- `src/engine/money/__tests__/*.test.ts` (5 files) - Jest + fast-check property tests for every module above

## Decisions Made
- `formatRate` was simplified to drop sign handling entirely once coverage revealed the negative branch was unreachable through any public construction path (`parseRate` rejects non-positive input; `crossRate`/`customPerEur` only ever divide positive scaled rates) -- this is a correctness-neutral simplification, not a scope change, since `ScaledRate` is a strictly-positive domain concept
- `match[1]` in `parseRate` uses a documented non-null assertion instead of a `?? ''` fallback, since `RATE_PATTERN`'s first capture group is mandatory whenever `RATE_PATTERN.exec()` succeeds -- TypeScript's `noUncheckedIndexedAccess` cannot know this statically, so the assertion is commented in place of an unreachable branch
- Cross-checked `ISO_EXPONENT_EXCEPTIONS` against `currency-codes@2.2.0`'s data in a scratch npm project outside the repo (per plan Task 2 instructions): zero mismatches, zero missing entries among Frankfurter-servable currencies -- RESEARCH.md's Assumption A4 is resolved, the table is accurate as written

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Local test verification required a workaround for a Windows-only Jest test-discovery bug**
- **Found during:** Task 2, first RED-phase verification run
- **Issue:** `npx jest src/engine/money` (and, when investigated further, `npx jest` project-wide) reported "No tests found" for every file in the repository, including the pre-existing, previously-passing `src/engine/guards/__tests__/assertNever.test.ts`. Root-caused via direct inspection of `jest-config`'s `normalize.js` and `jest-util`'s `globsToMatcher`/`replacePathSepForGlob`: `jest-config` escapes glob metacharacters in `rootDir` (via `escapeGlobCharacters`, which also escapes literal backslashes) before substituting it into `<rootDir>`-prefixed `testMatch` patterns, then converts remaining backslashes to forward slashes for glob matching -- except where a backslash is immediately followed by a glob metacharacter such as `.`, which it treats as an intentional escape sequence and leaves untouched. Because this worktree's absolute path is `C:\dev\fincwin\.claude\worktrees\agent-abe3d4e3e68eb77dd` (a directory segment, `.claude`, that starts with a dot), the backslash immediately before `.claude` triggers this exception on the *pattern* side (where it is correctly treated as an escape, collapsing to a literal `.`) but not on the *candidate file path* side (where the same function is applied to a raw absolute path and the leftover backslash is preserved as a literal character, since a path separator was never meant to be a glob escape there). The two transformations of a structurally-identical prefix diverge, so `testMatch` can never match any real file when Jest is invoked from anywhere under a dot-prefixed ancestor directory -- confirmed as a genuine upstream Jest/jest-util defect (present in the installed jest 29.7.0 / jest-util lines), not something introduced by this plan's changes, and not something that manifests in CI (which runs on ubuntu-latest with no such path).
- **Fix:** Verified the bug and the workaround via a disposable, uncommitted local Jest config (`jest.windows-worktree.config.js`, created only in the scratchpad and briefly in the worktree root, never staged or committed) that spreads the project's real `jest.config.js` unchanged and overrides only `testMatch` with a `<rootDir>`-agnostic pattern (`['**/*.test.ts?(x)']`), which sidesteps the broken rootDir-escaping path entirely. All verification in this plan (RED/GREEN test runs, coverage checks) was run through this override; the file was deleted before the final commit and **`jest.config.js` itself was left completely untouched**, per the plan's explicit `read_first` instruction not to edit it.
- **Files modified:** None in the repository (the workaround config never touched version control). Diagnostic instrumentation was temporarily added to `node_modules/jest-haste-map/build/crawlers/node.js` to trace the failure, then fully reverted from a backup before any further work; `node_modules/` is gitignored and was never part of any commit.
- **Verification:** `npx jest --config <override> src/engine/money --coverage` produces the expected PASS/coverage output; `git status --short` was confirmed clean of the workaround config and any diagnostic changes before every commit.
- **Committed in:** N/A -- no repository files changed by this deviation. Flagging it here because it materially affects how any future local (Windows) verification of this plan's tests must be run until the upstream Jest bug is fixed or this repository's GSD worktrees stop living under a dot-prefixed directory.

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only, zero repository footprint)
**Impact on plan:** No scope creep and no change to any deliverable. This is worth the orchestrator's attention: **any other worktree-based agent verifying tests on Windows will hit the identical "No tests found" failure** for the same structural reason (worktrees live under `.claude/worktrees/<agent-id>`). CI is unaffected (ubuntu-latest, no dot-prefixed ancestor path).

## Issues Encountered
- See Deviations above for the full root-cause trace of the Windows Jest test-discovery bug. No other issues.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `engine/money/`'s public API (types, rounding, rates, currencyExponents, arithmetic, all re-exported from `index.ts`) is complete, 100%-covered, and stable for plan 01-02 (schema) and later plans (01-03 through 01-13) to build on, exactly matching the interfaces block this plan's frontmatter committed to.
- `supabase/tests/fixtures/money-conversion-cases.json` is in place for plan 01-05's SQL mirror generation.
- Phase 1's TanStack Query / NetInfo / testing dependencies are installed; NetInfo is a native module, so **the next on-device run needs a fresh Expo dev client build** (not required for this plan's own Jest-only verification).
- **Flag for the orchestrator / next Windows-based executor:** the Jest test-discovery bug documented above will recur for any other worktree agent running `npx jest` (or any Jest CLI invocation) directly on Windows from inside `.claude/worktrees/*`. Until this is fixed upstream, add the same `testMatch`-override pattern to that agent's verification steps, or run verification from a non-dot-prefixed checkout.

## Self-Check: PASSED

All 13 created files confirmed present on disk (`src/engine/money/{types,rounding,rates,currencyExponents,arithmetic,index}.ts`, 5 `__tests__/*.test.ts` files, `supabase/tests/fixtures/money-conversion-cases.json`, this SUMMARY.md). All 5 task commit hashes (`1c26145`, `a6f0d83`, `9fc4bd6`, `2063136`, `f34ac00`) confirmed present in `git log`.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*
