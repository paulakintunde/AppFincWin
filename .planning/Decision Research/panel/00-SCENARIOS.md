# Decide in real life: 22 common situations

Hypothetical people and numbers, written 2026-10-25. Each situation shows:
- what the person wants;
- what they type;
- what the **rebuilt** engine does behind the scenes, using the model in 00-REBUILD-PLAN.md with your decisions so far;
- what they see;
- how today's engine differs.

Where an open question (00-OWNER-DECISIONS.md) would change the answer, it is marked like this: *(depends on B4)*.

---

## How the engine works, every time (the shared steps)

Every check runs the same six steps. The situations below only describe what is special about each one.

1. **Read your months.** Take your last 6 full months, and the last 12 for big buys. Months that look under-logged (less than half your usual everyday spending) are set aside until you confirm them.
2. **Sort each month's spending into three piles:**
   - **Bills:** your regular scheduled payments, at today's amounts.
   - **Everyday:** food, fuel, eating out.
   - **Big buys:** any single non-bill line that is at least about a quarter of a normal month's non-bill spending.

   Lines you marked "won't happen again" are left out completely.
3. **Build the normal month:**

   > normal pay − bills − **middle** everyday month − big-buy allowance − set aside (debts, saving, pots) = **what a normal month leaves**

   The allowance is a year of big buys ÷ the months seen, never divided by fewer than 4.
4. **Build the tight month:** your second-lowest real month of the last 6, with its income and spending from the same month. Also **project this month to its last day**, adding the everyday spending not done yet.
5. **Judge the purchase.** Split it into:
   - a **one-off part**: the price today;
   - a **monthly part**: payments and running costs.

   The one-off part is paid, in order, from:
   1. this month's money (what's left plus unused big-buy room);
   2. savings above your safety money;
   3. your safety money;
   4. nothing yet.

   The monthly part is tested against the normal month and the tight month.
6. **Pick one result code**, by fixed rules, and use the one sentence that belongs to it, so the text can never contradict itself. Add how firm the estimate is ("Rough", "Fair") when it isn't firm.

---

## The people

**Sam** has a steady salary and is used in situations 1–7, 9, 10, 15, 16, 19, 20 and 22.

| Sam's last 6 months | Apr | May | Jun | Jul | Aug | Sep |
|---|---|---|---|---|---|---|
| Pay | 4,000 | 4,000 | 4,000 | 3,700 | 4,000 | 4,000 |
| Bills | 1,800 | 1,800 | 1,800 | 1,800 | 1,800 | 1,800 |
| Everyday | 1,100 | 1,200 | 1,200 | 1,300 | 1,150 | 1,250 |
| Big buys | — | 400 | 2,400 (vet) | — | 200 | 600 |

From these months:
- **Normal everyday** is the middle month: $1,200.
- **Big-buy allowance** is $3,600 of big buys in the last 12 months ÷ 12 = **$300 a month**.
- **Set aside:** $300 saving.
- **Normal month:** 4,000 − 1,800 − 1,200 − 300 − 300 = **$400 left**.
- **Tight month:** September is the second-lowest. 4,000 − 1,800 − 1,250 = 950, then − 300 − 300 = **$350 left**.
- **Savings** are $12,000. **Safety money** is 3 months × (1,800 + 1,200) = **$9,000**.

The other people are introduced in their own situations.

---

## Quick list

| # | Situation | Person | Result |
|---|---|---|---|
| 1 | Small everyday treat | Sam | Fits this month |
| 2 | Big one-off early in the month | Sam | Fits, part from savings |
| 3 | A big buy every other month | Sam | Fits, inside the allowance |
| 4 | Small buy in a month already heading short | Sam | Notice, then fits from savings |
| 5 | Every normal month is already short | Riley | Month already short |
| 6 | A monthly payment too big for the month | Sam | Doesn't fit a normal month |
| 7 | A phone on a 24-month plan | Sam | Fits normal and tight |
| 8 | Freelance income that swings | Maya | Fits a normal month, not a tight one |
| 9 | One freak bad month in the history | Sam | Middle month ignores it |
| 10 | Large purchase that dips into safety money | Sam | Uses safety money |
| 11 | Low savings, needed item | Leo | Not covered yet |
| 12 | Short of cash until payday | Tia | Cash doesn't cover it before payday |
| 13 | Brand-new user | Jordan | Rough answer, or not enough yet |
| 14 | Only 1–2 months logged | Jordan | Rough, cautious |
| 15 | Forgot to log a month | Sam | Month set aside, question asked |
| 16 | Saving up for a goal | Sam | Plan it with a pot |
| 17 | Already has a lot of debt | Dana | Passes a line Dana set |
| 18 | A windfall (bonus, tax refund) | Kim | Normal month unchanged, savings grow |
| 19 | A yearly bill that isn't set up | Sam | "Looks like a regular bill" |
| 20 | Pay rise or new bill | Sam | Uses today's pay and bills |
| 21 | Shared purchase in a household | Priya | Judged on your share |
| 22 | Something with running costs (a dog) | Sam | Both parts judged |

---

## 1. Small everyday treat

**Situation:** It's 18 October. Sam has logged spending normally and wants $150 headphones.

**Goal:** "Will this mess up my month?" Sam wants a quick yes or no, without guilt.

**Types:** `headphones 150`

**Behind the scenes:**
- October is on track to leave $400 after the everyday spending still to come.
- Nothing big has been bought this month, so the $300 big-buy room is unused.
- This month's money is $400 + $300 = $700.
- $150 is less than $700, so it is paid from this month. The result is **fits**.

**Sees:**
> **Fits in this month's money.**
> October is on track to leave about $400 after the everyday spending still to come.

**Today's engine:** gives the same answer, but also shows three month types, a "Judge on" picker and a size label.

---

## 2. Big one-off early in the month

**Situation:** It's 3 October. Pay and most bills have landed, but Sam has logged only $100 of everyday spending so far. Sam wants a $1,200 laptop.

**Goal:** "Can I buy this now, or will I be stuck later this month?"

**Types:** `laptop 1200`

**Behind the scenes:**
- **Projects the rest of October.** Everyday still to come is the larger of:
  - your usual pace for the 28 days left (about $1,084);
  - your usual month minus what's logged ($1,200 − $100 = $1,100).

  So it uses $1,100.
- October left = 4,000 − 1,800 − 100 − 1,100 − 300 (allowance) − 300 (saving) = **$400**.
- This month's money is $400 + $300 big-buy room = $700. The other $500 comes from savings.
- Cash at month end after the laptop is about $9,400, still above the $9,000 safety money. The pool is **savings above safety**.
- Refill: $500 ÷ $400 a normal month = about 2 months. The result is **fits_savings**.

**Sees:**
> **Fits, with $500 from savings.**
> October's money covers $700. A normal month puts the rest back in about 2 months.
> *Includes about $1,100 of everyday spending expected by Oct 31.*

*(The exact wording depends on B4.)*

**Today's engine:** "This month" counts only what is logged, so it shows roughly $1,800 "free". It says "It fits, out of this month's spare", and the $500 drawn from savings is invisible. This is the most serious bug the audits found.

---

## 3. A big buy every other month

**Situation:** Sam buys something bigger about every two months, around $250 each time: a jacket, a game console or a kitchen gadget. This month it's a $250 jacket.

**Goal:** "I know I do this. Is it still OK?" This is the owner's own example: "I still have an allowance."

**Types:** `jacket 250`

**Behind the scenes:**
- Past buys like this are already counted in the $300 big-buy allowance, so they never dragged down the normal month.
- Nothing big has been bought yet this month, so the $300 room is free.
- The jacket uses $250 of that room (your decision A4). It isn't counted twice. The result is **fits**.

**Sees:**
> **Fits in this month's money.** It sits inside your usual big buys (about $300 a month).
> A normal month still leaves about $400.

**Today's engine:** the answer swings depending on whether last month had a big buy, because the average and worst figures move each time.

---

## 4. Small buy in a month already heading short

**Situation:** On 12 October Sam's car needed a $1,000 repair. Now Sam wants a $5 coffee.

**Goal:** "Is it the coffee that's the problem, or my month?"

**Types:** `coffee 5`

**Behind the scenes:**
- The repair is a big buy. It uses all of October's $300 big-buy room, plus $700 more.
- October is projected at 4,000 − 1,800 − 1,200 − 1,000 − 300 = **$300 short**. That triggers the **"month heading short" notice**.
- This month's money is $0, so the $5 comes from savings above safety, refilled within a month.
- The notice and the purchase are kept separate.

**Sees:**
> *October is heading about $300 short, mostly the $1,000 car repair.*
> **Fits, with $5 from savings.**

*(B7 may turn this into a plain neutral line.)*

**Today's engine:** shows a red "Doesn't fit right now", the same as it would for a $5,000 sofa.

---

## 5. Every normal month is already short

**Situation:** **Riley** earns $3,000. Bills are $1,900, everyday spending is $1,100, big buys run about $150 a month and debt payments are $100. A normal month ends **$250 short**. Riley has $2,000 saved, and Riley's safety money would be $9,000. Riley wants $60 shoes.

**Goal:** Riley wants an honest picture without being blamed, and wants to know whether this one purchase changes anything.

**Types:** `shoes 60`

**Behind the scenes:**
- The normal month is below zero *before* the purchase, so the result is **already_short**. The month gets the headline, not the shoes.
- The shoes add nothing a month. The $60 comes from savings, but Riley's savings are already below safety money, so the pool is **safety money**, shown in red.

**Sees:**
> **A normal month already ends about $250 short.**
> This purchase adds nothing a month. It would use $60 of your safety money; cash would be $1,940.

Under "See the working", the line-by-line month shows where the $250 goes.

**Today's engine:** shows "Doesn't fit", with no split between the month and the shoes.

---

## 6. A monthly payment too big for the month

**Situation:** Sam is looking at a car lease: $450 a month, nothing upfront.

**Goal:** "Can I carry this every month?"

**Types:** `car lease`, then under "Change details": monthly payment $450.

**Behind the scenes:**
- The monthly part is $450, and a normal month leaves $400. 400 − 450 = **−$50**. The result is **month_short**.
- **Other ways** works out the most that fits: $400 a month in a normal month, $350 in a tight one.
- Sam's saving is committed (B2 default), so pausing it is offered only as an "if" under Other ways.

**Sees:**
> **Doesn't fit a normal month: $50 short each month.**
> A normal month leaves $400 now; this adds $450.
> Other ways: a payment up to $400 a month fits a normal month.

**Today's engine:** may quietly pause Sam's saving to make the lease "fit".

---

## 7. A phone on a 24-month plan

**Situation:** A new phone on a plan: $85 a month for 24 months.

**Goal:** "Is this monthly cost OK, even in a bad month?"

**Types:** `phone`, payment plan $85 × 24.

**Behind the scenes:**
- Normal: 400 − 85 = $315.
- Tight (September): 350 − 85 = $265.
- Both stay above zero, so the result is **fits** (monthly). It also shows the total cost: $2,040 over 2 years.

**Sees:**
> **Fits a normal month and a tight one.**
> After $85 a month, a normal month leaves about $315; a tight month like September leaves $265.
> Total over 24 months: $2,040.

*(Whether payment plans show in the first answer depends on C4.)*

---

## 8. Freelance income that swings

**Situation:** **Maya** is a freelance designer. Her last 6 months' income was 2,500, 5,200, 3,000, 6,100, 2,200 and 4,400. Bills are $1,500, everyday spending is about $1,000, the big-buy allowance is $200 and saving is $200. She wants a $60-a-month gym membership.

**Goal:** "My income jumps around. Will this still be OK in a slow month?"

**Types:** `gym`, $60 a month.

**Behind the scenes:**
- There's no fixed pay, so normal income is the **middle** month: (3,000 + 4,400) ÷ 2 = $3,700.
- Normal month: 3,700 − 1,500 − 1,000 − 200 − 200 = **$800**.
- Tight month: April is the second-lowest paired month (2,500 − 1,500 − 1,000 = 0), so tight = 0 − 200 − 200 = **−$400**.
- With the gym, a normal month leaves $740 and a tight month is $460 short. The result is **fits_not_tight**.
- The swing in her money left is about $2,000 a month, which is high. So:
  - confidence is capped at **Fair**;
  - safety money is set to 6 months.

**Sees:**
> **Fits a normal month. A tight month like April ends $460 short.**
> April: low pay. 2 of your last 6 months were like it.
> *Fair estimate · your income swings about $2,000 a month.*

**Today's engine:** the Worst basis pairs August's income ($2,200) with her highest-spending month. That shows an extreme, unreal month, and every check turns red.

---

## 9. One freak bad month in the history

**Situation:** In June, Sam paid a **$2,400 vet bill**.

**Goal:** "Don't let that one awful month ruin every answer."

**Behind the scenes:**
- $2,400 is easily a big buy, so it goes into the **allowance**, spread over 12 months. It does not go into everyday spending.
- The middle everyday month is unchanged, so June can't drag down the normal month.
- The June dot shows **◑ "Normal month + big buy $2,400"**.
- If Sam taps **"Leave it out (won't happen again)"**, the allowance drops from $300 to $100. The normal month then rises from $400 to $600, and Sam sees it change right away.
- The app may also ask: "Vet costs can come back. Start a pet pot?" *(depends on C7)*.

**Today's engine:** the Worst basis shows about −$1,350 for June, and every check is judged against that for six months.

---

## 10. Large purchase that dips into safety money

**Situation:** It's 18 October and Sam wants a $4,000 sofa.

**Goal:** "Can I afford it now, and if not, when?"

**Types:** `sofa 4000`

**Behind the scenes:**
- This month's money covers $700. The other $3,300 must come from cash.
- Month-end cash is about $11,600, which would fall to $7,600 after the sofa. That's **$1,400 under** the $9,000 safety money.
- $7,600 is still more than one month of essentials ($3,000), so this is a **light** dip. The result is **into_safety**, in amber.
- Ready by: it needs $1,400 more without touching safety money. $1,400 ÷ $400 = 4 months, so about **February**.

**Sees:**
> **Uses $1,400 of your safety money.**
> Cash would be $7,600, under the $9,000 kept aside. Without touching it: about February.
> [ Record as bought ] [ Plan for it ] [ Not buying ]

"Plan for it" can start a sofa pot for $350 a month.

---

## 11. Low savings, needed item

**Situation:** **Leo** has only $900 in cash. A normal month leaves him $150, and his safety money target is $7,200. His work laptop broke and a new one costs $700.

**Goal:** Leo needs it, so the real questions are "What will this do to me?" and "What else could I do?"

**Types:** `laptop 700`

**Behind the scenes:**
- This month's money is $250 (what's left plus big-buy room).
- Cash after the laptop would be $200. That's below his safety money, and below even one month of essentials ($2,400). This is a **heavy** dip. The result is **into_safety heavy**.
- Ready by: $700 ÷ $150 = 5 months.
- Other ways: a $60-a-month plan over 12 months is tested against Leo's normal and tight months. A cheaper price is tested only if Leo types one.

**Sees:**
> **Not covered yet: leaves under a month of safety money.**
> Cash would be $200, about 2 weeks of bills and everyday. Covered without it about March.
> Other ways: $60 a month for 12 months fits a normal month.

The app states facts only. It never says "you should" or "don't buy".

---

## 12. Short of cash until payday

**Situation:** **Tia** has $300 in cash on 20 October, and her $2,500 pay lands on 28 October. Concert tickets cost $350 today.

**Goal:** "My month is fine, but can I pay for it right now?"

**Types:** `concert 350`

**Behind the scenes:**
- $350 is more than her $300 cash today, so the result is **cash_short**, whatever the month looks like.
- The engine checks cash day by day and finds the gap closes on payday.

**Sees:**
> **Cash doesn't cover it: $50 short before payday on Oct 28.**

---

## 13. Brand-new user

**Situation:** **Jordan** installed the app today and has no logged months.

**Goal:** "Give me a first answer without logging for months."

**Behind the scenes:**
- **If Jordan typed rough figures** at setup (income $3,000, bills $1,500, spending $1,000):
  - the normal month comes from those figures;
  - the big-buy allowance is $0, with the note "not enough months to see your big buys";
  - no tight month is shown.

  The $200 shoes get the normal judge, marked **Rough**.
- **If nothing was typed,** the result is **not_enough**.

**Sees:**
> **Fits in this month's money** · *on rough figures (your own figures).*

or

> **No full month logged yet, so there is no normal month to judge on.** Rough figures give a first answer.

*(B1 decides whether this rough answer is allowed at all.)*

---

## 14. Only 1–2 months logged

**Situation:** Jordan now has 2 full months.

**Goal:** A better answer, honest about being early.

**Behind the scenes:**
- The middle of 2 months is their average.
- The tight month is the lower of the two, flagged as "your lower month".
- The big-buy allowance is the big buys seen ÷ 4. It never divides by fewer than 4, so a single big buy isn't under-counted.
- Every headline carries "Rough · 2 months logged", and cautious figures are used, following your decision that a wrong "fits" is worse.

---

## 15. Forgot to log a month

**Situation:** Sam was on holiday in August and logged only $400 of everyday spending, against a usual $1,200.

**Goal:** Sam doesn't want a half-empty month to make everything look cheaper.

**Behind the scenes:**
- $400 is less than half the usual $1,200, so August is flagged **under-logged**. It is set aside, and the normal month uses the other 5.
- The dot shows **·**, with the question "August looks under-logged. Count it?"
- Confidence drops one level until Sam answers.

**Today's engine:** August lowers the average spending, so purchases look easier than they are. That's a false "yes".

---

## 16. Saving up for a goal

**Situation:** Sam wants a $3,000 holiday in June, 8 months away.

**Goal:** "How do I get there, and what does it cost me each month?"

**Types:** `holiday 3000`, then taps **Plan for it**.

**Behind the scenes:**
- Today it would be **fits_savings**: $700 from this month and $2,300 from savings.
- "Plan for it" creates a **pot** of $375 a month for 8 months.
- The pot counts as set aside, so the normal month shown everywhere drops from $400 to **$25** until June. The trade-off is visible straight away.

**Sees:**
> **Holiday pot: $375 a month until June.**
> A normal month now leaves about $25.

---

## 17. Already has a lot of debt

**Situation:** **Dana** takes home $5,000. Debt payments are $1,400 (28%) and she wants a $350-a-month car loan. Dana set her own debt line at 30%.

**Goal:** "Am I taking on too much debt?"

**Behind the scenes:**
- The month test passes: her normal month covers the $350.
- Debt would become 1,750 ÷ 5,000 = 35%. That's over the 30% she set, so the result is **over_limit**.
- If she hadn't set a line, the app would only show a fact: "Lenders often use 36% as a rule of thumb." *(depends on C2)*

**Sees:**
> **Fits the month. Debt payments would be 35% of take-home, over the 30% you set.**

---

## 18. A windfall (bonus or tax refund)

**Situation:** **Kim** got a $1,800 tax refund in April.

**Goal:** "Can I treat myself with it?"

**Behind the scenes:**
- April is one high month. The **middle** income month ignores it, so the normal month stays the same.
- The refund does sit in Kim's cash, so **savings above safety money** grow by $1,800.
- A one-off treat up to that amount gets **fits_savings**, and the answer shows where the money comes from.

*(A9 decides whether windfalls are ever spread into income.)*

---

## 19. A yearly bill that isn't set up

**Situation:** Sam pays $1,200 car insurance every March but never added it as a bill.

**Goal:** Sam doesn't want a surprise every March.

**Behind the scenes:**
- Not being a bill, it lands as a big buy in March and feeds the allowance ($100 a month of the $300). So the normal month already allows for it.
- The engine notices the same line, at a similar amount, coming back every year. It asks: **"Looks like a regular bill. Add it as one?"**
- If Sam says yes, it moves to bills at $100 a month, and the allowance shrinks by the same amount. The numbers become clearer.

---

## 20. Pay rise or new bill

**Situation:** Sam got a raise to $4,400 last month and a new $50-a-month gym bill.

**Goal:** "Use my life now, not six months ago."

**Behind the scenes:**
- Pay and bills come from **today's schedule**, not past months. So the normal month moves at once: + 400 − 50 = **$750**.
- Everyday spending still uses the last 6 months. If Sam starts spending more, it shows up gradually.

---

## 21. Shared purchase in a household

**Situation:** **Priya** and **Alex** split a $1,600 fridge 50/50.

**Goal:** "Can I afford *my half*?"

**Behind the scenes:**
- The engine judges only **Priya's share**: $800 one-off. Priya's months are built from her share of shared lines.
- Judging a whole-household normal month is planned for Phase 8 (question E1).

---

## 22. Something with running costs (a dog)

**Situation:** A dog costs $800 upfront, plus about $120 a month for food, insurance and vet visits.

**Goal:** "Not just the price. Can I keep this up?"

**Types:** `dog 800`, then running cost $120 a month.

**Behind the scenes:**
- **One-off part:** $800. This month's money covers $700, and $100 comes from savings, refilled in about 1 month.
- **Monthly part:** $120. Normal month: 400 − 120 = $280. Tight month: 350 − 120 = $230. Both are above zero.
- The rules pick the strictest code that applies. That is **fits_savings**, with the monthly facts underneath.
- Total cost over 10 years ($15,200) is under "See the working".

**Sees:**
> **Fits, with $100 from savings.**
> After $120 a month, a normal month leaves about $280; a tight month like September leaves $230.

---

## What these situations show

- **One number does most of the work:** what a normal month leaves. Every situation starts from it.
- **One bad month never decides the answer** (situations 4, 9 and 15). It is labelled with its reason, and you can count it or leave it out.
- **Occasional buys are expected, not punished** (situations 3 and 9). The allowance is the owner's "I still have an allowance".
- **The answer always says which money pays:** this month, savings, safety money or nothing yet (situations 2, 10, 11 and 12).
- **The month and the purchase are kept apart** (situations 4 and 5).
- **When data is thin or income swings, the answer says so and leans cautious** (situations 8, 13, 14 and 15).
