# Decide: check path, big-buy stepper, Decide setup and Decide sheets

Prototype spec for the clickable phone prototype. IDs prefixed `D`. Example user AM, today Thursday Nov 5, 2026 (see BRIEF.md). Copy is final-quality, declarative, grade-10 English. It never uses "advice", "recommendation", "suggestion" or "you should".

Sources read: L08 Decide home, L08b More details and typing boards; Variant C canvas (Main, C2 type, C3 price and tax, C4 running costs, C5 home costs, C22 setup, C41/C42 quick estimates, plus the C script logic for steps, sheets and plans); the N answer boards N01 to N26; and the repo on `origin/main` (d36418a2): `src/engine/decide/v3/types.ts`, `judge/bands.ts`, `judge/purchase.ts`, `judge/presetQuestions.ts`, `readiness.ts`, `v3/constants.ts`, `.planning/Decision Research/panel/00-REBUILD-PLAN-v3.md` §5 and §6, `05.4-CONTEXT.md`, `05.4-26-PLAN.md`, `05.4-27-PLAN.md`, and `REQUIREMENTS.md` (DEC-30, DCU-20, DSU-04 Variant C notes).

---

## Research findings

**Setup checklists that stay until done**
- **YNAB** shows a setup checklist on the mobile Home tab for each new plan. Its three steps are shortcuts that can be done in any order, and the user can finish one, leave, and come back to the rest. ([YNAB: Set up at your own pace](https://www.ynab.com/whats-new/set-up-ynab-at-your-own-pace), [YNAB Getting started](https://support.ynab.com/en_us/getting-started-with-ynab-BJBFUjkUGg.md)) **We take:** the banner lives on the tab it serves (Decide), the steps work in any order, and progress is kept between visits.
- **Copilot Money** finds likely recurring payments during onboarding, then asks the user to confirm them in a monthly view. Category suggestions start only after 30 reviewed transactions. ([Copilot quick start](https://help.copilot.money/en/articles/11157550-quick-start-guide)) **We take:** the bills step shows what Activity found and asks "Regular / Not regular / Change". It never asks the user to type a bill list from scratch. This matches the engine rule that only confirmed series count (DSU-05).
- **Linear** gives new members a short "get familiar" task list after they join a workspace, so they keep moving without having to plan their own path. ([Supademo Linear teardown](https://supademo.com/user-flow-examples/linear)) **We take:** each banner row names the single next item ("Next: Debts"), so the user never has to choose where to start.
- **Duolingo** puts sign-up off for as long as it can: the first lesson comes before the form. ([Appcues GoodUX: Duolingo](https://goodux.appcues.com/blog/duolingo-user-onboarding), [Taplytics: Duolingo delayed sign-up test](https://taplytics.com/blog/duolingo-ab-test-onboarding)) **We take:** setup never blocks a check. A new user can type a price and get a first answer from three quick estimates (D39). Setup is what makes later answers rest on records.
- **Notion** treats a first-session page edit as its activation moment (secondary teardown only; I found no official Notion checklist page). **We take:** the first check counts as "done something real". The banner is not the first thing a new user has to finish.

**Progress, momentum and why the banner stays**
- **Endowed progress.** People given real or apparent progress toward a goal keep going for longer. In Nunes and Drèze's car-wash study, a 10-stamp card with 2 stamps already given was finished faster than a plain 8-stamp card. The effect depends on the head start having a believable reason. ([UX Collective summary](https://uxdesign.cc/endowed-progress-effect-give-your-users-a-head-start-97d52d8b0396), [paper notes](https://andrewclark.super.site/papers-for-product-managers/the-endowed-progress-effect-how-artificial-advancement-increases-effort)) **We take:** items already satisfied by the user's own data are ticked on day one, with the reason shown ("Set in Grow"). Nothing is ticked without a real reason. That would break trust in a money app.
- **Unfinished tasks stay in mind** (the Zeigarnik effect, as applied by onboarding writers). A checklist that stays in view keeps that pull. One hidden behind a menu, or dismissed after the first session, loses it. ([Userpilot: progress bar psychology](https://userpilot.com/blog/progress-bar-psychology/), [Atticus Li: checklist completion](https://atticusli.com/blog/posts/onboarding-checklist-effect-completion-psychology-drives-activation/)) **We take:** the owner's rule that the banner stays until setup is complete. It shrinks to a quiet one-line row once started, to keep the calm, quiet-day rule.
- **Visible progress and small, achievable tasks** come up again and again in checklist guidance, along with help reachable from inside the checklist. ([Userpilot checklist tips](https://userpilot.com/blog/user-onboarding-checklist-tips/), [Flook best practices](https://flook.co/blog/user-onboarding-checklist-best-practices), [Supademo](https://supademo.com/blog/product-onboarding-checklist)) The vendor figures for checklist length and completion lift do not trace to peer-reviewed work, so we do not rely on them. **We take:** 6 items, each about 30 to 60 seconds, and a "Why we ask" line on every step (carried over from C22).

**Steppers and progress indicators**
- **Material:** use a determinate linear indicator when the amount of progress is known. ([Android Compose progress](https://developer.android.com/jetpack/compose/components/progress)) **Apple HIG:** use a determinate indicator where you can, keep it near the content, and warn people when leaving would lose work. ([Apple HIG: Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)) **We take:** a 3-segment bar with a "Step 2 of 3" text label. Values are kept, so leaving the stepper loses nothing and needs no warning.
- **Variant C (the chosen design).** C2 to C4 have Back and Next but **no progress bar**. C22 setup does have one ("1 of 4" with a 4 px bar). The stepper here borrows C22's bar for the C2 to C4 steps. C3 already has "See the answer now" as a skip. We keep it on every step.

**What the engine needs (origin/main) and what that means for the steps**
- `CheckV2` holds: price, `taxPercent`, `oneOffFees`, `itemType` (preset or custom), `pay` (`once` or `plan` with cadence, count or term, APR, setup, per-payment and end fees, deposit, trade-in, quoted payment, first payment today / one period / deferred, interest during a pause), `extras` keyed by question id, `share`, `purpose`, `emergency`, and `value`. Planned in 05.4-26 and 05.4-27 (not yet on main): `runningCosts[]` (amount, `everyMonths: 1 | 3 | 12`, start, end, on), `closingPercent`, `purchaseDate`, and `replaces` (costs that stop, plus a sale with arrival date and the debt it pays off). The three steps ask for exactly these.
- **Bands** (`judge/bands.ts`, v3 §5.2): the whole value (price + tax + one-off fees, my share) sets a band from fixed US$ edges converted to the home currency. Band 6 (over US$5,000) is where the engine starts asking for the "whole plan" (L5). An item type with extras adds its question set at any band ("a $3,000 used car still gets the vehicle questions"). These two engine facts are the basis of the big-buy rule below.

---

## The big-buy rule

After **Check it**, Decide opens the stepper (D10) when **any one** of these is true. Otherwise it goes straight to the answer (D20).

1. **The kind has running costs:** Car (vehicle) or Home (property). The kind is read from the words (car, van, scooter, motorbike, truck, house, home, flat, apartment, condo) or picked on step 1.
2. **It is paid over time:** How you pay is set to Installments in More details, or the words say so (loan, finance, on a plan, monthly payments, mortgage).
3. **It is large:** the price with tax is over the engine's band-6 edge, US$5,000 converted to the home currency by the fixed band table (about $5,000, €5,000 or £4,000).

Not big: everything else, including the $3,500 laptop paid in cash (straight to N04 Fits, but tight) and the $180 headphones (straight to N02 Fits). The $4,200 camera body is not big if paid in cash, and big if paid in installments. The $9,000 used car is big on rules 1 and 3.

Two ways the user can move between the paths:
- A small buy's answer has a row **"Running costs · none counted · Add"** under More detail. It opens the stepper at step 3 with steps 1 and 2 filled in.
- A big buy can skip any step with **See the answer now**. Steps not visited use Decide's pre-filled amounts (Variant C, ARC-26: pre-filled running costs replace blank prompts), and the answer names them (D21).

Quick estimates added in More details (D02) are carried into step 3 as switched-on rows. They are never asked for twice.

---

## Decide home

### D01 Decide home (screen)
**Reached from:** Decide tab; Back from any Decide screen; "Back to Decide" on D38.
**Purpose:** ask one question, "Can I afford it?", and show the month the answer starts from.
**Layout, top to bottom** (as board L08, with these changes):
1. Header: kicker "DECIDE", title "Can I afford it?", subtitle "Judged on what comes in and goes out of your accounts, not just the price." Pill button at top right: "Past decisions", with a "1" count badge (1 to look back on).
2. **D30 Decide setup banner** (new). It shows only while setup is not complete.
3. Check card: "What is it?" field (placeholder "For example, headphones"; a kind glyph appears once read). "Price" field with "$" and the right-hand note "Tax is added for you". "When?" as three choices: **Today** (Thu, Nov 5), **Nov 15** (Next payday), **Pick a date** (Any day). Collapsed row **More details** ("How you pay, quick estimates · optional"), then the **Check it** button. Check it is dimmed until there is an item and a price.
4. "Try an example" chips: Headphones $180 · Laptop $3,500 · Used car $9,000.
5. Your month card: month switcher (November, with arrows back to Sep and Oct), "$425 left in November · Expected", stacked bar, COMES IN $3,200 / GOES OUT $2,775 / LEFT $425, a Usual month / Worst month switch ($425 left / $380 left), an explainer sentence, then the row "Records up to Oct 21 · 2 of 3 months · One more month, on Nov 21, makes every answer surer."
6. Open checks, with "+ Purchase" and "+ Investment" links: Headphones (Fits · $180 · Dec 15 · leaves $231), Laptop (Tight · $3,500 · Jan 15 · leaves $320), Studio camera body (Draft · $4,200 · how to pay not chosen).
7. Your money rules ("Every answer keeps to these. Tap one to change it."): Safety net $1,300 (Locked · no answer spends it), Debt payments at most 36%, Investing at least $200, Saving at least $150.
8. Row "Something changed? · Pay, a bill or a one-off cost". **L08's "Finish setup · 4 short steps" row is removed**: the D30 banner replaces it.
9. Footnote: "Answers use 2 months of pay, 14 spending lines, 1 debt and 4 accounts. Change any of them in Activity or Grow and every answer updates. FincWin is a planning tool, not a lender or adviser."

**Typing state** (L08b typing board): while typing in a single field, "Reads as" chips appear (Laptop · $3,500 · Today · Cash), each tappable, with "Sales tax is added for you, so it counts as about $3,780." Both entry styles land on the same rule.

**Taps:**
- Past decisions → D47.
- Setup banner → D31.
- Kind glyph in the What field → D11 as a sheet-like picker (kind only), then back to D01.
- Today / Nov 15 → selects that date (radio). Pick a date → D40.
- More details → D02 (expands in place).
- Check it → applies the big-buy rule: **D10/D12** (or D11 if the kind is unknown) for big buys, **D20** for small ones.
- Example chip → fills item and price; the user still taps Check it.
- Month arrows → Sep / Oct (past months). The Usual / Worst switch changes the card.
- Records row → D37 (the setup records step, also reachable after setup is complete).
- Open check row → D46. "+ Purchase" → focuses What is it?. "+ Investment" → see open question 6.
- Safety net rule → D51. Other rules → D49 (one variant per rule).
- Something changed? → D53.

**States:** offline (N22 card above the check card: "Offline. Using records up to Oct 21. Retry"), error (N23 card), not ready (no full month yet: Check it still works and lands on N24).
**Motion:** none on arrival; bars fill 0.55 s on first view only. **Accessibility:** "When?" is a radio group. Check it has `aria-disabled` with the hint "Add what it is and a price". The badge is read as "Past decisions, 1 to look back on".

### D02 Decide home, More details open (screen state)
**Reached from:** the More details row on D01.
**Purpose:** optional extras for this check only.
**Layout:** the row expands in place (0.26 s, chevron turns) and its subline becomes "Cash · 1 quick estimate".
- "How you pay": segmented **Cash | Installments**.
- "Quick estimates": "Money your records do not know about yet. It counts in this check only." Example row: Laptop insurance · Expense · every month · $12, with a remove ×. Then four dashed add tiles: **Expense**, **Loan**, **Savings**, **Income**.
- Note: "To change your records for good, use Something changed? further down."
- **Check it** button.

**Taps:**
- Installments → selects it. If the plan has no terms yet, D42 opens. Picking Installments makes the check a big buy (rule 2).
- Each tile → D41 in its variant (Expense / Loan / Savings / Income).
- Row × → removes the row, with Undo toast "Removed: Laptop insurance."
- Row body → D41 to edit it.
- "Something changed?" link → D53.
- Check it → same rule as D01.

**Accessibility:** the row is a disclosure button (`aria-expanded`). The tiles read "Add an expense quick estimate", and so on.

---

## Big-buy stepper

### D10 Stepper frame and rules (shared frame)
**Reached from:** Check it on a big buy; "Add" on a small-buy answer's Running costs row (opens at step 3); "Edit steps" on D21; Edit on an open check (D46).
**Purpose:** collect only what the engine needs for a large or ongoing purchase, in 3 short steps.
**Frame, top to bottom, on every step:**
1. Top bar: Back chevron (44 × 44, label "Back"). Right side: item and price in muted text, "Used car · $9,000".
2. Progress: text "Step 2 of 3", then a 3-segment bar (each segment 4 px tall, 4 px gaps). Labels under the segments: **Kind · Price · Running costs**. Done segments are filled in accent; the current segment is filled; later segments are rule colour. A done segment is a button that jumps back to that step.
3. Step title (Archivo Black 26) and a one-line "Why we ask:" note.
4. Step content.
5. Primary button: **Next**. On step 3 it reads **See the answer**.
6. Text link under it: **See the answer now**. Not shown on step 3.
7. Footnote: "A planning estimate. FincWin is a planning tool, not a lender or adviser. It does not lend money or arrange credit."

**Rules:**
- **Where it starts.** Step 1 is shown only when the kind was not read from the words. Otherwise the flow opens on step 2 with segment 1 already filled ("Kind: Car") and tappable. The head start is real, because the kind was read.
- **Back** (chevron, Android back, edge swipe) goes to the previous step. From the first shown step it goes to D01 with item, price, date and More details kept. No step loses values. There is no "discard?" dialog.
- **Skip.** "See the answer now" goes to D20 with the current values. Steps not visited use pre-filled amounts, and D21 names them.
- The answer (D20) is the end of the stepper, not a fourth segment. Back from the answer returns to step 3.
- **Motion:** steps slide 0.22 s left or right with the direction of travel; the bar segment fills 0.22 s. Reduce Motion: a crossfade, and the bar sets without animating. Haptics: none on Next; a light tap on "See the answer".
- **Accessibility:** the bar is `role="progressbar"`, `aria-valuenow` 2 of 3, label "Step 2 of 3, Price". Focus moves to the step title on each step. Large text (160%): segment labels wrap under the bar, and the bar never shrinks below 44 px touch height for its tappable segments.

### D11 Step 1: What kind of purchase? (screen)
**Reached from:** D10 when the kind is unknown; the kind glyph on D01; segment 1.
**Purpose:** pick the kind, so Decide can fill in the right costs.
**Title:** "What kind of purchase?" **Why we ask:** "This picks the costs Decide fills in for you. You can change any of them."
**Content:** a 2-column radio grid of 112 px tiles. Each tile has a 36 px icon tile, a name, a subline, and a tick when selected:
- Everyday: Clothes, headphones, gifts (engine `general`)
- Tech: Laptop, phone, TV (`electronics`)
- Car: Car, scooter, van (`vehicle`)
- Home: Buying a place to live (`property`)
- Other: Anything else (`general`)
- The user's own kinds, if any (custom `itemType` with a base kind)
- A dashed tile, "Add your own: A kind that is not listed" → D44 (kind variant)

Icons use our set: `headphones`, `laptop`, `transport`, `housing`, `checkbuy`; `add` for the dashed tile.
**Taps:** a tile selects it (radio). Next → D12. If the new kind is not a big buy and the price and pay are small, Next still continues: the user chose the stepper.
**Accessibility:** a radio group labelled "Kind of purchase". Each tile reads "Car, car, scooter, van, selected".

### D12 Step 2: Price, tax and how you pay (screen)
**Reached from:** D11, or directly from D10.
**Purpose:** settle the up-front amount and the payment plan.
**Title:** "Price and how you pay". Subline: the item. **Why we ask:** "Tax and fees are part of what you pay on the day."
**Content:**
1. Card. **Price** field, $ 9,000. **Sales tax, %** field, 8 ("estimate for your area · change"), with the note "Check your local rate. Rates vary by area." A switch, **Price already includes tax**: "For places where tax is in the shelf price" (on by default in the UK and EU, D-19).
   - No region: a soft box instead of the tax field, "Tax not included. Set your region to add it.", with a link "Set your region" → You > Region.
   - Home kind: the tax field is replaced by "Homes have no sales tax here. Closing costs and monthly costs come next."
2. Card, **How do you plan to pay?**: "The answer shows both. This picks which one opens first." A 2-tile radio:
   - **Cash**: $10,020 up front
   - **Installments**: $1,000 down · $408/mo

   With Installments selected: a **Cash down (paid today)** field ($1,000), then a plan row "$408 a month for 24 months · Car loan · 7.9% example rate · 24 months · a month" with "Change" → D42.
3. Card, **One-off costs (quick estimates)**: switch rows with an amount field. Dealer and documentation fees $300 (on); Trade-in value $0 (off; it lowers the up-front amount); "+ Add a one-off cost" → D44 (fee variant).
4. Card, **Up front**: a small waterfall. Price $9,000 · Sales tax, about 8% $720 · Dealer and documentation fees $300 · **Up front $10,020**. With installments: Cash down $1,000 · Plan fees $0 · Up front $1,000, plus the note "Sales tax and one-off fees are part of the amount borrowed, so only the cash down is paid on the day."

**Engine fields:** price, taxPercent (0 when the price includes tax), oneOffFees and extras (`dealer_fees`, `trade_in` as a credit), and `pay`.
**Taps:** Next → D13. See the answer now → D20. Change → D42. Set your region → You > Region (the prototype shows a toast "Opens Region in You").
**Errors:** "Enter a price." "That price is too large to check." "Enter a rate from 0 to 30%." Each shows inline as `role="alert"`.
**Accessibility:** the amount fields have visible labels. The waterfall has an `aria-label` that reads the sum.

### D13 Step 3: Running costs, and what stops (screen; Home variant inside)
**Reached from:** D12; "Add" on a small-buy answer; segment 3.
**Purpose:** the monthly side. New costs that start, and costs that stop or money that comes back.
**Title:** "Running costs". Subline: "Quick estimates for the car. Change any amount, how often it comes, or switch a line off." **Why we ask:** "Costs that come every month change what a usual month leaves."
**Content:**
1. Card, **Running costs, from the day you buy**. Rows of switch + label + how-often chip + amount field (96 px):
   - Insurance · monthly · $140 (`insurance_monthly`)
   - Fuel or charging · monthly · $120 (`fuel_monthly`)
   - Maintenance · yearly · $600, about $50 a month (`maintenance_yearly`)
   - Registration and licence · yearly · $156, about $13 a month (`registration_yearly`)
   - Loss of value (optional, not cash) · off
   - Any quick estimate carried from D02 appears here, switched on.
   - "+ Add a running cost" → D44 (running variant).
   - Each how-often chip → D43.
2. Card, **Costs that stop when you buy**:
   - "Selling a car you have now: Off". Tapping it → D45.
   - "+ Add a cost that stops" (for example a bus pass, $96 a month) → D44 (stop variant).
3. Card, **About $323 a month**: "76% of what a month leaves". A stacked bar with a legend: Insurance $140 · Fuel $120 · Maintenance $50 · Registration $13. Then "A usual month leaves $425 today. After this, about $102." and "Yearly costs are shown as a monthly amount."
   - No lines on: "No running costs are switched on. Switch a line on above if it applies."

**Home variant (kind = Home; home buying is its own phase after the re-audit, so the prototype shows it but marks it "Preview"):** the title becomes "Home costs". There is an "Up front" card: Down payment, 10% · Closing costs, 2.5% (chip "2.5%" → closing % sheet, C39 pattern) · Moving costs. Then "Each month": Mortgage payment row → D42 (mortgage variant, length in years), Property tax · yearly, Home insurance · yearly, Upkeep · yearly, Service or strata charge, Utilities change. Costs that stop: "Rent $1,200 · matched to Activity" (C30 pattern).
**Engine fields:** `runningCosts[]` (everyMonths 1, 3 or 12; start; end; on) per 05.4-26; preset extras for the item type; `replaces.stops[]` and `replaces.sale` per 05.4-27; `closingPercent` for homes.
**Taps:** the button **See the answer** → D20 → D21 frame. Switches toggle a row (light tap haptic). An amount field opens the number pad.
**Accessibility:** each switch is labelled with the line name. Each amount field reads "Insurance, amount, $140 a month".

---

## Answers

### D20 Answer screen (screen; routes to the N boards)
**Reached from:** Check it (small buy), the stepper, open checks.
**Purpose:** the answer, from the board that matches the result. All N boards share the same top: back chevron, item glyph and name with price, a "New check" link, the Cash | Installments segment, and the Today / Nov 15 / date chips, so pay and date change in place without going back.

| Engine result (v3 code and 05.4 answer names) | Board | Example |
|---|---|---|
| fits_month / fits_unspent, clean | **N02 Fits** (N02L at large text) | Headphones $180, Dec 15: $231 left in December |
| fits, payment over 80% of room or under a floor | **N04 Fits, but tight** | Laptop $3,500, Jan 15 |
| under a rule the user set | **N15 Fits, but tight each month: under your rule** | Laptop, installments |
| fits from savings above the net | **N25 Fits from extra savings** | Laptop, Nov 1 |
| not_yet, safety net locked | **N05 Not yet: safety net locked** | Laptop, today |
| emergency_use, net unlocked | **N06 Dips into your safety net** | Laptop, today |
| net unlocked from Not yet, protection off | **N13 Uses your safety net** | Laptop, today |
| not_yet | **N08 Not yet** | Used car, cash |
| monthly_short | **N09 Short each month** | Used car, 24-month plan |
| month already short before buying | **N26 No: your month is already short** | Phone, 12-month plan |
| plan where cash is not possible | **N10 Only by borrowing** | Used car, old car sold |
| user said yes to cover | **N11 Only on your answer** | Used car, cash |
| below $0, within the overdraft limit | **N12 Uses your overdraft** | Laptop $4,400 |
| missing borrowed figures | **N21 Missing figures named** | Laptop |
| offline / error / not ready | **N22 / N23 / N24** | — |

Secondary screens from any answer: N03 Make it surer (sheet), N14 Your month after buying, N16 Cash and installments side by side, N17 Costs that stop when you buy, N18 Save for it in Grow → N18S Goal made, N19 I bought it → N19S Added to records, N20 Your decisions (D47).
**Added to every answer:** a More detail row **"Running costs · none counted · Add"** (small buys) or **"Running costs · $323 a month · Change"** (big buys). It opens D13.
**Taps:** Back → D13 if the user came through the stepper, otherwise D01. New check → D01, cleared. "Buy later" / "Cheaper one" / "Installments" chips → C14 / C15 / C16 option views, with "Use Nov 15" etc. writing the change back. I bought it → N19. Save for it → N18. I'm not buying it → toast "Marked as not buying." with Undo, and the check moves to D47 "Not bought".
**Motion:** the verdict card rises 0.24 s once; no count-up. Haptics: none for Fits; the warning haptic for N15 (under a rule you set) only.

### D21 Answer after the stepper (screen additions to D20)
**Reached from:** D13 See the answer, or See the answer now on D11 or D12.
**Purpose:** show what the answer rests on, and let the user reopen a step.
**Adds, directly under the verdict card:** card **"What you told Decide"**, 3 rows of 52 px, each with a chevron:
- Kind · Car
- Price and how you pay · $10,020 up front, cash
- Running costs · $323 a month · **pre-filled, not checked** (slate "not yet" badge #3E5C6B on #E6ECEF, only when the step was skipped)

When steps were skipped: the line "Running costs use Decide's quick estimates for a car. Check them to make this answer surer." The "2 ways to make this surer" link also counts this.
**Taps:** each row → that step (D11 / D12 / D13) with the frame's Back returning to D21. "Edit steps" in the top bar → D12.
**Accessibility:** the badge reads "pre-filled, not checked" in words, never by colour alone.

---

## Decide setup (new Decide users)

**What setup collects, mapped to the engine.** Six items, in any order:

| # | Item | Engine input | Lives in |
|---|---|---|---|
| 1 | Pay and payday | `IncomeProfile` (types, steady amount, pattern steady / variable / seasonal, counting method when variable); the pay series (cadence, anchor date, amount, confirmed) | Activity |
| 2 | Regular bills | confirmed series with role bill / debt_payment / saving / investing; dismissed keys | Activity |
| 3 | Debts | `V3Debt` (kind, balance, minimum, APR, due day) | Grow |
| 4 | Safety net | `EmergencyFund` (amount, account), protection on/off and size (05.4 D-33) | Grow |
| 5 | Your money rules | `Limits.lines` (up to 3 built-in, up to 5 own) | Decide |
| 6 | Records | readiness: last month fully recorded, this month up to date (newest entry within 10 days), every account says what it is for (`AccountUse`), every goal says which account holds it | Activity and Accounts |

**Done rules.** An item is ticked when its engine input is present and confirmed, wherever it was set (Grow, Activity or here). That is the real head start. For AM today: 1, 2, 4 and 5 are done. 3 is open: the Visa card has no due day. 6 is open: the newest entry is Oct 21, 15 days ago. **4 of 6 done.** Item 6 does not wait for 3 months: the "2 of 3 months" progress stays on the Your month card and never holds the banner open.

### D30 Decide setup banner (component on D01)
**Reached from:** D01, below the header and above the check card.
**Purpose:** keep setup in view until it is complete, and show how far along it is.
**States:**
1. **Not started (0 of 6), first visit.** A card, 16 px padding. 48 px tile with the `check` icon. Title "Set up Decide". Subline: "6 short steps, about 4 minutes. Until then, answers use quick estimates." Then a 6-segment bar, all rule colour. Buttons: **Start setup** (primary) and the text link "Check a price first". The link only scrolls to the check card; the banner stays.
2. **Started (1 to 5 done).** A 64 px row, two lines. 36 px tile; "Decide setup · 4 of 6 done", then "Next: Debts · about 1 minute". A 6-segment bar under the text (4 filled); chevron. No close button.
3. **Complete.** On the first D01 visit after completion, the row becomes "Setup done. Answers use your records." with the link "See what Decide uses". It is shown once, then removed. After that, setup lives in You > Decide > Decide setup.

**Taps:** card, row or Start setup → D31 (Start setup opens the first open item directly). See what Decide uses → D31 (read-only review).
**Rules:** it never shows on other tabs and never sends a push. It is never red. The colour cue is the bar plus the words "4 of 6 done".
**Motion:** on returning from a step, the newly filled segment fills 0.55 s once. Reduce Motion: no fill animation.
**Accessibility:** the row reads "Decide setup, 4 of 6 done. Next: Debts. Button." The bar is a progressbar with value 4 of 6.

### D31 Decide setup checklist (screen)
**Reached from:** D30; You > Decide > Decide setup; the N24 Not ready card's link "Finish setup".
**Purpose:** see all six items, done and open, and start any one.
**Layout:**
1. Back chevron. Title "Decide setup". Subline "Answers rest on these. Do them in any order. Each one saves as you go."
2. Progress: "4 of 6 done", a 6-segment bar.
3. A list card of 6 rows, 64 px each: icon tile, name, status line, and on the right either "Done" with a tick (green tint badge with a word) or a chevron.
   - Pay and payday · "Done · $3,200 on the 15th"
   - Regular bills · "Done · 7 bills, $1,850 a month"
   - Debts · **"1 to finish · Visa card has no due day"**
   - Safety net · "Done · $1,300, set in Grow"
   - Your money rules · "Done · 3 rules"
   - Records · **"Up to Oct 21 · add what you spent since"**
4. Note: "Nothing here moves money. You can change any of it later."
5. Button **Continue: Debts** (the next open item).

**Taps:** each row → D32 to D37 (done rows open in review mode with "Change"). Continue → the next open item. Back → D01.
**States:** all done: the title becomes "Setup done" and the button reads "Back to Decide" → D01.

### D32 Setup: Pay and payday (screen, stepper frame)
**Reached from:** D31.
**Frame:** back chevron; "Pay and payday" in place of "Step x of y" (items are not in order); a "Save and close" link at top right (→ D31, keeps entries).
**Why we ask:** "Your payday sets where each month starts in an answer."
**Content:** what Activity found: "Take-home pay $3,200 · 15th of each month · from Everyday account (checking)", with **That's right** / **Change**. Then the question "Does your pay change from month to month?" with a radio: **About the same** / **It changes** / **It changes with the seasons**. If it changes: "How should Decide count it?" with four choices and no default: Match what comes in · Spread large payments over the months they cover · Pay myself a steady amount · Go by my bank balance. Then "Other money coming in?": a row "+ Add other income" (side work, rent, interest), and for each, "I spend it" / "It's kept".
**Button:** **Save** → D31 with the item ticked. The light tap haptic plays on save, and the banner fills one segment.
**Empty state:** no pay found: amount and payday fields ("How much lands in your account?", "Which day?").

### D33 Setup: Regular bills (screen)
**Why we ask:** "Regular payments are counted before anything is spare."
**Content:** "These look like your regular payments." Rows, 64 px: Rent $1,200 · 1st; Power and water $130 · 1st; Phone $45 · 1st; Internet $75 · 1st; Card minimum $150 · 3rd; Car insurance $95 · 5th; Car loan $155 · 12th (prototype numbers from C22; AM's own list is 7 bills, $1,850 a month). Each row has three chips: **Regular** / **Not regular** / **Change**. Total "Total each month $1,850". Then "+ Add a bill it missed".
**Button:** **These are right** → D31. Only rows marked Regular count. "Not regular" stores a dismissal with Undo.
**Change** → the Activity bill edit sheet (amount, day, how often).

### D34 Setup: Debts (screen)
**Why we ask:** "Debt payments come out before anything is spare, and their due days set when."
**Content:** "From Grow". Visa card · $3,000 at 22.9% · $150 minimum · **Due day: not set**, with a day picker field "Due day of the month". "+ Add a debt" opens the Grow debt sheet. A "No other debts" choice.
**Button:** **Save** → D31. Nothing here is saved twice: the due day is written to the Visa card in Grow.
**Note:** "Stored in Grow. Changing it there changes it here."

### D35 Setup: Safety net (screen)
**Why we ask:** "Decide keeps your safety net out of what counts as spendable."
**Content:** "$1,300 in it now · Goal $2,300, set in Grow" with a navy bar (safety net colour). "Which account holds it?": Everyday account (checking) · Savings account. A switch "Safety net locked: answers never spend it" (on). The size line: "The starter size is about 1 month of essential costs: $2,300. Any size works, even a small one." with "Change the size in Grow".
**Button:** **Save**. No net yet: "Set an amount" field with "Not set yet" as a choice. That choice ticks the item and says answers hold nothing back (05.4 D-25: no answer then says "untouched").

### D36 Setup: Your money rules (screen)
**Why we ask:** "Every answer checks these, and says so when a purchase would go against one."
**Content:** switch rows, each with a value chip that opens D49:
- Debt payments at most · 36% of pay (on)
- Keep at least · $___ left each month (off; this is the floor behind N15)
- Largest single purchase · $___ (off)
- "+ Add your own rule" → D50 (up to 5)

A note row: "Saving at least $150 and Investing at least $200 are your regular saving and investing. Change them in Grow." This is shown because those two are regular saving series, not engine rules.
**Button:** **Save**. Saving with all rules off still ticks the item, with the line "No rules. Answers still keep your safety net."

### D37 Setup: Records (screen)
**Why we ask:** "Answers come from your real months. Decide needs last month complete and this month up to date."
**Content:** three checks, each a row with a word status:
- Last month (October) · **Complete**
- This month · **Up to Oct 21** · "Add what you spent since then" → Activity quick add (N rows, prototype toast)
- Your accounts · "4 accounts say what they are for" · Complete. When open: per account "Everyday spending / Savings or goals / Safety net / Not used for spending" (AccountUse).

Then: "Have more months on a bank statement?" → "Import a statement" (Accounts and import). "2 of 3 months so far. A third month, on Nov 21, makes every answer surer."
**Button:** **Done**, active when all three are complete. Otherwise "Save and close". The checklist row stays open and names what is left.
**Brand-new user variant:** "No records yet" with **Import a statement**, "Add this month as you go" and **Answer from quick estimates for now** → D39.

### D38 Setup done (screen)
**Reached from:** saving the last open item.
**Layout:** title "Done". Subline "Decide now uses your records." List card: "Savings goals and your safety net live in Grow" · "Loans live in Grow" · "Shared costs live in Household" (from C22). Button **Back to Decide** → D01 (banner in state 3).
**Motion:** this is one of the few Lottie moments allowed: a single check stroke, plays once, 0.8 s, skipped with Reduce Motion. Haptic: a light tap (success is reserved for goals).

### D39 Quick estimates: a first answer (screen)
**Reached from:** N24 "Answer from quick estimates"; D37 brand-new variant; D30 state 1 for a user with no records.
**Purpose:** answer now, before records exist ("ask, don't block").
**Layout:** title "A first answer from three estimates". Subline "Before your records are ready. Round numbers are fine." Fields: "About how much comes in each month?" $3,200 · "About how much goes on bills?" $1,850 · "About how much on everyday spending?" $925. A live line (polite): "A usual month leaves about $425 by these estimates." Button **See the answer now** → D20, where every answer says "Based on your quick estimates, not your records." Footnote as in C41.
**Note for build:** the engine's typed estimates hold five figures (income, expenses, saving, debt, invest). Bills and everyday add up to expenses; saving, debt and invest are $0 unless setup items 2 or 3 found them.

---

## Decide sheets

All sheets: grab bar, title on the left, "Close" link on the right (44 px), slide up 0.24 s over a backdrop. Drag down or tap the backdrop to close. Values typed in a sheet are applied only by its primary button. Focus is trapped while open and returns to the opener on close.

### D40 Pick a date (sheet)
**Reached from:** "Pick a date" on D01; the date chip on D20.
**Layout:** month header "November 2026" with prev/next arrows (Nov 2026 to May 2027; earlier months dimmed). A 7-column calendar of 44 px cells; past days greyed and not tappable; today ringed; paydays (15th) marked with a dot. The legend "Paydays are marked with a dot." A preview line (polite live region): "If you buy on Dec 15 (cash): fits, $231 left that month." A quick choice **When it's saved up**: "Spare money covers it by Jan 15, without your safety net." Primary button **Use Dec 15** (or "Use this date", dimmed until a day is picked).
**Taps:** Use → closes, sets "When?" to the date, and the chip reads "Dec 15". When it's saved up → sets the "When saved" date.
**Accessibility:** each cell reads "December 15, payday".

### D41 Quick estimate: add (sheet, 4 variants)
**Reached from:** the D02 tiles; editing a D02 row.
**Common layout:** title "Add an expense" / "Add a loan" / "Add savings" / "Add income". Subline "Counts in this check only. Your records do not change." Fields, then **Add to this check**. Edit mode adds "Remove", in red text.
- **Expense:** Name (for example, Laptop insurance) · Amount $12 · How often: Once / Every month / Every 3 months / Every year · Starts: When I buy / Pick a date.
- **Loan** (money you will owe that the records do not know yet): Name · Monthly payment $ · Payments left · First payment date. Note: "To add a loan for good, add it in Grow."
- **Savings** (money set aside that the records do not show): Name · Amount $ · "Can answers use it?" Yes / No.
- **Income** (money expected that the records do not show): Name · Amount $ · Once or Every month · Arrives on (date). Note: "Answers count it only from the date it arrives."

**After adding:** a row on D02 (for example, "Laptop insurance · Expense · every month · $12") and the toast "Added: Laptop insurance." with Undo.
**Errors:** "Add a name." "Enter an amount above $0."

### D42 How you pay: installments plan (sheet)
**Reached from:** Installments on D02 or D12; the plan row "Change"; N09 / N16.
**Layout:** title "Installment plan". Subline "Type the figures from your quote. Example figures are marked."
- Plan name (Car loan)
- Amount borrowed: $9,020 (read-only, "price, tax and fees, less the cash down")
- Cash down $1,000
- Length: chips 12 / 24 / 36 / 48 months / Other (Other opens a field, "Number of months (1 to 120)")
- How often: A month / Every 2 weeks / A week
- Rate, % a year: 7.9, with the line "This is an example rate. Type the rate from your own quote."
- Fees: Set-up $0 · Each payment $0 · At the end $0
- First payment: **Next payday after buying (Nov 15)** / **One payday later (Dec 15)** / Pick a date (deferred; then "Is interest charged during the pause?" Yes / No / Not sure)
- "Payment on your quote (optional)" $ (when typed and higher, the answer uses the higher one)
- Result card: "$408 a month for 24 months · $772 in interest · first payment Nov 15 · last Oct 2028"
- Primary **Use this plan**. Footnote: "FincWin does not lend money or arrange credit."

**Mortgage variant (home):** length in years (1 to 40), down payment %, no trade-in.
**High-cost note:** when the rate is 20% or more, or the interest is 10% or more of the amount borrowed, a plain note shows: "This plan is 24% a year: $1,980 in interest. Paying cash costs no interest." (05.4 D-07).

### D43 How often a cost comes (sheet)
**Reached from:** a how-often chip on D13.
**Layout:** title = the line name ("Maintenance"). Radio: **Every month** / **Every 3 months** / **Every year**. Starts: **When I buy** / **1 month later** / **3 months later**. Optional "Ends" date. Line: "$600 every year is about $50 a month, from the day you buy." **Use this**.
**Note:** only monthly, 3-monthly and yearly are offered, to match the engine's `everyMonths: 1 | 3 | 12` (05.4-26). A weekly cost is typed as its monthly amount, with the helper "A weekly cost? Multiply by 52, then divide by 12."

### D44 Add your own (sheet, 4 variants)
**Reached from:** "+ Add a running cost" / "+ Add a cost that stops" / "+ Add a one-off cost" on D12 and D13; "Add your own" on D11.
**Layout:** title "Add a running cost" / "Add a cost that stops" / "Add a one-off cost" / "Add your own kind". Hint line: "For example, a parking permit." / "For example, a bus pass you no longer need." / "For example, delivery or setting it up." / "For example, a bike or a boat. Decide fills in costs like the kind it counts like." Fields: Name; Amount $ (not for kind); How often (running and stop variants: Every month / Every 3 months / Every year); for kind, "Counts like": Everyday / Tech / Car / Home. Primary **Add** (dimmed until there is a name and an amount). Toast "Added: Parking permit." with Undo. Up to 3 own lines per kind (engine own questions cap).

### D45 Selling the one you have now (sheet)
**Reached from:** "Selling a car you have now" on D13; N10 / N17.
**Layout:** title "Selling your car". Switch "I'm selling one I have now" (on). "Sale price" $4,000 · "Still owed on it" $0 (when Grow has a car loan: "In Grow: Car loan, current car · $1,700 left. Selling pays it off and its payment stops.") · "When does the money come in?": **The same day** / **About a month later**. Waterfall: Sale price $4,000 · Pays off its loan $0 · **Toward this purchase $4,000**. **Use this**.
**Note:** a sale a month later is never counted up front: "It comes in a month later and is not counted on the day you buy."

### D46 Open check (sheet)
**Reached from:** an Open checks row on D01.
**Layout:** title = item ("Laptop"). Line "$3,500 · Jan 15 · Tight · leaves $320 · checked Oct 22". A note when records changed since: "Your records changed since this check. Open it to see today's answer." Action rows, 52 px: **See today's answer** · **Edit the check** · **Save for it in Grow** · **Mark as not buying** · **Delete**, in red text.
- Draft variant (Studio camera body): line "$4,200 · how to pay not chosen"; first action **Choose how to pay** → D42.

**Taps:** See today's answer → D20 (re-run with today's records). Edit → D12 (stepper) for big buys, or D01 filled for small ones. Save for it → N18. Not buying → toast with Undo. Delete → removes it, toast "Deleted: Laptop." with Undo (C53).

### D47 Past decisions (screen)
**Reached from:** the "Past decisions" pill on D01; N20.
**Layout:** board **N20 Your decisions**. Title "Your decisions". Subline "A look back at what you bought. Just for you: not a score." A Look back card: "Headphones · bought Dec 15. Did it cost what you expected?" Expected $194 · Your records show $201 · Difference $7 more. "The extra $7 was a case bought the same day. Was that part of it?" **Yes, count it** / **No**. Then a list: Used car · Bought Nov 15 · look back in February; Laptop · Not bought · saved as a plan; Concert tickets · Not buying · Oct 2. Note: "After 3 look-backs, Decide shows how close its estimates usually are."
**Taps:** a row → D48. Yes / No → saves; toast "Saved to your decisions." with Undo; the card becomes "Saved".
**Empty state:** "No decisions yet. When you mark a check as bought or not buying, it shows here."

### D48 Past decision detail (screen)
**Reached from:** a D47 row.
**Layout:** title "Used car". Lines: "Checked Nov 5 · Not yet with cash; Short each month on a 24-month plan" · "Bought Nov 15 · cash $10,020". A card "What Decide counted": Up front $10,020 · Running costs $323 a month. A card "What your records show so far": Up front $10,180 (Nov 15) · Running costs: "look back in February, after 3 months". Actions: **See the check as it was** (read-only D20 with the banner "As checked on Nov 5") · **Remove from decisions** (red text, Undo).
**Accessibility:** the comparison table is read as label-value pairs.

### D49 Edit a money rule (sheet, per rule)
**Reached from:** a rule row on D01 (not Safety net); value chips on D36.
**Variants:**
- **Debt payments at most:** "Share of pay, all debts counted". Stepper field 36 % (− / +, step 1, range 5 to 60). Line: "Today your debt payments are 5% of pay ($150 of $3,200)."
- **Investing at least / Saving at least:** "These are regular amounts in Grow." The amount is shown read-only, with **Open in Grow**.
- **Keep at least … left each month:** amount field $300. Line: "A usual month leaves $425 today."

Common: a switch "Answers check this rule" · primary **Save** · "Remove this rule" for own rules. A Save that would make a current open check go against the rule adds: "This changes 1 open check: Laptop now goes against it." No haptic except the warning when that happens.

### D50 Add your own rule (sheet)
**Reached from:** "+ Add your own rule" on D36 and D01.
**Layout:** title "Add a rule". Radio list: Spending in one category at most $ a month (category picker) · One category at most % of pay · Largest single purchase $ · Keep at least $ left each month. Value field. **Add rule**. "Up to 5 of your own rules."

### D51 Safety net settings (screen)
**Reached from:** the Safety net rule on D01; N05 / N06; D35.
**Layout:** board **N07** (locked) / **N07U** (unlocked). Navy 48 px lock tile; "Safety net · Money kept for emergencies. Set in Grow." Card: "$1,300 in it now", bar, legend "$1,300 in it · Goal: $2,300, set in Grow". Card: switch "Safety net locked · Answers never spend it. Answers that would need it say Not yet." Card "Before you unlock it": "Answers will be allowed to use your safety net. Every answer that uses it says so at the top, with how much it uses and what stays in it. You can lock it again at any time." Button **Unlock for answers**. Link "Change the size in Grow".
**Taps:** Unlock → D52. When unlocked, the switch on → locks it at once: toast "Safety net locked." and the padlock closes (0.22 s; Reduce Motion: no motion).

### D52 Unlock the safety net? (dialog)
**Reached from:** Unlock on D51; the switch off on D51.
**Layout:** title "Let answers use your safety net?" Body: "Answers can then use up to $1,300 of it. Each one says how much it uses." Buttons: **Unlock** / **Keep it locked**.
**After Unlock:** D51 in the unlocked state (N07U), toast "Safety net unlocked for answers." with Undo. Haptic: warning (it lowers a protection).

### D53 Something changed? (sheet)
**Reached from:** the Something changed? row on D01; the D02 link.
**Layout:** C19 pattern. Title "Something changed?". Subline "Tell Decide about a change. It stays in your records until you change it back." Three rows: **My pay changed** (new amount, from date) · **A bill stopped or paused** (pick a bill: Rent $1,200, Power and water $130, Phone $45, Internet $75) · **A one-off cost is coming** (amount, date). Each shows a result line, such as "Pausing Phone ($45): a usual month would leave $470." Primary **Save change**. After saving, D01 shows a chip "Changed: Phone $45 paused · Reset", and the toast "Phone paused. Answers use it from Dec 1." with Undo. User-led: Decide suggests nothing here and applies nothing on its own.

---

## Open questions for the owner

1. **Big-buy threshold.** The rule uses the engine's band-6 edge (about $5,000) as "large" when there are no running costs and no plan. Is $5,000 right, or should any purchase over $1,000 (where the engine starts asking for more, band 5) get the stepper?
2. **Setup banner: can it ever be snoozed?** As specified, it has no close button and stays until all 6 items are done (one-line row once started). Is that right, or should "Not now, remind me in a week" exist for people who only want quick answers?
3. **When does "Records" count as done?** The spec ticks it when last month is complete and this month is up to date, not at 3 months. That stops the banner from staying for weeks; the 3-month progress stays on the Your month card. Agree?
4. **Purpose and "is this an emergency?"** The engine still has these questions (L1p and L1e, asked from about $100 and $500), and only necessity or for-work purposes may use the emergency fund. Variant C dropped them in favour of the safety-net lock. Should the stepper ask them, or should the engine treat lock/unlock as the only rule?
5. **Example records date.** With records up to Oct 21 on Nov 5, the engine's readiness rule (newest entry within 10 days) would hold back verdicts. The prototype shows answers anyway and makes Records the open setup item. Should the example data move to Oct 28, or keep this and show it?
6. **"+ Investment" on Open checks.** The v3 engine returns "missing" for an investment check (`legacy_invest_check`). Keep the link (and which screen does it open?), or remove it until investment checks have a design?

---

**Footnote, engine fit checked on origin/main d36418a2:** running-cost lines, closing %, purchase date, costs that stop and the sale are planned in 05.4-26 and 05.4-27, not yet built. Today's `CheckV2` has no purchase date at all, so the When choice is a planned input.
