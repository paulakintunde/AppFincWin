---
phase: 02-record
plan: 35
subsystem: engine
tags: [typescript, fast-check, jest, bigint, statement-import, money, reconciliation]

# Dependency graph
requires:
  - phase: 02-record (plan 02-32)
    provides: "StatementDraft/FormatProfile/ProfileResult contracts, parseNotatedAmount/markerSign, decodeText, sniffFormat"
provides:
  - "convertDraft/convertAmount/convertBalance/signOfPositive (src/engine/statement/convert.ts) -- converts a StatementDraft into the one stored sign rule (D-44) under a decided FormatProfile"
  - "reconcile (src/engine/statement/reconcile.ts) -- link/segment/same-day-group running-balance reconciliation (D-46) with BigInt sums and orientation chosen by counting, never sorting"
affects: ["02-36", "02-04", "02-33", "02-34"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DR/CR markers are absolute overrides applied before the profile's sign/balanceMeans multiplier -- dr/cr always resolve the same way regardless of positiveMeans or balanceMeans, matching D-44's stored rule for both amounts and balances"
    - "Anchor-to-anchor segment scan for reconciliation: walk positions with a real balance (or a reconstructed held-view value), checking BigInt(curAnchor) - BigInt(prevAnchor) against a BigInt segment sum; a stated opening serves as a virtual anchor at position -1, a stated closing only substitutes for missing running balances entirely (the 'ends-only' path), never alongside real anchors"
    - "Orientation chosen by counting verified links per hypothesis (file order vs. reversed), with a date-ascending-pair-count tie-break, falling back to 'as-is' -- never by sorting, which would silently re-order same-day rows"
    - "Available-credit files without a known limit reconstruct a synthetic held-view balance by accumulating each row's own availableDelta, seeded arbitrarily on each unbroken run -- since reconciliation only ever compares differences, an arbitrary seed never changes a result"
    - "noNegativeZero() helper: any arithmetic result that could legitimately be a computed -0 (a negation or multiplication of a zero magnitude) is normalized before minorUnits(), since -0 is numerically 0 but fails strict/Object.is identity and carries no sign meaning"

key-files:
  created:
    - src/engine/statement/convert.ts
    - src/engine/statement/reconcile.ts
    - src/engine/statement/__tests__/convert.test.ts
    - src/engine/statement/__tests__/reconcile.test.ts
  modified:
    - src/engine/statement/index.ts

key-decisions:
  - "DR/CR markers convert the same way on both amounts and balances, independent of the profile (positiveMeans/balanceMeans): dr always negative, cr always positive. This is a direct extension of the plan's amount-conversion rule ('DR/CR markers... convert dr -> negative and cr -> positive regardless of s') to balances, since the interfaces table's stated formula for an 'owed' balance under a 'cr' marker only produces the stated positive result under this reading, not under a literal '-(markerSign x magnitude)' evaluation"
  - "reconcile()'s per-row 'link' unit is an anchor-to-anchor segment, not a fixed-length window: the very first anchor found (with no preceding stated.opening) can never be verified on its own, since there is nothing to diff it against -- it stays 'no-balance' until a later anchor closes a segment against it. This applies equally to a dense running-balance file's row 0 and to an available-credit delta chain's first anchor row"
  - "A stated opening+closing pair is used two ways: as a virtual anchor at position -1 feeding the normal per-row segment scan (whenever real anchors exist), and separately as the sole check when there are no real anchors anywhere in the file (the 'ends-only' path, producing all-verified or ends-only-mismatch for every row). A stated closing never substitutes as a normal per-row anchor when real running balances exist elsewhere -- a failing ends check in that case reports through the links that are already failing, never as an extra flag"
  - "Same-day order jitter upgrades a whole contiguous same-localDate block to 'verified-as-group' only when at least one row inside it is currently 'cannot-verify' and the block's own boundary values (the balance immediately before the block, and the balance at the block's own last row) are both known and their difference equals the block's total. A block that already fully verifies, or whose boundary is unknown (start of file with no stated opening, or a block ending on a row with no balance of its own), is left alone"

patterns-established:
  - "Money round-trip render helpers in property tests (renderAmountMarker/renderBalanceMarker) invert a conversion function for property testing by choosing between only 'none' and 'minus' markers -- this sidesteps the dr/cr absolute-override branches entirely, keeping the round-trip property's arithmetic simple and exact"

requirements-completed: [REC-14, REC-15, REC-17]

# Metrics
duration: ~140min
completed: 2026-09-27
---

# Phase 2 Plan 35: Statement Conversion and Reconciliation Summary

**`convertDraft`/`convertAmount`/`convertBalance` apply a decided FormatProfile to raw statement magnitudes under D-44's one stored sign rule, and `reconcile` checks the result against running balances, a stated opening/closing pair, or an available-credit held-view delta chain using exact BigInt link-and-segment maths, with orientation chosen by counting verified links rather than sorting.**

## Performance

- **Duration:** ~140 min across two TDD cycles (Task 1: convert.ts, Task 2: reconcile.ts), including one bug found and fixed mid-Task-2 and several coverage-gap-closing test additions
- **Tasks:** 2 completed / 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `convertDraft` converts every row, plus `statedOpening`/`statedClosing`/`available`, from a `StatementDraft` into the app's one stored sign rule: money out negative, money in positive, an account balance positive when held and negative when owed. A DR/CR marker (or a debit/credit column, already turned into the same marker by the adapter) is a direct, profile-independent statement of direction on both amounts and balances. An available-credit balance converts to `owed = limit - available` when a limit is known; without one, each row instead carries a held-view `availableDelta` to the row immediately before it, and no limit is ever invented.
- `reconcile` walks anchor-to-anchor segments (rows carrying a real balance, or a reconstructed held-view value from `availableDelta`) under both file order and reversed order, picks whichever verifies more links (date-ascending count as the tie-break, never a sort), then applies a same-day-block upgrade for banks whose intra-day running-balance order differs from the file's own row order. Every sum is BigInt, proven exact at 5,000 rows near the 1e13 ceiling in both the segment-sum and whole-file-sum code paths. Negative balances -- including a wholly negative opening/running/closing sequence -- are never inspected or flagged anywhere in either file.
- Both files sit at 100% branch/line/function/statement coverage individually and as the whole `src/engine/statement` directory (102 tests → 107 after closing coverage gaps found by the exact plan-specified coverage command), with `depcruise` and a whole-project `tsc --noEmit` both green.

## Task Commits

1. **Task 1: `convertDraft` (RED then GREEN)**
   - `ecf90dd` (test) - failing tests for `convertAmount`/`convertBalance`/`signOfPositive`/`convertDraft`, including both fast-check properties
   - `115e255` (feat) - the implementation and the `engine/statement` barrel export
   - `5d3b8df` (fix) - a `-0` correctness bug found while writing Task 2's tests (see Deviations)
2. **Task 2: `reconcile` with BigInt links, segments and groups (RED then GREEN), coverage**
   - `0abb4a0` (test) - failing tests for every reconcile case and both properties
   - `b204837` (feat) - the implementation, additional coverage-closing tests, and the completed barrel

**Plan metadata:** this commit is created by the orchestrator per the parallel-executor contract; this plan does not update STATE.md/ROADMAP.md itself.

_Note: this is a `type: tdd` plan -- each task followed RED (a `test(...)` commit confirmed failing on "Cannot find module") then GREEN (a `feat(...)` commit passing at the required coverage threshold), per `<tdd_execution>`'s gate sequence._

## Files Created/Modified

- `src/engine/statement/convert.ts` - `convertDraft`, `convertAmount`, `convertBalance`, `signOfPositive`; the D-44 stored-sign-rule conversion
- `src/engine/statement/reconcile.ts` - `reconcile`; link/segment/same-day-group running-balance reconciliation (D-46), BigInt throughout
- `src/engine/statement/index.ts` - barrel: added `export * from './convert'` and `export * from './reconcile'`
- `src/engine/statement/__tests__/convert.test.ts` - full example-case coverage per the plan's behavior block, plus two fast-check properties and a deterministic `-0` regression suite
- `src/engine/statement/__tests__/reconcile.test.ts` - full example-case coverage (orientation, perturbation, deletion, sparse segments, same-day jitter, ends-only, no-balance, availableDelta, null-amount links), a negative-balance property test, and two 5,000-row BigInt precision tests

## Decisions Made

See `key-decisions` in the frontmatter above for the four load-bearing ones (DR/CR as an absolute override on balances too; the first anchor in any chain is unverifiable without a preceding value; stated opening/closing's dual role as both a virtual anchor and the sole ends-only check; and the same-day upgrade's exact trigger conditions). All four were necessary readings of the plan's interfaces table and RESEARCH.md algorithm description to make the code and the plan's own worked examples agree exactly -- none is a scope change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `-0` produced by owed/held balance conversion at exactly zero**
- **Found during:** Task 2, while writing the reconcile round-trip property test (a fast-check counterexample: `opening=0`, `positiveMeans='money-in'`, `balanceMeans='owed'`, an empty rows array)
- **Issue:** `convertBalance`'s `owed` branch computes `-(sign * magnitude)`; when `magnitude` is exactly 0, this is IEEE-754 `-0`, which is numerically equal to 0 but fails `Object.is`/`toBe` identity checks and has no sign meaning under D-44 (a balance of nothing is neither "held" nor "owed"). The same risk exists in every other negation/multiplication path in `convert.ts` (`convertAmount`'s `dr` and `s*rawSign*magnitude` paths, `convertBalance`'s `held`/`available` paths, `heldSignedValue`, and the `availableDelta` subtraction)
- **Fix:** Added a local `noNegativeZero(n)` helper (`return n === 0 ? 0 : n`) and wrapped every arithmetic result that could legitimately produce a computed zero before handing it to `minorUnits()`
- **Files modified:** `src/engine/statement/convert.ts`, `src/engine/statement/__tests__/convert.test.ts`
- **Verification:** Added five deterministic `Object.is(result, 0)` tests (one per affected code path) so the fix does not depend on fast-check's random seed happening to generate a zero magnitude; all pass, and the whole-directory coverage command stays green across repeated runs
- **Commit:** `5d3b8df`

**2. [Rule 3 - Blocking] `npm ci` and Windows Jest `testMatch` glob** -- not encountered this session; `node_modules` and the harness's forward-slash `roots`/`testMatch` fix (documented in 02-32's SUMMARY) were already in place in this worktree, so no repeat action was needed here.

---

**Total deviations:** 1 auto-fixed (Rule 1, a real correctness bug in already-committed code, caught by property testing before it could reach any downstream plan)
**Impact on plan:** No scope creep -- the fix is a one-line-per-call-site normalization plus deterministic regression tests; every other file and behavior matches the plan exactly.

## Issues Encountered

- Reaching 100% branch coverage on `reconcile.ts` took three iterations beyond the initial GREEN pass: the coverage tool flagged specific uncovered branches (`sumAllAmountsBigInt`'s null-amount short-circuit; the same-day-block `hasFailing`/boundary-value conditionals; the date-ascending tie-break's `reversed` outcome) that the plan's own example-test list didn't spell out explicitly as distinct scenarios. Each was added as a dedicated, manually-traced test (a same-date block that already verifies normally with no upgrade attempted; one at the very start of a file with no stated opening so it has no boundary value before it; one whose own last row lacks a balance so it has no boundary value after it; one starting mid-file so the boundary value comes from the preceding row's own balance rather than `stated.opening`; and a minimal two-row case where the date tie-break alone -- with both orientations tied at zero verified links -- selects `'reversed'`), each traced by hand against the implementation before being written, since a wrong expectation here would silently mask a real bug rather than catch one.
- The `-0` bug (see Deviations) was only found because a property test with an empty-array/zero-opening edge case happened to be generated by fast-check on one run; a second coverage run without the fix's accompanying deterministic tests would have been flaky (passing or failing coverage depending on whether that specific random case appeared), which is why explicit `Object.is` tests were added rather than relying on the property test to keep re-finding it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-36 (format-profile inference) can now import `convertDraft`/`convertAmount`/`convertBalance` and `reconcile` from `src/engine/statement` to run the D-41 "does this candidate profile reconcile?" check that `RESEARCH.md` §A2 describes -- `reconcile`'s `ReconcileRow` shape (`amount`/`balance`/`localDate`/`availableDelta`) is deliberately decoupled from `ConvertedRow` so 02-36 can map a `ConvertedStatement`'s rows into it without any dependency from `reconcile.ts` back onto `convert.ts`.
- Plan 02-04 (duplicate/transfer detection) and any later import-pipeline plan can rely on `ConvertedRow.rawAmount`/`rawBalance` being passed through untouched for provenance, and on `reconcile`'s per-row/per-file results never claiming a false "verified" (an `ends-only-mismatch` or a `cannot-verify` row is always reported honestly, per the threat register's T-02-35-03 mitigation).
- No blockers identified for downstream statement-import plans.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 5 created/modified files confirmed present on disk; all 5 task commits (`ecf90dd`, `115e255`, `5d3b8df`, `0abb4a0`, `b204837`) confirmed present in `git log`.
