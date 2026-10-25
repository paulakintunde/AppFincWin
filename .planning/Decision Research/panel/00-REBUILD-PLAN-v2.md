# Decide rebuild: the agreed plan, v2 (owner's revised direction)

2026-10-25. Replaces `00-REBUILD-PLAN.md` (v1, kept unchanged) wherever they differ. The owner's "REVISED DIRECTION" and "Follow-up decisions" in `00-OWNER-DECISIONS.md` override v1. All 22 situations in `00-SCENARIOS.md` are re-checked in section 8. Read-only synthesis: no code or git changed. Code citations were verified for v1 and still hold.

## 1. Plain-English summary

1. Decide answers one question: "If I buy this, am I still OK this month and after?" The app works it out from your own records, with fixed rules and wording templates. There is no AI and no voice.
2. The first number is **what this month will leave**: a forecast of the month to its last day. It includes the everyday spending you have not done yet.
3. The second number is your **typical month**: the middle of your last six months. One bad expense cannot move it. It is used for monthly costs and for how fast money builds back up.
4. Unspent money builds up as your **buffer**. The buffer is there for purchases.
5. **Emergency savings** are a separate pot that purchases are not meant to touch. Your protection is measured in months of essentials (bills, everyday spending, debt payments).
6. A one-off purchase climbs a ladder: fits this month → fits from your buffer → would use emergency savings → not yet.
7. "Would use emergency savings" means you could pay for it, but not without risk. The answer shows protection before and after, and how many months it takes to rebuild.
8. A monthly cost (a lease, a phone plan) is tested against the typical month. A real low month is named when it would go short.
9. If your typical month is already short, the app says so once, in a separate notice. A $5 coffee is not blamed for it.
10. One tap after the answer, "What could I do instead?" puts four futures side by side: buy now, keep the money, invest it, buy later. The app shows the trade-offs and never ranks them.
11. This is simpler than v1. There is no big-buy allowance, no sorting of spending into piles, no "Judge on" switch, and six result codes instead of eleven.
12. Nothing is fixed yet. The urgent bug fixes are offered as an option. The engine is rebuilt beside the old one, with no database change.

---

## 2. The model: five ideas the user meets

| # | Idea (user words) | What it is | Where it is used |
|---|---|---|---|
| 1 | **This month** | Projected leftover to the last day of the month | Rung 1 for one-off buys; "heading short" notice |
| 2 | **Typical month** (and a named **low month**) | Median of the last 6 paired months, at today's pay and bills | Monthly costs; rebuild and ready pace; "already short" notice |
| 3 | **Buffer** | Spendable cash − emergency savings − pots saved, at month end | Rung 2 |
| 4 | **Protection** | Emergency savings ÷ essentials, in months | Rung 3, "Keep it" future |
| 5 | **Months to rebuild / ready** | Gap ÷ typical-month leftover | Rungs 3–4, "Buy later" |

Removed from v1: the big-buy allowance, the line classifier (bills, everyday and big buys as separate piles), the allowance room, "safety money" as a single pool, the Judge-on basis, and the separate tight-month verdict.

### 2.1 Definitions

| Term | Definition |
|---|---|
| **Full month** | Coverage starts on or before the 1st (`fullMonths.ts:31-55`) and the month is not under-logged (below). |
| **Bills** | Confirmed series at **today's** schedule: Σ myPart(monthlyEquivalent(latestAmount)) (D-23). |
| **Pay** | Confirmed pay series at today's amount, monthly equivalent (D-60). **Other income** = non-series, not a refund, not flagged `one_off`. |
| **Non-bill spending** | Every non-series, non-transfer out line, my share (summariseMonth rules: refunds net, paid only, D-34). There is no sorting into everyday and big buys. |
| **Set aside** | Debt minimums + committed saving and investing + pot set-asides (D-101). Saving is committed by default (B2); a line the user marks flexible is still subtracted, and pausing it appears only in the trade-off explorer. |
| **Essentials** | Bills + median non-bill spending + debt minimums, per month (open question Q2). |
| **Emergency savings** | After Phase 6 Grow: the balance of the one goal flagged as the emergency fund (N1). Before Grow: min(free cash, target), where target = 3 × essentials and the user can change it. |
| **Under-logged month** | n ≥ 3 and non-bill spending below 50% of the median. Set aside until the user confirms it (scenario 15). |
| `one_off` mark (04 D-47) | "Won't happen again": left out of the typical month. The current month always counts real logged lines. |

### 2.2 Formulas (bigint minor units; `divideHalfUp` is the only rounding, D-21)

```
# typical month: paired, so one month's income and spending stay together
R_m        = Pay_today + other_m − Bills_today − nonBill_m        # per full month m, last ≤ 6
             (no confirmed pay series: Pay_today + other_m := income_m)
typicalLeft = median(R) − SetAside
lowLeft     = (n >= 4 ? sorted(R)[1] : n >= 2 ? sorted(R)[0] : none) − SetAside   # a real, named month
lowLeft     = min(lowLeft, typicalLeft)
E           = median(nonBill_m)                                  # spending pace
essentials  = Bills_today + E + debtMinimums

# this month, as of day d of N (v1 Erest, unchanged)
Erest     = max(divideHalfUp(E*(N−d), N), max(0, E − nonBillLogged))
monthLeft = incomePaid + payDueConfirmed − billsLogged − billsDue − nonBillLogged − Erest − SetAside
            # pending income is not received (R3); logged lines, big or small, all count

# pots and cash, at month end
free      = spendableCash − potsSaved − dueNow + payDueConfirmed − (billsDue + Erest + set-aside outflows still to leave cash)
            # moves between my own cash accounts are not outflows
emergency = grow ? growEmergencyBalance : min(max(free,0), emergencyTarget)
buffer    = free − emergency
protection(x) = x ÷ essentials, in tenths of a month (integer: divideHalfUp(10*x, essentials))

# spread and confidence (v1, unchanged)
spread = max(1.4826·MAD(R), 5% of (Bills + E)); bands ≤10% / ≤25% / higher → Firm possible / Fair / Rough
confidence = min(history level, this-month completeness (never Firm before day 20 or before half of E is logged),
                 freshness (unsaved writes or stale balance → down one level))
```

### 2.3 Minimum data (B1 default: answer from month 1, marked Rough)

| Full months | This month | Typical | Low month | Confidence |
|---|---|---|---|---|
| 0, rough figures typed (D-03) | from the typed figures, prorated | from the typed figures | hidden | Rough, "your own figures" |
| 0, nothing typed | — | — | — | `not_enough` |
| 1–2 | projected | median of 1–2 | n=2: lower month | Rough, in the title |
| 3 | projected | median | lowest | Fair at best |
| 4–6 | projected | median | 2nd-lowest | Firm possible |

---

## 3. The judge

`P` = my share of the day-one cost. `M` = my share of monthly payments + running costs (D-62). There is one pure `judge()` and one `combine()`.

### 3.1 One-off ladder (on P)

```
cash check  : P > spendableCash − potsSaved − dueNow  or  90-day low point after P < 0   → not_yet (before payday / not covered)
rung 1      : P <= max(0, monthLeft) and P <= buffer                                      → fits_month
rung 2      : P <= buffer                                                                 → fits_buffer
              fromBuffer = P − max(0, monthLeft); bufferLeft = buffer − P
rung 3      : P <= free                                                                   → uses_emergency
              used = P − max(0, buffer); before = protection(emergency); after = protection(free − P)
              grade heavy if after < 10 tenths (1 month); rebuild = typicalLeft > 0 ? ceilDiv(used, typicalLeft) : null
rung 4      : otherwise                                                                   → not_yet
              ready = typicalLeft > 0 ? ceilDiv(P − max(0, buffer), typicalLeft) months : null
```

This month's leftover is part of the buffer and is never added to it, which stops double counting (I19). The cash check governs every rung, so a label can never claim a better pot than the cash allows.

### 3.2 Monthly part (on M)

`monthly_short` if typicalLeft − M < 0. Otherwise the monthly part passes. If lowLeft − M < 0, the title carries the low-month clause (I23). Flexible saving is never paused inside the verdict.

### 3.3 Result codes (six) and precedence

Precedence runs top to bottom. When both parts apply, the stricter one leads; the other part's facts sit underneath.

| # | Code | When | legacyState |
|---|---|---|---|
| 1 | `not_enough` | no full month, no rough figures | missing |
| 2 | `not_yet` | cash check fails, or rung 4 | no |
| 3 | `monthly_short` | M > 0 and typicalLeft − M < 0 | no |
| 4 | `uses_emergency` | rung 3 (light / heavy) | light: adjust; heavy: no |
| 5 | `fits_buffer` | rung 2 | fits (adjust if the low-month clause applies) |
| 6 | `fits_month` | rung 1, or P = 0 with the monthly part passing | fits (adjust if the low-month clause applies) |

**Notices** sit above the code, are never codes, and never change it:
- "Your typical month is already short by {x}." (typicalLeft < 0)
- "{Month} is heading about {x} short, mostly {largest line}." (monthLeft < 0)
- "Debt payments would be {p}% of take-home, over the {line}% you set." (only for a line the user set; C2)
- "{k} changes not saved yet; this answer may change." (freshness)

### 3.4 One code → one copy row

The surface (quick, full, home) may choose only a body variant. `{conf}` appends " · rough figures ({n} months logged)" or " · fair estimate" when confidence is below Firm. Banned: should, recommend, advice (footer key only), go ahead, you can, safe, free (money sense), spendable, best, better, worth it.

| Code | Chip | Title | Body |
|---|---|---|---|
| `fits_month` (one-off) | Fits this month | Fits this month{conf}. | "{Month} is on track to leave about {monthLeft}, including about {Erest} of everyday spending still to come." |
| `fits_month` (monthly) | Fits a typical month | Fits a typical month{conf}. / + "A low month like {lowMonth} ends {s} short." | "After {M} a month, a typical month leaves about {a}." |
| `fits_buffer` | Fits from your buffer | Fits from your buffer{conf}. | "Uses {fromBuffer} of your buffer; {bufferLeft} left." |
| `uses_emergency` light | Uses emergency savings | Would use {used} of your emergency savings{conf}. | "Protection drops from {before} to {after} months of essentials. Rebuilt in about {rebuild} months at your typical pace." / null: "A typical month doesn't rebuild it." |
| `uses_emergency` heavy | Uses emergency savings | Would leave under a month of protection{conf}. | as above, plus "Cash would be {cashAfter}." |
| `not_yet` cash now | Not yet | Not yet: cash is {gap} short until payday on {date}. | "Covered on {date}, when {pay} lands." |
| `not_yet` not covered | Not yet | Not yet: cash doesn't cover it. | "From your buffer in about {ready} months ({monthYear})." / null: "A typical month doesn't build toward it." |
| `monthly_short` | Doesn't fit a typical month | Doesn't fit a typical month: {s} short each month. | "A typical month leaves {a} now; this adds {M}." |
| `not_enough` | Not enough yet | No full month logged yet, so there is no typical month to judge on. | "Rough figures give a first answer." |

Footer on every Decide answer: "Worked out from your own records. A record-keeping and planning tool, not financial advice."

---

## 4. What the user sees

### 4.1 Answer

```
┌──────────────────────────────────────┐
│ ‹  Sofa · $4,000              ⋯      │
│  Would use $2,600 of your            │
│  emergency savings.                  │  title (uses_emergency, light)
│  Protection drops from 3.0 to 2.2    │
│  months of essentials. Rebuilt in    │
│  about 7 months at your typical pace.│
│  ─────────────────────────────────── │
│  October will leave     about $425   │  fact: this month
│  Typical month          about $425   │  fact: typical
│  Buffer before          $1,400       │  fact: buffer
│  ─────────────────────────────────── │
│  Fair estimate · 6 months logged     │
│  What could I do instead?         ›  │  one tap, central
│  See the working                  ›  │
│ [ Record as bought ] [ Plan for it ]  │
│          Not buying                  │
└──────────────────────────────────────┘
```

### 4.2 "What could I do instead?" (four futures, a fixed order, never ranked)

```
                  Buy now        Keep it         Invest it (5%*)    Buy later
Cash today        −$4,000        $0              −$4,000 invested   $0 now
Monthly / debt    —              —               —                  —
Buffer after      $0             $1,400          $0                 $0 → builds
Protection        2.2 months     3.0 months      2.2 months         3.0 months
In 5 years        sofa           $4,000 cash     ≈$5,100 (gain $1,100) sofa, bought ~May
Gain given up     $1,100 at 5%   —               —                  —
 * Example rates, not a forecast. Returns are uncertain and can be negative.  [0%] [2%] [5%] [7%] [type a rate]
 Item value (optional): earns or saves [$ ] a month · resale after [n] years [$ ]
```

- **Buy now**: cash change, monthly and running costs, debt effect, buffer and protection after (`plan.ts`, `ownership.ts`, `payoff`, `reserve.ts`). For a financed purchase, the full payment stream and total cost (D-102).
- **Keep it**: buffer and protection kept, in months.
- **Invest it**: `investmentViews.ts` already grows the lump and the payment stream (D-52 (a), (b)). Only the gain (projected − contributed) is shown as given up, never the principal. 0% is always shown. The example rates are 2, 5 and 7%, the user picks one, and a typed rate is allowed. This replaces D-51 and D-07 and is flagged for the Compliance phase (I26).
- **Buy later**: the month the buffer covers it without touching emergency savings (`wait.ts`, fed by typicalLeft and buffer).
- **Item value**: optional monthly earnings or savings (`payback.ts`) and resale (`ownership.ts`). It is applied in Buy now only.
- **Trade-off explorer** (below the table): "To buy now from your buffer, something would need to flex." It shows only discretionary non-bill spending (a slider, as a % of E, via `options.ts` and `bisect.ts`) and flexible saving lines. It never touches bills, required debt minimums or committed saving. Each setting shows the effect on monthLeft, buffer and ready date. It also shows the affordable price: "Up to {x} fits this month; up to {y} from your buffer" (bisect).

### 4.3 Working, home and flow

- **See the working** has one level, with these sections: Your months (six dots, each with its leftover and reason, plus "Leave it out" or "Count it" on the `one_off` flag, and the under-logged question); This month, line by line, including the projection sentence; Pots (buffer, emergency, other pots); Cash day by day; Your lines (28/36/12 as rules of thumb lenders use, C2); What this assumes (assumption register, freshness, currency).
- **Home**: "October will leave about $425", then "Typical month about $425 · Buffer $1,400 · Protection 3.0 months", then the quick field. No "free", no Judge-on.
- **Judge-on (D-107)** is retired, because this month always leads and the typical month is always the second line. The `judgeOn` store is deleted and the `settings.basis_override` column is left in place, unread.
- **Flow**: quick field → answer → record buttons. One "Change details" screen holds the payment plan, running costs, tax and trade-in (C3, C4). Step 4 becomes "What could I do instead?". Step 5 becomes the three buttons, and the D-09 confirm is kept.

---

## 5. Module map

| Module | v2 role | Fate |
|---|---|---|
| `money.ts` summariseMonth | paired per-month R, nonBill | **Reuse** (no classes added) |
| `money.ts` deriveMoney (mean, min/max, CV, default basis) | → `month/typical.ts` | **Delete / rewrite** |
| `expectedMonth.ts` | → `month/thisMonth.ts` with Erest; keeps `stillDueCount`; pending income not received | **Rewrite (reuse matching)** |
| `assess.ts` prepareContext / assessPlan / purchaseSize | → `judge/` ladder + `combine()`; dsr/housing/owe become limit facts | **Delete / rewrite** |
| `reserve.ts` | → `pots.ts` emergency/buffer: target 3 × essentials, Grow source, protection months | **Regroup** |
| `pots.ts` (D-101) | pots saved and set-aside | **Reuse** |
| `cashPath.ts` | 90-day path: Erest this month, then E per month; drives the cash check | **Change (spread)** |
| `confidence.ts` | spread + completeness + freshness, with reasons | **Change** |
| `firstRead.ts` | rough figures feed the same model; its own state machine goes | **Change** |
| `position.ts`, `futureChanges.ts` | adapters before the judge; may only lower figures | **Change** |
| `plan.ts`, `payoff`, `series.ts`, `share.ts`, `currency.ts`, `cardRule`, `marketDefaults`, `runningCostPrompts`, `estimateBias` | inputs | **Reuse** |
| `investmentViews.ts` | Invest it future; gain-only; example rates | **Reuse + regroup** |
| `projectionRates.ts`, `constants.ts` | add `EXAMPLE_RATES = [2,5,7]` with a cite and a label code | **Change** |
| `wait.ts` | Buy later: target P − buffer, pace typicalLeft | **Reuse, re-fed** |
| `alternatives.ts` | rows become the four futures; the 65% cheaper default is dropped, and a cheaper price is used only if typed | **Regroup** |
| `options.ts`, `bisect.ts` | trade-off explorer and affordable price; "earn more" and bill cuts removed | **Regroup** |
| `ownership.ts`, `payback.ts` | Buy now total cost; item value | **Reuse** |
| `incomeAtRisk.ts`, `setbacks.ts`, `stress.ts` | protection months covers "if income stops" | **Delete** from Decide (Q9) |
| `margins.ts`, `decision.ts` | margins become facts | **Fold into judge** |
| snapshot `computeCheck.ts` | one core run; `basisOutcomesOf` and `EngineRun` deleted | **Change** |
| snapshot `buildSnapshot.ts` | add `emergencySavings: MinorUnits \| null` (Grow) | **Change** (no schema) |
| copy `verdictCopy`, `quickCopy`, `warningCopy`, `basisKey`, `keyFiguresCopy` | → `copy/verdictTable.ts` | **Delete / rewrite** |
| UI: HomeSummaryCard, JudgeOnControl, YourMonthCard picker, VerdictCard, BasisOutcomeCard, step3Folds, Step1–5 | AnswerScreen, InsteadScreen, Working, ChangeDetails, home figure | **Replace** |

---

## 6. Safety rules

### 6.1 Invariants (fast-check in `engine/`, plus copy tests; CI fails on any)

- **I1 Asymmetric error** (A1): on thin data, the verdict is never better than the same data treated as full.
- **I2 No zero-spend projection**: projected spending for the rest of the month is at least E × days left ÷ N, and the cash path spreads at least E in every future month.
- **I3 Uncertain income is not cash**: removing pending or unpaid income never improves the code.
- **I4 Month separate from purchase**: when typicalLeft < 0 or monthLeft < 0, the notice is present and the purchase facts report only what the purchase changes.
- **I5 Not enough data**: with no month and no figures, the code is `not_enough`; with fewer than 3 months, every title carries `{conf}`.
- **I6 Coverage**: under-logged months are excluded until confirmed.
- **I7 Freshness**: with unsaved writes, confidence is never Firm, and the freshness notice is shown.
- **I8 Confidence reflects the projection**: never Firm before day 20 or before half of E is logged.
- **I9–I13 Monotonicity**: a cheaper price is never worse; an extra expense never helps; extra paid income never hurts; less cash never helps; a higher price never makes the ready date earlier.
- **I14 Bounded influence**: changing one history month by any amount moves typicalLeft by no more than the gap between neighbouring order statistics.
- **I15 Order**: lowLeft ≤ typicalLeft.
- **I16 Determinism**: month order does not matter, and there is no clock read in `engine/`.
- **I17 Pots are partitioned**: buffer + emergency + potsSaved = free + potsSaved, exactly. A purchase never draws on pots, and draws on emergency only at rung 3.
- **I18 Ladder is monotone**: the rung never improves as P rises, and the cash check overrides every rung.
- **I19 No double count**: monthLeft is never added to the buffer, and the cash path does not spend Erest twice.
- **I20 Adapters only lower** figures, and `combine` is monotone.
- **I21 Projection is monotone**: logging more spending never raises monthLeft.
- **I22 One code, one text**: no screen holds opposite claims (cash ok / not ok, month ok / not ok) for the same check.
- **I23 Disagreement surfaces**: a monthly cost with lowLeft − M < 0 always shows the low-month clause in the title.
- **I24 Severity graded**: heavy and light `uses_emergency` titles differ, and protection is always shown before → after.
- **I25 Condition in title**: below Firm, every title carries `{conf}`.
- **I26 Copy guard**: BANNED, REASSURING and IMPERATIVE_LEAD tests, plus `free`, `safe`, `you can`, `spendable`, `best`, `better`, `worth`. Any non-zero rate shows "Example rates, not a forecast. Returns are uncertain and can be negative." The futures order is fixed, with no ranking key.
- **I27 Assumption register**: every constant (6 months, 3× essentials, 50% under-logged, example rates) carries a cite or a "FincWin choice" tag and is listed in "What this assumes".
- **I28 Back-test**: on the persona set (salaried, gig, seasonal, partial logger, couple, new user, $150M month), the false-"fits" rate is never above legacy, and about 20% of held-out months fall below the low month.
- **I29 No silent fallback**: every fallback emits a reason code.
- **I30 Explorer limits**: the trade-off explorer never flexes bills, required debt minimums or committed saving.

Dropped from v1: allowance divisor and bounded-allowance rules (v1 I14 second half, I18), classifier money preservation (v1 I17), allowance double-count (v1 I19 first clause).

### 6.2 Bugs that stand (verified for v1; all still apply)

| # | Bug | Where |
|---|---|---|
| B1 | "This month" counts logged + still-due only; no everyday spending still to come | `expectedMonth.ts:185-188`; `assess.ts:182-185`; default `'month'` `judgeOnStore.ts:43` |
| B2 | Cash path spreads only the everyday already logged this month (floor at 0): about zero early in the month, for 90 days | `cashPath.ts:184-185` |
| B3 | A cash purchase is never tested against the month | `assess.ts:340-341` |
| B4 | A month already short makes every purchase `no` | `assess.ts:428-429` |
| B5 | Confidence ignores the basis | `assess.ts:559` |
| B6 | Chip comes from the surface, not the cause ("Not from cash" + "Cash covers it") | `verdictCopy.ts:27` |
| B7 | Size label is a separate axis from the state | `assess.ts:299-303` |
| B8 | "Cushion" figure is the runway; "A month: None" means 0 | `keyFiguresCopy.ts:85`, `:60-61` |
| B9 / B10 | Worst = min and max from different months; Average = plain mean | `money.ts:273-292` |
| B11 | Pending income counted as paid; one-off income counted | `expectedMonth.ts:137`, `:186` |
| B12 | DSR and housing divide by income received so far | `assess.ts:352-375` |
| B13 | Cushion breach not graded | `assess.ts:412-414` |
| B14 / B15 | Headline and basis card come from different runs; home ≠ check; body income ≠ table income | `computeCheck.ts:311-322`; `homeCardModel.ts:96`; `verdictCopy.ts:109` |
| B16 | Received pay read twice (flow and cash) | `assess.ts:203-227` |

---

## 7. Delivery

### 7.1 Option A: urgent fixes on today's engine (about 5 days; the owner has said "not yet")

A1 copy table adapter and chip from the cause (B4, B6, B7, B8, B13); A2 Erest, pending income and confidence cap (B1, B5, B11, B12); A3 cash-path floor (B2); A4 re-baseline of seen states. These can ship in PR #82, in a separate PR, or not at all. If they don't ship, B1 and B2 (false "fits" early in the month) stay live until 05.1 lands.

### 7.2 Phase 05.1: the engine (about 27 days for one engineer)

| # | Slice | Days |
|---|---|---|
| S0 | Characterize today's outputs: prototype scenarios, ~300 seeded snapshots, and the 22 situations as golden fixtures | 2 |
| S1 | `month/`: paired typical, low month, thisMonth with Erest, under-logged months, spread and confidence | 4 |
| S2 | `pots/`: buffer, emergency (default + Grow source interface), protection months | 2 |
| S3 | `judge/` ladder, monthly test, `combine()`, notices, `verdictTable` and copy tests (I22–I26) | 4 |
| S4 | Shadow run beside the old engine; parity on reused parts (plan, cash path, lines) to the minor unit; reviewed golden diffs for changed answers; back-test gate (I28) | 3 |
| S5 | `instead/`: four futures from investmentViews, wait, alternatives, ownership and payback; example rates; item value | 6 |
| S6 | Trade-off explorer and affordable price (options, bisect) | 3 |
| S7 | Delete old paths (deriveMoney bases, overlay, firstRead's machine, setbacks, stress, incomeAtRisk, basisOutcomes); 100% branch coverage kept | 3 |

### 7.3 Phase 05.2: the screens (about 12 days)

The 5-person reading test runs on today's build first (D3). Then build AnswerScreen, InsteadScreen, Working, ChangeDetails and the home figure, and retire Judge-on and the five steps. RNTL tests check that quick, full and home show the same code. Re-test with 5 people, at least 2 with irregular income or low savings.

### 7.4 Data

- **No schema change in Decide.** Stored states keep fits, adjust, no and missing, mapped from `legacyState` (3.3). `verdict_at_decision` is never recomputed. Seen states are re-baselined through the device hints record. `settings.basis_override` is left in place, unread.
- **Grow dependency**: Phase 6 adds the emergency-fund flag on one goal in its own migration. Decide reads it through `emergencySavings`; until then `null` means the default target.
- Example rates are constants. The rate the user picks reuses the existing projection-rate setting.
- Decisions superseded, to record in 05.1-CONTEXT: D-07, D-35 relief, D-36, D-51, D-100 hero, D-105, D-106, D-107.

---

## 8. The 22 situations under v2

Sam baseline (v2): pay $4,000, bills $1,800, saving $300. Paired leftovers at today's pay are 1,100 / 600 / −1,400 / 900 / 850 / 350, so the median is 725 and the **typical month is $425**. The **low month** is September: 350 − 300 = **$50**. E is $1,475 and essentials are **$3,275**, so the emergency target is **$9,825**. Cash is $12,000, so on 18 October month-end free cash is about $11,225 and the **buffer is about $1,400**, which includes October's $425.

| # | Situation | v2 result |
|---|---|---|
| 1 | Headphones $150, 18 Oct | `fits_month`: October will leave about $425. |
| 2 | Laptop $1,200, 3 Oct, $100 logged | Erest $1,375, October about $425, buffer about $800 → `uses_emergency` light: $400, protection 3.0 → 2.9 months, rebuilt in about 1 month (would be `fits_buffer` if essentials excluded big lines, Q2). Today's engine shows "fits from spare". |
| 3 | $250 jacket every other month | `fits_month`: the median of alternating months is stable, so the habit is already in the typical month. |
| 4 | $5 coffee after a $1,000 repair | Notice "October is heading about $450 short, mostly the $1,000 car repair"; month-end buffer falls to about $270 (cash $11,000 − Erest $904 − $9,825 emergency); coffee is `fits_buffer`: uses $5, about $265 left. |
| 5 | Riley, typical month $250 short, $60 shoes, $2,000 saved | Notice "typical month already short by $250"; `uses_emergency` heavy: protection 0.6 → 0.6 months; "A typical month doesn't rebuild it." (Q6) |
| 6 | Lease $450/mo | `monthly_short`: $25 short each month; explorer shows non-bill spending −$25 or a flexible saving line. |
| 7 | Phone $85 × 24 | `fits_month` (monthly) + clause "A low month like September ends $35 short"; total $2,040 in Buy now. legacy adjust. |
| 8 | Maya, gym $60 | Typical $800, low month April −$400 → `fits_month` + "A low month like April ends $460 short"; Rough or Fair, with the spread named. |
| 9 | $2,400 vet bill in June | It is one month of six and only shifts rank, so the typical month is unchanged; the June dot is labelled "vet $2,400"; "Leave it out" barely moves it. |
| 10 | Sofa $4,000, 18 Oct | `uses_emergency` light: $2,600, protection 3.0 → 2.2, rebuilt in about 7 months; Buy later about May. |
| 11 | Leo, $700 laptop, $900 cash | `uses_emergency` heavy: protection 0.4 → 0.1, rebuilt in about 5 months; Instead shows $60 × 12 fits a typical month. |
| 12 | Tia, $350 tickets, $300 cash, payday 28 Oct | `not_yet` cash now: "$50 short until payday on Oct 28." |
| 13 | New user | With rough figures: same ladder, title "· rough figures (your own figures)"; with none: `not_enough`. |
| 14 | 2 months logged | Typical = median of 2, low = lower month; every title Rough. |
| 15 | August under-logged | August set aside with a question; typical from 5 months; confidence down one level. |
| 16 | $3,000 holiday in June | Today `uses_emergency` $1,600 (3.0 → 2.5); "Plan for it" makes a pot of $375/mo, so the typical month shows about $50 until June. |
| 17 | Dana, loan $350, line set at 30% | `fits_month` (monthly) + notice "Debt payments would be 35% of take-home, over the 30% you set." legacy adjust (C2). |
| 18 | Kim, $1,800 tax refund | Typical unchanged (median); buffer +$1,800, so a treat up to the buffer is `fits_buffer`. |
| 19 | Yearly $1,200 insurance not set up | One high month, ignored by the median, so the typical month overstates by about $100/mo; the buffer absorbs it; "Looks like a yearly bill. Add it?" once a second year shows the repeat, or the user adds it. Then the typical month falls by $100. |
| 20 | Raise to $4,400, new $50 gym bill | Pay and bills come from today's schedule, so the typical month is $775 at once. |
| 21 | Priya, half of a $1,600 fridge | Judged on her $800 share with her share of cash and months; household view in Phase 8. |
| 22 | Dog $800 + $120/mo | `fits_buffer`: uses $375, $600 left; monthly: typical leaves $305, clause "A low month like September ends $70 short." |

---

## 9. Still open for the owner (panel pick first)

1. **Urgent fixes (D1).** (a) Ship Option A now, because B1 and B2 give false "fits" today; (b) wait for 05.1.
2. **Essentials' spending figure.** (a) Median of all non-bill spending: cautious and needs no classifier (Sam's protection is shown against $3,275); (b) exclude big lines, which brings back a size rule (Sam $3,000).
3. **Before Grow, when emergency savings are under target.** (a) This month's leftover tops up emergency savings first, the cautious pay-yourself-first view (old B5b); (b) this month's leftover counts as buffer whatever the target.
4. **Low-month clause for monthly costs.** (a) Show it in the title and map it to amber; (b) show it as a fact only, keeping green.
5. **Tiny purchases that would touch emergency savings (old B7).** (a) The same `uses_emergency` facts in amber, never red; (b) a neutral line under a set share of essentials.
6. **Lender lines (C2).** (a) Facts as "rules of thumb", a notice only once the user sets a line; (b) lender view on loan and property checks; (c) keep as today.
7. **Flow and payment plans in the first answer (C3, C4).** (a) Quick field → answer → buttons, with plans shown in the first answer once picked; (b) keep five lighter steps.
8. **Example-rate set.** (a) 2 / 5 / 7% plus 0% and a typed rate, as decided, reviewed by counsel in the Compliance phase; (b) a different set.
9. **setbacks, stress and incomeAtRisk.** (a) Delete them from Decide, since protection months covers "if income stops"; (b) keep them in the working.
10. **Words (C6, updated).** buffer, emergency savings, protection (months of essentials), typical month, low month, Not yet, Record as bought / Plan for it / Not buying. (a) Accept; (b) word by word.
11. **Still open from v1, unchanged:** C5 (levels and working), C7 (odd-month prompts), C9 (show how past answers held up), D3 (5-person test), E1 to E3 (households, marking spendable cash, outside counsel).

Settled by the revised direction, so no longer asked: A2b, A3–A5, A9 (the median already ignores a windfall, and the cash still shows), A10, A11, B4, B6, C1, C8.
