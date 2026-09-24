---
phase: 01-money-core
plan: 03
subsystem: engine
tags: [money, intl, i18n, parsing, formatting, jest, fast-check, typescript]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "plan 01-01's engine/money core (MinorUnits/Money/CurrencyCode brands, currencyExponent, MAX_ABS_AMOUNT_MINOR)"
provides:
  - "src/engine/money/parseAmount.ts: region-aware, float-free amount input parsing (parseAmount, parseDecimalString, localeSeparators) -- MON-02, D-24"
  - "src/engine/money/formatAmount.ts: D-23 locale-aware amount display formatting (formatAmount, toDecimalString) -- DSG-06, D-22, D-23"
  - "src/engine/money/formatDate.ts: timezone-safe local-date formatting (formatLocalDate) -- DSG-06, MON-14"
  - "src/engine/money/index.ts barrel extended with all three modules' exports"
affects: [02-record (Record's amount field calls parseAmount; every converted figure renders through formatAmount), 04-decide]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Region-aware string parsing via Intl.NumberFormat.formatToParts to derive locale decimal/group characters, never hardcoded '.'/',' -- character-by-character scan, never parseFloat/Number()/parseInt on anything but a proven pure-digit string"
    - "Digit normalization table (ASCII + Arabic-Indic U+0660-0669 + Extended Arabic-Indic U+06F0-06F9) via charCodeAt, avoiding an unreachable 'undefined code point' branch that codePointAt would have introduced"
    - "toDecimalString: pure string-maths MinorUnits-to-decimal-string conversion (no division), shared by both parseAmount's round-trip test and formatAmount's display path"
    - "formatAmount feeds a decimal STRING (not a float) into Intl.NumberFormat.format(), relying on Intl.NumberFormat v3 string-input support verified present in this project's Jest/Node environment"
    - "currencyDisplay: 'symbol' (not 'narrowSymbol') for D-23's locale-relative ambiguous-symbol disambiguation (CA$ in en-US, US$ in en-CA)"
    - "formatLocalDate pins timeZone: 'UTC' and builds every Date via Date.UTC(y, m-1, d), never new Date(string), so no device time zone can shift a stored calendar day (MON-14)"

key-files:
  created:
    - src/engine/money/parseAmount.ts
    - src/engine/money/formatAmount.ts
    - src/engine/money/formatDate.ts
    - src/engine/money/__tests__/parseAmount.test.ts
    - src/engine/money/__tests__/formatAmount.test.ts
    - src/engine/money/__tests__/formatDate.test.ts
  modified:
    - src/engine/money/index.ts

key-decisions:
  - "The docstring in parseAmount.ts deliberately avoids the literal substring 'parseFloat' (paraphrased as 'JavaScript's float-parsing built-ins') so the plan's own grep-based acceptance check (grep -c parseFloat returns 0) is not defeated by an explanatory comment mentioning the forbidden function by name"
  - "normalizeDigit uses ch.charCodeAt(0) instead of ch.codePointAt(0): codePointAt's return type is number|undefined, which would force an 'undefined code point' branch that is structurally unreachable (ch always comes from iterating a non-empty string one character at a time) and could never be exercised for 100% branch coverage without a contrived test; charCodeAt returns a plain number for any valid single-character index, eliminating the dead branch entirely"
  - "parseDecimalString's return-value ternary was simplified from `whole || '0'` on both sides to a plain `whole` on the fraction-empty side, since the both-whole-and-fraction-empty case already returns 'invalid' earlier in the function -- the `|| '0'` fallback on that side was unreachable dead code that would have blocked 100% branch coverage"
  - "formatAmount's custom-currency branch formats the ABSOLUTE VALUE's decimal string through Intl (which has no notion of an unrecognized currency's own sign placement), then manually prepends U+2212 to the whole result for a negative amount -- this matches the plan's expected 'U+2212G2,500' output (minus before the symbol), which differs from the non-custom branch's approach of letting Intl place a signed decimal string's minus wherever the locale convention dictates"

requirements-completed: [MON-02, DSG-06]

# Metrics
duration: 100min
completed: 2026-09-24
---

# Phase 1 Plan 3: Region-Aware Amount Parsing and Locale-Aware Formatting Summary

**Float-free, region-aware amount input parsing (`parseAmount`/`parseDecimalString`) and D-23 locale-aware amount/date display formatting (`formatAmount`/`formatLocalDate`), all pure `engine/money/` functions at 100% branch coverage with a fast-check round-trip property spanning seven locales and three currency exponents.**

## Performance

- **Duration:** ~100 min (includes iterative coverage-gap closing across two TDD sub-cycles)
- **Started:** 2026-09-24T~17:15Z (worktree setup, `npm ci`, context reading)
- **Completed:** 2026-09-24T17:56Z
- **Tasks:** 2 (each ran a RED then GREEN TDD sub-cycle)
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `parseAmount`/`parseDecimalString`/`localeSeparators` (MON-02, D-24): strict, region-aware, float-free string-to-`MinorUnits` conversion. Handles en-US/de-DE/fr-FR grouping (including narrow-no-break-space and plain-space grouping variants), Arabic-Indic and Extended Arabic-Indic (Persian/Urdu) digit normalization, JPY's zero-fraction and KWD's three-fraction exponent boundaries, and rejects (never rounds) a fraction longer than the currency's exponent allows
- `formatAmount`/`toDecimalString` (DSG-06, D-22, D-23): D-23's full display rule set -- symbol not code, true minus U+2212 never a hyphen, whole amounts drop decimals unless Show cents is on, JPY never shows decimals, KWD shows three whenever decimals show, `currencyDisplay: 'symbol'` for locale-relative ambiguous-symbol disambiguation (CA$ in en-US, US$ in en-CA), and a manual symbol-prefixing path for custom currencies Intl doesn't recognize
- `formatLocalDate` (DSG-06, MON-14): renders a stored `YYYY-MM-DD` local date per locale/style with `timeZone: 'UTC'` pinned throughout, so no device time zone can ever shift the displayed day; rejects malformed strings and calendar-impossible dates (month 13, February 30th) with `RangeError`
- `src/engine/money/index.ts` barrel extended with all three modules, per the plan's `<interfaces>` contract
- 100% branch/function/line/statement coverage across every file in `src/engine/money/` (verified via `npx jest src/engine/money --coverage --ci`, 165 tests total across the whole `engine/money` directory, 8 suites)
- `npm run depcruise`, `npm run lint` and `npm run typecheck` all exit 0 with no new errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Strict region-aware parsing (parseDecimalString, parseAmount)** - `7ec6e4d` (test, RED) then `5ed3e62` (feat, GREEN)
2. **Task 2: formatAmount and formatLocalDate (D-22, D-23), barrel update** - `1fba5c7` (test, RED) then `91d2fee` (feat, GREEN)

_Both tasks are TDD: each has a RED commit (failing tests against the not-yet-implemented module) followed by a GREEN commit (implementation makes them pass)._

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete (per this plan's parallel-execution instructions).

## Files Created/Modified
- `src/engine/money/parseAmount.ts` - `localeSeparators`, `parseDecimalString`, `parseAmount`: region-aware, float-free string-to-`MinorUnits` parsing
- `src/engine/money/formatAmount.ts` - `toDecimalString`, `formatAmount`: D-23 locale-aware display formatting
- `src/engine/money/formatDate.ts` - `formatLocalDate`: timezone-safe local-date rendering
- `src/engine/money/index.ts` - barrel now re-exports `parseAmount`, `formatAmount`, `formatDate` alongside plan 01-01's exports
- `src/engine/money/__tests__/parseAmount.test.ts` - 36 tests: locale separator derivation (including an Intl-mocked fallback-branch test), grouping variants, Arabic-Indic/Extended Arabic-Indic digits, rejection cases, `MAX_ABS_AMOUNT_MINOR` boundary, exponent-validation `RangeError`s, and a fast-check round-trip property (200 runs × 7 locales × 3 exponents)
- `src/engine/money/__tests__/formatAmount.test.ts` - 14 tests: `toDecimalString` unit cases, D-23 show-cents rules, true-minus rendering, de-DE/ja-JP/ar-KW cross-checked directly against Intl's own currency-format output (not hand-typed literals), ambiguous-dollar disambiguation, custom-currency symbol prefixing (positive and negative)
- `src/engine/money/__tests__/formatDate.test.ts` - 11 tests: locale/style rendering, DST-boundary day-shift protection (spring-forward and fall-back dates), and `RangeError` rejection of malformed/impossible calendar dates

## Decisions Made
- See `key-decisions` in frontmatter for the four implementation-level decisions (parseFloat-mention avoidance in docstrings, `charCodeAt` over `codePointAt` to eliminate a dead branch, ternary simplification for the same reason, and the custom-currency sign-placement approach). All are correctness-preserving refinements made while closing 100%-coverage gaps during Task 1 and Task 2's GREEN phases -- no scope change to any deliverable.

## Deviations from Plan

None in scope or design -- both modules match the plan's `<interfaces>` and `<action>` blocks. The four items above are implementation-level refinements surfaced by the plan's own 100%-branch-coverage requirement, not deviations from what was asked for.

### Auto-fixed Issues

**1. [Rule 1 - Bug] `parseAmount.ts` docstring accidentally defeated its own acceptance check**
- **Found during:** Task 1 GREEN phase, running the acceptance-criteria grep checks after the first passing test run
- **Issue:** The module's explanatory docstring used the literal word "parseFloat" to describe what the module deliberately avoids calling. The plan's acceptance criterion `grep -c "parseFloat" src/engine/money/parseAmount.ts` returns 0 failed, because grep matches the substring regardless of code-vs-comment context.
- **Fix:** Reworded the docstring to describe the same fact ("neither of JavaScript's float-parsing built-ins... are ever called") without using the literal string "parseFloat".
- **Files modified:** `src/engine/money/parseAmount.ts`
- **Verification:** `grep -c "parseFloat" src/engine/money/parseAmount.ts` returns 0; full test suite re-run confirmed no behavior change (33/33 passing before and after)
- **Committed in:** `5ed3e62` (Task 1 GREEN commit; caught and fixed before the commit was made)

**2. [Rule 1 - Bug] Three coverage gaps closed on `parseAmount.ts` before it could be committed**
- **Found during:** Task 1 GREEN phase, first `--coverage` run showed 90% branch / 96.87% statement coverage against the plan's mandatory 100% threshold for `src/engine/money/`
- **Issue:** (a) `localeSeparators`'s `?? '.'`/`?? ','` fallback branches were never exercised by any real locale (every tested locale's `Intl.NumberFormat` always produces both a `decimal` and a `group` part token); (b) the Extended Arabic-Indic digit branch (U+06F0-U+06F9, Persian/Urdu) had no test exercising it; (c) `stripLeadingZeros`'s all-zeros branch (`stripped === '' ? '0' : ...`) had no test parsing a fully-zero amount
- **Fix:** Added a test that mocks `Intl.NumberFormat.prototype.formatToParts` to return no decimal/group part tokens, exercising the fallback branches directly; added a test parsing Extended Arabic-Indic digits (`۱۲.۵`); added a test parsing `'0.00'` to exercise the all-zeros stripping path. Also removed two genuinely-dead branches the coverage report surfaced (see Decisions Made: `charCodeAt` over `codePointAt`, and the ternary simplification), since a branch that cannot be reached through any public API path cannot be tested into coverage and must instead be designed out
- **Files modified:** `src/engine/money/parseAmount.ts`, `src/engine/money/__tests__/parseAmount.test.ts`
- **Verification:** `npx jest src/engine/money/__tests__/parseAmount.test.ts --coverage` reports 100% statements/branches/functions/lines on `parseAmount.ts`, 36/36 tests passing
- **Committed in:** `5ed3e62` (Task 1 GREEN commit; caught and fixed before the commit was made, so no separate fix commit was needed)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both caught and resolved before their respective task's GREEN commit -- no separate fix commits, no scope creep, no change to any deliverable's public API)
**Impact on plan:** Zero. Both issues were surfaced by the plan's own acceptance criteria and coverage gate, which is exactly what they exist to catch; fixing them before committing is the intended TDD/coverage-gate workflow, not a deviation from it.

## Issues Encountered

- **Known Windows worktree Jest bug (documented by plan 01-01, recurred here as expected):** `npx jest` reports "No tests found" when run from this worktree's dot-prefixed path (`.claude/worktrees/agent-abf58164f6d2b71cc`). Worked around exactly as 01-01's SUMMARY.md flagged for future agents: a disposable, never-committed `jest.worktree.config.js` at the worktree root that spreads the real `jest.config.js` and overrides only `testMatch` to `['**/*.test.ts?(x)']`. All verification in this plan ran through `npx jest -c jest.worktree.config.js ...`. The file was never staged, never committed, and `jest.config.js` itself was left completely untouched. It should be deleted from the worktree before this agent hands back (see Self-Check below for confirmation it was never part of any commit).
- No other issues. All acceptance criteria and the plan's `<verification>` block (`npx jest src/engine/money --coverage`, `npm run lint`, `npm run typecheck`, `npm run depcruise`) passed cleanly.

## User Setup Required

None - no external service configuration required. This plan is pure `engine/` TypeScript with no I/O, no new dependencies, and no schema or infrastructure changes.

## Next Phase Readiness

- `engine/money/`'s public API now includes `parseAmount`, `parseDecimalString`, `localeSeparators`, `formatAmount`, `toDecimalString` and `formatLocalDate`, all re-exported from `src/engine/money/index.ts` exactly matching this plan's `<interfaces>` contract, and stable for Phase 2 (Record)'s amount-input field and every money-displaying screen to build on.
- Phase 2's Record amount field can call `parseAmount(raw, { locale, exponent })` directly; every converted figure anywhere in the app should render through `formatAmount(money, { locale, showCents })` rather than any ad hoc formatting.
- Hermes note for the next on-device human-verify step (plan 01-16, per this plan's `<action>` block): Jest in this repo runs against Node's full ICU, which is a reasonable proxy for correctness but not identical to Hermes's bundled ICU data on-device -- spot-check `formatAmount`/`formatLocalDate` output for at least one right-to-left/non-Latin-digit locale (ar-KW) and one ambiguous-symbol locale (en-US CAD or en-CA USD) on the physical iPhone XR or Android emulator during that plan's verification.
- No blockers for downstream plans in this wave (01-04, 01-05, 01-07, 01-09) or later phases: this plan touched only `src/engine/money/*`, matching its declared `files_modified` scope exactly, with no overlap with the other wave-2 plans' files.

## Self-Check: PASSED

All 6 created files confirmed present on disk: `src/engine/money/{parseAmount,formatAmount,formatDate}.ts`, `src/engine/money/__tests__/{parseAmount,formatAmount,formatDate}.test.ts`. `src/engine/money/index.ts` confirmed modified with all three new barrel exports. All 4 task commit hashes (`7ec6e4d`, `5ed3e62`, `1fba5c7`, `91d2fee`) confirmed present in `git log --oneline`. The disposable `jest.worktree.config.js` and worktree-only `.npmrc` are confirmed untracked (`git status --short` shows only `??` for both, never staged into any commit).

---
*Phase: 01-money-core*
*Completed: 2026-09-24*
