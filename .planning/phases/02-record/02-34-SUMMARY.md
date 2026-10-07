---
phase: 02-record
plan: 34
subsystem: engine
tags: [typescript, fast-check, jest, ofx, qfx, statement-import, money, dates]

# Dependency graph
requires:
  - phase: 02-record (02-32)
    provides: "StatementDraft/FormatProfile contracts (src/engine/statement/types.ts), parseNotatedAmount/AmountMarker (src/engine/money/)"
  - phase: 02-record (02-33)
    provides: "splitOfxHeader/tokenizeOfx (src/engine/ofx/tokenize.ts), buildOfxTree/findAll/child/childText (src/engine/ofx/tree.ts)"
provides:
  - "ofxLocalDate (src/engine/ofx/date.ts) -- reads DTPOSTED/DTSTART/DTEND/DTASOF's first 8 characters as the local date, grammar-checking but discarding any time/offset, never through a JS Date instant (D-39, MON-14)"
  - "parseOfxAmount (src/engine/ofx/amount.ts) -- picks the OFX cell's decimal mark ('.' or ',') and delegates to parseNotatedAmount for the magnitude/marker read, rejecting any grouping (D-43)"
  - "parseOfx (src/engine/ofx/parse.ts) -- turns an OFX/QFX file into one StatementDraft per STMTRS/CCSTMTRS, in document order, with FITID/TRNTYPE/description/statedClosing/available and never an account number (D-39, D-45, REC-09, REC-14, REC-16)"
affects: ["02-35", "02-36", "02-04"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grammar-then-discard date reading: ofxLocalDate validates the optional time/offset suffix character-by-character (no regex) purely to reject malformed input, then throws the parsed values away and returns only the first-8-characters date -- the date is never round-tripped through a JS Date/instant"
    - "One document-order tree walk collecting two element names at once (parse.ts's collectStatements mirrors tree.ts's own findAll traversal) so a file mixing STMTRS and CCSTMTRS is never re-ordered by extracting each kind with a separate findAll call"
    - "Unreachable-branch removal over synthetic tests: isDigitRun's empty-string guard was removed (not tested) once tracing every call site proved it structurally unreachable -- same discipline 02-32 (isBoundary) and 02-33 (the header-search while-loop) already established for this codebase's 100% coverage gate"

key-files:
  created:
    - src/engine/ofx/date.ts
    - src/engine/ofx/amount.ts
    - src/engine/ofx/parse.ts
    - src/engine/ofx/__tests__/date.test.ts
    - src/engine/ofx/__tests__/amount.test.ts
    - src/engine/ofx/__tests__/parse.test.ts
    - src/engine/ofx/__tests__/fixtures/bank-sgml.ofx
    - src/engine/ofx/__tests__/fixtures/card-sgml-positive-purchases.qfx
    - src/engine/ofx/__tests__/fixtures/bank-xml-220.ofx
    - src/engine/ofx/__tests__/fixtures/multi-statement.ofx
    - src/engine/ofx/__tests__/fixtures/card-over-limit.ofx
  modified:
    - src/engine/ofx/index.ts

key-decisions:
  - "parseOfxAmount rejects a cell the instant it contains any character outside 0-9+-., -- OFX never sends digit grouping, so a second '.'/',' beyond the one real decimal mark is refused rather than guessed at, matching RESEARCH SS A1's 'strip trailing zeros, reject non-zero excess, never round' rule"
  - "Balance fields (statedOpening/statedLimit/balanceLabel/labels) are left null/empty in this plan by design -- OFX carries no opening balance and no explicit limit; reconciliation and profile inference are 02-35/02-36's job, not this extractor's"
  - "A per-row CURRENCY/ORIGCURRENCY aggregate is deliberately never read -- TRNAMT is always in CURDEF per RESEARCH SS A1, so reading it would be dead code with no behaviour to test honestly"
  - "isDigitRun's empty-string guard removed after tracing every call site (isValidTimePart, ofxLocalDate) proves the loop can never run zero times -- consistent with 02-32/02-33's precedent for unreachable branches under the 100% coverage gate, rather than adding a test that could never exercise real behaviour"

requirements-completed: [REC-09, REC-14, REC-16]

# Metrics
duration: ~100min
completed: 2026-09-27
---

# Phase 2 Plan 34: OFX Dates, Amounts and Statement Extraction Summary

**`ofxLocalDate`/`parseOfxAmount`/`parseOfx` complete the OFX/QFX adapter: DTPOSTED read as a calendar day never shifted through an instant, TRNAMT/BALAMT read as magnitude + marker with no `parseFloat`, and full bank/card statement extraction into `StatementDraft` across five synthetic SGML/XML/QFX fixtures, all at 100% engine coverage.**

## Performance

- **Duration:** ~100 min (includes iterating coverage from 84.81% branches to 100% across three re-runs)
- **Tasks:** 2 completed / 2
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments

- `ofxLocalDate` reads `YYYYMMDD[HHMMSS[.XXX]][[±H[.MM]][:TZ]]` by taking the first 8 characters exactly as written and validating everything after them with a hand-written character scan (no regex, no `Date`/`Date.UTC`/`Date.parse` anywhere in the file) purely to reject malformed input -- the time and offset values themselves are never used to shift the date. A fast-check property proves this holds for 200 random valid dates across every offset form in the feature spec (`''`, `[0:GMT]`, `[-5:EST]`, `[+5.30:IST]`, `[-3]`, `[+14]`), with an arbitrary time-of-day.
- `parseOfxAmount` rejects any character outside `0-9+-.,` outright (so digit grouping, which OFX never sends, is refused rather than guessed at), picks whichever of `.`/`,` is present as the decimal mark, and delegates the actual magnitude/marker read to `parseNotatedAmount` (02-32) -- so excess trailing zeros beyond the currency's exponent are stripped and a non-zero excess is `too-many-decimals`, never rounded. A fast-check property round-trips 300 random integers through both decimal marks, exponents 0/2/3, and 0-2 extra trailing zeros.
- `parseOfx` splits the header, tokenizes, builds the tree (all three from 02-33), then walks the tree once collecting every `STMTRS`/`CCSTMTRS` in document order -- so a file mixing a bank and a card statement is never re-ordered by extracting each kind separately. Investment/loan-only files return `unsupported-statement`; a file with neither returns `no-statements`; tokenizer/tree errors (`no-ofx-root`/`too-large`/`too-deep`) pass straight through.
- Per row: `localDate` from `DTPOSTED` (null + `bad-date` on failure), `magnitude`/`marker` from `TRNAMT` (`amount-too-large` vs `bad-amount` by error kind, `zero-amount` on a true zero), `externalId` from `FITID`, `trnType` from `TRNTYPE` upper-cased, and a `description` built from `NAME` (or `PAYEE/NAME`) plus `MEMO` only when the memo adds text not already in the name, whitespace-collapsed and capped at 200 characters (`empty-description` when both are absent).
- `ACCTID`/`BANKID`/`BRANCHID` are never read anywhere in `parse.ts` (grep-verified); the layout signature is `'ofx|bank|<ACCTTYPE>'` or `'ofx|card'`, and a dedicated test asserts the fixtures' own `ACCTID` value (`99887766`) and `BANKID` (`000000`) never appear anywhere in `JSON.stringify(result)` across all five fixtures.
- Five hand-written synthetic fixtures (bank SGML, card SGML/QFX with positive purchases and one payment, OFX 2.x XML producing the identical draft shape as its SGML twin, a multi-statement file, and a card over its limit) plus a battery of inline-text edge cases (unsupported/no-statements, tokenizer budget errors, every description-assembly branch, every row-issue branch, unknown-currency, every optional-field-absent branch in `readStatedBalance`/`layoutSignatureFor`/`extractDraft`, and a no-leak case) bring `src/engine/ofx/` to 100% branch/line/function/statement coverage across all five files (`date.ts`, `amount.ts`, `parse.ts`, `tokenize.ts`, `tree.ts`).
- `npm run typecheck`, `npm run depcruise` (196 modules, 555 dependencies, no violations) and `npx eslint` on every new/modified file all pass clean (eslint: 0 errors, only the pre-existing `fast-check` default-import warning already present in 02-33's own test files).

## Task Commits

Each task followed RED (a `test(...)` commit with the implementation not yet present, confirmed failing on "Cannot find module") then GREEN (a `feat(...)` commit with the suite passing at 100% coverage):

1. **Task 1: `ofxLocalDate` and `parseOfxAmount`**
   - `ccd1203` (test) - failing tests for both modules, confirmed failing with "Cannot find module '../date'" / "'../amount'"
   - `d1e0404` (feat) - the implementations and the `engine/ofx` barrel's date/amount export lines
2. **Task 2: `parseOfx` statement extraction + fixtures**
   - `62ef8ff` (test) - failing tests and the 5 synthetic fixtures, confirmed failing with "Cannot find module '../parse'"
   - `5059899` (feat) - the implementation and the barrel's `parse` export line

**Plan metadata:** this commit (docs: complete plan) -- created by the orchestrator per the parallel-executor contract; this plan does not update STATE.md/ROADMAP.md itself.

## Files Created/Modified

- `src/engine/ofx/date.ts` - `ofxLocalDate`: first-8-characters date, grammar-checks and discards the optional time/offset
- `src/engine/ofx/amount.ts` - `parseOfxAmount`: OFX-specific decimal-mark detection, delegates to `parseNotatedAmount`
- `src/engine/ofx/parse.ts` - `parseOfx` and the `ParseOfxError`/`ParseOfxOptions` types: the statement extractor
- `src/engine/ofx/index.ts` - barrel extended with `date`, `amount`, then `parse` exports
- `src/engine/ofx/__tests__/date.test.ts` - grammar cases, malformed-input rejections, no-leak, never-shifts-a-day property
- `src/engine/ofx/__tests__/amount.test.ts` - notation cases, excess-decimal stripping, no-leak, magnitude/marker round-trip property
- `src/engine/ofx/__tests__/parse.test.ts` - golden fixtures, unsupported/no-statements, tokenizer/tree error passthrough, description assembly, row issues, currency handling, every-optional-field-absent branches, warnings, no-leak, barrel
- `src/engine/ofx/__tests__/fixtures/*.ofx`, `*.qfx` - 5 synthetic fixtures (documented as synthetic in `parse.test.ts`'s header comment)

## Decisions Made

See `key-decisions` in the frontmatter. In brief: `parseOfxAmount` refuses any second decimal-like mark outright rather than trying to guess grouping (OFX never sends it); the balance-only fields the extractor can't populate from OFX alone (`statedOpening`, `statedLimit`, `balanceLabel`, `labels`) are left `null`/`[]` by design, for 02-35/02-36 to fill in; a per-row `CURRENCY`/`ORIGCURRENCY` aggregate is deliberately never read since `TRNAMT` is always in `CURDEF`; and `isDigitRun`'s dead empty-string branch was removed (not synthetically tested) after tracing every call site proved it unreachable, following the same precedent 02-32 and 02-33 already set for this codebase's 100%-coverage engine folders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Three unreachable/undertested branches surfaced only once real coverage numbers were run**
- **Found during:** Task 1 and Task 2, after the first full-suite coverage run
- **Issue:** The plan's example list didn't spell out every branch a 100%-coverage gate demands. Three gaps surfaced: (a) `isDigitRun`'s `s.length === 0` guard was structurally unreachable from every real call site; (b) `isAsciiLetter`'s lower-case branch and `isValidTimePart`'s "stray trailing digit" branch in `date.ts` were untested; (c) `parse.ts`'s null-fallback branches for a missing `CURDEF`/`BANKACCTFROM`/`BANKTRANLIST`/`LEDGERBAL`/`BALAMT`/`DTASOF` were never exercised, since every fixture happened to include all of them
- **Fix:** Removed the one genuinely dead branch (`isDigitRun`) rather than adding a test that could never exercise real behaviour, matching 02-32/02-33's established precedent; added explicit test cases for the two `date.ts` branches and a new "every optional field absent" describe block in `parse.test.ts` (a minimal statement missing every optional tag, plus three targeted `LEDGERBAL` variants: no `BALAMT`, an unparseable `BALAMT`, and no `DTASOF`)
- **Files modified:** `src/engine/ofx/date.ts`, `src/engine/ofx/__tests__/date.test.ts`, `src/engine/ofx/__tests__/parse.test.ts`
- **Verification:** `npx jest src/engine/ofx --coverage` reached 100% branches/lines/functions/statements across all five files (date.ts, amount.ts, parse.ts, tokenize.ts, tree.ts) on the final run, 148 tests passing
- **Committed in:** folded into `d1e0404` (date.ts fix) and `5059899` (parse.test.ts additions, since the RED commit `62ef8ff` already carried the final test file before the GREEN implementation commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/undertested branches, entirely a coverage-completeness fix with no behavioural change to any function's documented contract)
**Impact on plan:** No scope creep. Every fix was either removing code proven dead or adding a test for behaviour the plan's `<behavior>` block already implied but didn't spell out as an explicit case.

## Issues Encountered

- The plan's literal verify command (`npx jest src/engine/ofx --coverage --collectCoverageFrom="src/engine/ofx/**/*.ts" --coverageThreshold="{...100...}"`) reports `index.ts` at a flat 0% on every metric -- this is a harmless 0/0 display artifact (a barrel file with only `export *` re-export statements has zero Istanbul-coverable statements to begin with) and does not affect the "global" aggregate, which correctly reflects only the four real source files. Confirmed by cross-checking against `jest.config.js`'s own per-directory `FULL` threshold (the mechanism 02-33 used successfully), which does not flag `index.ts` at all.
- Reaching 100% branch coverage on `parse.ts` took three iterations: the first coverage run flagged an apparently-contradictory "97.97% statements, 100% lines" combination, which turned out to mean every line executed at least once but several ternary/conditional branches (the "field absent" side of every optional OFX tag) never took their false arm, since all five golden fixtures happen to include every optional tag. Resolved by adding the dedicated "every optional field absent" test block rather than modifying any fixture (which would have changed the golden-path assertions).
- This worktree had no `node_modules`; `npm ci --legacy-peer-deps` was run once at the start of the session (matching the repo's committed `.npmrc`/CI convention), consistent with 02-32/02-33's own setup note.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 02-35 (convert/reconcile) and 02-36 (profile inference) can now call `parseOfx` to get `StatementDraft[]` for any OFX/QFX file, feeding the same `convertDraft`/reconciliation pipeline CSV drafts already use (per 02-32's `StatementDraft` contract) -- `src/engine/statement/convert.ts` and `reconcile.ts` already exist on this branch (landed by a concurrent wave-2 plan) and consume exactly the `StatementDraft` shape this plan produces.
- 02-04 (import intelligence/duplicates) can rely on `externalId` (OFX `FITID`, capped at 255 chars) as a duplicate-key *hint* -- this plan never treats it as unique, matching D-54's "FITID matching is switched off for a file with conflicting FITIDs" rule (enforced one layer up, in the duplicate-detection module, not here).
- No blockers identified for downstream statement-import plans. The five fixtures are documented in `parse.test.ts`'s header comment as synthetic-only; any future fixture built from a redacted real statement should be added alongside them, never replacing them.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 13 created/modified files confirmed present on disk (`date.ts`, `amount.ts`, `parse.ts`, `index.ts`, the 3 test files, the 5 fixtures, and this SUMMARY.md); all 4 task commits (`ccd1203`, `d1e0404`, `62ef8ff`, `5059899`) confirmed present in `git log`.
