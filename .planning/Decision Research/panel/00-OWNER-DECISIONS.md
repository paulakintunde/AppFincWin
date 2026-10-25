# Decide rebuild: every owner decision in one place

Written 2026-10-25 from the panel plan (00-REBUILD-PLAN.md) and the open questions in all six expert reports (01–06). Duplicates are merged. Each question says what it means in plain words, shows an example, lists the choices with the panel's pick first, and says where it stands.

**Status key**
- **DECIDED**: you chose it.
- **DEFAULT**: you said "no preference", so the panel's pick is used. You can still change it.
- **OPEN**: waiting for you.

Write your answer on the "Your answer" line, or tell me in the chat.

---

## ROUND 3 (owner, 2026-10-25): read this first

**The current plan is `00-REBUILD-PLAN-v3.md`.** It records the owner's third-round decisions O1–O23 in its section 2. These replace the round 2 direction below wherever they differ:
- buffer → **unspent money**, user-confirmed;
- pots → **envelopes**;
- the **emergency fund** is a goal kept out of ordinary checks;
- **recurring payments first**;
- an **income profile** chosen at setup;
- **15 value bands** with **preset question layers**;
- a **purpose** question;
- **periodic payments** with rate or APR;
- a **fixed-rate deposit** instead of market example rates;
- a **Decide setup** on first use.

The open questions still left are in v3 section 14.

---

## REVISED DIRECTION (owner, 2026-10-25, round 2)

This replaces parts of the panel plan wherever the two disagree.

### What the owner decided
1. **No AI, no voice.** Decide stays a rule-based engine: pure functions, financial maths, and wording templates filled with the calculated numbers. This is already true of the code.
2. **The first number is what this month will leave**: a forecast of October to its last day, including the everyday spending still to come. (It is not the steady "typical month" number.)
3. **There is no separate big-buy allowance.** "Allowance" means **unspent money: a buffer**.
4. **There are two pots, and they are different:**
   - **Buffer:** unspent money that builds up. It is there for purchases.
   - **Emergency savings:** money for emergencies and lost income. Purchases are not meant to touch it.
5. **Opportunity cost is a central feature, one tap after the verdict:** "What could I do instead?"

### The answer ladder that follows from these decisions
1. **Fits this month.** What October will leave covers it.
2. **Fits from your buffer.** "Uses $X of your buffer; $Y left."
3. **Would use emergency savings.** "Protection drops from 2.5 to 1 month of essentials. Rebuilt in about N months at your usual pace."

   This is technically affordable but not safely affordable.
4. **Not yet.** Cash doesn't cover it. "Ready in about N months."
5. **Notice, when true:** "Your typical month is already short by $X."

**The typical month** (the middle of your recent months, so one bad expense can't move it) is not thrown away. It is used for:
- ongoing monthly costs (see N2);
- how fast the buffer and emergency savings rebuild;
- "buy later" timing.

It is shown as a second line.

### "What could I do instead?"
Four futures for the same money:
- **Buy now:** cash change, ongoing costs, debt effect, buffer and protection afterwards.
- **Keep it:** buffer and emergency protection kept, shown in months of essentials.
- **Invest it:** future value at a rate (see N3), with a note that returns are uncertain and can be negative. Only the gain is counted as forgone, not the original money.
- **Buy later:** when it can be bought from the buffer without touching emergency savings.

Financed purchases compare the **full payment stream**. The item's value (it earns income, cuts a cost, or has resale value) is an optional typed input.

The app **shows** the trade-offs and never ranks them. "Worthwhile" is the user's judgement, because CLAUDE.md does not allow advice or recommendations. The existing code already does much of this, so it is mostly a regrouping: `investmentViews.ts`, `wait.ts`, `alternatives.ts`, `options.ts`, `ownership.ts`, `reserve.ts`.

### Decisions this replaces
- **A3, A4 and A5** (the big-buy allowance as a rate, the purchase using the allowance room, the headline after the allowance) are replaced by points 2 and 3 above.
- **B3 and B4** are replaced by the two pots and the answer ladder. B3 still sets the default size of emergency savings (see N1).
- **The panel's "always the normal month" headline** is replaced by point 2.

### Follow-up decisions (owner, 2026-10-25)
- **N1. Telling the buffer from emergency savings: DECIDED, handled by Phase 6 Grow.**
  - Grow lets the user flag exactly one savings goal as their emergency fund (ROADMAP Phase 6, criterion 1). Decide reads emergency savings from that goal, and all other spendable cash is buffer.
  - Until Grow ships, Decide uses a default emergency amount: 3 months of essentials, which the user can change.
- **N2. Ongoing monthly costs: DECIDED, the typical month.** A lease or phone plan is tested against what a typical month leaves. One-off buys start from this month.
- **N3. The rate for "Invest it": DECIDED, labelled example rates you pick from** (for example 2% / 5% / 7%).
  - Always shown with: "Example rates, not a forecast. Returns are uncertain and can be negative."
  - 0% (kept as cash) is always shown alongside, and the user can still type their own rate.
  - **This replaces D-51 and D-07 ("the engine never supplies a non-zero rate").** It is flagged for the Compliance phase review, because suggested rates move closer to investment advice.

---

## The example used throughout: Sam

| Sam's normal month | |
|---|---|
| Money in | $4,000 |
| Bills (rent, phone, insurance) | −$1,800 |
| Everyday spending (food, fuel, eating out) | −$1,200 |
| Saving | −$300 |
| Big-buy allowance (last year's big buys $3,600 ÷ 12) | −$300 |
| **What a normal month leaves** | **$400** |

Sam has **$12,000** in savings. Three months of essentials (bills + everyday) is $9,000. That is Sam's **safety money**, so **$3,000 is above it**.

---

## Part A: How a normal month is measured

### A1. Which mistake is worse? **DECIDED: a wrong "fits" is worse**
When data is thin or months swing a lot, the app leans cautious. A wrong "yes" can hurt someone's finances. A wrong "no" only delays a purchase.

### A2. What counts as a big buy? **DECIDED: a size rule, tuned on real past months**
A big buy is any line that isn't a bill and is at least about a quarter of a normal month's non-bill spending. The exact cut-off is set by replaying real past months, not by guessing. For Sam, a $350 line in a $1,400 month counts as big. You can retag any line.

**A2b. When can you mark something "not a big buy"? (OPEN)**
- (a) **Later (panel pick).** Today's "one-off" mark covers most cases, and no database change is needed now.
- (b) Now. This adds one new database column in this phase.

Your answer: ____

### A3. How the allowance works. **DECIDED: a monthly rate**
Sam gets $300 of room each month. Room that isn't used does not pile up.

### A4. Can the item being checked use this month's room? **DECIDED: yes**
Sam checks a $250 jacket. It comes out of the $300 room, so a normal month still leaves $400. The jacket isn't counted twice.

### A5. Which number leads the answer? **DEFAULT: after the allowance**
"A normal month leaves $400." The allowance ($300) is shown on line 2.
- Other choice: lead with $700 (before the allowance). The behavioural economist preferred this.

### A6. What is a tight month? **DEFAULT: your second-lowest real month of the last 6**
Income and spending both come from the same real month, so one freak month is ignored.
- Other choices: a computed "1 month in 5" figure; your single lowest month; lowest income and highest spending taken from different months (today's "Worst" is like this).

### A7. How far back does the app look? **DEFAULT: 6 months for normal and tight, 12 for the allowance**
Recent months show your life now. Big buys are rare, so measuring them takes a full year.

### A8. What is normal income? **DEFAULT: your pay schedule plus the middle month of other income**
Freelance money counts only once it lands. So early in the month a freelancer sees a lower figure, which is the cautious side.
- Other choices: the middle month of all income; or for people whose income swings a lot, judge on their second-lowest income month.

### A9. Windfalls (a bonus, a tax refund) (OPEN)
Sam gets a $2,000 bonus in March.
- (a) **Leave it out of normal income (panel pick).** The middle-month method already ignores one big month, and the bonus still shows in Sam's savings.
- (b) Spread it: $2,000 ÷ 12 = $167 a month added to normal income.

Research shows people spend windfalls more freely, so spreading them could make purchases look easier than they are.

Your answer: ____

### A10. Two kinds of "one-off" mark (OPEN)
Today one mark means "this won't happen again", and it removes the line completely.
- (a) **Two marks (panel pick).**
  - "Big buy" goes into the allowance, because people do make big buys.
  - "Won't happen again" is left out. Examples: a wedding, moving country.
- (b) Keep one mark as it is today. The risk is that real repeated costs, like car repairs, quietly disappear.

Your answer: ____

### A11. A car-sized purchase in the history (OPEN)
Sam bought a $9,000 used car last year.
- (a) **Spread it over 12 months in the allowance by default ($750 a month), and let the user say "won't happen again" (panel pick).**
- (b) Ask the user every time a line is bigger than a whole month's spending.

Your answer: ____

---

## Part B: Safety and savings

### B1. How much history before a real answer? **DEFAULT: answer from month 1, marked "Rough"**
New users still get an answer. It has "Rough" in the title and says what's missing, and it uses cautious figures. The tight month is hidden until there are 2 months of history.
- Other choices: "Not enough data" until 3 well-logged months (the risk reviewer's view); or keep today's behaviour.

### B2. Is regular saving a fixed cost? **DEFAULT: committed, like a bill**
The app never quietly pauses Sam's $300 saving to make something fit. Pausing appears only as an option: "If you paused saving for 2 months, this would fit." Sam can mark a saving line as flexible.
- Other choices: flexible by default, as today; or pensions fixed and other saving flexible.

### B3. How big is safety money? **DEFAULT: 3 months of essentials**
Essentials are bills, everyday spending and debt payments (for Sam, $9,000). The warning grows as savings fall below this, and gets heavy below 1 month. Sam can change it to 4.5 or 6 months.
- Other choices: today's method, based on all spending; or a starter floor of 6 weeks of pay.

### B4. When savings pay for part of a purchase, what does the answer say? (OPEN)
Sam checks a $1,200 laptop. This month's room covers $700 (the $400 spare plus the unused $300 allowance), so $500 comes from the $3,000 above safety money. A normal month refills that in about 1–2 months.
- (a) **"Fits, with $500 from savings. Back in about 2 normal months." Amber instead if the refill would take more than 12 months (panel pick).**
- (b) Always amber: "Fits if you use $500 of savings."
- (c) "Not this month", plus a separate fact about cash.

Your answer: ____

### B5. When savings are below safety money (OPEN)
Sam has only $6,000 saved, below the $9,000 target, and checks a $300 item that this month's room covers.
- (a) **"Fits", with one fact: "Your safety money is $3,000 under target" (panel pick).**
- (b) "Doesn't fit yet." This is the strict pay-yourself-first view: spare money goes to safety money first.

Your answer: ____

### B6. Refill limits (OPEN)
How long can a savings refill take before the answer changes colour?
- (a) **Up to 3 months is green, 3 to 12 months is amber, over 12 months is "Not yet" (panel pick).**
- (b) Different numbers. Please say which.

Your answer: ____

### B7. Small purchases in a month that's already short (OPEN)
Sam's month is heading $310 short because of a car repair, and Sam checks a $5 coffee.
- (a) **If it fits inside this month's unused allowance, it gets a neutral line. The $310 gap shows once, as a separate notice (panel pick).**
- (b) Anything under a fixed share of usual spending (say 2%) gets the neutral line.
- (c) As today, it gets a red "Doesn't fit".

Your answer: ____

---

## Part C: The answer and the screens

### C1. The "Judge on" dropdown and the "This month" view (OPEN)
- (a) **Retire the dropdown (panel pick).**
  - The answer always uses the normal month.
  - The headline mentions the tight month only when it gives a different answer, for example "Fits a normal month, not a tight one."
  - "This month" becomes a progress line that forecasts month end.
- (b) Keep it, renamed "Check against the tight month", as a stricter setting. The architect preferred this.

Your answer: ____

### C2. Lender lines (28% housing, 36% debt, 12×) (OPEN)
These come from mortgage lending rules and are applied to take-home pay.
- (a) **Show them as facts under "Your limits", labelled "rule of thumb". They block a purchase only once the user sets them (panel pick).**
- (b) Show them only on loan and property checks, as an opt-in lender view.
- (c) Keep them as today.

The risk reviewer notes they make the app look like it is doing a credit check, which adds App Store and legal risk.

Your answer: ____

### C3. The 5-step check flow (OPEN)
- (a) **One quick field, then the answer, then record buttons. One "Change details" screen holds payment type and running costs (panel pick).**
- (b) Keep five steps, reorganised and lighter.

Your answer: ____

### C4. Monthly payments (credit, buy-now-pay-later) in the quick answer (OPEN)
- (a) **Show them in the first answer when the user picks a payment plan: "Fits if you pay $85 a month for 12 months" (panel pick).**
- (b) Only under "Change details".

Your answer: ____

### C5. Should app levels decide how much working you see? (OPEN)
The app has four levels, set during onboarding.
- (a) **Everyone sees the same answer, and "See the working" is one tap away for all (panel pick).**
- (b) Level 1 sees 3 sections of working; level 4 sees all 8.

Your answer: ____

### C6. The new words (OPEN)
These replace earlier decisions: D-106 "free" and D-107 "Judge on".

| Old | New |
|---|---|
| free / overspent | **spare / short** |
| Average / Worst | **normal month / tight month** |
| Go ahead / Wait / Pass | **Record as bought / Plan for it / Not buying** |
| Doesn't fit right now | **Not yet** (with a month) |
| What breaks | **Your limits** |
| Out of savings | **Paid from savings** |

- (a) **Accept all (panel pick).**
- (b) Go word by word in popups.

Your answer: ____

### C7. Spotting odd months automatically (OPEN)
- (a) **The app suggests "this looks like a big buy" or "this month looks under-logged", once per month, gathered in Month details (panel pick).**
- (b) Only the user marks lines, as today.
- (c) The app asks on every big line as it's logged.

Your answer: ____

### C8. A "same month last year" hint (OPEN)
For example: "Last December you spent $1,900 on big buys."
- (a) **Show it as a hint once there are 12 months of history. It never changes the number (panel pick).**
- (b) Leave it out until there are 2 years of history.

Your answer: ____

### C9. Showing how past answers held up (OPEN)
For example: "Three months ago this check said 'Fits'. Your month ended $220 up."
- (a) **Yes, in "See the working", once there's enough history (panel pick).** It builds the most trust, but it also shows the app's misses.
- (b) No, at least for now.

Your answer: ____

---

## Part D: Delivery

### D1. Fix the worst bugs now, inside the current PR (#82)? (OPEN)
This is about 5 days of work:
- the wording that contradicts itself ("Not from cash" next to "Cash covers it");
- the "your month already" vs "this purchase" split;
- forecasting the rest of this month's everyday spending;
- the cash check that assumes zero spending;
- the "Cushion" label that really shows how long cash lasts;
- a reset of "Changed since you looked".

Choices:
- (a) **Yes, before PR #82 merges (panel pick).**
- (b) Merge PR #82 as it is, and do everything in the new phase.

Your answer: ____

### D2. The new engine as phase 05.1, and the new screens as 05.2? (OPEN)
The engine is about 33 days, built beside the old one and proven to match before any rule changes. The screens are about 12 days.
- (a) **Yes, in that order (panel pick).**
- (b) One combined phase.
- (c) Screens first, on the current engine.

Your answer: ____

### D3. A 5-person reading test before and after the new screens (OPEN)
- (a) **Yes, with at least 2 people who have irregular income or little savings (panel pick).**
- (b) Skip it.

Your answer: ____

---

## Part E: Later (these don't block the rebuild)

### E1. Households (planned for Phase 8)
In a shared household, is "a normal month" yours, your share, or the whole household's? And if a partner doesn't log their spending, is that a reason to say "not enough data", or only a caveat?

Your answer: ____

### E2. Marking which cash is spendable
For example, a "holiday account" that shouldn't count as Sam's cash. This needs a database column, so it's planned for later.

Your answer: ____

### E3. Outside legal advice before launch
Should a lawyer check these before launch?
- (a) App Store rule 3.2.1(viii) on "money management".
- (b) Whether a personal verdict counts as "financial advisory services" under US law (12 U.S.C. 5481).
- (c) UK rules on investment and debt advice, for Decide's invest checks and debt rows.

The panel recommends yes, in the Compliance phase.

Your answer: ____
