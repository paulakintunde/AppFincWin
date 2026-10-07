---
phase: 02-record
plan: 37
subsystem: database
tags: [engine, transfer-matching, account-standing, fast-check, tdd]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: engine/money (MinorUnits, convertMinor, ScaledRate) and engine/time (isValidLocalDate) that this plan builds on
provides:
  - "matchTransfers: pure import transfer-pair suggestion matcher (D-52) with permutation-invariant, one-to-one, integer-exact scoring and assignment"
  - "buildTransferLegs / transferEditPatches: pure transfer-pair construction and edit-diff rules (D-50, D-51)"
  - "accountStanding: pure, total account-standing function (D-49) covering deposit, card and loan states, never throwing, never returning an error kind"
affects: [02-20 (entry sheet transfer type), 02-24 (accounts UI standing display), 02-26/02-27 (import pipeline transfer suggestions), 02-40 (transfer mutations)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "engine/transfer and engine/accounts follow the existing engine/money discriminated-union-result style: typed unions, no thrown errors for expected states, fast-check property tests alongside example tests"
    - "matchTransfers assignment: build all (importIndex, existingId) candidates, sort by (score desc, Δdays asc, amountDiff asc, existingId asc, importIndex asc), then a greedy best-first loop over unresolved imports (not a single flat pass) so a 'choose' tie on one import never consumes an existingId another import could also use"

key-files:
  created:
    - src/engine/accounts/standing.ts
    - src/engine/accounts/index.ts
    - src/engine/accounts/__tests__/standing.test.ts
    - src/engine/transfer/pair.ts
    - src/engine/transfer/match.ts
    - src/engine/transfer/index.ts
    - src/engine/transfer/__tests__/pair.test.ts
    - src/engine/transfer/__tests__/match.test.ts
  modified: []

key-decisions:
  - "accountStanding uses Math.abs(balance) rather than -balance for owed/overdrawnBy figures, so a zero balance never produces a signed-zero (-0) mismatch against a plain 0 in strict equality"
  - "matchTransfers' greedy assignment is a repeated best-first scan over unresolved imports (not a single sorted-candidate pass), because a 'choose' resolution must not remove either candidate's existingId from the pool for other imports, and only a per-import best-vs-second-best comparison (not a global adjacent-pair comparison) correctly detects a tie"

patterns-established:
  - "Pure engine result unions are exhaustive TypeScript switches over a closed AccountKind/BuildTransferError type, letting the compiler catch a missing case rather than needing a runtime assertNever guard when every union member is a literal branch"

requirements-completed: [REC-17, REC-18]

# Metrics
duration: 50min
completed: 2026-09-27
---

# Phase 02 Plan 37: Transfer matching, pair rules, account standing Summary

**Three pure `engine/` modules — `matchTransfers` (import transfer-suggestion matcher with integer-exact cross-currency tolerance), `buildTransferLegs`/`transferEditPatches` (transfer-pair construction and diff-only edit rules), and `accountStanding` (a total, never-throwing account-standing classifier) — each fully property- and example-tested at 100% coverage.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-27T11:20:00-07:00 (approx.)
- **Completed:** 2026-09-27T12:08:27-07:00
- **Tasks:** 2
- **Files modified:** 8 (all created; no existing files touched)

## Accomplishments

- `accountStanding` (D-49): a pure, total function covering checking/savings (in-credit, overdrawn-within/beyond/no-limit), credit (card-in-credit, owing-within, over-limit), loan (loan-owing, loan-in-credit) and plain (cash/investment/other) — an overdraft or credit limit of exactly 0 is treated as no limit, boundaries are exact at the limit, and it never throws or returns an error kind.
- `buildTransferLegs`/`transferEditPatches` (D-50, D-51): builds two opposite-signed legs sharing a transfer id (same-currency legs equal and opposite, cross-currency legs kept exactly as given); edits diff only the keys that actually changed, on whichever leg they belong to.
- `matchTransfers` (D-52): pairs an imported row with a stored row on another account, opposite sign, within a 3-day window, exact match same-currency or within a 500 bps (5%) cross-currency tolerance via `convertMinor`'s BigInt maths; ranks candidates by date proximity, payment-like descriptions, the other account's name and the deposit-to-card shape; assigns one-to-one via a greedy best-first loop across unresolved imports; returns `choose` on a genuine tie and `orphan-transfer` for an unmatched payment-like row; output is invariant under permutation of either input array (proven via a fast-check property test) and is sorted by `importIndex`.
- Both `engine/transfer` and `engine/accounts` sit at 100% branch/line/function/statement coverage (the folders' own `index.ts` barrels report 0% in isolation — consistent with the existing `engine/money/index.ts` barrel's behavior in this codebase, since nothing outside these unit tests imports the barrel yet; Jest's directory-aggregate threshold check is unaffected since a file with zero collected statements contributes nothing to the aggregate denominator).
- `npm run depcruise` and `npm run typecheck` both pass clean with the new code in place; the full `engine/` suite (356 tests, 15 suites) passes.

## Task Commits

Each task followed the plan's RED-then-GREEN TDD gate, each half committed atomically:

1. **Task 1: accountStanding and transfer pair rules**
   - `da97001` — `test(02-37): add failing tests for account standing and transfer pair rules` (RED)
   - `f26f84a` — `feat(02-37): account standing and transfer pair rules` (GREEN)
2. **Task 2: matchTransfers, coverage**
   - `eabeaa8` — `test(02-37): add failing tests for matchTransfers (D-52)` (RED)
   - `00c78cc` — `feat(02-37): matchTransfers import-suggestion matching (D-52)` (GREEN)

_TDD gate compliance verified: for each task, the RED commit's test suite was run against the pre-implementation tree (module genuinely absent) and failed with "Cannot find module", then the GREEN commit's suite passed in full after restoring the implementation._

**Plan metadata:** this commit (`docs(02-37): complete transfer matching, pair rules, account standing plan`) — see Self-Check below.

## Files Created/Modified

- `src/engine/accounts/standing.ts` — `accountStanding`, `Standing`, `AccountKind`, `AccountStandingInput` (D-49)
- `src/engine/accounts/index.ts` — barrel: `export * from './standing'`
- `src/engine/accounts/__tests__/standing.test.ts` — example tests for every state/boundary plus a fast-check property (exactly one kind, never throws, `beyondBy + limit = overdrawnBy`, `overBy + limit = owed`)
- `src/engine/transfer/pair.ts` — `buildTransferLegs`, `TransferLegDraft`, `BuildTransferError`, `transferEditPatches`, `TransferPairState` (D-50, D-51)
- `src/engine/transfer/match.ts` — `matchTransfers`, `isPaymentLike`, `daysBetween`, `TRANSFER_WINDOW_DAYS`, `TRANSFER_TOLERANCE_BPS`, `PAYMENT_KEYWORDS`, `ImportedLeg`, `ExistingLeg`, `TransferAccount`, `TransferSuggestion` (D-52)
- `src/engine/transfer/index.ts` — barrel: `export * from './pair'; export * from './match';`
- `src/engine/transfer/__tests__/pair.test.ts` — example tests for every `buildTransferLegs` error/success case and every `transferEditPatches` diff case
- `src/engine/transfer/__tests__/match.test.ts` — example tests (card-payment pairing, closest-date one-to-one assignment, all hard-constraint rejections, cross-currency tolerance in/out, missing-rate and overflow never-throw cases, exact-tie `choose`, orphan-transfer, name-match and amount-diff tiebreak coverage cases) plus two fast-check properties (permutation invariance; pair invariants — different accounts, opposite signs, `|Δdays| <= 3`, equal magnitudes, no existing id reused)

## Decisions Made

- `accountStanding` computes `owed`/`overdrawnBy` via `Math.abs(balance)` rather than `-balance`, because `-balance` on an exact-zero balance produces IEEE `-0`, which fails `toEqual`'s strict equality against a literal `0` even though the two are numerically equal. `Math.abs` normalizes to `+0` in every case, so `in-credit`/`owing-within`/`loan-owing` all read as a plain `0` at the zero boundary.
- `matchTransfers`' assignment loop repeatedly finds the single best still-open decision across all unresolved imports (rather than a single pass over the flat sorted candidate list), because the spec's tie rule ("if its best two remaining candidates tie... assign neither") is a per-import, per-iteration question: an existingId consumed by one import's resolution must be removed from every other import's candidate pool before that pool's own tie-or-assign decision is made, and a naive single pass over the globally sorted list can decide two imports' fates in the wrong order relative to each other.
- Neither `engine/accounts` nor `engine/transfer` was added to `jest.config.js`'s `FULL` (100%) coverage-threshold folder list, since that file is out of this plan's `files_modified` scope and is shared across the whole wave; RESEARCH.md §Validation Architecture already flags `transfer` and `accounts` (alongside `ofx`/`statement` from the statement-import plans) for that list. Coverage was instead proven directly via this task's own `--coverageThreshold` override, exactly as the plan's verify step specifies. This is flagged below as a follow-up, not fixed here, to avoid a merge conflict with sibling wave plans touching the same config file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `accountStanding` returned signed-zero (`-0`) for a zero balance**
- **Found during:** Task 1, first GREEN test run (`accountStanding: credit › balance 0 -> owing-within owed 0` and `accountStanding: loan › balance 0 -> loan-owing 0` both failed on `-0` vs `0`)
- **Issue:** `minorUnits(-balance)` computes `-0` when `balance` is exactly `0`; Jest's `toEqual` treats `-0` and `0` as distinct
- **Fix:** Replaced `-balance` with `Math.abs(balance)` in `depositStanding`, `cardStanding` and `loanStanding`
- **Files modified:** `src/engine/accounts/standing.ts`
- **Committed in:** `f26f84a` (Task 1 GREEN commit — the fix landed before the commit, so the committed code is already correct)

**2. [Rule 3 - Blocking] Two coverage gaps discovered only after the GREEN commit's own coverage run**
- **Found during:** Task 2's coverage verification step
- **Issue:** `match.ts` had two uncovered branches after the initial test suite: (a) the cross-currency `!outAccount || !inAccount` guard in `checkAmount` (an account id absent from the `accounts` list), and (b) the `amountDiff` tiebreak line in `compareCandidates` (two candidates tying on score and Δdays but differing only in converted-amount closeness), plus the name-match scoring bonus and a full-tie-by-importIndex case were also unexercised
- **Fix:** Added five targeted test cases to `match.test.ts`: an unknown-account cross-currency candidate (never throws, returns no suggestion), a description-mentions-other-account-name scoring comparison, an amount-difference tiebreak case, and a same-existing-leg two-import tiebreak case
- **Files modified:** `src/engine/transfer/__tests__/match.test.ts`
- **Committed in:** `00c78cc` (Task 2 GREEN commit — these tests were added before the commit, so the coverage run backing the commit already shows 100%)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking/coverage). Both are the kind of thing TDD's GREEN-verification step exists to catch; neither changed the module's public contract from what the plan specified.
**Impact on plan:** No scope creep. Both fixes were required to make the plan's own acceptance criteria (exact-match test assertions; 100% coverage) actually pass.

## Issues Encountered

- **Environment-only:** this worktree's path contains a `.claude` segment (`C:\dev\fincwin\.claude\worktrees\agent-a64a8283b285635ce`). Jest's `<rootDir>`-prefixed default `testMatch` (`<rootDir>/src/**/*.test.ts?(x)`) resolves through a `path.resolve`/backslash-to-forward-slash conversion that, in this specific environment, leaves one stray backslash immediately before the `.claude` segment, producing a malformed glob that matches zero files ("No tests found" against `241 files checked` / `241` all excluded by the node_modules ignore pattern). Every `npx jest <path>` invocation in this session was run instead with an explicit relative `--testMatch` pattern (e.g. `--testMatch="**/engine/transfer/**/*.test.ts"`, `--no-watchman`), which bypasses the `<rootDir>` interpolation entirely and works correctly. This is an environment/tooling quirk specific to this worktree's absolute path, not a project defect — CI and any non-`.claude`-nested checkout are unaffected. No project file was changed to work around it.
- Coverage runs and full-suite runs in this environment take noticeably longer than typical (crawl of `node_modules` on first run per session, ~1-2 minutes; subsequent runs with a warm haste-map cache, ~10-20 seconds) — accounted for by running tests in the background and polling.

## User Setup Required

None — no external service configuration required.

## Follow-ups for a later plan (not fixed here)

- `jest.config.js`'s `FULL` coverage-threshold folder list still needs `transfer`, `accounts` (and, per RESEARCH.md, `ofx`/`statement` from the statement-import plans) added, so the whole-repo `npm run test:coverage` enforces 100% on these folders going forward rather than the default 95% `REST` threshold. This plan's own dedicated verify command already proves 100% today; the config-file change was left out to avoid a cross-plan merge conflict in this wave, per this plan's `files_modified` scope.

## Next Phase Readiness

- `matchTransfers`, `buildTransferLegs`/`transferEditPatches` and `accountStanding` are ready for 02-40 (transfer mutations), 02-20 (entry sheet's Transfer type), 02-24 (accounts UI standing display) and 02-26/02-27 (import pipeline's transfer-suggestion step) to consume via `@/engine/transfer` and `@/engine/accounts`.
- No blockers identified for downstream plans in this wave.

---
*Phase: 02-record*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 8 created files verified present on disk (`src/engine/accounts/standing.ts`, `src/engine/accounts/index.ts`, `src/engine/accounts/__tests__/standing.test.ts`, `src/engine/transfer/pair.ts`, `src/engine/transfer/match.ts`, `src/engine/transfer/index.ts`, `src/engine/transfer/__tests__/pair.test.ts`, `src/engine/transfer/__tests__/match.test.ts`). All 4 referenced commit hashes (`da97001`, `f26f84a`, `eabeaa8`, `00c78cc`) verified present in `git log`.
