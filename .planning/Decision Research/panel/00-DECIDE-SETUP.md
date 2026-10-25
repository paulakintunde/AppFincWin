# Decide setup: the first-use stepper

Written 2026-10-25 for plan v3 (section 6). It is shown the first time someone opens Decide, and can be reopened from Decide settings.

## How the stepper behaves
- **One question per screen.** Each screen has one short "Why we ask" line under the question.
- **Prefilled from records where possible** ("We found: Pay $4,000, monthly, around the 1st"). The user confirms rather than types.
- **Every screen has Back, Next and Skip,** except the four **needed** steps (marked ●). Without those, Decide can only give rough answers.
- **The progress bar shows sections, not numbers** ("Income · Regular payments · Spending · Your money · Answers"), so a branch never makes the count jump.
- **About 3–5 minutes.** "Finish later" saves progress. A half-done setup means every answer is marked "rough", with a "Finish setup" link.
- **Branching:** only the questions that match the user's income type appear. A salaried user with no side income sees about 11 screens.
- **Wording rules** (plan v3 4.6): no "you should", no "safe", no approve or reject wording. Facts and choices only.

● = needed for full answers · ○ = optional · ↳ = appears only after a certain answer

---

## Screen 0: Welcome
**Title:** Set up Decide
**Body:** "A few questions so Decide can check purchases against your real month. It uses your records and what you tell it. You can change any answer later."
**Buttons:** Start · Not now

---

## Section 1: Your income

### 1. ● How are you paid?
*Choose all that apply.*
- Salary or wages
- Commission or tips
- Freelance or self-employed
- My own business
- Pension or benefits
- No fixed income right now

*Why we ask:* "Steady pay and changing pay are checked in different ways."

### 2. ↳ ● Your regular pay *(salary, wages, pension or benefits)*
- **Take-home amount** (after tax): `$ ____` *(prefilled from records)*
- **How often:** Weekly · Every 2 weeks · Monthly *(pay on the 1st and 15th is "Every 2 weeks" and is counted as 24 payments a year)*
- **Next pay date:** `[date]`
- Add another regular pay *(second job, partner's pay if shared)*

*Why we ask:* "Your regular pay is the starting point for every month."

### 3. ↳ ● Your income changes from month to month. How should Decide count it? *(commission, freelance, business or no fixed income)*

| Choice | Example shown |
|---|---|
| **Match what comes in.** Count income only once it arrives. | "$2,200 came in this month, so this month has $2,200." |
| **Spread large payments.** A big payment covers several months. | "A $9,000 contract paid in March covers March to May: $3,000 a month." |
| **Pay myself a steady amount.** Count a fixed monthly amount; extra money adds to unspent money. | "You count $3,500 a month. A $5,000 month adds $1,500 to unspent money." |
| **Go by my bank balance.** Look at what's in the bank, minus bills coming up. | "Balance $8,000, minus 2 months of bills, is what's available." |

*No default is selected. The user picks one.*
*Why we ask:* "Uneven income can make a month look better or worse than it is. You decide which picture fits you."

### 3a. ↳ How many months does a large payment usually cover? *(Spread large payments)*
1 · 2 · 3 · 6 · 12 · It varies, ask me each time

### 3b. ↳ What steady amount do you count each month? *(Pay myself a steady amount)*
`$ ____` · *Shown:* "Your last 6 months averaged $X; your lowest month was $Y."

### 3c. ↳ How many months of bills should be held back? *(Go by my bank balance)*
1 month · 2 months · 3 months

### 4. ○ Any other money coming in?
*Choose all that apply, or None.*
- Side business or gig work
- Rent from a property or room
- Dividends or investment income
- Interest
- Child support or family support
- Other: `____`

### 4a. ↳ For each one chosen
- **About how much:** `$ ____` · **How often:** Weekly · Every 2 weeks · Monthly · Every 3 months · Yearly · It varies
- **What happens to it?** "I spend it or it's available" · "It's reinvested or kept"

*Why we ask:* "Only money you actually use counts toward your month. Reinvested dividends don't."

---

## Section 2: Regular payments

### 5. ● Your regular payments
*List found in your records, grouped. Each row: payee · amount · how often · next date · [Yes, regular] [Not regular] [Edit]*

> Rent · $1,800 · monthly · around the 1st
> Phone · $65 · monthly · around the 12th
> Car insurance · $140 · monthly · around the 20th
> Streaming · $16 · monthly · around the 3rd

**+ Add a regular payment.** Quick picks: Rent or mortgage · Utilities · Phone and internet · Insurance · Childcare · Subscriptions · Transport pass · Other.

*Why we ask:* "Regular payments are the backbone of your month. Only payments you confirm are counted as regular."

### 6. ○ Loans and credit
*Prefilled debts. For each:* name · balance · **minimum payment** · how often · **interest rate or APR** · due date
**+ Add a loan or card.** Types: Credit card · Car loan · Student loan · Personal loan · Mortgage · Buy now, pay later · Other.
**Credit cards:** "Do you usually pay the full balance each month?" Yes · Sometimes · No

*Why we ask:* "Loan payments come out before anything else, and a card balance you carry costs interest."

### 7. ○ Regular saving and investing
*Prefilled transfers ("$300 to Savings, monthly"). For each:*
- **Treat as:** "Fixed: keep it going, like a bill" · "Flexible: could be paused if needed"

*Why we ask:* "Fixed saving is never used to make a purchase fit. Flexible saving only shows up as an option you can choose."

### 7a. ○ What are you saving for? *(an optional layer on the same screen, owner 2026-10-25)*
- **Saving buckets** (choose any): College or education · House down payment · A new car · A trip or holiday · Starting a business · A wedding · Something else.
- **For each bucket chosen:** each month `$ ____` · goal `$ ____` (optional). Shown: "At $200 a month, about 12 years 6 months to reach $30,000."
- **Total line:**
  - "$300 of your $300 a month goes to these buckets."
  - If less: "$100 stays general saving."
  - If more: "$X more than your regular saving. Decide will ask which to lower."
- **Each bucket becomes an envelope** (step 11 shows it already listed), so its money is kept for its purpose and never counted as unspent.
- **Lean data:** a new user with no saving found can still pick buckets with $0. They become goals, and the refine check-in (below) fills them in later.

---

## Section 3: Everyday spending

### 8. ● Your everyday spending
*Food, fuel, eating out, shopping: everything that isn't a regular payment.*
- **With 3 or more months of records:** "Your typical month: about **$1,200**." [Looks right] [Change it: `$ ____`]
- **With less:** "About how much do you spend in a usual month, outside regular payments?" `$ ____`

*Why we ask:* "Decide uses this to estimate the spending still to come this month."

### 9. ○ Any unusual months?
*Six month dots with each month's spending. Tap one to mark it:*
- "Leave it out: it won't happen again" (a move, a wedding)
- "Half-logged: I didn't record everything"
- "Normal"

*Why we ask:* "One unusual month shouldn't change your typical month."

---

## Section 4: Your money now

### 10. ○ Your emergency fund
"Do you keep money for real emergencies, like losing income or an urgent repair?"
- **Yes:** Amount `$ ____` *or* pick the account that holds it `[account]`
- **Not yet**
- ↳ *(Not yet)* **A goal (optional):** `$ ____` · *Shown:* "Three months of your regular payments and everyday spending is about $9,000."

*Why we ask:* "Your emergency fund is kept out of purchase checks. It's only used when you mark a purchase as an emergency."

*If "Not yet", the app shows this fact on home:* "An emergency fund goal isn't set yet." *(Grow will hold this later.)*

### 11. ○ Your envelopes
"Is any money already set aside for something?" Holiday · Car repairs · Gifts · Home · Education · Other
*For each:* name · amount set aside now · **+ add monthly** `$ ____` *(optional)* · target and date *(optional)*
"None right now"

*Why we ask:* "Money in an envelope is kept for its purpose and isn't counted as unspent."

### 12. ● Your unspent money
*Worked sum, shown line by line:*

```
Bank balance (your cash accounts)        $14,975
− Bills still due this month              −  $205
− Everyday spending still expected        −  $870
− Envelopes                               −$2,500
− Emergency fund                          −$9,000
= Unspent money                            $2,400
```

[That's right] · [Use my own figure: `$ ____`]
*Why we ask:* "This is the money free for anything. It's often less than your bank balance."
*Note:* "Decide asks you to check this again after 30 days."

---

## Section 5: How you want answers

### 13. ○ Do you share costs with anyone?
- Just me
- I share some costs with a partner or housemate → **My share of shared bills:** 50% · Other `__%`

*Why we ask:* "Decide checks your share of a purchase and your share of shared bills."

### 14. ○ How much detail do you like?
- **Short answers:** the answer, and more only when I tap.
- **Full answers:** open "What could I do instead?" for bigger purchases.

*Sets how the bands and layers open (plan v3 section 5). Never changes the maths.*

### 15. ○ Reminders
- "Remind me when a saved plan becomes covered" On · Off
- "Remind me to check my unspent money each month" On · Off

---

## Screen 16: Summary
**Title:** Decide is set up

```
October          $4,000 in · $3,575 out so far
On track to leave      about $425
Typical month          about $425
Unspent money          $2,400   (checked today)
Emergency fund         $9,000   (kept out of checks)
Envelopes              $2,500
Income counted as      Salary
```

[Check a purchase] · [Change an answer]
*Footer:* "Worked out from your own records and what you told us. A record-keeping and planning tool, not financial advice."

---

## Refine Decide: the check-in once there is more data (owner 2026-10-25)

Setup often runs on thin data, typed figures or "I don't know". So Decide comes back to it when the records can do better.

**When it triggers** (whichever comes first, at most once a month):
- three full months of records since setup;
- setup was done with rough figures, and one full month now exists;
- a typed figure is more than 15% away from what the records show, two months running;
- a new regular payment or a new kind of income has repeated three times.

**Where it shows:** a card on Decide home: "Decide can be sharper now · 4 things to check · about a minute" [Review] [Later]. "Later" hides it for 14 days.

**What it asks:** one card per change, each with two buttons, and **nothing changes until the user chooses**:

| Kind | Example | Buttons |
|---|---|---|
| Pay | "Pay looks like $4,150 now. You typed $4,000." | Use $4,150 · Keep $4,000 |
| Everyday spending | "About $1,250 a month. Your estimate was $1,000." | Use $1,250 · Keep $1,000 |
| New regular payment | "Gym · $45 · around the 5th, three months running." | It's regular · Not regular |
| Saving bucket | "Trip: $300 of $1,500. Reached by June at $100 a month." | Looks right · Change it |
| Unspent money | "Rolled forward to $2,850; the records suggest $2,600." | Use $2,600 · Keep $2,850 |
| Changing income | "Your steady amount is $3,500; the lowest of the last 3 months was $2,900." | Lower it · Keep it |

Every choice is saved through the normal write queue with Undo. "Done for now" keeps the unchecked cards for next time.

## Minimum setup (the ● steps only)
1. How are you paid?
2. Regular pay, **or** how to count changing income (3, plus its follow-up)
3. Confirm regular payments
4. Everyday spending
5. Unspent money

Five screens give full answers. Everything else improves them.

---

## What each answer sets in the engine (plan v3)

| Step | Sets | Plan v3 section |
|---|---|---|
| 1–3c | Income profile (salary / a–d), steady amount, spread months, bills held back | 4.2 |
| 4–4a | Other income lines, available or reinvested | 4.2 |
| 5 | Confirmed recurring series (income and bills) | 4.1 |
| 6 | Debts: minimums, rate or APR, card pay-in-full habit | 4.3, 4.5 |
| 7 | Committed or flexible saving | 4.3 |
| 8–9 | Everyday median (E), months left out or under-logged | 4.3 |
| 10 | Emergency fund amount or account, optional goal | 3.7 |
| 11 | Envelopes (old pots) | 4.3 |
| 12 | Confirmed unspent money + as-of date | 4.3, I35 |
| 13 | My share of shared bills (D-34) | 4.3 |
| 14 | Layer opening preference | 5 |
| 15 | Reminder switches | 7 |

## Choices settled (owner: "do all the needful", 2026-10-25; recommendations applied, changeable)
1. **"Pension or benefits"** is included as a pay type.
2. **Step 14 (detail level)** is kept.
3. **Step 7:** when skipped, saving is treated as "Fixed".
4. **The unspent figure** is re-asked every 30 days.

The click-through mockup ("Can I Afford It — Decide mockup", Calm Ledger redesign) implements this stepper and every v3 answer.
