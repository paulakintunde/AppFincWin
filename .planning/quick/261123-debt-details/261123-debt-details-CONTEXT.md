# Quick 261123: Debt details (Grow) - owner decisions

Owner decisions taken 2026-11-23. Final; build now. Plus three Insights accessibility/offline fixes from the Pixel 9
TalkBack and offline check.

## Decisions

- **DD-01 Interest rate is required.** Adding or editing a debt needs a rate, except a credit card paid in full each month
  (Phase 6 D-15 stays exempt). The user may type a rate (0% is valid and means interest-free: family loans, BNPL) or choose
  "I don't know". "I don't know" saves the debt marked "rate unknown"; every payoff figure for it says interest isn't counted.
  A blank rate must no longer silently mean 0% (useDebtsRead.ts, debtLineModel.ts). Phase 4 D-07 (never invent a rate)
  still holds.
- **DD-02 Fixed loans** (car, house/mortgage, personal/student loan, any instalment loan): ask for the ORIGINAL loan amount
  and the START DATE, both required for new debts. The original amount is stored in `started_balance`.
- **DD-03 Revolving debt** (credit card, line of credit, overdraft-like): ask for the CREDIT LIMIT and the CURRENT BALANCE,
  both required for new debts. The paid-in-full card is exempt from the rate only; limit and balance are still asked. No
  "original amount" for revolving debt.
- **DD-04 Already paid off.** A debt with a balance of 0 today can be added: choose "Already paid off" and enter the
  paid-off date. A fixed loan still needs its original amount and start date. The form says why, in plain words: FincWin
  uses the original amount and start date to show past net worth correctly; without them a paid-off loan would look like
  it never existed. Declarative house voice; passes the copy guard.
- **DD-05 Existing debts missing these values** get a quiet ask on the debt detail screen and on the debt list row that
  names exactly what is missing ("Add the start date and original amount to see this loan's history"), with a "Not now"
  that hides it for that debt. It never blocks editing or saving ("Ask, don't block"; closest component
  `src/ui/WarningCard.tsx`).
- **DD-06 Promotional rate schedules:** not now. One rate per debt; schedules later.
- **DD-07 Net worth history.** Once a debt has a start date, past months before the start date do not include it. Months
  between the start and today use the best available balance: for a fixed loan with an original amount, a start date and
  recorded payments, the balance at a past month-end is today's balance plus the payments recorded after that date, capped
  at the original amount; otherwise today's behaviour stays. `netWorthSeries` stays pure in `src/engine/grow`; the single
  `netWorthOf` rule stays (no second sum). The "debts held flat" note follows the new rule.
- **DD-08 Decide "Go ahead" on a financed purchase** (`record_decide_go`) stores `started_balance` = the financed amount and
  `start_date` = the purchase date. Shipped as a NEW additive migration: `create or replace function` copied from the latest
  definition with only that change.

## Implementation choices (made by the executor inside DD-01..DD-08)

- **"Rate unknown" is `apr IS NULL` on a carried debt.** No new column: a null rate already means "not known" under D-07,
  0% is stored as `'0'`, and a card paid in full keeps a null rate but is not in any payoff figure. Payoff maths still runs
  without interest for such a debt, and every figure built from it is flagged (`rateUnknown` / `interestCounted`) so the
  screens say interest isn't counted instead of showing it as interest-free.
- **`debts.revolving boolean` (nullable)** tells a line of credit from money owed to someone: both save as `kind = 'other'`.
  Cards are revolving, loans and money owed are fixed. Null on old rows.
- **`debts.credit_limit bigint` (nullable)** holds the revolving limit. `debts.start_date` already exists (05) and gains an
  update grant. `paid_off_on` gains an insert grant for DD-04.
- `started_balance` is no longer set to today's balance on add: a fixed loan stores its original amount; a revolving debt
  stores none.
