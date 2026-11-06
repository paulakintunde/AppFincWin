---
phase: 6
slug: grow
status: approved
shadcn_initialized: false
preset: none
created: 2026-11-06
---

# Phase 6 (Grow) - UI Design Contract

> Visual and interaction contract. The design is LOCKED by the owner's clickable prototype (06-CONTEXT D-04). This file does not invent a design; it maps prototype screens G01..G12 and GC01..GC40 onto the app's existing tokens (`src/theme/*`) and primitives (`src/ui/*`). Prototype screen text is in `design/areas-spec.md`, `design/grow-screens.js`, `design/calculators-screens.js`. Where this file and the prototype differ, this file wins on tokens, 06-CONTEXT wins on behaviour.

Sources: CONTEXT D-01..D-21, areas-spec (Grow), LEDGER (example numbers, Calculators), CLAUDE.md design-fidelity and compliance rules.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (React Native; shadcn gate not applicable) |
| Preset | not applicable |
| Component library | The app's own `src/ui/*`: `Screen`, `Row`, `Pill`, `Chip`, `ToggleRow`, `Sheet`/`SheetHeader`, `ConfirmSheet`, `DetailSheet`, `ToastView`, `EmptyState`, `Keypad`, `TextInput`, `RadioDot`, `AmountDisplay`, `CategoryGlyph`, `SwatchDot` |
| Icon library | The app's own bespoke two-layer glyph set (CLAUDE.md: no substituted icon set). Glyph names used: `lock`, `calendar`, `laptop`, `phone`, `camera`, `savings`, `housing`, `transport`, `headphones`, `debt`, `card`, `invest`, `pension`, `checkbuy`, `target`, `bills`, `view`, `minus`, `plus`, `chev`, state shapes `sCheck`, `sHalf`, `sOver`, `sUp`, `sDown`, `sClock`, `sQuestion`. Any glyph not yet in the set is drawn in the same two-layer style in this phase (not imported from another library) |
| Font | The active font pairing via `textRole(pairing, role)` and `src/theme/fonts.ts` (display face for titles and large figures, body face otherwise) |

New primitives to build (composed from existing tokens only, no new colours): `ProgressBar` (thin and 8 px variants, with Reduce Motion fill), `SegmentedControl` (44 px), `Stepper` (minus / value / plus), `StateBadge` (colour + shape + word), `CalcResultCard`, `HowWorkedOutBox`, `LinkedPairFields`, `ChangeRows` (before -> after list used by confirm sheets), `StackedBar` (allocation), `LineChart` and `BarChart` (react-native-svg, no animation loop).

---

## Spacing Scale

The app uses exact prototype pixel values, not a generic 4/8 scale (`src/theme/layout.ts`: "Do not round these"). Phase 6 uses only these existing tokens; the template's 4-multiple scale is satisfied where the tokens are, and exceptions are listed.

| Token (layout.ts) | Value | Usage in Grow |
|-------|-------|-------|
| `gapSm` | 8 | Chip gaps, badge gaps, step-bar gaps, stepper internal gap |
| `gapMd` | 12 | Between paired cards, stepper to field |
| `cardPad` | 16 | Card inner padding, "How it was worked out" box padding |
| `cardPadLg` | 20 | Hero cards (Saved across 3 goals, Total debt, Invested, calculator result) |
| `groupGap` | 18 | Between sections and cards on every Grow screen |
| `screenH` | 22 | Horizontal screen padding |
| `touchMin` | 44 | Every tappable: back, stepper -/+, segments, chips, text buttons, row actions |
| `sheetPadBottom` | 30 | Sheet bottom padding |
| `rowPad` | 15 | Row vertical padding |

Row heights: 52 one line, 64 two lines (min-heights, they grow with text scale). Tile 36 with 20 glyph (`radii.glyphTile` 11); safety-net card tile 64.

Exceptions: rows of 52 and 64 px and the 36 px tile come from the prototype (D-04) and are 4-multiples except 36 (= 9 x 4, ok). `screenH` 22 and `rowPad` 15 are the app's existing non-4 values, kept for consistency with Home/Activity/Decide. Touch targets are never below 44.

---

## Typography

Only the app's `fontSize` scale and the two weights the app already uses for body text (500 body, 600 label; 700 for heading). No new sizes. Prototype sizes map to the nearest token:

| Role | Token | Size | Weight | Line height | Grow use |
|------|-------|------|--------|-------------|----------|
| Display figure | `display` | 34 | display face | 1.0 | Hero figures ($1,940, $8,420, $7,690), calculator main result |
| Heading | `heading` | 26 | 700 | 1.16 | Screen titles (prototype Archivo Black 22-28 maps here) |
| Sheet title | `sheetTitle` | 16 | 600 | 1.2 | Sheet titles, card titles ("Payoff plan"), section header |
| Body | `body` | 15 | 500 | 1.5 | Row titles, explainer text, button labels |
| Label | `label` | 13 | 600 | 1.4 | Field labels, row sublabels, footer notes, badges |
| Meta | `meta` | 12.5 | existing meta weight | 1.4 | Eyebrow dates, "as of" stamps, chart axes, legend |

Mapping notes: prototype 24 and 22 inline figures (stepper value, linked-pair values) use rule: stepper values and linked-pair values use `heading` 26 (at 200% font scale the stepper value stacks above its Less/More buttons, like the linked pair); prototype 16 result values use `sheetTitle`; 14 and 14.5 body copy uses `body` 15; 11.5 uses `eyebrow` 11.5 only for the date line "THURSDAY, NOV 5". The large-figure sizes (`display` 34, `netWorth` 42) are existing exceptions; Grow uses `display` only. Amounts always use tabular figures.

---

## Color

Only `src/theme/tokens.ts` and `accents.ts`. No gradients, no extra shadows, no new hex (enforced by `noRawColours.test.ts`).

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `canvas` #FBFAF7 | Screen background |
| Secondary (30%) | `surface` #FFFFFF cards with `shadows.card`; `fill1` #F1EFE8 for soft inner blocks (calculator pair cards, worked-out box, segmented track) | Cards, rows, boxes |
| Accent (10%) | user accent (`colors.accent`, default green #1B4D3E) | see list below |
| Destructive | `danger` #B4472A on `dangerTint1` | "Remove goal", "Remove debt", "Remove holding" confirm buttons only |

Accent reserved for: primary Pill fill (Make goal, Add debt, Save value, Record the sale, Make this the plan, Use $50 extra), selected segment in the segmented control, selected scenario/order border, FAB, the filled part of goal and debt progress bars, the selected half of the linked pair (1.5 px border + `accentTint`), "+ New goal" / "Try other amounts" text links.

Mapping of prototype colours to tokens:

| Prototype | App token | Note |
|-----------|-----------|------|
| Primary button "ink #14150F on paper" (areas-spec) | `Pill variant="primary"` = accent fill, surface text | App already ships accent-filled primary pills on every screen; consistency wins. Flagged as open question OQ-1 if owner wants ink buttons |
| Navy safety-net tint #E4ECF6 and navy bar/badge | `categorySwatch.blue` (#3E5C6B on #EAEEF1) | Navy #E4ECF6 is not in the token set. Use the `blue` swatch pair for the safety net card tint, bar and "Locked" badge. Colour is never the only signal: `lock` glyph + word "Locked" |
| Plum badge "Linked to a check" | `categorySwatch.plum` (#6E4A63 on #F0EAEF) | `sHalf` shape + words |
| Amber / "Near cap" / "Over your line" | `warn1` #8A5A1B text on `warnTint` | `sOver` shape + words; warning only, never red for money out |
| Green "Met" / "Reached" | `accentTint1` fill, `accent` text | `sCheck` shape + words |
| Slate "Expected", "As of Nov 1" | `categorySwatch.slate` | `sClock` shape |
| Allocation bar swatches | `categorySwatch` pairs (category colours, not state colours) | |
| Chart "put in" vs "growth" | put in = `inkMuted`, growth = `accent` | `line4` is too low contrast on canvas for a non-text mark; bars also carry labels and a legend |
| Out-of-pocket amounts | `ink`, never red | Debt payments, "Take some out" amounts |

State colours (warn, danger, accent-green) appear only in badges and amounts, and always with a shape and a word.

---

## Layout and Screen Contracts

All screens: `Screen` wrapper, scrollable, safe-area aware, footer note in `label` / `inkMuted`. Tab screen has date eyebrow, title, avatar (opens You), no back chevron; pushed screens have back chevron (44 x 44, accessibilityLabel "Back"), title, optional right action. Primary pill is full width, 52 px tall; secondary is outline pill; text buttons min 44 px tall. FAB label follows the segment: "New goal", "Add a debt", "Add a holding".

### 1. Grow home (G01) - `app/(app)/(tabs)/grow` (new tab route)
- Segmented control (Goals, Debts, Investing), 44 px, switches in place, no navigation, no haptic. Segments for features that are off are hidden; until Phase 9 gating, all three show (CONTEXT discretion).
- Goals segment: hero card "Saved across 3 goals" + `display` figure + note ("$150 a month goes into goals. Your line is at least $150."); Safety net card; section "Goals" with 64 px rows (tile, title, "$640 of $1,800 · $50 a month · Oct 2028", thin bar); text button row "+ New goal"; "Tools" section with one row "Calculators" ("Loan, savings, growth, debt payoff") -> GC01. The same "Tools · Calculators" row sits at the bottom of Debts and Investing segments (D-21).
- Footer: "Goals, debts and holdings are your own records. FincWin holds no money and moves none."
- Loading: grey card-shaped blocks in `fill1`, no shimmer loop.
- Bars fill in 0.55 s on first view only; with Reduce Motion they appear filled.
- Basics level (off): only Safety net card plus card "Goals, debt and investing are off at this level. Turn on whichever you actually have and this tab fills in." / button "Choose what to track". (Applies when Phase 9 gating lands; test now with a flag.)

### 2. Goals
- **Goal detail (G02):** header (back, name, "Edit"); figure + "of $1,800" + bar; Plan card = two rows that move together ("Each month · $50", "Reaches $1,800 · Oct 2028", note "Change one and the other follows.", plus text link "Try other amounts or dates" -> GC02); Line card ("Kept in", "Automatic · $50 on the 15th, recorded for you to confirm"); side-by-side secondary pills "Add money" and "Take some out"; History rows ("Nov 15 · $50 · Expected" with slate `sClock` badge); linked goal shows "From a Decide check" card with `checkbuy` tile; text button "Remove goal".
- **Locked goals (D-05):** a goal has a "Lock this goal" `ToggleRow` in New/Edit goal step 3 with helper "Locked: Decide never spends the money saved here." Locked goals show the `lock` glyph and "Locked" badge (blue swatch) on the row and detail. Protected amount equals saved amount; detail shows line "Decide keeps $640 out of every answer."
- **Safety net (G04):** the single flagged emergency-fund goal. Header "Safety net", blue "Locked" badge, figure "$1,300 of $2,300", bar, explainer card, rows (Size, Each month, Kept in), "What it covers" card, side-by-side "Add money" / "Take some out", History, footer "This is your own record of money set aside. FincWin is a planning tool, not a bank." Empty: figure $0, "Decide keeps a safety net out of every answer. Set its size to start." / "Set a size". Decide answers name both: "Safety net $1,300 and locked goals $640 kept out" (D-06).
- **Change the safety net (G04a):** sheet with four radio rows (`RadioDot`, 64 px), preview card of open Decide checks with live badges, "Save size".
- **New goal (G03):** sheet, three steps with "1 of 3" step bar: What are you saving for (Name, suggestion `Chip`s, 8-tile icon picker), How much (Target, "No set target" switch, Already saved), How will it fill (linked Each month / By fields, Kept in, "Record it each month for me to confirm" switch, optional household switch, Lock switch, line "Your goals now total $200 a month. Your line is at least $150."). Primary "Make goal". Closing midway -> dialog "Discard this goal?" Discard / Keep going. Edit mode = one page, prefilled.
- **Add money / Take some out (G02a):** sheet with `Keypad`, From/To account row, date chips, note "This records a move between your own accounts. It is not spending." Primary label follows amount ("Add $50").
- **Withdrawal warning sheet (D-08):** shown on "Take some out" from a locked goal or the safety net after the amount is typed, as a `ConfirmSheet`: title "Take $200 from the safety net?"; body "This is your money and you can take it out. It lowers what is locked: Decide will count $200 less as kept safe, and its next answers use $1,100."; primary "Take $200 out" (accent `Pill` primary, not danger red; it is allowed, not destructive); secondary "Keep it". For a locked goal: "Decide will count $200 less as kept safe" with the goal name. Light haptic on confirm. No warning haptic.
- **Goal reached moment:** when a deposit reaches the target: sheet closes, detail shows green `sCheck` "Reached" badge, one-time tick animation (Lottie or SVG draw, once, skipped under Reduce Motion), `hapticSuccess()`, toast "Trip to Lisbon reached $1,800." with "Undo". Success haptic only here.
- **Remove goal:** `ConfirmSheet` "Remove Trip to Lisbon? The $640 stays in Savings account. Only the goal goes." Remove (danger variant) / Keep the goal; then toast "Goal removed" + "Undo". Removing the safety net goal is not offered; it can be set to $0 or Decide's protection switched off in Size.

### 3. "We moved your safety net here" first-open confirm (D-07)
Shown once, the first time Grow opens after migration, as a `Sheet` over Grow home (not a blocking full screen). Title "We moved your safety net here". Body: "Decide used to keep this in its settings. It is now a goal in Grow, so there is only ever one number." Figure card: "$1,300 of $2,300 · Locked" with the migrated values. Buttons: primary "Looks right" (confirms, dismisses forever), secondary "Change it" (opens G04a). Footnote: "Decide's answers do not change until you change it." Dismissing via backdrop or Close counts as "Looks right" for display purposes but the sheet re-appears once more if the user never confirmed (store `safety_net_confirmed_at`). If the tester had no safety net set, the sheet is skipped and G04 empty state is used.

### 4. Investments
- **Investing segment (G08):** hero "Invested" + figure + note "$690 above what you put in · values you typed, as of Nov 1."; line card "Investing · $200 a month. Your line is at least $200." with green `sCheck` "Met"; "Holdings" rows (64 px, glyph `pension` / `invest`, sublabel "Roth IRA · $150 a month · as of Nov 1", amount right, gain `sUp` / loss `sDown` underneath in ink, never red); Allocation card (`StackedBar` + legend); note "No live prices in this version. Update a value whenever you check your statement."; "+ Add a holding".
- **Simple holding (D-09):** Add a holding sheet asks only Name, Account type, "Put in so far", "Value now", "As of" (default today). Account type picker uses generic plain words (D-10): Brokerage, Retirement, Pension, Crypto, Other (prototype's 15 region-specific types are NOT used; deferred). Optional "Each month" and "Day" under a disclosure row "Regular amount going in".
- **Holding detail (G09):** header (back, name, "Edit"); `display` figure + slate `sClock` badge "As of Nov 1"; gain line "$650 above the $5,800 you put in · 11.2%"; `LineChart` of hand-entered values (no loop); rows (Type, Each month, Paid from); primary "Update value"; "Entries" section; text button "Remove holding" (dialog "Remove Retirement fund? Its entries go too. Net worth drops by $6,450.").
- **Lots (D-09):** only a text row "Add a buy / sale / dividend" on holding detail opens the lot sheet: kind chips (Buy, Sale, Dividend, Fee), amount, units (optional), date, note. Entries list shows "Buy · Oct 1 · $150", "Dividend · Sep 30 · $18", "Value update · Nov 1 · $6,450"; tapping opens edit sheet. Gain/loss per holding and in total update from lots.
- **As-of date and 30-day "Update value?" (D-12):** every value shows an as-of stamp (`meta`, slate `sClock` badge on detail, "as of Nov 1" in rows). After 30 days a quiet row appears on the holding and one summary row in Grow home Investing segment: "Update value?" / "Last updated Oct 3" with chevron; no badge colour, no push, no haptic. Update value sheet (G09a): field prefilled, "As of · Today", preview "Change since Nov 1: +$0", primary "Save value" (light haptic).
- **Empty:** `EmptyState`-style card "Investments change what net worth means. Add one if you hold any." / "Add a holding".

### 5. Debts
- **Debts segment (G05):** hero "Total debt" + "Paid off by Apr 2029 on the minimum."; line card "Debt payments · 10% of pay. Your line is at most 36%." (thin bar with tick at 36, no amber unless crossed); "Debts" rows (`debt`, "6.9% · $312 a month · due the 15th"); "Cards paid in full" rows; Payoff plan card; "+ Add a debt"; Tools row.
- **Card paid in full question (D-15):** in Add a debt, choosing "Credit card" shows a required two-option radio before other fields: "Do you pay this card in full each month?" "Yes, in full" / "No, I carry a balance". Yes: only statement due day (and optional balance); the card goes under "Cards paid in full" with sublabel "Cleared each month, so not in the plan". No: rate, minimum and due day appear and the card joins the payoff plan. Ask, do not block: "Not sure" is allowed and treated as carried until answered, with a text row "Is this paid in full each month?" on the card.
- **Payoff strategies side by side (D-13):** Payoff plan card shows two columns (`StrategyColumn`) "Highest rate first" and "Smallest balance first", each with Payoff date and Total interest and (for 2+ debts) First debt cleared. Neither column is highlighted, ordered by preference, or labelled better; the selected one (the user's pick) gets the accent border only after they tap it. Order control is a 2-segment control; with one debt both are disabled and the card says "With one debt, both orders are the same." Extra stepper: minus / `heading` value / plus, steps of $25, 44 px buttons. Scenario rows (radio, 64 px): "Minimum only", "$50 extra a month", "$1,000 once, today", each with date and "about $X interest". Note "Extra money for debt comes out of what is left each month ($425). Decide counts it." Button "Use $50 extra" -> toast "Plan saved. A $50 extra payment is expected each month." + "Undo".
- **Debt detail (G06):** figure "$8,420 owed", "Started at $14,500 · 42% paid", bar, key rows, card "If you pay more" ("+$50 a month ends it in Dec 2028 and saves about $110." per LEDGER), "Payments" section, text buttons "I sold what this paid for" and "Remove debt".
- **"I sold what this paid for" sheet (D-16):** single sheet "Close the loan from a sale": fields "Sold for $" and "Date"; "Paid off with" field prefilled with the amount owed; preview lines "The $8,420 is paid off and $X is left over" (and "Left over goes to: Everyday checking", account row) or "$X is still owed"; primary "Record the sale". One save records sale money in, final loan payment out, marks the debt paid off; leftover shown with its destination account. Success: toast "Loan closed. Sale and final payment recorded." + "Undo".
- **Add a debt (G07):** sheet with type chips (Loan, Credit card, Line of credit, Money owed to someone), Name, Owed now, Rate ("Yearly rate (APR). Leave blank if none."), Payment with "Minimum" chip, Due day, Paid from, household switch, live line "Debt payments would be 10% of pay. Your line is at most 36%.". Over the line: amber `sOver` badge "Over your line" + "This brings debt payments to 39% of pay; your line is 36%." Save still works; `hapticWarning()`.

### 6. In-place calculators (D-17..D-20)
Layout shared: title block ("Goal calculator" eyebrow + record name + subtitle), input card, result card, change rows, `HowWorkedOutBox`, "Make this the plan" pill (hidden on "this is your plan now" state, which shows a quiet confirmation row), footer.
- **Goal calculator (GC02):** `LinkedPairFields` (two 50/50 cards "Each month" and "Reaches $1,800 by"; the one the user edited gets accent border and `accentTint`); Each month stepper (steps from LEDGER: $25 / $50 / $75 / $100 or typed); "Or reach it by" date chips; worked-out box; "What changes each month" rows (Into goals, Left in a usual month); amber note only if below the saving line. Amounts: half up to the cent, "needed each month" rounded UP (D-21). Example: by Oct 2028 is $48.34.
- **Debt extra payment (GC04):** chips None / +$25 / +$50 / +$100; "Paid off" `display` figure with "26 payments of $362, 4 months sooner than Apr 2029."; rows Each month, Interest from now, Interest saved, Last payment; "Payoff order" two side-by-side cards with the note "With one debt, both orders give the same result."; link "Try it with more debts" -> GC40; change rows including Debt payments share of pay and "Your line is debt payments at most 36% of pay."
- **Growth illustration (GC05):** badge `sQuestion` "Illustration, not a forecast" directly under the title and NOT removable; rate chips 2% / 4% / 6%; `display` figure "After 10 years at 4% a year"; `BarChart` (put in vs growth) with legend and chart `accessibilityLabel`; rows Starting value ("as of Nov 1"), Put in, Growth, "$200 a month alone, from $0"; worked-out box; tint card "Real returns rise and fall, and some years go below zero. This uses one steady rate you pick, so it shows a shape, not what will happen." Footer "An illustration from the values you typed. FincWin holds no investments and makes no forecast."
- Savings and investments with a rate (GRW-11 APY): a "See what it could grow to" row on the account/holding opens the illustration prefilled.

### 7. "Make this the plan" confirm + toast with Undo (D-20)
- Pill label "Make this the plan" on any non-current calculator result. Opens a confirm `Sheet` (kind sheet): title "Make this the plan?", subtitle "Nothing changes until you confirm."; `ChangeRows` card listing each before -> after (Each month $50 -> $82.86, Reaches Oct 2028 -> Dec 2027, Into goals $150 -> $182.86, Left in a usual month $425 -> $392.14); note ("Starts with the Nov 16 transfer. Decide's next answers use the new amount." / debt: "You pay your lender as usual. Decide's next answers count the extra."); primary "Make this the plan"; text button "Not now".
- On confirm: light haptic, sheet and calculator close back to the record, `ToastView` "Plan saved. $82.86 a month reaches $1,800 by Dec 2027." with action "Undo" (default toast duration; Undo restores previous values and removes the expected lines). Closing the sheet, "Not now" or backdrop changes nothing.

### 8. Calculators page (D-21)
- **GC01 Calculators:** back to Grow; title "Calculators"; subtitle "Type your own numbers. These work without any records, and nothing you type here is saved."; card of four rows (Loan calculator `bills`, Savings calculator `savings`, Compound growth `invest`, Debt payoff `debt`); section "With your records" with three link rows (goal, Auto loan extra payments, Investing growth illustration), each shown only if the record exists; footer "Results come from the numbers you type, worked out to the cent. They are estimates for planning, not offers, quotes or forecasts. FincWin holds no money and lends none."
- **Shared typed-calculator pattern (GC10/20/30/40):** `TextInput` fields (label above, prefix or suffix unit, numeric keypad, helper text), results update as you type (debounced 150 ms), result card, detail rows, `HowWorkedOutBox` (always visible, `view` glyph, "How it was worked out"), footer estimate disclaimer. Empty/invalid input: result card shows "Fill in the numbers above" and no figure. Never saved; no records needed.
- **GC10 Loan:** Amount, Rate a year (APR), Length (months); result "Each month $400.76"; rows Total interest, Total paid, Last payment. Footer "An estimate. A lender's offer can differ: fees, the day interest starts and its rounding all change the numbers."
- **GC20 Savings:** Target, Saved so far, Each month, Interest a year (optional); result "Reaches $5,000 in 18 months" + "by May 2028"; rows You put in, Interest earned, Total in May 2028.
- **GC30 Compound growth:** Start with, Add each month, Rate a year, Years; "Illustration, not a forecast" badge; `BarChart`; rows Put in, Growth; tint note.
- **GC40 Debt payoff:** per-debt input cards (Owed, Rate, Minimum), Extra each month, "Side by side" two strategy cards (Highest rate first / Smallest balance first) with equal visual weight, card "Minimums only, no extra" rows. Footer "Both orders are shown with the same numbers. The choice is yours. An estimate; a lender's figures can differ." Supports 2..N debts via "+ Add another debt" text button.
- Display rule: half up to the cent; "needed each month" rounds up. Maths reuses `src/engine/payoff/`.

---

## Empty States

| Place | Heading | Body | Action |
|-------|---------|------|--------|
| Goals (feature on, none) | Name something to save for | Give it a name and a target to track it here. | New goal |
| Safety net not set | No safety net yet | Decide keeps a safety net out of every answer. Set its size to start. | Set a size |
| Debts none | No debts recorded | If you owe anything with a balance, add it and Decide counts it. | Add a debt |
| Investing none | Nothing held yet | Investments change what net worth means. Add one if you hold any. | Add a holding |
| Goal history none | No money moved yet | Add money or turn on the monthly record. | Add money |
| Holding entries none | No entries yet | Update the value when you check your statement. | Update value |
| Calculators "With your records" none | (section hidden) | | |

Empty states use the `EmptyState` look (centred `body` heading, `label` / `inkMuted` body) inside a card with a 36 px tile and one primary or text action.

## Error and Edge States
- Save failed (offline queue): reuse app write-queue behaviour and `FailedWritesSheet`; copy "Couldn't save. It will retry when you're back online." No data lost.
- Invalid amount: inline helper under field in `warn1` text with shape cue (danger stays reserved for Remove confirms), "Enter an amount above $0."; save disabled with `accessibilityState.disabled`.
- Target below saved: "That's below what you've already saved ($640). Raise the target or mark the goal reached."
- Extra payment that pays the debt off at once: calculators show "Paid off in 1 payment".
- Stale value: see 30-day row; never a warning colour.
- Couldn't load (Grow segments; goal, debt and holding details; calculators that read records): one generic card in place of the content, `sQuestion` glyph, title "Couldn't load this right now", body "Your records are safe. Check your connection and try again.", text button "Try again". Offline with a cached copy: show the cached figures with a quiet "Offline · as of <time>" line; offline with no cache: the same card with body "You're offline. This shows once you're back online." The typed calculators (GC10..GC40) never need a connection.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTAs | "Make goal", "Add debt", "Add holding", "Save value", "Record the sale", "Make this the plan", "Use $50 extra", "Save size", "Looks right" |
| Empty state heading | "Name something to save for" (Goals); see table above |
| Empty state body | See table above (always with a next step) |
| Error state | Problem + path, e.g. "Couldn't save. It will retry when you're back online." |
| Destructive confirmation | Remove goal: "Remove Trip to Lisbon? The $640 stays in Savings account. Only the goal goes." / Remove debt: "Remove Auto loan? Past payments stay in Activity. Decide stops counting this debt." / Remove holding: "Remove Retirement fund? Its entries go too. Net worth drops by $6,450." / Discard goal: "Discard this goal?" Discard / Keep going |
| Withdrawal from locked | "Take $200 from the safety net? Decide will count $200 less as kept safe." Take $200 out / Keep it |
| Toasts | "Goal made", "Goal removed" (Undo), "Trip to Lisbon reached $1,800." (Undo), "Safety net set to $2,775. Decide's next answers use it." (Undo), "Plan saved. ..." (Undo), "Debt added. Decide counts it from now.", "Line saved. Decide's next answers use it." (Undo) |

Compliance voice rules (hard): declarative not prescriptive; never "advice", "recommend", "you should", "better", "best", "optimal" anywhere in Grow, including payoff order, calculators and growth. Payoff orders get equal weight and the line "The choice is yours." Every calculator says "estimate" and holds no money / no forecast. Illustrations carry "Illustration, not a forecast". Use "your own record" framing; FincWin is "a planning tool, not a bank".

## Interaction and Motion
- Sheets: app `Sheet` (slide 0.24 s, drag to dismiss, backdrop, Close top right). Reduce Motion: cross-fade 0.15 s and bars appear filled (use `useReduceMotion` / `useMotion`).
- Haptics via `src/ui/haptics.ts`: `hapticLight` on every save; `hapticWarning` only for a line crossed (Over your line) ; `hapticSuccess` only for goal reached; none for navigation, segment switch, stepper, scenario select, calculator input.
- Stepper and chips update results in place with no navigation.

## Accessibility
- Targets: all interactive >= 44 x 44 (`space.touchMin`), including stepper buttons, back, segments, chips, icon-picker tiles and "Undo" in toasts (extend hit slop).
- Labels: goal row reads "Trip to Lisbon, 640 of 1,800 dollars, 36 percent, 50 dollars a month, reaches target October 2028". Safety net badge "Locked, no Decide answer spends it". Gains "650 dollars above what you put in"; losses "below" with `sDown`, never red. Holding "as of November 1". Back button "Back". Charts have `accessibilityLabel` with the end figure and put-in amount; decorative bars hidden from the tree.
- Roles: scenario rows and order control are radio group (`accessibilityRole="radio"`, `selected` state); segmented control `tablist`/`tab`; stepper `adjustable` with increment/decrement actions, reads "Extra each month, 50 dollars, adjustable"; switches via `ToggleRow`; plan rows are a group "Plan".
- Live regions for changing calculator results: the result card is `accessibilityLiveRegion="polite"` (Android) and posts `AccessibilityInfo.announceForAccessibility` on iOS, debounced 600 ms after input stops (reuse `useSettledLabel`, Phase 5 D-56). Announcements: "Reaches October 2028", "Each month 48 dollars 34 cents", "Paid off December 2028, 111 dollars 45 cents interest saved". Linked-pair fields announce the other field's new value. The G04a preview rows announce badge changes ("Laptop, now Not yet"). Never announce every keystroke.
- Colour never the only signal: each state badge has shape + word.
- Text scaling: layout survives font scale up to 200% (see Pixel text-fit matrix 402 dp / 320 dp). Rows grow from one to two lines before truncating; amounts never truncate (label wraps); side-by-side strategy cards and the linked pair stack vertically when scaled text would not fit (switch at font scale > 1.3). All screens scroll; sheets scroll their content with the primary pill pinned.
- Reduce Motion handled as above; no looping animation anywhere (charts static, no shimmer).

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (not used) | not applicable |
| third-party | none | not applicable |

New npm dependencies: none required (react-native-svg and Reanimated already in stack). Goal-reached tick uses an SVG draw or existing animation, Lottie only if already installed.

---

## Open Questions (not blocking; defaults chosen)

- OQ-1 (RESOLVED, owner 2026-11-06): use the app's accent `Pill` primary everywhere in Grow; the prototype's ink buttons were a drawing shortcut.
- OQ-2 (RESOLVED, owner 2026-11-06): safety net uses `categorySwatch.blue` with the `lock` glyph and the word "Locked"; no new colour token.
- OQ-3: Goal-reached "Lottie tick": confirm whether Lottie is installed; default is an SVG stroke draw once.
- OQ-4: Whether a locked goal can be unlocked from the detail screen with a plain toggle (default yes, with the same "Decide will count $X less as kept safe" note).
- OQ-5: Glyphs missing from the current set (`checkbuy`, `pension`, `sUp`, `sDown`, `sClock`, `sQuestion`, `target`) must be drawn in the two-layer style; confirm during plan 1.
- OQ-6: Level gating of lots/illustrations is Phase 9; until then all show.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-11-06 (gsd-ui-checker: 0 BLOCK; FLAGs addressed: unsourced stat, imperative copy, danger use, chart contrast, stepper scaling, load/offline states; spacing/type FLAGs accepted as the app's locked tokens)
