# Decide rebuild: the agreed plan (panel chair)

Branch `phase/05-decide-ui` (PR #82), worktree `C:\dev\fincwin-p5`, 2026-10-25. Read-only synthesis: no code, catalogue or git changed.
Inputs: panel seats 01 (behavioural economist), 02 (statistician), 03 (financial planner), 04 (architect), 05 (product designer), 06 (risk and compliance); FINANCE-AUDIT (FA), LANGUAGE-AUDIT (LA); 05-CONTEXT (D-xx), 04 D-47 (one-off lines). Code facts below were re-checked in `src/engine/decide` and `src/features/decide` and cited by file:line.

## 1. Plain-English summary

1. People ask "can I afford it?" to find out if they will still be OK at the end of the month, and later.
2. The answer starts from one number: **what a normal month leaves you**. That is money in, minus bills, minus everyday spending, minus your usual big buys, minus what you put aside.
3. A normal month is your middle month, so one strange month cannot move it.
4. Big buys (a sofa, a repair, a new gadget) are not "bad months". They become a **big-buy allowance**: what you really spend on bigger things, spread over the year.
5. A **tight month** is a real month from your past: your second-lowest of the last six.
6. **This month** is a projection to month end. It counts the everyday spending you have not done yet.
7. A purchase is paid from one of four places: this month's money, savings above your safety money, your safety money, or nothing. The answer names which.
8. If your month is already short, the app says that once, separately. A $5 coffee is not blamed for a $310 gap.
9. One answer, one sentence, then two or three facts, then one "See the working" layer. The "Judge on" switch goes.
10. Today's app has real bugs that give a wrong "fits". The worst ones get fixed now, in PR #82. The new engine is built next to the old one in a new phase 05.1, proven equal first, then changed one rule at a time.
11. No database change is needed.

---

## 2. The one model

### 2.1 Definitions (signed by all six seats)

| Term (user word) | Definition |
|---|---|
| **Full month** | A calendar month whose coverage starts on or before the 1st (`fullMonths.ts:31-55`) **and** is not flagged under-logged (2.4). |
| **Bills** | Lines of a confirmed series. The forecast uses **today's schedule** (monthly equivalent of each series' latest amount, D-23 smoothing), not history. |
| **Pay** | Confirmed pay series, monthly equivalent (D-60). **Other income** = non-series income, refunds and one-off-flagged lines excluded. |
| **Everyday** | Every non-series, non-transfer spending line that is not a big buy and not flagged one-off. |
| **Big buy** | A non-series spending line whose my-share amount is at least `BIG_BUY_SHARE` (25%) of the median month's non-series spending, and that is not a recurring look-alike (same category, amount within ±15%, in at least 2/3 of months, n ≥ 3). OWNER DECISION 2. |
| **One-off (won't happen again)** | A line the user flagged `one_off` (04 D-47, existing column). Shown, never counted anywhere, including the allowance. |
| **Big-buy allowance** | Average big-buy spending per month over up to 12 months. A mean on purpose: big buys are rare, so the median is 0. |
| **Set aside (committed)** | Debt minimums + saving and investing + pots set-aside (D-101). Subtracted in every month figure, as `leftBefore` does today (`assess.ts:203-205`). |
| **Flexible saving** | Saving the user marks pausable. Never paused inside the verdict; offered as an "if" in Other ways. OWNER DECISION 10. |
| **What's left / normal month** | Normal pay and income − bills − normal everyday − allowance − set aside. The headline figure. |
| **Tight month** | Second-lowest of the last 6 paired months (income and everyday from the same month), minus allowance and set aside. |
| **This month (projected)** | Logged so far + confirmed items still due + everyday still to come at your own pace, to the last day of the month. A line, not a basis. |
| **This month's money** | What this month can put toward a purchase: max(0, this month left) + this month's unused big-buy room. |
| **Safety money** | User's figure, or months × (bills + normal everyday + debt minimums). Months by how much your money left swings: 3 / 4.5 / 6. OWNER DECISION 11. |
| **Month-end cash** | Spendable cash now (pots saved removed, D-101) plus income still due, minus everything still to go out this month on the projection. |

### 2.2 Formulas (integer-safe; bigint minor units; `divideHalfUp` is the only rounding, D-21)

```
# constants (constants.ts, each with a cite or "FincWin choice" tag, I21)
WINDOW_NORMAL = 6; WINDOW_BIG = 12; BIG_BUY_SHARE_PCT = 25; BIG_DIVISOR_FLOOR = 4   # JPMCI: a spike about every 4 months
UNDERLOGGED_PCT = 50; SPREAD_FLOOR_PCT = 5; SAFETY_HALF_MONTHS = {low:6, mid:9, high:12}

# per full month m, newest first, my share via summariseMonth rules (refunds net, paid only, transfers out, D-34)
nonSeries_m = Σ non-series out lines (not one_off)
Mmed        = median(nonSeries_m over last ≤6)
big(line)   = !series && !one_off && 100*mine(line) >= BIG_BUY_SHARE_PCT*Mmed && !recurringLookalike(line)
big_m       = Σ big lines;  every_m = nonSeries_m − big_m;  inc_m = smoothed pay + other income
underLogged(m) = n >= 3 && 100*every_m < UNDERLOGGED_PCT*median(every)      # excluded until the user confirms

# normal month
F      = Σ myPart(monthlyEquivalent(latestAmount)) over confirmed bill series
I      = paySeries ? Σ monthlyEquivalent(confirmed pay) + median(otherInc_m, ≤6) : median(inc_m, ≤6)
E      = median(every_m, ≤6)
A      = divideHalfUp(Σ big_m over ≤12, max(nBig, BIG_DIVISOR_FLOOR))        # nBig = full months seen, ≤12
C      = debtMinimums + saving + investing + potsSetAside
normalLeft = I − F − E − A − C

# tight month (paired: same month's income and everyday, today's bills)
R_m    = inc_m − F − every_m ; R = sort ascending over last ≤6
tightR = n >= 4 ? R[1] : n >= 2 ? R[0] : none          # n 2-3: "your lower month", flagged
tightLeft  = min(tightR − A − C, normalLeft)            # order guaranteed (I15)
tightMonth = the month that gave tightR (named in copy, with its reason)

# this month, as of day d of N
Erest   = max(divideHalfUp(E*(N−d), N), max(0, E − Elogged))     # own pace, or catch-up; never "spending stops"
Uthis   = max(A, Ulogged)
monthLeft  = IloggedPaid + IdueConfirmed − Flogged − Fdue − Elogged − Erest − Uthis − C
bigRoom    = max(0, A − Ulogged)
monthMoney = max(0, monthLeft) + bigRoom
# pending income is not received (R3); logged one-off income is not counted

# cash
cashNow     = spendable cash − pots saved (D-101) − dueNow
monthEnd    = cashNow + IdueConfirmed − Fdue − Erest − (C still to go this month)
safety      = userSafety ?? divideHalfUp((F + E + debtMinimums) * halfMonths(spreadBand), 2)
essentials1 = F + E + debtMinimums                          # one month, the "heavy" line
cash path (90 days): Erest spread over this month's days left, then (E + A)/month spread daily, bills dated;
                     this month's bigRoom is not also spent (the purchase stands in for it, G3)

# spread and confidence (replaces income CV, money.ts:294-315)
mad(xs)   = median(|x − median(xs)|)
spread    = max(divideHalfUp(14826*mad(R), 10000), divideHalfUp((F+E)*SPREAD_FLOOR_PCT, 100))
ratioPct  = 100*spread vs (F+E) compared as integers; bands <=10 low, <=25 mid, else high
```

### 2.3 Minimum-data rules

| Full months | Normal | Tight | Allowance | Answer | Confidence (headline carries it below firm, R20) |
|---|---|---|---|---|---|
| 0, rough figures typed (D-03) | from the three rough figures | not shown | 0, "not enough months to see your big buys" | same judge, same table | Rough, "your own figures" |
| 0, nothing typed | none | none | none | `not_enough` | none |
| 1-2 | median (= mean of 2) | n=2: lower month, flagged; n=1 none | Σ ÷ 4 | same judge, cautious figures (R1) | Rough, "{n} months logged" |
| 3-5 | median | 2nd-lowest (n≥4) / lowest (n=3) | Σ ÷ max(n,4) | full | Fair at best |
| 6-12 | median of last 6 | 2nd-lowest of last 6 | Σ ÷ n over ≤12 | full | Firm possible: n ≥ 6, ratio ≤ 10%, big buys ≤ 50% of non-bill spend, no stale data |
| 12+ | as above | as above | rolling 12; "last December's big buys" shown as a hint only | full | as above |

Confidence = the lowest of: history level above; this-month completeness (never Firm before day 20 or before logged everyday reaches half of `E`, R8); freshness (unsaved writes > 0 or a balance older than N days drops one level, R7).

### 2.4 Where the seats differed, and the panel default

| Question | Options put forward | Panel default and why |
|---|---|---|
| Centre for income and everyday | mean (today); median (01, 02, 03, 05, 06); trimmed mean | **Median.** 50% breakdown point; explainable in one sentence; a $150M month changes nothing. |
| Centre for the allowance | median (would be 0); mean (01, 02, 04); user-set spending money (03) | **Mean over up to 12 months, divisor floor 4.** The habit is the rate. User override later. OWNER DECISION 3. |
| Tight month | min+max of different months (today); 2nd-lowest income + 2nd-highest spending separately (04, FA 4.2); paired P20 interpolated (02); paired 2nd-lowest (03, 05) | **Paired 2nd-lowest of 6.** Equals P20 at n=6, is a month the user lived and can name, keeps the real (weak, ~0.1) correlation of shocks. Separate extremes rebuild today's fault. OWNER DECISION 6. |
| Big-buy threshold | max(15% income, 25% everyday) (01); 25% of median non-bill (02); >10% of everyday or treat categories (03); back-test-tuned share (04) | **25% of median non-bill month, look-alike excluded, tuned by back-test before ship.** No categories (keeps D-100). OWNER DECISION 2. |
| Allowance as a rate or a balance | rate (02, 04, 06); rolling envelope (01 option); rollover spending money (03); "spare built up" ledger (05) | **Rate, with this month's unused room.** Built-up spare already sits in cash, so "savings above safety money" is the built-up pot; a second ledger double counts (03 P2, 06 G3) and a countdown raises spending (06 G4). OWNER DECISION 3. |
| Can the purchase draw on the allowance | yes (02, 03, 04, 06 with rule); stricter no | **Yes, this month's unused big-buy room only.** The item is itself a big buy; testing it on top of the allowance counts it twice. OWNER DECISION 4. |
| Headline before or after allowance | before, allowance second line (01); after (02, 03, 04, 06) | **After.** "What's left" must not include money the user habitually spends; the allowance is shown on its own line. OWNER DECISION 5. |
| Window | 6 (today, D-09); 12 (01) | **6 for normal/tight, 12 for the allowance.** Medians need recency; lumps need a year. The snapshot already reads 12 (`buildSnapshot.ts:145`). OWNER DECISION 7. |
| Normal income | median income (01); pay schedule + median other (02); variable earners: baseline 2nd-lowest (03) | **Pay schedule + median other income.** Forward-looking like bills; variable earners are covered by the tight month in the headline (R18). OWNER DECISION 8. |
| Minimum data | answer from month 1, rough (02); `not_enough` below 3 well-logged months (06) | **Answer from month 1 with rough in the headline and cautious figures; first read kept (D-03).** OWNER DECISION 9. |

---

## 3. The judge

### 3.1 Inputs and order

`P` = my share of the day-one cost (plan.ts, `myPart`). `M` = my share of new monthly payments + running costs (D-62). One pure function `judge(model, cash, purchase, limits) → CoreResult`, O(1), run once; normal and tight are judged together in the fast path (no idle-time re-runs, ends `computeCheck.ts:311-322`).

```
paidFrom (one-off part P):
  fromMonth  = min(P, monthMoney)
  rest       = P − fromMonth
  if monthEnd − P >= safety:          pool = rest == 0 ? 'month' : 'savings_above_safety'
  elif monthEnd − P >= 0:             pool = 'safety_money'   (amount = safety − (monthEnd − P))
  else:                               pool = 'not_covered'
  # the cash test governs the label: the label never claims a better pool than cash allows (fixes 03 P1)
refill = rest > 0 && normalLeft > 0 ? ceilDiv(rest, normalLeft) months : null
readyBy (if pool is safety_money/not_covered) = normalLeft > 0 ? ceilDiv(P − max(0, monthEnd − safety), normalLeft) : null
```

### 3.2 Precedence (one place, `combine()`); "month already short" is split from "this purchase"

| # | Code | Condition | legacyState |
|---|---|---|---|
| 1 | `not_enough` | no full month and no rough figures | missing |
| 2 | `cash_short` | P > cashNow, or 90-day low point after P < 0 | no |
| 3 | `already_short` | normalLeft < 0 **before** the purchase. Second line reports only what the purchase changes (M, pool for P) | no if M > 0 or pool ∈ {safety, not_covered}; else adjust |
| 4 | `month_short` | M > 0 and normalLeft − M < 0 | no |
| 5 | `into_safety` | pool = safety_money. Heavy if monthEnd − P < essentials1 | heavy: no; light: adjust |
| 6 | `fits_not_tight` | M > 0 and tightLeft − M < 0 ≤ normalLeft − M | adjust |
| 7 | `over_limit` | a line the **user set** is passed (default 28/36/12 are facts, not gates, OWNER DECISION 14) | adjust |
| 8 | `fits_savings` | pool = savings_above_safety | fits if refill ≤ 12; adjust if refill > 12 or null |
| 9 | `fits` | pool = month (one-off) and, if M > 0, both normal and tight stay ≥ 0 | fits |

"This month is heading short" (monthLeft < 0 while normalLeft ≥ 0) is a **notice line** above any code, never a code: "October is heading about $310 short, mostly the $640 car repair." It removes `monthMoney` except the big-buy room. Flexible-saving pause never closes a gap inside the verdict; "If $X a month of saving paused" appears in Other ways (supersedes the D-35 relief and D-105 wording; OWNER DECISION 10).

### 3.3 One result code → one copy row (chip, title, body; surface may only choose the body variant)

Rounded to whole currency units in headlines. `{conf}` appends " · on rough figures ({n} months logged)" or " · fair estimate" whenever confidence is below Firm (R20). Banned everywhere: should, recommend, advice (footer key only), go ahead, you can, safe, free (money sense), spendable, allowance to spend, approved.

| Code | Chip | Title | Body / facts |
|---|---|---|---|
| `fits` (one-off) | Fits this month | Fits in this month's money{conf}. | "October is on track to leave about {monthLeft} after the everyday spending still to come." |
| `fits` (monthly) | Fits | Fits a normal month and a tight one{conf}. | "After {M} a month, a normal month leaves about {a}; a tight month like {tightMonth} leaves {b}." |
| `fits_savings` | Fits, from savings | Fits, with {rest} from savings{conf}. | "Savings stay {x} above your {safety} safety money. A normal month puts it back in about {refill} months." / >12 or null: "A normal month doesn't put it back." |
| `fits_not_tight` | Fits a normal month | Fits a normal month. A tight month like {tightMonth} ends {short} short{conf}. | "{tightMonth}: {reason}. {k} of your last 6 months were like it." |
| `over_limit` | Passes one of your lines | Fits the month. Debt payments would be {pct}% of take-home, over the {line}% you set. | — |
| `into_safety` light | Uses safety money | Uses {x} of your safety money{conf}. | "Cash would be {after}, under the {safety} kept aside. Without touching it: about {readyBy}." |
| `into_safety` heavy | Not covered yet | Not covered yet: leaves under a month of safety money. | "Cash would be {after}, about {weeks} weeks of bills and everyday. Covered without it about {readyBy}." / null: "A normal month doesn't build toward it." |
| `cash_short` | Cash doesn't cover it | Cash doesn't cover it: {x} short{ before payday on {date}}. | "Spread over {k} months it would be {m} a month." (only if a plan exists) |
| `month_short` | Doesn't fit a normal month | Doesn't fit a normal month: {short} short each month. | "A normal month leaves {a} now; this adds {M}." |
| `already_short` | Month already short (neutral tone) | A normal month already ends about {x} short. | Line 2: "This purchase adds {M or nothing} a month" + pool line "Paid from savings, cash would be {after}." Red only if pool is safety/not covered. |
| `not_enough` | Not enough yet | No full month logged yet, so there is no normal month to judge on. | "Logged so far: {days} days. Rough figures give a first answer." (link to the existing sheet; OD 9b raises the bar to 3 months) |

### 3.4 Normal vs tight disagreement in the headline

The tight month is part of the rule, not a second card. When they disagree the code is `fits_not_tight` and the **title** says both. For one-offs the tight month never changes the code; when `tightLeft ≤ 0` the refill fact reads "In a tight month like {tightMonth}, nothing goes back." A green title can never sit over a red row because no second verdict exists.

---

## 4. What the user sees

### 4.1 Answer screen

```
┌──────────────────────────────────────┐
│ ‹  Laptop · $1,200            ⋯      │  ⋯ = Change details · Discard
│                                      │
│  Fits, with $229 from savings.       │  title (code fits_savings)
│  October's money covers $971.        │  body line 1 (pool split)
│  ─────────────────────────────────── │
│  Safety money after   3.4 months     │  fact 1
│  Back in              about 1 month  │  fact 2 (refill or ready-by)
│  A normal month       about $890     │  fact 3 (tight added if it differs)
│  ─────────────────────────────────── │
│  Fair estimate · 4 months logged     │  plain line, reason in the working
│  Includes about $419 of everyday     │  the projection, named (06 copy 4)
│  spending expected by Oct 31.        │
│  See the working                  ›  │
│ [ Record as bought ] [ Save the plan ]│
│        Record as not buying          │
│ Worked out from your own records. A record-keeping and planning tool, not financial advice. │
└──────────────────────────────────────┘
```

Facts are chosen by code: one-off → safety after (months), refill/ready-by, normal month; monthly → normal after, tight after, total cost (financed/running only); already_short → "This adds", pool, "Months like this: k of last 6".

### 4.2 "See the working" (one level, no ⓘ, sections open/closed, first open)

1. **Your months**: six dots and a list. `●` normal, `○` tight, `◑` normal + big buy, `▽` low pay, `·` under-logged, `–` left out. "Normal = the middle month: $890. Tight = second-lowest: $120 (July: low pay)."
2. **A normal month, line by line**: In − bills − everyday − big buys (about $X a month) − set aside = left. "October so far: $410 of your usual $910 everyday, on track to leave $560."
3. **Where the money comes from**: the pool split; "Up to $971 fits in this month's money; up to $2,281 without using safety money" (bisect, kept).
4. Cash day by day (90-day path, shown only when it bites by default), Other ways (cheaper only with a typed price, wait plan, monthly, pause flexible saving, 48 h cooling-off), Your lines (28/36/12 labelled "rules of thumb lenders use" until set), If something goes wrong (setbacks, stress, income at risk), Total cost over time (TCO, invested instead with a typed rate), What this assumes (assumption register, freshness, currency).

Feature levels (four onboarding levels) gate sections 4+; sections 1-3 are always shown.

### 4.3 Month dots and retagging

Tap a month → its lines with labels. Controls, all using existing data:
- "Leave it out (won't happen again)" / "Count it" → toggles the existing `one_off` flag (04 D-47). Headline recomputes visibly.
- "Looks like a regular bill. Add it as one?" → creates a series (better data, moves it to Bills).
- "This month looks under-logged. Count it?" → device hint, no schema.
- "This isn't a big buy" override needs storage: deferred (OWNER DECISION 2c); until then the line can be left out or added as a bill.

### 4.4 Judge-on, the 5-step flow, Impact, home

- **Judge-on (D-107): retired.** Picker removed from the card and Month details. `judgeOn` device store deleted; `settings.basis_override` column kept, no longer read (no migration). OWNER DECISION 13.
- **5-step flow:** quick field ("sofa 1200") goes straight to the answer. "Change details" opens one screen (price, pay all at once / monthly, running cost if the item type has one; tax, trade-in, rate under "More details"). Step 4 becomes Other ways; Step 5 becomes the three record buttons, keeping the D-09 "What gets written" confirm and D-66. OWNER DECISION 15.
- **Impact step:** replaced by the answer screen; its 10 folds become the working sections; size eyebrow, key-figure trio, three-basis card, Rough pill+ⓘ removed.
- **Home figure:** "A normal month leaves you about $890" + six dots + "4 normal · 1 tight · 1 big buy" + the quick field. No allowance countdown, no "free", no In/Out line (moves to the working). Home and check read the same `CoreResult` (fixes `homeCardModel.ts:96`).

---

## 5. Keep / change / advanced / delete

| Module or UI piece | Fate | Note |
|---|---|---|
| plan.ts, engine/payoff, series.ts, share.ts, pots.ts, currency.ts, cardRule, marketDefaults, estimateBias, runningCostPrompts | **Keep** | inputs and depth |
| money.ts `summariseMonth` | **Change** | returns line classes (bills/everyday/big/one-off) |
| money.ts `deriveMoney` (mean, min/max, CV, default basis :273-317) | **Delete → month/** | median, paired tight, allowance, spread |
| expectedMonth.ts | **Change** | keep `stillDueCount` matching; add Erest; pending income not received; drop the duplicated leftBefore (:200-218) |
| assess.ts `prepareContext` / `assessPlan` / `purchaseSize` | **Delete → judge/ + combine()** | dsr/housing/owe/cushion become small pure limit functions |
| position.ts, futureChanges.ts | **Change → position adapters** | run before the judge; may only lower figures |
| cashPath.ts | **Change** | spread Erest then E + A; keep dip classification |
| reserve.ts | **Change** | base = bills + everyday + debt; months by spread band; heavy grade |
| confidence.ts | **Change** | spread-based, min with month completeness and freshness, reasons in full |
| firstRead.ts | **Change** | becomes a MonthModel from rough figures; own state machine (:57-67) deleted |
| decision.ts, margins.ts | **Change** | margins become facts ("$81 above your safety money") |
| alternatives.ts, wait.ts, options.ts, bisect.ts, ownership.ts | **Keep, re-fed** | saving rate = normalLeft; cheaper only with typed price (65% default dropped) |
| setbacks.ts, stress.ts, incomeAtRisk.ts, investmentViews.ts, payback.ts | **Advanced** | depth plug-ins; never return a code |
| constants.ts DSR/housing/unsecured lines | **Advanced** | facts unless user-set |
| types.ts | **Change** | AssessContext-only types removed; one meaning per field |
| snapshot/buildSnapshot.ts, checkInputs, conversion, fullMonths | **Keep** | add under-logged inputs; `basisOverride` stops being read |
| snapshot/computeCheck.ts | **Change** | one core run; delete `basisOutcomesOf`/`EngineRun` and most D-88 carry-over |
| copy/verdictCopy, quickCopy, warningCopy, basisKey, keyFiguresCopy | **Delete → copy/verdictTable.ts** | one row per code |
| HomeSummaryCard, JudgeOnControl, YourMonthCard picker | **Change / delete** | home figure + dots; picker gone |
| VerdictCard, BasisOutcomeCard, step3Folds, Step3Verdict | **Delete → AnswerScreen + Working** | |
| QuickResult | **Change** | same AnswerScreen, compact |
| Step1/Step2 | **Change → Change-details screen** | |
| Step4Alternatives, Step5Decision | **Change** | Other ways section; record buttons |
| "Lines you will not cross" home row | **Advanced** | "Your lines" in the working |
| "With other checks" pill | **Change** | off by default; one line in the working |

---

## 6. Safety rules

### 6.1 Invariants (fast-check inside `engine/`, plus copy tests; CI fails on any)

Error policy and data
- **I1 Asymmetric error** (06 R1): on thin data, `V(thin) ≤ V(same data treated as full)`.
- **I2 No zero-spend projection** (06 R2): projected everyday for any remaining period ≥ `E × daysLeft ÷ N`; day 1 with no lines gives this-month spending ≥ normal; every cash-path month spreads ≥ E.
- **I3 Uncertain income is not cash** (06 R3): removing an unpaid income occurrence or a pending income line never improves V.
- **I4 Split before/after** (06 R4): when normalLeft < 0 the result carries `already_short` and a separate purchase delta.
- **I5 Not enough data** (06 R5, as decided in OD 9): with no month and no rough figures, `not_enough`; with < 3 months, V is never `fits` without the rough condition in the title.
- **I6 Logging coverage** (06 R6): a month with only bill lines, or everyday under 50% of median, is not used until confirmed.
- **I7 Freshness** (06 R7): unsaved writes > 0 → confidence never Firm; the answer carries a freshness line.
- **I8 Confidence reflects the projection** (06 R8): before day 20 or before half of E is logged, never Firm.

Monotonicity and robustness
- **I9 Cheaper never worse** (R9). **I10 Expense never helps** (R10). **I11 Income never hurts** (R11). **I12 Less cash never helps** (R12). **I13 Ready-by never earlier when price rises** (R13).
- **I14 Bounded influence** (02, R14): adding one big line of any size changes E, normalLeft + A and tightLeft + A by 0, and A by exactly amount ÷ max(nBig, 4) (± half a unit); scaling one month's income by any factor moves I by no more than the gap between neighbouring order statistics.
- **I15 Order** (02, R15): tightLeft ≤ normalLeft always.
- **I16 Determinism** (R16): same months in any order give identical output; no clock read in `engine/`.
- **I17 Money preserved** (04): bills + everyday + big + one-off = today's `summariseMonth` spending, exactly.
- **I18 Nothing disappears** (06 G2): Σ big lines over the window = A × divisor (± rounding); only `one_off` lines are left out, and they are listed.
- **I19 No double count** (06 G3): the purchase uses only `bigRoom` of the allowance; monthEnd and monthMoney never add the same income twice; the cash path does not spend bigRoom and the purchase both.
- **I20 Adapters only lower** (04): position adapters never raise any `left` or cash; `combine` is monotone (stricter input never gives a looser code).
- **I21 Projection monotone** (02): logging more everyday never raises monthLeft; a due bill lowers it by exactly my share.

Output consistency and governance
- **I22 One code, one text** (04, R17): chip, title, tone come from the code alone; for every code × surface × pool, `claims(keys)` holds no opposite pair (cash_ok/cash_not_ok, month_ok/month_not_ok).
- **I23 Disagreement surfaces** (R18): normal and tight differ for M > 0 ⇒ title key is the `fits_not_tight` split variant.
- **I24 Severity graded** (R19): two safety-money breaches in different grades map to different titles.
- **I25 Condition in the title** (R20): every title below Firm carries `{conf}`; every bare "Fits" key is banned.
- **I26 Copy guard** (DCU-09 + 06 §5): BANNED/REASSURING/IMPERATIVE_LEAD plus `/\bfree\b/`, `/\bsafe\b/`, `/\byou can\b/`, `/\bspendable\b/` over `verdictTable` keys.
- **I27 Assumption register** (R21): every exported constant has a cite or "FincWin choice" comment and appears in "What this assumes".
- **I28 Back-test** (R22, 02 §6): persona set (salaried, gig, seasonal, partial logger, couple, new user, $150M month); share of held-out months below tightLeft in 10-30%; false-yes rate never above legacy. Reviewed by a non-author with the persona diff (R23).
- **I29 No silent fallback** (R24): every fallback branch emits a reason code that the copy names.

### 6.2 Bugs to fix regardless (verified in code)

| # | Bug | Where | Fix slice |
|---|---|---|---|
| B1 | "This month" counts logged + still-due only; no everyday still to come. On day 3 almost anything fits. | `expectedMonth.ts:185-188`, overlay `assess.ts:182-185`; default `'month'` `judgeOnStore.ts:43` | A2 |
| B2 | Cash path spreads `spendingBasis − seriesMonthly`, floored at 0. On the default basis that equals only the everyday already logged this month: about zero for the first days, never a full month, for all 90 days. Settles 02/06 vs FA: both true, the floor makes it a total omission early in the month. | `cashPath.ts:184-185` | A3 |
| B3 | A cash purchase is never tested against the month: `left = leftBefore − newMonthly`, and `newMonthly` excludes day-one. | `assess.ts:340-341` | 05.1 (judge) |
| B4 | A month already short makes every purchase `no`, even $5. | `assess.ts:428-429` | A1 (copy split now), 05.1 (code) |
| B5 | Confidence ignores the basis: history months only, so a day-3 partial month can read Strong. | `assess.ts:559`, `confidence.ts:27` | A2 |
| B6 | Chip from the surface, not the cause: every quick-cash `no` reads "Not from cash" beside "Cash covers it". | `verdictCopy.ts:27` vs `noLead` `:45-50` | A1 |
| B7 | Size label is a separate axis ("Out of this month's spare" beside a red `no`; "from spare" while savings pay part). | `assess.ts:299-303` | A1 (derive from state), 05.1 (`paidFrom`) |
| B8 | "Cushion" key figure is the runway; "A month: None" is a new monthly cost of 0. | `keyFiguresCopy.ts:85`, `:60-61` | A1 |
| B9 | Worst = min income and max spending from different months. | `money.ts:273-286` | 05.1 |
| B10 | Average is a plain mean ($150M month → $25M "average"). | `money.ts:291-292` | 05.1 |
| B11 | Pending income counted as paid; logged one-off income counted in this month. | `expectedMonth.ts:137`, `:186` | A2 |
| B12 | DSR/housing on the month basis divide by income received so far (false no before payday; "516.63%"). | `assess.ts:352-375` with overwritten `incomeBasis` | A2 (use history income for lines) |
| B13 | Safety-money breach not graded ($1 and $26,000 both amber). | `assess.ts:412-414` | A1 (copy grade), 05.1 |
| B14 | Headline and three-basis card from different runs; home figure ≠ the check's before. | `computeCheck.ts:311-322, 356`; `homeCardModel.ts:96` | 05.1 |
| B15 | Body "in $X" ≠ month table "in" after a future change. | `verdictCopy.ts:109` vs `assess.ts:477` | 05.1 |
| B16 | Double reading: received pay sits in both `leftBefore` and cash; the label says "from spare" while cash pays. | `assess.ts:203-227` | 05.1 (cash test governs label, I19) |

---

## 7. Delivery plan

### 7.1 Slice A: inside PR #82 (about 5 engineer-days)

| # | Contents | Effort |
|---|---|---|
| A1 | **Copy table adapter**: `verdictCode(assessment)` from today's Assessment → `VERDICT_COPY`; chip from cause (B6); size label derived from state, never contradicting it (B7); "Cushion" → "Cash lasts", "A month: None" → "No monthly cost" (B8); already-short split copy "Your month before this / This purchase adds" (B4, FA 4.4); graded safety-money copy (B13); headline names the basis; no-contradiction property test (I22) | 3 d |
| A2 | **Projection fix**: Erest in `expectedMonthMoney` with `E` = median of (month spending − smoothed bills) over full months; pending income not received; one-off income not counted (B1, B11); confidence capped at Fair on the month basis before completeness (B5); lines use history income on the month basis (B12) | 1.5 d |
| A3 | **Cash-path floor**: spread ≥ typical everyday on every basis (B2) | 0.5 d |
| A4 | **Re-baseline**: device hint `seenEngine: 2` so changed open checks do not light "Changed since you looked" (`homeRowsModel.ts:33-36`); release note line | 0.5 d |

A1-A4 change verdicts on purpose; golden files updated with a reason per fixture. Everything else waits for 05.1.

### 7.2 Phase 05.1: the engine (about 33 days, 1 engineer; ~4 weeks with 2)

| # | Slice | Days |
|---|---|---|
| S0 | Characterize: freeze outputs of 18+ prototype scenarios, ~300 seeded fast-check snapshots and 12 life fixtures (owner's two cases, $150M month, gig, thin data, day-3 laptop, $5 coffee in a short month, early payday, household, partial logger) × 3 bases | 2 |
| S1 | `engine/decide/month/` (classify, past, scenarios, thisMonth); not wired; I14-I18, I21 | 5 |
| S2 | `engine/decide/judge/` + `combine()`, limit functions pulled out of assessPlan; **LEGACY knobs** (`centre: mean`, `tight: extreme`, `bigBuys: off`, `projectEveryday: false`, `grading: false`) reproduce today exactly to the minor unit | 6 |
| S3 | Shadow run in computeCore; diffs as codes only (no amounts) to dev logs; CI corpus diff = 0 under LEGACY | 2 |
| S4 | Turn knobs, one PR each with a reviewed golden diff: projection → median → big buys + allowance → paired tight → grading → cash-test-governs-label; back-test gate I28 before allowance and tight ship | 8 |
| S5 | Plug-ins: `toLegacyContext(core)` shim, then port to `DepthModule`; wait uses refill/readyBy | 7 |
| S6 | Delete old paths, overlay, firstRead machine, shim, knobs; coverage 100% on `engine/decide` and snapshot | 3 |

### 7.3 Phase 05.2: the answer UI (about 12 days)

Comprehension baseline on today's build first (05 §5, 5 users, ≥ 2 with irregular income or low savings), then answer screen, working layer, dots and retag, home figure, flow collapse, record buttons; RNTL: quick, full and home show the same code for the same inputs (extends D-01); re-run the 5-user test (pass: tasks 1, 4, 6, 8 at 5/5). Could merge into 05.1 S5-S6 if one person owns both.

### 7.4 Data and stored checks

- **No schema change.** `decide_checks.last_seen_state` / `verdict_at_decision` (fits|adjust|no|missing, `20261016000100_decide_tables.sql`) written from `legacyState` (3.2). `verdict_at_decision` is history and never recomputed; the estimate-vs-actual journal is unchanged.
- One-time re-baseline at each verdict-changing release (A4, then S4) via the device hints record; no server write.
- `settings.basis_override` kept, not read; `last_seen_basis` (logged_months | first_read_rough_figures) unaffected; `CheckInputs v:1` and paused mutations untouched; computations are never persisted (D-15), so no persister buster.
- Retag uses the existing `one_off` column. The only future column is a "not a big buy" override (OD 2c).
- Decision record: 05.1-CONTEXT lists "supersedes" for D-35 relief, D-36 size label, D-100 hero, D-105, D-106, D-107, D-12 as each slice lands.

---

## 8. Owner decisions (panel recommendation first)

1. **Which mistake is worse?** (a) a wrong "fits": cautious figures on thin data (I1); (b) treat both alike.
2. **What is a big buy?** (a) any non-bill line ≥ 25% of a median month's non-bill spending, look-alikes excluded, tuned by back-test; (b) ≥ max(15% of income, 25% of everyday); (c) only lines the user tags; plus 2c: (i) defer a "not a big buy" override (no schema now), (ii) add a column now.
3. **Allowance form.** (a) a rate: big buys over 12 months ÷ months (floor 4), with this month's unused room; (b) rolling envelope with a 3-month rollover cap; (c) a "spare built up" balance on home.
4. **Can the checked purchase use this month's unused big-buy room?** (a) yes; (b) no, every purchase is on top of the allowance.
5. **Headline figure.** (a) after the allowance ("leaves about $590; big buys run about $300"); (b) before it, allowance on line 2.
6. **Tight month.** (a) second-lowest paired month of 6; (b) interpolated 20th percentile; (c) lowest paired month; (d) 2nd-lowest income + 2nd-highest spending taken separately.
7. **Look-back.** (a) 6 months for normal/tight, 12 for the allowance; (b) 12 for everything; (c) 6 for everything.
8. **Income in a normal month.** (a) confirmed pay schedule + median other income, unpaid freelance counted only when it lands; (b) median of all income; (c) variable earners judged on a baseline (2nd-lowest).
9. **Minimum data.** (a) answer from month 1 with "rough" in the title, tight hidden under 2 months, first read kept; (b) "not enough" until 3 well-logged months; (c) today's behaviour.
10. **Saving.** (a) committed by default, the user marks lines flexible; flexible pause is an "if", never inside the verdict; (b) flexible by default (today, D-35); (c) pensions committed, other saving flexible.
11. **Safety money.** (a) 3/4.5/6 months of bills + everyday + debt (no big buys, no saving), "heavy" below 1 month; (b) today's base (all spending + debt); (c) a 6-weeks-of-pay starter floor.
12. **Paying from savings.** (a) "Fits, with $X from savings" (fits) when refilled within 12 months, else amber; (b) always amber "fits if"; (c) "Not this month" + a cash fact.
13. **Judge-on.** (a) retire it; (b) keep as "Check against the tight month" (stricter headline).
14. **Lender lines 28/36/12.** (a) facts in "Your lines", labelled rules of thumb, gates only once the user sets them; (b) opt-in lender view for loan and property checks only; (c) keep as today.
15. **Flow.** (a) quick field → answer → record buttons, one "Change details" screen; (b) keep five steps, reorganised.

Not decisions now (deferred, noted): household "normal month" basis and partner logging (Phase 8); cash accounts marked spendable / set aside (FA 4.7, needs a column); back-test shown to users ("three months ago this said X"); outside counsel on Apple 3.2.1(viii) and 12 U.S.C. 5481 (Compliance phase).

---

## 9. Dissent

- **Architect (04)**: preferred the tight month as 2nd-lowest income plus 2nd-highest spending taken separately, and keeping today's CV steadiness and confidence rules unchanged to limit scope. The panel overrode both: separate order statistics recreate the unpaired fault at a milder level, and income CV turns a salaried user with one bonus "volatile". 04 also prefers keeping `basis_override` as a strictness setting (OD 13b).
- **Behavioural economist (01)**: wants the headline before the allowance ("a normal month leaves $640", habit second), a big-buy floor tied to income, 12 months for everything, and an optional rolling envelope ("your third big buy in 4 months"). Recorded as OD 2b, 3b, 5b, 7b.
- **Statistician (02)**: prefers the interpolated type-7 P20 for n < 6 and a day-of-month spending curve once 3 months exist; accepts the rank rule for explainability and asks that the curve follow as a back-tested refinement. Disagrees with risk on minimum data (answers from month 1).
- **Financial planner (03)**: wants variable earners judged on a baseline (2nd-lowest income, planned gaps out), user-set spending money with capped rollover, and a "comes up every year or so → pot" prompt on big lines. The pot prompt is accepted as an Other ways fact; the rest is OD 3b, 8c.
- **Product designer (05)**: wants "spare built up" as a running balance on home, drawn down by Decide purchases, and the full retirement of the five steps in the first UI slice. The panel kept the balance off home (double count with cash, and the TFI evidence that countdowns raise spending) and phased the flow change into 05.2.
- **Risk and compliance (06)**: holds that below 3 well-logged months the answer should be "not enough data", not a rough verdict, and wants outside counsel before launch on 3.2.1(viii) and the "financial advisory services" prong. The panel default (OD 9a) keeps D-03's first read but forces the rough condition into the title (I5, I25); counsel is listed for the Compliance phase.
