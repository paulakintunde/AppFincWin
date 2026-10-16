---
phase: 04-decide-engine
reviewed: 2026-10-16T00:00:00Z
depth: deep
files_reviewed: 43
files_reviewed_list:
  - scripts/decide-golden/generate-golden.mjs
  - scripts/decide-golden/scenarios.mjs
  - src/engine/decide/alternatives.ts
  - src/engine/decide/assess.ts
  - src/engine/decide/bisect.ts
  - src/engine/decide/cardRule.ts
  - src/engine/decide/cashPath.ts
  - src/engine/decide/checkInputs.ts
  - src/engine/decide/confidence.ts
  - src/engine/decide/constants.ts
  - src/engine/decide/currency.ts
  - src/engine/decide/decision.ts
  - src/engine/decide/estimateBias.ts
  - src/engine/decide/firstRead.ts
  - src/engine/decide/futureChanges.ts
  - src/engine/decide/incomeAtRisk.ts
  - src/engine/decide/index.ts
  - src/engine/decide/investmentViews.ts
  - src/engine/decide/margins.ts
  - src/engine/decide/marketDefaults.ts
  - src/engine/decide/money.ts
  - src/engine/decide/options.ts
  - src/engine/decide/payback.ts
  - src/engine/decide/plan.ts
  - src/engine/decide/position.ts
  - src/engine/decide/projectionRates.ts
  - src/engine/decide/reserve.ts
  - src/engine/decide/runningCostPrompts.ts
  - src/engine/decide/secured.ts
  - src/engine/decide/series.ts
  - src/engine/decide/setbacks.ts
  - src/engine/decide/share.ts
  - src/engine/decide/stress.ts
  - src/engine/decide/types.ts
  - src/engine/decide/wait.ts
  - src/engine/payoff/amortise.ts
  - src/engine/payoff/constants.ts
  - src/engine/payoff/futureValue.ts
  - src/engine/payoff/futureValuePath.ts
  - src/engine/payoff/index.ts
  - src/engine/payoff/rateSchedule.ts
  - src/engine/payoff/simulateMinimum.ts
  - src/engine/payoff/types.ts
findings:
  critical: 0
  high: 4
  medium: 5
  low: 5
  total: 14
status: issues_found
fix_status: all_fixed
fixed_at: 2026-10-16
---

# Phase 04: Code Review Report

**Reviewed:** 2026-10-16
**Depth:** deep (cross-module call chains traced; behaviour probed by running the transpiled engine)
**Files Reviewed:** 43 (types.ts read in part, for the contracts it backs)
**Status:** issues_found

Severity mapping: **high = BLOCKER**, **medium = WARNING**, **low = WARNING (minor)**. There are no critical findings.

## Summary

The architecture holds. Nothing in `src/engine/decide` or `src/engine/payoff` imports from db, state, services, ui or react; the only imports are engine siblings (money, split, recurring/schedule, time, guards). Money paths use integer minor units and bigint throughout, with `divideHalfUp` as the single rounding function. `minorFromBigInt` and `minorUnits` throw on unsafe integers, so overflow throws instead of drifting. No default APR or return rate exists on the verdict path. Engine outputs are codes and numbers; English strings appear only in thrown diagnostics. I ran `jest src/engine/decide src/engine/payoff --coverage`: 77 suites, 1227 tests passed (14 skipped golden cases), 100% statements, branches, functions and lines.

Correctness is weaker than the coverage suggests. Every finding below was reproduced by running the engine (TypeScript transpiled to a scratch directory and called directly). Four high findings give a user a wrong money figure:

1. `paymentToClearInPromo` is rounded down, so paying exactly that figure leaves a balance and triggers the whole deferred-interest charge.
2. A card minimum that hits the 600-month cap reports a total cost, an interest figure and payoff months as if the balance cleared.
3. Instalment plans do not scale with price. As a result there is no affordable-price option, and the "cheaper version" row falsely says the month still does not close.
4. Known item 1: D-64 ("level payment rounds up") was ratified on 2026-10-16 but is not implemented. The month test still uses a level payment that can sit far below the real final payment.

## Fix status (2026-10-16)

All 14 findings were fixed on `phase/04-decide-engine`, one commit each (`fix(04-review): <ID> ...`), each with a regression test that reproduces the failure scenario. Public contract changes are listed in `04-PHASE5-ALIGNMENT.md`, section "04-REVIEW fixes (2026-10-16)".

| Finding | Status | Commit |
|---|---|---|
| HI-01 | fixed (requires human verification) | `7418b85` |
| HI-02 | fixed (requires human verification) | `d9a174b` |
| HI-03 | fixed (requires human verification) | `f327023` |
| HI-04 | fixed (requires human verification) | `fe82b80` |
| ME-01 | fixed (requires human verification) | `d18e018` |
| ME-02 | fixed (requires human verification) | `5a4d187` |
| ME-03 | fixed (requires human verification) | `64feb13` |
| ME-04 | fixed | `b9e253c` |
| ME-05 | fixed (requires human verification) | `747c800` |
| LO-01 | fixed (requires human verification) | `00c28fb` |
| LO-02 | fixed (requires human verification) | `52734eb` |
| LO-03 | fixed | `4cbbcfa` |
| LO-04 | fixed | `06d84a1` |
| LO-05 | fixed (requires human verification) | `f5c0c3f` |

## High (BLOCKER)

### HI-01: `paymentToClearInPromo` undershoots, and paying it triggers deferred interest

**Fix status:** fixed (logic change: requires human verification), commit `7418b85`. `paymentToClearInPromo = ceil(financed / promoMonths)`; regression `decide/__tests__/review/hi01-payment-to-clear-in-promo.test.ts`.

**File:** `src/engine/decide/plan.ts:175` (via `src/engine/payoff/amortise.ts:39-40`)
**Issue:** The figure is `amortise(principal, ZERO_PERCENT, promo.months).payment`, which is `divideHalfUp(P, n)`. That is the *level* payment, and it rounds down whenever the fraction is below one half. The final payment absorbs the remainder, which the field ignores. Reproduced: 1,000.00 on a 0% deferred-interest card promo for 12 months gives `paymentToClearInPromo = 8333`, and 12 x 8,333 = 99,996. That leaves 4 minor units owing at promo end, so the engine's own schedule charges the full `deferredInterestCharged = 20804` (208.04). Phase 5 will word this figure as what clears the balance inside the promo. A user who follows it pays 208.04 of deferred interest because of a 0.04 shortfall. That is exactly the harm the Decide tab must not cause.
**Fix:** The figure must be the smallest level payment that clears the balance inside the promo: `ceilDivide(P, n)`. D-64 covers this if the `apr === 0n` branch of `amortise` also uses the ceiling. Add a deviation test: paying `paymentToClearInPromo` for `promo.months` months must bring the balance to 0.
```ts
paymentToClearInPromo: minorFromBigInt(ceilDivide(BigInt(principal), BigInt(promo.months)), FN),
```

### HI-02: A card minimum that hits the 600-month cap reports its cost as if it cleared

**Fix status:** fixed (logic change: requires human verification), commit `d9a174b`. `exceeds_month_cap` now has null `interest`, `total`, `cardCosts`, `payoffMonths` and promo `interestAfterPromo`; new `CardPlanDetail.remainingAtCap`; regression `review/hi02-card-minimum-at-cap.test.ts`.

**File:** `src/engine/decide/plan.ts:391-394, 412-413, 420, 423`
**Issue:** For `s.outcome === 'exceeds_month_cap'`, the `else` branch sets `interest = s.totalInterest` and `payoffMonths = s.months` (600). It then reports `total = price + interest + fees` and `cardCosts = interest + fees`. `s.remainingBalance` is never added. Reproduced: 100,000.00 at 5% APR, 0.5% minimum, no interest added, floor 0. The result is `outcome: 'exceeds_month_cap'`, `remainingBalance: 6,064,042`, yet the plan shows `total: 29,679,778`, `interest: 19,679,778` and `payoffMonths: 600`. The total understates the real cost by 60,640.42, and `payoffMonths: 600` reads as "paid off in 50 years" when the balance is still open. D-17 says reaching the cap is its own outcome, but the plan figures do not respect it.
**Fix:** Treat the cap like `never_clears` for the cost figures. Either set `interest`, `total`, `cardCosts` and `payoffMonths` to `null` and add a `remainingAtCap` field, or report `total` as a lower bound with an explicit code. Do not let a capped run carry a finite "total".
```ts
} else if (s.outcome === 'exceeds_month_cap') {
  interest = null; payoffMonths = null; // plus: card.remainingAtCap = s.remainingBalance
} else { interest = s.totalInterest; payoffMonths = s.months; }
```

### HI-03: Instalment plans do not scale with price, so the affordable price and the cheaper alternative are wrong

**Fix status:** fixed (logic change: requires human verification), commit `f327023`. `withPrice` scales the instalment amount by price ratio, rounded up, keeping the count (user decision); regression `review/hi03-instalments-scale-with-price.test.ts`.

**File:** `src/engine/decide/plan.ts:519-521` (`withPrice`), `src/engine/decide/bisect.ts:385-392`, `src/engine/decide/alternatives.ts:77-84`, `src/engine/decide/options.ts:252-257`
**Issue:** `withPrice` replaces `price` but keeps `instalmentAmount`. An instalment plan's `dayOne`, `monthly` and cash flows therefore do not depend on price. `alternatives.ts` scales a loan deposit (line 81) but does nothing for instalments. Reproduced with 12 x 3,500.00 on a 42,000.00 price and 3,000.00 a month spare:
- `affordablePrice` returns `nothing_affordable`, so the affordable-price option is silently dropped for every BNPL check that fails the month or cash line.
- `buildAlternatives` builds the 65% "cheaper version" with the same 3,500.00 instalments. It returns `suppression: { code: 'month_short', amount: 50000 }`, `dayDiff: 0` and `monthlyDiff: 0`. This tells the user a cheaper version still does not close the month, which is false: proportional instalments would be 2,275.00.
- When only the `owe` line fails (financed = price), bisection returns a `found` price while the payments stay unchanged. The resulting plan has `total < price` and a meaningless `interest`.
**Fix:** In `withPrice` (or a dedicated re-pricer used by bisection and alternatives), scale instalment terms with price. Then add bisect and alternatives tests for the instalment method.
```ts
amount' = divideHalfUp(instalmentAmount * newPrice, oldPrice)
```
If that is judged out of scope, return a code (`affordable_price_unavailable_for_instalments`) instead of omitting or suppressing on false grounds.

### HI-04: D-64 is ratified but not implemented, so the month test understates the final payment on long or high-APR terms (known item 1)

**Fix status:** fixed (logic change: requires human verification), commit `fe82b80`. D-64 implemented: level payment = exact payment rounded up (0%: `ceil(P / n)`), stepped up one unit when per-month half-up interest would leave the final payment above it. Changed expectations named in `payoff/__tests__/deviations/d64-level-payment-rounds-up.test.ts`; decide regression `review/hi04-level-payment-rounds-up.test.ts`.

**File:** `src/engine/payoff/amortise.ts:39-47`, `src/engine/payoff/rateSchedule.ts:166, 175`, `src/engine/decide/plan.ts:250, 369`, `src/engine/decide/options.ts:259-274`
**Issue:** `04-CONTEXT.md` D-64 (execution-review decisions, 2026-10-16) amends D-20 so the level payment rounds **up**. The code still uses `divideHalfUp`. Measured:
- **Realistic terms are fine.** Across consumer loans (500.00-50,000.00, 5-36%, 12-84 months), the worst |final - level| is 161 minor units. Across mortgages (100k-800k, 3-9%, 180-360 months), it is 639 minor units.
- **The residual blows up when the monthly interest sits within half a unit of the payment.** 1,000.00 at 22.9% over 360 months gives a level payment of 19.10 and a final payment of 233.58. Over 600 months it gives 19.08 and 1,019.08: the loan never amortises and the final month repays the whole principal. 100,000.00 at 29.9% over 600 months gives 2,491.67 and 102,491.67. 5,000.00 at 29.9% over 360 months gives 124.60 and 402.46.

This is user-facing for three reasons:
- `Plan.monthly` is `am.payment` (the level payment) when there is no promo, so the month test, DSR, cash path and bisection never see the balloon month.
- `paymentSteps` (Phase 5's series source of truth) writes the balloon into the user's recurring series.
- The `longer_term` option (`options.ts:260-274`) adds 24 months and reports the *level* payment. It can advertise a lower monthly while the final payment grows, which is the region where this bites.

Card `months` payoff accepts up to 600 months, so this region is reachable from the UI.

**Cost of the fix against D-20 and golden parity:** low.
- Ceiling the level payment (`(num + den - 1n) / den`, and `ceilDivide(P, n)` at 0%) keeps `totalPaid === principal + totalInterest`. The final payment becomes at most the level payment.
- Golden `dpmt` parity tolerates ±1 minor unit and ceil differs from half-up by at most 1, so it still passes. The `dpmt-100000-22.9-600` case already rounds up today and clears at month 592 with a final payment of 0.
- `amortise.reference.test` (D-57) vectors move by at most 1 per payment, and decide plan-interest tolerances (`ceil(n/2)+1`) absorb that.
- The one parity number that needs re-derivation is the 04-11 bisection band (ME-04).
- Ceiling does create early clearance (ME-03): 1,000.00 at 22.9% over 600 months clears at month 421. That must be reported, not hidden.

**Interim mitigation** if D-64 is deferred: set `monthly = max(am.payment, am.finalPayment)` for the month test on every amortised plan, the way the promo branch uses `highestPayment`. This needs no D-20 change and no parity change.
**Fix:**
```ts
payment = apr === 0n ? ceilDivide(P, n) : (P * apr * An + D * (An - Dn) - 1n) / (D * (An - Dn));
```
Then report the real clearing month (ME-03), add a named D-64 deviation test, and re-run the golden checks.

## Medium (WARNING)

### ME-01: High user-entered projection rates overflow and throw, which kills the whole options, alternatives or investment-views result

**Fix status:** fixed (logic change: requires human verification), commit `d18e018`. Rates above 100% a year rejected with `MissingReason` `projection_rate_out_of_range` (no throw); projections computed exactly and reported as `null` + `rangeCode: 'exceeds_range'` past the safe range. Regression `review/me01-projection-rate-range.test.ts`.

**File:** `src/engine/decide/options.ts:330-338`, `src/engine/decide/alternatives.ts:93, 108`, `src/engine/decide/investmentViews.ts:181-221`, `src/engine/decide/projectionRates.ts:18-22`
**Issue:** `resolveProjectionRates` only rejects rates below 0, and `percent()` accepts up to 9999.9999999999%. `futureValue` at a high rate over a long horizon exceeds `MAX_SAFE_INTEGER`, and `minorFromBigInt` throws. The horizon is the plan term, up to 600 months for a long loan or a card minimum. Reproduced: a 60% entered rate with a 600-month loan makes `buildOptions` throw "futureValue: result exceeds Number.MAX_SAFE_INTEGER". One projection figure takes down the affordable price, cut-line and save-first options too.
**Fix:** Bound projection rates at input (for example `<= 100%`, with a cited cap). Also cap each projected figure (return `null` with an `exceeds_range` code) instead of throwing inside a per-rate `map`.

### ME-02: Instalment plans drop on-the-day fees from day-one cash and the total

**Fix status:** fixed (logic change: requires human verification), commit `5a4d187`. Instalment `dayOne` and `total` include `dayFees`; `financed = price - dayFees`; implied rate on `financed`. Regression `review/me02-instalment-day-fees.test.ts`.

**File:** `src/engine/decide/plan.ts:290-312`
**Issue:** `ResolvedPrice.price` includes `dayFees` (`checkInputs.ts:576-578`). The loan path pays them on day one (`plan.ts:242`) and the card path puts them on the card. The instalment path sets `dayOne = amount` and `total = amount * count`, so the fees leave cash nowhere. Reproduced: a 4,300.00 price with 300.00 of on-the-day fees and 4 x 1,000.00 gives `dayOne: 100000`, `total: 400000` and `interest: 0`. The `cash` check is understated by the fee.
**Fix:** Define whether instalments cover the fees. If they do not, use `dayOne = amount + dayFees` and `total = amount * count + dayFees`. Either way, add a test that pins the rule.

### ME-03: An amortised schedule can clear early while reporting the full term and a final payment of 0

**Fix status:** fixed (logic change: requires human verification), commit `64feb13`. `months` = last paying month, `finalPayment` = last non-zero payment, new `termMonths`; `Plan.months` / `payoffMonths` follow; `longer_term` and the views' loan debt schedule read the entered term. Regression `review/me03-early-clearing-months.test.ts`.

**File:** `src/engine/payoff/amortise.ts:52-73`, `src/engine/payoff/rateSchedule.ts:175-181`, `src/engine/decide/plan.ts:251, 257, 372-373`
**Issue:** When the rounded level payment is above the exact annuity, the clamp `paid = min(payment, due)` drives the balance to 0 before month n. Every later month then pays 0. `AmortisationResult.months`, `Plan.months` and `card.payoffMonths` still report n, and `finalPayment` / `finalMonthly` is 0. This already happens with half-up rounding: 100,000.00 at 22.9% over 600 months clears at month 592 with `finalMonthly: 0`. Under D-64's ceiling it becomes common on long terms (1,000.00 at 22.9% over 600 months clears at month 421). `do_without` and `investmentViews` then project over a horizon that includes months with no payment.
**Fix:** Track the clearing month in `amortise` and `amortiseSchedule` and return it (`months` = the actual last paying month, or a separate `clearsInMonths`). Make `finalPayment` the last non-zero payment. This lands together with D-64.

### ME-04: The golden bisection parity test does not exercise the shipped bisection, and its band will be invalid under D-64 (known item 2)

**Fix status:** fixed, commit `b9e253c`. Golden bisection test calls `affordablePrice`; band only for payment-driven flips (month, dsr, cash_dip, inv), re-derived under D-64 as `ceil(price / monthly) + 1` (49 and 47 units on the loan fixtures; 0 for owe/cash). Observed gaps are 0.

**File:** `src/engine/decide/__tests__/golden.test.ts:150-177` (test reliability)
**Issue:** On known item 2, the widened band `ceil(0.5 x price / monthly) + 1` is correctly derived for payment-driven flips. On the fixtures it is small: 24 minor units for loan-dsr-only, 44 for loan-owe-only, 0 for cash. It does not hide a material error today. There are three defects:
- The test re-implements its own bisection (lines 155-164) and never calls `affordablePrice` or `bisectLargest`. Golden parity of the shipped function is therefore untested.
- The band is applied whatever the binding line is. On `loan-owe-only` the flip does not depend on the payment at all, yet the test still tolerates 44.
- Under D-64 the engine payment can differ from the float by up to 1 unit (not 0.5), so the band needs `ceil(price / monthly) + 1`, or the two loan scenarios (observed gaps 20 and 11) may fail.
**Fix:** Call `affordablePrice(ctx, check)` in the golden test. Apply the rounding band only when the binding warning is `month`, `dsr` or `cash_dip`. Re-derive the band when D-64 lands.

### ME-05: The DSR line is silently skipped when the income basis is 0

**Fix status:** fixed (logic change: requires human verification), commit `747c800`. Income basis 0 with debt service breaches dsr (shortfall = `debtServiceAfter`); `lineMargins` keeps the dsr line. Regression `review/me05-dsr-zero-income.test.ts`.

**File:** `src/engine/decide/assess.ts:299-300`, `src/engine/decide/decision.ts:61-64`
**Issue:** `dsrBreach` requires `incomeBasis > 0`. Under the cautious `worst` basis (any non-steady or short history), one zero-income month makes `incomeBasis = 0`. A new loan then never breaches DSR, `checks.dsr` reports `true`, and the margin line is omitted. The month test usually still fails, but when saving and investing cover the gap the state is `adjust` with only `inv`. The debt line that should be failing is reported as passing.
**Fix:** With `incomeBasis === 0` and `debtServiceAfter > 0`, treat DSR as breached (ratio undefined, shortfall = `debtServiceAfter`). At minimum, report `checks.dsr` as `null` (not applicable), not `true`.

## Low (WARNING, minor)

### LO-01: Zero-income history is classed `steady` and can reach `strong` confidence

**Fix status:** fixed (logic change: requires human verification), commit `00c28fb`. All-zero income is `volatile` with `incomeCvPercent: null`; named deviation `decide/__tests__/deviations/lo01-zero-income-not-steady.test.ts`.

**File:** `src/engine/decide/money.ts:295-297`
**Issue:** For prototype parity, `S === 0n` gives `steady`. A user with 6 full months of zero logged income therefore gets the `average` spending basis (not `worst`) and `confidence: strong`.
**Fix:** Treat `S === 0n` as `insufficient` or `volatile` for basis and confidence. Name it as a deviation from the prototype.

### LO-02: A refund marked one-off is counted but its amount is dropped

**Fix status:** fixed (logic change: requires human verification), commit `52734eb`. One-off refunds net against one-off spending per category total, floored at 0. Regression `review/lo02-one-off-refunds.test.ts`.

**File:** `src/engine/decide/money.ts:129-136`
**Issue:** `oneOff && isRefund` increments `oneOffCount` but adds the amount to neither `oneOffSpending` nor net spending. The count and the figures disagree. Separately, one-off spending is shared line by line (`myPart(l.amount)`) while ordinary spending is shared per category total, so the rounding differs.
**Fix:** Net one-off refunds against `oneOffSpending` (floored at 0), or reject `oneOff` on refunds.

### LO-03: Snapshot limits are not validated

**Fix status:** fixed, commit `4cbbcfa`. `prepareContext` validates every non-null limit (`RangeError`). Regression `review/lo03-limits-validated.test.ts`.

**File:** `src/engine/decide/assess.ts:83-105`
**Issue:** `limits.reserve`, `investingFloor`, `savingFloor`, `spareFloor` and `dsrLine` are not checked for sign or safety. A negative reserve passes silently when there is no cash path, and throws only inside `cashPath.ts:249-252` when there is one.
**Fix:** Add `assertNonNegative` for each non-null limit, and `dsrLine >= 0n`.

### LO-04: `dayFees` can exceed a price floored at 0

**Fix status:** fixed, commit `06d84a1`. `resolvePriceInputs` clamps `dayFees` to `price`. Regression `review/lo04-day-fees-within-price.test.ts`.

**File:** `src/engine/decide/checkInputs.ts:584-589`, `src/engine/decide/plan.ts:238-243`
**Issue:** When take-off lines exceed the advertised price plus adds, `price` floors at 0 but `dayFees` keeps the on-day adds. `planLoan` then gives `dayOne = dayFees > price` and a positive "interest" of `dayFees - price`.
**Fix:** Clamp `dayFees` to `price` in `resolvePriceInputs`, or reject the combination.

### LO-05: Instalment inputs are not cross-checked against the price

**Fix status:** fixed (logic change: requires human verification), commit `f5c0c3f`. Instalment total computed in bigint; amount x count below the financed price is `missing` with `PlanReason` `instalment_total_below_price`. Regression `review/lo05-instalments-cover-price.test.ts`.

**File:** `src/engine/decide/plan.ts:290-302`
**Issue:** `amount * count < price` is accepted. The plan's `total` is then below the price, `interest` is 0 and `impliedAnnualRate` is 0, which makes HI-03's `found` case meaningless. `amount * count` is also number arithmetic (safe only because `minorUnits` throws past `MAX_SAFE_INTEGER`).
**Fix:** Return a `missing` reason or a fact code when the instalments do not cover the financed price. Compute the total in bigint.

---

## Notes (no finding)

- The cash path (D-44/D-59), position stacking (D-41), worst future month (D-45), share allocation (largest remainder, negatives handled), setbacks and stress were traced end to end, and no sign or off-by-one errors were found.
- `bisectLargest` keeps `fits(lo) && !fits(hi)` and terminates.
- `futureValuePath` with a negative net rate flips both sides before half-up, which is correct.
- The deferred-interest shadow accrues on the opening balance and is charged only when the balance is open at promo end, as documented.

_Reviewed: 2026-10-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
