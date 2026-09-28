---
phase: 02-record
plan: 04
subsystem: engine
tags: [typescript, jest, fast-check, statement-import, categorize, duplicates, recurring]

# Dependency graph
requires:
  - phase: 02-record (plan 02-01)
    provides: "src/engine/recurring/schedule.ts: RecurringFreq type, occurrenceDate"
  - phase: 02-record (plan 02-06)
    provides: "src/engine/categorize/builtins.ts: BUILTIN_CATEGORY_KEYS, BuiltinCategoryKey"
  - phase: 02-record (plan 02-32)
    provides: "src/engine/statement/types.ts: ImportSource, DraftRow shapes"
  - phase: 02-record (plan 02-36)
    provides: "src/engine/statement/profile.ts: inferProfile, FormatProfile (upstream of duplicates in the D-40 pipeline)"
provides:
  - "src/engine/categorize/guessCategory.ts: guessCategory, buildLearnedMap, normaliseDescription, DEFAULT_KEYWORD_RULES, KeywordRule, GuessContext, GuessSource (D-14)"
  - "src/engine/statement/duplicates.ts: findDuplicates, nameSimilarity, fitidReliable, DuplicateCandidate, ExistingRow, DuplicateMatch, NAME_SIMILARITY_THRESHOLD, CROSS_FORMAT_WINDOW_DAYS (D-47, D-54, REC-16)"
  - "src/engine/recurring/detect.ts: detectRecurring, RecurringDetectRow, RecurringSuggestion, AMOUNT_TOLERANCE, INTERVAL_WINDOWS, MIN_ROWS (D-21, D-56)"
  - "src/engine/recurring/payMatch.ts: matchPendingPayments, PendingOccurrence, PayMatchRow, PayMatch, PAY_MATCH_BEFORE_DAYS, PAY_MATCH_AFTER_DAYS (D-55)"
affects: ["02-26 (import pipeline calls findDuplicates/matchPendingPayments/detectRecurring in sequence)", "post-commit import suggestion UI (D-21/D-55 preview and toast)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "engine/statement/duplicates.ts reuses engine/categorize/guessCategory.ts's normaliseDescription for both the learned-category map and name-similarity tokenising, rather than a second normaliser"
    - "engine/recurring/payMatch.ts reuses engine/statement/duplicates.ts's nameSimilarity directly (both engine-to-engine imports, allowed by dependency-cruiser's engine-only-internal-src rule)"
    - "Amount-keyed index (Map<amount, ExistingRow[]>) keeps findDuplicates' multiset pass near-linear instead of an O(n*m) scan (T-02-04-01 mitigation)"
    - "Greedy one-to-one assignment with a fully deterministic sort key (similarity/day-gap/id or day-gap/amount-diff/id) so matching never depends on input order and never reuses a consumed row"
    - "detectRecurring groups rows by normalised-name + currency + sign before ever looking at intervals, so mixed currencies, mixed signs and transfer legs (D-56) never contaminate a series"

key-files:
  created:
    - src/engine/categorize/guessCategory.ts
    - src/engine/categorize/__tests__/guessCategory.test.ts
    - src/engine/statement/duplicates.ts
    - src/engine/statement/__tests__/duplicates.test.ts
    - src/engine/recurring/detect.ts
    - src/engine/recurring/payMatch.ts
    - src/engine/recurring/__tests__/detect.test.ts
    - src/engine/recurring/__tests__/payMatch.test.ts
  modified:
    - src/engine/categorize/index.ts
    - src/engine/statement/index.ts
    - src/engine/recurring/index.ts

key-decisions:
  - "guessCategory's keyword ranking collects every matching rule, then sorts whole-word-first then longest-substring, skipping any candidate whose category has no active builtin id before falling through to the next candidate -- an archived/removed builtin category never silently blocks a weaker match"
  - "findDuplicates treats a null existing-row name as an automatic similarity match (pre-Record rows had no name), but matchPendingPayments treats a null pending name as never matching -- these are deliberately different rules for different directions of missing data, both stated explicitly in the plan's behavior block"
  - "pickBest's (in duplicates.ts) final id tie-break was written as `a.existing.id < b.existing.id ? -1 : 1` with no equal-id branch, since existing row ids are always distinct within one findDuplicates call -- an equal-id comparison is structurally unreachable, not merely untested"
  - "nameSimilarity's union-is-zero guard was removed for the same reason: once both empty-string cases are handled by the two early returns above it, both token sets are provably non-empty, so union >= 1 always holds"
  - "detectRecurring's frequency windows (weekly/fortnightly/monthly/quarterly/yearly) are disjoint by construction, so trying them in a fixed order and returning the first one whose window contains every gap is equivalent to finding the unique fit, with no ambiguity to resolve"

patterns-established:
  - "Local, unexported daysBetween/parseLocalDateParts helpers are re-derived per file (duplicates.ts, detect.ts, payMatch.ts) rather than shared, mirroring schedule.ts's own private (unexported) daysBetween -- each file's date arithmetic is a two-line, independently-testable-via-its-caller detail, not worth a cross-cutting utility module for this phase"

requirements-completed: [REC-07, REC-09, REC-10, REC-05, REC-16]

# Metrics
duration: ~2h15min
completed: 2026-09-27
---

# Phase 02 Plan 04: Category Guessing, Duplicates, Pending-Payment Match and Recurring Suggestions Summary

**Four pure import-intelligence modules -- learned-then-keyword-then-income category guessing (D-14), occurrence-counting duplicate detection with FITID rules and a ±2-day cross-format window (D-47/D-54), a one-to-one pending-bill "mark paid" matcher (D-55), and interval/median-based recurring-series detection (D-21/D-56) -- all deterministic, order-independent and at 100% coverage.**

## Performance

- **Duration:** ~2h15min (includes an initial `npm ci --legacy-peer-deps`, ~3 min, for a worktree with no `node_modules`)
- **Completed:** 2026-09-27
- **Tasks:** 3 (all TDD: RED then GREEN)
- **Files modified:** 11 (8 created, 3 modified)

## Accomplishments

- `guessCategory` matches the user's own learned categorisation first (exact normalised name), then a keyword rule ranked whole-word-first then longest-substring (skipping any candidate whose builtin category has no active id), then an Income default for a positive amount, else uncategorised -- `DEFAULT_KEYWORD_RULES` ports the prototype's `Component.KEYS` (line 3228) verbatim plus the plan's additions (Netflix/Spotify-style subscriptions, UK/US grocers, ride-hail and fuel, dining chains, utilities, health, income keywords)
- `findDuplicates` flags likely duplicates against already-stored rows by occurrence count (a file holding k rows like the same payment against m similar stored rows flags exactly `min(k, m)`, proven with a 200-run fast-check property across random k/m and candidate ordering), a certain FITID match only while the file's own FITIDs are internally consistent, and a ±2-day window only against a row stored from a different source format (D-54) -- same-file rows are never compared against each other
- `matchPendingPayments` offers an imported row as the payment of a pending recurring occurrence when the sign matches, the amount is within 10%, the date falls from 3 days before to 7 days after the due date, and the name is similar (a null pending name never matches); candidates are ranked deterministically and assigned one-to-one, with rows already flagged as duplicates excluded via `excludeIndexes`
- `detectRecurring` groups rows by normalised name + currency + sign (so mixed currencies, mixed signs and D-56's excluded transfer legs never contaminate a series), finds the single frequency window that contains every consecutive day-gap, requires the group's minimum row count for that frequency, and requires every amount within 10% of the group's (lower) median
- `src/engine/{categorize,statement,recurring}` sit at 100% branch/line/function/statement coverage as three directories (349 tests via the plan's literal combined verify command), `npm run depcruise` is clean (205 modules, 586 dependencies, zero violations), a whole-project `tsc --noEmit` is clean, and the full `src/engine` suite (1182 tests, 39 suites) is green with no regressions

## Task Commits

Each task followed RED (failing tests, confirmed by "Cannot find module") then GREEN (implementation, confirmed passing at 100% coverage):

1. **Task 1: guessCategory**
   - `e9f9c3e` test(02-04): add failing tests for guessCategory (RED)
   - `829c762` feat(02-04): implement guessCategory (D-14)
2. **Task 2: findDuplicates**
   - `a8261d2` test(02-04): add failing tests for findDuplicates (RED)
   - `22f95c0` feat(02-04): implement findDuplicates with FITID and cross-format rules
3. **Task 3: detectRecurring and matchPendingPayments**
   - `e98de7f` test(02-04): add failing tests for detectRecurring and matchPendingPayments (RED)
   - `41d3be3` feat(02-04): implement detectRecurring and matchPendingPayments (D-21, D-55)

_TDD plan: each task's own RED commit was confirmed failing with "Cannot find module" before its GREEN commit was made; no separate REFACTOR commits were needed._

## Files Created/Modified

- `src/engine/categorize/guessCategory.ts` - guessCategory, buildLearnedMap, normaliseDescription, DEFAULT_KEYWORD_RULES, KeywordRule, GuessContext, GuessSource
- `src/engine/categorize/__tests__/guessCategory.test.ts` - 30 tests covering every example in the plan's behavior block plus coverage-closing branch tests
- `src/engine/categorize/index.ts` - added `export * from './guessCategory'`
- `src/engine/statement/duplicates.ts` - findDuplicates, nameSimilarity, fitidReliable, DuplicateCandidate, ExistingRow, DuplicateMatch, NAME_SIMILARITY_THRESHOLD, CROSS_FORMAT_WINDOW_DAYS
- `src/engine/statement/__tests__/duplicates.test.ts` - 34 tests including the min(k, m) fast-check property (200 runs) and every FITID/cross-format/tie-break case
- `src/engine/statement/index.ts` - added `export * from './duplicates'`
- `src/engine/recurring/detect.ts` - detectRecurring, RecurringDetectRow, RecurringSuggestion, AMOUNT_TOLERANCE, INTERVAL_WINDOWS, MIN_ROWS
- `src/engine/recurring/payMatch.ts` - matchPendingPayments, PendingOccurrence, PayMatchRow, PayMatch, PAY_MATCH_BEFORE_DAYS, PAY_MATCH_AFTER_DAYS
- `src/engine/recurring/__tests__/detect.test.ts` - 21 tests covering every frequency window, the amount-tolerance median rule, grouping and sort tie-breaks
- `src/engine/recurring/__tests__/payMatch.test.ts` - 17 tests covering the date/amount/name/sign rules, exclusion and every tie-break
- `src/engine/recurring/index.ts` - added `export * from './detect'; export * from './payMatch';`

## Decisions Made

See `key-decisions` in the frontmatter above for the five load-bearing ones (archived-category fallthrough order; the deliberately opposite null-name rules in duplicates vs. payMatch; two genuinely-dead branches removed rather than fake-tested; and the disjoint-frequency-window reasoning). None is a scope change -- all are readings needed to make the plan's own behavior block, acceptance-criteria greps and 100%-coverage gate agree exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a structurally dead branch in findDuplicates' pickBest tie-break**
- **Found during:** Task 2, closing the 100%-coverage gate
- **Issue:** `pickBest`'s final tie-break originally had an explicit `a.existing.id === b.existing.id` branch returning 0. Since `existing` row ids are always distinct within one `findDuplicates` call, that branch is unreachable through any real call -- a coverage gap no honest test could close.
- **Fix:** Simplified to `a.existing.id < b.existing.id ? -1 : 1` (no equal case), mirroring the precedent in plan 02-36's SUMMARY (dead null-check branches removed rather than fake-tested).
- **Files modified:** `src/engine/statement/duplicates.ts`
- **Verification:** Re-ran coverage; `duplicates.ts` reached 100% branches/lines/functions/statements.
- **Committed in:** `22f95c0`

**2. [Rule 1 - Bug] Removed a structurally dead union-is-zero guard in nameSimilarity**
- **Found during:** Task 2, same coverage pass
- **Issue:** `nameSimilarity`'s Jaccard step guarded `union === 0 ? 0 : intersection / union`, but by that point both empty-string cases are already handled by two earlier early returns, so both token sets are provably non-empty and `union >= 1` always holds -- the same class of unreachable branch as above.
- **Fix:** Removed the ternary, returning `intersection / union` directly, with a comment recording the invariant.
- **Files modified:** `src/engine/statement/duplicates.ts`
- **Verification:** Same coverage run as above.
- **Committed in:** `22f95c0`

**3. [Rule 3 - Blocking] `npm ci --legacy-peer-deps` required before any test could run**
- **Found during:** Start of execution
- **Issue:** The worktree had no `node_modules`.
- **Fix:** Ran `npm ci --legacy-peer-deps` per this repo's committed `.npmrc`/CI convention.
- **Files modified:** None (dependency install only).
- **Verification:** Subsequent `npx jest`/`tsc`/`depcruise` invocations resolved correctly.

---

**Total deviations:** 3 auto-fixed (2 genuine dead-code removals found while closing the plan's own 100%-coverage gate, 1 blocking/environmental prerequisite). No scope creep: all three are either removing unreachable code to meet the plan's own coverage requirement honestly, or an environment prerequisite with no functional change.

## Issues Encountered

- Closing the 100%-branch-coverage gate on the sort comparators in `duplicates.ts`, `detect.ts` and `payMatch.ts` took several iterations: Istanbul's branch reporting for a comparator function only shows a gap when *neither* invocation order of a tie has been exercised, so early test batches that always happened to construct arrays in a consistent order silently left one side of several ternaries and `if` conditions uncovered (e.g. the "name<b.name" true branch, the "amountDiff differs" branch, the "existing.id" tie-break direction). Each gap was closed with a manually-traced, deliberately-ordered test input (e.g. reversing which candidate appears first in the input array) rather than by weakening the coverage requirement or guessing.
- None of the gaps were actual bugs except the two genuinely dead branches documented above as deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-26 (the import pipeline) can now call, in sequence per RESEARCH.md §A0's pipeline shape: `inferProfile` → `convertDraft` → `reconcile` → `findDuplicates` → (transfer matching, plan 02-37) → preview, and separately call `detectRecurring`/`matchPendingPayments` post-commit for the D-21/D-55 suggestions.
- `guessCategory`'s `GuessContext.builtinIds`/`learned` maps need to be assembled by a data-layer hook (plan 02-14/02-15/02-17 territory) from the user's live categories and their own transaction history -- this plan only provides the pure function, not the wiring.
- `matchPendingPayments`'s `excludeIndexes` parameter is designed to receive the row indexes already flagged by `findDuplicates` in the same import pass, so the pipeline should call duplicates before pay-matching, not in parallel.
- No blockers identified for downstream statement-import or recurring-suggestion UI plans.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 8 created source/test files verified present on disk (`guessCategory.ts`
+ test, `duplicates.ts` + test, `detect.ts`, `payMatch.ts` + their two test
files). All 6 task commit hashes (`e9f9c3e`, `829c762`, `a8261d2`, `22f95c0`,
`e98de7f`, `41d3be3`) confirmed present in `git log`.
