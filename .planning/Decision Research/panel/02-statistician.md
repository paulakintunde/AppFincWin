# Panel seat 2: applied statistician and household cash-flow forecaster

Branch `phase/05-decide-ui`, worktree `C:\dev\fincwin-p5`, 2026-10-25. Read-only: no code, catalogue or git touched.
Builds on `.planning/Decision Research/audits/FINANCE-AUDIT.md` (4.1 to 4.3, N1 to N3) and `LANGUAGE-AUDIT.md` (3.2). Findings already made there are cited, not repeated.

## Plain-English summary (grade 8)

1. Today the app judges your month three ways. "This month" leaves out the everyday spending you have not done yet. "Worst" glues your lowest pay month to your highest spending month, which may never have happened. "Average" can be thrown off by one huge month.
2. I suggest one simple idea: split your spending into **bills**, **everyday spending** and **big one-off buys**.
3. Bills come from your schedule. Everyday spending is your **middle (median) month**, so one strange month cannot move it.
4. Big buys become a **monthly allowance**: everything big you bought in the last 12 months, divided by 12.
5. "What's left" is then: money in, minus bills, minus everyday spending, minus the allowance, minus debts, saving and pots.
6. For this month, we add the everyday spending you have probably not logged yet, using your own past pace.
7. A **tight month** is a real month from your history: roughly the second-worst of six, with its own pay and its own spending kept together.
8. A month that was bad only because of one big buy counts as a **normal month plus a big buy**, not a bad month.
9. How sure we are comes from the data: how many months you have and how much your money left swings. The app says the reason in words.
10. With fewer than 3 months, the app still answers, labels it rough, and says what it is missing.

---

## 1. How it works today (with line references)

All paths are under `src/engine/decide/` unless stated.

| What | Where | What it does | Statistical problem |
|---|---|---|---|
| History window | `money.ts:248-251`, `constants.ts:16` | Latest 6 full months (`AVERAGING_WINDOW_MONTHS`). The snapshot builder reads 12 (`features/decide/snapshot/buildSnapshot.ts:145`). | Half the history the app already fetches is ignored, so lumpy spending is estimated from 6 samples. |
| Month summary | `money.ts:95-175` | Income, my net spending (refunds netted, floored at 0, smoothed bills added), one-offs set apart. | No split between everyday lines and big lines; a month is one number. |
| Average | `money.ts:291-292` | `divideHalfUp(S, n)`: the arithmetic mean. | Breakdown point 0: one $150M month makes average income $25,009,846.88 (FINANCE-AUDIT, `fin-04.png`). |
| Worst | `money.ts:273-286` | `incomeWorst` = min income, `spendingWorst` = max spending, **from different months**. | An order statistic of each margin taken separately. JPMCI finds a spending spike about once every 4 months, an income dip about once every 9, and both together about once every 5.5 years. Pairing the two extremes describes a month far rarer than "a bad month". |
| Steadiness | `money.ts:294-315`, `constants.ts:19-27` | CV of income (sd/mean) on bigint; under 6% steady, under 22% variable, else volatile; under 3 months insufficient. | sd and mean are both non-robust: one bonus month makes a salaried user "volatile", which forces Rough confidence, a 6-month cushion and the Worst basis. |
| Default basis | `money.ts:317` | `steady ? 'average' : 'worst'`. | Couples the stress choice to one non-robust statistic. |
| This month | `expectedMonth.ts:121-198`, used via `assess.ts:182-185` | Logged lines (paid and pending, one-offs included) + confirmed series still due. | No term for everyday spending still to come (FINANCE-AUDIT 4.1). Live device: "Out $841.03" on 24 October against about $6,264 in a full month. |
| 'month' basis plumbing | `assess.ts:145-146` | Asks `deriveMoney` for `worst`, then overwrites income/spending with the expected month. | Steadiness, cushion and confidence come from one model, the headline from another. |
| Month's costs, cushion | `assess.ts:196`, `reserve.ts:20-29` | `spendingAverage + debts` × 3 / 4.5 / 6 months by steadiness. | Inherits the mean's outlier sensitivity. |
| Unsecured line, annual income | `assess.ts:233-235, 258` | `incomeAverage × 12`. | Same problem: one windfall raises the 12× line. |
| Cash path | `cashPath.ts:169-185` | Spreads `spendingBasis − seriesMonthly` evenly by day. | On the 'month' basis that figure is only what is logged, so the 90-day path is understated too (FINANCE-AUDIT 4.1). |
| Confidence | `confidence.ts:12-33` | Rough: first read, under 3 months, volatile. Strong: 6+ months and steady. Else fair. | Measures income variability only. It ignores spending variability, lumpiness, under-logged months and whether the verdict would change in a tight month. |
| One-offs | `money.ts:129-139`, `types.ts:47` | User-marked one-off lines are dropped from averages and the worst month. | Correct for "will never recur" but the only outlier defence. Unmarked big buys stay in and drive both mean and max. |
| Full months | `features/decide/snapshot/fullMonths.ts:31-55` | A month is full when coverage starts on or before its 1st. | A month the user forgot to log looks like a "good" low-spending month. Nothing flags it. |

---

## 2. What the research says (and what it means here)

1. **Median and MAD have a 50% breakdown point; the mean and sd have 0.** One bad value can move a mean without limit. The modified z-score `0.6745 (x − median) / MAD` with a 3.5 cut-off (Iglewicz and Hoaglin 1993) is the standard robust outlier flag. When over half the values are identical, MAD is 0 and needs a fallback. [S1][S2]
2. **Trimming and winsorising cost sample size.** A k-trimmed mean keeps n − 2k values. With n = 6 a 1-trim leaves 4. Winsorising keeps n but its breakdown point is only k/n. With 3 to 6 months, the median is the simplest robust choice that can be explained in one sentence. [S3]
3. **Paired months, not separate extremes.** JPMCI Weathering Volatility 2.0 (2013-2018, more than 6 million families): spending spike about once every 4 months (2.6 weeks of income to cover), income dip about once every 9 months (2.8 weeks), both together about once every 5.5 years (6.2 weeks); 65% of families lack the combined buffer. Income spikes are twice as likely as dips and cluster in March and December. [S4] The finance audit's figure of about 0.1 correlation between the two shocks comes from the same programme [S4].
4. **Spending already moves in lumps.** In the JPMCI paycheck study, 40% of spending (rent, instalments) is fixed per month whatever the month length. Pay spikes come from five-Friday months for weekly or fortnightly pay, December-to-March bonuses and tax refunds. Dips are more frequent than spikes, but spikes are 67% larger. [S5] Earnings for hourly workers swing a median 9% a month, and about one month in four swings 21% or more. [S6]
5. **Seasonality cannot be estimated from 3 to 12 months.** Hyndman and Kostenko: monthly seasonal dummies need at least m + 2 = 14 observations even with almost no noise, Holt-Winters 17, and real noise needs "substantially more". Prediction intervals shrink only with √n. [S7] So with 12 months or fewer, any seasonal effect has to come from **known calendar facts** (dated bills, pay dates, five-Friday months), not from fitting.
6. **Simple benchmarks first.** fpp3: the mean, naive and seasonal-naive methods are the baselines a fancier model has to beat. The mean method did worst in the book's examples, while the naive method "works remarkably well for many economic and financial time series". [S8]
7. **Lumpy series are modelled as size × how often.** Croston's method, with the Syntetos-Boylan correction, forecasts intermittent demand as the average size divided by the average gap between events. The ADI/CV² scheme calls a series "lumpy" when the average gap is at least 1.32 periods and the sizes vary a lot. [S9] For a few months of data, the plain version of this is total big spending ÷ months covered, which is the YNAB "true expenses" rule: annual cost ÷ 12, held as a monthly set-aside. [S10]
8. **Sample quantiles.** Hyndman and Fan list nine definitions. Type 7 (linear interpolation, `h = (n − 1)p`) is R's default and needs only integer arithmetic when p = 1/5. [S11]
9. **Safe-to-spend apps.** PocketGuard's "In My Pocket" takes income, subtracts upcoming bills and goals, and spreads the rest over the days left. Reviewers report it is wrong until bills and income are corrected. [S12] I found no published method from Copilot or Monarch for projecting the rest of the month. [S13] FincWin can be more honest than these apps because it holds the user's own day-by-day history.
10. **Context.** 63% of US adults say they could cover a $400 surprise with cash or its equivalent (Fed SHED). [S14]

---

## 3. The estimator: "what's left at month end"

### 3.0 Definitions and inputs

For each full month `m` in the last **12** (the snapshot already carries them), after the existing `summariseMonth` rules (D-27 refunds, D-28 paid only, transfer legs, D-34 share), split my spending lines three ways:

- `F` **bills**: lines of a confirmed series. These are replaced by the series' monthly equivalent, as D-23 does now. The forecast is the **current schedule**, not history: `F̂ = Σ myPart(monthlyEquivalent(latestAmount))`.
- `U_m` **big buys (lumpy)**: non-series spending lines that pass the lumpy test in 3.2, plus marked one-offs (see Q2).
- `E_m` **everyday**: all other non-series spending (groceries, fuel, dining, small shopping).
- Income `I_m` = smoothed pay series (D-60) + non-series income, kept as two parts: `Ipay_m` and `Iother_m`.
- `R_m = I_m − F̂ − E_m` is the **regular money left** in month `m`. It pairs income and everyday spending from the **same** month.
- Fixed this month, from the context: `D` (debt minimums), `S` (saving + investing, `pausable`), `P` (pots set-aside).

Everyday and income statistics use the latest **6** months. Lumpy totals use up to **12**. `n` is the count of full months available, capped per statistic.

Integer rule: everything is bigint minor units. The only divisions are by 2 (median), 5 (quantile) and the month count, all through the single project rounding function `divideHalfUp` (D-21). No second rounding mode is needed: the error is at most half a minor unit.

### 3.1 Robust helpers (pseudo-code)

```
median(xs):                         # xs: bigint[], length k >= 1
  s = sort(xs); h = k div 2
  return k odd ? s[h] : divideHalfUp(s[h-1] + s[h], 2)

quantile20(xs):                     # Hyndman-Fan type 7, p = 1/5, exact in integers
  s = sort(xs); k = len(s)
  j = (k-1) div 5; r = (k-1) mod 5        # h = (k-1)/5 = j + r/5
  if j+1 >= k: return s[j]
  return divideHalfUp(s[j]*(5-r) + s[j+1]*r, 5)
  # quantile80 is the same with s sorted descending

mad(xs): m = median(xs); return median([|x - m| for x in xs])

robustScale(xs, floorBase):         # a robust "typical swing", never 0
  # 1.4826 x MAD estimates sd for normal data; floor = 5% of floorBase
  return max(divideHalfUp(14826 * mad(xs), 10000), divideHalfUp(floorBase * 5, 100))

isUnusual(x, xs, floorBase):        # modified z > 3.5, i.e. |x-med| > 3.5 x 1.4826 MAD  (5.189 x MAD)
  return 1000 * |x - median(xs)| > 3500 * robustScale(xs, floorBase)
```

The 5% floor (`ROBUST_SCALE_FLOOR_PERCENT`, a named behaviour constant) stops a salaried user whose pay is the same every month from getting MAD = 0, which would flag a $1 change as unusual.

### 3.2 (b) Splitting regular from lumpy, and the allowance

```
M      = median over months of (non-series spending total)          # robust: one big month cannot move it much
lumpy(line) =
     not line.series
 and 4 * line.amount >= M                         # LUMPY_LINE_SHARE = 1/4 of a typical month's non-bill spending
 and not recurringLookalike(line)                 # an unregistered bill is not lumpy
recurringLookalike(line) =                        # needs >= 3 months of history
  months in window with a line of same category and amount within ±15% >= ceil(2/3 * n)
  -> also raise "Looks like a regular bill. Add it as one?" (makes it F, which is better data)

Ê = median(E_m over last 6)                       # everyday
Â = Σ U_m over last up-to-12 months  /  max(nU, 4)   # big-buy allowance per month
    # nU = months covered (<= 12). The floor of 4 is a cited prior: JPMCI sees a spending spike
    # about once every 4 months [S4], so 1 to 3 months of data cannot inflate the allowance to a full purchase a month.
```

**Very big single lines.** A line `≥ Ê + F̂` (bigger than a whole typical month's regular spending) is counted in `Â` like any other lump, spread over 12. It is also **shown** with a prompt: "This was a big one. Count it in your big-buy allowance?" A yes keeps it. A no makes it a D-47 one-off, left out of the allowance and listed in "left out". Nothing is ever dropped silently.

Household scope: classify lines on the household amount, then apply `myPart` per category total, as `summariseMonth` does today (LO-02). The lumpy split happens before the share.

### 3.3 Typical month (replaces "Average")

```
Îpay   = current confirmed pay schedule, monthly equivalent (D-60)    # forward-looking, like bills
Îother = median(Iother_m over last 6)                                 # freelance, side income, irregular
Î      = Îpay + Îother
typicalLeft = Î - F̂ - Ê - Â - D - S - P
```

This is "what's left at month end in an ordinary month, with big buys set aside as an allowance". It is the owner's sentence written as a formula.

### 3.4 (a) Labelling each past month

```
scale = robustScale(R_m over window, floorBase = F̂ + Ê)
z_m   = (R_m - median(R)) / scale                 # compared as integers, never divided
label(m) =
  isUnusual(I_m, I, Î)          -> "Unusual income: count it?"   (prompt; the median already ignores it)
  4 * E_m < 2 * Ê               -> "Looks under-logged"           (everyday below half of typical; prompt, and
                                                                   exclude from E statistics until confirmed)
  z_m <= -1                     -> "Tight month"   (pay was low or everyday spending was high)
  z_m >= +1                     -> "Good month"
  otherwise                     -> "Normal month"
  plus, independently:  U_m > 0 -> "+ big buy {U_m}"
```

The key property is that a month bad only because of a big buy is labelled **"Normal month + big buy $2,400"**, not "worst month". It moves the allowance by `amount ÷ 12`, never the typical or tight figure. That answers "the worst month may be because of one bad expense".

### 3.5 (d) Tight month (replaces "Worst")

```
Rlow      = quantile20(R_m over last 6)           # n=6: exactly the 2nd-lowest paired month; n=3: 0.4 of the way from lowest to middle
tightLeft = Rlow - Â - D - S - P
```

- It is the 20th percentile of the **paired** regular-left figure. Income and spending come from the same real months, so their real correlation (weak, about 0.1, [S4]) is kept, not replaced by the worst-case assumption of a perfect inverse match.
- "About one month in five goes like this" is a sentence a user can check against their own life.
- `tightLeft ≤ typicalLeft` always holds when `n ≥ 2` (a property test).
- The minimum and maximum stay visible in Month details as "Lowest-income month" and "Highest-spending month", labelled as separate months.
- Optional upper band: `goodLeft = quantile80(R) − Â − D − S − P`, for ranges ("typically $695, $680 to $710 in most months").

### 3.6 (c) Projecting the rest of THIS month (replaces the 'month' basis figure)

```
d  = day of month of asOf;  N = days in month;  left = N - d
Ilogged, Elogged, Ulogged = this month's logged lines (paid + pending), split as in 3.2 (lumpy test uses M from history)
Idue, Fdue = confirmed series occurrences still due (expectedMonth.ts stillDueCount, unchanged)

paceRemaining   = divideHalfUp(Ê * left, N)            # A: carry on at the typical daily pace
budgetRemaining = max(0, Ê - Elogged)                  # B: catch up to a typical month (covers logging lag)
Erest           = max(paceRemaining, budgetRemaining)  # cautious: never assume spending simply stops
Uthis           = max(Â, Ulogged)                      # the allowance, or the real big buys if larger
projectedLeft   = (Ilogged + Idue) - (Flogged + Fdue) - (Elogged + Erest) - Uthis - D - S - P
```

- Unscheduled income is **not** projected (see Q3). Only logged income and confirmed pay still due count.
- Refinement once `n ≥ 3`: replace the even pace with the user's own day-of-month curve, `c(d) = median_m(E spent by day d in month m / E_m)` in basis points, and `paceRemaining = Ê × (1 − c(d))`. It captures payday and weekend clustering without needing seasonality. Ship it after the even version and test it with a back-test (section 6).
- The cash path (`cashPath.ts:184`) spreads `Ê + Â` per day instead of `spendingBasis − seriesMonthly`. This fixes FINANCE-AUDIT 4.1 for the path too.

### 3.7 How a purchase is judged against these figures

- **Pay once, in cash.** The purchase is itself a big buy, so it may use this month's unused allowance first: `room = max(0, Â − Ulogged) + projectedLeft`. "Fits this month" when `price ≤ room`. Copy: "This is about the size of the big buys you usually make." Whether to allow this is Q1.
- **New monthly cost** (loan, subscription). Judge on `typicalLeft`, and report `tightLeft` as a second line. The verdict is **robust** when both give the same answer, and **"depends on the month"** when they differ. That is the language audit's fix 1 ("Fits this month. Doesn't fit in your tightest month"), now with a defined tight month.
- Lines (DSR, housing, unsecured) use `Î` (robust), never a minimum income. That removes "516.63% of money in" (FINANCE-AUDIT `y02.png`).
- Month's costs (cushion) = `F̂ + Ê + Â + D`. Annual income and the unsecured line use `Î × 12`.

### 3.8 (e) Confidence from the data, with a reason

```
spread  = robustScale(R over window, F̂ + Ê)   # typical swing in money left
ratio%  = 100 * spread / (F̂ + Ê)             # integer compare, no division in the engine
level =
  firstRead or n < 3                          -> Rough  reason "only {n} full months logged"
  ratio > 25 or underLogged/unusual pending   -> Rough  reason "money left swings by about {spread} a month" / "a month needs a look"
  n >= 6 and ratio <= 10 and lumpyShare <= 50 -> Firm
  else                                        -> Fair   with each reason that applies (n < 6, ratio 10-25,
                                                 most spending is big buys, provisional rates D-69)
lumpyShare% = 100 * Â / (Ê + Â)               # a history dominated by big buys is harder to forecast
```

Separately, every verdict carries **verdict robustness**: does it hold in the typical **and** the tight month? This is the confidence the user actually needs. "Rough data, but it fits even in a tight month" is useful. "Firm data, but it only fits in a typical month" is a warning. The cushion months (`reserve.ts`) map from `ratio%` bands (≤10, ≤25, >25 → 3, 4.5, 6 months) instead of income CV.

### 3.9 (f) Minimum-data behaviour

| Full months | Typical | Tight | Allowance | This month | Confidence |
|---|---|---|---|---|---|
| 0 | First read (`firstRead.ts`: typed income and spending) | Not shown: "needs 3 months" | Typed, or 0 with a note | Logged + due + Erest from the typed everyday figure | Rough, "first read" |
| 1 | That month's `R` | Not shown | `U ÷ 4` | As 3.6 | Rough, "1 month" |
| 2 | Mean of the two (= median) | The lower month's `R` (`quantile20` gives `s[0] + 0.2(s[1] − s[0])`; I would show the lower month itself: "your lower month") | `ΣU ÷ 4` | As 3.6 | Rough, "2 months" |
| 3-5 | Median | `quantile20` | `ΣU ÷ 4` up to month 4, then `÷ n` | As 3.6; day curve from 3 months | Fair at best |
| 6-12 | Median of last 6 | `quantile20` of last 6 | `ΣU ÷ n` over up to 12 | As 3.6 + day curve | Firm possible |
| 12+ | As above | As above | Rolling 12 | As above, plus a **same-month-last-year hint** ("Last December's big buys: $1,900"). Shown only, never in the number, because 12 points cannot estimate seasonality [S7] | As above |

The recurring-lookalike test and the under-logged flag need 3 or more months. Below that, every non-series line is everyday or lumpy by size alone.

---

## 4. Worked examples

Debts, saving and pots are 0 here so the figures stay readable. Real figures subtract `D + S + P` at the end.

**A. One bad expense month (the owner's first case).** Pay $4,000 every month, bills $1,500. Everyday spending over 6 months: 1,350 / 1,420 / 1,400 / 1,380 / 1,450 / 1,410. Month 5 also has a $2,400 car repair.
- Today: total spending 2,850 / 2,920 / 2,900 / 2,880 / **5,350** / 2,910. Worst = 4,000 − 5,350 = **−$1,350 "overspent"**. Average = 4,000 − 3,301.67 = $698.33.
- New: `M` ≈ 1,405, so the lumpy cut is $351 and the repair is lumpy. `Ê` = median = (1,400 + 1,410) ÷ 2 = 1,405. `Â` = 2,400 ÷ 6 = 400 (only 6 months held; with 12 months and no other lumps, 200).
- `typicalLeft` = 4,000 − 1,500 − 1,405 − 400 = **$695**.
- `R` = 1,150 / 1,080 / 1,100 / 1,120 / 1,050 / 1,090. Sorted: 1,050, **1,080**, ... so `quantile20` = 1,080 and `tightLeft` = 1,080 − 400 = **$680**.
- Month 5: median R = 1,095, MAD = 20, scale = max(29.65, 5% of 2,905 = 145.25) = 145.25, z = −45 / 145.25 ≈ −0.31 → **"Normal month + big buy $2,400"**.
- Result: the tight month moves from −$1,350 to +$680. The repair costs $400 a month of allowance (or $200 over a year), which is honest about what it costs.

**B. A new thing every other month (the owner's second case).** Pay $4,000, bills $1,500, everyday $1,400 flat, a $600 item in months 2, 4 and 6 (the same pattern for 12 months).
- Today: spending alternates 2,900 / 3,500. Worst = **$500**. With a 6-month window the mean is $800. With an odd window (5 months) the mean flips between 1,200 ÷ 5 = 240 and 1,800 ÷ 5 = 360 of items: this is the "average fluctuates" the owner describes. "This month" on the 3rd: logged $100 + bills due $1,500 → **$2,400 "free"**.
- New: `Â` = 6 × 600 ÷ 12 = **$300**, steady every month. `typicalLeft` = 4,000 − 1,500 − 1,400 − 300 = **$800**, and `tightLeft` = $800 too (R is flat). Months read "Normal" and "Normal + big buy $600" in turn.
- This month, day 3 of 30, $100 everyday logged: pace 1,400 × 27 ÷ 30 = 1,260; catch-up 1,400 − 100 = 1,300; `Erest` = 1,300. `projectedLeft` = 4,000 − 1,500 − 1,400 − 300 = **$800**, not $2,400.
- Day 20, $1,100 everyday logged (over pace) and the $600 item bought: pace 1,400 × 10 ÷ 30 = 467; catch-up 300; `Erest` = 467. `Uthis` = max(300, 600) = 600. `projectedLeft` = 4,000 − 1,500 − 1,567 − 600 = **$333**.
- A $250 headphones check on day 3: allowance unused 300 ≥ 250 → "Fits: about the size of the big buys you usually make", with $800 still left.

**C. A $150M month (the test account).** Income 4,000 × 5 and 150,000,000 in one month.
- Today: mean = **$25,003,333**.
- New: median = **$4,000**. MAD = 0, so scale = 5% × 4,000 = 200 and the outlier's z is about 750,000 → "Unusual income: count it?". The typical figure is unaffected either way.

**D. Gig worker, no pay series.** Income 3,200 / 2,100 / 4,000 / 2,800 / 3,500 / 1,500. Bills $1,200, everyday $1,600 flat.
- `R` = 400 / −700 / 1,200 / 0 / 700 / −1,300.
- Today: Worst = −$1,300, Average = +$50.
- New: typical = median R = (0 + 400) ÷ 2 = **+$200**. Tight = `quantile20` = **−$700** (a real month), not −$1,300.
- MAD = 700, scale ≈ 1,038 = 37% of $2,800 outflow → **Rough: "money left swings by about $1,040 a month"**. The cushion goes to 6 months.

**E. Thin data.** One full month with a $900 lumpy line: `Â` = 900 ÷ 4 = $225, not $900. Rough, "1 month logged".

---

## 5. What to delete or replace in the current engine

| Delete / replace | Location | Replace with |
|---|---|---|
| `incomeWorst` / `spendingWorst` as a judging basis, and the `'worst'` basis | `money.ts:273-286, 317, 332-333` | `tightLeft` (3.5). Keep min and max as display-only facts. |
| Mean `incomeAverage` / `spendingAverage` as the `'average'` basis, cushion base and 12× income | `money.ts:291-292`; `assess.ts:196, 233-235, 258` | `Î`, `F̂ + Ê + Â` (3.3, 3.7) |
| Income CV steadiness (sd/mean, `isqrt`) and the `steady ? average : worst` default | `money.ts:198-208, 294-317`; `constants.ts:19-27` | `robustScale` ratio bands (3.8). `isqrt` goes. |
| `'month'` basis as logged + due only, and the `historyOverride = 'worst'` workaround | `expectedMonth.ts:185-188`; `assess.ts:145-146, 182-185` | `projectedLeft` (3.6). Keep `stillDueCount` and its matching rules: they are good. |
| Cash path spread of `spendingBasis − seriesMonthly` | `cashPath.ts:184-185` | Spread `Ê + Â` per day |
| Confidence rules (months + income steadiness only) | `confidence.ts:12-33`; `CONFIDENCE_STRONG_MIN_MONTHS` | 3.8 levels with reasons, plus verdict robustness |
| `AVERAGING_WINDOW_MONTHS = 6` as the only window | `constants.ts:16` | 6 for medians, 12 for the allowance (`LUMPY_WINDOW_MONTHS`) |
| The Judge-on picker over three ill-defined bases (D-107) | snapshot `basisOverride`, `computeCheck.ts:309-317` | Three defined figures shown together: **This month (projected)**, **Typical month**, **Tight month**. No picker needed (product call, Q7). |
| One-offs as the only outlier defence | `money.ts:129-139` | Keep D-47 for "won't recur". Add the automatic lumpy split and the unusual-month prompts. |

Keep: integer money, `summariseMonth` netting rules, D-23/D-60 smoothing, series occurrence matching, `divideHalfUp`, `isOnEdge`, and the setbacks/stress structure. Setback "unexpected expense" could later default to the 80th percentile of past lumpy lines instead of one month's costs (`setbacks.ts:36-39`).

## 6. Tests the engine should carry (fast-check, inside `engine/`)

- **Bounded influence:** adding one lumpy line of any size to one month changes `Ê`, `typicalLeft + Â` and `tightLeft + Â` by 0, and `Â` by exactly `amount ÷ max(nU, 4)` (± half a unit).
- **Breakdown:** multiplying one month's income by any factor moves `Î` by no more than the gap between the neighbouring order statistics.
- **Order:** `tightLeft ≤ typicalLeft ≤ goodLeft` for n ≥ 2.
- **Monotone projection:** logging more everyday spending never raises `projectedLeft`; adding a due bill lowers it by exactly my share.
- **Determinism:** the same months in any order give identical outputs (median and quantile sort first).
- **Back-test (offline, and later a user feature, FINANCE-AUDIT L1):** for each past month, predict it from the others. The share of months that come in below `tightLeft` should be about 20%. Track it as a calibration metric over real test accounts.

---

## 7. Open questions for the owner

1. **Can a purchase use the big-buy allowance?** If yes, "a $250 thing fits your usual big buys" (my recommendation). If no, every purchase is extra on top of the allowance, which is stricter.
2. **Marked one-offs:** should a line the user marks one-off still count in the allowance (it is a big buy, and people make them), or stay out (D-47 today: "won't recur")? I suggest two marks: "big buy" (counts) and "won't happen again" (left out).
3. **Freelance income not yet received:** project it from the typical month, or count it only when it lands? I default to only when it lands (cautious), but early in the month a freelancer will see a low figure.
4. **How tight is "tight"?** One month in five (P20, my default) or one in ten (with 6 months that is about the lowest month, close to today's Worst on the income side)?
5. **A car-sized purchase:** spread over 12 months in the allowance (default), or ask every time a line is bigger than a whole month?
6. **Lumpy cut-off:** a single line ≥ 1/4 of a typical month's non-bill spending. Is a $350 line on a $1,400 everyday month "big" to you?
7. **Which figure leads the verdict:** this month (projected) for cash buys and typical for monthly costs (my default), or one figure for everything?
8. **Prompts:** how often may the app ask "this month looks unusual / under-logged, count it?" Once per month flagged, or batched in Month details?
9. **Same month last year:** show "last December you spent $1,900 on big buys" as a hint (my default), or leave seasonality out entirely until there are 2+ years?

---

## 8. Sources

- [S1] Iglewicz and Hoaglin (1993) modified z-score, 0.6745 scaling, 3.5 cut-off, MAD = 0 caveat (secondary documentation): https://metricgate.com/docs/iglewicz-hoaglin-modified-z-outliers/ and https://netneurotools.readthedocs.io/en/latest/generated/netneurotools.stats.get_mad_outliers.html
- [S2] Breakdown points of the median/MAD versus the mean/sd: https://metricgate.com/blogs/zscore-vs-modified-zscore/
- [S3] Trimmed versus winsorised means in small samples: https://metricgate.com/blogs/winsorization-vs-trimming-robust-stats/ and https://d.lib.msu.edu/etd/34113/FULL_TEXT/download
- [S4] JPMorgan Chase Institute, Weathering Volatility 2.0 (fetched: spike every 4 months, dip every 9, both every 5.5 years; 6.2 weeks; 65%): https://www.jpmorganchase.com/institute/all-topics/financial-health-wealth-creation/report-weathering-volatility-2-a-monthly-stress-test-to-guide-saving
- [S5] JPMorgan Chase Institute, Paychecks, Paydays and the Online Platform Economy (fetched full text: 40% fixed per-month spend, five-Friday months, Dec-Mar spikes, dips 43% / spikes 33% of months, spikes 67% larger). The PDF sits at a URL named for the volatility report: https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/institute/pdf/jpmc-institute-volatility-2-report.pdf
- [S6] JPMorgan Chase Institute, Earnings instability (2025; 9% median monthly swing, one month in four 21% or more): https://www.jpmorganchase.com/institute/all-topics/household-financial-health/earnings-instability
- [S7] Hyndman and Kostenko (2007), Minimum sample size requirements for seasonal forecasting models, Foresight 6 (fetched full text): https://robjhyndman.com/papers/shortseasonal.pdf
- [S8] Hyndman and Athanasopoulos, Forecasting: Principles and Practice 3e, Simple forecasting methods (fetched): https://otexts.com/fpp3/simple-methods.html
- [S9] Croston / Syntetos-Boylan intermittent demand and ADI/CV² classification: https://salford-repository.worktribe.com/output/1474812/on-the-categorization-of-demand-patterns and https://metricgate.com/docs/syntetos-boylan-approximation/
- [S10] YNAB, true expenses: annual cost ÷ 12 as a monthly set-aside: https://www.ynab.com/periodic-expenses/ and https://www.ynab.com/blog/what-is-a-sinking-fund
- [S11] Hyndman and Fan (1996), Sample quantiles in statistical packages, the nine types and type 7: https://blogs.sas.com/content/iml/2017/05/24/definitions-sample-quantiles.html
- [S12] PocketGuard "In My Pocket" method, as described by reviewers: https://www.thepennyhoarder.com/budgeting/pocketguard-review/ and https://www.cnbc.com/select/pocketguard-budgeting-app-review/
- [S13] Copilot and Monarch forecasting (secondary; no published method found): https://www.asianefficiency.com/technology/copilot-money-vs-monarch-vs-ynab/
- [S14] Federal Reserve SHED ($400 expense, 63%): https://www.federalreserve.gov/consumerscommunities/shed.htm
- Not verified: the about-0.1 shock correlation is quoted from FINANCE-AUDIT [JPMCI-2], not re-fetched here. Iglewicz-Hoaglin is cited through secondary documentation, not the 1993 book. PocketGuard's algorithm is proprietary; the reviewers' descriptions may be incomplete.
