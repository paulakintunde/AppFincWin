# 06 Grow: UI audit against the prototype, and a payoff plan redesign

**Date:** 2026-11-07 · **Branch:** feat/06-grow (worktree `C:\dev\fincwin-g6`) · **Device:** Pixel 9 (55240DLAQ000EQ), owner account, read only.
**Sources:** `design/grow-screens.js` (G01–G12; line numbers below are file lines), `design/areas-spec.md`, `design/calculators-screens.js`, `06-UI-SPEC.md`, `06-CONTEXT.md` (D-07, D-13).
**Screenshots:** `C:\Users\harki\AppData\Local\Temp\claude\c2b776d808e07261\432f7f9b-aa45-4360-bcf5-c16006f22b9c\scratchpad\uiaudit\` (`10-12` Debts, `20-21` debt detail, `30-31` Goals, `42-43` safety net, `50-51` goal detail, `60-61` holding, `80` rules, `90-92` calculators).
No code was changed and no data was saved. Two sheets (Add money and Take some out on the safety net) opened by accident during scrolling. Both were closed with Back while the amount was still $0 and the button was off.

---

## 1. Screen by screen

Rank: **H** = wrong or broken; **M** = clear mismatch with the prototype; **L** = polish.

### Debts segment (G07) — `src/features/grow/debts/DebtsSegment.tsx`, `PayoffPlanCard.tsx`

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| D1 | **H** | The stepper's value ("$50") does not show. Only − and + appear (screens 11 and 12). The value `Text` has `flex: 1` inside a row the Stepper sizes to its content, so it gets 0 width. | `ui/Stepper.tsx:84`, used at `PayoffPlanCard.tsx:140-152` | Put the "Extra each month" label on its own line above the stepper (as in the prototype, `grow-screens.js:465`). Give the Stepper group `alignSelf: 'stretch'` so the value can flex between the buttons. |
| D2 | **H** | The two order columns read the *saved* extra (`model.extra`, which is $0 here), not the stepper. Pressing + changes the scenario rows but not the columns, so the card shows two different answers. | `PayoffPlanCard.tsx:103` (`outcomeShown(c.plan, model.extra)`) | Drive the columns from `whatIf` (the stepper's extra). See the redesign in §2. |
| D3 | **H** | The "Use $50 extra" button ignores the selected scenario. With "Minimum only" or "$1,000 once" selected, it still says and saves "$50 extra". | `PayoffPlanCard.tsx:190-195`, `DebtsSegment.tsx:127-145` | Make the button follow the selection (see §2). |
| D4 | M | With one debt the prototype shows a greyed two-part control and one note. The build shows two large radio cards with the same figures, two notes ("With one debt…", "The choice is yours."), and about 600 px of repeated numbers. | `PayoffPlanCard.tsx:101-138` | One debt: show a disabled order control and one note. Two or more debts: show compact columns of equal weight (D-13). See §2. |
| D5 | M | The scenario rows use "about $12,310" while the columns use exact cents ("$12,307.85") for the same interest. | `PayoffPlanCard.tsx:126` vs `:84` | Use `aboutTens` in the plan card everywhere. Keep cents for the calculators only. |
| D6 | M | The what-if rows work out only the largest debt (`focus`), but they sit under a plan-wide header. With 2+ debts, "Minimum only · Sep 2041" can differ from the hero date. | `useDebtsRead.ts:176-187` | Base the scenarios on the whole plan: `strategy()` with the extra, and `strategy()` with a lump (needs engine support, see §2), or label them "{debt name}". |
| D7 | M | Hero figure uses `heading` (26). Goals and Investing use `display`, and the prototype uses `fig`, the same as Goals. | `DebtsSegment.tsx:190` | Use `textRole(pairing,'display')` with `scale="capped"`, as in `GoalsSegment.tsx:105`. |
| D8 | M | The "Debts" section header is ink `sheetTitle`. On Goals and Investing the section headers are muted eyebrow labels. | `DebtsSegment.tsx:213, 220` vs `GoalsSegment.tsx:115`, `InvestingSegment.tsx:105` | Use one section-header style across all three segments. |
| D9 | M | The prototype adds a row "Extra payments on the Auto loan · Payoff date and interest saved" (to GC04) under the plan. The segment has only the generic Tools row. | prototype `calculators-screens.js:215`; `DebtsSegment.tsx:244-245` | Add the record row (it is also the way into the detailed reveal). |
| D10 | L | "48 months sooner" is hard to read. The prototype example is small ("4 months"). | `PayoffPlanCard.tsx:163` | When the gap is 24 months or more, say "4 years sooner" (or "3 years 2 months sooner"). |
| D11 | L | The left-over note shows cents ("$27,373.64") where the prototype shows whole dollars ("$425"). | `PayoffPlanCard.tsx:189` | Show whole dollars. Also check the figure: $27k a month left over looks like the usual-pay input may be wrong. |
| D12 | L | "Add a debt" is a full-width secondary Pill that repeats the FAB. The prototype uses a text row inside the Debts card (`grow-screens.js:459`). | `DebtsSegment.tsx:244` | Move it into the debts card as a "+ Add a debt" text row, as Goals does. |
| D13 | L | The `debt` and `card` glyphs look almost the same (the car loan and the Visa card look alike). | `ui/GrowGlyph.tsx:118-131` | Give `debt` a different shape (for example, a document with a downward line). |
| D14 | L | With no debt rule set, the line card has no tick and no "Your rule is at most 36%" text. The rules screen shows "36% default". | `DebtsSegment.tsx:197-206` | When the rule is the default, show the default tick and text ("Your rule is at most 36% (default)"). |

### Debt detail (G08) — `src/features/grow/debts/DebtDetailScreen.tsx`

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| T1 | M | The figure is "$25,000 owed", all in ink `heading`. The prototype uses `fig` 36 with "owed" muted at 17. | `:135-137` | Use `display` for the amount and muted `body` for "owed", like the goal and net figures. |
| T2 | M | "Started at $2,500 · 0% paid" shows when the start is *below* the balance, which is nonsense. | `:138-143`, `debtLineModel.ts:69` | Hide the line and bar when `startedBalance <= balance`. |
| T3 | M | Payments show only the next expected line, with no badge. The prototype lists past payments ("Oct 15 · $312 · From Everyday checking") with an "Expected" badge on the next. | `:188-196` | List the debt's paid lines plus the expected one. Use the same row as the goal History (after G2 is fixed). |
| T4 | M | "If you pay more" is a fixed +$50 sentence. The owner asked for a way to reveal the answers. | `:158-186` | Replace it with the mini reveal in §2.4. |
| T5 | L | The fact rows have no dividers, and each row is about 52 px with a large gap, which looks airy next to the prototype's `kv` list. | `:98-103`, `styles.fact` | Add hairline dividers. Set `gap: 0` in this card. |

### Goals segment (G01) — `home/GoalsSegment.tsx`, `home/SafetyNetCard.tsx`, `home/GoalRow.tsx`

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| G1 | **H** | The safety net card never shows the prototype's date line "$100 a month reaches $2,300 by Aug 2027". The `cardLine` string exists, but the card always uses `cardLineNoPlan`. | `SafetyNetCard.tsx:36`; string `en.ts:4099` | When the net has a monthly amount and a size, use `cardLine` with `planFromMonthly(...).reachesOn`, as `SafetyNetScreen.tsx:94` does. |
| G2 | M | The net tile is white with a grey lock. The prototype uses a navy-tint tile with a navy-strong lock, and "of $2,300" in muted weight 500. | `SafetyNetCard.tsx:49-57` | Tile background `categorySwatch.blue.tint`, glyph `blue.color`. Split the figure into ink saved + muted "of $X". |
| G3 | L | A goal with no target still draws an empty bar ("Holiday · $2,000 saved · no set target"). | `GoalRow.tsx` (bar render) | Hide the bar when `target === null`. |
| G4 | L | Tools rows use a bare glyph. Prototype rows use the 36 px tinted tile (`accTile`). | `home/ToolsRow.tsx:27, 35`; `calculators/typed/CalculatorsScreen.tsx:49, 66` | Use the same tile as the debt rows (`DebtsSegment.tsx:171-174`). |

### Goal detail (G03) — `goals/GoalDetailScreen.tsx`

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| GD1 | M | "Expected" shows twice on each expected row (in the text and as a badge), and there are two future months. The prototype shows one expected row. | `:174, 290`; `en.ts:3995` | Drop "· Expected" from `historyExpected`. Show only the next expected month. |
| GD2 | M | History rows are one line ("Nov 7, 2026 · $2,000 · Starting amount"). The prototype row has the date as title, the source or "Starting amount" as a sub line, and the amount right-aligned. | `:280-292` | Use `Row` with `label=date`, `sublabel=source`, `value=amount`. Use the same row on the safety net screen. |
| GD3 | L | "Each month · $200.00" shows cents. The prototype shows "$50". | plan card around `:205` | Whole units when the amount is whole. |
| GD4 | L | "Remove goal" is centred. The prototype has a left-aligned text button. | `:307` | Left-align it, as on the debt detail. |

### Safety net (G05) — `safetyNet/SafetyNetScreen.tsx`

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| N1 | M | History has the same one-line rows as GD2, and "History" is a label inside the card. The prototype uses a section header above the card. | `:239-252` | Same fix as GD2. Move the header out of the card. |
| N2 | L | "What it covers" is a small muted label. The prototype uses a 15/700 title. | `:209-213` | Use the `sheetTitle` role. |
| N3 | L | The move sheets say "Add to Safety net" (capital S). The prototype says "Add to the safety net". The date has a lone "Today" chip plus a "Pick a date" row; the prototype has two chips. | `goals/MoneyMoveSheet.tsx` | Use the net-specific titles. Use two chips. |
| N4 | L | "Add money" is a filled primary button. In the prototype both buttons are outline. This applies to the goal detail too (`GoalDetailScreen.tsx:264`). | `:230` | Keep primary only if that is a deliberate owner choice. Otherwise use secondary for both. |

### Investing (G10) and holding detail (G11) — `investing/InvestingSegment.tsx`, `investing/HoldingDetailScreen.tsx`

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| I1 | M | Holding rows have no lead tile (the prototype has `pension` or `invest` tiles). | `InvestingSegment.tsx:121-124` | Add the 36 px tile by account type. |
| I2 | M | A holding with one value draws one dot and about 300 px of empty chart (screen 60). | `HoldingDetailScreen.tsx:106, 158` | Hide `LineChart` when there are fewer than 2 points. Show "The chart starts after your second value." |
| I3 | M | There is no "Edit" in the header and no way to edit the holding. The prototype has G11e. | `HoldingDetailScreen.tsx:149` | Add `right={Edit}` that opens `AddHoldingSheet` in edit mode. |
| I4 | L | The "+$260" badge repeats the gain line next to it. | `HoldingDetailScreen.tsx:154-156` | Keep one: the badge on the list, the line on the detail. |
| I5 | L | "Remove holding" is a tinted danger pill. Goal and debt use a text button. | `HoldingDetailScreen.tsx:236` | Use a danger text button for consistency. |
| I6 | L | The allocation bar has square ends and no rounding. | `ui/StackedBar.tsx` | Round the ends (`radii.pill`). |

### Your money rules (G12) — `lines/GrowLinesScreen.tsx`

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| R1 | M | "Investing at least $0 · Met · $0 set up" shows a green Met badge for a $0 rule, and "Saving at least $556.87 default" shows cents. | `:149-170` | Hide the badge when the rule is 0. Use whole units. Show "default" as a sub line, not under the value. |
| R2 | L | The safety net tile is neutral. The prototype uses the navy `net` family tile. | `:123-135` | Use the blue swatch tile. |

### Calculators (GC01, GC04)

| # | Rank | Mismatch | Where | Fix |
|---|---|---|---|---|
| C1 | L | "With your records" mixes formats: "$25,000 · $210 a month" next to "$5,260.00 · $0.00 a month". | `calculators/typed/CalculatorsScreen.tsx:60-70` | Whole units in the subtitles. |
| C2 | L | Rows have no tiles (see G4). | `:49, 66` | As G4. |
| C3 | — | GC04 (Extra payments) matches the spec well. It is a good base for the reveal in §2. | — | — |

---

## 2. Payoff plan redesign

### 2.1 What the prototype shows (G07, `grow-screens.js:461-467`; spec G05)

```
┌ Payoff plan ─────────────────────────────────┐
│ [ Highest rate first | Smallest first ]  (greyed, one debt)
│ With one debt, both orders are the same.     │
│ Extra each month                             │
│   (−)          $50          (+)              │
│ ┌──────────────────────────────────────────┐ │
│ │ Minimum only                             │ │
│ │ Apr 2029 · about $760 interest           │ │
│ ├══════════════════════════════════════════┤ │  ← selected: 2 px ink border
│ │ $50 extra a month                        │ │
│ │ Dec 2028 · about $640 interest · 4 months sooner
│ ├──────────────────────────────────────────┤ │
│ │ $1,000 once, today                       │ │
│ │ Dec 2028 · about $580 interest           │ │
│ └──────────────────────────────────────────┘ │
│ Extra money for debt comes out of what is    │
│ left each month ($425). Decide counts it.    │
│ [ Use $50 extra ]                            │
└──────────────────────────────────────────────┘
```
Debt detail G08: "If you pay more · +$50 a month ends it in Dec 2028 and saves about $120. › Change in the payoff plan".

### 2.2 How the build differs

- **Order:** the build has two big radio columns, not a two-part control. With one debt they are disabled copies of the same numbers, followed by two notes (D4). The columns ignore the stepper (D2).
- **Stepper:** the value does not show (D1). The label sits beside the stepper, not above it.
- **Scenarios:** these match the prototype rows (plus a radio dot). Gaps:
  - Only the extra row shows "sooner".
  - The lump is fixed at $1,000 and cannot be changed.
  - No row says how much *less interest*.
  - Dates fall back to "—" when the debt has no due day (`PayoffPlanCard.tsx:81`).
  - The rows cover the largest debt only (D6).
- **Button:** it does not follow the selected row (D3).
- **Debt detail:** a fixed +$50 sentence plus two links. Nothing there lets you try another amount.

### 2.3 Proposed card (matches the prototype; one debt)

```
┌ Payoff plan ─────────────────────────────────┐
│ Debt-free by Sep 2041 on the minimum.        │   ← date first (engine plan.withoutExtra)
│ [ Highest rate first | Smallest balance first ]  disabled, 60% (one debt)
│ With one debt, both orders are the same.     │
│                                              │
│  ( scenario rows: see 2.4, option B )        │
│                                              │
│ Extra money for debt comes out of what is    │
│ left each month ($425). Decide counts it.    │
│ [ Use $50 extra from Dec 3 ]                 │   ← label follows the open row
└──────────────────────────────────────────────┘
```
With **2 or more debts**, the disabled control is replaced by two compact columns of equal weight. Each column shows "Debt-free by", "Interest" and "First cleared". Each figure is the engine's `strategy()` for the *current* extra, so the columns follow the stepper. Neither column is picked until the user taps one. Both have the same border, type and order on every load, and the line under them reads "The choice is yours."

### 2.4 The new reveal: three options

All figures come from engine results already in the read model:
- `fixedPayoff(balance, apr, minimum, {extra, lump})` and `strategy(...)` give `months` and `totalInterest`.
- `dueDateOf(today, dueDay ?? todayDay, months-1)` gives the date.
- "Sooner" is `minimumOnly.months − scenario.months`.
- "Less interest" is `aboutTens(minimumOnly.totalInterest − scenario.totalInterest)`. It is worked from the exact values, not from rounded ones.

Move those two differences into `buildDebtsModel` (a `compare` field), so the screen only formats. A lump on a *multi-debt* plan needs a `lump` option on `strategy()` in `src/engine/payoff/strategies.ts`. That is an engine change with full branch coverage. The lump would go to the debt first in the chosen order.

**Option A: a "What if" row that opens a panel**

```
│ What if I pay more?                       ⌄ │
├──────────────────────────────────────────────┤
│ [ Each month ]  [ Once ]                     │
│   (−)          $50          (+)              │
│ ┌ Debt-free by ──────┐ ┌ Interest ─────────┐ │
│ │ Sep 2037           │ │ about $8,700      │ │
│ │ 4 years sooner     │ │ about $3,610 less │ │
│ └────────────────────┘ └───────────────────┘ │
```
- Pros: tidy when closed, and closed by default for people who do not care. One place for both kinds of extra.
- Cons: hides the prototype's three-row comparison. Adds a tab inside a card, which is one more control to learn.

**Option B: scenario rows that open when tapped (proposed pick)**

The three prototype rows stay as they are. Tapping a row selects it, and it opens to show the full answer plus its own amount control. Only one row is open at a time. Each closed row shows a date.

```
┌──────────────────────────────────────────────┐
│ ○ Minimum only                               │
│   Debt-free by Sep 2041 · about $12,310 interest
├══════════════════════════════════════════════┤
│ ● Extra each month                       ⌃   │
│   (−)           $50           (+)            │
│   Debt-free by   Sep 2037    was Sep 2041    │
│                  4 years sooner              │
│   Interest       about $8,700  was $12,310   │
│                  about $3,610 less           │
├──────────────────────────────────────────────┤
│ ○ Once, today                            ⌄   │
│   Debt-free by Oct 2040 · about $11,010 interest
└──────────────────────────────────────────────┘
  [ Use $50 extra from Dec 3 ]
```
The "Once" row, open:
```
│ ● Once, today                            ⌃   │
│   [ $500 ] [ $1,000 ] [ $2,500 ] [ Type ]    │
│   Debt-free by   Oct 2040    was Sep 2041    │
│                  11 months sooner            │
│   Interest       about $11,010  was $12,310  │
│                  about $1,300 less           │
  [ Record $1,000 on Nov 7 ]   ← or "Try it in the calculator" if one-off saves are out of scope
```
- Pros:
  - It is the prototype's layout, so the owner's "look like the prototype" is met.
  - Each control sits next to the answer it changes, which fixes the current ambiguity where one stepper drives one of three rows.
  - Every row carries a date. "Sooner" and "less" appear for both kinds of extra.
  - The button follows the open row, which fixes D3.
  - Screen readers handle it well: the radio group stays, and the open row announces "Debt-free by September 2037, 4 years sooner".
- Cons:
  - The card grows by about 120 px when a row is open.
  - The lump needs a save path, or an honest "see it in the calculator" link. (No one-off planned payment exists today. `useSaveDebtPlan` saves a monthly extra only.)

**Option C: a live stepper with a timeline**

```
│ Extra each month   (−)  $50  (+)             │
│ Once, today        (−)  $0   (+)             │
│ Nov 2026 ──────────────●────────────┤        │
│                     Sep 2037     Sep 2041    │
│ Debt-free by Sep 2037 · 4 years sooner       │
│ Interest about $8,700 · about $3,610 less    │
```
- Pros: shows the monthly extra and the lump *together*. `fixedPayoff` already supports both at once. The timeline makes "sooner" visible at a glance.
- Cons:
  - Moves away from the prototype's rows.
  - The timeline is a new visual: it must use only §2 tokens, with no gradient or new colour.
  - Two steppers in one card are heavy at 200% font size.

**Proposed pick: Option B.** It keeps the prototype's look, adds the reveal the owner asked for, and puts a date on every answer. Option C's combined extra-plus-lump can come later inside the GC04 calculator.

**Same pattern on the debt detail (replaces T4):**
```
┌ If you pay more ─────────────────────────────┐
│ [ +$25 ] [ +$50 ] [ +$100 ] [ $1,000 once ]  │
│ Debt-free by Sep 2037 · 4 years sooner       │
│ Interest about $8,700 · about $3,610 less    │
│ Change in the payoff plan ›                  │
│ Try other amounts ›                          │
└──────────────────────────────────────────────┘
```
Chips reuse `EXTRA_CHIP_UNITS` from `DebtExtraCalculator.tsx:30`.

**Copy check:** every line is a statement of fact ("Debt-free by …", "… sooner", "about … less"). There is no "advice", "recommend", "should", "best" or "better" in the app copy. Both orders get the same style, with no default pick.

---

## 3. Missing dates

| Where | Now | Should read |
|---|---|---|
| Safety net card on Goals (`SafetyNetCard.tsx:36`) | "No Decide answer spends it." | "… $100 a month reaches $2,300 by Aug 2027." when a monthly amount is set |
| Payoff scenario rows, debt with no due day (`PayoffPlanCard.tsx:81`) | "—" | Use today's day as the fallback, as GC04 does (`DebtExtraCalculator.tsx:53`) |
| Debts hero when the last debt has no due day (`useDebtsRead.ts:118`) | "No payoff date yet." | The same fallback, so it reads "Paid off by Sep 2041 on the minimum." |
| Debts hero when an extra is saved | only the minimum date | A second line: "With your $50 extra: debt-free by Sep 2037." |
| "$1,000 once, today" row (`PayoffPlanCard.tsx:158-165`) | date and interest, no "sooner" | "… · 11 months sooner · about $1,300 less" |
| "Use $50 extra" button and toast (`DebtsSegment.tsx:141`) | no start date | "Use $50 extra from Dec 3" / toast "A $50 extra payment is expected each month from Dec 3." (GC04 already words this, `DebtExtraCalculator.tsx:232`) |
| Debt list row sub (`DebtsSegment.tsx:153-161`) | "5.8% · $210 a month · due the 3rd" | optional: add "· ends Sep 2041" when the row has room |
| Money rules, safety net row (`GrowLinesScreen.tsx:123`) | "of $4,880 goal" | "of $4,880 · reaches it by …" when a monthly amount is set |

---

## 4. Already-flagged issues

**4.1 "Saved across 1 goal" with an empty goal list — confirmed as by design, with a copy tweak.**
The prototype counts the safety net:
- G01 says "Saved across 3 goals · $1,940".
- That is Trip to Lisbon $640 + Laptop $0 + safety net $1,300 = $1,940, across three goals with two listed (`grow-screens.js:394-396`).
- "$150 a month goes into goals" is likewise $50 (Lisbon) + $100 (net).

The code matches (`GoalsSegment.tsx:94`, `useGoalsRead.ts:46-55`). On device now it reads "Saved across 2 goals · $4,250" = Holiday $2,000 + net $2,250. The total is right. The *label* misleads when the only "goal" is the net. Proposed copy, with no change to the maths:
- "Saved across 1 goal and the safety net"
- "Saved in the safety net" when there are no goals

That needs `count = goals.length` plus a has-net variant of the string.

**4.2 The "We moved your safety net here" sheet did not appear — expected in some cases; one real bug found.**
- The sheet shows only when all of these hold (`FirstOpenNetSheet.tsx:60`, `useGoalsRead.ts:56`):
  - a flagged net exists;
  - `net_confirmed_at` is null;
  - the net has a size or saved money;
  - the user has not dismissed it in this app session (`dismissedThisSession`, module-level, `FirstOpenNetSheet.tsx:23`).
- The D-07 data step (`20261106000200_grow_goal_contributions_and_safety_net.sql`, section 7) **is applied on production** (migration list checked, read only):
  - It created a net only for users with a `decide_settings` row who did not already have a flagged goal.
  - The net was created with `net_confirmed_at = null`.
  - A size of 0 or null and a null reserve give a net with no size and $0 saved. That case skips the sheet by design (UI-SPEC: "If the tester had no safety net set, the sheet is skipped").
- So it is expected **not** to appear if any of these is true:
  - the owner's old Decide size and reserve were empty;
  - the owner already had a flagged net before the migration (the step skips them);
  - it was confirmed or dismissed once earlier (dismiss lasts until the app is restarted);
  - "Change it" was used.
- **Bug (M):** a net made *in the app* also gets `net_confirmed_at: null` (`src/data/mutations/growGoals.ts:239`), and so does a goal turned into the net through "Use as my safety net" (the `set_safety_net` RPC does not set it). The next Grow open would then say "We moved your safety net here" about a net the user just made.
  - Fix: set `net_confirmed_at = now()` when the app creates or flags a net. Do the same in `set_safety_net`, through a new additive migration.
- **To confirm the owner's case** (I did not run this: the production read was blocked by the permission check):
  ```sql
  select g.created_at, g.net_confirmed_at, g.target, g.opening_saved,
         ds.safety_net_size, ds.reserve
    from savings_goals g
    left join decide_settings ds on ds.user_id = g.created_by
   where g.is_safety_net and g.deleted_at is null and g.created_by = '<owner uid>';
  ```
  How to read the result:
  - `net_confirmed_at` set: it was confirmed earlier, which is expected.
  - `created_at` later than 2026-11-06 00:02: the net was made in the app, which is the bug above.
  - `safety_net_size` and `reserve` both null or 0: skipped by design.
