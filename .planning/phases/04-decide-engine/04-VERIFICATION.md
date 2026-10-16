---
phase: 04-decide-engine
verified: 2026-10-16T00:00:00Z
status: passed
score: 6/6 roadmap criteria verified (37/37 DEC requirements implemented; 11 not yet ticked in REQUIREMENTS.md)
overrides_applied: 0
gaps: []
human_verification:
  - test: "Decide on the D-20 final-payment residual for extreme terms (e.g. 1,000.00 at 22.9% over 600 months: final payment differs from level payment by about 16.5k)"
    expected: "Either accept (Phase 5 bounds term/APR inputs) or add an engine guard"
    why_human: "Product/engineering judgement, not a test failure"
  - test: "Confirm per-setback runwayWith definition (04-21): cash after that setback over burn, not the start-cash runway that D-62 literally states"
    expected: "Phase 5 alignment doc updated, or engine changed"
    why_human: "Spec conflict resolved by executor; owner should ratify"
  - test: "Tick DEC-07, 18, 21, 22, 24, 25, 26, 31, 32, 34, 37 in REQUIREMENTS.md (checkboxes and traceability table)"
    expected: "All 37 DEC rows Complete"
    why_human: "Bookkeeping left Pending by executors; code and tests exist for all (see coverage)"
---

# Phase 4: Decide Engine Verification Report

**Phase Goal:** The affordability engine computes correct verdicts in complete isolation, before any UI exists.
**Branch:** phase/04-decide-engine. **Re-verification:** No.
**Status:** human_needed (no blocking gaps; judgement and bookkeeping items only).

## Evidence run (this session)

| Check | Result |
|---|---|
| `jest src/engine/decide src/engine/payoff` with project collectCoverageFrom (tests excluded) | 77 suites passed; 1227 passed, 14 skipped; decide and payoff 100% statements/branches/functions/lines |
| Same run with `__tests__` included in coverage | decide branch 98.94% (only golden/adapter.ts test helper at 80%); artefact of my override, real config excludes `__tests__` |
| `npm run depcruise` | no dependency violations (522 modules) |
| `npm run check:ignores` | OK, no unreasoned coverage ignores |
| `generate-golden.mjs --check` | ran clean (no drift output) |
| `npm run verify:gates` | GATES OK (all 5 probes) |
| Engine imports of react/db/state/services/ui in decide, payoff | none (only a string literal inside public-api guard test) |
| `git diff origin/main --stat -- src/shell` | empty: phase did not touch shell; expo-blur issue is environmental, not a phase gap |
| TODO/FIXME/ts-ignore/istanbul-ignore in decide, payoff source | none |

## Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | amortise and futureValue incl. zero rate | VERIFIED | payoff/amortise.ts, futureValue.ts, futureValuePath.ts; amortise.reference tests vs 4 published tables; tests pass |
| 2 | 22.9% / 1% min never clears via explicit check | VERIFIED | simulateMinimum.ts, test d17-never-clears-vs-cap (fires at month 1; separate `exceeds_month_cap` outcome) |
| 3 | four payment methods resolved, incomplete flag, fits/adjust/no/missing, up to six ordered warnings incl. cash_dip | VERIFIED | plan.ts (resolvePlan with missing reasons), assess.ts, cashPath.ts, assess/plan/d44 tests |
| 4 | CV steadiness, household share, bisection edge cases, card eligibility | VERIFIED | money.ts (cvBelow), share.ts, bisect.ts, d20-exact-bisection, cardRule.ts |
| 5 | green at threshold, pure, `dsecured` reads boolean | VERIFIED | 100% thresholds in jest.config for decide/payoff; depcruise clean; secured.ts returns `debt.secured` |
| 6 | options, four-way alternatives with suppression, setbacks, first read, codes only | VERIFIED | options.ts, alternatives.ts (Suppression), setbacks.ts, firstRead.ts; outputs-are-codes.test.ts guard; no English literals in engine files sampled |

## Requirement Coverage (DEC-01..DEC-37)

Every ID appears in at least one PLAN's requirements field (grep count 1-9 each). Implementation and tests exist for all 37; modules: DEC-07/33/23 money.ts+series.ts; DEC-18 reserve.ts; DEC-21 futureChanges.ts; DEC-22 confidence.ts; DEC-24/26 plan.ts+payoff/rateSchedule.ts; DEC-25 stress.ts; DEC-31 estimateBias.ts; DEC-32 constants.ts citations + amortise.reference tests; DEC-34/36 assess.ts (purchaseSize, billsDue); DEC-37 assess.ts (two shares, pausable); DEC-28 incomeAtRisk/payback; DEC-27 investmentViews; DEC-29 setbacks; DEC-30 runningCostPrompts.

No orphaned requirements. Bookkeeping gap (non-blocking): REQUIREMENTS.md still shows DEC-07, 18, 21, 22, 24, 25, 26, 31, 32, 34, 37 unticked/Pending although plans 04-07/15/20/22/12 etc. have delivered them (executors deliberately deferred ticking). Orchestrator should tick them at phase close.

## Execution-time judgement items

| Item | Assessment |
|---|---|
| D-20 final-payment residual, extreme terms | Real but confined to absurd inputs (payment barely above month-1 interest; annuity factor about 4.4M). Final payment absorbs about 1.65M minor units of rounding. Engine is mathematically consistent (total paid = principal + interest), well-conditioned terms stay within ceil(n/2)+1. WARNING: Phase 5 should bound term/APR, or engine could spread the residual. Not a blocker. |
| 04-11 widened bisection tolerance | Acceptable. Band = 22-iteration bracket + ceil(0.5*price/monthly)+1, which is exactly the half-unit payment rounding effect; observed gaps 20 and 11 minor units matched. Exact integer bisection itself is separately tested (d20). |
| 14 skipped golden tests | Legitimate. 13 are the bisect parity test skipped by design where prototype bisect is null, or investing floor exceeds investing (D-35 predicate differs), or plan miss; 1 is the verdict test for instalment-24 where the prototype flags miss unconditionally (named in instalment-path.test.ts). Engine behaviour in these cases is covered by named deviation tests. |
| 04-20 monthIncome 1_400_000 vs plan 1_000_000 | Executor is right: withExpectedIncome assesses the worst of next 12 months, all including the +400_000 gain; main verdict's monthIncome stays 1_000_000 and test asserts both. Plan figure was wrong. |
| 04-21 per-setback runwayWith vs D-62 | Genuine spec conflict; executor followed plan example (cash after that setback / burn) and asserts overall runwayWith and each cashAfterWith equal applySetbacks. Reasonable, but D-62 wording and 04-PHASE5-ALIGNMENT should be updated so Phase 5 does not assume start-cash runway. Needs owner ratification. |
| 04-10 setbacks fixture burn override (560_000) | Test-only fixture adjustment because the plan's figure was unreachable with a 300_000 cash buy; reserve and monthCosts are real engine values and the PAY+YEARLY_DUE case uses real burn. Low risk. |

## Anti-patterns

None found in source. Known environment issue (expo-blur missing in shared node_modules: 1 tsc error, 1 lint error, 2 shell suites failing) is pre-existing and untouched by the phase (empty `src/shell` diff vs origin/main). Not run this session: full `npm run test:coverage` (04-12 reports 9553 passed / 14 skipped, decide/payoff/statement all 100%).

## Gaps Summary

No blocking gaps. Goal achieved: the engine computes verdicts in isolation, with 100% branch coverage, enforced purity and codes-only outputs. Remaining: ratify the two judgement items above and tick 11 requirement rows.

_Verified: 2026-10-16_
_Verifier: Claude (gsd-verifier)_

## Resolution (2026-10-16)

The three human-verification items are closed. (1) The user ruled on the D-20 extreme-term residual as D-64 (the level payment rounds up), implemented in fe82b80 with named deviation tests. (2) The user ratified the per-setback `runwayWith` (cash left after the setback hits) and recorded it in D-62 and 04-PHASE5-ALIGNMENT.md (cac6545). (3) DEC-07, 18, 21, 22, 24, 25, 26, 31, 32, 34 and 37 are ticked in REQUIREMENTS.md, so DEC-01..DEC-37 are all complete. All 14 code-review findings (04-REVIEW.md) were fixed with regression tests. engine/decide and engine/payoff remain at 100% coverage, and golden parity holds.
