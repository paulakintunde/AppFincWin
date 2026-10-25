# FincWin Decide: Personal-Finance and Behavioural Audit

Auditor stance: CFP-level coach who has worked with budgeting apps. Branch `phase/05-decide-ui`, worktree `C:\dev\fincwin-p5`, audit date 2026-10-24.
Scope: the "Can I afford it?" feature (engine in `src/engine/decide/`, snapshot in `src/features/decide/snapshot/`, UI in `src/features/decide/`, copy in `src/i18n/locales/en.ts` and `src/features/decide/copy/`).
Method: I read the decision record (05-CONTEXT D-01..D-107), the engine and snapshot code, the copy, about 20 Pixel 9 screenshots, and published research. Nothing in the repo was edited. Source status is flagged in section 8: "fetched" means a search result I read, "from memory" means a well-known paper I did not re-open.

Test-data caveat: the test account has a $150M month, 22 unsynced changes and duplicate checks. I judge design, not the numbers. Where the odd data exposes a real design weakness (outlier sensitivity), I say so.

Screenshots live in `.planning/Decision Research/screenshots/` (names only below).

---

## 1. Executive summary

**Overall verdict.** Decide is unusually serious for a consumer app. It is declarative, integer-exact and honest about what it does not know. The design (own-data verdicts, named lines, suppressed false savings, confidence labels, setbacks, estimate-bias learning) is ahead of YNAB, Monarch, Copilot and PocketGuard, which do not answer "can I afford this specific thing". The risk is not the arithmetic, which is clean. The risk sits in three places:

1. **The default basis became "This month (expected)" (D-106/D-107), and that basis is optimistic by construction.** It counts spending already logged plus confirmed bills still due. It never projects the ordinary spending the user has not yet done this month. Early and mid-month, the headline figure, the verdicts and the 90-day cash path are all inflated. That is the planning fallacy built into the default, in the one place where a wrong answer does real harm.
2. **The cautious basis is too extreme to be useful, and the bases flip verdicts without explanation.** "Worst month" pairs the lowest-income month with the highest-spending month from a 6-month window. One odd month swings every verdict. Users will see "It fits" on one surface and "$5,876 overspent" on another.
3. **Several verdict messages contradict themselves** ("Not from cash" chip, "Cash covers it" body, "Out of savings" label; "Cushion Over 50 years / A month None").

**Top 5 strengths**
1. Verdicts come from the user's own logged months, with a stated basis and a confidence level (rough, fair, strong).
2. "Lines you will not cross" makes the user's own rules explicit. Fits means "clears every line", not "approved". Compliance-safe and behaviourally strong.
3. The alternatives table suppresses rows where the freed money is not genuinely spare (`alternatives.ts`). The app never implies savings that do not exist. Rare and ethically important.
4. Honesty about uncertainty: confidence tiers, a "rough basis" chip, no invented rates (D-06/D-07), a cushion scaled by income steadiness (3, 4.5, 6 months), setbacks and a 12-month forward look (D-45).
5. Evidence-informed behavioural scaffolding: wait-and-save with a ready-by date, cooling-off, estimate-vs-actual learning (`estimateBias.ts`, a planning-fallacy countermeasure), total cost of ownership, pots (sinking funds).

**Top 10 problems, ranked by harm to a real user's finances or trust**
1. Critical. "This month (expected)" omits unlogged discretionary spending, and the cash path inherits the understatement (4.1).
2. High. "Worst month" is the lowest income and highest spending taken independently from 6 samples. Unrealistic, outlier-sensitive, can hit income 0 (4.2).
3. High. The "Average" basis uses the mean, so one windfall inflates it. The one-off exclusion only works if the user flags the line (4.3).
4. High. A pre-existing overspend turns every purchase, even $5, into the same red "Doesn't fit right now". True, but it hides whether this purchase matters (4.4).
5. High. Contradictory or garbled verdict text (4.5).
6. High. Cushion breach severity is not graded: breaching by 1% and spending 99% of the fund both read "Needs adjustment" (4.6).
7. Medium-high. "Cash" is every cash-like account. No emergency-fund designation; pots protect only what the user marks as saved (4.7).
8. Medium. 28/36/12 are mortgage-underwriting thresholds applied to take-home pay and to every purchase, presented as "Lines you will not cross" though the user never chose them (4.8).
9. Medium. Saving and investing are treated as pausable slack, so a purchase that fits only by pausing a pension is amber, not red (4.9).
10. Medium. Unsynced-changes banner while verdicts show; no freshness statement on the verdict (4.10). Also missing high-APR debt context on buy checks (5.3).

**Top 10 recommended changes** (section 7)
1. Project discretionary spending in the "This month" basis and in the cash path.
2. Replace min-income/max-spending "worst" with a defined realistic stress (for example P20 income, P80 spending).
3. Use the median or a trimmed mean for "Average"; prompt on outlier months.
4. Split the verdict into "your month already" and "this purchase".
5. One tested state-to-copy table so text cannot contradict.
6. Grade cushion breaches and show months of cover after the purchase.
7. Let users mark which accounts are the cushion.
8. Let users set lines during setup; label defaults "suggested".
9. Add a debt-aware arithmetic row on buy checks.
10. Show typical and rough month together by default and move the three-basis card higher.

---

## 2. How Decide works today

### 2.1 Money basis (`money.ts`, `expectedMonth.ts`)
- Window: the last 6 full months (`AVERAGING_WINDOW_MONTHS = 6`). Only `paid` lines count; transfers are excluded; refunds net against spending (floored at 0 per month); lines the user marks one-off are excluded and counted.
- Smoothing: confirmed non-monthly bills and weekly or fortnightly pay are replaced by their monthly equivalent in every window month.
- Per month: income and my share of spending. Then `incomeAverage` and `spendingAverage` are **means**; `incomeWorst` is the **minimum** monthly income; `spendingWorst` is the **maximum** monthly spending (independent months).
- Steadiness: coefficient of variation of income: under 6% steady, under 22% variable, else volatile. Under 3 full months: "insufficient". Zero income: volatile.
- Basis = `basisOverride ?? (steady ? average : worst)`.
- **'month' basis (D-107, now the default for the card and checks):** income = this month's logged lines (paid and pending, plus one-off income) plus confirmed income series still due before month end. Spending = this month's logged lines (paid and pending, plus one-offs) plus confirmed bills still due. No projection of unlogged variable spending.

### 2.2 The headline: Net Free Cash Flow (`assess.ts`, `leftBefore`)
```
leftBefore = incomeBasis - spendingBasis - sum(debt minimum payments)
             - (monthlySaving + monthlyInvesting) - pots set-aside
```
Positive reads "{amount} free", negative "{amount} overspent" (D-106).

### 2.3 Context figures
- `monthCosts = spendingAverage + debt payments` (always the average, whatever the basis).
- Cushion (reserve) = `monthCosts x halfMonths / 2`. Steady 3, variable 4.5, volatile 6, insufficient 3 months. A user-typed reserve overrides.
- `cashOnHand` = every cash-like account balance (converted), minus money saved in pots. Confirmed non-monthly bills due within 90 days and "due now" scheduled outflows come off.
- Debt: sum of minimum payments. `unsecuredLine = incomeAverage x 12`.
- Housing monthly = average Housing-category spending plus minimums of loans marked housing.

### 2.4 Verdict (`assessPlan`)
```
newMonthly = mineMonthly + mineRunning
left       = leftBefore - newMonthly
cashAfter  = cashAvailable - mineDayOne
dsr breach     debtPayments + mineMonthly  >  36% x incomeBasis
housing breach property checks only: housingBefore + newMonthly > 28% x incomeBasis
owe breach     unsecured debt + financed  >  12 x average monthly income
shortfall      = max(0, -left)
pause          investing first, then saving, up to shortfall; remainingShortfall = shortfall - pause
warnings       month, cash (cashAfter < reserve), cash_dip (90-day path), dsr, housing, owe, inv (pause)
state          'no' if cashAfter < 0 or remainingShortfall > 0 or hard cash dip
               'adjust' if any other warning
               'fits' if none
```
Confidence: rough for a first read, under 3 months or volatile income; strong only for 6+ months and steady income; otherwise fair.

### 2.5 Everything around the verdict
- Combined position (D-41): other open checks stacked first, then the worst of the next 12 months with scheduled changes (D-45).
- On the edge (D-43): within 5% of a line's base.
- Cash path: 90 days, confirmed pay and bills dated, undated spending spread evenly at `spendingBasis - series`. A hard dip below zero forces `no`; a soft dip below the cushion forces `adjust`.
- Options (`options.ts`): affordable price (bisection), longer term (+24 months), cut a line 20% (two biggest cuttable lines), earn more, save first, do without.
- Alternatives (`alternatives.ts`): as planned, cheaper (default 65% of price), wait and save, skip, with suppression codes.
- Wait plan (`wait.ts`): months = (price - cash above cushion) / `leftBefore`.
- Setbacks (`setbacks.ts`) and stress (`stress.ts`): unexpected expense (default one month's costs), income drop, job loss (8 months), late invoice; variable-rate stress at +2 and +4 points only if the user flags the rate variable.
- Total cost (`ownership.ts`): price + interest and fees + running costs x years - resale. Opportunity cost only with a user-typed rate.
- Pots (`pots.ts`): monthly set-aside = remaining / whole months left, rounded up; saved portion is protected cash.
- First read (`firstRead.ts`): rough income, spending, cash; cushion 3x rough spending.
- Estimate bias (`estimateBias.ts`): after 3 decisions with actuals.

---

## 3. What works well, and why

### 3.1 Finance
- **Own-data basis.** Using the user's real volatility (CV bands) to size the cushion matches the research: JPMorgan Chase Institute finds large monthly swings are common and that buffers must be sized to simultaneous income and spending shocks [JPMCI-2]; Vanguard ties a bigger buffer to variable income [VAN-1].
- **A real cushion.** 3-6 months of expenses is the consensus range (MoneyHelper, FCAC, Vanguard) and scaling it by steadiness is a sensible refinement [MH][VAN-1].
- **Integer money, exact bigint comparisons.** Borderline verdicts ("by $120") are exactly where a rounding bug would destroy trust.
- **Smoothing of non-monthly bills and pay** removes the artefact where the month the insurance lands looks like a crisis.
- **DSR and housing lines** are recognised, citeable lending heuristics [BANKRATE][FANNIE], applied (strictly) to take-home pay.
- **Plans model real payment shapes:** card minimum that never clears, instalments, deposits, trade-in, variable-rate stress.
- **Total cost of ownership** counters monthly-payment framing.
- **Pots take predictable irregular costs out of the month**, the core of sinking-fund coaching.

### 3.2 Psychology
- **Declarative voice.** "It clears every line, with $X still spare" is a statement about the user's own rules. It lowers reactance and keeps the app clear of "advice".
- **Lines as commitment devices.** Pre-committed limits blunt present bias and in-the-moment rationalisation [THALER-SHEFRIN].
- **Alternatives (cheaper, later, skip) with real numbers** turn yes/no into a choice set, reducing regret and the sense of being judged.
- **Wait-and-save with a ready-by date** is an implementation intention and reframes "no" as "not yet", which softens loss aversion [KT-1979].
- **Estimate-vs-actual** attacks the planning fallacy with the user's own track record [BUEHLER-1994].
- **"Doesn't fit right now"** is temporal and situational, not an identity judgement.
- **Naming the pause (D-105)** stops a purchase appearing to improve the month.
- **Confidence labels** calibrate trust. People who know a figure is rough act less rashly on it.

---

## 4. What is broken, wrong, misleading or risky

### 4.1 "This month (expected)" omits unlogged spending (Critical)
- **Seen:** `src/engine/decide/expectedMonth.ts`, `expectedMonthMoney`: spending = logged lines (paid and pending, plus one-offs) + confirmed bills with occurrences still due. There is no term for variable spending still to come (groceries, fuel, dining). `prepareContext` in `assess.ts` writes that figure as `spendingBasis` for the 'month' basis. `cashPathForSnapshot` in `cashPath.ts` takes `money.spendingBasis` and spreads `spendingBasis - seriesMonthly` across the 90 days, so **the cash path is also understated under the default basis**. D-107 makes This month the default for the card and for checks.
- **Why it matters:** On the 3rd of a month with payday on the 1st, the month shows almost all income and almost no spending. A $1,800 sofa "fits". By the 28th the same check may not. That is the planning fallacy [BUEHLER-1994] and optimism bias [FLYVBJERG]: plans built from what is scheduled ignore ordinary leakage. The user sees "It fits" and acts. The cushion itself uses `spendingAverage`, so the cushion stays sound, but the month and path tests do not.
- **Fix:** In 'month', spending = max(logged-so-far + due bills, logged-so-far + due bills + pro-rated average unscheduled spending for the remaining days). Use the same figure in the cash path spread. Or keep This month for display only and judge checks on a realistic stress (4.2) with This month as a "right now" line. The three-basis comparison card (D-107) mitigates this, but only after the user scrolls Step 3.

### 4.2 "Worst month" is an unrealistic, noisy stress (High)
- **Seen:** `money.ts`, `deriveMoney`: `incomeWorst` = min income over the window and `spendingWorst` = max spending, taken independently. `v10.png`: "Your worst month is already $5,883.85 overspent either way" with "Worst month . $387.79 in". `y02.png` (housing editor): "Your housing costs come to $2,003.43 a month, 516.63% of money in", a ratio produced by dividing by the worst-income figure.
- **Why it matters:** The research this design leans on reports income dips and spending spikes are only weakly correlated (about 0.1) and sizes a buffer from the **median** simultaneous dip and spike, roughly six weeks of take-home pay [JPMCI-2]. The minimum of 6 incomes plus the maximum of 6 spendings is an extreme of each, not a typical bad month. One odd month sets the whole verdict. For gig workers a single zero-income month sets income to 0 and every check collapses. Users learn to ignore the card or feel shame about numbers they did not create (4.4).
- **Fix:** Define the stress explicitly: for example 2nd-lowest income of 6 (about P20) and 2nd-highest spending (about P80), named "A rough month", with the definition in the ⓘ. Keep the extreme months visible in Month details.

### 4.3 Mean-based "Average" is outlier-sensitive (High)
- **Seen:** `money.ts`: `incomeAverage = divideHalfUp(S, n)`. The test account's $150M month would make the average basis meaningless. The only guard is the user marking lines one-off (D-47).
- **Why it matters:** A bonus, tax refund or property sale inflates "Average" for six months and can flip a `no` into `fits`. Users forget to flag one-offs.
- **Fix:** Use the median or a trimmed mean. Detect months beyond about 2.5 median absolute deviations and ask: "This month looks unusual. Count it?" (a prompt, not a silent assumption).

### 4.4 A pre-existing deficit makes every purchase "Doesn't fit right now" (High)
- **Seen:** `assessPlan`: `left = leftBefore - newMonthly`. With `leftBefore < 0`, `remainingShortfall > 0` even for a zero-monthly cash purchase, so state is `no`. Title `titleNoAlreadyShortSame`: "Your worst month is already $X overspent either way." `v10.png` shows the full red card; `v05.png` shows the quick check doing the same for a sofa.
- **Why it matters:** True, but it conflates "this purchase" with "your month". A coach separates the two: a household $5,000 a month overspent needs to hear that first, but a $4 coffee is not the problem. Repeated red cards for a state the user cannot change in one session produce avoidance (the ostrich effect), the opposite of what a money app wants.
- **Fix:** Two-part verdict. Line 1 "Your month before this: $X overspent." Line 2 "This purchase: adds $0 a month, uses $Y of cash above your cushion." Keep the combined state, but lead with what the purchase changes.

### 4.5 Contradictory or garbled verdict text (High)
- **Seen:**
  - `v05.png`: quick check on a $1,800 sofa shows chip **"Not from cash"**, size label **"Out of savings"**, body **"Cash covers it. Even with saving paused, the month would end $5,327.34 overspent."** The chip says cash will not do; the body says cash covers it. `stateChip` in `verdictCopy.ts` maps `no` on the quick-cash surface to `noCash` ("Not from cash") whatever the cause.
  - `v10.png`: key figures read **"CUSHION Over 50 years"** and **"A MONTH None"**, wait-time fields shown in cushion slots under a deficit. A user cannot parse this.
  - `dc01.png` vs `dc02.png`: the hero wraps over three lines with a "US$" prefix in one build and not in the next.
- **Why it matters:** Verdict text is the product. Inconsistency costs trust faster than any engine inaccuracy.
- **Fix:** One state-to-copy table keyed on (state, lead warning, surface), plus a test that no pair can contradict. Rename: "Cushion after: n months", "Ready in: not on current income".

### 4.6 Cushion breaches are not graded (High)
- **Seen:** `assessPlan`: `cashAfter < reserve` adds a `cash` warning and the state is `adjust` unless `cashAfter < 0`. `y02.png`: cushion $27,070.86.
- **Why it matters:** Breaching a $27,070 cushion by $1 and by $26,000 produces the same amber chip. People react to the chip, not the small print. Leaving $400 in the bank for a household with $4,500 monthly costs is not "Needs adjustment".
- **Fix:** Grade by cushion consumed: under 10% amber "just under your cushion", 10-50% amber strong, over 50% or under one month of costs red. Make the thresholds named behaviour constants. Show "after this you hold 2.1 months of costs".

### 4.7 "Cash" is every cash-like account (Medium-high)
- **Seen:** `buildSnapshot.ts` (balances loop): `if (cashLike(kind)) cashOnHand += v`. Pots protect only the `saved` value entered or tagged.
- **Why it matters:** The cushion and the purchase draw on one pool, but users mentally hold deposits, tax money or a partner's funds in those accounts (mental accounting) [THALER-SHEFRIN]. The verdict can say `fits` about money the user thinks is spoken for. Investments count for nothing.
- **Fix:** Let the user mark accounts as cushion, spendable or set aside. Show cash by bucket in Month details and give the cushion a months-of-cover figure.

### 4.8 28/36/12 are mortgage-underwriting lines applied to everything, pre-set (Medium)
- **Seen:** `constants.ts` cites Fannie Mae B3-6-02 (36% back-end DTI, manual underwriting) and Bankrate (28% front-end); both are on **gross** income and built for mortgage approval. FincWin applies them to **take-home** income and the 36% line to any buy check. `v20.png`/`dc02.png`: "All at their defaults". Housing is tested only on **property** checks (`addsHousing`).
- **Why it matters:** Bankrate itself calls 28/36 "just a guideline" and notes lenders accept higher ratios [BANKRATE]. Calling defaults "Lines you will not cross" when the user never chose them is an authority illusion, and defaults anchor. Existing housing over 28% never warns unless a property check runs, so someone at 516% (worst basis) gets no standing signal. A permanent amber is ignored (alarm fatigue).
- **Fix:** Ask once ("Which lines do you want to hold?") with the standard shown as a suggestion ("Lenders often use 28 and 36 of pre-tax pay"). Until set, call them "Suggested lines". Report standing housing share in Month details even with no property check.

### 4.9 Saving and investing are treated as slack (Medium)
- **Seen:** `assessPlan` pause logic: state is `adjust` when a pause closes the month. D-105 names the pause in copy.
- **Why it matters:** A user can "fit" a car loan by suspending a pension contribution with an employer match, or an emergency-fund transfer. Present bias [KT-1979]: the future self funds the purchase. Naming the pause helps; the amber chip still reads as passable.
- **Fix:** Distinguish flexible saving from committed saving (employer match, emergency-fund build). Treat committed saving as an expense for the verdict. Show "Pauses $X a month for N months, $Y forgone in all".

### 4.10 Unsynced changes while verdicts are shown (Medium, device)
- **Seen:** "22 changes couldn't save" appears on nearly every screen (`w05.png`, `v15.png`, `v20.png`, `y02.png`, `fin-01.png`).
- **Why it matters:** If writes are queued and not applied, the snapshot may lack recent transactions and a verdict can rest on stale data with no warning on the verdict.
- **Fix:** Add a freshness line to every verdict ("includes 22 changes not yet saved") and downgrade confidence while the write queue has failures.

### 4.11 Duplicate open checks double-stack (Low-medium)
- **Seen:** `x09.png`/`x12.png`: two identical "Sofa" checks, each "with the other open checks". "With other checks" is on by default, so a duplicate counts twice.
- **Fix:** Warn on near-duplicates (same item and price) and offer to merge.

### 4.12 Other findings
- **Cheaper default of 65%** (`DEFAULT_CHEAPER_RATIO_PERCENT`) is a prototype anchor that silently frames a "reasonable" discount (Medium-low).
- **A pot past its date silently sets aside 0** (`pots.ts`, `past_due`): an unmet obligation vanishes from the month. Surface "Past due: $X still needed" (Medium).
- **The wait plan** uses `leftBefore` as the saving rate and ignores price drift and competing pots (Low-medium).
- **`fits` on rough confidence** still reads as approval. Tie the wording to confidence, for example "Fits, on rough figures" (Medium).
- **Net worth and investments are not read.** A household with $400k invested and little cash gets `no`, or `fits` while drawing down. Show liquid net worth beside cash (Low-medium).
- **Credit card balances:** a card paid in full monthly is not distinguished from a revolving one, so minimums may inflate DSR for transactors. Needs confirmation in the debt builder (Medium).
- **Ratios on worst-basis income** can show figures like 516.63% that look like a bug (Low).

---

## 5. What is missing or should have been done differently

### 5.1 Emergency fund versus cushion
The cushion is one number. Coaches separate (a) a starter buffer, (b) a full 3-6 months, (c) money for known irregular costs (pots). Decide mixes them. Add "months of cover" as a headline stat and let the verdict say "after this you hold 2.1 months of costs", a more intuitive unit than dollars [CFPB-EF][VAN-1].

### 5.2 Irregular income
Pay smoothing is good; the basis side is weaker (4.2, 4.3). Missing: an optional "baseline month" anchor (the lowest income reliably cleared) and a note when income depends on one client.

### 5.3 Debt: avalanche, snowball, high APR
`highestUnsecuredApr` exists, but only produces a neutral fact on **invest** checks (`debt_rate_exceeds_return`). A buy check made while carrying 24% card debt gets no such line. The relevant fact: paying 24% debt down is a guaranteed 24% return. A declarative version: "You carry $X at 24%. Twelve months of that card's interest on $1,800 is $Y." That is arithmetic, not advice. Also consider a read-only payoff-order view (avalanche versus snowball dates), since new purchases and debt payoff compete for the same dollars.

### 5.4 Credit-card minimum-payment trap
The engine handles a minimum that never clears and carries interest. Missing: minimum-only payoff time and total interest on the verdict line itself, as the CARD Act statement box does, and the 3-year payoff payment [CFPB-MIN]. The minimum is an anchor; showing it first is the nudge to avoid.

### 5.5 BNPL
The instalment plan models pay-in-N. Missing: **existing** BNPL plans with other providers, and stacking risk. CFPB research finds BNPL borrowers are more likely to be highly indebted, revolve on cards and use overdraft, though many differences pre-date BNPL use [CFPB-BNPL]. A prompt ("Any other pay-in-4 plans running?") feeding scheduled outflows would close the blind spot.

### 5.6 Inflation and price drift
All projections are nominal at 0%. That is honest (no invented rates), but a 5-year do-without or wait plan at 0% overstates what the saved money buys. Offer an optional price-drift field beside the return.

### 5.7 Goals
Pots cover dated targets. Missing: a link between goal progress and Decide ("this purchase delays your house deposit by 3 months"). It is a fact, not advice, and the most behaviourally powerful sentence a money app can print.

### 5.8 Household fairness
Share rules exist in the engine; the UI is hidden until Phase 8. Missing: visible fairness framing ("your share is 58%"), and views for two people with different incomes and risk tolerances.

### 5.9 "Worst month" versus "This month" defaults and their effects
Defaulting to This month nudges optimism (4.1). Defaulting to Worst produces perpetual red for many people (4.2, 4.4) and avoidance. Neither is neutral. People anchor on the first number shown. Show the **typical** and the **rough** month together by default, not behind a switch. The D-107 three-basis card is the right idea placed too deep in Step 3.

### 5.10 Overconfidence in projections
The confidence chip helps. Missing: ranges instead of points, and a **back-test** ("run three months ago, this check would have said X; the month was Y"). The engine already holds the history, and back-testing is the most credible trust builder available.

### 5.11 The role of the 28/36 rule
Good as a reference, wrong as a gate (4.8). Consider a tiered view (comfortable, stretched, over), and alternative lenses (50/30/20, 20/10) so users do not infer one rule is "the" rule.

### 5.12 How verdicts encourage or discourage behaviour
- Encourage: wait-and-save, pots, alternatives, estimate-vs-actual.
- Discourage-risks: red full-card verdicts on pre-existing deficits (shame, avoidance); optimistic green `fits` under rough confidence (false licence); amber that is too common (alert fatigue); "Go ahead" always available (fine for autonomy, but add a one-line "what changes" before commit).
- Add a **commit receipt** after Go ahead: one line of what changed and a 30-day check-in. Estimate-vs-actual already supports the loop.

### 5.13 Other gaps
- Year-ahead lumps view (tax for the self-employed, insurance, annual renewals).
- A standalone liquidity flag on the home card ("cushion under 1 month") that does not need a check.
- Plain-language glossary at the point of use. The 65 ⓘ entries cover this well; keep them current as the formulas change.

---

## 6. Why some things are the way they are (defensible choices and trade-offs)

- **Worst-month default (earlier phases)** came from the prototype: caution is the safe failure mode for a tool where "a wrong answer causes real harm". Defensible in stance, wrong in its extremes (4.2).
- **This month as default (D-106/D-107)** came from device-walkthrough feedback that the worst-month hero was confusing and red. Current-month data is intuitive and responsive but incomplete mid-month. The fix is projection, not reverting.
- **No default rates (D-06/D-07)** avoids invented returns. A strong ethical choice. The cost is dull 0% projections, and that is preferable to false precision.
- **One free-cash-flow figure after saving, investing and pots (D-100)** matches zero-based tools. A heavy saver sees a small "free" number, mitigated by the pause logic.
- **All spending off, no essentials split (D-100)** avoids a classification burden users do badly. The cost: no essentials-based cushion, which many coaches prefer.
- **36% DSR and 12x unsecured lines are behaviour constants (D-04)**, honestly labelled in the code comments, but not in the user's view (4.8).
- **`fits` needs zero warnings.** Conservative on purpose; a rare `fits` stays meaningful.
- **Pausable saving as relief (D-35)** reflects how people live. Naming the pause is the compromise.
- **Compliance voice** forces declarative copy. Some of the most useful sentences (high-APR debt) must be phrased as arithmetic, which is workable and arguably better behaviourally.

---

## 7. Solutions and roadmap

All suggestions state arithmetic about the user's own figures. They never say "you should". Where a default is added, it is a suggestion the user can change.

### Quick wins (days, mostly copy and thresholds)
| # | Change | Solves | Impact |
|---|---|---|---|
| Q1 | One state-to-copy table plus a no-contradiction test | 4.5 | Trust |
| Q2 | Rename "Cushion Over 50 years / A month None" to "Cushion after: n months" and "Ready in: not on current income" | 4.5 | Clarity |
| Q3 | Freshness line on verdicts when the write queue has failures | 4.10 | Trust |
| Q4 | "Fits, on rough figures" wording under rough confidence | 4.12 | Calibration |
| Q5 | Label 28/36/12 "Suggested lines" until the user edits one | 4.8 | Removes authority illusion |
| Q6 | Warn on duplicate open checks | 4.11 | Accuracy |
| Q7 | Show past-due pots as an amount still needed | 4.12 | Obligation visible |
| Q8 | Show ratios above 200% as "over the line" | 4.12 | Reads less like a bug |

### Next phase (weeks, engine plus UI)
| # | Change | Solves | Impact |
|---|---|---|---|
| N1 | Project discretionary spending in the 'month' basis and cash path | 4.1 | Largest accuracy gain for the default experience |
| N2 | Defined "rough month" stress (P20 income / P80 spending) replacing min/max | 4.2 | Fewer false `no`, fewer permanent reds |
| N3 | Median or trimmed mean for Average, plus outlier prompt | 4.3 | Robust to windfalls |
| N4 | Two-part verdict: "your month already" versus "this purchase" | 4.4 | Less shame and avoidance, clearer cause |
| N5 | Graded cushion severity plus months of cover | 4.6, 5.1 | Honest severity |
| N6 | Account buckets: cushion / spendable / set aside | 4.7 | Matches mental accounting |
| N7 | Debt-aware row on buy checks | 5.3 | Surfaces the guaranteed-return arithmetic |
| N8 | Minimum-payment payoff time and total interest on the verdict | 5.4 | Defuses the minimum anchor |
| N9 | User sets lines at onboarding | 4.8 | Real commitment |
| N10 | Flexible versus committed saving | 4.9 | Pension pauses stop reading as fine |
| N11 | Typical and rough month together by default; three-basis card higher in Step 3 | 5.9 | Less anchoring |

### Later
| # | Change | Solves | Impact |
|---|---|---|---|
| L1 | Back-test on past months | 5.10 | Strongest credibility lever |
| L2 | Ranges instead of points | 5.10 | Honest uncertainty |
| L3 | Goal-impact sentence | 5.7 | Powerful, factual |
| L4 | Household fairness view, per-partner lines | 5.8 | Less conflict |
| L5 | BNPL stacking prompt | 5.5 | Closes a blind spot |
| L6 | Optional price drift, real-terms wording | 5.6 | Honest long horizons |
| L7 | Essentials-based cushion option | 6 | Matches coaching practice |
| L8 | Tiered affordability, alternative rules of thumb | 5.11 | Less rule fetishism |
| L9 | Year-ahead lumps view | 5.13 | Prevents ambushes |

### Compliance note
Everything above can be worded as a statement about the user's own figures, a comparison with the user's own lines, or a labelled published reference. None needs "should", "recommend" or a product pitch. One caution: a "comfortable / stretched" tier built on lender-style ratios could read as a credit assessment; wording it "against your lines" keeps it personal planning. The project's own compliance caveat on Guideline 3.2.1(viii) still needs re-checking at the Compliance phase; this audit did not touch it.

---

## 8. Sources

"Fetched" means a search result I read in this session. "From memory" means I did not re-open it.

- [JPMCI-1] JPMorgan Chase Institute, Weathering Volatility (fetched): https://www.jpmorganchase.com/institute/all-topics/household-financial-health/report-weathering-volatility
- [JPMCI-2] JPMorgan Chase Institute, Weathering Volatility 2.0, a monthly stress test (about six weeks of take-home pay; 65% of families short; income and spending shocks correlate about 0.1) (fetched): https://www.jpmorganchase.com/institute/all-topics/financial-health-wealth-creation/report-weathering-volatility-2-a-monthly-stress-test-to-guide-saving
- [VAN-1] Vanguard, income volatility and emergency saving (fetched): https://investor.vanguard.com/investor-resources-education/article/understanding-income-volatility-and-emergency-saving and https://investor.vanguard.com/emergency-fund/amount?lang=en . I found no Vanguard months figure for variable income, so the 4.5 and 6 month mapping in `constants.ts` is a FincWin choice, as its comments already say.
- [MH] MoneyHelper guidance via NS&I (3-6 months of essential outgoings; secondary): https://www.nsandi.com/guide/emergency-fund
- [CFPB-EF] CFPB emergency-fund material (secondary coverage): https://www.housingwire.com/articles/cfpb-prompts-americans-to-start-small-save-up/
- [CFPB-FWB] CFPB Financial Well-Being Scale technical report (fetched): https://www.consumerfinance.gov/data-research/research-reports/financial-well-being-technical-report/
- [CFPB-BNPL] CFPB, Consumer Use of Buy Now, Pay Later, 2023 (fetched): https://consumerfinance.gov/data-research/research-reports/consumer-use-of-buy-now-pay-later-insights-from-the-cfpb-making-ends-meet-survey
- [CFPB-MIN] Credit-card minimum-payment warning (fetched): https://www.consumer-action.org/helpdesk/articles/minimum_payment_warning and https://www.consumerfinance.gov/ask-cfpb/a-box-on-my-credit-card-bill-says-that-i-will-pay-off-the-balance-in-three-years-if-i-pay-a-certain-amount-what-does-that-mean-en-36/
- [BANKRATE] Bankrate, the 28/36 rule (a guideline, gross income, lenders allow higher) (fetched): https://www.bankrate.com/mortgages/what-is-the-28-36-rule/
- [FANNIE] Fannie Mae Selling Guide B3-6-02, as cited in `constants.ts` (not re-fetched): https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios
- [THALER-SHEFRIN] Shefrin and Thaler 1988, The Behavioral Life-Cycle Hypothesis (fetched abstract-level): https://ideas.repec.org/a/oup/ecinqu/v26y1988i4p609-43.html . Thaler 1999, Mental Accounting Matters: from memory.
- [KT-1979] Kahneman and Tversky 1979, Prospect Theory (abstract only): https://www.econometricsociety.org/publications/econometrica/1979/03/01/prospect-theory-analysis-decision-under-risk
- [BUEHLER-1994] Buehler, Griffin and Ross 1994, Exploring the Planning Fallacy (fetched): https://bear.warrington.ufl.edu/brenner/mar7588/Papers/buehler-et-al-1994.pdf
- [FLYVBJERG] Flyvbjerg and colleagues on optimism bias in forecasts (projects, not households; used by analogy) (fetched): https://research.tudelft.nl/en/publications/five-things-you-should-know-about-cost-overrun
- Not found or not verified: published UX research on shame and red numbers in budgeting apps (searches returned reviews only), Ariely, Experian's 20/10 rule, the 50/30/20 rule and FCA material. Statements involving them are general knowledge; check before quoting externally.

---

## Addendum A: Device walkthrough

Screenshots reviewed: `dc01`-`dc04`, `w05`, `w10`, `v05`, `v10`, `v15`, `v20`, `v25`, `x03`, `x06`, `x09`, `x12`, `y02`, `y05`, `y08` and `fin-01.png`.

Observations from them:
- `dc01.png`/`dc02.png`: older home card, "YOUR WORST MONTH", "$5,876.23 short", "3 items need a look". The hero wraps over three lines in `dc01`.
- `v05.png`: the quick check on "sofa 1800" with Judge on "Worst month". Chip "Not from cash" sits above "Out of savings" and "Cash covers it. Even with saving paused, the month would end $5,327.34 overspent." The contradiction is described in 4.5.
- `v10.png`: Step 3 verdict, red "Doesn't fit right now", "Rough basis" chip, key figures "Cushion Over 50 years" and "A month None", and a footnote about converted CAD and GBP amounts. The outcome-on-each-basis card is below the fold.
- `v15.png`, `v20.png`, `v25.png`, `x03.png`, `x06.png`, `y08.png`: Pots, housing line editor ("516.63% of money in") and Open checks with duplicate Sofa checks. Pot flows work (Undo toast, delete with Undo). A persistent "22 changes couldn't save" banner appears on every screen.
- `fin-01.png`: taken once by the guarded helper (read-only) while another session held the device lock. It shows the Pots screen with the same banner. I tapped nothing.

Live device pass (Pixel 9, read-only; I took the device lock, looked, swiped, opened Month details and closed it; nothing was saved or changed, and Judge on stayed on "This month"):
- `fin-02.png`, `fin-03.png`: Decide home with a quick check result already open ("Laptop 1200"). On **This month** the card reads "$219,783.86 free . In $220,624.89 . Out $841.03" on 24 October, and the quick check says **"It fits"**: "Paid outright today your cash lands at $150,229,388.50, above your $27,116.58 cushion, and the month still closes with $219,776.24 spare." The "Out $841.03" is only what is logged so far (Month details shows Spending $270.30, Debt $14.22, Saving and investing $556.51). The same account's Worst month has spending of about $6,264 (`dc02.png`), so the default basis shows roughly one seventh of a typical month's outflow, three weeks into the month. That is finding 4.1 with real data.
- `fin-04.png` (Month details): the Judge on options are labelled by **income only**: "This month . $220,624.89", "Worst . $387.79", "Average . $25,009,846.88". The user picks a basis without seeing what each does to the free figure, and the Average income is $25 million (finding 4.3: the mean of a window holding the $150M month). A "Volatile" tag sits at the top, which correctly implies a 6-month cushion of $27,116.58, but the cushion line and the verdict never explain why the basis choice flips "fits" to "overspent".
- The same data gives opposite answers on one screen family: the laptop "fits" on This month, while the Worst basis (`dc02.png`, `v05.png`, `v10.png`) says $5,876 overspent. Both are labelled as the verdict. Users will not know which to believe unless the comparison is shown first (5.9).
- "3 items need a look" is shown with Open checks "3" and no "changed since you looked" marker (compare `dc01.png`), so the badge and the list disagree about what needs a look.
- The quick-check card's "With other checks" toggle was on, and Open checks still contains the duplicate Sofa checks (4.11).
- The "22 changes couldn't save" banner was no longer on Decide home in `fin-02`/`fin-03` but is on the sub-screens in earlier shots (4.10).
- Not done on the device, by instruction: Full check, New check, Go ahead, saving anything. So the Step 3 verdict, alternatives and decision screens are judged from the earlier screenshots (`v10.png`, `x*.png`) and the code.
