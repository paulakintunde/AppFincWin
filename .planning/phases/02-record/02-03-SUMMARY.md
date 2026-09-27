---
phase: 02-record
plan: 03
subsystem: engine
tags: [typescript, fast-check, jest, csv, statement-import, column-detection, sign-free-amounts]

# Dependency graph
requires:
  - phase: 02-record (plan 02)
    provides: "tokenize/detectDelimiter/MAX_IMPORT_ROWS, parseCsvDate/inferDateFormat/inferDecimalMark/inferNumberNotation/notationFor (src/engine/csv)"
  - phase: 02-record (plan 32)
    provides: "parseNotatedAmount/markerSign/AmountMarker (src/engine/money), StatementDraft/DraftRow/FormatProfile contracts and MAX_RAW_CELL/MAX_DESCRIPTION/MAX_LAYOUT_SIGNATURE (src/engine/statement)"
provides:
  - "detectColumns/validateMapping/balanceLabelOf/HEADER_KEYWORDS (src/engine/csv/detectColumns.ts) -- header-plus-content column-role detection covering date/description/amount/debit/credit/currency/balance/direction/limit, with a correctable ColumnMapping and typed validation errors"
  - "csvToDraft/layoutSignatureOf/MAX_NAME_LENGTH/DIRECTION_OUT/DIRECTION_IN (src/engine/csv/mapRows.ts) -- converts mapped CSV rows into the shared, sign-free StatementDraft, including debit/credit netting, direction-column marker derivation, balance parsing and summary-line detection/removal"
  - "src/engine/csv barrel now re-exports detectColumns.ts and mapRows.ts alongside 02-02's tokenize.ts/inferFormat.ts"
affects: ["02-04", "02-35", "02-36", "02.1"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Header-keyword-then-content-sniffing column detection: a fixed role-resolution order (limit, balance, direction, date, debit, credit, amount, currency, description) prevents 'Credit limit'/'Available credit' from being read as a plain credit column, and a direction-headed column is only accepted once >= 80% of its own sample values are direction words -- a header match alone is not enough"
    - "Column/direction-authoritative sign resolution (resolveForcedSign in mapRows.ts): a debit/credit column or a direction cell's value is the sign of record; an inner marker inside the cell (e.g. a stray '-12.50' typed into a 'Paid out' column) only ever confirms or contradicts that sign, never overrides it -- contradiction becomes a typed 'conflicting-markers' row issue, mirroring parseNotatedAmount's own multi-marker conflict discipline one level up"
    - "Two-phase summary-line removal: explicit phrase-matched rows ('Opening balance', 'Balance brought forward', etc.) are removed first; then, among rows still present, a no-amount-but-readable-balance row is folded into statedOpening only if it precedes every remaining transaction row, and into statedClosing only if it follows every remaining transaction row (checked independently, not by first-vs-last array position) so a single candidate can become one or the other without any transaction rows on one side"

key-files:
  created:
    - src/engine/csv/detectColumns.ts
    - src/engine/csv/mapRows.ts
    - src/engine/csv/__tests__/detectColumns.test.ts
    - src/engine/csv/__tests__/mapRows.test.ts
  modified:
    - src/engine/csv/index.ts

key-decisions:
  - "detectColumns.ts carries its own private DIRECTION_VALUE_WORDS set (rather than importing mapRows.ts's exported DIRECTION_OUT/DIRECTION_IN) to avoid a circular import -- mapRows.ts already imports ColumnMapping from detectColumns.ts, so the reverse import isn't possible. The two word lists are kept literally identical and documented as such; a future refactor could hoist them to a small shared constants module if that duplication becomes a maintenance problem"
  - "layoutSignatureOf's separator shape has a doubled pipe before the delimiter/decimal suffix ('date|description|amount||,|.', not a single pipe) -- this exactly matches the plan's own literal worked example, verified by splitting the example string programmatically rather than trusting a manual character count"
  - "Four 'raw.rawBalance ?? \"\"' fallbacks in mapRows.ts's summary-line detection were narrowed to 'as string' casts instead: resolveBalance's own contract guarantees rawBalance is non-null whenever balanceMagnitude is non-null, and every one of those four call sites is already inside a 'balanceMagnitude !== null' guard, so the fallback was unreachable dead code rather than a real defensive path"
  - "containsPhrase's 'phraseWords.length === 0' guard was removed (not test-covered) after confirming every HEADER_KEYWORDS entry is a non-empty word or phrase by construction -- the same 'narrow the type/logic instead of testing dead code' precedent 02-02/02-32 already established for this codebase's engine modules"

requirements-completed: [REC-09, REC-10, REC-13, REC-14, REC-15]

# Metrics
duration: ~150min (includes npm ci in a fresh worktree and multiple jest coverage-closing iterations under heavy multi-agent machine contention -- individual jest invocations took 25s-170s depending on concurrent load)
completed: 2026-09-27
---

# Phase 2 Plan 3: CSV Column Detection and StatementDraft Mapping Summary

**Header-plus-content CSV column detection (now covering balance/direction/limit roles) and a sign-free `csvToDraft` converter that nets debit/credit columns, derives dr/cr markers from a direction column, parses balances, and detects/removes opening/closing summary lines -- both at 100% branch coverage in `src/engine/csv/`.**

## Performance

- **Duration:** ~150 min active work, including `npm ci --legacy-peer-deps` in a fresh worktree (no `node_modules` present at start) and several RED/GREEN/coverage-closing iterations; a significant share of wall-clock time was spent waiting on `npx jest` runs (25s-170s each) under heavy contention from other concurrent agents/processes on this machine, not algorithmic slowness in the code itself
- **Tasks:** 2 completed / 2
- **Files modified:** 5 (4 created, 1 modified — the barrel)

## Accomplishments

- `detectColumns`/`validateMapping`/`balanceLabelOf`/`HEADER_KEYWORDS` in `src/engine/csv/detectColumns.ts`: resolves all nine column roles (date, description, amount, debit, credit, currency, balance, direction, limit) from header keywords in a fixed precedence order that keeps 'Credit limit'/'Available credit' out of the plain credit role and 'Debit/Credit'/'DR/CR' headers out of the plain debit/credit roles, then falls back to content sniffing (parseCsvDate/parseNotatedAmount-based) for date/amount/description when headers carry no signal, reporting `confidence: 'high' | 'low'` accordingly. A direction-headed column is only accepted once >= 80% of its own non-empty sample values are recognised direction words -- header text alone is not sufficient. `balanceLabelOf` reads only 'available'/'owed' from a header; 'held' is never inferred from a header (D-53). `validateMapping` returns every applicable typed error (`no-date`, `no-description`, `no-amount`, `amount-and-debit-credit`, `duplicate-column`) in the order the type declares them.
- `csvToDraft`/`layoutSignatureOf`/`MAX_NAME_LENGTH`/`DIRECTION_OUT`/`DIRECTION_IN` in `src/engine/csv/mapRows.ts`: converts mapped rows into the shared `StatementDraft` (plan 02-32's contract) with magnitudes and `AmountMarker`s only -- no sign is ever decided here (D-43/D-44 stay downstream in `convert.ts`). Debit/credit columns net to `credit - debit` when both are filled, or take the single filled column's value with the column itself as the authoritative sign (an inner marker inside the cell only confirms or contradicts, e.g. a stray '-12.50' typed into a 'Paid out' column is accepted as agreeing, while a stray '+12.50' there is `conflicting-markers`). A direction column's value maps through `DIRECTION_OUT`/`DIRECTION_IN` word tables onto the unsigned amount cell the same way. Balance cells parse independently and never block the row's own amount. Opening/closing summary lines -- either an explicit phrase ('Opening balance', 'Balance carried forward', etc.) or an implicit no-amount-but-readable-balance row bordering every transaction row -- are detected, removed from the row set, folded into `statedOpening`/`statedClosing`, and the remaining rows are re-indexed `0..n-1` with a `summary-lines-removed` warning.
- Both modules, plus the barrel, sit at 100% branch/line/function/statement coverage together (`npx jest src/engine/csv --coverage` reports 100% across `detectColumns.ts`, `mapRows.ts`, `tokenize.ts`, `inferFormat.ts`), including a round-trip fast-check property (any integer magnitude `|a| <= 1e11` rendered under five notation families, with or without a leading minus, recovers exactly) and a no-leak assertion (row cell content that fails to parse never appears inside `issues`/`warnings`, only inside the separate `rawAmount`/`rawBalance` provenance fields per D-45).
- `npm run typecheck`, `npm run depcruise` and `npx eslint` on the changed files all pass clean (eslint reports only pre-existing `import/no-named-as-default-member` warnings on the `fast-check` default import, the same pattern already used in plan 02-32's own test file).
- No `parseFloat`/`Number(...)` coercion, no `console.*`/`throw new Error`, and no leftover `parseSignedAmount`/`negate` exports anywhere in `mapRows.ts` or the barrel (all four required acceptance-criteria greps return 0, confirmed directly).

## Task Commits

Each task followed RED (a `test(...)` commit with the implementation confirmed absent -- `Cannot find module`) then GREEN (a `feat(...)` commit with the suite passing at the required coverage):

1. **Task 1: detectColumns, balanceLabelOf and validateMapping**
   - `4695c02` (test) - failing tests: header/content detection cases, `balanceLabelOf`, `validateMapping` error ordering, and a barrel re-export check
   - `f647eda` (feat) - `detectColumns.ts` implementation and the barrel export
2. **Task 2: csvToDraft — notation, markers, provenance, summary lines**
   - `1e8acd2` (test) - failing tests: amount-column/debit-credit/direction-column resolution, balance/limit/currency handling, date/description issues, summary-line detection, no-leak, and the round-trip property
   - `9144133` (feat) - `mapRows.ts` implementation, the completed barrel, and coverage-closing fixes to `detectColumns.ts` discovered while running the combined `src/engine/csv` coverage gate this task's own verification step requires

**Plan metadata:** this commit (`docs: complete plan`) -- per the parallel-executor contract, this plan does not update STATE.md/ROADMAP.md itself; the orchestrator does after all wave agents complete.

_Note: this is a `type: tdd` plan -- both tasks followed RED (module-not-found confirmed) then GREEN (100%-coverage confirmed) before their `feat` commit._

## Files Created/Modified

- `src/engine/csv/detectColumns.ts` - column-role detection (header keywords + content sniffing), `balanceLabelOf`, `validateMapping`
- `src/engine/csv/mapRows.ts` - `csvToDraft`, `layoutSignatureOf`, `MAX_NAME_LENGTH`, `DIRECTION_OUT`/`DIRECTION_IN`
- `src/engine/csv/index.ts` - barrel now re-exports both new modules
- `src/engine/csv/__tests__/detectColumns.test.ts` - detection/label/validation test suite
- `src/engine/csv/__tests__/mapRows.test.ts` - conversion test suite, no-leak assertion, round-trip property

## Decisions Made

See `key-decisions` in the frontmatter. In summary: `detectColumns.ts` keeps its own private direction-word set rather than importing `mapRows.ts`'s exported `DIRECTION_OUT`/`DIRECTION_IN` (the reverse import would be circular, since `mapRows.ts` already imports `ColumnMapping` from `detectColumns.ts`); `layoutSignatureOf`'s doubled-pipe separator shape was verified against the plan's own literal example by splitting it programmatically rather than trusting a manual character count; four `row.rawBalance ?? ''` fallbacks became `as string` casts once the underlying invariant (a non-null `balanceMagnitude` always pairs with a non-null `rawBalance`) was confirmed structurally unreachable otherwise; and one genuinely-unreachable empty-phrase guard in `detectColumns.ts`'s `containsPhrase` was removed rather than covered, following the same "narrow the type/logic instead of testing dead code" precedent plans 02-02 and 02-32 already established in this codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm ci` required before any test could run**
- **Found during:** Start of Task 1, before writing any code
- **Issue:** The worktree had no `node_modules` at all
- **Fix:** Ran `npm ci --legacy-peer-deps` (matching this repo's committed `.npmrc`/CI convention) before any Jest invocation
- **Files modified:** none (dependency install only, `package-lock.json` unchanged)
- **Verification:** subsequent `npx jest` invocations resolved all imports correctly

**2. [Rule 1 - Bug] The implicit-closing-line guard incorrectly blocked its own branch whenever there was exactly one implicit summary candidate**
- **Found during:** Task 2, first coverage/behaviour run after the GREEN implementation
- **Issue:** The implicit-closing check originally guarded on `last !== first` to avoid double-applying a single candidate as both opening and closing. That guard fired even when the opening branch had legitimately *not* applied (because the candidate didn't precede every transaction row), incorrectly skipping the closing branch too and leaving a genuine trailing summary-balance row un-removed
- **Fix:** Changed the guard to `!implicitRemoved.has(last)` -- it now only skips the closing branch if the opening branch already consumed that exact row, not merely because there was only one candidate
- **Files modified:** `src/engine/csv/mapRows.ts`
- **Verification:** the "treats a trailing no-amount, has-balance row as an implicit closing line" test (previously failing with 3 rows instead of 2) now passes; the pre-existing "does not apply an implicit candidate...when a transaction row precedes it" case (testing the no-op middle-of-file scenario) continues to pass unchanged
- **Committed in:** `9144133` (Task 2 GREEN commit)

**3. [Rule 1/Rule 3 - Coverage gap] Two 100%-coverage gaps in `detectColumns.ts` surfaced only once Task 2's combined `src/engine/csv` coverage run was performed**
- **Found during:** Task 2's own verification step (`npx jest src/engine/csv --coverage ...`), which covers the whole folder, not just `mapRows.ts`
- **Issue:** `containsPhrase`'s `phraseWords.length === 0` guard was dead code (every `HEADER_KEYWORDS` entry is a non-empty word/phrase by construction, so the guard could never be exercised); several content-sniffing "already used"/"blank sample"/"nothing found" branches across `sniffDateColumn`/`sniffAmountColumn`/`sniffDescriptionColumn` and a short-sample-row edge case in `nonEmptyValues`/`columnPassesDirectionContent` also lacked test coverage
- **Fix:** Removed the unreachable guard entirely (narrowing the logic, not adding a test that could never exercise it); added nine targeted test cases across `detectColumns.test.ts` and `mapRows.test.ts` covering the used-column-skip, blank-sample-skip, no-match-found, short-row, and out-of-header-bounds paths
- **Files modified:** `src/engine/csv/detectColumns.ts`, `src/engine/csv/__tests__/detectColumns.test.ts`, `src/engine/csv/__tests__/mapRows.test.ts`
- **Verification:** `npx jest src/engine/csv --coverage --collectCoverageFrom="src/engine/csv/**/*.ts" --coverageThreshold=...` reports 100% branches/lines/functions/statements across all four `src/engine/csv` source files, 192 tests passing
- **Committed in:** `9144133` (Task 2 GREEN commit, alongside `mapRows.ts` itself, since the combined coverage gate is Task 2's own stated verification step)

---

**Total deviations:** 3 auto-fixed (1 environmental/blocking, 1 genuine logic bug caught by the plan's own behaviour-block test cases, 1 coverage-gate-driven hardening pass spanning both task files)
**Impact on plan:** No scope creep. All three were necessary to meet the plan's own literal acceptance criteria (100% coverage across `src/engine/csv`) and the project's quality gates; none changed the plan's behavioural surface (the `<behavior>` block's cases all still hold exactly as specified).

## Issues Encountered

- **The plan's `layoutSignatureOf` prose description and its own worked example disagree on pipe count.** The prose reads "joined with '|' + '|' + delimiter + '|' + decimal" (which parses as a single extra pipe), but the literal example `'date|description|amount||,|.'` splits into `['date','description','amount','', ',', '.']` -- a doubled pipe, i.e. an extra empty segment. The implementation follows the literal example (verified by splitting the example string programmatically), since that is the concrete test oracle the plan itself specifies.
- **Heavy machine contention** (consistent with prior 02-02/02-32 plan summaries in this phase): individual `npx jest` invocations ranged from ~25s (when the machine was quiet) to ~170s (under load from other concurrent agents/worktrees), though this affected only wall-clock time, never correctness.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-04 (import intelligence: duplicates, category guesses, recurring suggestion) and plans 02-35/02-36 (which already exist on this branch from an earlier wave) can consume `StatementDraft` objects produced by `csvToDraft`, `ColumnMapping`/`validateMapping`/`detectColumns` for the preview's correctable mapping UI, and `layoutSignatureOf` for the remembered-format-profile lookup key (D-42).
- No blockers identified for downstream CSV/statement-import plans.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 4 created files confirmed present on disk; all 4 task commits (`4695c02`, `f647eda`, `1e8acd2`, `9144133`) confirmed present in `git log`.
