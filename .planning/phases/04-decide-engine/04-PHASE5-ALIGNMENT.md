# Phase 04 ↔ Phase 5 Alignment (2026-10-15)

Phase 5 (decide-ui) is being planned in parallel against `05-CONTEXT.md` (D-01…D-23) and `05-UI-SPEC.md`. This document checks every figure and code those screens render against what the Phase 4 plans produce through the public barrel (04-12). It records each gap and the plan change that closes it.

**Rules kept:**
- Engine purity: no React, I/O, db, state, services or UI.
- Integer minor units throughout.
- Codes and numbers only, never strings (D-21).
- 100% branch coverage on `engine/decide` and `engine/payoff`.
- No invented rates or amounts (D-05, D-07).

**Waves and plan count:** unchanged by the alignment revision (13 plans in 6 waves). **Superseded by the 2026-10-15 engine depth expansion:** 22 plans in 8 waves (04-22 split out of 04-06 after checker iteration 1); see "Engine depth expansion (D-41..D-58) — public API" at the end.

## Gap list

Status key:
- **covered**: already produced as specified.
- **fixed**: was missing or ambiguous, and closed by this revision.
- **named differently**: produced, but under another name (the mapping is given).
- **open**: needs a user decision or belongs to Phase 5.

### Quick check and first read (05 D-01…D-04, D-21…D-23)

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 1 | Cash quick check through `assess()`, paid in full | `assess(snapshot, { …, payment: { method: 'cash' } })` (04-07) | covered |
| 2 | Credit = a loan with no deposit, APR from 0%, 12–60 months | `BuyPayment` `{ method: 'loan', deposit: 0, apr: ZERO_PERCENT or the typed rate, termMonths }`. 0% is valid and is not "missing" (04-06). A test for the exact quick-check path was added to 04-06 | covered (test added) |
| 3 | Optional sales tax % and fees **added to the day-one price** | Missing. `BuyCheck` takes a resolved `price`/`dayFees` only, and the prototype's `dprice`/`downNet` were never ported | **fixed** by D-37: `salesTaxAmount`, `resolvePriceInputs` (04-06 Task 3). Tax and fees become counted, on-the-day adjustments, so a cash plan pays them in the price, and a no-deposit loan pays them on day one and finances the advertised price |
| 4 | Step-2 adjustment lines ("Adds to / Takes off the price", "Paid on the day", "{n} of {m} lines counted", Final price) | Missing (as #3) | **fixed** by D-37: `ResolvedPrice { price, dayFees, adjustmentsNet, countedLines, totalLines }` |
| 5 | Running costs net of replaced expenses ("Net monthly change", "{gross} added, {repl} ends") | Missing: `runningCostsNet` came in pre-summed | **fixed** by D-37: `netRunningCosts(costs, replaced)` → `RunningCosts` |
| 6 | `firstRead()` with the same inputs, Credit included | `firstRead(figures, check)` resolves any method through `resolvePlan` (04-08). A test for Credit with tax and fees was added | covered (test added) |
| 7 | Size label (05 D-22) on every quick-check, full-check and first-read result | `Assessment.size`, `Verdict.size` (missing; null only when the context fails), `FirstRead.size` (D-36) | covered |
| 8 | "Not from cash: {short} short of your cushion"; the Credit monthly figure and "{n} months" | The `cash` warning's `shortfall`, `plan.monthly`, `plan.months` | covered |
| 9 | First-read basis marker | `FirstRead.basisMarker = 'first_read_rough_figures'` | covered |
| 10 | D-04 handover from the first read to real history | `assess()` returns `missing` with reason `no_full_month` until one full month exists; Phase 5 then switches from `firstRead` to `assess` | covered |

### Step 2: price and how you pay

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 11 | Method cards: On the day / A month / Total paid, interest | `resolvePlan(check)` → `Plan.dayOne`, `monthly`, `total`, `interest` | covered |
| 12 | Flags: "Rate needed", "Not accepted", "Part on the card" | `PlanReason` `loan_apr_missing` / `card_apr_missing`, `card_not_accepted`, `plan.card.remainderOnDay > 0` | covered |
| 13 | The instalment note "about {pct}% a year" | Missing | **fixed**: `Plan.impliedAnnualRate` (the prototype's flat figure, from the user's own numbers; instalment only) (04-06) |
| 14 | Card "Cleared / Interest", "Never", "Not within 50 years" | `plan.card.minimumOutcome` (`never_clears` / `exceeds_month_cap`), `payoffMonths`, `interest` (null when it never clears) | covered |
| 15 | Deposit slider tiles, term chips, card months stepper | Re-run `resolvePlan` with each value | covered |
| 16 | Investment note "worth about {fv}" | `futureValue` from `src/engine/payoff` (a public barrel) | covered |

### Step 3: impact (05 D-05, D-06)

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 17 | Verdict state and chip | `Verdict.state` | covered |
| 18 | Warning codes and shortfalls, up to six, ordered | `Assessment.warnings` (`month`/`cash`/`cash_dip`/`dsr`/`owe`/`inv`; `cash_dip` added by D-44) | covered |
| 19 | The pause case: "closes only if $x a month of investing / saving / both pauses" | The `inv` warning (shortfall = `pauseNeeded`), `investingAtRisk`, `savingAtRisk`, `investingAfter`, `savingAfter` | covered |
| 20 | Title "already {x} short. This makes it {y}" | `context.leftBefore < 0`, `left` | covered |
| 21 | The dsr value "{pct}" and the line "Debt payments would reach {pct} of money in" | Missing: only money (`debtServiceAfter`) was returned | **fixed**: `debtServiceRatioBefore/After` (Percent, null when income is 0) (04-07) |
| 22 | The owe description: "{annual} of annual income … {mult} times average monthly income" | Missing | **fixed**: `context.annualIncome`, `limits.unsecuredIncomeMultiple` (04-07) |
| 23 | Card reason cards | `PlanReason`, `plan.card.*` | covered |
| 24 | Neutral fact `debt_rate_exceeds_return` | `Assessment.facts` (D-31) | covered |
| 24a | Neutral fact "cash is tight before payday anyway" (added 2026-10-15, D-59) | `Assessment.facts` entry `{ code: 'cash_tight_before_payday', date, amount }`, also `cashPath.tightBeforePayday` (04-17, 04-07) | **fixed** by D-59 (see "Cash path, day by day") |
| 25 | Basis marker "Average / Worst month · {in}" | `context.money.basis`, `money.incomeBasis` | covered |
| 26 | **The month line by line (Now/After)**: money in, living, debt payments, saving and investing, running costs or this contribution, left | Partial. The figures existed but no table did, and under D-35 the prototype's rows do not add up | **fixed** by D-38: `Assessment.monthTable { now, after }`, pre-pause, rows sum exactly (04-07 Task 4; named test 04-11) |
| 27 | **The five ledgers** (Income, Expenses, Debt, Cash, Investments) with a direction dot | Missing. The total debt balance was not in the context at all | **fixed** by D-38: `Assessment.ledgers` (code, now, after, `better`/`worse`/`same`), `context.debtBalance`, `debtBalanceAfter`. The Cash row reads `context.ledgerCash` (Now) → `Assessment.ledgerCashAfterPurchase` (After), so the bills due within 90 days and the scheduled outflows dated on or before asOf (D-61) are off both sides and the change shown is the purchase alone, with or without a cash path. A scheduled outflow dated after asOf is not in the row (it is in the spare-money figures) |
| 28 | Against your lines: cash cushion, month closes, debt service, **unsecured debt**, investing floor, saving floor | Ambiguous. `LimitChecks` had no `owe`, and the ratios were missing | **fixed**: `checks.owe`, plus the values from #21/#22 and `unsecuredAfter` vs `limits.unsecuredLine` |
| 29 | "If something goes wrong": runway plus setbacks | Setbacks covered (`applySetbacks`, `DEFAULT_SETBACKS`); runway missing | **fixed** by D-39: `SetbackReport.runwayMonths` (04-10). Setbacks and runway start from `Assessment.cashAfterBillsAndPurchase` (purchase and D-24 bills taken off, even when a cash path exists) |
| 30 | Options list with action payloads | `buildOptions` → `affordable_price.price` (bisected, exact), `longer_term.termMonths/monthlyPayment/leftChange/monthCloses/extraInterest`, `cut_line.lineId/cut/gap/closesGap`, `earn_more.gap/percentOfIncome`, `save_first.need/months`, `do_without.keptMonthly/horizonMonths/projected/byRate` (D-51) | covered. `affordable_price.price` is the **final** price; "Use this price" sets advertised = price − `adjustmentsNet` (the prototype's rule) |
| 31 | Assumptions in play | `money.fullMonthsUsed`, `steadiness`, `basis`, `spendingBasis`; debt counts from the snapshot; `limits.projectionReturn`; running-cost counts from `RunningCosts` | covered (counts via #5) |
| 32 | Who pays what (household; hidden until Phase 8) | Only `myPart` | **fixed**: `memberParts(total, share)` (04-02) |

### Decide home

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 33 | Your month: in / out / left, steadiness chip, Worst/Average chips | `prepareContext(snapshot)` → `money.*`, `leftBefore`, `pausable`, `debtPayments` | covered |
| 34 | Steady line "{n} months of income within {pct} of each other" | Missing: there was no CV figure | **fixed**: `MoneyBasis.incomeCvPercent` (exact whole-percent half-up, integer square root, 04-13) |
| 35 | Lines you will not cross (five rows, blank = default) | Inputs are `DecideLimits` (null = default); resolved values are in `context.limits` | covered |

### Step 4: alternatives (05 D-07, D-17)

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 36 | Four rows: On the day / A month / Kept | `buildAlternatives` → `rows[].dayOne/monthly/projected/contributed/growth` | covered. The cheaper row's day-one and monthly figures are now specified |
| 37 | Suppression reasons (six UI strings) | `Suppression.code` + `amount`: `month_short` (cheaper: "Month still {x} short on this plan"; wait/skip: "Month is {x} short — nothing spare"), `too_thin`, `nothing_freed`, `past_horizon` (with `Alternatives.monthsToBuy` and `horizonMonths`), `nothing_spare` ("No cash above cushion, no monthly surplus") | named differently: Phase 5 maps (row code, suppression code) to a string |
| 38 | "Kept" at 0%, with optional user rates shown as "Kept, at x%" | The engine returns every rate (D-51): `DecideSnapshot.projectionRates` (up to three user rates) → `context.limits.projectionRates` (0% first); each non-suppressed row carries `byRate: RateFigure[]` and `Alternatives.rates` echoes the list. The single `projected`/`contributed`/`growth` fields stay at `snapshot.projectionReturn` (null = 0%, D-06) for prototype parity | covered (revised after checker iteration 1): Phase 5 chooses which rate(s) to display; it no longer relies on 05-UI-SPEC assumption 17 |
| 39 | The "Spend less" card and the trade line: not spent, "{x} less on the day, then {y} a month", "lowers the payment from {a} to {b}, but the month still only leaves {left}" | Missing | **fixed**: `Alternatives.cheaper` (`notSpent`, `dayDiff`, `monthlyDiff`, `keptOnDay`, `keptMonthly`, `leftAfter`, `monthlyPayment`, `ratioPercent`) (04-10) |
| 40 | Wait row "Buy at month {n}, then keep the {pay} a month" | `monthsToBuy`, `rows[2].monthly` | covered |

### Step 5: the decision (05 D-09…D-12)

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 41 | Plan card: On the day / A month / Left after | `mineDayOne`, `newMonthly`, `left` | covered |
| 42 | Go ahead, loan: the debt and a recurring payment series | `plan.financed`, the check's `apr`/`termMonths`, `plan.monthly`, `plan.months`; the last payment was missing | **fixed**: write the series from `Plan.paymentSteps` (`{ fromMonth, toMonth, amount }` runs whose total is exactly the schedule's, D-20), the source of truth with or without a promo. `Plan.finalMonthly` is the last payment for display; `monthly × (months − 1) + finalMonthly` is exact only for single-rate plans (with a D-48 promo `monthly` is the highest payment) |
| 43 | Go ahead: instalment, cash, card, running costs, "your investing drops to {amt}" | `plan.*`, `RunningCosts`, `investingAfter` | covered |
| 44 | Wait and save: amount, ready-by date, "within what you have spare" | Missing | **fixed** by D-40: `buildWaitPlan(context, check, monthlyAmount)` → `WaitPlan` (04-10 Task 3) |
| 45 | D-12 estimate figures (day-one cost and monthly cost, payment plus running costs) | `mineDayOne`, `newMonthly` (= `mineMonthly + mineRunning`). Phase 5 stores them on the decision at Go ahead | covered |

### Cross-cutting

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 46 | D-15 live recompute | Pure, stateless functions; `assess` is deterministic (D-30) | covered |
| 47 | D-18 / 04 D-34 per-check purchase split vs existing-spending share | `snapshot.scope.rule` (purchase, all four rules including `amount`) vs `snapshot.householdSpending` (existing spending) | covered |
| 48 | D-14 limits stored once per user | `DecideLimits` is an input | covered |

## What changed

| Plan | Change |
|---|---|
| 04-CONTEXT | Added D-37 (check inputs), D-38 (month table and ledgers, pre-pause), D-39 (runway), D-40 (wait-and-save plan), each marked "added 2026-10-15 for Phase 5 alignment" |
| 04-02 | `memberParts(total, share)`; `myPart` becomes an index into it (one split implementation) |
| 04-05 | Contract block: `PriceAdjustment`, `PriceInputs`, `ResolvedPrice`, `CostLine`, `RunningCosts`, `MonthColumn`, `MonthTable`, `LedgerCode`, `LedgerDirection`, `Ledger`, `CheaperDetail`, `WaitPlan`; new fields `Plan.finalMonthly`, `Plan.impliedAnnualRate`, `MoneyBasis.incomeCvPercent`, `ResolvedLimits.unsecuredIncomeMultiple`, `AssessContext.debtBalance`, `annualIncome`, `LimitChecks.owe`, `Assessment.debtServiceRatioBefore/After`, `debtBalanceAfter`, `monthTable`, `ledgers`, `Alternatives.cheaper`, `SetbackReport.runwayMonths` |
| 04-06 | `finalMonthly`, `impliedAnnualRate`; a quick-check Credit test; **Task 3** `checkInputs.ts` (D-37) plus `deviations/d37-check-inputs.test.ts` |
| 04-07 | prepareContext: `debtBalance`, `annualIncome`, `unsecuredIncomeMultiple`; assessPlan: ratios, `debtBalanceAfter`, `checks.owe`; **Task 4** month table and ledgers (D-38) with a sum-invariant property |
| 04-08 | One test: the onboarding first check on Credit with tax and fees (no contract change) |
| 04-10 | `Alternatives.cheaper`, the cheaper row's figures, `runwayMonths`; **Task 3** `wait.ts` (`buildWaitPlan`, D-40) plus `deviations/d39-d40-runway-and-wait.test.ts` |
| 04-11 | `deviations/d38-month-table.test.ts` |
| 04-12 | Barrel 16 → 18 modules (`checkInputs`, `wait`); the public-API smoke covers the quick-check Credit path; the codes guard walks ledger and direction codes and the wait plan |
| 04-13 | `incomeCvPercent` (exact, integer square root) |
| 04-VALIDATION | Rows 04-06-T3, 04-07-T4 and 04-10-T3; the named-deviation list |

## Public API names for Phase 5 (from `src/engine/decide`)

- **Check inputs (D-37):**
  - `salesTaxAmount(advertised, taxPercent: Percent)`.
  - `resolvePriceInputs({ advertised, adjustments: PriceAdjustment[] })` → `ResolvedPrice { price, dayFees, adjustmentsNet, countedLines, totalLines }`.
  - `netRunningCosts(costs: CostLine[], replaced: CostLine[])` → `RunningCosts { gross, replaced, net, … }`.
  - These feed `BuyCheck.price`, `dayFees` and `runningCostsNet`.
  - The quick check maps tax and fees to `PriceAdjustment { effect: 'adds', onDay: true, counted: true }`.
- **Credit (05 D-23):** `payment: { method: 'loan', deposit: 0, apr: percent(typed) or ZERO_PERCENT, termMonths: 12 | 24 | 36 | 48 | 60 }`.
- **Verdict:** `assess(snapshot, check)` → `Verdict`; `prepareContext(snapshot)` → `ContextResult` (for Your month).
- **Assessment fields:**
  - Core: `state`, `size`, `warnings`, `facts`, `plan`.
  - Money: `mineDayOne`, `mineMonthly`, `mineRunning`, `newMonthly`, `left`, `cashAfter` (the `cash` check/warning figure), `cashAfterBillsAndPurchase` (purchase, D-24 bills and every scheduled outflow within 90 days off, always; what setbacks, runway and income at risk use), `ledgerCashAfterPurchase` (the D-38 Cash row's After: `context.ledgerCash − mineDayOne`).
  - Pause: `pauseNeeded`, `investingAtRisk`, `investingAfter`, `savingAtRisk`, `savingAfter`.
  - Debt: `debtServiceAfter`, `debtServiceRatioBefore`, `debtServiceRatioAfter`, `unsecuredAfter`, `debtBalanceAfter`.
  - Screens: `checks` (`cash`, `month`, `dsr`, `owe`, `inv`, `save`), `monthTable` (`now`/`after`: `income`, `living`, `debtPayments`, `savingInvesting`, `thisPurchase`, `outgoings`, `left`), `ledgers` (`code`, `now`, `after`, `direction`), `burn`, `context`.
- **Context fields:** `context.limits` (`reserve`, `dsrLine`, `unsecuredLine`, `unsecuredIncomeMultiple`, `investingFloor`, `savingFloor`, `projectionReturn`), `context.money` (`incomeBasis`, `incomeAverage`, `incomeWorst`, `incomeBest`, `spendingBasis`, `steadiness`, `incomeCvPercent`, `basis`, `fullMonthsUsed`), `context.leftBefore` (the D-45 worst month once positioned), `context.leftThisMonth` (this month's left over; what D-36 size uses), `cashAvailable` (path-aware: the `cash` check/warning and D-36 `from_savings` only), `cashAfterBills` (cash after bills due within 90 days, always: the Cash ledger row's Now, spare cash, wait, save first, income at risk, net worth), `billsDue`, `debtBalance`, `annualIncome`, `debtPayments`, `pausable`, `limits.projectionRates`.
- **Plan fields:** `dayOne`, `monthly`, `months`, `financed`, `total`, `interest`, `finalMonthly`, `impliedAnnualRate`, `card` (`onCard`, `remainderOnDay`, `payoffMonths`, `minimumOutcome`). Per-method cards: `resolvePlan(check)`.
- **Options:** `buildOptions(context, check, assessment)` → codes `affordable_price`, `longer_term`, `cut_line`, `earn_more`, `save_first`, `do_without` (with `byRate`, D-51). Separately, `affordablePrice(context, check)`.
- **Alternatives:** `buildAlternatives(context, check, assessment, cheaperRatioPercent)` → `rows` (`as_planned`, `cheaper`, `wait_and_save`, `skip`; each with `byRate: RateFigure[] | null`, D-51), `rates` (the `ProjectionRate` list), `cheaper` (`CheaperDetail`), `spareCash` (from `cashAfterBills`), `spareMonthly`, `monthsToBuy`, `waitMonths`, `horizonMonths`, `projectionReturn`. The suppression codes are `month_short`, `too_thin`, `nothing_freed`, `past_horizon` and `nothing_spare`.
- **Setbacks:** `applySetbacks(assessment, setbacks)` → `results`, `combinedHit`, `stressedCash`, `stressedOutcome` (`absorbed`, `through_cushion` or `wiped_out`), `runwayMonths`, all from `assessment.cashAfterBillsAndPurchase`. Defaults: `DEFAULT_SETBACKS`.
- **Wait (D-40):** `buildWaitPlan(context, check, monthlyAmount | null)` → `WaitPlan { target, monthlyAmount, spareMonthly, withinSpare, months, readyBy }` (spare cash from `context.cashAfterBills`). `readyBy` is null when months is null or exceeds SIMULATION_MONTH_CAP, and Phase 5 must handle the null.
- **First read:** `firstRead(figures: RoughFigures, check)` → `FirstRead` (`state`, `size`, `plan`, `dayOne`, `monthly`, `cashAfter`, `leftAfter`, `roughCushion`, `warnings`, `basisMarker`).
- **Household:** `memberParts(total, share)`, `myPart(total, share)`, `resolveShare(scope)`.
- **Pre-fill only:** `suggestItemType(name)`, `suggestSecured(name)`. **Builder data:** `MARKET_DEFAULTS`, `minimumTermsFromDefaults`.

## Resolved 2026-10-15 (formerly "Still open")

**The user confirmed all five items as proposed on 2026-10-15** (04-CONTEXT D-37…D-40 and the as-of note).

Items 1–4 are recorded in 04-CONTEXT as D-37…D-40, now confirmed. The plans implement them as written.

1. **D-38: the month table is pre-pause** (rows add up; the pause shows beside the table). The alternative is the prototype's display, which lowers the saving row while showing the pre-pause left. Confirm.
2. **D-39: runway** counts whole months from cash *after* the purchase. The prototype used cash before it, to one decimal. Confirm, or ask for tenths.
3. **D-40: wait target** = what spare cash above the cushion does not cover, consistent with the alternatives' wait row. The prototype used max(day-one cost, …), so a cash purchase waited for the whole price. Confirm.
4. **D-37: a trade-in larger than the price** floors the price at 0 rather than raising an error. Confirm.
5. **`snapshot.asOf` is the day the check is evaluated (today), not "When you need it".** The D-24 90-day window and the wait ready-by date run from it. Phase 5's snapshot builder must set it that way. If the user wants the window to follow the need-by date, that is a new decision.
6. 04-REPLAN-NOTES interpretation 10 of the first (D-23…D-36) section still stands: `Verdict.size` is null only when the context cannot be resolved (no full month), and Phase 5 uses `firstRead` there.
7. The prototype's card-question warning cards and the "Your income does not support this" card were dropped by 05-UI-SPEC. The engine adds nothing for them.

## Engine depth expansion (D-41..D-58) — public API

Added 2026-10-15. Phase 5 consumes these through the `engine/decide` barrel (04-12, now 31 modules) and the `engine/payoff` barrel. Every output is codes and numbers (D-21); amounts are integer minor units in the check's currency; APRs and offsets are `Percent` (scaled bigint, percentage units). The names below are the ones the plans' acceptance criteria grep for.

**Plans and waves after the expansion:** W1 04-01, 04-02, 04-03 · W2 04-04, 04-05 · W3 04-13, 04-14, 04-15, 04-16 · W4 04-06, 04-17 · W5 04-07, 04-08, 04-22 · W6 04-09, 04-10, 04-11, 04-18, 04-19 · W7 04-20, 04-21 · W8 04-12.

### Entry point for a check

| Need (05 decision) | Function | Input | Output fields and codes | Plan |
|---|---|---|---|---|
| The whole report for a check, combined with the other open checks (05 D-24, D-26, D-27, D-28, D-30, D-32) | `decide(snapshot, check, otherChecks?)` | `DecideSnapshot`, `PurchaseCheck`, `readonly StackedCheckInput[]` (default []) | `Decision { verdict, standalone, combinedDiffers, stacked, worstMonth, margins, stress, withExpectedIncome }` | 04-20 |
| The combined verdict alone | `assess(snapshot, check, otherChecks?)` | as above | `Verdict` (= `decide(...).verdict`) | 04-18 (rewire of 04-07) |
| The positioned contexts (for bisection, options, alternatives, setbacks, wait, investment views on the combined position) | `positionContext(base, check, otherChecks, options?)`; or simply `verdict.context` | `AssessContext` from `prepareContext`; `{ includeExpectedIncome?: boolean }` | `Position { combined, standalone, stacked }`; `AssessContext.position: PositionInfo { stacked, changes, worstMonth, expectedIncomeIncluded }` | 04-18 |

### Combined checks (D-41, D-41 amended; 05 D-24)

- Input: `StackedCheckInput { check: PurchaseCheck; purchaseRule: SplitRule | null }`, where `PurchaseCheck = BuyCheck | InvestCheck` — an `InvestCheck` is a valid other open check (D-62): a monthly one joins investing and the pausable amount (D-32), a lump one leaves cash on day one. Pass **all** other open checks (D-41 amended); `purchaseRule` is each check's own resolved split, required in household scope and null in personal scope. The toggle "With my other open checks" off = call with `[]`.
- Output: `Decision.verdict` (combined), `Decision.standalone` (`Verdict | null`, null when no other checks), `Decision.combinedDiffers` (boolean), `Decision.stacked: StackedCheck[] { index, status: 'applied' | 'missing', reasons: MissingReason[], mineDayOne, mineMonthly }`.
- Bisection and options on the combined position: `affordablePrice(verdict.context, check)`, `buildOptions(verdict.context, check, verdict)` (unchanged signatures, 04-09).

### Cushion by steadiness (D-42 as amended; 05 D-25)

- `context.limits.reserve` (resolved), `context.limits.reserveHalfMonths: number | null` (6 / 9 / 12 halves = 3 / 4.5 / 6 months; 3 months under 3 full months (6 half-months), D-42 amended; null when the user typed a reserve), with the reason from `context.money.steadiness` (`steady` | `variable` | `volatile` | `insufficient`). Helper: `defaultReserve(monthCosts, steadiness)`, `reserveHalfMonthsFor(steadiness)` (04-15). The first read's cushion stays 3 × rough spending (04-08).

### On the edge (D-43; 05 D-25)

- `Decision.margins: LineMargin[] { line: 'month' | 'cash' | 'dsr' | 'owe' | 'inv' | 'cash_path', margin (signed: ≥ 0 passes, "holds by" / "misses by"), threshold, base, flag: 'on_edge' | null }`. Invest checks report only `month`, `cash` and `cash_path`. Helpers: `lineMargins(assessment, check)` (04-20), `edgeMargin`, `isOnEdge` (04-15). The verdict state is unchanged.
- **The `cash_path` margin is the D-59 measure (revised 2026-10-15, checker W3).** `margin = cashPathMargin(CashDipInput)` (04-17): when `cash_dip` fires it is `−shortfall` ("misses by" exactly the warning's figure); otherwise it is ≥ 0, the room the lowest point with the purchase has before a `cash_dip` would fire (how much further the low could fall, with the day-one cost unchanged). It is never `lowestWith − reserve`, so a purchase that does not lower the 90-day low never reads as missing. `threshold` is the reserve, and `base` is the reserve or, when the reserve is 0, a month's costs (D-43). When the path already dips without the purchase (`cash_tight_before_payday` present) and the purchase does not lower it, the margin is 0 and flagged `on_edge`: it holds, but any further fall before that date would be a dip. Phase 5 should pair that line with the fact rather than say "holds by 0" alone.

### Cash path, day by day (D-44, D-24/D-44 amended; 05 D-26)

- Snapshot input: `DecideSnapshot.incomeSeries: RecurringIncome[]` (confirmed pay series; same fields as `RecurringBill` minus `categoryId`).
- Output on every assessment: `Assessment.cashPath: CashPathReport` = `{ status: 'unavailable', code: 'cash_path_unavailable' }` or `{ status: 'available', withoutPurchase: MinorUnits[91], withPurchase: MinorUnits[91], lowestWithout: CashPathPoint, lowestWith: CashPathPoint, tightBeforePayday: CashTightFact | null }` with `CashPathPoint { day, date: 'YYYY-MM-DD', amount }`; `Assessment.cashDip: 'hard' | 'soft' | null`; warning code `cash_dip` in `Assessment.warnings`; `Assessment.basisCodes` contains `cash_path_unavailable` when skipped.
- **`cash_dip` semantics (D-59, user 2026-10-15; replaces the replan's default 2).** The warning fires only when the purchase causes or deepens the dip: the lowest balance with the purchase is below the reserve (`soft`, at least `adjust`) or below 0 (`hard`, state `no`) **and** lower than the lowest balance without the purchase. Its shortfall is the extra depth the purchase adds, less the part of the `cash` card gap the purchase itself caused (one card per cause): the larger of `max(0, min(reserve, lowestWithout) − lowestWith − max(0, min(reserve, cashOnHand) − cashAfter))` and the same measured at 0 (`max(0, min(0, lowestWithout) − lowestWith − max(0, min(0, cashOnHand) − cashAfter))`). A reserve gap that exists before the purchase (cash on hand already below the reserve) is not the purchase's and is never subtracted (revised 2026-10-15, checker W1): with no day-one cost, cash on hand 500_000, reserve 600_000 and the low falling from 450_000 to 350_000, the dip is 100_000 soft. "Cash on hand" here is the cash before this purchase on the positioned context (`context.cashAvailable`): with other open checks stacked (D-41) it already excludes their day-one costs, so those costs never hide a dip this purchase causes (revised 2026-10-15; 04-20's d41 test: raw cash 1_000_000, a stacked 500_000 purchase, a zero-day-one loan taking the low from 297_808 to 197_808 → soft 100_000, `cash_path` margin −100_000). Phase 5 copy for the card should describe the purchase's own effect ("this purchase takes your lowest point before payday {shortfall} lower"), never the whole gap.
- **`cash_tight_before_payday` (D-59).** A dip that exists without the purchase is a neutral basis fact, never a warning: payload `CashTightFact { code: 'cash_tight_before_payday', date: 'YYYY-MM-DD', amount: MinorUnits }` — the date and amount of the lowest balance **without** the purchase (the amount can be negative). It appears when a cash path exists and `lowestWithout.amount < reserve`, in two places: `Assessment.facts` (after any D-31 `debt_rate_exceeds_return`) and `Assessment.cashPath.tightBeforePayday`. It never changes `fits`/`adjust`/`no`; a check can be `fits` with this fact present. Phase 5 phrases it declaratively (DCU-09), e.g. "Without this purchase, your cash is lowest on {date}, at {amount}", in the Day-by-day surface and the facts area.
- **Stacking and the "without" path (D-41; checker I3).** Under D-41 stacking, the path "without the purchase" is the combined position without this check: it already includes the other open checks. `cash_tight_before_payday` can therefore come from those other checks, so Phase 5 copy must not describe it as "before this purchase" alone; when `Decision.stacked` is non-empty, say that it includes the other open checks (e.g. "Without this purchase, and with your other open checks, …").
- `context.cashAvailable` (the `cash` check): with a path, cash on hand less scheduled outflows dated on or before asOf (bills due soon and future-dated scheduled outflows show only as `cash_dip` in the verdict); without a path, cash on hand less my share of D-24 bills due within 90 days less scheduled outflows dated on or before asOf. Either way a future-dated scheduled outflow is not in the `cash` check (D-61 read literally), and `size`'s `from_savings` follows the same rule. The D-38 Cash row reads `context.ledgerCash` = cash on hand less D-24 bills less outflows dated on or before asOf, with or without a path. `context.cashAfterBills` / `Assessment.cashAfterBillsAndPurchase` keep the D-24 deduction either way, also deduct every scheduled outflow within 90 days, and feed every spare-money figure (alternatives, wait, save first, setbacks, runway, income at risk, net worth). The report always carries both `lowestWith` and `lowestWithout`, so Phase 5 can show either. Helpers: `cashPathForSnapshot`, `spreadUndatedSpending(spreadMonthly, day)`, `purchaseFlows`, `applyOutflows`, `lowestPoint`, `cashPathReport(without, withPurchase, reserve)`, `cashTightFact(lowestWithout, reserve)`, `dipShortfall(input)`, `cashPathMargin(input)` (the D-43 `cash_path` margin), `classifyCashDip(input: CashDipInput { lowestWith, lowestWithout, reserve, cashAfter, cashOnHand })` (04-17; `cashOnHand` is the cash before the purchase).
- **Settled by the user (D-59, 2026-10-15):** the daily spread of undated spending and debt minimums (`spreadUndatedSpending`, the replan's default 1) is accepted; the `cash_dip` measure is D-59's (above). Nothing here needs confirmation any more.
- Warning cap: up to six warnings; `WARNING_ORDER` = `month`, `cash`, `cash_dip`, `dsr`, `owe`, `inv`.

### Changes coming up and the worst month (D-45; 05 D-27)

- Snapshot input: `DecideSnapshot.futureChanges: FutureChange[] { id, kind: 'income' | 'spending', monthlyAmount (signed), startMonth: 'YYYY-MM', endMonth: 'YYYY-MM' | null, currency }`.
- Output: `Decision.worstMonth: WorstMonthReport { month, offset (1..12), leftAfter, leftAfterNow, shortfall, differsFromNow }` ("Fits now; from {month} the month is {shortfall} short" when `differsFromNow` and `shortfall > 0`); the verdict's month ledger already uses that month (`verdict.context.monthIncome`, `mySpendingBasis`, `leftBefore`). Helper: `worstFutureMonth(input)`, `monthAfter`, `changeActiveIn` (04-15).

### Pay smoothing (D-60; 05 D-25, D-28)

- Confirmed weekly and fortnightly pay series (`DecideSnapshot.incomeSeries`, the same input as the cash path) are smoothed in the income averages and steadiness: in each averaged month the series spans in full, their paid income lines are replaced by the monthly equivalent of the latest amount (× 52/12 or × 26/12, D-26). A month the series only partly spans (its first payday came after the month's first regular payday, or it ends inside the month: `anchorDate`, `endDate`, `occurrenceCount`) keeps its logged lines, so a job starting on 23 January with one payday that month shows January at that payday, and January stays the worst month (revised 2026-10-15, checker W2). A steady salary paid every two weeks is therefore `steady` (CV 0), with a 3-month cushion and, at 6 full months, `strong` confidence, instead of `variable` (CV ≈ 17%), 4.5 months and `fair`. Unconfirmed or monthly income is not smoothed, and a month with no paid line of the series gets nothing added. Real pay changes still show (latest amount). The Your-month figures (`money.incomeAverage`, `incomeWorst`, `incomeBest`, `incomeCvPercent`, `steadiness`) are the smoothed ones; Phase 5 needs no extra field. The builder must set `RecordLine.seriesId` on pay rows so the engine can tell which lines a series covers. Helper: `isSmoothedPayFreq(freq)` (04-05); logic in `deriveMoney` (04-13).

### Debt lines: 12× and 36% (D-04 confirmed; 05 step 3)

- The unsecured line stays at 12 × average monthly income and the debt-service line at 36%. Both are cited in `constants.ts` as FincWin behaviour lines confirmed by the user on 2026-10-15 after research (not published standards; the 36% block still cites Fannie Mae B3-6-02 as context; the 20/10 rule was considered and not adopted). Both remain editable through `limits`. The 36% line is tested against logged take-home income, which is stricter than a lender's gross-income test, deliberately. Copy that names the line ("of what you take home") is Phase 5's; the engine returns `limits.dsrLine`, `debtServiceRatioBefore/After`, `limits.unsecuredIncomeMultiple` and `context.annualIncome` only.

### Confidence (D-46; 05 D-28)

- `Assessment.confidence`, the missing `Verdict.confidence` (from the money basis whenever it resolved; `under_3_full_months` only with no full month — `ContextResult`'s failure branch carries it) and `FirstRead.confidence`: `Confidence { level: 'strong' | 'fair' | 'rough', reasons: ('first_read' | 'under_3_full_months' | 'volatile_income' | 'under_6_full_months' | 'variable_income')[] }` (strong → reasons []). Helper: `confidenceOf({ fullMonths, steadiness, firstRead })` (04-15; wired in 04-07 and 04-08).

### One-off lines (D-47; 05 D-29)

- Snapshot input: `RecordLine.oneOff: boolean` (Record's new row field).
- Output: `MoneyBasis.oneOffsExcluded { count, spending, income }` (also per month on `MonthSummary.oneOffs`), and basis code `one_offs_excluded` in `Assessment.basisCodes` when count > 0 (04-13, 04-07).

### Credit terms (D-48, D-49, D-50; 05 D-30)

- Check inputs (all optional; absent = none; never pre-filled): loan and card payments `promo?: PromoTerms { apr, months, deferredInterest }` and `variable?: boolean`; the loan's `apr` / the card record's `apr` is the rate after the promo. Instalment payment `lateFee?: MinorUnits`, `lateFeeCapTotal?: MinorUnits`.
- Plan outputs (04-06 builds paymentSteps; 04-22 adds the credit terms): `Plan.paymentSteps: PaymentStep[] { fromMonth, toMonth, amount }` on every plan (THE source for writing recurring series, promo or not; `finalMonthly` is display only); `Plan.promo: PromoOutcome | null { promoMonths, promoApr, deferredInterest, paymentDuringPromo, paymentAfterPromo (null when it clears first), clearsBeforePromoEnd, interestAfterPromo (null when a minimum never clears), deferredInterestCharged, deferredInterestCode: 'deferred_interest_charged' | null, highestMonthlyPayment, paymentToClearInPromo }` — with a promo, `Plan.monthly` = `highestMonthlyPayment` ("The month test uses the highest payment, {x}"); `Plan.lateFees: LateFeeCost | null { feePerLatePayment, capTotal, oneLate, twoLate }`. Helper: `rateScheduleFor(apr, promo)` (04-22).
- Stress (04-19): `Decision.stress: StressOutcome[] { offset (percent('2') / percent('4')), apr, monthly, mineMonthly, left, state: 'fits' | 'adjust' | 'no', monthCloses, dsrWithinLine }`, [] unless the loan or card plan is flagged variable; `stressTest(context, check)`.
- Payoff layer (04-14, `engine/payoff`): `RateSegment`, `RateSchedule`, `singleRate`, `promoMonthsOf`, `amortiseSchedule`, `simulateMinimumSchedule` (Phase 6 can reuse them).

### Investment views (D-51, D-52; 05 D-31)

- Snapshot input: `DecideSnapshot.projectionRates: Percent[]` (up to three user rates, entry order; [] = 0% only), resolved once into `context.limits.projectionRates: ProjectionRate[]` by `resolveProjectionRates` (04-05). Every projection — alternatives rows, `do_without`, investment views — is returned at each of those rates (D-51); Phase 5 chooses which to display.
- `investmentViews(context, check: BuyCheck, assessment, input: InvestmentViewsInput { horizonMonths: number | null; holdingFee: Percent | null })` → `InvestmentViews { horizonMonths, horizonSource: 'plan_term' | 'cash_default' | 'user', holdingFee: Percent, netRates: NetProjectionRate[] { rate, netRateScaled }, rates: ProjectionRate[] { rate, userEntered, label: 'projection_at_entered_rate' | 'held_not_grown' } (= context.limits.projectionRates), priceInvested { lump, byRate: RateFigure[] }, paymentsInvested { firstMonthPayment, paymentMonths, monthlyRunning, byRate }, pauseImpact { pausedMonthly, byRate } | null, netWorth: NetWorthPath[] { rate, withoutPurchase: MinorUnits[], withPurchase: MinorUnits[] } }` with `RateFigure { rate, contributed, projected, growth }` (04-21). Pass `verdict.context` and `verdict`. Snapshot input: `DecideSnapshot.investmentBalance`. The net-worth path starts from `context.cashAfterBills`. Payoff helpers: `futureValuePath(monthly, apr, months, seed, holdingFee)` and `futureValueNet(monthly, apr, months, seed, holdingFee)` (D-63; pass `ZERO_PERCENT` for no fee).
- The alternatives' "Kept" column and `do_without` carry `byRate` for every rate in the same list (D-51). Their single `projected` field stays at `snapshot.projectionReturn` for prototype parity; the builder may set it to the first entered rate, but Phase 5 does not need it, because the engine returns all rates.

### Income impact (D-53, D-54; 05 D-32)

- Check input: `BuyCheck.incomeChange?: PurchaseIncomeChange { monthlyAmount (signed, non-zero), startDate, likelihood: 'likely' | 'uncertain' }`. A negative change is in the verdict (as a D-45 change); a positive one never is.
- Output: `Decision.withExpectedIncome: ExpectedIncomeOutcome | null { monthlyAmount, likelihood, startMonth, assessment (state, left, context.monthIncome), payback: PaybackResult { months: number | null, totalCost, extraIncome, horizonMonths } }`. Helper: `paybackMonths(input)` (04-19).
- Setbacks with the new plan (04-21): `incomeAtRisk(context, assessment, setbacks: readonly SetbackInput[])` — the same type and list `applySetbacks` takes (D-62), so pass one setbacks list to both; (cash from `context.cashAfterBills` without the purchase and `assessment.cashAfterBillsAndPurchase` with it) → `IncomeAtRiskReport { runwayWith, runwayWithout, runwayLost, setbacks: SetbackAtRisk[] { code, enabled, cashAfterWith, cashAfterWithout, paymentsMet ("New payments still met"), breaksBecauseOfPurchase, runwayWith, runwayWithout, runwayLost } }`. Helpers on setbacks.ts (04-10): `setbackHitFor(setback, basis: SetbackBasis)`, `runwayMonthsOf(cash, burn)`.

### Running-cost prompts and estimate bias (D-55, D-56; 05 D-33, D-36)

- `RUNNING_COST_PROMPTS` / `runningCostPrompts(itemType)` → `RunningCostCategory[]` from `insurance`, `fuel`, `maintenance`, `registration`, `loss_of_value` (vehicle: all five; general: insurance, maintenance, loss_of_value; rent_bill, loan_repayment, tax, insurance_premium: none); `isNonCashCategory(category)` (04-16). A `CostLine` carries `category?`; `netRunningCosts` returns `RunningCosts.nonCash` (counted loss of value) and keeps it out of `net` (04-06).
- `estimateBias(decisions: PastDecision[], currency)` (D-62: `currency` is the check's home currency; convert each past decision's estimates and actuals into it first, 05 D-37/D-39 — a decision in any other currency is a RangeError) → three `EstimateBias { figure: 'day_one' | 'monthly_payment' | 'running_costs', decisionsUsed, biasBasisPoints: number | null }` (signed; + means actuals came in higher; null below 3 usable decisions) (04-16). Input `PastDecision { id, currency, estimate: { dayOne, monthlyPayment, runningCosts }, actual: { dayOne | null, monthlyPayment | null, runningCosts | null } }`.

### Not engine work (Phase 5 or Record)

- Storing future changes, the one-off row field and its Record UI, the combined toggle per check, stored decisions with actuals, the savings goal row (05 D-34), cooling-off (05 D-35) and currency conversion (05 D-37) are Phase 5 / Record. The engine only consumes the resulting snapshot and check fields listed above.

## Checker revision (2026-10-15, iteration 1) — new public API names

Added after the plan checker's first pass. All are codes and numbers (D-21).

| Name | Kind | Where | Why |
|---|---|---|---|
| `AssessContext.cashAfterBills` | field | 04-05 / 04-07 | Cash after my share of D-24 bills due within 90 days and every scheduled outflow within 90 days (D-61), always (with or without a cash path). Feeds every spare-money figure (not the D-38 Cash row) |
| `AssessContext.ledgerCash` | field | 04-05 / 04-07 / 04-18 | D-38 + D-61: cash on hand − my share of D-24 bills due within 90 days − scheduled outflows dated on or before asOf, with or without a cash path. The D-38 Cash row's Now. Lowered by stacked checks' day-one costs (D-41). Equals `cashAvailable` when there is no cash path |
| `Assessment.ledgerCashAfterPurchase` | field | 04-05 / 04-07 | `ledgerCash − mineDayOne`. The D-38 Cash row's After. Equals `cashAfter` when there is no cash path |
| `Assessment.cashAfterBillsAndPurchase` | field | 04-05 / 04-07 | `cashAfterBills − mineDayOne`. Setbacks, the D-39 runway and income at risk start from it. Equals `cashAfter` when there is no cash path and no scheduled outflow is dated after asOf within 90 days |
| `AssessContext.leftThisMonth` | field | 04-05 / 04-07 / 04-18 | This month's left over for the combined position. D-36 `size` reads it, never the D-45 worst month |
| `DecideSnapshot.projectionRates` | input | 04-05 | Up to three user rates (D-51); [] = 0% only |
| `ResolvedLimits.projectionRates`, `resolveProjectionRates(rates, fn)` | field, function | 04-05 / 04-07 | The one `ProjectionRate` list (0% first, deduplicated, entry order) |
| `AlternativeRow.byRate`, `Alternatives.rates`, `do_without.byRate` | fields | 04-09 / 04-10 | Every projection at 0% and each user rate (D-51) |
| `InvestmentViewsInput { horizonMonths, holdingFee }` | changed input | 04-21 | `rates` removed: the views read `context.limits.projectionRates`; `holdingFee` added by D-63 (see below) |
| `CashDipInput { lowestWith, lowestWithout, reserve, cashAfter, cashOnHand }`, `dipShortfall(input)`, `cashPathMargin(input)`, `spreadUndatedSpending(spreadMonthly, day)` | type, functions | 04-05 / 04-17 / 04-20 | The spread (default 1) is accepted and the dip measure is D-59's (revised 2026-10-15); `cashOnHand` (the positioned `context.cashAvailable`, not the raw snapshot figure) lets the measure subtract only the purchase-caused part of the cash card (W1, and correct under D-41 stacking); `cashPathMargin` is the `cash_path` margin on the same measure (W3); `classifyCashDip(input)` takes the object |
| `CashTightFact`, `cashTightFact(lowestWithout, reserve)`, `CashPathReport.tightBeforePayday`, `BasisFact` = `DebtRateFact \| CashTightFact` | type, function, field | 04-05 / 04-17 / 04-07 | D-59 (added 2026-10-15): a dip that exists without the purchase is the `cash_tight_before_payday` fact; `cashPathReport` now takes the reserve |
| `MoneyInput.incomeSeries`, `isSmoothedPayFreq(freq)` | input, function | 04-05 / 04-13 / 04-07 | D-60 (added 2026-10-15): confirmed weekly/fortnightly pay smoothed in the income averages and the CV, in months the series spans in full (W2) |
| `ContextResult` failure `confidence` | field | 04-05 / 04-07 | The missing verdict's confidence comes from the money basis whenever it resolved |
| `rateScheduleFor` | function | 04-22 (moved from 04-06) | D-48 credit terms now live in their own plan |

## D-61 and D-62 (user, 2026-10-15, from the Phase 5 planning gaps) — new input and contract clarifications

### D-61: `scheduledOutflows` (new snapshot input)

- **Input:** `DecideSnapshot.scheduledOutflows: readonly ScheduledOutflow[]` with `ScheduledOutflow { id: string; date: 'YYYY-MM-DD'; amount: MinorUnits; currency: CurrencyCode }`. Dated pending one-off outflows, for example the pending expense Go ahead writes. `amount` is positive and is **my share, already resolved by the snapshot builder**: the engine applies no split to it (unlike bills). `currency` must be the check's home currency (`assertCurrency`, as for every other input). `[]` = none. The builder must not also pass the same item as a `RecurringBill`, a `StackedCheckInput` or a `DebtRecord`, or it is counted twice.
- **Semantics (04-05 `scheduledOutflowsDue`, 04-07, 04-17):**
  - Cash path (D-44): each outflow is placed on its date in both paths, with and without the purchase. Dated on or before `asOf` → day 0. Dated after `asOf + 90` days → outside the path, ignored. So an outflow dated after payday never lowers the pre-payday low.
  - Cash ledger (D-61 read literally: "they still reduce `cashOnHand` for the cash ledger only if they're dated on or before `asOf`"): outflows dated on or before `asOf` reduce `context.cashAvailable` (the `cash` check) and `context.ledgerCash` (the D-38 Cash row), with or without a path. Future-dated outflows within 90 days reduce neither, with or without a path: with a path they reach the verdict only through `cash_dip` (D-59); without a path (`cash_path_unavailable`) a future-dated pending outflow is not in the `cash` check at all, and it still reduces the spare-money figures below.
  - Spare money: `context.cashAfterBills` (and so `Assessment.cashAfterBillsAndPurchase`, alternatives, save first, wait, setbacks, the D-39 runway, income at risk and the net-worth start) deducts every outflow dated on or before `asOf + 90` days: a known commitment is never spare. D-38 copy: Cash Now is the cash left after bills due within 90 days and pending outflows already due (dated on or before today); a pending outflow dated later is not in the row.
  - D-36 `size`'s `from_savings` follows `cashAvailable`, so it follows the same rule.
- **New output fields:** `AssessContext.outflowsDueNow` (Σ dated on or before `asOf`), `AssessContext.outflowsDueAhead` (Σ dated after `asOf`, within 90 days; read only by `cashAfterBills`), `AssessContext.ledgerCash` and `Assessment.ledgerCashAfterPurchase` (the D-38 Cash row). The verdict carries the context fields through `verdict.context`.
- **New helper:** `scheduledOutflowsDue(outflows, asOf, horizonDays): ScheduledOutflowsDue { dueNow, dueAhead, dated: DatedAmount[] }` (series.ts, exported from the barrel). It raises RangeError on a non-positive or non-integer amount or an invalid date (`scheduledOutflowsDue: …`). It does not check currency: an outflow in another currency is rejected by its callers, `prepareContext` and `cashPathForSnapshot` (`prepareContext: mixed currencies` / `cashPathForSnapshot: mixed currencies`, whichever runs first).
- **Changed signatures:** none. `cashPathForSnapshot` and `prepareContext` read the new field from the snapshot they already take.
- **Worked figures (04-07's PB, buyCash(1_300_000)):** a 50_000 outflow dated asOf + 20 days → `cashAvailable` 2_000_000, `cashAfter` 700_000, `cashAfterBills` 1_950_000, `cash_dip` 102_192 (as without it); the same outflow dated 3 days before asOf → `cashAvailable` 1_950_000, `cashAfter` 650_000, `cash_dip` 152_192. The D-38 Cash row: { 2_000_000 → 700_000 } with the outflow dated after asOf (`cashAfterBillsAndPurchase` 650_000), { 1_950_000 → 650_000 } with it dated before. Without a path (04-07's BL), buyCash(1_380_000) with the outflow dated after asOf → `cashAvailable` 2_000_000, `cashAfter` 620_000, `fits` (as without it), `cashAfterBillsAndPurchase` 570_000.

### D-62: contract clarifications (no behaviour change)

| Item | Contract | Plan |
|---|---|---|
| `estimateBias(decisions, currency)` | `currency` is the check's home currency; Phase 5 converts every estimate and actual into it first (05 D-37/D-39). A past decision in another currency → RangeError `estimateBias: mixed currencies` | 04-16 (docblock, truth, test), 04-05 (`PastDecision` comment) |
| `Assessment.newMonthly` | `newMonthly = mineMonthly + mineRunning` exactly (my share of `plan.monthly` plus my share of the signed net running costs; `mineRunning` is 0 on invest checks) | 04-05 (type comment), 04-07 (invariant test) |
| `incomeAtRisk(context, assessment, setbacks)` | `setbacks: readonly SetbackInput[]`, the same type and list as `applySetbacks(assessment, setbacks)` (04-10). Results come back in input order with `enabled` echoed; `cashAfterWith` and `runwayWith` equal `applySetbacks`' `results[i].cashAfter` and `runwayMonths` | 04-21 |
| `StackedCheckInput.check` | `PurchaseCheck = BuyCheck \| InvestCheck`. An `InvestCheck` is valid: a monthly one joins investing and the pausable amount (D-32), a lump one leaves cash on day one | 04-05 (comment), 04-18 (tests) |
| Barrel types | `engine/decide` re-exports `CurrencyCode` and `MinorUnits` (types, from `engine/money`) | 04-12 |

### 05 D-40 (card minimum terms pre-filled from the per-market table): no engine change

`MARKET_DEFAULTS` (04-05 `marketDefaults.ts`, exported from the barrel through `export * from './marketDefaults'`) carries, per market row (`US`, `CA`, `CA-QC`, `UK`), `minimumPercent`, `interestAdded` and `floor` (plus `currency` and `dealerCap`). `minimumTermsFromDefaults(row)` returns the `CardMinimumTerms { minimumPercent, interestAdded, floor }` to pre-fill on a card, or null when any of the three is unsourced (CA-QC today), which is Phase 5's "Minimum payment not set" case. The builder converts the floor into the check's currency (D-16) and can compute the month's minimum for `DebtRecord.minimumPayment` with `simulateMinimum(balance, apr, terms).firstPayment` from `engine/payoff`. The engine has no "minimum not set" code: `DebtRecord.minimumPayment` is required, so the note that card payments aren't counted until the minimum is set is Phase 5 copy driven by its own debt record.

## D-63 (user, 2026-10-15): loss of value, holding fees and card costs are user-entered — final names

Consumer: 05 D-44 (step 2's "Loss of value" prompt takes an amount or %/year, shown as "not a monthly cash cost"; the investing views take an optional holding fee %/year; the card-costs tile sums the user's card terms). Nothing below has a default; an absent input means "none".

| Name | Kind | Plan | Contract |
|---|---|---|---|
| `LossOfValueInput` = `{ kind: 'amount'; monthly: MinorUnits }` \| `{ kind: 'percent_per_year'; percentPerYear: Percent }` | type | 04-05 | The step-2 entry. `amount` is **per month** (the unit of every `CostLine`); `percent_per_year` is a share per year of the advertised price (`PriceInputs.advertised`: the item's value before tax, fees and trade-ins, not `ResolvedPrice.price`), 0..100% |
| `lossOfValueMonthly(input, advertisedPrice): MinorUnits` | function (`checkInputs.ts`, decide barrel) | 04-06 | `amount` → as typed; `percent_per_year` → `advertisedPrice × percent ÷ 12`, one half-up rounding (1_450_000 at 15% → 18_125; at 10% → 12_083 even when trade-ins bring the final price to 1_385_000). Phase 5 passes the advertised price, never the resolved final price. Phase 5 puts the result in a `CostLine { category: 'loss_of_value', counted: true }` |
| `RunningCosts.nonCash` | field (existing) | 04-06 | The loss-of-value figure to show as "not a monthly cash cost". It is never in `net`, so never in `BuyCheck.runningCostsNet`, the month test, the month table, the cash path, the ledgers or the investment views (D-55). `BuyCheck` has no loss-of-value field |
| card payment `cardFees?: MinorUnits` | input | 04-05 / 04-06 | One-off card fees the user typed that are charged for this purchase, e.g. a transaction or balance-transfer fee (household amount). A recurring card fee is out of scope: Phase 5 must not pass a card's yearly fee here. Paid on day one: added to `plan.dayOne` and `plan.total`, never to `plan.interest` |
| `CardPlanDetail.fees`, `CardPlanDetail.cardCosts: MinorUnits \| null` | fields | 04-05 / 04-06 / 04-22 | `fees` echoes `cardFees` (0 when absent). `cardCosts = plan.interest + fees` (APR interest over the plan, promo and deferred interest included); `null` exactly when the minimum never clears ("Endless"). Equals `plan.total − plan.price` whenever both are non-null |
| `InvestmentViewsInput.holdingFee: Percent \| null` | input | 04-05 / 04-21 | Optional holding fee per year, 0..100%; `null` = no fee |
| `InvestmentViews.holdingFee: Percent`, `InvestmentViews.netRates: NetProjectionRate[]`, `NetProjectionRate { rate, netRateScaled }` | fields, type | 04-05 / 04-21 | `holdingFee` echoes the input (`ZERO_PERCENT` when null). `netRateScaled = rate − fee` at `PERCENT_SCALE`, signed. Every `RateFigure` in the four views keeps `rate` = the entered rate (so it lines up with `rates` and their labels) and is projected at its net rate; `growth` can be negative |
| `futureValueNet(monthly, apr, months, seed, holdingFee)`, `futureValuePath(monthly, apr, months, seed, holdingFee)` | functions (payoff barrel) | 04-21 | Future value at `apr − holdingFee`, allowed below 0; `holdingFee` `ZERO_PERCENT` gives exactly `futureValue` |

Interpretations (recorded in 04-REPLAN-NOTES "D-63 / DEC-17..37"):
- **Net rate may go below 0.** "Reduces the D-52 projections" read literally: the 0% line with a 1% fee shrinks (100_000 over 12 months → 99_005). Flooring at 0 would leave the 0% line untouched by a fee the user pays.
- **Fee scope: the D-52 views only** — (a), (b), (c) and the investments term of (d) on both paths. The alternatives' and `do_without`'s `byRate` (D-51) model money kept as cash or savings, so no holding fee applies; Phase 5 should not label those rows "net of fees".
- **Card fees are one-off fees for this purchase** (a transaction or balance-transfer fee). Recurring card fees are out of scope; Phase 5 must not pass a card's yearly fee as `cardFees`.
- **Loss of value %/year is of the advertised price**, the item's value before tax, fees and trade-ins (a trade-in or a doc fee does not change what the item is worth).
- **Card fees are day-one cash**, like a D-37 on-the-day fee. The engine does not assume the issuer adds them to the card balance (that would invent an issuer rule). If Phase 5 also offers a step-2 "Fees" adjustment, it must not ask for the same fee twice.
- **05-14's "Card costs" tile** (planned as `plan.total − plan.price`, "no separate engine figure") should read `plan.card.cardCosts`. The two are equal whenever both are non-null, so 05-14's arithmetic stays correct, but the engine figure is now the source. Phase 5 files are not edited from Phase 4.
