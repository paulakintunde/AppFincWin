---
phase: 02-record
plan: 06
subsystem: engine
tags: [engine, activity, categorize, money, fast-check, jest]

requires:
  - phase: 01-money-core
    provides: "src/engine/time/localDate.ts (isValidLocalDate, monthOf, monthRange), src/engine/money/types.ts (MinorUnits, minorUnits)"
provides:
  - "monthTotals: paid in/out split, signed still-to-come, transfer-exclusion by transfer_id (D-50)"
  - "status.ts: directionOf, isOverdue (D-05), markPaidDate (D-06), defaultStatusFor, monthsForSwitcher (ACT-02)"
  - "filters.ts: filterRows, matchesSearch, normaliseForSearch, EMPTY_FILTER, isFilterActive (ACT-03, ACT-04)"
  - "accountBalance: BigInt-summed balance with explicit overflow flag, foreign-currency subtotals (REC-08, D-10)"
  - "categorize/builtins.ts: BUILTIN_CATEGORY_KEYS, SYSTEM_CATEGORY_KEYS, CATEGORY_COLOR_KEYS, BUILTIN_COLOR_KEY (D-34, D-35) -- the single seed definition plans 02-07 (SQL seed) and 02-10 (theme swatch map) mirror"
affects: ["02-07 (schema/seed)", "02-10 (contracts/theme)", "02-14/02-15/02-17 (hooks/mutations reading these types)", "Activity and Accounts screens (Phase 3+)"]

tech-stack:
  added: []
  patterns:
    - "assertLocalDate-style shared validation helper to keep RangeError-throwing branches to a single tested location instead of duplicating per call site"
    - "BigInt summation with an explicit overflow: boolean flag instead of a silently wrong float, for any sum arriving as server text"

key-files:
  created:
    - src/engine/categorize/builtins.ts
    - src/engine/categorize/index.ts
    - src/engine/activity/status.ts
    - src/engine/activity/totals.ts
    - src/engine/activity/filters.ts
    - src/engine/activity/balance.ts
    - src/engine/activity/index.ts
    - src/engine/activity/__tests__/activity.test.ts
    - src/engine/categorize/__tests__/builtins.test.ts
  modified: []

key-decisions:
  - "monthsForSwitcher's sort comparator dropped the a===b tie-break branch (dead code: Set dedup already guarantees no ties), and totals.ts's status switch was changed from if/else-if to if/else (the else-if's false branch was unreachable given TxStatus's three members and the earlier skipped-row continue) -- both were blocking the 100% branch-coverage gate on genuinely unreachable code, not on missing test cases"
  - "isFilterActive and matchesAmountRange kept as small private helpers with plain comparisons rather than one large boolean expression, so each logical operator's branch pairs are cheap to hit directly in tests"

requirements-completed: [ACT-01, ACT-02, ACT-03, ACT-04, REC-08, REC-06, REC-07, REC-18]

duration: ~100min
completed: 2026-09-27
---

# Phase 02 Plan 06: Activity View Maths and Built-in Categories Summary

**Pure engine maths for Record's Activity/Accounts screens -- month totals with a signed still-to-come figure, overdue/mark-paid/default-status rules, category/account/direction/amount-range filtering with accent-insensitive search, a month switcher, BigInt-safe account balances, and the single built-in category/colour seed definition -- all at 100% branch coverage.**

## Performance

- **Duration:** ~100 min (includes a lengthy environment investigation; see Issues Encountered)
- **Completed:** 2026-09-27
- **Tasks:** 2 (both TDD, RED then GREEN)
- **Files modified:** 9 created, 0 modified

## Accomplishments

- `src/engine/categorize/builtins.ts` is now the single definition of the built-in category seed (D-34: 13 built-in + 2 system keys) and its 7 colour pairs (D-35), ready for plan 02-07's SQL seed and plan 02-10's theme swatch map to mirror verbatim
- `src/engine/activity/status.ts` implements the planned-vs-paid rules exactly as decided: an overdue pending row is never auto-marked paid (D-05), marking paid uses the earlier of today/due-date (D-06), and a hand-entered future date defaults to pending
- `src/engine/activity/totals.ts` gives month totals that correctly exclude transfer legs from every sum by `transfer_id` -- never by category name -- verified with a property test that adding any transfer pair leaves paidIn/paidOut/net/stillToCome unchanged (D-50)
- `src/engine/activity/filters.ts` and `balance.ts` complete the Activity/Accounts view maths: filtering, accent- and case-insensitive multi-token search, and a BigInt-summed account balance with an explicit overflow flag instead of a silently wrong float
- 100% branch/line/function/statement coverage on `src/engine/activity/**` and `src/engine/categorize/builtins.ts`; full `src/engine` suite (354 tests) green; `dependency-cruiser` clean (engine purity intact)

## Task Commits

Each task followed RED (failing tests, confirmed by physically removing the not-yet-written implementation files) then GREEN (implementation, confirmed passing):

1. **Task 1: Built-in categories and status/switcher rules**
   - `3ebbb2d` test(02-06): add failing tests for built-in categories and status rules
   - `f8fba13` feat(02-06): built-in categories and status/switcher rules
2. **Task 2: Totals, filters, search, balance (coverage)**
   - `669e4d3` test(02-06): add failing tests for month totals, filters, search and balance
   - `da98186` feat(02-06): month totals, filters, search and account balance (includes the two dead-branch removals needed to clear the 100% coverage gate)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/engine/categorize/builtins.ts` - BUILTIN_CATEGORY_KEYS, SYSTEM_CATEGORY_KEYS, CATEGORY_COLOR_KEYS, BUILTIN_COLOR_KEY, isCategoryColorKey (D-34, D-35)
- `src/engine/categorize/index.ts` - barrel (guessCategory arrives in a later plan)
- `src/engine/activity/status.ts` - directionOf, isOverdue, markPaidDate, defaultStatusFor, nextMonth, monthsForSwitcher
- `src/engine/activity/totals.ts` - monthTotals, TotalsInput, MonthTotals
- `src/engine/activity/filters.ts` - ActivityFilter, EMPTY_FILTER, FilterRow, isFilterActive, normaliseForSearch, matchesSearch, filterRows
- `src/engine/activity/balance.ts` - BalanceLeg, AccountBalance, accountBalance
- `src/engine/activity/index.ts` - barrel exporting all four activity modules
- `src/engine/activity/__tests__/activity.test.ts` - 57 tests across status/totals/filters/balance, including 3 fast-check property tests
- `src/engine/categorize/__tests__/builtins.test.ts` - 6 tests on the seed set and colour pairs

## Decisions Made

- `monthsForSwitcher`'s sort comparator uses a plain two-way `(a < b ? 1 : -1)` rather than a three-way tie-break, because the preceding `Set` dedup already guarantees no two entries are equal -- the `a === b` branch was genuinely unreachable, not merely untested
- `totals.ts`'s per-row status handling is `if ('paid') {...} else {...}` rather than `if ('paid') {...} else if ('pending') {...}`, since `'skipped'` rows already `continue` earlier in the loop and `TxStatus` has no fourth member -- same reasoning, same fix
- Both changes were made to clear the plan's 100% branch-coverage gate honestly (by removing genuinely dead code) rather than by adding a contrived test for an unreachable branch

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking] Removed two dead branches blocking the 100% coverage gate**
- **Found during:** Task 2's coverage run
- **Issue:** `status.ts`'s sort comparator and `totals.ts`'s status switch each had one branch that was reachable in principle but unreachable in practice given the type system and prior dedup/continue guarantees, so Istanbul's branch coverage never hit 100%
- **Fix:** Simplified both to remove the unreachable path (see Decisions Made)
- **Files modified:** `src/engine/activity/status.ts`, `src/engine/activity/totals.ts`
- **Verification:** Full activity+builtins coverage run at 100% branches/lines/functions/statements; full `src/engine` suite (354 tests) still green
- **Committed in:** `da98186` (part of Task 2's feat commit)

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** No scope change -- both fixes removed genuinely dead code to meet the plan's own coverage requirement, not new functionality.

## Issues Encountered

**Jest could not find any test files in this worktree ("No tests found"), including for pre-existing Phase 1 tests, before any of this plan's own files were written.** Root cause, confirmed by isolated reproduction outside the repo: Jest's `testMatch` glob (resolved via micromatch) refuses to match any path containing a dot-prefixed directory segment -- here, `.claude` from this GSD worktree's own path convention `.claude/worktrees/<agent-id>` -- unless `dot: true` is passed, which Jest's config surface does not expose for `testMatch`. `testRegex` bypasses micromatch entirely (a plain `RegExp.test` against the resolved path) and is unaffected. This is a local-dev-environment quirk of running inside a dot-prefixed worktree path, not a project defect: normal checkouts and CI never sit under a dot-directory, so the committed `jest.config.js` was left untouched. All verification in this plan used a local, uncommitted `jest.verify.config.js` (deleted before the final commit, never staged) that required the real config and swapped `testMatch` for an equivalent `testRegex`. A sibling worktree agent independently hit and diagnosed the same issue during this session; this plan's own diagnosis (isolated reproduction, confirmed cosmetic-only for literal paths but real for glob patterns) matches. No repo file was changed to work around this. Also: `node_modules` was missing at the start of this session (fresh worktree) and was restored via `npm ci`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-07 (schema/SQL seed) can copy `BUILTIN_CATEGORY_KEYS`/`SYSTEM_CATEGORY_KEYS`/`BUILTIN_COLOR_KEY` verbatim into the category seed migration
- Plan 02-10 (contracts/theme) can copy `CATEGORY_COLOR_KEYS`/`BUILTIN_COLOR_KEY` into the `categorySwatch` theme map
- Plans 02-14/02-15/02-17 (hooks/mutations) can build directly on `TotalsInput`, `ActivityFilter`, `FilterRow`, `BalanceLeg` as their read/query shapes
- No blockers. Flagging for whoever next runs Jest from inside a `.claude/worktrees/*` path: use a `testRegex` override for verification; do not edit the committed `jest.config.js` to "fix" this, since normal checkouts and CI are unaffected

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

- All 9 created files verified present on disk.
- All 4 commit hashes (3ebbb2d, f8fba13, 669e4d3, da98186) verified present in `git log`.
