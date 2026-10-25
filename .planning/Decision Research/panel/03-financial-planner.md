# Panel seat 3: Financial planner and budgeting-method practitioner

Branch `phase/05-decide-ui`, worktree `C:\dev\fincwin-p5`, 2026-10-25. Read-only: no code, catalogue or git changes.
Builds on `.planning/Decision Research/audits/FINANCE-AUDIT.md` (FA) and `.planning/Decision Research/audits/LANGUAGE-AUDIT.md` (LA). Where they already cover a point I cite them and move on.

## Summary (plain English)

1. People ask "can I afford it?" to learn one thing: will I still be OK at the end of the month, and later?
2. To know that, you take what usually comes in and subtract what must go out: bills, everyday living, debt payments, saving you have promised yourself, and money put aside for big yearly costs.
3. What is left is your "spare money". A small, regular slice of it is your "spending money" for occasional things.
4. A purchase fits if it fits inside this month's spare money, or inside savings you hold above your safety money, which the spare money then refills.
5. Today the app mixes two tests: the month (a flow) and the cash cushion (a stock). The verdict for a cash purchase never checks the month at all.
6. One bad month should not set the answer. Most "bad months" are a big yearly cost with no pot set up for it. The app should spot that and say so.
7. A usual month should be the middle of your real months, not the lowest income from one month glued to the highest spending from another.
8. If the month is already short, say that once, apart from the purchase. A $5 coffee is not the cause of a $310 gap.
9. Keep the 28/36 rules, setbacks, opportunity cost and the long option list, but put them in an "advanced" layer.
10. The answer becomes one sentence, then two or three facts, then optional detail.

---

## 1. What a planner sees in today's engine (new findings only)

FA already covers: the 'month' basis has no projection for spending still to come (FA 4.1), min/max "worst" (FA 4.2), mean outliers (FA 4.3), a deficit turning every purchase red (FA 4.4), ungraded cushion (FA 4.6), all cash being one pool (FA 4.7), 28/36 as gates (FA 4.8), saving as slack (FA 4.9). LA covers the words. I agree with all of them. Below is what is new from a budgeting-method seat.

**P1. A cash purchase is never tested against the month.** `assessPlan` subtracts only `newMonthly = mineMonthly + mineRunning` from the month (`src/engine/decide/assess.ts:340`). For an outright purchase both are 0, so `left = leftBefore`. The price only hits `cashAfter` (`assess.ts:342`), which is compared to the cushion (`assess.ts:412`). So "It fits" for a laptop means "your cash stays above 3–6 months of costs". It does not mean "your month still ends with money left", which is the owner's question. The month only appears in the `purchaseSize` label (`assess.ts:299-302`), and that label reads `leftThisMonth`, which under 'month' is inflated (FA 4.1). Result: the label can say "Out of this month's spare" when part of the money in fact comes from savings (worked example 9.1).

**P2. Two tests count the same dollars in two ways.** `leftBefore` (flow) and `cashAvailable` (stock) are computed separately (`assess.ts:203-227`). On the 18th, this month's received pay is already inside the cash balance and also inside `leftBefore`. The engine never says how they relate. A planner links them in one line: "month-end cash = cash today minus what is still to go out this month". The month's spare is the part of month-end cash that is new this month. That single identity removes the double reading (section 6).

**P3. The cushion is sized on all spending, including discretionary.** `monthCosts = spendingAverage + debtPayments` (`assess.ts:196`), times 3/4.5/6 months (`constants.ts:108-112`, `reserve.ts`). Planning practice sizes an emergency fund on essential outgoings (FA cites MoneyHelper "essential outgoings"). D-100 rejected an essentials split by category. A split by type of line does not need categories: recurring series plus everyday spending are the essentials; occasional one-off buys are not (section 3).

**P4. There is no "spending money" (allowance).** No engine file has the concept (grep of `src/engine/decide` for allowance/discretionary/essential: no hits). Occasional purchases sit inside `spendingAverage` or `spendingWorst` as noise. So the owner's case (a $40 item every other month) moves the mean by $20 and, under the worst basis, enters at full size in the month picked as worst (`money.ts:273-286`). The cash path also counts it twice: once as history inside `undated = spendingBasis − series` (`cashPath.ts:184`) and once as the check's own outflow.

**P5. A "bad month" is treated as weather, not as information.** Pots are manual (`pots.ts`). The engine never notices that the bad month was a car repair, vet bill or annual renewal, which is exactly YNAB's "true expense" [YNAB-R2]. In practice that is the most common cause of a bad month, and the fix is a pot, not a stricter basis.

**P6. Saving is pay-yourself-first in practice, but pausable in the engine.** `monthlySaving` is inferred from transfers into savings accounts (`src/features/decide/snapshot/buildSnapshot.ts:315-339, 682`). The pause rule spends it first (`assess.ts:376-381`). Planners put committed saving above discretionary spending in the order of payment (Sethi's conscious spending plan takes fixed costs and saving first, guilt-free spending is what remains [SETHI]). FA 4.9 raised this; I add the ordering below.

**P7. Variable income is judged on the wrong floor.** Planners budget irregular earners on a baseline (the lowest reliable month) and treat anything above it as surplus to hold back [IRREG-1][IRREG-2]. The engine either averages (rewarding a windfall) or takes the single lowest month (punishing one planned gap, `money.ts:284`). The 2nd-lowest of 6, with planned gaps flagged out, is closer to practice.

---

## 2. What the market computes (research)

| Product | "Spendable" figure | Formula (as documented) | Lesson for FincWin |
|---|---|---|---|
| Monarch Flex | Monthly flex number | Income − Fixed − Non-monthly (sinking funds) − Goals = Flex [MONARCH] | Three spending buckets plus goals. Optional rollover per category. Closest to the owner's model. |
| PocketGuard | In My Pocket | Income − Bills − Savings goal − Ongoing spending [PG-1]; proprietary; reviewers note it swings on irregular pay [PG-2] | Same order. Weak on variable income. |
| Simple (closed) | Safe-to-Spend | Balance − scheduled expenses being funded − goal contributions [SIMPLE] | A stock figure: "balance minus what is already spoken for". |
| Rocket Money | Safe to Spend | Income − upcoming bills, subscriptions and card payments before next payday [ROCKET] | A pay-period stock figure. |
| Copilot | Free to Spend | What can still be spent this month without going over budget [COPILOT] | A budget remainder (needs a budget). |
| YNAB | Ready to Assign / categories | Only money you have; true expenses funded monthly (cost ÷ months to due date) [YNAB-R2] | Bad months are mostly unfunded true expenses. |
| 50/30/20 | Wants = 30% | Needs 50% (incl. debt minimums), wants 30%, saving and extra debt 20% of take-home [5030] | A reference, not a gate. |
| Sethi CSP | Guilt-free spending | Fixed 50–60%, invest 10%, save 5–10%, guilt-free 20–35% of take-home [SETHI] | Fun money is planned, after saving. |

Two patterns appear in every product:
- **The order is the same:** income → fixed bills → yearly costs set aside → goals and saving → what is left for flexible spending.
- **None tests a specific purchase.** Each gives one spendable number. FincWin's value is to apply that number to an item, so the number must be right before any line or ratio matters.

On cushions: CFPB tells people to size emergency savings on the unexpected costs they actually had, and to start small [CFPB-SSSU]. Common guidance is 3–6 months of essential expenses [FA: MH, VAN-1]. JPMorgan Chase Institute finds a typical simultaneous income dip and spending spike is about six weeks of take-home pay [FA: JPMCI-2], so a starter buffer of about 1 month of essentials is realistic and evidence-based.

---

## 3. The buckets a purchase must clear

From practice, in the order money is spent (pay-yourself-first order):

| # | Bucket | What goes in it | Engine source today | Usual figure |
|---|---|---|---|---|
| 1 | **Income** | Take-home pay, all members' share per household rules | `incomeAverage`/`incomeWorst`, income series | Steady: median of 6 full months. Variable: baseline (2nd-lowest of 6, planned gaps flagged out) |
| 2 | **Bills** | Recurring series: rent, utilities, phone, insurance, subscriptions (yearly ones smoothed /12) | bills, smoothing (D-23) | Sum of monthly equivalents |
| 3 | **Everyday living** | Non-series spending that happens most weeks: groceries, fuel, transport, eating out | rest of `spending` | Median of 6 months |
| 4 | **Debt minimums** | Every minimum payment | `debtPayments` | Sum |
| 5 | **Committed saving** | Pension, emergency-fund build, any saving marked "keep" | `monthlySaving`, `monthlyInvesting` | As logged; default committed |
| 6 | **Pots (true expenses)** | Car service, Christmas, annual renewals, holidays | `pots.ts` | Remaining ÷ months left |
| 7 | **Spending money (allowance)** | Occasional non-essential buys: clothes, gadgets, games, gifts | not modelled | User-set, else median of occasional buys |
| = | **Usual spare** | What is left in a usual month | `leftBefore` (close, but see P1–P7) | 1 − (2…7) |

Precise definitions:
- **Occasional line:** a non-series spending line that is not a transfer and is either in a "treat" category the user chose, or above a size threshold (for example over 10% of usual everyday spending in one line). This avoids asking the user to label essentials (D-100 still holds) while separating "groceries" from "a new jacket".
- **Usual spare (S)** = usual income − bills − everyday − debt minimums − committed saving − flexible saving − pots − spending money. It is the money no plan has claimed. It can be negative.
- **This month's room (R)** = this month's expected income − bills (logged + still due) − everyday logged − everyday still to come (usual everyday × days left ÷ days in month) − occasional logged − debt − saving − pots. Room therefore includes any spending money not yet used. If the user spends exactly their spending money every month, R ends at S.
- **Safety money (F)** = user-set, else months × (bills + everyday + debt). Months: 3 steady, 4.5 variable, 6 volatile (the existing constants). Spending money and saving are not essentials, so F is smaller than today's cushion and closer to practice.
- **Month-end free cash (K)** = cash today − pot balances − bills and everyday still to go out this month − lumpy bills due in the next 30 days. Moves between my own accounts are not outflows.
- **Above safety (C)** = K − F. This is the only pot of money a one-off purchase can draw on without touching the safety money. It already contains this month's room, so R is never added to C (that fixes P2).

---

## 4. Good months, bad months

A planner asks one question of a bad month: **"Will it happen again?"**

1. **Use real months, paired.** Rank the last 6 full months by their own result (income minus outgoings of the same month). The usual month is the median per bucket. The "tight month" is the 2nd-lowest real result (about the 20th percentile), named by its biggest cause: "July: $640 car repair". Never combine the lowest income of one month with the highest spending of another (`money.ts:273-286`, FA 4.2).
2. **Ask about big lines once, with three answers.** When one line is larger than about a quarter of a usual month's spending, the app asks: "One-off / Comes up every year or so / Regular". One-off is left out (D-47 exists). Every year or so becomes a pot suggestion at amount ÷ 12, stated as arithmetic: "Car repairs: $640 in October, $380 in May. $85 a month covers a year of them." Regular stays in.
3. **Medians, not means,** for income (steady) and everyday spending. A $150M month (FA test data) then changes nothing.
4. **Good months:** income above the baseline is not spare until it is in the bank. For variable earners the extra goes to the safety money first (income smoothing [IRREG-1]). Decide reports it ("October brought $900 above your baseline") but does not raise S from it.
5. **The current month is shown as a projection with its pace**, never as logged-so-far (FA 4.1), and its main cause is named when it is off course.

---

## 5. Spending money (the owner's "allowance")

The owner's insight is right and is standard practice: a household that buys a $40 thing every other month is not overspending. That is what spending money is for.

- **It is planned before the spare, not fed by leftovers.** In every method above, fun money is a line in the plan (Sethi: guilt-free spending; Monarch: flexible; 50/30/20: wants). The spare is what remains after it. So a purchase inside spending money changes nothing about the month.
- **Its size comes from the user's own past.** Default = median of occasional spending over 6 months (what they already do). The user can change it. No currency constant (D-05).
- **A purchase can fit inside it.** If my share of the price ≤ spending money not yet used this month, the verdict is "Fits inside your spending money", with the amount left.
- **Rollover.** Unused spending money carries into next month, capped (for example 3 months' worth), so the $40-every-other-month buyer has $X × 2 available in the buying month. Monarch makes rollover optional per category [MONARCH]. This is the cleanest answer to "the average fluctuates but I still have an allowance". Open question 1.
- **Above spending money, a purchase uses the room, then savings above safety money.**
- **Household:** one spending money per person, optionally, matches the planner's "personal autonomy within a couple" practice. Phase 8.

---

## 6. When dipping into savings is fine

| Money | For a planned want? | Rule |
|---|---|---|
| Pots | Never, except the pot named for this purchase | Already (D-101) |
| Savings above safety money (C) | Yes | Fine. Report how fast the usual spare refills it |
| Safety money (F) | Not for wants | Taking any of it is "Doesn't fit without using safety money", with the amount |
| Below 1 month of essentials, or cash below 0 | No | Red. "Leaves under a month of safety money" / "Cash runs out before payday on the 28th" |
| Committed saving | Not paused by default | The user can mark a saving line "flexible"; only that is pausable (D-35 narrowed) |

Refill time (from savings part ÷ S):
- up to 3 months: neutral fact ("back in 2 months");
- 3 to 12 months: still fits, fact in amber tint ("takes 8 months to rebuild");
- S ≤ 0 or over 12 months: "Fits from savings. Your usual month does not refill them." (state: Fits, with a caution chip).

This grading replaces FA 4.6's single amber, and it answers "how much is OK to dip": everything above safety money, with the refill time stated.

---

## 7. Which extras earn their place

| Feature | Verdict | Layer | Why |
|---|---|---|---|
| Wait and save, ready-by date (`wait.ts`) | Keep | 2 (when it doesn't fit) | The natural "not yet". Fix: target = price − C, rate = S (not `leftBefore`) |
| Affordable price (bisection) | Keep, two numbers | 2 | "Up to $971 fits in this month's room; up to $2,281 without using safety money." Very practical |
| Cheaper at 65% (`constants.ts:100`) | Drop default | — | An anchor (FA 4.12). The affordable price replaces it |
| Cut a line 20%, earn more (`options.ts`) | Move | 3 | Generic; "earn more" reads as advice |
| Total cost (`ownership.ts`) | Keep for financed or running-cost items | 2 | Cars, pets, phones: the monthly hides the total. Hidden when `trivial` |
| Invested instead (D-104) | Keep | 3 | Only with a typed rate (D-06) |
| Cooling-off (48 h) | Keep as an option | 3 | A tool, not a metric. Offer when price > R |
| 36% debt-to-income | Fact, not gate | 2 (financed only) | "Debt payments would be 31% of take-home." Gate only if the user set the line (FA 4.8) |
| 28% housing | Advanced | 3 (property/rent checks) | Lender rule on gross pay [FA: BANKRATE] |
| 12× unsecured income (`constants.ts:50`) | Drop or advanced | 3 | Rarely bites; DSR and the monthly test cover it |
| Setbacks, stress, income at risk (`incomeAtRisk.ts`, `stress.ts`) | Advanced | 3 (new monthly commitments only) | For a cash buy, "safety money after: 3.4 months" says it in one figure |
| 90-day cash path | Keep in engine | 2 only when it bites | Timing ("tight before payday on the 28th") is real and useful |
| Three-basis card (D-107) | Replace | 2 | Show "usual" and "tight month" only when they disagree (LA fix 1) |
| On the edge 5% (`margins.ts`) | Fold into a fact | 2 | "$81 above your safety money" says more than a tag |
| Confidence | Keep, with reason | 2 | LA fix 2 |
| Estimate bias | Keep | background | Planning-fallacy guard |
| Five ledgers, month table | Keep | 3 | Detail for the curious |

---

## 8. The proposed model

### 8.1 Engine order (all integer minor units, `engine/` stays pure)

```
usualIncome   = steady ? median(income) : secondLowest(income, flaggedGapsOut)
S  (usual spare)    = usualIncome − bills − median(everyday) − debtMin − saving − pots − spendingMoney
R  (this month)     = expectedIncome − billsLoggedAndDue − everydayLogged − pace(everyday, daysLeft)
                      − occasionalLogged − debtMin − saving − pots
A  (spending left)  = spendingMoney + rollover − occasionalLogged          (floored at 0)
F  (safety money)   = userSet ?? months(steadiness) × (bills + median(everyday) + debtMin)
K  (month-end cash) = cash − potBalances − stillToGoThisMonth − lumpyBillsNext30d
C  (above safety)   = K − F
```

**One-off purchase, my share P:**
1. P ≤ A → **Fits · inside your spending money.**
2. P ≤ R → **Fits · in this month's room.**
3. P ≤ C → **Fits · part from savings** (split: min(P, max(R,0)) from this month, the rest from savings; refill = ceil(rest ÷ S)).
4. P > C, K − P ≥ 1 month of essentials → **Doesn't fit yet · would use $X of safety money.** Ready-by = ceil((P − C) ÷ S).
5. K − P below 1 month of essentials or below 0 → **Doesn't fit · leaves under a month of safety money** / **cash runs out**.
If C < 0 already (safety money under target), steps 1–2 still say Fits and add the fact "Safety money is $X under its target" (open question 5).

**Financed or recurring purchase (new monthly M, day-one D):** M ≤ S and D passes the one-off test → Fits; M ≤ S but M > tight-month spare → Fits, with the fact "In a tight month like July, this leaves $X short"; M > S → Doesn't fit (every usual month would go short by M − S). DSR, total cost and setbacks are layer 2/3 facts.

**Month notice (separate from any purchase):** if R < 0 or S < 0, one line above every verdict, once: "This month is heading $310 short, mostly the $640 car repair." The purchase verdict then speaks only about what the purchase changes (FA 4.4). Purchases under spending money or a small threshold get a neutral line, not a red card.

### 8.2 Layers on screen

- **Layer 1: the answer (one line + chip).** "Fits. This month's room covers $971; $229 comes from savings."
- **Layer 2: two or three facts.** Where the money comes from; safety money after, in months; refill time or ready-by date. For financed: monthly vs usual spare, total cost. Confidence with its reason.
- **Layer 3: detail (folded).** Tight month, the buckets table, cash day by day, affordable price, cheaper and later, total cost, setbacks, 36/28 lines, invested instead, cooling-off, assumptions.

All copy is a statement about the user's own figures. No "should", no "recommend".

---

## 9. Worked examples

**Household A.** Steady take-home $4,200. Bills $1,650 (rent 1,300, utilities 150, phone 90, insurance 110). Everyday median $1,000. Spending money $100 (median of occasional buys). Debt minimums $150. Saving $300. Pots $110 (car insurance $60, holidays $50). Cash $12,000; pot balances $900. Date 18 October (13 of 31 days left).
- S = 4,200 − 1,650 − 1,000 − 150 − 300 − 110 − 100 = **$890**.
- Everyday logged $600; still to come 1,000 × 13/31 = $419. No occasional buys yet. R = 4,200 − 1,650 − 600 − 419 − 0 − 150 − 300 − 110 = **$971**.
- F = 3 × (1,650 + 1,000 + 150) = **$8,400**. K = 12,000 − 900 − 419 = $10,681. C = **$2,281**.

### 9.1 A $1,200 laptop, cash
- 1,200 > A (100), > R (971), ≤ C (2,281) → **Fits · part from savings.**
- Layer 1: "Fits. This month's room covers $971; $229 comes from savings."
- Layer 2: "Safety money after: $9,481, 3.4 months of essentials." "Savings back in about 1 month at your usual $890 spare."
- Layer 3: "Up to $971 fits in this month's room; up to $2,281 without using safety money."
- **Today's engine, same data, This month basis:** spending = logged only, 1,650 + 600 → `leftBefore` = 4,200 − 2,250 − 150 − 300 − 110 = **$1,390 "free"** (overstated by the $419 still to come). Cash test: 11,100 − 1,200 = 9,900 vs cushion 3 × (2,750 + 150) = 8,700 → **"It fits"**, and `purchaseSize` says **"Out of this month's spare"** because 1,200 ≤ 1,390. The verdict is right; the label and the hero figure are wrong, and the $229 drawn from savings is invisible.

### 9.2 A $5 coffee when the month is already negative
**Household B**, 20 October. A $640 car repair on the 9th, no pot for it. R = **−$310**. Usual S = **+$180**. Cash $1,100, safety money target $7,500, so C = −$6,400 (still building). Spending money $60, $25 used.
- 5 ≤ A (35) → **Fits inside your spending money**, with the month notice above it:
  - Notice: "This month is heading $310 short, mostly the $640 car repair. Your usual month leaves $180."
  - Line: "The coffee comes out of your spending money: $30 left this month."
  - Layer 2: "Car repairs: $640 in October, $380 in May. $85 a month covers a year of them."
- If spending money were used up: "The $5 adds to this month's $310 gap." Neutral tint, no red card. Red only if cash would run out before payday.
- **Today's engine:** `leftBefore` −310, saving $100 paused, remaining shortfall $210 → state `no`, red **"Doesn't fit right now"** for $5 (`assess.ts:428-429`), the same card a $5,000 sofa gets.

### 9.3 A $40 item every other month
Household A buys a $40 board game in alternate months.
- History: the occasional line alternates $40/$0 (plus other occasional buys), so median spending money stays about $100; S stays $890 every month. With rollover, unused money builds up in the off month.
- Check on 18 October, no occasional buys yet: 40 ≤ A (100) → **"Fits inside your spending money. $60 of it left this month."** Layer 2: "Every other month, $40 is $20 a month."
- If October's spending money were already used: 40 ≤ R → "Fits in this month's room. October's spending money is used up, so this comes from the $871 spare."
- **Today's engine:** under Average the game adds $20 to `spendingAverage`; under Worst, the month chosen as "worst" includes it at full size, together with the lowest income from another month (`money.ts:273-286`). Either way the answer depends on which month the game landed in, which is the owner's complaint.

### 9.4 One bad month in the history
Household A, with a $2,400 vet bill in June. Mean everyday spending rises $400 for six months (S falls to $490). Worst basis takes June whole: S on that basis ≈ −$1,500 and every check turns red for six months. Under the proposal the median ignores it; the app asks once "One-off / Every year or so / Regular"; "Every year or so" offers a vet pot at $200 a month, and S becomes $690, which is the honest figure for a household that owns an ageing dog.

---

## 10. Open questions for the owner

1. **Spending money:** infer it from history (default) or ask once in setup? Rollover on, with a 3-month cap?
2. **Occasional vs everyday:** by size threshold, by a few "treat" categories the user ticks, or both? (D-100 rejected an essentials split; this is lighter, but it is still a split.)
3. **Saving:** treat all regular saving as committed (not pausable) unless the user marks it flexible?
4. **Safety money on essentials** (bills + everyday + debt), not all spending: it lowers today's cushion by the spending money and saving. Accept?
5. **Safety money under target:** if a purchase fits this month's room but the safety money is still being built, is that "Fits" with a fact, or "Doesn't fit yet"? Planners split on this; pay-yourself-first says the room goes to safety money first.
6. **Refill thresholds:** 3 and 12 months, as behaviour constants with a cited rationale?
7. **Small-purchase threshold** for a neutral line instead of a red card when the month is short: spending money left, or a share of usual spending?
8. **Variable income baseline:** 2nd-lowest of 6 full months, or lowest of 12 with planned gaps flagged out?
9. **Keep the basis switch at all?** The proposal shows "usual" and "this month" by default and "tight month" only when it changes the answer. That could retire Judge-on (D-107).
10. **Bad-month prompt:** ask on every big line, or once a month in a short review?

---

## 11. Sources

Fetched in this session (page read): [YNAB-R2], [MONARCH]. Search-result level (summaries read, page not opened): the rest. Searches for NerdWallet and Investopedia sinking-fund pages returned other publishers; I used those instead. Simple closed in 2024 (from memory); its formula is historical.

- [YNAB-R2] YNAB, Understanding your true expenses (Rule Two): https://www.ynab.com/blog/understanding-your-true-expenses-the-power-of-rule-two
- [MONARCH] Monarch, Flex budgeting, one number: https://www.monarch.com/blog/flex-budgeting-simplify-your-spending-with-just-one-number ; help: https://help.monarch.com/hc/en-us/articles/360048883631-Budget
- [PG-1] Clark Howard, PocketGuard review: https://clark.com/personal-finance-credit/budgeting-saving/pocketguard/ ; PocketGuard: https://pocketguard.com/budgeting/
- [PG-2] Motley Fool, PocketGuard review: https://www.fool.com/money/personal-finance/pocketguard-review ; Freenance: https://freenance.io/products/pocketguard-review-2026-budgeting-app-spending-tracker/
- [SIMPLE] PCWorld, Simple review: https://www.pcworld.com/article/402233/simple-review-budgeting-financial-app.html ; Money Crashers: https://www.moneycrashers.com/simple-review/
- [ROCKET] Rocket Money, tracking expenses: https://www.rocketmoney.com/learn/personal-finance/tracking-expenses-with-rocket-money
- [COPILOT] Copilot help, dashboard (Free to Spend): https://intercom.help/copilotmoney/en/articles/6045480-dashboard-tab
- [5030] Morningstar, the 50/30/20 rule (Warren and Tyagi, All Your Worth): https://www.morningstar.com.au/insights/personal-finance/190372/investing-basics-how-to-use-the-50-30-20-rule-for-budgeting ; https://money.ca/managing-money/budgeting/50-30-20-budget-rule
- [SETHI] Nasdaq, Ramit Sethi's conscious spending plan: https://www.nasdaq.com/articles/ramit-sethi:-how-to-create-a-conscious-spending-plan ; SuperMoney: https://www.supermoney.com/conscious-spending-plan
- [CFPB-SSSU] CFPB, Start Small, Save Up: https://www.consumerfinance.gov/about-us/newsroom/cfpb-announces-start-small-save-initiative ; secondary: https://www.housingwire.com/articles/cfpb-prompts-americans-to-start-small-save-up/
- [SINK] Chime, sinking funds: https://www.chime.com/blog/what-is-a-sinking-fund-and-why-do-you-need-it ; PayPal: https://history.paypal.com/money-hub/article/sinking-fund-vs-savings-account
- [IRREG-1] WealthNorth, budgeting irregular income (baseline month, planned gaps): https://wealthnorth.ca/personal-finance/budgeting/how-to-budget-irregular-income-canada/
- [IRREG-2] PayPal, budgeting with irregular income: https://securepayments.paypal.com/money-hub/article/how-to-budget-with-irregular-income ; Clever Girl Finance: https://www.clevergirlfinance.com/irregular-income/
- [FUN] Hawaii USA FCU, budgeting for fun money: https://www.hawaiiusafcu.com/resources/financial-education/financial-articles/june-2023/why-you-should-budget-for-fun-money
- Via FA section 8 (not re-fetched): JPMorgan Chase Institute Weathering Volatility 2.0, MoneyHelper/NS&I, Vanguard, Bankrate 28/36.
