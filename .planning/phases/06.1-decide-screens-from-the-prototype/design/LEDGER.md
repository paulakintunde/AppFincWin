# FincWin prototype ledger

These are the records every screen follows. Today is Thursday, Nov 5, 2026. Activity (`screens/10-activity.js`, the NOV / OCT / SEP lists) holds them. That file now throws an error at build time if September's or October's total goes out drifts.

**Goes out** = bills + spending + debt payments + the regular amounts into goals ($150) and investing ($200). Activity's month totals count each line in full. Two kinds of line are left out of them: settlements, and lines JT paid from JT's own account. Insights "Mine" counts your share of shared lines.

## Accounts (C01) and what each holds

| Account | Balance | Notes |
|---|---|---|
| Everyday checking | $3,162.68 | Oct 31 statement $3,367.18, less 4 November lines not yet ticked off ($42.10 + $54.00 + $45.00 + $63.40 = $204.50) |
| Savings account | $1,940.00 | Holds the safety net $1,300 and Trip to Lisbon $640. Laptop goal is $0 |
| Cash wallet | $60.00 | |
| Visa card | owing $397.68 | October statement $188.39 (paid in full Nov 18) + November so far $209.29 (Gym 35, Streaming 17.99, Dinner out 140, Corner Café 16.30) |
| **Across 4 accounts** | **$4,765.00** | cash and banks $5,162.68, cards −$397.68 |

Grow:
- **Goals**: $1,940 saved across 3 goals. That is the safety net ($1,300 of $2,300, $100 a month, reaches it Aug 2027), Trip to Lisbon ($640 of $1,800, $50 a month, Oct 2028; started at $540 on Sep 2) and Laptop ($0 of $3,500). Together that is $150 a month into goals.
- **Investing**: $7,690, with $200 a month going in. Retirement fund $6,450 gets $150 a month; Index fund $1,240 gets $50.
- **Auto loan**: $8,420 at 6.9%, $312 a month on the 15th, paid off Apr 2029. Debt payments are 10% of pay.

**Spare money (Decide) $2,825** = checking $3,162.68 + cash $60.00 − Visa $397.68. Money in Savings (goals and safety net) is left out. Activity's running-balance view ends at the same $2,825.00, and it starts Nov 1 at $3,238.79.

**Net worth (Home) $4,035** = checking 3,162.68 + savings 1,940.00 + cash 60.00 − Visa 397.68 + investing 7,690 − auto loan 8,420.

The trend uses month-end net worth: Jun 520, Jul 1,450, Aug 2,373, Sep 3,365, Oct 4,449, and Nov 5 (today) 4,035. That gives "Up $3,515 since June". Each full month adds what was left, plus the $350 saved and invested, plus the loan principal. November so far has only spending, so it sits $413.79 below October.

## Regular lines (every month, Everyday checking)

| Day | Line | Category | Amount |
|---|---|---|---|
| 1 | Gym (Visa card) | Health | 35.00 |
| 3 | Phone bill | Utilities | 45.00 |
| 4 | Streaming (Visa card) | Subscriptions | 17.99 |
| 8 | Rent | Housing | 1,450.00 |
| 15 | Salary | Income | +3,200.00 |
| 15 | Auto loan | Debt | 312.00 |
| 16 | Into goals ($100 safety net + $50 Lisbon) | Transfer | 150.00 |
| 16 | Into investing | Transfer | 200.00 |
| 18 | Internet (split with JT from October) | Utilities | 60.00 |
| 20 | Car insurance | Insurance | 96.00 |
| 28 | Electricity (JT paid in October) | Utilities | 112.00 / 108.00 |

## September 2026: in $3,200.00, out $2,820.00, left $380.00

Sep 1 Gym 35.00 Health · Sep 3 Phone bill 45.00 Utilities · Sep 4 Streaming 17.99 Subscriptions · Sep 5 FreshCo 44.30 Groceries · Sep 8 Rent 1,450.00 Housing · Sep 10 Gas station 57.20 Transport · Sep 11 Corner Café 13.40 Dining · Sep 12 Haircut 28.00 Health (cash) · Sep 13 FreshCo 41.10 Groceries · Sep 15 Salary +3,200.00 · Sep 15 Auto loan 312.00 Debt · Sep 16 Into goals 150.00 Transfer · Sep 16 Into investing 200.00 Transfer · Sep 16 Pharmacy 18.60 Health · Sep 18 Internet 60.00 Utilities · Sep 19 Dinner out 62.00 Dining · Sep 20 Car insurance 96.00 Insurance · Sep 21 FreshCo 36.41 Groceries · Sep 25 Takeaway 41.00 Dining · Sep 28 Electricity 112.00 Utilities.

By category: Housing 1,450.00 · Transfer 350.00 · Debt 312.00 · Utilities 217.00 · Groceries 121.81 · Dining 116.40 (over the $100 cap by $16.40) · Insurance 96.00 · Health 81.60 · Transport 57.20 · Subscriptions 17.99 = **2,820.00**.

Removed to make the month balance: Bus pass, second Gas station, Bike repair, Bulk shop. FreshCo, Dinner out and Electricity got smaller.

## October 2026: in $3,200.00, out $2,730.00, left $470.00

Oct 1 Gym 35.00 · Oct 1 JT paid you +118.40 (settlement, not counted) · Oct 3 Phone bill 45.00 · Oct 4 Streaming 17.99 · Oct 6 FreshCo 41.20 · Oct 8 Rent 1,450.00 · Oct 9 Hardware store 31.40 Household · Oct 9 Gas station 58.00 · Oct 10 Dinner out 55.00 · Oct 12 Haircut 28.00 (cash) · Oct 13 FreshCo 38.95 · Oct 15 Salary +3,200.00 · Oct 15 Auto loan 312.00 · Oct 16 Into goals 150.00 · Oct 16 Into investing 200.00 · Oct 18 Internet 60.00 (JT owes 30.00) · Oct 18 Car wash 15.00 (cash) · Oct 20 Car insurance 96.00 · Oct 21 FreshCo 35.46 · Oct 22 Bakery 12.00 (cash) · Oct 24 Takeaway 49.00 (JT owes 24.50) · Oct 28 Electricity 108.00 (JT paid, you owe 54.00, not counted).

By category, lines in full: Housing 1,450.00 · Transfer 350.00 · Debt 312.00 · Groceries 127.61 · Utilities 105.00 · Dining 104.00 · Insurance 96.00 · Transport 73.00 · Health 63.00 · Household 31.40 · Subscriptions 17.99 = **2,730.00**.

Your share ("Mine" in Insights): Utilities 129.00 · Dining 79.50 · total 2,729.50, shown as $2,730.

Removed: Bus pass, Dentist, second Gas station, Pharmacy, two Corner Café, two FreshCo. FreshCo and Dinner out got smaller.

**Usual month (Decide)**: average of Sep and Oct. Comes in $3,200, goes out $2,775, leaves $425.

## November 2026 (records up to Nov 5)

Recorded so far: Nov 1 Gym 35.00 · Nov 2 FreshCo 63.40 (JT owes 31.70) · Nov 3 Phone bill 45.00 · Nov 4 Streaming 17.99, Gas station 54.00, Dinner out 140.00 · Nov 5 FreshCo 42.10, Corner Café 16.30. That is **Out $413.79**, and your share is $382.09.

Still to come:

| Date | Line | Amount |
|---|---|---|
| Nov 8 | Rent (due in 3 days) | 1,450.00 |
| Nov 15 | Salary | +3,200.00 |
| Nov 15 | Auto loan (Debt) | 312.00 |
| Nov 16 | Into goals (Transfer) | 150.00 |
| Nov 16 | Into investing (Transfer) | 200.00 |
| Nov 20 | Car insurance | 96.00 |

- Bills still to pay: $1,858.00, which is 3 bills: Rent, Auto loan, Car insurance.
- Still to come including the transfers: $2,208.00.
- Left after everything: 3,200 − 413.79 − 2,208 = **$578.21**.

## Decide

- Records run up to Nov 5. Decide uses 2 of the 3 months it looks for: September and October.
- August has no records, which matches Insights I07.
- The Records setup item stays open with this text: "Add August, or wait for November to finish on Dec 1."
- Regular bills in Decide setup: 7 bills, $1,813.99 a month, shown as $1,814. They are Rent 1,450, Phone 45, Internet 60, Electricity about 110, Car insurance 96, Streaming 17.99 and Gym 35.
- Debts: Auto loan $312, plus the Visa card, which is paid in full each month.

## Home health facts

- Safety net $1,300 ÷ usual month going out $2,775 = about 2 weeks of cover.
- $425 ÷ $3,200 = 13% of pay left over.
- $1,858.00 unpaid.
- The score is shown as 58 / 100, Steady. The score is an estimate; the facts above are computed.

## Calculators (Grow, `screens/35-calculators.js`, maths in `calc.js`)

Rules: integer cents. Rates are yearly and added monthly (rate ÷ 12). Each month's interest is rounded half up to the cent. Deposits go in at the end of each month. A "needed each month" amount is rounded **up** to the cent so the goal is actually reached (half-up would fall a few cents short). Goal maths counts deposits only, no interest (the Savings account has no rate in this ledger).

**Goal calculator, Trip to Lisbon (GC02..GC02e, confirm GC03a..e).** $1,800 − $640 = $1,160 to go; deposits on the 16th from Nov 16, 2026.

| Each month | Deposits | Reaches $1,800 | Into goals | Left in a usual month |
|---|---|---|---|---|
| $25 (GC02a) | 47 | Sep 2030 | $125 (under the $150 line) | $450 |
| **$50 (GC02, plan now)** | 24 | **Oct 2028** | $150 | $425 |
| $75 (GC02b) | 16 | Feb 2028 | $175 | $400 |
| $100 (GC02c) | 12 | Oct 2027 | $200 | $375 |
| $82.86 (GC02d, by Dec 2027) | 14 | Dec 2027 | $182.86 | $392.14 |
| $58 (GC02e, by Jun 2028) | 20 | Jun 2028 | $158 | $417 |

By Oct 2028 (24 deposits) takes $48.34 a month (G03d now says this; it said "about $49"). Laptop goal (G03f): $292 a month reaches $3,500 by **Oct 2027** (12 deposits), $150 a month by **Oct 2028** (24); G03f said Nov 2027 and Apr 2028.

**Auto loan, extra payments (GC04..GC04c, confirm GC06..GC06b).** $8,420 at 6.9% (0.575% a month), $312 on the 15th, first payment Nov 15, 2026 (interest that month $48.42).

| Extra | Each month | Payments | Paid off | Interest from now | Saved | Last payment | Debt share of pay |
|---|---|---|---|---|---|---|---|
| None (GC04c, plan now) | $312 | 30 | Apr 2029 | $756.36 | — | $128.36 | 10% |
| +$25 (GC04a) | $337 | 28 | Feb 2029 | $695.99 | $60.37 | $16.99 | 11% |
| **+$50 (GC04)** | $362 | 26 | Dec 2028 | $644.91 | $111.45 | $14.91 | 11% |
| +$100 (GC04b) | $412 | 22 | Aug 2028 | $563.18 | $193.18 | $331.18 | 13% |
| $1,000 once today (G07) | $312 | 26 | Dec 2028 | $582.04 | $174.32 | $202.04 | 10% |

G07's "about $760 / $640 / $580" agree. G08 said "+$50 saves about $120"; it is $111.45, now "about $110". With one debt, Highest rate first and Smallest balance first give the same result. G07's toggle now reads "Smallest balance first".

**Growth illustration, Investing (GC05a/GC05/GC05b).** Start $7,690.00, $200 at the end of each month, 120 months. Put in $31,690.00.

| Rate a year | After 10 years | Growth | $200 a month alone, from $0 |
|---|---|---|---|
| 2% (GC05a) | $35,935.02 | $4,245.02 | $26,543.96 |
| **4% (GC05)** | **$40,914.44** | $9,224.44 | $29,449.98 |
| 6% (GC05b) | $46,766.98 | $15,076.98 | $32,775.89 |

**Calculators page (GC01), typed numbers, no records:**
- Loan calculator (GC10): $20,000 at 7.5% for 60 months → **$400.76 a month** (standard amortisation), last payment $400.67, total interest $4,045.51, total paid $24,045.51.
- Savings calculator (GC20): target $5,000, saved $500, $250 a month from Dec 2026, 3% → **18 months, May 2028**; put in $5,000.00, interest $119.90, total $5,119.90 (also 18 months at 0%).
- Compound growth (GC30): $0 start, $200 a month, 4%, 10 years → **$29,449.98**; put in $24,000.00, growth $5,449.98.
- Debt payoff (GC40): Credit card $4,200 at 21.9% min $120; Personal loan $1,500 at 9.5% min $75; extra $100 → $295 a month in all, from Dec 2026. Extra and freed minimums go to one debt at a time.

| Order | Debt-free | Total interest | First debt cleared |
|---|---|---|---|
| Highest rate first | 24 months, Nov 2028 | $1,148.68 | Personal loan, month 22 |
| Smallest balance first | 24 months, Nov 2028 | $1,280.30 | Personal loan, month 9 |
| Minimums only ($195) | 41 months, Apr 2030 | $2,184.34 | Personal loan, month 22 |

## Scenarios (Decide answers N02..N26, from the real v3 engine)

Run once on 2026-11-06 against the real engine: `src/engine/decide/v3` in `C:\dev\fincwin-054`, branch `phase/05.4-decide-safety-patch`, commit `77e474e6` (engine revision `05.4.1`). Nothing in that repo was changed. The scripts are in `scratchpad/engine-run/` (`ledger.ts` = the ledger as engine inputs, `scenarios.ts` = the checks, `run.ts` prints every result; run with `npx tsx` from `C:\dev\fincwin-054`). Full output: `scratchpad/engine-run/run1.txt` and `results.json`.

### The ledger as engine inputs (every scenario starts here)

- Today Nov 5, 2026. Region US, sales tax typed as 8% on every check.
- Months: September and October 2026 in full (every line in the Sep and Oct lists above), November up to Nov 5 (the 8 lines above). August has no records.
- Series: pay $3,200 on the 15th; bills Rent $1,450 (8th), Phone $45 (3rd), Streaming $17.99 (4th), Gym $35 (1st), Internet $60 (18th), Car insurance $96 (20th), Electricity $112 (28th); auto loan $312 (15th, debt payment); into goals $150 and into investing $200 (16th).
- Oct 28 Electricity was paid by JT: marked "paid by someone else" for that date.
- Accounts: Everyday $2,765.00 (the $3,162.68 balance less the Visa card's $397.68, which is paid in full each month), Cash wallet $60.00, both everyday money. Savings $1,940 (safety net $1,300 and Trip to Lisbon $640; Laptop goal $0), counted as set aside. No overdraft unless a scenario says so.
- Debts: Auto loan $8,420 at 6.9%, $312 on the 15th. Visa card $397.68, paid in full (no minimum taken again).
- Safety net: protection on, locked, size $2,300 (the Grow goal), $1,300 in it.
- No "keep at least" line set (Decide setup shows it empty), so "tight" means under a tenth of a usual month's bills and everyday spending.
- The spare-money figure the user confirms is the app's own suggested sum plus the pay still to come this month (the same rule as the engine's right-answers fixtures).

### What the engine works out from the ledger (no purchase)

| Figure | Engine | Ledger before | Why they differ |
|---|---|---|---|
| A usual month leaves | **$369** ($3,200 in; out $2,831 = bills $1,816 + everyday $353 + loan $312 + goals and investing $350) | $425 | The engine counts Electricity ($112) every month. The ledger's $425 averages September and October as recorded, and October had no Electricity (JT paid it). |
| This month (November) leaves | **$112** (out $3,088) | $578.21 | The ledger's "still to come" table leaves out Internet ($60, Nov 18) and Electricity ($112, Nov 28); the engine also counts the rest of November's usual everyday spending ($294). |
| Spare money judged against | **$3,351** (what Everyday and cash hold on Nov 30 after payday and November's bills); $3,239 of it is from earlier months | $2,825 today | The engine judges spare money at the end of the month, after the Nov 15 pay. |
| "Tight" floor | **$217** (a tenth of $2,169 bills and everyday spending) | — | |
| How sure | Based on 2 of the 3 months it looks for (few_months); also early in the month. The confirmed figure differs from the bare suggested sum (unspent_drifted), because pay has not arrived yet. | | |
| Safety net | $1,300 of its $2,300 size: "small", so every plain fit reads "Fits, but your safety net is small" | | |

A purchase bought today (Nov 5) that costs more than about $1,260 is **Not yet** whatever the safety net settings (unless an overdraft covers the gap): Everyday is lowest at $1,261.85 on Nov 14, after rent on Nov 8 and before the Nov 15 pay, so the 90-day cash path would go below $0. This is why the laptop scenarios now use Jan 15 or Feb 1.

### Per screen

| Screen | Inputs (on top of the ledger) | Engine answer | Figures shown |
|---|---|---|---|
| N02, N02L, N03 | Headphones $180, cash, Dec 15 | fits_unspent · small_net: **Fits, but your safety net is small** | $194 with $14 tax; paid by this month's leftover $112 and spare money $82; spare money $3,351 → $3,156. Today, Nov 15: same answer, $3,156 stays. Cheaper $150 → $3,189 stays, $120 → $3,221. |
| N04 | Laptop **$3,600**, cash, **Feb 1** | fits_unspent · tight: **Fits, but tight** | $3,888 with $288 tax; money by Feb 1 $4,089 (spare $3,239 + Nov $112 + Dec $369 + Jan $369); **$201 left**, under $217. Today, Nov 15, Jan 15: Not yet (ready at the end of January; Jan 15 is $168 short). Mar 1: Fits, $570 left. $3,000 → Fits, $849 left; $2,500 → Fits, $1,389 left. |
| N05 | Laptop $3,500, cash, **Jan 15**, net locked | not_yet · not_covered: **Not yet**, ready 2027-01 (the end of January) | By Jan 15 $3,720; $3,780 needed; **$60 more**. Today and Nov 15 also Not yet. Feb 1: fits, $309 left. |
| N06 | as N05, net unlocked | fits_uses_net: **Dips into your safety net** | Uses **$60** of $1,300; **$1,240** stays; refilled in about 1 month. Today: Not yet even unlocked. |
| N07, N07U | settings | — | $1,300 of $2,300. N07U: laptop on Jan 15 uses $60. |
| N08 | Used car $9,000 + $300 fees, cash, today; new running costs insurance $120 + fuel $60 a month | not_yet · not_covered: **Not yet**, ready **June 2028** | $10,020 up front; spare $3,351; **$6,669** more needed; $369 a month; once bought a usual month leaves $189. $6,000 car → Sep 2027, $4,000 → Mar 2027. |
| N09 | Used car, 24-month plan at 7.9%, first payment Dec 5, running costs as N08 | monthly_short: **Short each month** | $452.73 a month (Dec 5, 2026 to Nov 5, 2028); interest $845.31; plan + running $633; **$264 short** each month; spare money covers 12 of the 24 payments (about 2 of 24 if $1,000 more short a month). |
| N10, N17, N19 | Used car, 48-month plan at 7.9%; old car sold today for $1,400, paid to the auto loan; old car costs stop: insurance $96 (bill) and fuel $57 (Transport) | fits_by_borrowing: **Only by borrowing** | $244.15 a month (Dec 5, 2026 to Nov 5, 2030); interest **$1,699.09** ($11,719.09 in all); usual month after **$98** (under $217); saving instead ready June 2028; $7,020 still owed on the auto loan after the sale. Cash with the sale: Not yet, June 2028, usual month after $342. N17: new $424 (plan $244 + $120 + $60), stops $153, up **$271** a month, $369 → $98. |
| N11 | as N08, the reader says "yes, I have it" | engine has **no input** for money outside FincWin; its own fits_on_your_answer is only for pay that changes month to month | Screen keeps the design's "Only on your answer"; figures from N08: $6,669, June 2028. Flagged. |
| N12 | Laptop $4,400, cash, Jan 15, net unlocked, Everyday overdraft $1,000 at 22% | fits_uses_overdraft: **Uses your overdraft** | $4,752 with tax; safety net pays $1,032; Everyday **$723 below $0 for about 18 days** (to Feb 2, the end of the 90 days); about **$5.32**. Feb 1: 2 days, $0.86. Today and Nov 15: Not yet, ready March 2027. Same answer with protection off. |
| N13 | Laptop $3,500, cash, Jan 15, protection off | fits_uses_net · protection_off: **Uses your safety net · protection off** | Uses $60; $1,240 stays; refilled in about 1 month. |
| N14 | Used car, **36-month** plan at 7.9%, old car sold as N10 | fits_by_borrowing | $313.53 a month; usual month after **$28** (369 − 314 − 180 + 153). |
| N15 | Laptop $3,500, 12-month store plan 9.9% + $2 fee, bought today, first payment Dec 15; line "keep at least $300" set | fits_month · tight: **Fits, but tight each month** | $329.43 a month, Dec 15, 2026 to Nov 15, 2027; interest $173.15 + $2 fee = $175 more than cash ($3,955.15 in all); **$40** left each month, under the $300 line. Not "Only by borrowing": cash is ready by the end of January, which the engine counts as soon. |
| N16 | N15 next to cash today | cash: Not yet (end of January); plan: Fits, but tight each month | $3,780 vs $3,955 ($175 more); $330 × 12; $40 a month. |
| N18, N18S | Save for N08 | saveForIt ready 2028-06-30 | $369 a month, $3,351 now, $6,669 to go, June 2028. |
| N20 | look back (not an engine output) | — | Headphones expected $194 (engine $194.40). |
| N21, N22, N23 | the N04 check | as N04 | $3,600, Feb 1, $201 left. N21's missing figures and N22/N23's states are not engine outputs. |
| N24 | first run, no records | needs_input, readiness not ready (no full month yet) | Answers from records start Dec 1. |
| N25 | Laptop $3,500, cash, Jan 15; what if the safety net held **$3,500** ($1,200 above its $2,300 size) | fits_unspent · extra_savings: **Fits from extra savings** | Uses **$60** of the $1,200 above; $1,140 stays; spare and leftovers pay $3,720; no move-by date (Everyday never goes below $0); 2 months of essential costs would be about $4,730. Today: Not yet (ready December). |
| N26 | Phone $1,100, 12-month plan at 0%; what if rent went up to **$1,900** on Oct 1 | monthly_short · month_already_short: **No: your month is already short** | A usual month **$81 short** before; phone $99 a month ($1,188), **$180 short** after; $81 a month balances it. Cash: Not yet, already short. |
