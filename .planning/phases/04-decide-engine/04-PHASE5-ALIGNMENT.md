# Phase 04 ↔ Phase 5 Alignment (2026-10-15)

Phase 5 (decide-ui) is being planned in parallel against `05-CONTEXT.md` (D-01…D-23) and `05-UI-SPEC.md`. This document checks every figure and code those screens render against what the Phase 4 plans produce through the public barrel (04-12). It records each gap and the plan change that closes it.

**Rules kept:**
- Engine purity: no React, I/O, db, state, services or UI.
- Integer minor units throughout.
- Codes and numbers only, never strings (D-21).
- 100% branch coverage on `engine/decide` and `engine/payoff`.
- No invented rates or amounts (D-05, D-07).

**Waves and plan count:** unchanged. There are still 13 plans in 6 waves, so ROADMAP and STATE did not need to change.

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
| 18 | Warning codes and shortfalls, at most five, ordered | `Assessment.warnings` (`month`/`cash`/`dsr`/`owe`/`inv`) | covered |
| 19 | The pause case: "closes only if $x a month of investing / saving / both pauses" | The `inv` warning (shortfall = `pauseNeeded`), `investingAtRisk`, `savingAtRisk`, `investingAfter`, `savingAfter` | covered |
| 20 | Title "already {x} short. This makes it {y}" | `context.leftBefore < 0`, `left` | covered |
| 21 | The dsr value "{pct}" and the line "Debt payments would reach {pct} of money in" | Missing: only money (`debtServiceAfter`) was returned | **fixed**: `debtServiceRatioBefore/After` (Percent, null when income is 0) (04-07) |
| 22 | The owe description: "{annual} of annual income … {mult} times average monthly income" | Missing | **fixed**: `context.annualIncome`, `limits.unsecuredIncomeMultiple` (04-07) |
| 23 | Card reason cards | `PlanReason`, `plan.card.*` | covered |
| 24 | Neutral fact `debt_rate_exceeds_return` | `Assessment.facts` (D-31) | covered |
| 25 | Basis marker "Average / Worst month · {in}" | `context.money.basis`, `money.incomeBasis` | covered |
| 26 | **The month line by line (Now/After)**: money in, living, debt payments, saving and investing, running costs or this contribution, left | Partial. The figures existed but no table did, and under D-35 the prototype's rows do not add up | **fixed** by D-38: `Assessment.monthTable { now, after }`, pre-pause, rows sum exactly (04-07 Task 4; named test 04-11) |
| 27 | **The five ledgers** (Income, Expenses, Debt, Cash, Investments) with a direction dot | Missing. The total debt balance was not in the context at all | **fixed** by D-38: `Assessment.ledgers` (code, now, after, `better`/`worse`/`same`), `context.debtBalance`, `debtBalanceAfter` |
| 28 | Against your lines: cash cushion, month closes, debt service, **unsecured debt**, investing floor, saving floor | Ambiguous. `LimitChecks` had no `owe`, and the ratios were missing | **fixed**: `checks.owe`, plus the values from #21/#22 and `unsecuredAfter` vs `limits.unsecuredLine` |
| 29 | "If something goes wrong": runway plus setbacks | Setbacks covered (`applySetbacks`, `DEFAULT_SETBACKS`); runway missing | **fixed** by D-39: `SetbackReport.runwayMonths` (04-10) |
| 30 | Options list with action payloads | `buildOptions` → `affordable_price.price` (bisected, exact), `longer_term.termMonths/monthlyPayment/leftChange/monthCloses/extraInterest`, `cut_line.lineId/cut/gap/closesGap`, `earn_more.gap/percentOfIncome`, `save_first.need/months`, `do_without.keptMonthly/horizonMonths/projected` | covered. `affordable_price.price` is the **final** price; "Use this price" sets advertised = price − `adjustmentsNet` (the prototype's rule) |
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
| 38 | "Kept" at 0%, with an optional user rate shown as "Kept, at x%" | `DecideSnapshot.projectionReturn` (null = 0%, D-06), echoed as `Alternatives.projectionReturn` | named differently: the per-check "+ Add a rate" value goes into `snapshot.projectionReturn` |
| 39 | The "Spend less" card and the trade line: not spent, "{x} less on the day, then {y} a month", "lowers the payment from {a} to {b}, but the month still only leaves {left}" | Missing | **fixed**: `Alternatives.cheaper` (`notSpent`, `dayDiff`, `monthlyDiff`, `keptOnDay`, `keptMonthly`, `leftAfter`, `monthlyPayment`, `ratioPercent`) (04-10) |
| 40 | Wait row "Buy at month {n}, then keep the {pay} a month" | `monthsToBuy`, `rows[2].monthly` | covered |

### Step 5: the decision (05 D-09…D-12)

| # | Phase 5 need | Phase 4 source | Status |
|---|---|---|---|
| 41 | Plan card: On the day / A month / Left after | `mineDayOne`, `newMonthly`, `left` | covered |
| 42 | Go ahead, loan: the debt and a recurring payment series | `plan.financed`, the check's `apr`/`termMonths`, `plan.monthly`, `plan.months`; the last payment was missing | **fixed**: `Plan.finalMonthly`, so the series is `monthly × (months − 1) + finalMonthly`, exactly the total (D-20) |
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
  - Money: `mineDayOne`, `mineMonthly`, `mineRunning`, `newMonthly`, `left`, `cashAfter`.
  - Pause: `pauseNeeded`, `investingAtRisk`, `investingAfter`, `savingAtRisk`, `savingAfter`.
  - Debt: `debtServiceAfter`, `debtServiceRatioBefore`, `debtServiceRatioAfter`, `unsecuredAfter`, `debtBalanceAfter`.
  - Screens: `checks` (`cash`, `month`, `dsr`, `owe`, `inv`, `save`), `monthTable` (`now`/`after`: `income`, `living`, `debtPayments`, `savingInvesting`, `thisPurchase`, `outgoings`, `left`), `ledgers` (`code`, `now`, `after`, `direction`), `burn`, `context`.
- **Context fields:** `context.limits` (`reserve`, `dsrLine`, `unsecuredLine`, `unsecuredIncomeMultiple`, `investingFloor`, `savingFloor`, `projectionReturn`), `context.money` (`incomeBasis`, `incomeAverage`, `incomeWorst`, `incomeBest`, `spendingBasis`, `steadiness`, `incomeCvPercent`, `basis`, `fullMonthsUsed`), `context.leftBefore`, `cashAvailable`, `billsDue`, `debtBalance`, `annualIncome`, `debtPayments`, `pausable`.
- **Plan fields:** `dayOne`, `monthly`, `months`, `financed`, `total`, `interest`, `finalMonthly`, `impliedAnnualRate`, `card` (`onCard`, `remainderOnDay`, `payoffMonths`, `minimumOutcome`). Per-method cards: `resolvePlan(check)`.
- **Options:** `buildOptions(context, check, assessment)` → codes `affordable_price`, `longer_term`, `cut_line`, `earn_more`, `save_first`, `do_without`. Separately, `affordablePrice(context, check)`.
- **Alternatives:** `buildAlternatives(context, check, assessment, cheaperRatioPercent)` → `rows` (`as_planned`, `cheaper`, `wait_and_save`, `skip`), `cheaper` (`CheaperDetail`), `spareCash`, `spareMonthly`, `monthsToBuy`, `waitMonths`, `horizonMonths`, `projectionReturn`. The suppression codes are `month_short`, `too_thin`, `nothing_freed`, `past_horizon` and `nothing_spare`.
- **Setbacks:** `applySetbacks(assessment, setbacks)` → `results`, `combinedHit`, `stressedCash`, `stressedOutcome` (`absorbed`, `through_cushion` or `wiped_out`), `runwayMonths`. Defaults: `DEFAULT_SETBACKS`.
- **Wait (D-40):** `buildWaitPlan(context, check, monthlyAmount | null)` → `WaitPlan { target, monthlyAmount, spareMonthly, withinSpare, months, readyBy }`.
- **First read:** `firstRead(figures: RoughFigures, check)` → `FirstRead` (`state`, `size`, `plan`, `dayOne`, `monthly`, `cashAfter`, `leftAfter`, `roughCushion`, `warnings`, `basisMarker`).
- **Household:** `memberParts(total, share)`, `myPart(total, share)`, `resolveShare(scope)`.
- **Pre-fill only:** `suggestItemType(name)`, `suggestSecured(name)`. **Builder data:** `MARKET_DEFAULTS`, `minimumTermsFromDefaults`.

## Still open (for the user or for Phase 5)

Items 1–4 are recorded in 04-CONTEXT as D-37…D-40 with status "proposed, pending the user's confirmation before execution". The plans implement them as written.

1. **D-38: the month table is pre-pause** (rows add up; the pause shows beside the table). The alternative is the prototype's display, which lowers the saving row while showing the pre-pause left. Confirm.
2. **D-39: runway** counts whole months from cash *after* the purchase. The prototype used cash before it, to one decimal. Confirm, or ask for tenths.
3. **D-40: wait target** = what spare cash above the cushion does not cover, consistent with the alternatives' wait row. The prototype used max(day-one cost, …), so a cash purchase waited for the whole price. Confirm.
4. **D-37: a trade-in larger than the price** floors the price at 0 rather than raising an error. Confirm.
5. **`snapshot.asOf` is the day the check is evaluated (today), not "When you need it".** The D-24 90-day window and the wait ready-by date run from it. Phase 5's snapshot builder must set it that way. If the user wants the window to follow the need-by date, that is a new decision.
6. 04-REPLAN-NOTES interpretation 10 still stands: `Verdict.size` is null only when the context cannot be resolved (no full month), and Phase 5 uses `firstRead` there.
7. The prototype's card-question warning cards and the "Your income does not support this" card were dropped by 05-UI-SPEC. The engine adds nothing for them.
