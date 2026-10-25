# Panel seat 1: Behavioural economist / consumer-decision researcher

Branch `phase/05-decide-ui`, worktree `C:\dev\fincwin-p5`, 2026-10-25. Read-only: no code, catalogue or git state was changed.
Builds on `.planning/Decision Research/audits/FINANCE-AUDIT.md` (FA) and `.planning/Decision Research/audits/LANGUAGE-AUDIT.md` (LA). Their findings are cited by number and not repeated.

## Plain-English summary

1. People ask "can I afford it?" to get permission without guilt and to avoid being caught short later. They do not want a score.
2. What they need is one number: **what a normal month leaves me**. Then: does this buy fit in that, or in what I have saved?
3. A normal month is your pay, minus your bills, minus your usual day-to-day spending. Big one-off buys are not part of it.
4. Big buys still happen. Most people make one every month or two. So we should count them as a **big-buys allowance**: what you really spend on bigger things, spread across the year.
5. A bad month is not "the worst number from six months". It is a month with a reason: low pay, a big buy, or more day-to-day spending than usual. The app should name the reason.
6. Today the app mixes three ways of judging a month. They often disagree, and the one shown first ("This month") forgets the spending you have not done yet.
7. Today a one-off cash buy is judged only on your bank balance, not on what your month leaves. That is not how people think about it.
8. To trust the answer, people need to see the sum (in, minus bills, minus everyday, equals spare), see which months counted, and be able to fix a wrong label.
9. Cut the "Judge on" switch, the lender lines (28/36) from the front, and most of the extra figures on the first screen.
10. The owner must decide a few rules: what counts as a big buy, how many months to look back, and how much safety money to keep.

---

## 1. What job is the user hiring Decide for?

Jobs-to-be-done framing, from the owner's words and the research below.

| Job | What the user is really asking | Evidence |
|---|---|---|
| **J1 Permission** (the main job) | "Is it OK to buy this without hurting myself?" They have usually already chosen the item. | Cheema and Soman (2006): people look for a mental account that lets them justify an attractive purchase; ambiguous expenses get bent into whichever account has room [CS06]. The app is a justification engine whether it likes it or not. It should be an honest one. |
| **J2 No nasty surprise** | "Will I be short before payday, or when the car bill lands?" | Nearly 4 in 10 families make an extraordinary payment over $1,500 a year; a spending spike comes about once every four months [JPMCI-3][JPMCI-B]. 37% of US adults could not cover $400 from cash or equivalent in 2025 [SHED]. |
| **J3 Size it** | "How big is this for me? A week's spare? Six months?" | Mental budgets are tracked per category and per period; people judge a price against the budget it comes from, not against wealth [HS96][TH99]. |
| **J4 Later or cheaper** | "If not now, when? If not this one, which?" | Already well served (wait plan, alternatives; FA 3.2). |

J1 is the emotional job; J2 is the safety job. A good answer does both in one sentence. A score or a set of lender ratios does neither.

**The owner's own model is a flow model:** "at the end of the month, what is left will determine if the person can really afford something." That is Shefrin and Thaler's current-income account: people spend from this month's income freely, and treat savings ("current assets") and future income as different, harder-to-touch accounts [ST88]. So the answer must say **which pot of money pays for it**:

- **From spare**: the price is within what a normal month leaves.
- **From savings**: bigger than a month's spare, but savings cover it and stay above the safety amount; it takes N normal months to rebuild.
- **Not yet**: savings would drop below the safety amount; ready by a date.

This matches the existing size labels (`size.*`, LA problem 5) in spirit, but today they sit on top of a different calculation (section 3.2).

---

## 2. How real people judge months and expenses

### 2.1 A normal month
People do not think in means or minimums. They think "a normal month is when nothing odd happened". Their mental model is three layers:

1. **Fixed bills**: rent, phone, insurance, loan payments. Known and repeating.
2. **Everyday spending**: food, fuel, going out. Varies a bit; people know it roughly.
3. **Big or odd things**: a sofa, car repair, flights, a tax bill. Felt as "exceptional" each time.

Sussman and Alter (2012): people forecast ordinary spending fairly well but **underestimate exceptional spending**, spending almost double what they forecast, because each exceptional item is coded as unique ("this was a one-off") even though one-offs keep happening [SA12][SA12-N]. Their fix was to get people to see exceptional items **as a set**. That is exactly the owner's "allowance" idea. It is the research-backed debiasing move, not just a convenience.

### 2.2 A bad month has a reason
JPMorgan Chase Institute: median-income families' spending moves about 29% (about $1,300) month to month [JPMCI-E]; income dips and spending spikes are only weakly correlated (about 0.1) [JPMCI-2]. The US Financial Diaries families had on average 2.2 income spikes and 2.4 dips a year, driven by hours, tax refunds and health [FD]. So most "bad" months are bad for **one** reason. Users narrate them that way ("March was the car"). The app should do the same: label each past month with its reason rather than collapse six months into one extreme.

### 2.3 One-off versus regular
- **Regular**: repeats on a schedule (series) or is part of the everyday stream (many small lines).
- **Lumpy but habitual**: individually rare, collectively regular (gadgets, clothes hauls, trips, repairs). This is the owner's "one new thing every other month". It is not a one-off. Treating it as one is the Sussman-Alter error.
- **True one-off**: genuinely will not recur (wedding, moving house, a $150M property sale). Rare; the user should confirm it.

Today the engine has only two buckets: counted in full, or user-flagged `oneOff` and dropped from the averages and the worst month entirely (`types.ts:47`, `money.ts:129-136`). Flagging the sofa "one-off" makes every later month look better than the user's real life. Not flagging it makes that month the "worst month" and wrecks the verdict (`money.ts:273-286`). Neither matches how the user lives.

### 2.4 The allowance
YNAB's "true expenses" and the sinking-fund tradition spread predictable lumps into monthly amounts [YNAB]. FincWin already has this for **planned** lumps (pots, `pots.ts`, D-101). What is missing is the **revealed** version: what this person actually spends on bigger things, averaged over a year. That number answers the owner's question directly: "I buy one new thing every other month, but I still have an allowance."

---

## 3. Critique of the current engine against that

### 3.1 Three month types, none of them the "normal month"
- `worst`: min income and max spending from different months (`money.ts:273-286`). Not a month anyone lived. FA 4.2.
- `average`: plain mean (`money.ts:291-292`). One lump or windfall moves it. FA 4.3.
- `month` (default since D-107): logged so far plus bills still due, no unlogged everyday spending (`expectedMonth.ts:186-188`). Optimistic early in the month. FA 4.1.
- The default without an override is `worst` unless income is steady (`money.ts:317`), so a gig worker gets permanent red.
- None of the three separates fixed, everyday and lumpy. So none can say "a normal month leaves you $X" and none can produce an allowance.
- The "Judge on" switch (D-107) hands the user a statistics choice they cannot make. Behaviourally it invites shopping for the answer they want (motivated reasoning, the CS06 mechanism): flip to the basis that says "fits".

### 3.2 A one-off cash buy never touches the month
In `assessPlan`, the month test is `left = leftBefore - newMonthly` (`assess.ts:341`), and `newMonthly` is only the monthly payments and running costs. For a $1,800 sofa paid outright, `newMonthly = 0`. The price is tested only against the cash balance and the cushion (`cashAfter`, `assess.ts:342`, warning at about `assess.ts:412`). So:
- The engine never asks the owner's question ("does what's left at the end of the month cover it?").
- The month verdict for a cash buy only reports the month **before** the purchase. If that is already negative, every buy, even a coffee, is `no` (`assess.ts:428-429`). FA 4.4.
- A household with a big balance and a negative monthly flow gets "It fits" for anything under the balance. That is true today and misleading as a habit: they are spending down savings every month.

### 3.3 `leftBefore` is the right shape, built on the wrong inputs
`leftBefore = income - spending - debt - saving/investing - pots` (`assess.ts:203-205`) is close to the owner's "income minus expenses minus other expenses". Keep the formula. Replace what goes into `income` and `spending` (section 4).

### 3.4 Other mismatches with how people decide
- **Saving treated as slack** (`assess.ts` pause block, about lines 395-402): people hold savings in a "harder" account [ST88]; pausing a pension to fund a sofa crosses accounts users keep separate. FA 4.9.
- **Lender lines in the verdict** (`constants.ts`, DSR 36, housing 28): these are underwriting rules on gross pay, not how a person judges a purchase. They add warnings people do not understand (alarm fatigue) and an authority illusion. FA 4.8.
- **All cash is one pot** (`buildSnapshot.ts:395`): ignores the earmarking that is the core of mental accounting [TH99]. FA 4.7.
- **Wait plan uses `leftBefore` as the saving rate** (`wait.ts:30`): on the worst basis that is often 0, so "Over 50 years". On a normal-month basis it becomes a believable date.
- **Confidence "rough" for volatile income** (`confidence.ts:25`) is right, but people with variable pay need the range ("a tight month leaves $120, a normal one $640") more than a label. LA problem 2.
- **Too many figures before the answer**: Scarcity research shows money stress narrows attention (tunnelling) and taxes bandwidth [SCARCITY]. The users who most need Decide are the least able to parse 20 concepts on the Impact step (LA problem 9).

### 3.5 What is already right (keep)
Own data, integer money, pots, cushion scaled by income steadiness, wait-and-save with a date, alternatives with suppressed false savings, estimate-vs-actual learning (FA 3). Declarative voice. These all survive the change below.

---

## 4. Proposed replacement: the "normal month" model

### 4.1 Building blocks (per past full month, last 12 if available, at least 3)
For each month m, split my-share spending into three parts:

```
fixed[m]     = confirmed recurring series (smoothed monthly equivalents, as today, D-23)
lumps[m]     = non-series spending lines that are "big":
               amount >= LUMP_FLOOR (owner decides; suggest the larger of
               15% of median income and 25% of median everyday spend),
               or user-tagged "big buy"; user can untag
everyday[m]  = all other spending (refunds net, floored at 0, as today)
trueOneOff[m]= lines the user confirms "won't happen again" (today's oneOff flag);
               shown, never counted
income[m]    = income as today (smoothed pay, refunds excluded)
```

### 4.2 The normal month (one number, the headline)

```
incomeNormal    = median(income[m])
everydayNormal  = median(everyday[m])
fixedNow        = current confirmed series monthly total (not historical)
committed       = debt minimums + committed saving + pots set-aside
spareNormal     = incomeNormal - fixedNow - everydayNormal - committed
```

Median, not mean, so one strange month does not move it (FA 4.3). `fixedNow` uses today's bills, not last year's, because a new rent counts from today.
Shown as: **"A normal month leaves you $640."** With the sum one tap away: "In $3,200 - bills $1,450 - everyday $910 - set aside $200."

### 4.3 The big-buys allowance (the owner's idea, made measurable)

```
bigBuysRate   = sum(lumps[m] over window) / months in window   (a mean on purpose:
                lumps are rare, so the mean IS the habit; the median would be 0)
afterHabit    = spareNormal - bigBuysRate
```

Shown as: **"You usually spend about $300 a month on bigger things. After that, a normal month still leaves $340."**
- `afterHabit > 0`: the user's big buys are paid from flow and they still save. This is the "I still have an allowance" case.
- `afterHabit < 0`: big buys are eating savings over the year. A fact, said plainly, no "you should".

Optional rolling envelope (owner decides, Q3): `allowanceRoom = bigBuysRate x 12 - lumps in last 12 months`. Lets the app say "this is within your usual big-buy spending this year" or "this would be your third big buy in 4 months".

### 4.4 The tight month (replaces "worst")

```
incomeTight    = 2nd-lowest income in the window (about P20 over 6-12 months)
everydayTight  = 2nd-highest everyday spend (about P80)
spareTight     = incomeTight - fixedNow - everydayTight - committed
```

Lumps are excluded on purpose: the allowance covers them. Shown only as a range beside the normal figure: **"Normal month $640 spare. Tight month $120."** For steady earners the two sit close; for variable earners the gap is the honest uncertainty. Name the month it came from ("like March: low pay"). This replaces the independent min/max in `money.ts:273-286`.

### 4.5 This month (a pace line, not a basis)

```
dayShare        = days left / days in month
everydayLeft    = max(0, everydayNormal - everydayLoggedSoFar)   and at least
                  everydayNormal x dayShare (so heavy early spending is not rewarded)
thisMonthSpare  = income expected - fixedNow - committed - everydayLogged
                  - lumpsLogged - everydayLeft
```

Shown under the headline, never instead of it: "This month so far: $410 of your usual $910 everyday, on track to leave $560." Fixes FA 4.1 by projecting the everyday spending still to come.

### 4.6 The verdict for a purchase of price P (and monthly cost M)

```
cushion        = as today (months of fixed + everyday, by steadiness), user-overridable
cashFree       = cash in spendable accounts - pots saved - bills due before next pay
if M > 0:  monthly test = spareNormal - M  (and spareTight - M shown beside it)

one-off P:
  FROM SPARE    if P <= thisMonthSpare             (and cashFree - P >= cushion)
  FROM SAVINGS  if cashFree - P >= cushion
                rebuildMonths = ceil(P / max(afterHabit, spareNormal_if_no_habit))
  NOT YET       if cashFree - P < cushion
                readyBy = today + ceil((P - (cashFree - cushion)) / afterHabit) months
                (no date if afterHabit <= 0: "not on a normal month")
```

Two-part answer (FA 4.4 done properly): first **this purchase**, then **your month already**, kept apart.

What the user sees first, three lines, nothing else above the fold:

> **Sofa, $1,800: from savings.**
> You'd keep $6,200, above your $5,000 safety money. A normal month refills it in about 5 months.
> Normal month $640 spare · tight month $120 · your big buys run about $300 a month.

Then one fold "How we worked this out" (the sum, the months used with their labels), then the existing alternatives and wait plan. The lender lines, cash path chart, opportunity cost and setbacks move to a "More detail" area.

### 4.7 Month labels (trust and correction)
Each past month gets one label from its biggest deviation from normal:
`normal` · `big buy` (lumps > 0) · `low pay` (income < P20-ish) · `more everyday` (everyday > P80-ish) · `one-off` (user-confirmed).
Shown as a 12-dot strip with the label on tap. The user can retag a line ("this was a one-off", "this was a big buy") and watch the headline move. Control and visible working are the two biggest trust levers in self-assessment tools; letting people correct their own data also catches categorisation errors before they become verdicts.

### 4.8 What stays from the current engine
`leftBefore` shape, pots, cushion by steadiness, pay smoothing, series detection rules (D-25: only confirmed series count), integer money, confidence (now also driven by window length and how many months are labelled), alternatives, wait plan (now fed by `afterHabit`), estimate-bias learning.

---

## 5. What should be cut or demoted

| Cut / demote | Why |
|---|---|
| "Judge on" switch with three bases (D-107) | Replaced by one normal figure plus a tight-month range. A switch invites answer-shopping and lets two screens contradict (LA problem 1). |
| `worst` basis (independent min/max) | No lived month looks like it; one month sets every verdict. |
| Plain-mean `average` | Replaced by median everyday plus mean lumps (the allowance). |
| `month` as a basis | Becomes the pace line (4.5). |
| DSR / housing / owe lines in the headline verdict | Keep as optional "Lender view" detail for loan and property checks only. Not a consumer mental model; generates alarm fatigue (FA 4.8). |
| Saving/investing pause as automatic relief | Make it an explicit "what if I paused saving" alternative, not part of the verdict (FA 4.9). |
| Cash path chart, setbacks, stress, opportunity cost on the first screen | Keep, but in "More detail". Bandwidth [SCARCITY]. |
| The `oneOff` flag meaning "excluded from everything" | Split into "big buy" (counted in the allowance) and "one-off" (confirmed never again). |
| Default 65% "cheaper" anchor | Ask for the cheaper price or show nothing (FA 4.12). |

---

## 6. What the user needs to trust the answer

1. **One answer, never contradicted on the same screen.** One model, one verdict; the range is shown as a range, not as a second verdict.
2. **Visible working in plain words**: in, minus bills, minus everyday, equals spare. Every figure tappable down to the months behind it.
3. **Months they recognise.** Labels that match their memory ("March: car") are the strongest proof the app understood them.
4. **They can correct it.** Retag a line, see the number move.
5. **Honest about what it doesn't know**: "Based on 4 months", "pay varies a lot, so the tight month matters more". Freshness when sync has failed (FA 4.10).
6. **It remembers and checks itself.** After a "bought", a 30-day line: "You expected $1,800; it came to $1,950." Estimate-bias already exists; surface it. A back-test ("three months ago this would have said X") is the best single credibility builder (FA 5.10).
7. **No moralising.** Declarative, no "overspent" for projections (LA problem 4). CFPB's well-being definition gives equal weight to "freedom to make choices to enjoy life" and "capacity to absorb a shock" [CFPB-FWB]: a "yes, from spare" is as valid an outcome as a "not yet".

---

## 7. Open questions the product owner must decide

1. **Big-buy threshold.** Fixed amount, share of income, share of everyday, or category-based? Suggestion: the larger of 15% of median income and 25% of median everyday, user-overridable per line.
2. **Look-back window.** 6 months (today, D-09) or 12? An allowance needs 12 to see seasonal lumps (holidays, insurance). Suggest 12 when available, 3 minimum, label the count.
3. **Allowance as a soft envelope?** Just a rate ("you usually spend $300 a month on bigger things"), or a rolling room that can be "used up" ("this would be your third big buy in 4 months")? The envelope is more powerful and more judgemental.
4. **Should the headline subtract the habit?** Show `spareNormal` (before big buys) or `afterHabit` (after)? Recommendation: headline `spareNormal`, second line `afterHabit`. The owner's words ("I still have an allowance") suggest the habit sits inside the spare, not on top.
5. **What pays for a buy between "from spare" and "from savings"?** If P is 1.5x this month's spare, is it "from savings" or "spread over two months"? Choose one rule and use it everywhere.
6. **Safety money size.** Keep the 3/4.5/6 months by steadiness, or use the JPMCI "about six weeks of take-home pay" starter [JPMCI-2] as the floor for "not yet"? The two answer different questions (full emergency fund vs a working buffer).
7. **Saving: committed or flexible?** Is a pension contribution treated like a bill (never paused) and a holiday pot like spare? Needs a per-line choice (FA N10).
8. **Lender lines.** Remove from buy checks entirely, or keep as an opt-in "lender view" for loan and property checks only?
9. **Household.** Is the normal month computed on my share or on the household? The allowance in particular is personal; a couple's big buys often belong to one person.
10. **Windfalls.** Treat bonus and tax-refund income the way lumps are treated on the spending side (spread into an annual rate), or leave them out of `incomeNormal` because the median already ignores them? Thaler's evidence is that windfalls get spent more freely [TH99]; spreading them would license that.

---

## 8. Sources

Fetched in this session (search results read; full papers not re-opened unless stated):
- [TH99] Thaler, Mental Accounting Matters, J. Behavioral Decision Making 12 (1999), via summaries: https://corporatefinanceinstitute.com/resources/management/mental-accounting/ and windfall follow-up https://openjournals.libs.uga.edu/fsr/article/view/3413
- [ST88] Shefrin and Thaler 1988, The Behavioral Life-Cycle Hypothesis (abstract; cited in FA): https://ideas.repec.org/a/oup/ecinqu/v26y1988i4p609-43.html
- [SA12] Sussman and Alter 2012, The Exception Is the Rule, J. Consumer Research 39(4): https://cdn.vanderbilt.edu/vu-my/wp-content/uploads/sites/3367/2020/02/09190157/Sussman_2012_JCR.pdf ; abstract https://ideas.repec.org/a/oup/jconrs/doi10.1086-665833.html
- [SA12-N] NYU Stern summary ("almost double" on exceptional expenses): https://stern.nyu.edu/experience-stern/faculty-research/adam-alter-exceptional-expense
- [HS96] Heath and Soll 1996, Mental Budgeting and Consumer Decisions, JCR 23(1): https://ideas.repec.org/a/oup/jconrs/v23y1996i1p40-52.html
- [CS06] Cheema and Soman 2006, Malleable Mental Accounting, J. Consumer Psychology 16(1); press summary: https://source.washu.edu/2005/04/how-people-trick-themselves-into-overspending-2/
- [PL98] Prelec and Loewenstein 1998, The Red and the Black, Marketing Science 17(1) (pain of paying, coupling; supports "which pot pays"): https://ideas.repec.org/a/inm/ormksc/v17y1998i1p4-28.html
- [JPMCI-2] JPMorgan Chase Institute, Weathering Volatility 2.0: https://www.jpmorganchase.com/institute/all-topics/financial-health-wealth-creation/report-weathering-volatility-2-a-monthly-stress-test-to-guide-saving
- [JPMCI-B] JPMorgan Chase Institute, volatility and cash buffer report (spike about once every 4 months): https://jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/institute/pdf/institute-volatility-cash-buffer-report.pdf
- [JPMCI-E] JPMorgan Chase Institute, Why managing expenses is not an easy task (29%, about $1,300 monthly swing; 4 in 10 families with a $1,500+ extraordinary payment) [also JPMCI-3]: https://institute.jpmorganchase.com/institute/research/household-income-spending/why-managing-expenses-is-not-an-easy-task
- [FD] Morduch and Schneider, US Financial Diaries (2.2 spikes and 2.4 dips a year): https://www.stlouisfed.org/~/media/Files/PDFs/Community%20Development/Econ%20Mobility/Sessions/MorduchPaper508.pdf ; https://nextcity.org/urbanist-news/financial-diaries-book-stability-mobility
- [LST11] Lusardi, Schneider and Tufano 2011, Financially Fragile Households (about half could not or probably could not raise $2,000 in 30 days): https://www.nber.org/papers/w17072.pdf
- [SHED] Federal Reserve, SHED 2025 release (63% could cover $400 with cash or equivalent): https://www.federalreserve.gov/newsevents/pressreleases/other20260513a.htm
- [CFPB-FWB] CFPB, Financial well-being digest (four elements): https://files.consumerfinance.gov/f/201501_cfpb_digest_financial-well-being.pdf
- [YNAB] YNAB, non-monthly / true expenses: https://www.ynab.com/non-monthly-expenses-for-your-budget
- [PG] PocketGuard "In My Pocket" (income minus bills, goals and necessities, paced over days left): https://www.thepennyhoarder.com/budgeting/pocketguard-review/ ; https://www.cnbc.com/select/pocketguard-budgeting-app-review/
- [SIMPLE] Simple bank Safe-to-Spend (balance minus pending, upcoming bills and goals) and its loss: https://www.pcworld.com/article/402233/simple-review-budgeting-financial-app.html ; https://americanbanker.com/news/the-fintechs-stepping-into-the-void-left-by-simple
- [SCARCITY] Mullainathan and Shafir, Scarcity (tunnelling, bandwidth tax), via summary: https://en.wikipedia.org/wiki/Scarcity:_Why_Having_Too_Little_Means_So_Much . The 2012 Science paper (Shah, Mullainathan, Shafir) is from memory, not re-opened.

Note on competitors: PocketGuard and Simple answer "what can I spend now" from balance and bills. Neither separates lumpy habits from everyday spending, and neither answers "can I afford this specific item". The normal-month plus allowance model is a genuine gap, not a copy.

Not verified: any published UX study measuring trust gains from month labelling or retagging. The claim in 4.7 is a design inference from the mental-accounting literature and should be tested with the 5-user protocol in LA 1.5.
