---
phase: 02-record
plan: 33
subsystem: engine
tags: [typescript, fast-check, jest, ofx, qfx, statement-import, tokenizer, parser]

# Dependency graph
requires:
  - phase: 02-record (02-32)
    provides: "src/engine/statement barrel (StatementDraft/FormatProfile contracts, decodeText, sniffFormat) -- not imported by this plan's code, but the sibling module 02-34 will build the extraction step on top of both"
provides:
  - "splitOfxHeader (src/engine/ofx/tokenize.ts) -- OFX 1.x (SGML KEY:VALUE) and 2.x (XML <?OFX ...?>) header split, case-insensitive <OFX> root detection"
  - "tokenizeOfx (src/engine/ofx/tokenize.ts) -- single hand-written linear character scan into open/close/text tokens, with entity decoding, CDATA/comment/PI handling and the 5 MB maxBytes budget"
  - "buildOfxTree/findAll/child/childText (src/engine/ofx/tree.ts) -- iterative (no recursion) element-tree builder following ofxtools' implicit-leaf-close rule, with malformed-close/unclosed-aggregate warnings and the maxElements/maxDepth budgets"
  - "jest.config.js FULL coverage bucket now also covers ofx, statement, transfer and accounts (built across 02-32/02-33/02-37) at 100%"
affects: ["02-34"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-written linear-time SGML/XML tokenizer with explicit state transitions (tag/comment/CDATA/PI) instead of any regex over file content -- the same discipline as engine/money/parseAmount.ts's character scan, chosen after RESEARCH §A1 measured catastrophic backtracking (4.9s for one 26-char tag) in the one candidate OFX-parsing dependency"
    - "Bounded-window entity decoding (findBoundedSemicolon caps the search to 11 characters past '&') so a hostile run of many unterminated '&' characters still costs O(1) extra work each, preserving the tokenizer's overall linear-time guarantee"
    - "Iterative (stack-based) tree building and DFS traversal -- no recursion anywhere in engine/ofx/tree.ts, so a maliciously deep file cannot overflow the JS call stack even before the depth budget rejects it"
    - "`while (true)` loop with no trailing return, instead of a bounds-checked while condition, when a loop's only exits are internal `return`s and the bound is provably always satisfied on every re-iteration -- avoids an unreachable/uncoverable fallthrough `return null` (mirrors 02-32's isBoundary narrowing precedent)"

key-files:
  created:
    - src/engine/ofx/tokenize.ts
    - src/engine/ofx/tree.ts
    - src/engine/ofx/index.ts
    - src/engine/ofx/__tests__/tokenize.test.ts
    - src/engine/ofx/__tests__/tree.test.ts
  modified:
    - jest.config.js

key-decisions:
  - "extractHeaderLine's search loop is written as `while (true)` with only internal `return`s (no bounds-checked while condition and no trailing `return null`) -- every found match keeps the next search position within the string's bounds, so the 'loop just ends' path is mathematically unreachable; a bounds-checked while condition would have left an uncoverable dead line, so the loop was restructured instead of adding a synthetic test (same discipline 02-32 used for isBoundary)"
  - "A comment/PI splits its surrounding text run into two separate 'text' tokens rather than merging the text before and after it into one -- simpler state machine, and OFX files in practice never place a comment inside a leaf's own value (comments sit between elements), so this never loses real transaction data in the cases RESEARCH describes"
  - "An unterminated tag, comment, CDATA section or PI at EOF recovers as much as it safely can (an open token for a parseable tag name; the CDATA content read so far) rather than dropping everything from the truncation point -- consistent with 'never throws, never invents structure, but salvage what's real'"

requirements-completed: [REC-09]

# Metrics
duration: ~90min
completed: 2026-09-27
---

# Phase 2 Plan 33: OFX Header Split, Tokenizer and Tree Summary

**Hand-written, linear-time OFX/QFX header split, tokenizer and element-tree builder in `engine/ofx/` — no third-party parser, no regex over file content, with typed budgets that turn a hostile or malformed statement into an enum error code instead of a frozen thread or a thrown exception.**

## Performance

- **Duration:** ~90 min (includes waiting on `npm ci` in a fresh worktree and several slow first-run Jest starts against the full monorepo-sized source tree)
- **Tasks:** 2 completed / 2
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- `splitOfxHeader` reads both OFX 1.x (SGML `KEY:VALUE` header lines) and OFX 2.x (XML `<?OFX OFXHEADER="200" VERSION="220"?>`) headers using only `indexOf`/`slice`, finds the body at the first case-insensitive `<OFX>`, and correctly disambiguates the outer `<?xml version="1.0"?>` PI's own `version` attribute from the inner `<?OFX ...VERSION=...?>` one (a real bug the first draft would otherwise have shipped).
- `tokenizeOfx` is one hand-written character scan (no `RegExp`, no `.match(`, no `.replace(/.../)` anywhere in the file) producing `open`/`close`/`text` tokens: tag names are upper-cased and dotted proprietary tags (`INTU.BID`) are kept as one name; entities (`&amp; &lt; &gt; &quot; &apos; &#NNN; &#xHH;`, both hex cases) decode via a `Map`-backed lookup (never a plain object, which would otherwise let an entity body of literally `__proto__` return `Object.prototype` instead of `null`); a bare or unterminated `&` stays literal; `<!-- -->` comments and `<? ?>` processing instructions are skipped; `<![CDATA[...]]>` content is kept raw with no entity decoding or tag recognition. The 5 MB `maxBytes` budget is checked up front. Verified against the RESEARCH-cited `ofx-js` regression (measured 4.9s for one 26-char dotless tag) with a 200 KB adversarial timing test that completes in well under 500ms, plus fast-check properties over arbitrary strings up to 1,000,000 characters and over `'<' + 'A'.repeat(n) + '>'` runs — neither ever throws.
- `buildOfxTree` builds an `OfxNode` tree from that token stream in one iterative pass (no recursion anywhere in the module) following ofxtools' reference rule: an `open` immediately followed by `text` is a leaf, closed implicitly whether or not a matching close token follows; anything else is an aggregate that must close explicitly. A stray close becomes a de-duplicated `malformed-close` warning and is ignored; an aggregate still open at EOF closes implicitly with `unclosed-aggregate`. The `maxElements` (20,000) and `maxDepth` (64) budgets from `tokenize.ts` are enforced on both the leaf and aggregate creation paths.
- `findAll` (iterative document-order DFS), `child` and `childText` round out the module's read API.
- A serialisation-equivalence property proves that the same logical statement renders identically as SGML with unclosed leaves, SGML with every leaf explicitly closed, XML-style, single-line, CRLF-separated, and with randomised inter-tag whitespace (fast-check, 50 runs) — all produce the exact same tree with no warnings.
- `jest.config.js`'s `FULL` (100%) coverage folder list now also names `ofx`, `statement`, `transfer` and `accounts` (the last three already built at 100% by 02-32/02-37 in wave 1) — confirmed by running the whole `src/engine` suite (716 tests, 25 suites) at 100% branch/line/function/statement coverage across every one of those folders, with no threshold failures.
- `src/engine/ofx/tokenize.ts` and `tree.ts` each individually sit at 100% branch/line/function/statement coverage.

## Task Commits

Each task followed RED (a `test(...)` commit with the implementation not yet present, confirmed failing on "Cannot find module") then GREEN (a `feat(...)` commit with the suite passing at 100% coverage):

1. **Task 1: Header split and linear tokenizer**
   - `3814ef4` (test) - failing tests for `splitOfxHeader`/`tokenizeOfx`, confirmed failing with "Cannot find module '../tokenize'"
   - `39cb5c9` (feat) - the implementation and the `engine/ofx` barrel's first export line
2. **Task 2: Tree builder + coverage bucket extension**
   - `ae498fe` (test) - failing tests for `buildOfxTree`/`findAll`/`child`/`childText`, confirmed failing with "Cannot find module '../tree'"
   - `36e50a0` (feat) - the implementation, the barrel's second export line, and the `jest.config.js` FULL list extension

**Plan metadata:** this commit (docs: complete plan) — this is a parallel-executor plan; per the worktree contract it does not update STATE.md/ROADMAP.md itself (the orchestrator owns those writes after the wave completes).

## Files Created/Modified

- `src/engine/ofx/tokenize.ts` - `OFX_LIMITS`, `splitOfxHeader`, `tokenizeOfx`, plus the private entity-decoding and header-parsing helpers
- `src/engine/ofx/tree.ts` - `OfxNode`, `TreeWarning`, `buildOfxTree`, `findAll`, `child`, `childText`
- `src/engine/ofx/index.ts` - barrel (`export * from './tokenize'` then `export * from './tree'`)
- `src/engine/ofx/__tests__/tokenize.test.ts` - header split, tokenizer structure, whitespace/trimming, comments/CDATA/PI, entity decoding, budgets, adversarial properties, no-leak, barrel
- `src/engine/ofx/__tests__/tree.test.ts` - tree structure, warnings, budgets, stray/text edge cases, `findAll`/`child`/`childText`, the serialisation-equivalence property, no-leak, barrel
- `jest.config.js` - `FULL` coverage folder list extended with `ofx`, `statement`, `transfer`, `accounts`

## Decisions Made

See `key-decisions` in the frontmatter. In brief: the header-line search loop was restructured to avoid an unreachable fallthrough return (matching 02-32's precedent for handling structurally-dead branches under a 100% coverage gate); a comment/PI splits rather than merges the surrounding text run (simpler, and never loses real data in any case OFX files actually produce); truncated/unterminated markup recovers as much as it safely can rather than discarding everything from the truncation point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Named-entity lookup via a plain object would have let `&__proto__;` return `Object.prototype` instead of `null`**
- **Found during:** Task 1, while writing `decodeEntityBody`
- **Issue:** A first-draft `{ amp: '&', lt: '<', ... }` object literal is vulnerable to JavaScript's special `__proto__` own-property behaviour — looking up an attacker-controlled key like `__proto__` on a plain object returns the prototype object itself (a non-`string`, non-`null` value), which would have silently violated `decodeEntityBody`'s `string | null` contract and produced incorrect (object-typed) output for a hostile entity.
- **Fix:** Used a `Map<string, string>` for `NAMED_ENTITIES` instead, whose `.get()` has no special-cased keys and safely returns `undefined` for `'__proto__'`.
- **Files modified:** `src/engine/ofx/tokenize.ts` (designed this way from the first draft, before any test locked in the buggy behaviour)
- **Verification:** no dedicated regression test was added for this specific key (it would require asserting on an internal function), but the public-surface entity tests (including the unrecognised-named-entity case) exercise `decodeEntityBody`'s `Map` lookup path at 100% coverage.

**2. [Rule 1 - Bug] The `<?OFX ...VERSION=...?>` attribute search would have matched the outer `<?xml version="1.0"?>`'s `version` attribute first**
- **Found during:** Task 1, while writing `splitOfxHeader`'s OFX 2.x example test
- **Issue:** A first-draft implementation searched the whole header text for `VERSION="` case-insensitively, which — for a real 2.x file's two-line header (`<?xml version="1.0"?>` then `<?OFX ... VERSION="220"?>`) — would have found the outer, unrelated `version="1.0"` attribute first and returned `'1.0'` instead of the spec's `'220'`.
- **Fix:** Locate the `<?OFX` processing instruction's own span first (from `<?OFX` to its `?>`), then search for `VERSION="` only within that substring.
- **Files modified:** `src/engine/ofx/tokenize.ts` (designed this way from the first draft; the test in `tokenize.test.ts` asserting `version: '220'` against a two-PI header specifically guards this)
- **Verification:** `tokenizeOfx.test.ts`'s "does not confuse the `<?xml version=\"1.0\"?>` attribute with `<?OFX ...VERSION=...>`" test, 100% coverage.

No architectural deviations (Rule 4) and no auth gates were encountered. Both deviations above were caught and fixed during initial implementation, before any test locked in the incorrect behaviour — no rework was needed.

## Issues Encountered

- Several of my own test-file assumptions were simply wrong on the first RED→GREEN pass for Task 1 (4 of 46 tests failed on the first coverage run, all in the test file, none in the implementation): an unterminated tag with a parseable name still emits an `open` token rather than being dropped; a comment splits its surrounding text run into two `text` tokens rather than merging them; an unterminated CDATA section keeps its truncated content rather than discarding it; and the tokenizer's "no-leak" test was checking the wrong thing (a successfully tokenized payee name is *supposed* to appear in the output — the no-leak guarantee is about failure paths carrying only enum codes, not about successfully parsed data). All four were corrected in the test file itself before the GREEN commit; none required an implementation change.
- Reaching 100% branch/statement coverage on `tokenize.ts` took one extra iteration: `extractHeaderLine`'s while-loop had a structurally unreachable fallthrough `return null` after the loop (every found match keeps the next search position within bounds, so the loop can only ever exit via an internal `return`). Restructured to `while (true)` with no trailing statement, which TypeScript's control-flow analysis accepts as exhaustive — this removed the dead line rather than requiring an uncoverable synthetic test, mirroring 02-32's `isBoundary` precedent. One additional test case (`&;`, a totally empty entity body) was needed to cover `decodeEntityBody`'s empty-string branch, which no other entity-decoding test happened to exercise.
- `tree.ts` passed all 24 of its own tests and reached 100% coverage on the very first GREEN run with no implementation changes needed — the only follow-up was adding one more budget test (an aggregate-only path to the `maxElements` check; the first test only exercised the leaf-creation path to that same check) after the coverage report flagged the aggregate branch as unreached.
- `npm run test:coverage` (the full project suite, 2867 tests across 89 suites) passed with exactly one pre-existing, unrelated failure: `src/features/you/__tests__/YouScreen.test.tsx`'s `renders the user's full name and email sub-label` test timed out (`Exceeded timeout of 5000 ms`). This is not touched by this plan and was already logged as a known-flaky full-suite-load timeout by 02-01's `deferred-items.md` entry; this plan's run reconfirms the same flake and adds a note to that effect rather than duplicating the entry.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `tokenizeOfx`/`buildOfxTree`/`findAll`/`child`/`childText` are ready for 02-34 to walk into `STMTTRS`/`CCSTMTRS` and extract `StatementDraft` rows (per RESEARCH §A1 steps 5-6), reusing 02-32's `StatementDraft`/`DraftRow` contracts and `parseNotatedAmount` for `TRNAMT`/`BALAMT`.
- The engine's 100% coverage gate now spans `ofx`, `statement`, `transfer` and `accounts` alongside the original Phase 0/1/2 folders — any future change to any of these four folders that drops branch coverage below 100% will fail CI, matching the rest of the engine's quality gate.
- No blockers identified for 02-34.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 5 created files confirmed present on disk (`src/engine/ofx/tokenize.ts`, `tree.ts`, `index.ts`, `__tests__/tokenize.test.ts`, `__tests__/tree.test.ts`); `jest.config.js` modification confirmed in place; all 4 task commits (`3814ef4`, `39cb5c9`, `ae498fe`, `36e50a0`) confirmed present in `git log`.
