---
phase: 02-record
plan: 36
subsystem: engine
tags: [typescript, fast-check, jest, statement-import, money, format-profile, reconciliation]

# Dependency graph
requires:
  - phase: 02-record (plan 02-32)
    provides: "StatementDraft/FormatProfile/ProfileResult/AccountKind/accountFamilyOf/LabelEvidence contracts"
  - phase: 02-record (plan 02-35)
    provides: "convertDraft/convertAmount/convertBalance (src/engine/statement/convert.ts), reconcile (src/engine/statement/reconcile.ts)"
provides:
  - "inferProfile/flipProfile/candidateProfiles/balanceMeansFor (src/engine/statement/profile.ts) -- decides a statement's format profile (D-41 as amended by D-53) anchored on the target account's kind, or returns an honest ambiguous result"
affects: ["02-26 (import pipeline, calls inferProfile before converting anything)", "02-04 (duplicate/transfer detection, downstream of a decided profile)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolution order as a strict pipeline of early returns: remembered profile -> structural labels (debit/credit columns, dr/cr markers) -> payment/income-row sign -> OFX TRNTYPE agreement -> running-balance reconciliation -> weak-prior-ordered ambiguous fallback. Each stage either decides or falls through -- never partially decides"
    - "statedLimit is computed independently of which sign candidate (s) is chosen -- both convertBalance's 'owed' and 'held' formulas are s-independent, so deriveOfxCardLimit/deriveBankOverdraftLimit are called once with whichever profile the pipeline settles on, not per-candidate"
    - "Dead-branch elimination over redundant null-checks: deriveOfxCardLimit/deriveBankOverdraftLimit inline the sign*magnitude formula directly instead of calling convertBalance (which can never return null for a fixed 'owed'/'held' balanceMeans), mirroring the isBoundary type-narrowing precedent from plan 02-32's parseNotatedAmount.ts"
    - "A remembered profile is accepted only when source and accountFamily match, and (no balance evidence in the file at all) OR (its own reconcile verifiedLinks count is not worse than its flip's) -- never re-applied silently against a file that would actually reconcile better under the opposite sign"

key-files:
  created:
    - src/engine/statement/profile.ts
    - src/engine/statement/__tests__/profile.test.ts
    - src/engine/statement/__tests__/fixtures/ledgers.ts
  modified:
    - src/engine/statement/index.ts

key-decisions:
  - "PAYMENT_LIKE_CARD/INCOME_LIKE_DEPOSIT are the literal exported constant names (matching Task 1's action-block code sample), rather than a single 'PAYMENT_LIKE_PATTERNS' name loosely mentioned in the plan's artifact-provides prose -- the acceptance-criteria greps only check for reconcile(/convertDraft(/no-console-or-throw/no-RegExp, none of which name a specific constant, so the concrete code sample took precedence"
  - "The structural-label branch (debit-credit-columns/direction-column/dr-cr-markers) picks the money-in candidate arbitrarily and marks decidedBy 'labels' without inspecting individual row markers -- relies on the documented invariant that these three labels only ever apply when every row's marker is already dr/cr, which convertAmount treats as an absolute override independent of positiveMeans (verified directly against plan 02-35's convert.ts)"
  - "The weak-prior ordering (step 4, ambiguous fallback) counts each row's raw marker sign (ignoring rows with a null or zero magnitude) and prefers whichever candidate would classify the raw majority as spending -- majority raw-positive prefers money-spent first, majority raw-negative prefers money-in first, an exact tie defaults to money-spent-first (the prototype's baseline prior: most real statement lines are spending)"
  - "Coverage-closing tests (bank overdraft edge cases -- valid whole-10,000 multiple, non-multiple, no-overdraft; OFX card limit edge cases -- the -0 guard at exactly-offsetting figures, a negative computed figure; remembered-profile source/accountFamily mismatch; income-row-sign; an OFX TRNTYPE outside CREDIT/DEBIT; the reconciliation tie-break's money-spent-wins branch; a CSV limit-label value copied verbatim) were folded into Task 1's GREEN commit rather than deferred to Task 2, since Task 1's own verify block requires 100% coverage of src/engine/statement before Task 2 begins -- mirrors the precedent in plan 02-35's SUMMARY (Task 2's GREEN commit explicitly bundled 'the implementation, additional coverage-closing tests, and the completed barrel')"

patterns-established:
  - "Ledger fixture generator (fixtures/ledgers.ts, test-only): arbLedger() generates a true stored-convention ledger (opening + signed amounts); renderDraft() reverse-engineers the raw magnitude/marker pair that would make convertDraft recover that exact ledger under a chosen sign candidate, balance meaning and physical row order -- the same reverse-engineering technique any future engine/statement property test needing a self-consistent StatementDraft should reuse rather than hand-deriving numbers per test"

requirements-completed: [REC-13, REC-15, REC-17]

# Metrics
duration: ~170min
completed: 2026-09-27
---

# Phase 2 Plan 36: Format-Profile Inference Summary

**`inferProfile` decides a statement's sign convention and balance meaning by anchoring the balance family on the target account's kind (D-53), then working through labels, then running-balance reconciliation under both sign candidates, falling back to an honest `ambiguous` result with a weak-prior ordering when nothing decides -- the mirror reading is never offered as an alternative once the account kind fixes the balance meaning.**

## Performance

- **Duration:** ~170 min across two TDD cycles (Task 1: ledger fixtures + `profile.ts` + coverage-closing tests; Task 2: numRuns raise, ambiguity-table confirmation), including diagnosing a false-positive coverage gap traced to a genuinely dead null-check branch
- **Tasks:** 2 completed / 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `inferProfile(draft, target, remembered)` implements the plan's full resolution order: a matching remembered profile is re-reconciled and only reused when not worse than its flip (D-42); structural label evidence (separate debit/credit columns, a direction column, DR/CR markers) decides outright since those markers are absolute overrides in `convertAmount` regardless of sign; a payment-like description on a card (`PAYMENT - THANK YOU`, `PAYMENT RECEIVED`, `DIRECT DEBIT PAYMENT`, ...) or an income-like description on a deposit account (`SALARY`, `PAYROLL`, `INTEREST PAID`, `WAGES`) reveals the sign from that row's own raw marker; OFX `TRNTYPE` majority agreement decides when present; running-balance reconciliation under both sign candidates decides when a file carries balances and one candidate reconciles strictly better; otherwise the result is `ambiguous` with both candidates ordered by a majority-raw-sign prior, never silently guessed.
- `balanceMeansFor`/`candidateProfiles`/`flipProfile` match the plan's interfaces exactly: the target kind fixes `held`/`owed`/`available`/`none`, the two candidates share `accountFamily`/`balanceMeans` and differ only in `positiveMeans`, and `flipProfile` is a clean involution on every field except `decidedBy` (always forced to `'user'`).
- `statedLimit` is derived, never invented: a CSV `limit-label` column value is copied verbatim; an OFX card's `LEDGERBAL` (owed) + `AVAILBAL` (available) pair derives a card limit as `owed + available`, guarded against a negative or spuriously-computed `-0` result; a bank's `AVAILBAL - LEDGERBAL` derives an overdraft limit only when the difference is a whole multiple of 10,000 minor units (the plan's LOW-confidence heuristic), otherwise `null`.
- `src/engine/statement` (7 files: `types`, `decodeText`, `sniffFormat`, `convert`, `reconcile`, `profile`, barrel) sits at 100% branch/line/function/statement coverage as a whole directory (150 tests), with `depcruise` and a whole-project `tsc --noEmit` both green.

## Task Commits

1. **Task 1: Ledger fixture generator + `inferProfile` (RED then GREEN)**
   - `f5b81f8` (test) - failing tests for every `inferProfile` case and both fast-check properties from the plan's behavior block; confirmed RED by temporarily moving `profile.ts` aside and observing "Cannot find module '../profile'"
   - `ab87c08` (feat) - the implementation, the `engine/statement` barrel export, and coverage-closing tests needed to reach the plan's 100%-coverage verify gate (bank-overdraft and OFX-limit edge cases, remembered-profile mismatch paths, income-row-sign, an unrecognised OFX TRNTYPE, and the reconciliation tie-break's money-spent-wins branch)
2. **Task 2: Flip, remembered-profile paths and the ambiguity table**
   - `79b7ef1` (test) - raised the "mirror never offered" property to `numRuns: 500`; confirmed every row of RESEARCH.md §A2's ambiguity table already has an explicit example test (folded into Task 1's coverage work, per the deviation below); re-verified `npx jest src/engine/statement` (150/150), `npm run depcruise`, `npm run typecheck` all green

**Plan metadata:** this commit is created by the orchestrator per the parallel-executor contract; this plan does not update STATE.md/ROADMAP.md itself.

_Note: this is a `type: tdd` plan -- Task 1 followed RED (a `test(...)` commit confirmed failing on "Cannot find module") then GREEN (a `feat(...)` commit passing at the required 100% coverage threshold), per `<tdd_execution>`'s gate sequence. Task 2 is a `test(...)`-only commit since its remaining scope (raising `numRuns`, confirming ambiguity-table coverage) required no further implementation changes -- see Deviations._

## Files Created/Modified

- `src/engine/statement/profile.ts` - `inferProfile`, `flipProfile`, `candidateProfiles`, `balanceMeansFor`, `PAYMENT_LIKE_CARD`, `INCOME_LIKE_DEPOSIT`; the D-41/D-53 format-profile resolution order
- `src/engine/statement/__tests__/profile.test.ts` - full example-case coverage per the plan's behavior block and RESEARCH.md §A2's ambiguity table, two fast-check properties (one at `numRuns: 500`), and coverage-closing edge-case tests
- `src/engine/statement/__tests__/fixtures/ledgers.ts` - test-only ledger fixture generator (`arbLedger`/`renderDraft`) reused by both property tests
- `src/engine/statement/index.ts` - barrel: added `export * from './profile'`

## Decisions Made

See `key-decisions` in the frontmatter above for the four load-bearing ones (the exported constant names vs. the plan's looser prose; the structural-label branch's reliance on the dr/cr-override invariant; the weak-prior ordering's exact tie-break; and folding coverage-closing tests into Task 1's GREEN commit rather than deferring them to Task 2). None is a scope change -- all are readings needed to make the plan's own interfaces table, RESEARCH.md algorithm description and 100%-coverage gate agree exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two structurally dead null-check branches in the statedLimit derivation**
- **Found during:** Task 1, closing the plan's own 100%-coverage verify gate
- **Issue:** `deriveOfxCardLimit`/`deriveBankOverdraftLimit` originally called `convertBalance` and checked its result for `null`. Since `deriveStatedLimit` only ever calls these two functions when `profile.balanceMeans` is already fixed to `'owed'`/`'held'` respectively, and `convertBalance`'s `'owed'`/`'held'` branches never return `null` (only its `'available'`/`'none'` branches can), the null-check branch was unreachable through the actual call path -- a coverage gap that no test could close honestly, since writing one would require calling `convertBalance` in a way the real code never does
- **Fix:** Inlined the `sign(marker) * magnitude` formula directly (algebraically identical to `-convertBalance(...)` for 'owed' and `convertBalance(...)` for 'held'), removing the dependency on `convertBalance` and the dead branch entirely -- mirrors the precedent in plan 02-32's SUMMARY, where `parseNotatedAmount.ts`'s `isBoundary` parameter type was narrowed from `string | undefined` to `string` for the same reason (a call-site invariant made a branch structurally unreachable)
- **Files modified:** `src/engine/statement/profile.ts`
- **Verification:** Re-ran the plan's exact coverage command; `profile.ts` reached 100% branches/lines/functions/statements with no remaining gaps
- **Commit:** `ab87c08`

**2. [Rule 3 - Blocking] `npm ci` required before any test could run**
- **Found during:** start of execution
- **Issue:** The worktree had no `node_modules`
- **Fix:** Ran `npm ci --legacy-peer-deps` per this repo's committed `.npmrc`/CI convention
- **Files modified:** none (dependency install only)
- **Verification:** subsequent `npx jest`/`tsc`/`depcruise` invocations resolved correctly

**3. [Rule 3 - Blocking] Jest's `testMatch` glob resolves to zero files inside this worktree's path**
- **Found during:** first attempted test run
- **Issue:** Same root cause documented in plan 02-32's and 02-35's SUMMARYs -- the `.claude\worktrees\agent-...` path segment breaks `<rootDir>`-based glob resolution on Windows
- **Fix:** All verification commands in this session used an explicit all-forward-slash `--testMatch` CLI override, never editing `jest.config.js`
- **Files modified:** none
- **Verification:** RED run correctly reported "Cannot find module"; GREEN runs correctly reported passing coverage tables

---

**Total deviations:** 3 auto-fixed (1 real dead-code bug found while closing the coverage gate, 2 blocking/environmental prerequisites carried forward from prior plans in this phase)
**Impact on plan:** No scope creep. Task 2's scope turned out lighter than its action text implies, because Task 1's own 100%-coverage requirement already forced every ambiguity-table row and the flip/remembered paths to be pinned by an explicit test before Task 2 started -- documented above rather than manufacturing redundant duplicate tests.

## Issues Encountered

- Reaching 100% branch coverage took three iterations: the plan's own listed behavior cases left several genuinely untested branches (the `-0`/negative-limit guards on both `statedLimit` derivations, `draft.statedLimit` already set, a remembered profile with a mismatched `source`/`accountFamily`, `income-row-sign`, an OFX `TRNTYPE` outside `CREDIT`/`DEBIT`, and the reconciliation tie-break's `moneySpent`-wins side) -- each closed with a manually-traced, self-consistent test (numbers worked out by hand against `convert.ts`'s actual formulas, not guessed) rather than suppressed.
- One coverage report was initially misread as "the OFX card limit body never executes" (lines spanning the `closingConverted === null` check); a temporary `console.error` trace proved the body does execute and returns the correct value, which redirected the fix from "add a test" to "the branch is dead code" (see Deviation 1) -- the right call given Istanbul's line-range compression can make a single untested *branch* look like an untested *statement block*.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-26 (the import pipeline) can now call `inferProfile(draft, { kind, limit }, remembered)` from `src/engine/statement` before converting anything, exactly as REC-13's "work out the format first" behavior requires -- a `decided` result carries the profile to hand to `convertDraft`/`reconcile` (02-35), and an `ambiguous` result blocks commit until the user picks a candidate via the format-confirmation screen (02-UI-SPEC's "Doesn't look right? Flip the reading" control maps directly to `flipProfile`).
- Plan 02-04 (duplicate/transfer detection) and any later import-pipeline plan can rely on `ProfileEvidence` codes being enum-only (no leaked row text, verified by the `no-leak` test) and on `statedLimit` never being auto-applied without a user confirmation step.
- No blockers identified for downstream statement-import plans.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 5 created/modified files confirmed present on disk; all 3 task commits (`f5b81f8`, `ab87c08`, `79b7ef1`) confirmed present in `git log`.
