# Decide rebuild: the plan, v3 (owner's third round)

Written 2026-10-25. It replaces v2 (`00-REBUILD-PLAN-v2.md`) and v1 (`00-REBUILD-PLAN.md`) wherever they differ. Both are kept unchanged for comparison.

Source: the owner's messages of 2026-10-25 (rounds 1–3) and the decisions in `00-OWNER-DECISIONS.md`. Where v3 and an earlier document disagree, v3 wins.

Nothing here has been built. No code or git has changed.

---

## 1. Plain-English summary

1. **Decide answers one question:** "If I buy this, am I still OK this month, and after?" It uses fixed rules, your own records and what you tell it. No AI and no voice.
2. **It starts from recurring payments.** Your regular pay and regular bills are the backbone of every month, so the app finds them first and asks you to confirm them.
3. **Then it compares money in with money out.** What is left this month, after all bills and expenses, is **unspent money this month**.
4. **Unspent money builds up in your bank balance over time.** You tell the app how much of your balance is truly unspent: the balance minus bills still due, the everyday spending still expected this month, envelopes and your emergency fund.
5. **Unspent money can be used for anything.** Your **emergency fund** is different. It is a goal you build and keep, for real emergencies only. It is never part of an ordinary purchase check.
6. **Pots are now called envelopes:** money set aside for something specific.
7. **Not everyone is paid the same way.** On first use, Decide asks how you are paid (salary, commission, freelance or business, no fixed income, or a mix) and how you want uneven income treated. You choose. The app does not guess.
8. **A purchase gets one of these answers:**
   - fits this month;
   - fits from your unspent money;
   - not yet (ready in N months);
   - for a real emergency only, uses your emergency fund.

   When the app is not sure, it asks you for the missing numbers instead of guessing.
9. **The size of a purchase decides how many questions are asked.** There are 15 price bands, from $50 to over $10M. A purchase's band comes from its **whole value**, even when it is paid in instalments.
10. **Some items always get their own set of questions:** cars, homes, tuition, tax, insurance. Each set asks for that item's usual extra costs. It never fills in amounts for you.
11. **Bigger purchases ask "What is this for you?"** The choices are: an investment in yourself, for work, a necessity, nice to have, a treat, a luxury. It also asks what the item is worth to you and whether there are alternatives.
12. **Payments can be weekly, every 2 weeks or monthly** (owner, 2026-10-25: "twice a month" removed; 1st-and-15th pay is counted as 24 payments a year). The app asks for the interest rate (or APR) and fees, then shows the whole plan: price, tax, fees, interest and running costs, the total, and each payment.
13. **"What could I do instead?"** sits one tap away. It compares buying now, keeping the money, putting it in a **fixed-rate deposit** from a bank or finance company, and buying later. The app shows the trade-offs and never ranks them.
14. **Emergency-fund advice becomes a plain fact:** "An emergency fund goal isn't set yet." The app never says "you should". The emergency fund lives in the next phase (Grow).

---

## 2. What the owner decided in this round

| # | Owner decision (2026-10-25) |
|---|---|
| O1 | Rename **buffer** to **unspent money** (also "unallocated funds"). It can be used for anything. |
| O2 | Rename **pots** to **envelopes**. |
| O3 | The **emergency fund is a goal**, kept for real emergencies. It is never part of a purchase check unless the purchase is an emergency (for example, a broken laptop screen). |
| O4 | The emergency fund is built in the next phase (Grow) as a savings and investment area with an emergency-fund slot. Decide shows it and points users to plan for it. |
| O5 | Decide gets its **own first-use setup**: questions that shape the answers and set the app up for what the user provides. |
| O6 | **Unspent money is not the bank balance.** A balance can look healthy and be drained by month end. Unspent money is what is actually left after all bills and expenses are paid out of that month's income. |
| O7 | For **salaried** users the real measure is the month's income against its expenses. For **commission and freelance** users it is closer to the bank balance. These users are **asked their preference**: match to income, large revenue at different intervals, or consistency. Some have no fixed income at all. |
| O8 | **Side income counts**, including side businesses and investment income such as dividends that are spent, not rolled over. |
| O9 | **"Invest instead" uses fixed-rate investments** offered by banks and finance companies, not market returns. |
| O10 | **"What is this for you?"** An investment in yourself, for work, pleasure, a necessity, nice to have, a luxury. What is it worth to you? Are there alternatives? These are deeper questions for bigger purchases. |
| O11 | **Checks are tiered by value in 15 bands**: 50–100, 101–500, 500–1k, 1k–5k, 5k–10k, 10k–20k, 20k–50k, 50k–100k, 100k–200k, 200k–500k, 500k–1M, 1M–2M, 2M–5M, 5M–10M, 10M+. Each band has its own tier of questions. |
| O12 | A purchase's band comes from its **whole value**, even when it is paid periodically. |
| O13 | **Preset questions and layers**, not preset costs, are attached to certain entries (cars, houses and so on: associated costs, fees, expenses, tax). The bands go with these preset questions. |
| O14 | **When the system is not sure, the user guides it:** income for the month, expenses, savings, loan payments, investments. |
| O15 | **Recurring payments are the substance** of both expenses and income. Work out recurring payments first and find what repeats each month. |
| O16 | The old **worst month and average are faulty**. They are removed. |
| O17 | **Periodic payments need the APR and the rate.** |
| O18 | **Some expenses cannot go on a card.** |
| O19 | **Show the whole plan in numbers:** instalment total with interest and APR, the monthly figure, plus tax and other costs where they apply. |
| O20 | **Unspent money builds up in the bank balance.** It is the comparison of what goes in against what goes out that matters. |
| O21 | **The "unspent money saved up" figure:** the owner agrees with bank balance − bills still due − envelopes − emergency fund, and **the user tells the app what it is**. |
| O22 | **Variable income preference:** the user chooses during setup. No default is imposed. |
| O23 | Follow the **plain, non-judging language** from the UI advice: "could leave you short", "based on your records", no approve or reject wording. |

Still in force from earlier rounds:
- one-off buys start from **this month**;
- monthly costs use the **typical month**;
- "What could I do instead?" sits one tap after the verdict;
- a wrong "fits" is worse than a wrong "no";
- no fixes until the owner says so.

---

## 3. The change log: what is changing, from what, to what, and how

### 3.1 Words

| What | Was (v2 / today's app) | Now (v3) | How |
|---|---|---|---|
| Spare money | "buffer" (v2); "free" / "overspent" (today, D-106) | **unspent money** (UI); "unallocated funds" (docs) | i18n catalogue rewrite in 05.2 |
| Set-aside money | "pots" (D-105, today) | **envelopes** | UI rename only. The `savings_goals` rows and the `potsSaved` engine field keep their names in code, so there is no schema change for the rename |
| Emergency money | "emergency savings" / "protection" (v2); "cushion" (today) | **emergency fund** (a goal) | New wording; the "protection months" rung is removed from ordinary checks |
| Month figures | "This month", "Worst", "Average" + Judge on (today) | **this month** and **typical month** | Judge-on retired (as in v2) |
| Purpose | none | **"What is this for you?"** | New question layer |
| Investment comparison | "invested instead" at a typed rate (today); 2/5/7% examples (v2) | **fixed-rate deposit** at the rate you enter | Rename and reframe (see 3.8) |
| Answers | Go ahead / Wait / Pass (today) | **Record as bought / Plan for it / Not buying** | As agreed in v1 C6 |
| Tone | "Doesn't fit right now", "What breaks" | "This could leave you short", "Based on your records…" | Copy table (05.1 S3) |

### 3.2 The money model

| What | Was | Now | How |
|---|---|---|---|
| Starting point | All spending averaged by basis (today); paired median of everything (v2) | **Recurring first**: confirmed recurring income and bills, then everyday spending | New `month/recurring.ts` step ahead of the month model (see 4.1) |
| This month | Logged + still-due only (today, bug B1); projected (v2) | **Projected**: recurring income due − recurring bills due − logged − everyday still to come | Kept from v2 (Erest), now built on recurring-first |
| Typical month | Paired median of all non-bill spending (v2) | Recurring income − recurring bills − **median everyday spending** − set aside | Same idea, but recurring lines are no longer inferred from history medians |
| In vs out | Hidden in folds | **Shown first:** "October: $4,000 in · $3,575 out so far + about $X still to go" | New home and working element |
| Saved-up money | v2 "buffer" = spendable cash − emergency target − pots, computed by the app | **Unspent money** = balance − bills still due − everyday still expected − envelopes − emergency fund. **The user confirms or types it** | The app proposes a figure; the user confirms or edits it. A stored figure is shown with its as-of date |
| Emergency money | v2: default target 3 × essentials taken out of cash automatically | **The user tells the app its emergency fund** (amount or account). Grow (Phase 6) later holds it as a goal slot. "Not set" is allowed | No automatic target. "Not set" is shown as a fact with a "Set it in Grow" link (Grow not built yet: "Set an amount") |
| Essentials | v2 open question (big lines in or out) | **Not needed for purchase checks** | It was only used to size and measure emergency protection, which has left purchase checks. It returns in Grow for "months covered" |
| Variable income | One rule for everyone | **The user chooses at setup** (see 4.2) | New income profile |
| Side income and dividends | Counted if logged as income | Each income line is marked **available (spent)** or **reinvested / kept** | New flag on income series |
| Worst / Average | Today's bases | **Deleted** | As in v1 and v2 |

### 3.3 The answer ladder

| v2 code | v3 code | Change |
|---|---|---|
| `fits_month` | **`fits_month`** | Same |
| `fits_buffer` | **`fits_unspent`** | Renamed. Measured against the user-confirmed unspent money |
| `uses_emergency` (light / heavy) on any purchase | **`emergency_use`**, only when the user marks the purchase as an emergency | Never reached by an ordinary purchase |
| `not_yet` | **`not_yet`** | Now also covers "would need your emergency fund" for ordinary purchases. The emergency fund is shown as untouched |
| `monthly_short` | **`monthly_short`** | Same, against the typical month |
| `not_enough` | **`needs_input`** | Becomes actionable: "Help me check this" asks for this month's income, expenses, savings, loans and investments |

Six codes stay. They are renamed and narrowed.

### 3.4 Tiers, bands and preset question layers (new)

| What | Was | Now |
|---|---|---|
| Questions per check | The same 5-step flow for a $5 coffee and a house | **15 bands** set by whole value. Each band opens a fixed stack of question layers (section 5) |
| Item extras | Running-cost categories listed by item type (D-55; the user types amounts) | **Preset question layers** by item type: vehicle, property, tuition, tax, insurance, electronics, subscription, emergency repair, general. Each asks its usual costs, fees, tax and card rules. Amounts are never filled in |
| Band value | n/a | **Whole value** = price + tax + one-off fees, before interest. Instalments never lower the band |
| Currency | n/a | The band is measured in the user's home currency (`currency.ts` converts) |

### 3.5 Purpose and value (new)

"What is this for you?" has these choices: **An investment in me · For work or income · A necessity · Nice to have · A treat · A luxury.**

At higher bands two more questions follow: "What is it worth to you?" and "Did you look at alternatives?"

The answers decide **which questions and comparisons appear**. They never change the maths of the verdict, with one exception: **only "A necessity" or "For work" can be marked an emergency.**

### 3.6 Payments

| What | Was | Now |
|---|---|---|
| Schedules | Monthly only (`plan.ts` monthly steps) | **Weekly, every 2 weeks, monthly** ("twice a month" removed by the owner). Quarterly and yearly are an open question |
| Rate | APR for cards and loans, never defaulted (D-07) | **The interest rate and fees, or the APR.** Both are shown when both are known. Still never defaulted |
| Total plan view | Scattered across folds | **One plan card:** price + tax + fees + interest + running costs = **total**; number of payments, each payment, monthly equivalent, end date |
| Card rules | `cardRule.ts`: blocked / capped / permitted by item type and region | Kept and shown **in the question layer**, for example "Most dealers cap card payments for a car" or "A property deposit can't go on a card" |

### 3.7 Emergency fund in Decide

- It is **shown, never spent** in ordinary checks: "Emergency fund $6,000 · untouched."
- If it isn't set: "An emergency fund goal isn't set yet." with **Set an amount** (Grow later: "Set it up in Grow").
- If the user marks the purchase as an emergency: the answer can use it, and shows how much is used and how long it takes to rebuild at the typical pace.
- **Old v2 rung 3 and protection months are removed from purchase checks.** They move to Grow.

### 3.8 "What could I do instead?"

| Future | v2 | v3 |
|---|---|---|
| Buy now | Cash, monthly, debt, buffer, protection | Cash, plan card (total, payments), **unspent money after**, emergency fund untouched |
| Keep it | Buffer and protection kept | **Unspent money kept** |
| Invest it | Market growth at 0/2/5/7% examples | **Fixed-rate deposit** (term deposit, GIC, CD) at a rate the user enters from their bank or finance company. 0% is always shown. Market examples are removed |
| Buy later | When the buffer covers it | When **unspent money** covers it, at the typical pace |
| Item value | Optional earnings, savings, resale | Same, plus the purpose answer shown on top |
| Trade-off explorer | Flex everyday spending or flexible saving | Same rules. Never bills, required debt payments or the emergency fund |

Why the fixed-rate deposit: its rate is published and guaranteed, so the comparison is checkable and isn't a forecast. That removes the compliance flag v2 raised on suggested market rates. D-51's principle (the user types any non-zero rate) comes back.

### 3.9 Setup and "help me check" (new)

- **Decide setup on first use:** six short steps (section 6).
- **"Help me check this"**: when records are thin or stale, the user types this month's income, expenses, savings, loan payments and investments, and the app answers from those figures (marked "from your figures").

---

## 4. The v3 model in detail

All money is in integer minor units (bigint). `divideHalfUp` is the only rounding (D-21). The engine stays pure.

### 4.1 Recurring first (O15)

```
1. Normalise payee: trim, lower case, strip trailing numbers and store codes, then the user's own rename map.
2. Group by (payee, direction, account) and look for a regular gap:
     weekly 7±2 days · every 2 weeks 14±3 · two fixed dates each month (1st/15th, ±3 → stored as two
     monthly series in one pay group, shown as "Every 2 weeks", counted 24/yr) · monthly 28–33 ·
     quarterly 85–95 · yearly 360–370
3. Amount tolerance: within ±10% of the group's median, or the same amount (subscriptions).
4. Candidate when it repeats at least 3 times (monthly and shorter), or 2 times (quarterly, yearly).
5. Ask, never assume: "Rent $1,800, around the 1st, monthly. Is this a regular payment?" [Yes] [Not regular] [Edit]
6. Confirmed series feed the month at today's amount (D-23 smoothing kept). Unconfirmed candidates never
   count as income; an unconfirmed candidate bill counts as everyday spending (cautious, A1).
```

Most of steps 5–6 already exist as series (`series.ts`, recurring series in Record). New work: candidate detection and the confirm prompt.

### 4.2 Income profile (O7, O8, O22), set in Decide setup

| Choice | How "income this month" is worked out |
|---|---|
| **Salary or wages** | Confirmed pay series, at the dates due this month |
| **Commission / freelance / business**, and the user picks one of: | |
| ↳ (a) Match to what comes in | Only income actually received, plus confirmed invoices due by month end that the user marks "expected" |
| ↳ (b) Large payments at different times | Each large payment is spread over the months it has to cover. The user sets "this covers N months" |
| ↳ (c) Pay myself a steady amount | The user sets a steady monthly amount. Income above it adds to unspent money; a shortfall draws from it |
| ↳ (d) Go by my bank balance | Unspent money = balance − bills over the next 1–3 months (user picks) − envelopes − emergency fund |
| **No fixed income** | As (d), with "needs your figures" when the balance is stale |
| **A mix** | Salary part as salaried; other lines per their own choice |

Each other income line (side business, rent, dividends, interest) is marked **available** (it is spent or used, so it counts) or **reinvested / kept** (it doesn't count). The default is to ask; nothing counts until it is marked.

### 4.3 Definitions

| Term (user word) | Definition |
|---|---|
| **Money in this month** | Income received + confirmed income still due (per profile), my share |
| **Money out this month** | Recurring bills paid and due + everyday spending logged + **everyday still to come** (Erest) + set aside (debt minimums, committed saving, envelope set-asides) |
| **Unspent this month** | Money in − money out. This is the "this month" figure |
| **Typical month** | Recurring income (today's amounts) − recurring bills − **median everyday spending** of the last 6 full months − set aside. One bad month can't move a median |
| **Low month** | The second-lowest real month of the last 6 (from v2). Shown only for monthly costs |
| **Unspent money** (saved up) | **User-confirmed:** bank balance − bills still due this month − **everyday spending still expected this month** − envelopes − emergency fund. The app shows the sum it suggests, and the user confirms or types a figure. Stored with an as-of date; if older than 30 days, the app asks again. *Refinement of O21:* subtracting the expected everyday spending means October's leftover is inside this figure once, never added on top (I19) |
| **Emergency fund** | The amount or account the user names (Grow later). "Not set" is allowed. It is never counted in unspent money |
| **Envelopes** | Money set aside for a named purpose (old pots, D-101). Never available to a purchase except its own envelope |
| **Whole value** | Price + tax + one-off fees, my share, in home currency. It sets the band |

### 4.4 Formulas

```
# this month (Erest from v2 kept: never assume spending stops)
Erest      = max(divideHalfUp(E*(N−d), N), max(0, E − everydayLogged))
moneyIn    = incomeReceived + incomeDueConfirmed(profile)
moneyOut   = billsPaid + billsDue + everydayLogged + Erest + setAside
monthLeft  = moneyIn − moneyOut

# typical month
E           = median(everyday_m over last ≤6 full months)        # everyday = non-recurring, non-transfer out
typicalLeft = recurringIncome_today − recurringBills_today − E − setAside

# unspent money (user-confirmed)
suggested   = balance − billsDue − Erest − envelopes − emergencyFund   # shown as a worked sum; includes this month's leftover once
unspent     = userConfirmed ?? null                                # null → needs_input for anything above this month's room
# under profile (d): suggested = balance − bills over the next k months − envelopes − emergencyFund

# a payment plan at any frequency f ∈ {weekly 52, biweekly 26, monthly 12} per year
perMonth    = divideHalfUp(payment * perYear(f), 12)
count       = divideHalfUp(perYear(f) * termMonths, 12)
interest    = amortise(financed, rate or APR, f, count)            # payoff/ engine, now per period
planTotal   = price + tax + fees + interest
```

### 4.5 The judge

`P` = my share of what is paid on day one. `M` = my share of the monthly equivalent of payments plus running costs.

```
if no confirmed recurring income and no figures typed     → needs_input
cash check: P > cash available before the next pay, or the 90-day low point < 0 → not_yet (until payday / not covered)
one-off part:
  P <= max(0, monthLeft)                                  → fits_month
  P <= unspent  (unspent confirmed)                       → fits_unspent   (uses P, of which A from October; Y = unspent − P left)
  unspent unknown and P > max(0, monthLeft)               → needs_input    ("Confirm your unspent money")
  purchase marked emergency and P <= unspent + emergencyFund → emergency_use (uses Z of the fund, rebuilt in N months)
  otherwise                                               → not_yet        (ready = ceilDiv(P − max(0,unspent), typicalLeft) months)
monthly part:
  typicalLeft − M < 0                                     → monthly_short
  lowLeft − M < 0                                         → fits, plus the low-month clause in the title
stricter of the two parts leads; notices never change the code
```

**Notices** (above the answer, never a code):
- "Your typical month is already short by $X."
- "October is heading about $X short, mostly {largest line}."
- "Your unspent money was confirmed 34 days ago."
- "An emergency fund goal isn't set yet."
- "{k} changes not saved yet."

### 4.6 One code, one sentence (the language rules from the UI advice)

| Code | Title | Body |
|---|---|---|
| `fits_month` | This fits in October's money. | "October is on track to leave about $X, including the everyday spending still to come." |
| `fits_unspent` | This fits from your unspent money. | "October's money covers $A of it. $Y of unspent money stays. Your emergency fund is untouched." |
| `not_yet` (until payday) | This could leave you short until payday. | "Based on your records, cash is $X less than the price until {date}." |
| `not_yet` (not covered) | Not yet. Your unspent money doesn't cover this. | "At your typical pace, it's covered in about N months ({month})." |
| `monthly_short` | This payment could leave you short each month. | "A typical month leaves $A; this adds $M." |
| `emergency_use` | This uses $Z of your emergency fund. | "Marked as an emergency. At your typical pace it's rebuilt in about N months." |
| `needs_input` | A little more is needed to check this properly. | Lists what's missing, with "Help me check this" and "Update my records". |

**Banned words:** should, recommend, advice (footer only), approve, decline, go ahead, you can, safe, free (money sense), best, better, worth it, will run out. Forecasts always say "could" or "based on your records".

**Footer:** "Worked out from your own records and what you told us. A record-keeping and planning tool, not financial advice."

---

## 5. Bands and question layers

### 5.1 The layers

| Layer | Questions |
|---|---|
| **L0 Basics** | Item · price · how you'll pay (all at once / periodic payments) |
| **L1 Purpose** | "What is this for you?" (investment in me / for work or income / necessity / nice to have / a treat / a luxury) · "Is this an emergency or replacing something broken?" (only for necessity or for work) |
| **L2 Value** | "What is it worth to you?" (it earns $/month · it saves $/month · I'll use it for N years · resale after N years) · "Did you look at alternatives?" (cheaper option at $, used or refurbished, rent or borrow) |
| **L3 Payment plan** | Frequency · term · each payment · interest rate or APR · fees (set-up, monthly, end-of-term) · deposit or down payment · trade-in |
| **L4 Item extras** | The preset question set for the item type (5.3) |
| **L5 Whole plan** | The plan card: price, tax, fees, interest, running costs, total, payments; plus "What could I do instead?" opened by default |
| **L6 Major asset** | Deposit source · closing or legal costs · moving costs · how long you'll keep it · what changes in your month after (new bills, old bills that stop) |
| **L7 Very large** | Several funding sources (unspent money, envelopes, sale of another asset, a loan) · staged payments over dates · "Checked with a professional?" (a fact the user records, not advice) |

### 5.2 Band → layers (the band is the whole value)

| Band | Whole value | Layers asked |
|---|---|---|
| 1 | under 50 | L0. Instant answer, no "instead" link |
| 2 | 50 – 100 | L0 |
| 3 | 101 – 500 | L0 · L1 (purpose only) |
| 4 | 500 – 1k | L0 · L1 |
| 5 | 1k – 5k | L0 · L1 · L2 · "instead" link prominent |
| 6 | 5k – 10k | L0 · L1 · L2 · L3 if periodic · L5 |
| 7 | 10k – 20k | + L4 when an item type has extras |
| 8 | 20k – 50k | L0–L5 |
| 9 | 50k – 100k | L0–L5 · L6 |
| 10 | 100k – 200k | L0–L6 |
| 11 | 200k – 500k | L0–L6 |
| 12 | 500k – 1M | L0–L7 |
| 13 | 1M – 2M | L0–L7 |
| 14 | 2M – 5M | L0–L7 |
| 15 | 5M – 10M, and 10M+ | L0–L7 · staged payments required |

Rules:
- **An item type adds its L4 set at any band.** A $3,000 used car still gets the vehicle questions.
- **A higher band never asks fewer questions** (invariant I33).
- Band edges are constants with a "FincWin choice" tag. They are measured in home currency.

### 5.3 Preset question sets by item type (L4): questions, never amounts

| Item type (existing `ITEM_TYPES` plus new) | Questions asked | Card rule shown |
|---|---|---|
| **Vehicle** | Insurance a month? · Fuel or charging a month? · Maintenance a year? · Registration and licence a year? · Loss of value (optional) · Sales tax or levy? · Dealer and documentation fees? · Trade-in value? | "Most dealers cap card payments" (capped, `marketDefaults`) |
| **Property** | Deposit? · Property tax a year? · Home insurance? · Maintenance a year? · Utilities change? · Service or strata charge? · Legal and closing costs? · Land or transfer tax? · Moving costs? · Does rent stop (old bill ends)? | "A property deposit can't go on a card" (blocked) |
| **Tuition** | Books and materials? · Travel? · Accommodation? · Does income change while studying? | Fee note (`tuition_fee`) |
| **Tax** | Due date? · Penalty if late? · Instalment plan offered? | Region rule (blocked in GB; processor-fee note elsewhere) |
| **Insurance premium** | Yearly or monthly? · Does an old premium stop? | permitted |
| **Electronics** (new) | Warranty or protection plan? · Accessories? · Monthly subscriptions that come with it? · Trade-in or resale? | permitted |
| **Subscription / membership** (new) | Joining fee? · How often billed? · Minimum term or cancellation fee? · Price after the intro period? | permitted |
| **Emergency repair** (new) | What broke? · Is a repair or a replacement cheaper? · Insurance or warranty cover? | permitted |
| **General** | Insurance? · Maintenance? · Loss of value (optional) | permitted |

These replace the running-cost lists in `runningCostPrompts.ts` (D-55) with a richer `presetQuestions.ts`. D-05 stays: **amounts are always typed.** Where the user's own records hold a matching line (an existing car insurance series), the field **suggests** it ("You pay $140 a month for car insurance now. Use it?").

---

## 6. Decide setup (first use, O5)

1. **How are you paid?** Salary or wages · Commission · Freelance or business · No fixed income · A mix.
2. **If your income varies, how should Decide count it?** (a) Match what comes in · (b) Large payments spread over the months they cover · (c) Pay myself a steady amount · (d) Go by my bank balance. **You choose; there is no default.**
3. **Other income?** Side business, rent, dividends, interest. For each: "I spend it / it's available" or "It's reinvested or kept".
4. **Your regular payments.** The app shows the recurring income and bills it found. Confirm, fix or add.
5. **Your emergency fund.** Name an amount or an account, or "Not set yet". (Grow takes this over later.)
6. **Your envelopes.** Anything already set aside for a purpose.
7. **Your unspent money right now.** The app shows its suggested sum (balance − bills still due − everyday spending still expected this month − envelopes − emergency fund). Confirm or type your own figure.

Setup can be skipped. Every answer then carries "rough" and a "Finish setup" link. Each step can be changed later in Decide settings.

**"Help me check this"** is the short version for a single check: this month's income, expenses, savings, loan payments and investments.

---

## 7. What the user sees (05.2 screens)

| Screen | Contents |
|---|---|
| **Setup** (7 short steps) | Section 6 |
| **Home** | "October: $4,000 in · $3,575 out" bar → "On track to leave about $425" · Typical month · Unspent money (with as-of date) · Emergency fund (or "not set") · "Check a purchase" · Saved plans |
| **Check** | L0, then the band's layers appear as the price is typed; the item-type chips (Vehicle, Home, Electronics, Subscription…) open L4 |
| **Answer** | One title and body (4.6), then three facts: October left after · Unspent money before → after · Emergency fund (untouched / used) · assumptions line · "What could I do instead?" · "See how this was worked out" · Record as bought / Plan for it / Not buying |
| **Plan card** (L5) | Price · tax · fees · interest (rate and APR) · running costs → **total** · N payments of $X {frequency} · about $Y a month · ends {date} |
| **What could I do instead?** | Buy now · Keep it · Fixed-rate deposit at [your rate] · Buy later; item value; trade-off explorer; "The choice is yours" |
| **Needs input / Help me check this** | What's missing, with a short form |
| **Working** | Recurring list · money in vs out · your months (6 dots) · unspent money sum · envelopes · cash day by day · what this assumes |

**Mockup changes needed** (canvas "Can I Afford It — Decide mockup"):
- rename buffer → unspent money and pots → envelopes;
- remove "uses emergency savings" from ordinary answers, and reframe the sofa screen as `not_yet`;
- add an emergency-purchase screen (broken laptop screen);
- add the in-vs-out bar on home;
- add APR, rate and fees to periodic payments, and a plan card;
- add Purpose (L1) and Value (L2) steps;
- add an item-type chip row and a vehicle L4 example;
- replace Invest with a fixed-rate deposit;
- add Setup screens and a "Help me check this" form.

---

## 8. Module map (changes from v2)

| Module | v3 fate |
|---|---|
| **New** `month/recurring.ts` | Candidate detection, gap and amount rules, confirm state (4.1) |
| **New** `month/incomeProfile.ts` | Income this month per profile (4.2), available or reinvested lines |
| `month/thisMonth.ts` (v2) | Kept; built on recurring-first; money in vs out |
| `month/typical.ts` (v2) | Kept; E = median everyday; recurring lines from series, not medians |
| `pots/` (v2 buffer, emergency, protection) | **Becomes `funds/`:** unspent (user-confirmed + suggested sum), envelopes, emergency fund (user or Grow). **Protection months removed** from Decide |
| `reserve.ts` (cushion) | **Deleted from Decide** (moves to Grow as "months covered") |
| **New** `judge/bands.ts` | 15 bands, whole value, layer lists, category additions |
| `runningCostPrompts.ts` | **Replaced** by `presetQuestions.ts` (5.3); D-05 kept |
| `cardRule.ts`, `marketDefaults.ts` | Kept; shown inside L4. Add electronics, subscription and emergency repair item types |
| `plan.ts`, `payoff/` | **Changed:** payment frequency (weekly, biweekly, monthly), rate or APR, per-period amortisation |
| `investmentViews.ts`, `projectionRates.ts` | **Changed:** fixed-rate deposit framing; the v2 `EXAMPLE_RATES` is dropped; the user's typed rate plus 0% |
| `wait.ts`, `alternatives.ts`, `options.ts`, `bisect.ts`, `ownership.ts`, `payback.ts` | As v2, re-fed with unspent money |
| `incomeAtRisk.ts`, `setbacks.ts`, `stress.ts` | Deleted from Decide (as v2 Q9) |
| `firstRead.ts` | Replaced by setup + "Help me check this" |
| Snapshot `buildSnapshot.ts` | Adds income profile, confirmed unspent money with as-of date, emergency fund, recurring candidates |
| Copy | One `verdictTable.ts` with the 4.6 rows; banned-word tests extended |
| UI | Setup, Home, Check (layered), Answer, Plan card, Instead, Needs input, Working; Judge-on and the five steps retired |

---

## 9. Safety rules

Kept from v2: I1–I16, I18–I22, I25, I26 (updated word list), I27–I30.

Changed:
- **I17 Funds are partitioned:** unspent + envelopes + emergency fund + bills still due ≤ balance. A purchase never draws on an envelope it doesn't belong to, and never on the emergency fund unless it is marked an emergency.
- **I23, I24:** the low-month clause stays for monthly costs. Grading of emergency use applies only to `emergency_use`.

New:
- **I31 Emergency fund locked:** with the emergency flag off, the code and every figure are identical whether the emergency fund is $0 or $1M.
- **I32 Whole value sets the band:** changing the payment schedule never changes the band.
- **I33 Bands are monotone:** a higher band's layer list includes every layer of a lower band.
- **I34 Recurring is confirmed:** an unconfirmed recurring candidate never counts as income, and never lowers a bill.
- **I35 User figure wins:** a user-confirmed unspent figure is used as given (never raised by the app). A stale one (over 30 days) caps confidence and shows the notice.
- **I36 No invented amounts or rates:** every amount in L3 and L4 and every non-zero rate was typed or confirmed by the user (D-05, D-07, D-51 restored).
- **I37 Frequency maths:** for every frequency, the monthly equivalent × 12 equals the payment × payments per year, within one minor unit.
- **I38 Purpose never changes the maths:** except that only necessity or for-work can be marked an emergency.
- **I39 Profile honesty:** under profile (a), income not yet received never counts unless marked expected. Under (d), the bills horizon the user picked is always subtracted.

The **bugs B1–B16** (v2 section 6.2) all still stand on today's engine.

---

## 10. What is discarded

### From today's built app (Phase 5 as shipped in PR #82)
- **Judge-on dropdown** and the This month / Worst / Average bases (D-107); the three-basis outcome card.
- **Worst month** (min income + max spending from different months) and the **plain-mean average**.
- **"Free" / "overspent" wording** (D-106) and "short"; "Go ahead / Wait / Pass".
- **"Cushion"** in purchase checks and its months figure; the auto-sized cushion of 3 / 4.5 / 6 months.
- The **pausable-saving relief** inside the verdict (D-35).
- **Lender lines as gates.** 28/36/12 remain only as facts when the user sets a line (C2, still open).
- **setbacks, stress test, income at risk** from Decide.
- The **65% "cheaper" default** in alternatives.
- The **five-step check flow** and the Impact step's ten folds.
- The **first-read state machine** (replaced by setup).
- Size labels as a separate axis (B7).

### From v1 (panel plan)
- The **big-buy allowance**, its classifier, the divisor floor and the "use this month's room" rule.
- **Safety money as one pool**; the paired-month tight month as a verdict.

### From v2
- **"Buffer"** (now unspent money) and **"pots"** (now envelopes).
- **Emergency savings in ordinary purchase answers** (the `uses_emergency` rung, protection months, light/heavy grades).
- The **automatic emergency target** (3 × essentials) and the open question on essentials.
- **Market example rates 2/5/7%** in Invest it.
- Open questions now settled: v2 Q2 (essentials), Q3 (top-up before Grow), Q5 (tiny purchases and emergency), Q8 (example rates).

---

## 11. How the original Decide changes (today's app → v3)

| Today | v3 |
|---|---|
| Home "Your month" card with a big "free" figure and Judge-on | In-vs-out bar, "on track to leave", typical month, unspent money, emergency fund, Saved plans |
| Quick field → quick verdict | Kept: quick field → answer, with the band's layers shown first when needed |
| Five-step check (Item, Costs, Impact, Options, Decide) | Layered single check (L0–L7 by band and item type) → Answer → Instead → record buttons |
| Verdict: Fits / Adjust / Doesn't fit, by basis | Six codes (4.6), one sentence each |
| Cash path (90 days) | Kept in the working; fixed to never assume zero spending (B2) |
| Pots (D-105) | Envelopes |
| Cushion | Emergency fund (user-named, Grow later); out of ordinary checks |
| Running-cost prompts by item type | Preset question sets (L4) |
| Card eligibility rules | Kept; shown in L4 |
| Card, loan, instalment payment methods; monthly steps | Periodic payments at four frequencies, rate or APR, a plan card |
| Investment views ("invested instead") | Fixed-rate deposit in "What could I do instead?" |
| Wait-and-save | Buy later |
| Cheaper options, cut-a-line, earn more | Trade-off explorer (never bills, debt minimums or the emergency fund); cheaper only if typed |
| TCO (D-102) | The plan card's total and ownership costs |
| Stored checks (fits / adjust / no / missing) | Kept as `legacyState`; old decisions never recomputed |
| Undo, toasts, write queue, record buttons, What gets written | Kept |

---

## 12. The 22 situations under v3 (one line each)

Sam's figures:
- **This month:** October on track to leave about $425.
- **Typical month:** $425.
- **Unspent money:** Sam confirms **$2,400**.
- **Emergency fund:** Sam names **$9,000**, untouched.

| # | v3 result |
|---|---|
| 1 | Headphones $150 (band 3): `fits_month`. Purpose asked |
| 2 | Laptop $1,200 on Oct 3 (band 5): `fits_unspent`; October's money covers $425 of it, $1,200 of unspent money stays; emergency fund untouched |
| 3 | $250 jacket every other month: `fits_month`; the median already absorbs the habit |
| 4 | $5 coffee after a $1,000 repair: notice "October is heading short"; `fits_unspent` |
| 5 | Riley, typical month short, $60 shoes, $2,000 named as emergency fund: notice; `not_yet` (no unspent money). Emergency fund shown untouched |
| 6 | Lease $450 a month (vehicle, whole value sets the band): `monthly_short`; vehicle L4 asked |
| 7 | Phone $85 × 24 (whole value $2,040, band 5): fits + low-month clause; plan card |
| 8 | Maya, freelance, profile chosen at setup: under (c) steady amount, the gym is judged on her steady $X |
| 9 | $2,400 vet bill in June: the median ignores it |
| 10 | Sofa $4,000 (band 5): `not_yet`, covered in about 4 months (February). Emergency fund untouched (v2 said "uses emergency") |
| 11 | Leo, broken work laptop $700, marked emergency (for work): `emergency_use`, rebuilt in about 5 months |
| 12 | Tia, $350 tickets, short until payday: `not_yet` until Oct 28 |
| 13 | New user: setup, or `needs_input` with "Help me check this" |
| 14 | 2 months logged: answers marked rough |
| 15 | Under-logged August: set aside, question asked |
| 16 | Holiday $3,000: `not_yet`, or a holiday envelope at $375 a month |
| 17 | Dana's car loan: vehicle L4; debt-line notice if she set one |
| 18 | Kim's tax refund: it lands in the balance; Kim updates her unspent money and the treat is `fits_unspent` |
| 19 | Yearly insurance: detected as a yearly recurring candidate after two repeats; confirmed, it becomes $100 a month in bills |
| 20 | Raise or new bill: today's recurring amounts move the typical month at once |
| 21 | Priya's half fridge: judged on her $800 share |
| 22 | Dog $800 + $120 a month: one-off `fits_unspent`; the monthly part passes the typical month |

---

## 13. Delivery

**Option A (urgent fixes on today's engine):** still on hold by the owner. B1 and B2 (false "fits" early in the month) stay live until 05.1.

| Phase / slice | Work | Days |
|---|---|---|
| **05.1 Engine** | | **~34** |
| S0 | Golden fixtures of today's outputs (prototype, ~300 seeds, 22 situations) | 2 |
| S1 | `month/recurring.ts`: detection, rules, confirm states | 4 |
| S2 | `month/incomeProfile.ts`: profiles (a)–(d), available or reinvested lines | 3 |
| S3 | `month/` this month (in vs out, Erest) and typical (median everyday) | 3 |
| S4 | `funds/`: unspent (suggested + confirmed), envelopes, emergency fund | 2 |
| S5 | `judge/`: six codes, notices, `verdictTable` and copy tests | 4 |
| S6 | `judge/bands.ts` and `presetQuestions.ts` (layers and item sets) | 3 |
| S7 | Payment frequency, rate or APR, per-period amortisation, plan totals | 4 |
| S8 | Instead: fixed-rate deposit, buy later, explorer re-fed | 4 |
| S9 | Shadow run, parity on reused parts, back-test gate (I28), delete old paths | 5 |
| **05.2 Screens** | Setup, Home, layered Check, Answer, Plan card, Instead, Needs input, Working; 5-person reading test before and after | **~16** |
| **Phase 6 Grow** | Emergency-fund slot (one goal flagged); Decide reads it | (in Grow) |

**Data changes (small; v2 said "none"):**

| Change | Where | Why |
|---|---|---|
| Income profile and variable-income choice | new columns on `decide_settings` | Setup step 1–2 |
| Confirmed unspent figure + as-of date | `decide_settings` | O21 |
| Emergency fund amount or account (until Grow) | `decide_settings` | O3, O4 |
| Income line "available / reinvested" | new column on recurring series | O8 |
| Recurring candidate dismissals | small table, or a device hint | O15 |
| Purpose, emergency flag, frequency, rate or APR, band answers | inside the existing check `inputs` JSON | No column needed |
| Envelopes | UI rename only | O2 |

Each change ships as a migration with the usual preflight. **Production pushes only with your explicit approval.**

**Decisions to record in 05.1-CONTEXT as superseded:**
- D-07 and D-51 are **restored**: the v2 example-rate change is undone.
- Superseded: D-35 relief, D-36, D-42 (cushion), D-55 (prompts → preset questions), D-100 hero, D-105 (pots → envelopes), D-106, D-107, and v2's I24 and protection months.

---

## 14. Open questions (only what is still open)

1. **Quarterly and yearly payments:** add them to the four frequencies?
2. **Band edges:** use exactly your 15 bands, measured in home currency (recommended), or adjust them by currency?
3. **"A luxury" wording:** keep it, or use "a splurge"? (It's a neutral word choice; it never changes the maths.)
4. **How old can the confirmed unspent figure get before the app asks again:** 30 days (recommended), 14 days, or every check?
5. **Can a "nice to have" or a "treat" ever be marked an emergency?** Recommended: no, only necessity and for work.
6. **Lender lines (C2):** facts only once the user sets a line (recommended), or drop them.
7. **Urgent fixes (Option A):** still on hold. Confirm when to lift the hold.
