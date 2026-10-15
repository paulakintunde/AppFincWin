---
phase: 4
slug: decide-engine
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-26
updated: 2026-10-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 (jest-expo preset), fast-check 4.10.x with @fast-check/jest |
| **Config file** | `jest.config.js`. Its 100% per-folder thresholds switch on for `src/engine/decide/` and `src/engine/payoff/` once source exists (Phase 0 D-21) |
| **Quick run command** | `npx jest src/engine/decide src/engine/payoff` |
| **Full suite command** | `npm run test:coverage` plus `npm run depcruise` and `npm run check:ignores` |
| **Golden reproducibility** | `node scripts/decide-golden/generate-golden.mjs --check` |
| **Estimated runtime** | Under 15 seconds for the quick run; about 60 seconds for the full suite (2026-10-15 expansion: fast-check runs in the new suites are capped at 100–200 runs to keep this) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/engine/decide src/engine/payoff`
- **After every plan wave:** Run `npm run test:coverage`, `npm run depcruise` and `npm run check:ignores`
- **Before `/gsd-verify-work`:** The full suite must be green at 100% branch coverage on `engine/decide` and `engine/payoff`, and the golden `--check` must pass
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are `{plan}-T{n}`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | DEC-01, DEC-02 (contracts) | T-04-01-03 | Overflow → RangeError | unit | `npx jest src/engine/payoff/__tests__/types.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | DEC-01, DEC-02 | T-04-01-01, T-04-01-02 | Exact rationals, bounded n | unit + known tables + property | `npx jest src/engine/payoff` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-02-T1 | 04-02 | 1 | DEC-10, DEC-11 | T-04-02-01 | Explicit fields, regex off the verdict path | unit matrix | `npx jest src/engine/decide/__tests__/cardRule.test.ts src/engine/decide/__tests__/secured.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-02-T2 | 04-02 | 1 | DEC-08 | T-04-02-02, T-04-02-03 | Zero-sum weights guarded | unit + property | `npx jest src/engine/decide/__tests__/share.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-03-T1 | 04-03 | 1 | DEC-01..04, 06..09 (D-22 reference) | T-04-03-01 | Reference evaluated from prototype text | generator | `node scripts/decide-golden/generate-golden.mjs --check` | ❌ W0 | ⬜ pending |
| 04-03-T2 | 04-03 | 1 | same | T-04-03-01 | Scenario matrix coverage asserted | generator + node check | `node scripts/decide-golden/generate-golden.mjs --check` | ❌ W0 | ⬜ pending |
| 04-04-T1 | 04-04 | 2 | DEC-03 (SC-2) | T-04-04-01, T-04-04-02 | Explicit never-clears; 600 cap | unit + property | `npx jest src/engine/payoff/__tests__/simulateMinimum.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-04-T2 | 04-04 | 2 | DEC-01..03 (D-22) | T-04-04-03 | Named deviations D-17, D-20 | golden + deviation | `npx jest src/engine/payoff` | ❌ W0 | ⬜ pending |
| 04-05-T1 | 04-05 | 2 | DEC-12 | T-04-05-03 | No default APR; unsourced = null | unit | `npx jest src/engine/decide/__tests__/constants.test.ts src/engine/decide/__tests__/marketDefaults.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-05-T2 | 04-05 | 2 | DEC-12 (D-16, D-23…D-26) | T-04-05-01, T-04-05-02, T-04-05-04 | One currency; confirmed series only; bounded schedule maths | unit | `npx jest src/engine/decide/__tests__/currency.test.ts src/engine/decide/__tests__/series.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-05-T3 | 04-05 | 2 | DEC-12 (D-41…D-58 contracts; D-58 citations; D-51 rate list) | T-04-05-05, T-04-05-06 | Stress offsets in percentage points; every constant cited; 0% plus up to three user rates, deduplicated | unit + static | `npx jest src/engine/decide/__tests__/constants.test.ts src/engine/decide/__tests__/projectionRates.test.ts && npm run typecheck` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-13-T1 | 04-13 | 3 | DEC-08 (D-23, D-25…D-28, D-34) | T-04-13-03, T-04-13-04, T-04-13-05 | Paid only; refunds never income; transfers excluded | unit | `npx jest src/engine/decide/__tests__/money.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-13-T2 | 04-13 | 3 | DEC-07 (+ D-47) | T-04-13-01, T-04-13-02 | Exact CV; full months only; smoothed bills; one-off lines left out and counted | unit boundaries + deviation | `npx jest src/engine/decide/__tests__/money.test.ts src/engine/decide/__tests__/deviations/d23-series-smoothing.test.ts src/engine/decide/__tests__/deviations/d27-refunds-net-spending.test.ts src/engine/decide/__tests__/deviations/d47-one-off-lines.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-14-T1 | 04-14 | 3 | DEC-01 (D-57) | T-04-14-04 | Published reference tables R1–R4; residual rows named | reference-table + deviation | `npx jest src/engine/payoff/__tests__/amortise.reference.test.ts src/engine/payoff/__tests__/deviations/d57-reference-residuals.test.ts` | ❌ W0 | ⬜ pending |
| 04-14-T2 | 04-14 | 3 | DEC-01 (D-48) | T-04-14-01, T-04-14-02, T-04-14-03 | Recast at segment start; deferred interest only when flagged and owed; equals amortise for one segment | unit + property | `npx jest src/engine/payoff/__tests__/rateSchedule.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-14-T3 | 04-14 | 3 | DEC-03 (D-48, D-17) | T-04-14-01, T-04-14-03 | Never-clears check intact under a schedule; equals simulateMinimum for one segment | unit + property | `npx jest src/engine/payoff && npm run test:coverage` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-15-T1 | 04-15 | 3 | DEC-07 (D-42 amended, D-46) | T-04-15-02, T-04-15-03 | Half-month exactness; rough evaluated first | unit + property + deviation | `npx jest src/engine/decide/__tests__/reserve.test.ts src/engine/decide/__tests__/confidence.test.ts src/engine/decide/__tests__/deviations/d42-cushion-by-steadiness.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-15-T2 | 04-15 | 3 | DEC-06 (D-43) | T-04-15-03 | Strict 5% boundary; zero-threshold fallback; zero-base guard | unit + property | `npx jest src/engine/decide/__tests__/margins.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-15-T3 | 04-15 | 3 | DEC-06 (D-45) | T-04-15-01, T-04-15-04 | Worst of 12 months; a later raise never rescues an earlier month | unit + property | `npx jest src/engine/decide/__tests__/futureChanges.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-16-T1 | 04-16 | 3 | DEC-12 (D-55) | T-04-16-02, T-04-16-03 | Categories only; loss of value non-cash; exhaustive over ItemType | unit | `npx jest src/engine/decide/__tests__/runningCostPrompts.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-16-T2 | 04-16 | 3 | DEC-13 (D-56) | T-04-16-01, T-04-16-04 | Null below 3 decisions; zero estimates excluded; symmetric half-up | unit + property | `npx jest src/engine/decide/__tests__/estimateBias.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-06-T1 | 04-06 | 4 | DEC-04, DEC-05, DEC-10 | T-04-06-01..03 | Missing terms → reason codes | unit matrix | `npx jest src/engine/decide/__tests__/plan.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-06-T2 | 04-06 | 4 | DEC-04, DEC-05 | T-04-06-01 | Named deviations D-07, D-18, instalment | deviation | `npx jest src/engine/decide/__tests__/deviations` | ❌ W0 | ⬜ pending |
| 04-06-T3 | 04-06 | 4 | DEC-12 (D-37, Phase 5 alignment; + D-55) | T-04-06-04, T-04-06-06 | No default tax rate; prototype dayFees rule; loss of value non-cash | unit + deviation | `npx jest src/engine/decide/__tests__/checkInputs.test.ts src/engine/decide/__tests__/deviations/d37-check-inputs.test.ts src/engine/decide/__tests__/deviations/d55-loss-of-value-non-cash.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-17-T1 | 04-17 | 4 | DEC-06 (D-44) | T-04-17-01, T-04-17-03, T-04-17-04 | Starts from cash on hand; confirmed series on their dates; exact daily spread | unit + property | `npx jest src/engine/decide/__tests__/cashPath.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-17-T2 | 04-17 | 4 | DEC-06 (D-44, D-24/D-44 amended) | T-04-17-02 | With-purchase path never above without; one card per cause | unit + property | `npx jest src/engine/decide/__tests__/cashPath.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-07-T1 | 04-07 | 5 | DEC-06, DEC-08 (limits, two shares, bills due) | T-04-07-02, T-04-07-03, T-04-07-04, T-04-07-06 | Defaults from user figures; D-34 shares; D-24 bills | unit | `npx jest src/engine/decide/__tests__/assess.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-07-T2 | 04-07 | 5 | DEC-06 | T-04-07-01 | Ordered warnings; D-35 pause rule; D-33 invest rules | unit | `npx jest src/engine/decide/__tests__/assess.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-07-T3 | 04-07 | 5 | DEC-06 | T-04-07-01, T-04-07-05 | D-31 fact non-blocking; D-36 size from the cash-paid price; stateless; properties | unit + property | `npx jest src/engine/decide/__tests__/assess.test.ts && npm run typecheck` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-07-T4 | 04-07 | 5 | DEC-06, DEC-12 (D-38, Phase 5 alignment) | T-04-07-07 | Month table rows sum; ledgers from the same figures | unit + property | `npx jest src/engine/decide/__tests__/assess.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-22-T1 | 04-22 | 5 | DEC-01, DEC-03, DEC-04 (D-48, D-49) | T-04-22-01, T-04-22-02, T-04-22-03 | Month test on the highest scheduled payment; paymentSteps is the series source (W3); nothing defaulted | unit + property | `npx jest src/engine/decide/__tests__/plan.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-22-T2 | 04-22 | 5 | DEC-04 (D-50, D-48 named) | T-04-22-03, T-04-22-04 | Late fees never change the plan; no default cap | unit + deviation | `npx jest src/engine/decide/__tests__/plan.test.ts src/engine/decide/__tests__/deviations/d48-d50-credit-terms.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-08-T1 | 04-08 | 5 | DEC-16 | T-04-08-01, T-04-08-02, T-04-08-03 | Basis marker; cash-level only; rough cushion; D-36 size from rough figures | unit | `npx jest src/engine/decide/__tests__/firstRead.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-09-T1 | 04-09 | 6 | DEC-09 | T-04-09-01, T-04-09-02 | Exact boundary; monotone across cap; 3+ unequal-weight household error bounded vs linear scan | unit + property + deviation | `npx jest src/engine/decide/__tests__/bisect.test.ts src/engine/decide/__tests__/deviations/d20-exact-bisection.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-09-T2 | 04-09 | 6 | DEC-13 | T-04-09-03 | 0% default return; no currency thresholds | unit + deviation | `npx jest src/engine/decide/__tests__/options.test.ts src/engine/decide/__tests__/deviations/d05-option-thresholds.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-10-T1 | 04-10 | 6 | DEC-14 | T-04-10-01, T-04-10-02 | Non-spare rows suppressed | unit + deviation | `npx jest src/engine/decide/__tests__/alternatives.test.ts src/engine/decide/__tests__/deviations/d06-projection-return.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-10-T2 | 04-10 | 6 | DEC-15 | T-04-10-03 | Bounded setback params | unit | `npx jest src/engine/decide/__tests__/setbacks.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-10-T3 | 04-10 | 6 | DEC-14, DEC-15 (D-39, D-40, Phase 5 alignment) | T-04-10-04 | Spare cash only; runway floored; wait months equal monthsToBuy | unit + deviation | `npx jest src/engine/decide/__tests__/wait.test.ts src/engine/decide/__tests__/deviations/d39-d40-runway-and-wait.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-11-T1 | 04-11 | 6 | DEC-04, 06..09 (D-22) | T-04-11-01 | Parity within 1 minor unit | golden | `npx jest src/engine/decide/__tests__/golden.test.ts` | ❌ W0 | ⬜ pending |
| 04-11-T2 | 04-11 | 6 | DEC-06, DEC-07 | T-04-11-02 | Named deviations D-02, D-08, D-12 (incl. amended) | deviation | `npx jest src/engine/decide/__tests__/deviations` | ❌ W0 | ⬜ pending |
| 04-11-T3 | 04-11 | 6 | DEC-06, DEC-08, DEC-16 | T-04-11-03 | Named deviations D-11 amended, D-24, D-33, D-34, D-35, D-36, D-38 | deviation | `npx jest src/engine/decide/__tests__/deviations` | ❌ W0 | ⬜ pending |
| 04-18-T1 | 04-18 | 6 | DEC-06 (D-41, D-41 amended) | T-04-18-01, T-04-18-04 | Order-independent stacking at each check's own split | unit + property | `npx jest src/engine/decide/__tests__/position.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-18-T2 | 04-18 | 6 | DEC-06, DEC-09 (D-45, D-53) | T-04-18-02, T-04-18-03 | Worst future month; expected gain kept out; no double positioning | unit + deviation | `npx jest src/engine/decide && npm run typecheck` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-19-T1 | 04-19 | 6 | DEC-06 (D-49) | T-04-19-01 | +2/+4 percentage points; verdict on the entered rate; promo not stressed | unit + deviation | `npx jest src/engine/decide/__tests__/stress.test.ts src/engine/decide/__tests__/deviations/d49-variable-rate-stress.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-19-T2 | 04-19 | 6 | DEC-15 (D-53) | T-04-19-02, T-04-19-03 | Cumulative payback; null past the horizon; bounded loop | unit + property | `npx jest src/engine/decide/__tests__/payback.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-20-T1 | 04-20 | 7 | DEC-06, DEC-09, DEC-13 (D-41, D-43, D-45, D-49, D-53) | T-04-20-01, T-04-20-02, T-04-20-03 | decide().verdict equals assess(); gain only in the separate assessment | unit | `npx jest src/engine/decide/__tests__/decision.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-20-T2 | 04-20 | 7 | DEC-06, DEC-09 (D-41, D-43, D-44) | T-04-20-01 | Combined never better than standalone; strict edge; one card per cause | deviation + property | `npx jest src/engine/decide && npm run test:coverage` | ❌ W0 | ⬜ pending |
| 04-21-T1 | 04-21 | 7 | DEC-02 (D-52) | T-04-21-04 | futureValuePath equals futureValue at every month | unit + property | `npx jest src/engine/payoff/__tests__/futureValuePath.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-21-T2 | 04-21 | 7 | DEC-02, DEC-14 (D-51, D-52) | T-04-21-01, T-04-21-02 | 0% plus user rates only; net-worth path carries the plan's debt | unit + deviation | `npx jest src/engine/decide/__tests__/investmentViews.test.ts src/engine/decide/__tests__/deviations/d51-user-rates-only.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-21-T3 | 04-21 | 7 | DEC-15 (D-54) | T-04-21-03 | Runway lost with and without the purchase; purchase never lengthens runway | unit + property | `npx jest src/engine/decide/__tests__/incomeAtRisk.test.ts && npm run test:coverage` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-12-T1 | 04-12 | 8 | DEC-12 | T-04-12-01 | No I/O reachable; verdict path isolated | static + unit | `npx jest src/engine/decide/__tests__/public-api.test.ts && npm run depcruise` | ❌ W0 | ⬜ pending |
| 04-12-T2 | 04-12 | 8 | DEC-12 (D-21) | T-04-12-02, T-04-12-03 | Codes-only outputs; 100% coverage | unit + gate | `npm run test:coverage && npm run depcruise && npm run check:ignores && npm run lint && npm run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**2026-10-15 expansion notes.** Plans 04-14…04-21 were added and the waves renumbered where the new dependencies required it: 04-06 3 → 4, 04-07 and 04-08 4 → 5, 04-09, 04-10 and 04-11 5 → 6, 04-12 6 → 8. After checker iteration 1, 04-06's credit-terms task moved to the new plan 04-22 (wave 5; 04-09, 04-19, 04-21 and 04-12 depend on it), giving 8 waves and 22 plans. The checker revision also added: `cashAfterBills` / `cashAfterBillsAndPurchase` (D-24 kept for every spare-money figure, with PAY + YEARLY_DUE tests in 04-07, 04-09, 04-10 and 04-21), `leftThisMonth` for D-36 (tested after positioning in 04-18), the D-51 rate list and `byRate` (04-05, 04-09, 04-10, 04-21), `spreadUndatedSpending` / `dipShortfall` (04-17), the missing-verdict confidence (04-07, 04-20), and the 04-07…04-11/04-18/04-22 cross-suite check in 04-12. Amended tasks keep their row and command; their added behaviour is: 04-05-T1/T2 (expansion contract block, `addDays`, fixture defaults), 04-06-T1 (schedule-aware payoff calls, `paymentSteps`), 04-07-T1…T4 (D-42 cushion, D-44 cash path and `cash_dip`, D-24/D-44 amended `cashAvailable`, D-46 confidence, D-47 basis code, `monthIncome`), 04-08-T1 (D-46 confidence), 04-09-T1 (monotonicity with a promo loan and a cash path), 04-10-T2 (`setbackHitFor`, `runwayMonthsOf`), 04-11-T1 (adapter neutralises the new snapshot fields), 04-12-T1/T2 (32-module barrel; codes guard over every new output), 04-13-T1/T2 (D-47).

---

## Wave 0 Requirements

Every test file below is created by the RED step of the TDD task that owns it (the test is written and committed failing before the implementation), so no separate Wave 0 plan is needed.

- [ ] `src/engine/payoff/__tests__/{types,amortise,futureValue}.test.ts` (04-01), `simulateMinimum.test.ts`, `golden.test.ts`, `deviations/*.test.ts` (04-04): DEC-01 to DEC-03.
- [ ] `src/engine/decide/__tests__/{cardRule,secured,share}.test.ts` (04-02), `{constants,marketDefaults,currency,series}.test.ts` (04-05), `money.test.ts` (04-13), `plan.test.ts`, `checkInputs.test.ts` (04-06), `assess.test.ts` (04-07), `firstRead.test.ts` (04-08), `{bisect,options}.test.ts` (04-09), `{alternatives,setbacks,wait}.test.ts` (04-10), `golden.test.ts` (04-11), `{public-api,outputs-are-codes}.test.ts` (04-12): DEC-04 to DEC-16.
- [ ] Golden fixtures `src/engine/payoff/__tests__/golden/prototype-payoff.json` and `src/engine/decide/__tests__/golden/prototype-decide.json` (04-03), reproducible with `--check` (D-22).
- [ ] Named deviation tests: D-17, D-20 (04-04); D-07, D-18, instalment path, D-37 (04-06); D-23, D-27 (04-13); D-20 bisection, D-05, D-06 (04-09); D-06, D-05 spare floor, D-39, D-40 (04-10); D-01/D-02/D-03, D-08/D-09/D-10, D-12 and D-12 amended, D-11 amended, D-24, D-33, D-34, D-35, D-36, D-38 (04-11). Revised 2026-10-15; D-37…D-40 added for Phase 5 alignment.
- [ ] 2026-10-15 expansion test files: `src/engine/payoff/__tests__/{rateSchedule,amortise.reference,futureValuePath}.test.ts` and `deviations/d57-reference-residuals.test.ts` (04-14, 04-21); `src/engine/decide/__tests__/{reserve,confidence,margins,futureChanges}.test.ts` (04-15), `{runningCostPrompts,estimateBias}.test.ts` (04-16), `projectionRates.test.ts` (04-05), `cashPath.test.ts` (04-17), `position.test.ts` (04-18), `{stress,payback}.test.ts` (04-19), `decision.test.ts` (04-20), `{investmentViews,incomeAtRisk}.test.ts` (04-21).
- [ ] 2026-10-15 named tests (each in exactly one file): D-42 and D-42 amended (04-15 `d42-cushion-by-steadiness`); D-47 (04-13 `d47-one-off-lines`); D-48 and D-50 (04-22 `d48-d50-credit-terms`); D-55 (04-06 `d55-loss-of-value-non-cash`); D-57 (04-14 `d57-reference-residuals`); D-45 (04-18 `d45-worst-future-month`); D-53 (04-18 `d53-lost-income-counts`); D-49 (04-19 `d49-variable-rate-stress`); D-41 and D-41 amended (04-20 `d41-combined-checks`); D-43 (04-20 `d43-on-the-edge`); D-44 and D-24/D-44 amended (04-20 `d44-cash-path`); D-51 (04-21 `d51-user-rates-only`); D-58 (04-05 `constants.test.ts`, the citation check).

---

## Engine depth expansion (D-41…D-58) — validation map

From 04-RESEARCH addendum §F, mapped to the plans that build each behaviour. Every new guard branch (zero threshold, zero costs, null runway, n < 3, zero estimate, empty schedule, missing other check, already-positioned context) has a covering test, because `jest.config.js` already holds `decide/` and `payoff/` at 100% branches.

| Decision | Behaviour | Test type | Test file(s) | Plan |
|---|---|---|---|---|
| D-41 (+ amended) | Other open checks stacked; standalone beside combined; order-independent; bisection and options on the combined position | unit + fast-check (combined never better; order independence) + named | `decide/__tests__/position.test.ts`, `decision.test.ts`, `deviations/d41-combined-checks.test.ts` | 04-18, 04-20 |
| D-42 (+ amended) | 3 / 4.5 / 6 months by steadiness, 3 under 3 full months; half-month exactness; typed reserve wins | unit (each tier, odd cost) + property + named | `reserve.test.ts`, `deviations/d42-cushion-by-steadiness.test.ts`, `assess.test.ts` | 04-15, 04-07 |
| D-43 | `on_edge` per line, strict 5%, zero-threshold fallback, zero-base guard | unit (exactly 5%, 5% − 1 unit, threshold 0) + property + named | `margins.test.ts`, `decision.test.ts`, `deviations/d43-on-the-edge.test.ts` | 04-15, 04-20 |
| D-44 (+ D-24/D-44 amended) | Daily path from cash on hand; lowest days with and without the purchase; hard and soft `cash_dip` (dips only with the purchase, and dips without it too); `cash_path_unavailable`; one card per cause; the D-24 deduction kept in cashAfterBills for spare-money figures; spread and dip measure each in one function (04-REPLAN-NOTES expansion defaults 1 and 2) | unit + fast-check (with ≤ without every day) + named | `cashPath.test.ts`, `assess.test.ts`, `deviations/d44-cash-path.test.ts` | 04-17, 04-07, 04-20 |
| D-45 | Worst of the next 12 months; a raise never rescues an earlier month | unit + fast-check + named | `futureChanges.test.ts`, `position.test.ts`, `deviations/d45-worst-future-month.test.ts` | 04-15, 04-18 |
| D-46 | Confidence precedence matrix; first read rough | unit (months × steadiness × first read) | `confidence.test.ts`, `assess.test.ts`, `firstRead.test.ts` | 04-15, 04-07, 04-08 |
| D-47 | `oneOff` lines excluded; `oneOffsExcluded`; `one_offs_excluded` basis code | unit + named | `money.test.ts`, `deviations/d47-one-off-lines.test.ts`, `assess.test.ts` | 04-13, 04-07 |
| D-48 | Segments, recast, deferred interest, promo outputs, highest payment in the month test; paymentSteps is the series source; bisection monotone with a promo | unit + fast-check (one segment equals amortise / simulateMinimum) + named | `payoff/__tests__/rateSchedule.test.ts`, `plan.test.ts`, `deviations/d48-d50-credit-terms.test.ts`, `bisect.test.ts` | 04-14, 04-22, 04-09 |
| D-49 | +2 / +4 points (Percent units); verdict unchanged; promo not stressed | unit + named | `stress.test.ts`, `deviations/d49-variable-rate-stress.test.ts` | 04-19 |
| D-50 | fee × n, n ≤ instalments remaining, optional user cap | unit + named | `plan.test.ts`, `deviations/d48-d50-credit-terms.test.ts` | 04-22 |
| D-51 / D-52 | 0% plus user rates, deduped, one list (limits.projectionRates) for every projection: alternatives rows and do_without carry byRate, the four views use the same list; net-worth path per month from cashAfterBills | unit + fast-check (futureValuePath equals futureValue) + named | `projectionRates.test.ts`, `alternatives.test.ts`, `options.test.ts`, `payoff/__tests__/futureValuePath.test.ts`, `investmentViews.test.ts`, `deviations/d51-user-rates-only.test.ts` | 04-05, 04-09, 04-10, 04-21 |
| D-53 | Negative change in the verdict; positive only beside it; cumulative payback; null past the horizon | unit + fast-check + named | `position.test.ts`, `payback.test.ts`, `decision.test.ts`, `deviations/d53-lost-income-counts.test.ts` | 04-18, 04-19, 04-20 |
| D-54 | Setbacks with and without the plan; payments met; runway lost; null propagation; D-24 bills deducted on both sides with a pay series | unit + fast-check | `setbacks.test.ts` (setbackHitFor, runwayMonthsOf), `incomeAtRisk.test.ts` | 04-10, 04-21 |
| D-55 | Exhaustive item-type table; loss of value non-cash, never in the month test | unit + named | `runningCostPrompts.test.ts`, `checkInputs.test.ts`, `deviations/d55-loss-of-value-non-cash.test.ts` | 04-16, 04-06 |
| D-56 | Basis points, n ≥ 3, zero estimates excluded, symmetric half-up, average of ratios | unit + fast-check | `estimateBias.test.ts` | 04-16 |
| D-57 | R1–R4 published vectors; R2/R3/R4 residual rows | reference-table + named | `payoff/__tests__/amortise.reference.test.ts`, `payoff/__tests__/deviations/d57-reference-residuals.test.ts` | 04-14 |
| D-58 | Every constant has a `// Cite:` block; values unchanged; stress offsets at the right scale | static + unit boundaries | `decide/__tests__/constants.test.ts` | 04-05 |

---

## Manual-Only Verifications

All phase behaviours have automated verification. This is a pure engine with no UI or I/O.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (TDD RED steps)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-09-26; expansion rows added 2026-10-15; checker iteration 1 revisions (04-22 rows, D-51 byRate, cashAfterBills) added 2026-10-15 — pending execution
