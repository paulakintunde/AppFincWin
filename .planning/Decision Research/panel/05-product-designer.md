# Decide rebuild: product designer seat (simplicity and progressive disclosure)

Panel seat 5 of 6. Branch `phase/05-decide-ui`, worktree `C:\dev\fincwin-p5`. 2026-10-25. Read-only: no code, catalogue or git touched.
Read: FINANCE-AUDIT.md, LANGUAGE-AUDIT.md, the Decide UI (cited by file:line below), device shots `lang-03`, `lang-12`, `lang-14`.

## Plain-English summary (grade 8)

1. People ask "can I afford it?" because they want to know if the money will still be there at the end of the month.
2. Today the app answers with about 18 ideas before a quick answer, and about 36 before a full one.
3. The biggest word on the home screen is "free", and the answer screen can say "It fits" above a red "Doesn't fit".
4. The new design gives one answer, built from one number: what a normal month leaves you.
5. "Normal month" means the middle of your logged months, so one bad month cannot swing it.
6. The answer has three shapes: "It fits", "It fits if…" and "Not yet, about March".
7. Under the answer sit at most three facts: what a tight month leaves, your monthly spare, and your cash.
8. Everything else (limits, day-by-day cash, the five steps, the month types) moves behind one "See the working" link.
9. The "Judge on" dropdown goes away. A row of six month dots replaces it, showing your good and tight months.
10. Before building, test with five people. Each must explain the answer in their own words in about 10 seconds.

---

## 1. Today's flow, screen by screen

### 1.1 What the user meets

| # | Screen | What is on it | Code |
|---|---|---|---|
| A | Decide home | "3 items need a look"; eyebrow **Net free cash flow ⓘ**; **Judge on** pill (This month / Worst / Average); "Details ›"; hero **$219,783.86 free**; sub-line "after spending, debts and everything set aside"; In/Out line; field "Something and a price" + **Check it**; **Full check ›**; rows Open checks, Add a change coming up, **Lines you will not cross**; FAB **New check** | `home/DecideHomeScreen.tsx:221-243`, `home/HomeSummaryCard.tsx:189-248, 152, 286-290`, `home/JudgeOnControl.tsx:55-116` |
| B | Quick result (on the card) | item name; state chip; size label + ⓘ ("Out of savings"); 20-30-word sentence; monthly figure + caption; basis line; rate-waiting line; "Cash / Credit"; **With other checks** pill + ⓘ; "Run the full check"; "Clear" | `quick/QuickResult.tsx:94-157` |
| C | Month details sheet | steadiness chip ("Volatile", red); breakdown In/Spending/Debts/Saving/Pots/result; basis line; **a second copy of the Judge-on radio group**, labelled by income only | `home/YourMonthCard.tsx:99-201, 252-309` |
| D | Full check, step 1 "Item" | Purchase/Investment; what; item type chips + custom type + "treat like"; price; source; when; why; replaces | `check/steps/Step1Item.tsx:128-367` |
| E | Step 2 "Price and pay" | price, tax/fees, trade-in, payment methods, card minimum, credit terms, running-cost prompts, "not a lender" note | `check/steps/Step2PriceAndPay.tsx:162-215`, `steps/step2/*` |
| F | Step 3 "Impact" | size eyebrow + ⓘ; **Rough basis** pill + ⓘ; headline; title sentence; 3 key figures (Free a month / Cushion / A month); 5-year total ⓘ; invested-instead ⓘ; basis line; converted-currency note; **three-basis card**; warnings; then up to **10 folds** (What breaks, month line by line, cash path, where it lands, setbacks, work it, if invested, income, who pays, assumptions) | `check/steps/Step3Verdict.tsx:57-82`, `check/VerdictCard.tsx:249-340`, `check/BasisOutcomeCard.tsx`, `check/step3Folds.tsx:166-270` |
| G | Step 4 "Alternatives" | cheaper / wait and save / skip table + footer (59 words) | `check/steps/Step4Alternatives.tsx` |
| H | Step 5 "Decision" | Go ahead / Wait and save / Pass | `check/steps/Step5Decision.tsx` |

The flow is five staged screens (`CheckFlowScreen.tsx:299-320`) for what is, for the user, one question.

### 1.2 Concept count before an answer

A "concept" is a named idea the user must hold to read the screen correctly.

- **Quick answer (A then B): about 18.** Net free cash flow, free, judge-on, three month types, "everything set aside", In, Out, open checks, changes coming up, lines, items need a look, state chip, size label, cushion, with other checks, cash vs credit, basis line.
- **Full answer (A, D, E, F): about 36** before the user reaches the headline's qualifiers. Step 3 alone carries about 20 ideas, 9 ⓘ and 8 to 10 folds (LANGUAGE-AUDIT 4.2).
- **Target for the rebuild: 3** before the answer (my spare, this price, the answer) and **at most 6** on the answer screen.

### 1.3 Why it fails the owner's test

The owner's model is: money in, money out, what's left at month end, and whether that leftover is normally enough. Today the screens show the parts of that model, but never the one sentence that joins them. Three specific breaks:

1. **No "normal month".** The three month types are "this month so far plus bills due" (optimistic mid-month, FINANCE-AUDIT 4.1), "worst" (lowest income paired with highest spending from different months, 4.2) and "average" (a mean, so one $150M month gives a $25M average, `lang-14`). None of them is the month a person means when they say "a normal month".
2. **One bad expense rules everything.** On "Worst", one car repair sets the verdict for six months. The owner asked exactly this: "the worst month may be because of one bad expense."
3. **No allowance.** The owner buys "one new thing every other month" and still has an allowance. The app has no idea that leftover money builds up, so a $1,200 purchase is judged against one month, never against "two months of my spare".

---

## 2. What the research says (and what it means here)

| # | Source | Finding | Design consequence |
|---|---|---|---|
| 1 | NN/g, Progressive disclosure — https://www.nngroup.com/articles/progressive-disclosure/ | Show only the few most important things first. Over 2 disclosure levels, usability is low. Whatever appears first tells users it is important. Label the trigger so users know what they will get. | Exactly **two levels**: the answer, then "See the working". No folds inside folds. |
| 2 | NN/g, same article, staged disclosure | Wizards suit steps that do not depend on each other. Steps that need back and forth belong on one screen. | Price, payment and answer are interdependent, so the 5-step wizard should be one screen that updates live. |
| 3 | NN/g, How users read on the web — https://www.nngroup.com/articles/how-users-read-on-the-web/ | 79% scan; concise, objective text gave 124% better usability. | The headline must stand alone. Qualifiers go in the headline, not three screens down. |
| 4 | GOV.UK, Writing for user interfaces — https://www.gov.uk/service-manual/design/writing-for-user-interfaces | Front-load key words, use the users' own words, one idea per sentence, short labels. Start with fewer words and add help only if research shows it is needed. | "A normal month leaves you about $600" uses the owner's own words. No ⓘ on the answer. |
| 5 | GOV.UK, One thing per page — https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/ | Splitting into one question per page helped low-confidence and mobile users. | Inputs: one field (item and price). Optional details are asked one at a time, only when they change the answer. |
| 6 | PocketGuard "In My Pocket" — https://www.moneysmylife.com/pocketguard-review/ ; https://www.fool.com/the-ascent/personal-finance/pocketguard-review/ | One figure: income minus bills minus savings goals minus spending. Reviewers note it swings for variable-income users. | A single leftover figure is the market's proven mental model. Fix the swing with a median, not a mean. |
| 7 | Simple "Safe-to-Spend" (defunct) — https://americanbanker.com/news/the-fintechs-stepping-into-the-void-left-by-simple | Users loved one running number after bills and goals; people still miss it years after Simple closed. | One number that already has goals (pots) taken off is valued. We cannot say "safe" (compliance), so we say "spare". |
| 8 | Monzo "Left to spend" community threads — https://community.monzo.com/t/what-does-left-to-spend-mean-in-the-app/107654 ; https://community.monzo.com/t/monzo-left-to-spend-missing-feature-old-monzo-design/153058 | Users found it confusing when it missed bills or shifted with pay dates; some hid it. | Name the figure's period ("a normal month"), and never show a month-so-far figure as the answer. |
| 9 | Copilot (via SoFi) — https://www.sofi.com/copilot-money-vs-sofi-coach/ | "Free to spend" plus an ideal spending pace. | Pace is a second-level fact; keep it out of the answer. |
| 10 | Cleo — https://www.thepennyhoarder.com/budgeting/cleo-app-review/ | Markets "Can I afford it? Just ask" as the hook; answers in chat sentences. | The sentence is the product. Lead with a sentence, not a dashboard. |
| 11 | Gigerenzer and Hoffrage, natural frequencies — https://pmc.ncbi.nlm.nih.gov/articles/PMC4604268 | Counts ("4 of 6") beat probabilities and percentages; +37 points of correct reasoning. | Show good vs tight months as **"4 of your last 6 months"** and as dots, never as a percentage or a CV. |
| 12 | PIAAC 2023 — https://www.ies.ed.gov/learn/press-release/u-s-adults-score-par-international-average-literacy-skills-below-international-average-numeracy-and | 34% of US adults at or below numeracy Level 1. | At most 3 figures on the answer screen, rounded to whole dollars, each with a plain label. |
| 13 | CFPB, Know Before You Owe testing — https://www.consumerfinance.gov/about-us/newsroom/consumer-financial-protection-bureau-announces-initiative-to-combine-mortgage-loan-disclosures | Iterative one-on-one testing plus heatmaps; key terms placed where people look first. | Section 5's test script; the most important figure goes top-left of the answer. |
| 14 | YNAB "true expenses" — https://support.ynab.com/en_us/ynab-glossary-a-guide-BJd80SORq.md | Irregular big costs are broken into monthly amounts and set aside ahead. | The owner's "allowance" is this idea, reversed: spare builds up between purchases. |

Not found: a primary Klarna or Affirm affordability explanation (searches returned reviews and an ombudsman case only, e.g. https://www.financial-ombudsman.org.uk/decision/DRN-5570382.pdf). Their pattern (one monthly payment, shown before anything else) is cited from general knowledge.

---

## 3. The new flow: one answer

### 3.1 The one model, in the owner's words

```
Money in  −  money out  =  what a month leaves you
Look at your last 6 months. Put them in order. The middle one is a NORMAL month.
The second-lowest is a TIGHT month (not the single worst, so one bad expense can't rule it).
Your SPARE = what a normal month leaves, after bills, debts, saving and pots.
This price, compared with your spare  →  the answer.
```

- **Normal month** = median of per-month leftovers (each month computed whole, income and spending from the *same* month). Robust to one windfall or one repair.
- **Tight month** = second-lowest of the six leftovers. Shown as a fact, never as the headline. (Finance seat to confirm; this matches FINANCE-AUDIT N2.)
- **Big one-off**: when one transaction makes up most of the gap between a month and normal, the dot says so ("car repair, $1,400") and the user can tap "Don't count it". This is the owner's "one bad expense".
- **Allowance** = spare not yet used. Spare from normal months builds up; things recorded through Decide draw it down. So "one new thing every other month" reads as "this uses 2 months of your spare", not as a broken month. Purchases recorded through Decide are kept out of the "normal month" baseline, so buying things does not lower the next answer twice.
- **Cash** is a separate guardrail, not the answer: "Paid from savings, you'd still have $X." It matters only when the price is bigger than this month's spare.

### 3.2 The answer rule (the only logic the user sees)

| Answer | When | Headline pattern |
|---|---|---|
| **It fits** | price (or monthly payment) ≤ allowance available now, and a tight month still ends at or above zero | "It fits. A normal month leaves you about $600." |
| **It fits if…** | fits in a normal month but not a tight one; or fits only by using savings; or fits if spread or delayed | "It fits if you wait until March." / "It fits if it comes from savings." |
| **Not yet** | price is more than the allowance plus cash above the safety amount | "Not yet. At your normal spare, about March 2027." |
| **Month already short** | a normal month already ends below zero | "Your normal month already spends about $150 more than comes in." |
| **Not enough data** | fewer than 1 full month and no rough figures | "Log one full month and this can answer." |

Every headline names the month it is about. A green headline over a red row cannot happen, because the tight month is part of the rule, not a separate card. All copy is declarative: no "should", "safe", "recommend", "go ahead".

### 3.3 Wireframes

**Home** (replaces `HomeSummaryCard` + Judge-on + 5 rows)

```
┌──────────────────────────────────────┐
│ Can I afford it?                     │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ A normal month leaves you        │ │
│ │ about $600                       │ │  ← one figure, whole dollars
│ │                                  │ │
│ │ ● ● ● ○ ● ◐   last 6 months       │ │  ← dots: ● normal, ○ tight,
│ │ 4 normal · 1 tight · 1 one-off   │ │     ◐ one big expense
│ │                                  │ │
│ │ Spare built up: $900             │ │  ← the allowance
│ │                                  │ │
│ │ [ What is it, and how much?    ] │ │
│ │ [            Check             ] │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Saved checks (2)                  ›  │
│ How this works                    ›  │  ← the working, home level
└──────────────────────────────────────┘
```

Removed from first view: "Net free cash flow", "free", Judge-on pill, In/Out line, "Details", "Full check", "Add a change coming up", "Lines you will not cross", "items need a look" (moves to the app-wide problems sheet), FAB. Tapping a dot opens that month (section 3.4).

**Entering an item** (replaces steps 1 and 2; one screen, live)

```
┌──────────────────────────────────────┐
│ ‹  Sofa                              │
│                                      │
│ Price            [ $1,200          ] │
│                                      │
│ How will you pay?                    │
│ ( ) All at once   ( ) Monthly        │  ← only asked if not obvious
│                                      │
│ Any cost after you buy it?           │
│ ( ) No   ( ) Yes: [ $  ] a month     │  ← only for car, home, pet,
│                                      │     subscriptions (item type)
│ [            See answer            ] │
│                                      │
│ More details (tax, trade-in, rate) › │  ← level 2, optional
└──────────────────────────────────────┘
```

The quick field ("sofa 1200") skips this screen entirely and goes to the answer. This screen appears only from "Change" on the answer, or when the item type needs running costs. Item type, custom type, "treat like", why, source, when, replaces: all in "More details", and most can be inferred.

**Answer: it fits**

```
┌──────────────────────────────────────┐
│ ‹  Sofa · $1,200                     │
│                                      │
│  It fits.                            │  ← headline, one line
│  You have $900 spare built up and    │
│  $600 more comes each normal month.  │
│  This uses about 2 months of spare.  │
│                                      │
│  ─────────────────────────────────── │
│  In a tight month    $80 left        │  ← fact 1
│  Your cash after     $4,300          │  ← fact 2 (only if paid now)
│  ─────────────────────────────────── │
│                                      │
│  Rough estimate · 3 months logged    │  ← plain, no ⓘ
│                                      │
│  See the working                  ›  │
│                                      │
│ [ Record as bought ] [ Plan for it ] │
│            Not buying                │
└──────────────────────────────────────┘
```

**Answer: it fits if… (tight)**

```
│  It fits if you wait until March.    │
│  A normal month leaves you $600.     │
│  Today you have $300 spare built up. │
│  ─────────────────────────────────── │
│  Buy now from savings   cash $3,100  │
│                         (your safety │
│                          amount $3k) │
│  In a tight month        $40 short   │
│  ─────────────────────────────────── │
│  See the working                  ›  │
│ [ Plan for March ] [ Record as bought ]
```

The "if" is always one concrete thing: wait until a month, take it from savings, or pay monthly. If two "ifs" exist, show the cheaper-to-understand one (wait), and list the other in the working.

**Answer: doesn't fit yet**

```
│  Not yet.                            │
│  This is about 4 months of your      │
│  normal spare ($600 a month).        │
│  ─────────────────────────────────── │
│  Ready about            April 2027   │
│  A $700 version fits    today        │  ← only if the item has
│  ─────────────────────────────────── │     a sensible cheaper option
│  See the working                  ›  │
│ [ Plan for April ]    [ Not buying ] │
│        Record as bought anyway       │  ← secondary, still allowed
```

**Answer: month already short** (purchase and month separated, FINANCE-AUDIT 4.4)

```
│  Your normal month already spends    │
│  about $150 more than comes in.      │
│  ─────────────────────────────────── │
│  This sofa adds         $0 a month   │
│  Paid from savings      cash $2,900  │
│  Months like this       4 of last 6  │
│  ─────────────────────────────────── │
│  See where the month goes         ›  │  ← opens month breakdown
│ [ Record as bought ]  [ Not buying ] │
```

Neutral colour. No red headline for a $5 item. The fact that matters ("adds $0 a month") is visible, and the month problem is stated once, plainly.

**Answer: not enough data**

```
│  Not enough to go on yet.            │
│  This needs one full month of your   │
│  money in and out.                   │
│  ─────────────────────────────────── │
│  Logged so far          12 days      │
│  Or give rough figures  ›            │  ← existing rough-figures sheet
│  ─────────────────────────────────── │
│ [ Save this check for later ]        │
```

With rough figures only: show the normal answer with "Rough estimate · from your own figures, not logged months" and no tight-month row.

### 3.4 The details layer ("See the working")

One screen, one level, plain section headers, each closed by default except the first. No ⓘ inside; each section starts with one sentence that explains itself.

```
┌──────────────────────────────────────┐
│ ‹  The working                       │
│                                      │
│ YOUR MONTHS                          │
│ Oct  ●  $640 left                    │
│ Sep  ●  $610                         │
│ Aug  ◐  −$800  car repair $1,400     │
│             [ Count it ] [ Don't ]   │
│ Jul  ●  $590                         │
│ Jun  ○  $90    tight                 │
│ May  ●  $600                         │
│ Normal = the middle month: $600      │
│ Tight  = second-lowest:      $90     │
│                                      │
│ A NORMAL MONTH, LINE BY LINE      ›  │  In / Spending / Debts / Saving / Pots
│ YOUR SPARE BUILT UP               ›  │  +600 Sep, +640 Oct, −380 lamp…
│ CASH DAY BY DAY                   ›  │  today's cash path chart
│ YOUR LIMITS                       ›  │  6 limits, "within every limit"
│ OTHER WAYS                        ›  │  cheaper, later, monthly
│ IF SOMETHING GOES WRONG           ›  │  setbacks (Pro / level 3+)
│ TOTAL COST OVER TIME              ›  │  TCO, invested instead (level 3+)
│ WHAT THIS ASSUMES                 ›  │  11 assumptions, how firm, currency
└──────────────────────────────────────┘
```

Good vs bad months are understood without jargon because they are just the user's own months, in order, with one word each. The allowance is understood because it is a running balance ("built up"), the same shape as a bank balance. The app's existing feature-level system (four levels) decides how many of the lower sections show; level 1 sees the first three only.

---

## 4. What to remove, hide or change

### 4.1 Remove from the first view (keep in the working, or delete)

| Today | Fate | Where |
|---|---|---|
| "Net free cash flow" eyebrow + 94-word ⓘ | Delete. Replaced by "A normal month leaves you" | `HomeSummaryCard.tsx:189-197` |
| "$X free" hero | Replace with "about $600" (rounded) | `HomeSummaryCard.tsx:234` |
| In / Out line | Working → "A normal month, line by line" | `HomeSummaryCard.tsx:247-248` |
| "Full check ›" and FAB "New check" | Delete. One entry: the field | `HomeSummaryCard.tsx:286-290`, `DecideHomeScreen.tsx:70` |
| "Lines you will not cross" row | Working → "Your limits" | `DecideHomeScreen.tsx:200-203` |
| "Add a change coming up" row | Working → "What this assumes", or Activity | `DecideHomeScreen.tsx:193-194` |
| Steadiness chip "Volatile" (red) | Replaced by the dots | `YourMonthCard.tsx:168-170` |
| 5-step wizard + step bar + "Step five is where anything gets written" | One answer screen + optional details screen | `CheckFlowScreen.tsx:299-320` |
| Size eyebrow ("Out of this month's spare") + ⓘ | Delete; the headline carries it | `VerdictCard.tsx:267-275`, `QuickResult.tsx:107` |
| Key figures (Free a month / Cushion / A month) | Replace with ≤2 labelled rows | `VerdictCard.tsx:301-308` |
| "Rough basis" pill + ⓘ + sheet | Plain line "Rough estimate · 3 months logged"; reason in working | `VerdictCard.tsx:284-286` |
| 5-year total and invested-instead on the card | Working → "Total cost over time" | `VerdictCard.tsx:310-330` |
| Converted-currency / card-minimum footnote | Working → "What this assumes" | `Step3Verdict.tsx:74-80` |
| Three-basis card ("The outcome on each basis") | Delete. Tight month is part of the rule | `Step3Verdict.tsx:81`, `BasisOutcomeCard.tsx` |
| 10 folds | 8 plain sections, one level, in the working | `step3Folds.tsx:166-270` |
| "With other checks" pill | Off by default; one line in the working ("2 saved checks not counted · Count them") | `QuickResult.tsx:157` |
| "Clear" next to the header | Move to an overflow menu ("Discard check") | `CheckFlowHeader.tsx` |
| Step 4 Alternatives table | The "if" line + "Other ways" section | `Step4Alternatives.tsx` |
| Go ahead / Wait / Pass | Record as bought / Plan for it / Not buying | `Step5Decision.tsx` |

### 4.2 What the Judge-on dropdown becomes

It goes. Asking a tired user to pick a scenario ("This month / Worst month / Average") before they get an answer pushes the hardest decision onto the person least equipped for it, and the default (This month) is the optimistic one (FINANCE-AUDIT 4.1). Replacement, in three parts:

1. **No choice in the answer.** The rule in 3.2 always uses the normal month and always checks the tight month. There is nothing to pick.
2. **The six dots** replace the selector on home. They show the same information the three bases tried to carry (good months, bad months, spread) as counts, which people read better than summary statistics (Gigerenzer, source 11).
3. **"Count it / Don't count it"** on a one-off month in the working replaces "basis override". This is the only control, and it is about a real event the user recognises ("car repair"), not an abstract basis.

"This month so far" survives only as a progress line inside "A normal month, line by line" ("October so far: $410 left, 7 days to go"). It is never the basis of an answer.

`HomeJudgeOn`, `basis_override` and the 'month' basis stay in the engine for now; the UI stops writing them. Engine work (median, second-lowest, per-month leftovers, one-off detection, allowance ledger) belongs to the finance and engine seats.

---

## 5. Comprehension test: 5 users

**Who:** 5 adults, phone users, no finance job. At least 2 with lower numeracy (self-rated "not a numbers person"), 1 with irregular income, 1 who speaks English as a second language. 20 minutes each, remote or in person. Clickable prototype or static screens; no live data.

**Setup:** "This is an app that keeps track of your money. Imagine these are your numbers." Show the home screen with a $600 normal month, dots `● ● ◐ ● ○ ●`, $900 built up.

| # | Task / question | Screen | Pass if the user… |
|---|---|---|---|
| 1 | (5 seconds, then hide) "What did that screen tell you?" | Home | says something like "I usually have about $600 left each month" |
| 2 | "What do the dots mean? Which month was bad, and why?" | Home | names the one-off month and says one expense caused it, without help |
| 3 | "You want a $1,200 sofa. Find out if you can afford it." | Home → answer | types it and reaches the answer in under 30 seconds |
| 4 | (5 seconds, then hide) "Can you afford it? Why?" | Answer: fits | says yes **and** gives the reason in their own words ("I have $900 saved up plus $600 a month") |
| 5 | "What happens in a bad month?" | Answer: fits | reads the tight-month row and says "I'd have about $80 left" |
| 6 | (5 seconds) "And this one?" ($2,400 TV) | Answer: not yet | says "not yet / about April", not "no, never" and not "yes" |
| 7 | "What would make it fit?" | Answer: fits if | names the one condition (wait until March / use savings) |
| 8 | "Is the app telling you to buy it?" | Any answer | says no, it is showing the numbers (compliance check) |
| 9 | "Where would you check how it got that number?" | Any answer | finds "See the working" without hunting (under 10 s) |
| 10 | "That car repair was a one-off. Make the app ignore it." | Working | taps "Don't count it" and notices the normal-month figure change |
| 11 | (Month already short) "Can you afford a $20 lamp?" | Answer: short | says the lamp adds nothing monthly, and that their month is already over |

**Pass criteria for the design:** tasks 1, 4, 6 and 8: **5 of 5** (these are the "trustworthy answer" tasks; one failure means the copy changes). All others: **4 of 5**. No participant uses the words "free money", "approved" or "the app says I should". Median time to answer in task 3 under 30 seconds. Record verbatim paraphrases; they are the test, not the ratings. Run the same script on today's build (`lang-03`, `lang-12`, `lang-14`) first, to get a baseline.

---

## 6. Open questions for the owner

1. **Allowance: built up, or per month?** I assume spare builds up between purchases ("$900 built up") and that things recorded through Decide draw it down. Should money that was spare but spent elsewhere (not through Decide) also reduce it? (If yes, the allowance becomes "cash above your safety amount", which is simpler but less personal.)
2. **What counts as normal?** Median of the last 6 full months. Is 6 right, or 12 for people with seasonal income? And should "tight" be the second-lowest (my proposal) or something the user names?
3. **Savings as a "fits if".** Is "It fits if it comes from savings" an acceptable answer, or should paying from savings always be shown as "Not yet" for the month and a separate cash fact?
4. **Monthly payments in the quick answer.** Keep credit and BNPL in the first answer (as "fits if you pay $X a month"), or only in "More details"? It adds one concept but is how many people actually buy.
5. **Levels.** Should the four onboarding levels gate the working sections (level 1 sees 3 sections; level 4 sees all 8), or should everyone see everything one tap away?
6. **Household.** In a shared household, is "a normal month" yours, your share, or the household's? The answer copy changes ("leaves you" vs "leaves the house").
7. **The 5-step flow.** May it be retired, or does any part (the commit step, the alternatives table) need to stay as its own screen for record-keeping or Pro?
8. **Wording you can live with.** "Spare", "normal month", "tight month", "built up", "Not yet". Each replaces a decided term (D-106 "free", D-107 Judge on). Confirm before the copy seat rewrites the catalogue.
9. **One-off detection.** Is it acceptable for the app to suggest "this looks like a one-off" automatically, or should only the user mark one-offs (today's D-47 behaviour)?
