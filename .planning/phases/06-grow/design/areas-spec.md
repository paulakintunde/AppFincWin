# Grow screens spec (from the clickable prototype, 2026-11-06)

The prototype renumbered these ids: spec G02 goal detail = G03, G03 new goal = G04, G04 safety net = G05, G05 debts = G07, G06 debt detail = G08, G07 add a debt = G09, G08 investing = G10, G09 holding = G11, G10 lines = G12. Owner decisions in 06-CONTEXT.md win where they differ (for example locked goals, D-05).

## Shared conventions used below

- **Header:** back chevron (44 × 44 target, label "Back" for screen readers) at left, title in Archivo Black 22, optional action at right. Tab screens have no back chevron.
- **Rows:** 52 px one line, 64 px two lines; row tile 36 px with a 20 px icon in our two-layer style; chevron at right means it pushes a screen.
- **Badges:** colour + shape + word together (for example amber tint with `sHalf` and "Near cap"). State colours only in badges and amounts.
- **Sheets** slide up in 0.24 s with a grab handle, close on drag down, on the backdrop, or with "Close" (top right). With Reduce Motion on, sheets and screens cross-fade in 0.15 s and bars appear filled.
- **Buttons:** primary is ink #14150F on paper, 52 px tall, full width; secondary is an outline pill; text buttons are at least 44 px tall.
- **Money:** amounts in tabular figures; out-of-pocket amounts are ink, never red.
- **Haptics:** light tap on save; warning only for a cap crossed; success only for a goal reached; none on tab change or navigation.
- **Large text:** every row grows to two lines before truncating; amounts never truncate, the label wraps instead. All screens scroll.

---

# Area 2: Grow (G)

Grow holds what money is growing toward and what it is paying down: goals (with the safety net), debts, and investing. It is where Decide's safety net and lines live as records, so a change here changes Decide's next answer. Example figures: safety net $1,300 of $2,300; Trip to Lisbon $640 of $1,800; one auto loan $8,420; two holdings worth $7,690.

The FAB on Grow reads "New goal", "Add a debt" or "Add a holding" to match the segment.

### G01 Grow
(kind: screen, tab)
- **Reached from:** tab bar "Grow"; Decide "Your money rules" footnote "Change any of them in Activity or Grow".
- **Purpose:** one calm view of goals, debts and investing, with the safety net always first.
- **Layout, top to bottom:**
  - Date line "THURSDAY, NOV 5". Title "Grow". Avatar "AM" at right (opens You).
  - Segmented control, 44 px: "Goals" (selected) · "Debts" · "Investing". Segments for features that are off are not shown.
  - **Goals segment:**
    - Hero card: label "Saved across 3 goals"; figure "$1,940"; note "$150 a month goes into goals. Your rule is at least $150."
    - Safety net card (navy tint #E4ECF6 border, 64 px tile `lock`): "Safety net" with navy badge `lock` "Locked"; "$1,300 of $2,300"; bar 57% in navy; line "No Decide answer spends it. $100 a month reaches $2,300 by Aug 2027." Chevron.
    - Section "Goals". Rows 64 px with 36 px tile and a thin bar under the text:
      - `calendar` "Trip to Lisbon" / "$640 of $1,800 · $50 a month · Oct 2028"; bar 36%.
      - `laptop` "Laptop" / "$0 of $3,500 · no monthly amount yet"; plum badge `sHalf` "Linked to a check"; bar empty.
    - Text button row: "+ New goal".
  - **Debts segment:** see G05.
  - **Investing segment:** see G08.
  - Footer note, muted 13: "Goals, debts and holdings are your own records. FincWin holds no money and moves none."
- **Taps:** Safety net card → G04. A goal row → G02. "+ New goal" / FAB → G03. Segment → that segment in place (no navigation, no haptic). Avatar → You.
- **States:**
  - Level Basics (goals, debt and investing off): only the Safety net card shows, then a card "Goals, debt and investing are off at this level. Turn on whichever you actually have and this tab fills in." with button "Choose what to track" → O10.
  - No goals yet (feature on): under the Safety net card, empty card with `savings` tile: "Name something to save for" / "A goal with a name gets funded about twice as often as “savings”." Button "New goal" → G03.
  - Loading: grey bars in card shapes, no shimmer loop.
- **Motion:** bars fill in 0.55 s on first view only.
- **Accessibility:** each goal row reads "Trip to Lisbon, 640 of 1,800 dollars, 36 percent, 50 dollars a month, reaches target October 2028".

### G02 Goal detail
(kind: screen)
- **Reached from:** G01 goal row; Decide spec "Save for it" answer ("See the goal"); Home "Savings goals" row.
- **Purpose:** progress, the plan, and the money moves into and out of one goal.
- **Layout (example: Trip to Lisbon):**
  - Header: back, title "Trip to Lisbon", action "Edit".
  - Figure "$640" with "of $1,800" muted; bar 36%.
  - Plan card: two rows that move together:
    - "Each month · $50" with chevron
    - "Reaches $1,800 · Oct 2028" with chevron
    - Under them: "Change one and the other follows."
  - Line card: "Kept in · Savings account". "Automatic · $50 on the 15th, recorded for you to confirm".
  - Buttons side by side: "Add money" and "Take some out".
  - Section "History": rows 52 px "Nov 15 · $50 · Expected" (slate badge "Expected"), "Oct 15 · $50", "Sep 15 · $50", "Sep 2 · $490 · Starting amount".
  - For a linked goal (Laptop): card with `checkbuy` tile "From a Decide check" / "Laptop $3,500 · Tight on Jan 15 · leaves $320" with chevron.
  - Bottom text button "Remove goal".
- **Taps:** "Each month" row → number sheet "Each month" with "$50" field; the preview line under it updates the date ("Reaches $1,800 by Oct 2028"); "Save". "Reaches" row → month picker sheet; preview shows "$49 a month"; "Save". "Add money" / "Take some out" → G02a. "Edit" → G03 in edit mode. A history row → Activity spec: transaction detail. Linked check card → Decide spec: open check "Laptop". "Remove goal" → dialog "Remove Trip to Lisbon? The $640 stays in Savings account. Only the goal goes." "Remove" / "Cancel" → G01 with toast "Goal removed" + "Undo".
- **Accessibility:** the plan rows are a group "Plan"; changes announce "Reaches October 2028".

#### G02a Add money / Take some out
(kind: sheet)
- **Reached from:** G02 buttons; G04 "Add money".
- **Layout:** title "Add to Trip to Lisbon" (or "Take from Trip to Lisbon"); amount field "$" with number pad; "From" row "Everyday checking" (or "To"); date chips "Today" / "Pick a date"; note "This records a move between your own accounts. It is not spending." Primary "Add $50" (label follows the amount).
- **Taps:** primary → light haptic, saves, closes → G02 with the bar moving to the new value (0.55 s). Account row → account picker sheet (list of C01 accounts).
- **States:** if the move reaches the target: the sheet closes and G02 shows the reached state: green badge `sCheck` "Reached", Lottie tick once, success haptic, toast "Trip to Lisbon reached $1,800." with "Undo". Take some out from the Safety net: note "This lowers what is locked. Decide’s next answers use $1,200."

### G03 New goal
(kind: sheet, three short steps)
- **Reached from:** G01 "+ New goal" and FAB; G02 "Edit" (fields pre-filled, one page); Decide spec "Save for it" (name and target pre-filled, flagged "Linked to a check").
- **Purpose:** make a goal in under 30 seconds.
- **Layout:**
  - Step bar "1 of 3" and Back (from step 2).
  - Step 1 "What are you saving for?": field "Name" (placeholder "Trip to Lisbon"); suggestion chips "Holiday", "New phone", "Car", "Home deposit", "Wedding"; icon picker row with 8 tiles from our set (`calendar`, `laptop`, `phone`, `camera`, `savings`, `housing`, `transport`, `headphones`). "Continue".
  - Step 2 "How much?": field "Target" "$1,800"; switch "No set target — save as you go" (hides the field); field "Already saved" "$0". "Continue".
  - Step 3 "How will it fill?": two linked fields "Each month" "$50" and "By" "Oct 2028" (edit one, the other follows); row "Kept in · Savings account"; switch "Record it each month for me to confirm" (on); if household is on: switch "Share with household" with sub "Split between you and JT; each sees the whole goal". Line at the bottom: "Your goals now total $200 a month. Your rule is at least $150." Primary "Make goal".
- **Taps:** "Make goal" → light haptic, closes → G02 for the new goal, toast "Goal made". "Close" mid-way → dialog "Discard this goal?" "Discard" / "Keep going".
- **Accessibility:** the two linked fields announce the other's new value after a change.

### G04 Safety net
(kind: screen)
- **Reached from:** G01 Safety net card; Decide spec "Your money rules" Safety net row; Decide spec "Not yet (safety net locked)" answer link "See the safety net".
- **Purpose:** show what the safety net is, how big it is, and that Decide will not spend it.
- **Layout:**
  - Header: back, title "Safety net".
  - Navy badge `lock` "Locked". Figure "$1,300" with "of $2,300".
  - Bar 57%, navy.
  - Explainer card (navy tint): "Money kept for the unexpected: a job gap, a repair, a bill you didn’t see coming. Every Decide answer leaves it alone. A purchase that would need it gets “Not yet” or “Dips into the safety net”."
  - Rows: "Size · $2,300" chevron; "Each month · $100 · reaches it by Aug 2027" chevron; "Kept in · Savings account".
  - Card "What it covers": "$1,300 covers about 2 weeks of a usual month going out ($2,775). The full $2,300 covers about 3½ weeks."
  - Buttons: "Add money" and "Take some out".
  - Section "History" (same rows as G02).
  - Footer: "This is your own record of money set aside. FincWin is a planning tool, not a bank."
- **Taps:** "Size" → G04a. "Each month" → number sheet as in G02. "Add money" / "Take some out" → G02a. History row → Activity spec: transaction detail.
- **States:** no safety net yet: figure "$0", card "Decide keeps a safety net out of every answer. Set its size to start." Button "Set a size" → G04a.
- **Accessibility:** the locked badge reads "Locked, no Decide answer spends it".

#### G04a Change the safety net
(kind: sheet)
- **Reached from:** G04 "Size"; G10 Safety net row.
- **Layout:** title "Safety net size"; choice rows (radio, 64 px): "$2,300 · what you set" (selected), "1 month of going out · $2,775", "3 months of going out · $8,325", "Your own amount" (opens a field). Preview card: "Decide re-checks your open checks with the new size." Rows: "Headphones $180 · Fits → Fits", "Laptop $3,500 · Tight → Tight" (the badge after the arrow updates live). Primary "Save size". 
- **Taps:** "Save size" → light haptic, closes → G04 with new figure, toast "Safety net set to $2,775. Decide’s next answers use it." with "Undo".
- **Accessibility:** preview rows announce changes ("Laptop, now Not yet").

### G05 Debts and payoff
(kind: screen state of G01, segment "Debts")
- **Reached from:** G01 segment "Debts"; Decide "Lines" Debt row link "See debts".
- **Purpose:** what is owed, when it ends, and what paying more would change.
- **Layout:**
  - Hero card: label "Total debt"; figure "$8,420"; note "Paid off by Apr 2029 on the minimum."
  - Line card (amber stays off; plain): "Debt payments · 10% of pay. Your rule is at most 36%." with a thin bar at 10 and a tick mark at 36.
  - Section "Debts". Row 64 px: `debt` "Auto loan" / "6.9% · $312 a month · due the 15th"; amount "$8,420".
  - Section "Cards paid in full": `card` "Visa card" / "Cleared each month, so not in the plan"; amount "$380".
  - Payoff plan card:
    - Title "Payoff plan".
    - Order control (two segments): "Highest rate first" · "Smallest first". With one debt both are disabled and the card says "With one debt, both orders are the same."
    - Extra each month: "−" button, "$50", "+" button (steps of $25, 44 px buttons).
    - Three scenario rows, 64 px: "Minimum only · Apr 2029 · about $760 interest"; "$50 extra a month · Dec 2028 · about $640 interest · 4 months sooner" (selected, ink border); "$1,000 once, today · Dec 2028 · about $580 interest".
    - Note: "Extra money for debt comes out of what is left each month ($425). Decide counts it."
    - Button "Use $50 extra" (records the plan; does not move money).
  - "+ Add a debt".
- **Taps:** debt row → G06. Card row → C02 for Visa card. "−"/"+" → updates rows in place, no haptic. Scenario row → selects it. "Use $50 extra" → light haptic, toast "Plan saved. A $50 extra payment is expected each month." with "Undo"; the extra shows as an expected line in Activity. "+ Add a debt" / FAB → G07.
- **States:** no debts: card with `sCheck` "No debts recorded" / "If you owe anything with a balance, add it and Decide counts it." Button "Add a debt".
- **Accessibility:** the stepper reads "Extra each month, 50 dollars, adjustable"; scenario rows are radio buttons.

### G06 Debt detail
(kind: screen)
- **Reached from:** G05 debt row; Activity spec transaction detail of a loan payment ("See the loan").
- **Layout (Auto loan):**
  - Header: back, "Auto loan", action "Edit".
  - Figure "$8,420 owed". Line "Started at $14,500 · 42% paid".
  - Bar 42% (ink).
  - Rows: "Rate · 6.9% a year", "Payment · $312 on the 15th · Automatic", "Paid from · Everyday checking", "Ends · Apr 2029 on this payment", "Interest still to pay · about $760".
  - Card "If you pay more": "+$50 a month ends it in Dec 2028 and saves about $120." Text button "Change in the payoff plan".
  - Section "Payments": "Nov 15 · $312 · Expected", "Oct 15 · $312", "Sep 15 · $312".
  - Text buttons: "I sold what this paid for" and "Remove debt".
- **Taps:** "Edit" → G07 in edit mode. "Change in the payoff plan" → G05. Payment row → Activity spec: transaction detail. "I sold what this paid for" → sheet "Close the loan from a sale": fields "Sold for $" and "Date"; preview "The $8,420 is paid off and $X is left over" or "$X is still owed"; primary "Record the sale" (one save closes the debt, per ROADMAP Phase 6). "Remove debt" → dialog "Remove Auto loan? Past payments stay in Activity. Decide stops counting this debt." "Remove" / "Cancel".

### G07 Add a debt
(kind: sheet)
- **Reached from:** G05 "+ Add a debt", FAB; O08 answer "A loan" (Home card "Add the loan you mentioned").
- **Layout:** title "Add a debt"; type chips "Loan", "Credit card", "Line of credit", "Money owed to someone"; field "Name" ("Auto loan"); field "Owed now" "$8,420"; field "Rate" "6.9 %" with helper "Yearly rate (APR). Leave blank if none."; field "Payment" "$312" with chip "Minimum"; "Due day" picker "15th"; row "Paid from · Everyday checking"; switch "Shared with household" (if on). Line: "Debt payments would be 10% of pay. Your rule is at most 36%." Primary "Add debt".
- **Taps:** "Add debt" → light haptic, closes → G06, toast "Debt added. Decide counts it from now." If the new total goes over the 36% rule: the rule becomes an amber badge `sOver` "Over your rule" and text "This brings debt payments to 39% of pay; your rule is 36%." The save still works (user-led); warning haptic.

### G08 Investing
(kind: screen state of G01, segment "Investing")
- **Reached from:** G01 segment "Investing".
- **Layout:**
  - Hero card: label "Invested"; figure "$7,690"; note "$690 above what you put in · values you typed, as of Nov 1."
  - Line card: "Investing · $200 a month. Your rule is at least $200." with `sCheck` green badge "Met".
  - Section "Holdings". Rows 64 px:
    - `pension` "Retirement fund" / "Roth IRA · $150 a month · as of Nov 1"; amount "$6,450"; under it "+$650" with `sUp` 16.
    - `invest` "Index fund" / "Taxable brokerage · $50 a month · as of Nov 1"; amount "$1,240"; "+$40" with `sUp`.
  - Card "Allocation": a single stacked bar (two segments, category swatch colours, not state colours) with legend "Retirement 84% · Taxable 16%".
  - Note: "No live prices in this version. Update a value whenever you check your statement."
  - "+ Add a holding".
- **Taps:** holding row → G09. "+ Add a holding" / FAB → sheet "Add a holding": "Name", "Account type" picker (the prototype's 15 types, e.g. "Roth IRA", "401(k)", "ISA — stocks & shares"), "Value now $", "As of" date, "Put in so far $", "Each month $" and "Day"; primary "Add holding".
- **States:** none yet: card "Investments change what net worth means. Add one if you hold any." Button "Add a holding".
- **Accessibility:** gains read "650 dollars above what you put in"; losses use "below" and `sDown`, never red.

### G09 Holding detail
(kind: screen)
- **Reached from:** G08 row.
- **Layout (Retirement fund):** header back, "Retirement fund", "Edit". Figure "$6,450" with slate badge `sClock` "As of Nov 1". Line "$650 above the $5,800 you put in · 11.2%". Small line chart of the hand-entered values (6 points, Jun–Nov, no animation loop). Rows: "Type · Roth IRA", "Each month · $150 on the 1st", "Paid from · Everyday checking". Primary "Update value". Section "Entries" (lot rows if Everything level: "Buy · Oct 1 · $150", "Dividend · Sep 30 · $18", "Value update · Nov 1 · $6,450"). Text button "Remove holding".
- **Taps:** "Update value" → G09a. Entry row → edit sheet for that entry. "Edit" → the add-holding sheet in edit mode. "Remove holding" → dialog "Remove Retirement fund? Its entries go too. Net worth drops by $6,450." "Remove" / "Cancel".

#### G09a Update value
(kind: sheet)
- **Layout:** title "Update value"; field "Value on statement $" (pre-filled "$6,450"); date "As of · Today"; preview "Change since Nov 1: +$0". Primary "Save value".
- **Taps:** "Save value" → light haptic, closes → G09 with new figure and "As of Nov 5".

### G10 Your money rules
(kind: screen)
- **Reached from:** Decide spec "Your money rules" heading; G01 overflow; You → "Your money rules".
- **Purpose:** the four limits every Decide answer keeps to, with where each one stands now.
- **Layout:**
  - Header back, "Your money rules". Body "Every answer keeps to these. Tap one to change it."
  - Rows 64 px, value at right, status underneath:
    - `lock` "Safety net" / "Locked · no answer spends it"; "$1,300". Status: "of $2,300 goal".
    - `debt` "Debt payments at most" / "Share of pay, all debts counted"; "36%". Status: "Now 10%".
    - `invest` "Investing at least" / "A month, kept out of purchases"; "$200". Status: green badge `sCheck` "Met · $200 set up".
    - `savings` "Saving at least" / "A month, into goals"; "$150". Status: green badge `sCheck` "Met · $150 set up".
  - Note: "These are your own rules. FincWin uses them to word its answers; it doesn’t set them for you."
- **Taps:** Safety net row → G04. Other rows → G10a.

#### G10a Change a rule
(kind: sheet)
- **Layout (Debt payments at most):** title; stepper "−  36%  +" (1-point steps) or amount field for money rules; switch "Use this rule" (off hides it from answers, with note "Answers stop checking this."); preview card "Open checks with this rule: Headphones — Fits, Laptop — Tight." Primary "Save rule".
- **Taps:** "Save rule" → light haptic, closes → G10, toast "Rule saved. Decide’s next answers use it." with "Undo".

---

