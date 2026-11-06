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
