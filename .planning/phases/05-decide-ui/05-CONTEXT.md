# Phase 5: Decide UI - Context

**Gathered:** 2026-10-15
**Status:** Expanded 2026-10-15 with D-24…D-37; D-38…D-44 from the planning review; D-45…D-52 aligned 2026-10-16 to the executed Phase 4 (no new scope); D-53…D-56 user decisions the same day; D-66…D-69 user decisions 2026-10-21/22; D-70…D-78 the Decide UX refresh 2026-10-22; D-79…D-84 the Step 2, item and invest refresh the same day; D-85…D-93 the device-walkthrough refinements 2026-10-23. The UI-SPEC carries all of them.

<domain>
## Phase Boundary

The Decide tab and everything that feeds or follows a check:
- the quick check, a one-line answer from an item and a price (DCU-01);
- the five-step check: item → price and payment → impact → alternatives → decision (DCU-02);
- open checks, recomputed live and abandonable (DCU-03, DCU-04);
- the alternatives table with suppression (DCU-05, DCU-06);
- recording a decision, and estimate-vs-actual (DCU-07);
- the date picker that refuses past dates (DCU-08);
- the no-advice copy rule (DCU-09);
- the first read in onboarding (DCU-10);
- demo-account screenshot readiness (DCU-11);
- analytics with no amounts (ANL-06).

Phase 5 also builds, outside `src/engine/`, the **snapshot builder** that queries Supabase and calls the Phase 4 engine. It maps engine codes to i18n copy, and it stores checks, limits and decisions.

Requirements: DCU-01…DCU-11, ANL-06.

Not in this phase:
- the engine maths (Phase 4);
- household members and the split UI's data model (Phase 8);
- savings goals (Phase 6);
- real paywalls and tiers (Phase 9);
- level gating (Phase 9).

</domain>

<decisions>
## Implementation Decisions

Decision numbers are local to Phase 5. "04 D-xx" refers to `.planning/phases/04-decide-engine/04-CONTEXT.md`, and "03 D-xx" to the Shell context.

### Quick check and first read
- **D-01:** **With logged months, the quick check runs the full verdict as if paid in cash.** It calls the engine's `assess()` with the paid-in-full method and returns `fits`/`adjust`/`no`, including the cushion and the month. The result is one chip plus one line, so it can never disagree with the full check.
- **D-02:** **When cash doesn't cover it, the quick check states the gap and offers the full check.** For example: "Not from cash: $x short of your cushion", then "Run the full check", which carries the name and price into step 1. The prototype's hardcoded 9.4% / 48-month line is removed. No rate the user didn't enter is ever shown (04 D-07).
- **D-03:** **Phase 5 builds the onboarding first read, in the LAUNCH-POSITIONING order:** welcome → consent → one account and balance → **rough monthly in and out** (new) → **first check** (new) → "Bring your history" (import / fresh / sample). The two new steps slot into the existing `app/(app)/setup/*` routes after `SetupAccountScreen` and before `SetupHistoryScreen`. Target: a first verdict in about 60 seconds (success criterion 6). The first check uses the engine's `firstRead()` (04 DEC-16, amended 04 D-11: `adjust` when cash would fall below 3 × rough spending).
- **D-04:** **Real history replaces the rough figures automatically.** As soon as one full month exists (logged or imported), the rough figures stop being used, open checks recompute, and the verdict's basis line changes visibly, e.g. "Now from your logged months". Until then the rough figures are editable. A first-read verdict always says what it rests on, and that an import sharpens it.

- **D-23 (added 2026-10-15, user, supersedes D-21's "only when cash doesn't cover it" and refines D-01/D-02):** **Every quick check has four inputs, plus optional extras:**
  - **Amount.** The item and price, parsed from "car 14500" as before.
  - **Cash or Credit.** A two-way toggle. It starts on Cash.
  - **APR.** Credit only. Starts at 0%, labelled "before any interest" until the user types a rate (04 D-07: never a default rate).
  - **Duration.** Credit only. Chips for 12, 24, 36, 48 and 60 months; 12 is selected.
  - **Optional extras.** A collapsed "+ Tax, fees" row. Sales tax is a user-typed % with no default; fees are a user-typed amount. Both add to the day-one price.
  - Cash runs the paid-in-full plan. Credit runs the engine's loan plan (amortised at the entered APR, no deposit).
  - Both go through `assess()`, so the result is the full verdict chip plus one line, the D-22 size label, and the monthly amount for Credit.
  - When Cash doesn't cover the purchase, the result still states the gap and offers a one-tap "See it on credit", which flips the toggle and keeps the amount.
  - "Run the full check" carries every field into steps 1–2. Credit maps to the loan method, taxes and fees to the step-2 adjustments.
  - The first read in onboarding uses the same inputs, assessed by `firstRead()`.
- **D-21 (added 2026-10-15, amends D-02; superseded in part by D-23):** **When cash doesn't cover it, the quick check also shows an editable spread line.** It reads "Spread it: [APR 0%] over [12 / 24 / 36 / 48 / 60 months] → $x a month. The month closes / is $y short."
  - The APR field starts at 0% and is labelled "before any interest" until the user types a rate. That starting value is user-editable input, not a default rate the engine invents (04 D-07 holds).
  - The term chips are 12, 24, 36, 48 and 60 months, with 12 selected.
  - The result is computed by the engine's loan plan (amortised payment at the entered APR, no deposit). It is assessed through `assess()`, so it gets the same month, debt-service and unsecured-debt tests as the full check, and it recomputes on every edit.
  - At 0% it is an upper bound: if the month doesn't close at 0%, no rate will make it close.
  - "Run the full check" carries the APR and term into step 2's loan method.
  - The spread line is not shown when cash covers the purchase.
- **D-22 (added 2026-10-15):** **Every quick-check and full-check result carries a size label relative to the user's own money**, never a fixed dollar band. The engine returns it as a code (04 D-36):
  - `from_spare_this_month`: the price is no more than this month's money left over.
  - `from_savings`: paid from cash, it still stays above the cushion.
  - `needs_spreading`: cash can't cover it above the cushion.
  Phase 5 maps the codes to copy, e.g. "Out of this month's spare", "Out of savings", "Needs spreading".

### Verdict and impact screen
- **D-05:** **Step 3 puts the answer first.**
  - At the top: the verdict card (chip, basis line, title, body), then up to five warning cards ordered by shortfall. The verdict line must be visible without scrolling at the phone screenshot size (DCU-11).
  - Below, as collapsible sections, in the prototype's order:
    - the month line by line (Now/After);
    - where it lands (the five ledgers);
    - who pays what (household only);
    - against your lines;
    - if something goes wrong (runway plus setbacks);
    - what would make it work (the options list);
    - assumptions in play.
  - All prototype content is kept.
- **D-06:** **The D-35 "pause" case is an amber warning card that states the amount.** Chip: "Needs adjustment". The card reads like "The month closes only if $x a month of investing pauses" (or saving, or both). It is declarative and never "you should pause". It counts as one of the warnings.
- **D-07:** **Step 4's "If saved" column becomes "Kept".** At the 0% default return (04 D-06), it shows the money kept over N months. A "+ Add a rate" link lets the user enter their own return, and the column header then reads "Kept, at x%". The prototype's "keeps earning" framing is removed. Rows whose money isn't spare show "—" with an amber reason (DCU-06, from the engine's suppression codes).
- **D-08:** **Step navigation: steps become tappable once reached.** The five-segment bar jumps to any step already reached. Jumping forward to step 3 or later needs steps 1–2 complete (a price and a payment method). The step flow is a full-screen stack (03 D-12), and the FAB is hidden during it (03 D-09/D-10).

### The decision: what gets written
- **D-09:** **"Go ahead" writes pending entries, depending on the payment method, after one confirm.** All entries are listed under "What gets written" and are written in one confirmed action, which supports undo (02.x undo stack):
  - Cash: a pending expense dated on "When you need it".
  - Loan: a debt record (with `secured` set from the item, 04 DEC-11), plus a recurring payment series.
  - Instalment: a recurring series with a count.
  - Card: a pending expense on the card account.
  - Running costs: a recurring series.
  - Breaking a line is allowed, and the record notes it ("This breaks a line you set. You can still log it — the record notes it.").
- **D-10:** **"Wait and save" saves the decision with a monthly saving amount and a ready-by date.** A local notification on that date reopens the check, recomputed. No goal object is created. Phase 6's goals may adopt these later.
- **D-11:** **"Pass" keeps the decision in Past decisions until the user deletes it.** It keeps its "why", sends no reminders, and can be reopened as a new check. This replaces the prototype's conflicting "filed for twelve months" / "kept until" copy.
- **D-12:** **Estimate-vs-actual compares the estimate with the sum of the decision's linked lines, at 30 and 90 days.** Linked lines are the lines Go ahead wrote, plus any the user attaches to the decision. The comparison covers the day-one cost and the monthly cost (payment plus running costs), as numbers only, and needs no new data entry. The prototype's version is static seed data; this replaces it.
- **D-13:** **Dates use the existing native `DateField`** (`minDate` = today, so past dates are refused), with quick-offset chips above it: "In a week", "In a month", "In 3 months" (DCU-08). There is no custom month grid.

### Storage and recompute
- **D-14:** **The "Lines you will not cross" limits are stored once per user and apply to every check.** They are edited on the Decide home screen. A blank line uses the engine default (04 D-01…D-05). Open checks are always judged against the current lines.
- **D-15:** **Open-check verdicts are recomputed live from the current snapshot every time they're shown, and are never stored.** The engine is pure and fast. The last state the user saw is stored only so the chip can mark "changed since you last looked". This settles the open-check recompute question that 04 D-30 left to Phase 5.

### Free/Pro, demo account and screenshots
- **D-16:** **Each Pro-candidate feature goes through one `canUse(feature)` entitlement hook, which returns true for every feature for now** (PRICING §186). The Pro candidates are: more than one open check, setbacks, the decision journal with estimate-vs-actual, and card/loan payoff comparisons. Phase 9 switches them on without touching the screens.
- **D-17:** **The alternatives table is free.** It is the ethical core of Decide (DCU-06) and a store promise ("Cheaper, later, or skip it"), and it appears in screenshot 3. This amends `.planning/research/PRICING.md` §2 (the alternatives table moves from Pro to Free). Phase 9 must take this as an input.
- **D-18:** **Phase 5 builds the scope toggle and split-override UI, shown only when the household has more than one member.** Until Phase 8 that means the toggle is always hidden. The demo scenario and screenshots run in personal scope. Household screenshots are redone after Phase 8.
- **D-19:** **The demo scenario uses two checks, sofa then car:**
  - Screenshot 1: a sofa at $1,800 → "It fits".
  - Screenshot 2: a car at $14,500 on a loan → "Needs adjustment", showing what breaks.
  - Screenshot 3: the car's four alternatives.
  - The data is seeded as the demo account's sample months plus these two open checks, so nothing is staged outside the real app (success criterion 7). The loan's APR is part of the seeded check, typed in as a user would; it is never a default.

### Analytics
- **D-20:** **ANL-06 events cover lifecycle and verdict state only:**
  - `quick_check_run` (state)
  - `check_started`
  - `check_step_viewed` (step number)
  - `check_completed` (state)
  - `check_abandoned`
  - `decision_recorded` (go / wait / pass)
  - `first_read_shown` (state)
  Only enums are sent, never amounts or item names. The existing catalogue guard in `src/services/analytics/catalogue.ts` enforces this.

### Copy (carried and bound)
- All copy lives in `src/i18n/locales/en.ts` and is marked as draft in `copyStatus.ts`. The engine's codes (04 D-21) map to catalogue keys. A test asserts that no Decide key contains "advice", "recommend" or "you should" (DCU-09). The voice is declarative, not prescriptive. Verdict strings are ported from the prototype (HTML 4476–4512) with typographic apostrophes, minus any that imply a rate the user didn't enter.
- Haptics fire on the verdict reveal and on committing a decision (BUILD-PROMPT §155), using `notificationAsync`/`impactAsync` only.
- No review prompt after a "You cannot afford this" verdict (LAUNCH §4).

### Engine depth expansion: UI side (added 2026-10-15; user chose to fold everything into Phases 4 and 5)

Engine decisions are 04 D-41…D-58. These are the Phase 5 UI and data counterparts.
- **D-24: Combined checks.** With 2 or more open checks, the check screen and the quick check show a "With my other open checks" toggle, on by default. The verdict shows the combined position. When the standalone and combined verdicts differ, one line says so: "Fits on its own; not with your other 1 open check".
- **D-25: Unsteady-income cushion and edge.** The cushion line in "Against your lines" shows how many months it uses and why ("6 months, because your income is volatile"). The "on the edge" flag shows as a small amber tag on the chip with the margin, e.g. "on the edge: the cushion holds by $120".
- **D-26: Cash path.** Step 3 gets a "Day by day, next 90 days" section: a simple line chart (react-native-svg, §2 tokens only) of the two paths, with the lowest day marked. The `cash_dip` warning card names the date. When there are no confirmed pay series, the section says "Add your pay as a recurring series to see day-by-day cash".
- **D-27: Future changes.** A "Changes coming up" list on the Decide home screen holds the user's dated changes (income or spending, amount, start, optional end; add, edit, remove). The verdict shows the worst-month line when it differs ("Fits now; from June the month is $90 short"). Changes are stored per user.
- **D-28: Confidence chip.** Every verdict shows strong / fair / rough beside the basis line, and tapping it shows the reasons.
- **D-29: One-off lines.** Record's line detail gets a "One-off, won't recur" toggle (a new field on rows). The verdict's basis line shows "1 one-off left out" when any are excluded. This touches Record's row editor, and the field must be included in the snapshot.
- **D-30: Credit terms in step 2.**
  - **Loan and card:** an optional "Promotional rate" (rate, months, then the rate after). The engine never pre-fills it.
  - **Variable rate:** a toggle, with the stress results shown as "At +2 points: $x a month; at +4: $y".
  - **Instalments:** an optional late fee, with "If 1 payment is late: +$x".
  - The quick check (D-23) stays simple. It has no promo, variable or fee inputs; those live in the full check.
- **D-31: Investment views (step 4).** A new "If it went into investing instead" section with the four views:
  - price invested;
  - payments invested;
  - investing growth lost to a pause;
  - a net-worth path chart, with and without the purchase.
  - **Rates:** each view is shown at 0% plus up to three rates the user adds ("+ Add a rate", max 3). Every figure carries "A projection at the rate you entered, not a forecast". The app never suggests a rate.
  - **Copy:** declarative only, never "you should invest".
  - **Horizon:** a chip row, defaulting to the plan term (or 60 months for cash).
- **D-32: Income impact.**
  - Step 1 gets an optional "Does this change your income?" with these fields:
    - raises or lowers;
    - amount a month;
    - start date;
    - likely or uncertain.
  - **Lowering:** feeds the verdict.
  - **Raising:** shows a separate card: "With the expected $400 a month (uncertain): fits, pays for itself in 31 months". The main verdict never changes because of it.
  - **Setbacks:** step 3's setbacks section shows the runway lost because of the purchase, and which setbacks the new payments can't survive.
- **D-33: Running-cost prompts.** Step 2's "Costs that follow it" pre-lists the categories for the item type, with blank amounts (e.g. vehicle: insurance, fuel, maintenance, registration, loss of value). Loss of value is shown as "not a monthly cash cost".
- **D-34: Minimal savings goal** (amends D-10). "Wait and save" creates a goal row with:
  - the target (04 D-40);
  - the monthly amount;
  - the ready-by date;
  - saved-so-far, from transfers the user tags to the goal.
  It gets a progress bar in Past decisions and on the check. Phase 6 builds goals on this same table and does not replace it.
- **D-35: Cooling-off.** For `needs_spreading` purchases (D-22), step 5 offers an optional "Check again in 48 hours" toggle, off by default. When it's on, a local notification reopens the check, recomputed. The reminder text carries no amount or item name.
- **D-36: Learning from history.** Once 3 or more decisions have actuals, step 2 shows the estimate gap beside running costs and the payment ("Your running costs have come in about 20% higher than estimated"). The copy is declarative.
- **D-37: Currency conversion.** The snapshot builder converts every account, line and debt into the check's home currency at the latest stored rate (Phase 1 `engine/money/rates.ts`) before calling the engine. The basis line says "Includes amounts converted from EUR at 1.47 on 14 Oct". If a needed rate is missing, the result is `missing` with a reason, never a guessed rate.

- **D-24 amended (user, 2026-10-15): every open check is judged with all the others** (04 D-41 amended), so the sofa can read "Fits on its own; not with your other 1 open check". The combined toggle is remembered per check. **Demo frame 1** is captured on the sofa check with "With my other open checks" switched off. That is a real user setting, so nothing is staged. Frames 2–3 (car) use the combined position.
- **Cushion for new users (04 D-42 amended):** under 3 full months the cushion row reads "3 months — your income steadiness isn't known yet", and the confidence chip shows "Rough".
- **One card per cause (04 D-24/D-44 amended):** with a cash path, bills due soon appear only as the `cash_dip` card, and the cash-cushion card covers the day-one cost alone.

### Planning-review decisions (user, 2026-10-15, after the 52-plan Phase 5 plan)
- **D-38: Minimal `debts` table and a `statement_periods` table in Phase 5.** Debts carry balance, APR, `secured`, minimum terms and a "paid in full monthly" flag. Statement periods let imports mark complete months (04 D-13). Phase 6's payoff planner builds on the same debts table.
- **D-39: Currency stamping** (amends D-37). Past lines (income, spending, refunds) are converted at the rate **stamped on each line when it was recorded**. Current balances and debts use the **latest** stored rate. A missing rate still gives `missing` with a reason.
- **D-40: Card minimum payments are pre-filled from the per-market table** (04 D-05/D-16; e.g. US 1% + interest, $25 floor) on each card debt. They're shown and editable on the debt, and the month counts that minimum. A card marked "paid in full monthly" adds no minimum. A card with no terms and no market row shows "Minimum payment not set", and the verdict notes that card payments aren't counted until it's set.
- **D-41: Store screenshots (success criterion 7) come from the sample-seeded account** (the same seed path as "Explore with sample figures") until the App Review sign-in (ACC-11) exists.
- **D-42: A deferred-interest toggle** on step 2's promotional-rate row. When it's on, the verdict shows the back-interest charged if the balance isn't cleared by the promo end (04 D-48, `deferred_interest_charged`).
- **D-43: The UI-SPEC touch-ups are applied as the planner resolved them** (05-PLANNING-NOTES OQ-A2/A3/A9 and the 7 recorded conflicts). The combine pill stays hidden with only 1 open check.

- **D-44 (user, 2026-10-15): the UI takes user-entered loss of value and holding fees** (04 D-63). Step 2's "Loss of value" prompt takes an amount or %/year, shown as "not a monthly cash cost". The investing views take an optional holding fee %/year. The card-costs tile sums the user's card terms. Requirement IDs DCU-12..DCU-24 now trace D-21..D-43.

### D-45+ (aligned 2026-10-16 to the executed Phase 4)
Phase 4 was executed, code-reviewed (`04-REVIEW.md`: 4 high, 5 medium, 5 low, all fixed) and verified on `phase/04-decide-engine`. These decisions record how Phase 5 follows the executed engine (`src/engine/decide`, `src/engine/payoff`, 04-PHASE5-ALIGNMENT "04-REVIEW fixes (2026-10-16)"). They add no product scope: each is the existing UI meeting a new engine fact. Where a Phase 5 plan and the engine code disagree, the code wins.
- **D-45: The term typed and the months paid are shown apart** (04 D-64, ME-03). Level payments round up to the cent, so `Plan.months` and `CardPlanDetail.payoffMonths` are the months actually paid and can be fewer than the term typed (`payment.termMonths`, `payoff.months`). Every term display shows the term typed; the payoff month is added only when it is earlier ("paid off in month {m}"). Go ahead writes from `Plan.paymentSteps` as before; the debt row keeps the term typed. The alternatives and investing horizons follow the engine's months paid.
- **D-46: A card minimum still open at the 600-month cap states what is still owed** (04 HI-02, 04 D-17). The engine returns `remainingAtCap` and no cleared total, interest, card costs or payoff month; the UI reads "Not within 50 years" with "Still owing {x} after 50 years at the minimum.", told apart from "Never" / "Endless" by `minimumOutcome`.
- **D-47: A projection too large to compute exactly reads "Too large to project at this rate"** (04 ME-01). Nullable `projected` / `growth` with `rangeCode: 'exceeds_range'` on RateFigure, do_without, AlternativeRow and NetWorthPath points; a null is never shown as 0, and the charts skip null points.
- **D-48: Projection-rate fields are bounded at 100% a year** (04 `MAX_PROJECTION_RATE`, `projection_rate_out_of_range`). The fields refuse more with "Up to 100% a year"; stored rates above it are dropped by the parser; the code still has a title.
- **D-49: Instalment terms follow the engine** (04 ME-02, LO-05, HI-03). On-the-day fees are paid on the day and the instalments cover the rest; amount × count below that is `instalment_total_below_price`, shown as "Below the price" with a note asking for the amount or the count; "Use this price" and "Use the cheaper price" rescale an instalment plan with the engine's own `withPrice` (and the cheaper row's loan deposit as the cheaper row does), so the rescored check is the one shown.
- **D-50: No money in reads as such** (04 ME-05, LO-01). With an income basis of 0 any debt payment breaches the debt line and the ratio is null, so every dsr surface uses no-money-in wording; an all-zero-income history is Volatile and Your month says no money in is logged.
- **D-51: The snapshot builder never passes a limit the engine refuses** (04 LO-03). Negative, fractional or unparsable stored limits become null (the default) before `prepareContext`, counted internally; one-off refunds netting against one-off spending (LO-02) and on-the-day fees clamped to the price (LO-04) need no UI change.
- **D-52: "Left when it ends" comes from the engine's own schedule.** The UI-SPEC's promotion tile has no field on `PromoOutcome`; 05-07 reads the balance at the promotion end from the payoff barrel's `amortiseSchedule` / `simulateMinimumSchedule` with `rateScheduleFor`, exactly as the engine's plan builds it. `paymentToClearInPromo` (now rounded up) is shown by D-53.

### User decisions (2026-10-16, after the alignment review)
- **D-53: A "To clear it inside the promotion: {x} a month" tile on step 2.** Shown only when a promotion is entered and scored, from the engine's `promo.paymentToClearInPromo` (rounded up, so paying it for the promotion's months clears the balance and no interest is charged back). A figure, not an instruction.
- **D-54: Monthly payments show cents.** Monthly payments, instalments and promotion payments show cents everywhere; large totals and balances stay whole units (amends UI-SPEC assumption 12). The fold budgets still hold.
- **D-55: Every missing-state title is at most 64 characters**, like every other verdict title, so none clamps at 402 wide; the catalogue test asserts it.
- **D-56: Live recompute is debounced for the details.** The verdict, warnings, step 2 method cards and quick-check result recompute on every keystroke; the step 3 sections, step 4 and the investing views recompute about 150 ms after typing stops. If the device check (05-26 step 13) still shows lag, step 4 and the investing views compute only while visible (05-30 Task 2, conditional).
- **D-66 (user, 2026-10-21): Go ahead's day-one lump is a one-off** (amends D-09, applies D-29; review WR-A06). The pending line Go ahead writes for the day-one purchase (cash, a loan or instalment deposit, the amount put on the card and the card remainder or fees paid in cash) carries `one_off = true`, so once its month is a full month it stays out of the spending averages every later check uses. The investment lump written as a plain outflow (no tracked account to transfer into) is the same kind of one-time line and is flagged too. Running costs and payment series stay regular, as does a one-month payment row (role `payment`); a lump into a tracked investment account is a transfer, which the averages already leave out. Pinned by the builder test "D-66 (WR-A06)".
- **D-67 (user, 2026-10-21): A check typed in a previous home currency is converted and noted** (amends D-37; review CR-C06, CR-B02; carries IN-A01). When a check's stamped `inputs.currency` differs from the snapshot (home) currency, every money amount in its inputs is converted at the latest STORED rate (the snapshot's own rates through `convertLatest`, never the FX fetch door) before anything is computed, and the check flow shows "Typed in {from}, shown in {to} at the latest stored rate." The flow shows and edits the converted amounts; each edit is converted back into the typed currency before it is saved, and an amount the edit did not change keeps its exact stored value. The stored stamp is never changed. A currency no stored rate converts gives the usual unconverted state (no figure, Go ahead and Wait unavailable, Missing terms on the home row, left out of other checks' stacks and counted). The same applies everywhere a check is computed: the check flow, the open-checks chips, the bought recompute and stacking. Seeded sample checks with no stamp read as USD (the demo seed's units), client-side, and are stamped USD on their first save. Pure helper `snapshot/checkCurrency.ts`; tests "D-67".
- **D-68 (user, 2026-10-22): A Debt-category one-off payment is a debt's minimum only when it is a transfer into that card or loan** (review WR-B03 remainder; replaces the "any debt recorded" and then "any minimum counted" heuristics). A Debt-category payment outside a series is left out of spending only when it is a transfer whose other leg lands in a tracked credit or loan account whose debt has a counted minimum (a derived card or loan debt keyed by the account, or a recorded loan naming the account, with `minimumPayment > 0`): that minimum already carries it. Every other Debt-category one-off stays spending, in the month lines, the expense lines and, when pending, the scheduled outflows: a payment that is not a transfer went to an account the app does not track, and a transfer into a card or loan with no counted minimum (paid in full, no terms, a loan with no minimum) is the only place that payment shows. A transfer leg in the history is never spending anyway (D-28), so the history rule reduces to "not a transfer, so spending"; the target match decides the pending one-offs. Tests "WR-B03 (D-68)" in `buildSnapshot.test.ts`.
- **D-69 (user, 2026-10-22): Provisional latest rate for a line whose own rate is pending** (amends D-37; builds on D-67). A past or pending transaction line saved while its rate was pending has no usable stamp (`orig_per_eur` null, `home_amount` null or in another home currency), so `homeAmountFor` returns null. Decide's snapshot builder no longer counts such a line as missing when a rate is stored: it converts it at the latest STORED rate for its original currency against home (`provisionalHomeAmount` in `snapshot/conversion.ts`, through `convertLatest`, so custom currencies resolve through their reference; never the FX fetch door) and flags it provisional. A currency with no stored rate at all is still missing (D-37 unchanged). The stamp always wins when it is usable; `homeAmountFor` is unchanged for Record, Activity and every other caller. The provisional figure is display and maths only and is never written anywhere; once the sweep stamps the real rate the next build reads the stamp. The snapshot carries `provisional { rowCount, rateDate }` (lines counted once, only when their month is used or the pending outflow is counted; rateDate is the earliest rate date used), shown as the declarative basis item "{{count}} line(s) converted at the {{date}} rate while its/their own rate(s) load" on Step 3 and in Assumptions. The engine gets a plain flag, `DecideSnapshot.provisionalRates`: `confidenceOf` then never returns strong (at most fair, "Medium"), adds the reason `provisional_rates`, and the confidence sheet lists "Some lines use the latest stored rate until their own rate arrives". Tests "D-69" (engine `deviations/d69-provisional-rates.test.ts`, `snapshot/__tests__/provisional.test.ts`, copy and Step 3).

### Decide UX refresh (user, 2026-10-22)
The UI-SPEC section "Decide UX refresh (2026-10-22)" carries the layouts, copy and checks; where it conflicts with an earlier UI-SPEC section, it wins.
- **D-70: Explanations open a small sheet, never a bubble.** A small ⓘ after a term opens the app's `Sheet` with the term, 1–3 plain declarative sentences and a "What this changes" line (e.g. "Replaces: ends this bill from the purchase date. Your income is unchanged."). There are no floating tooltips. The term list (31 keys, `INFO_TERMS`) and every explanation's copy are in UI-SPEC R3. The ⓘ is labelled "About {term}" with a 44pt target, and stays active on decided checks.
- **D-71: Variable inputs take a typed custom value.**
  - Every preset chip row gains a last "Custom" chip that opens an inline typed field with a range line.
  - **Every duration runs 1–120 months** (user, 2026-10-22): the quick-check duration, the loan term, the instalment count, card months, investment term, promotion length and the Wait period (new 3/6/12/24 chips). The old 600-month UI bound goes. A stored longer term shows under Custom with its range line until edited.
  - The investing horizon alone runs 1–600 months, because it is a projection horizon, not a borrowing term.
  - "Ready in N months" sets the Wait amount to target ÷ N, rounded up to the cent.
  - The Wait amount can be typed from ceil(target ÷ 120), rounded up to the cent, up to the target. Its slider is capped at min(2 × spare, target).
  - The Wait chip matching the derived months (3/6/12/24) is selected; otherwise Custom is selected and reads "{n} months".
  - Rates have no preset chips (04 D-07). The typed field is the custom input, bounded at 0–999.99% for APRs and 0–100% for projection rates and fees (D-48).
  - The deposit, Wait amount and cheaper-price sliders each get a tap-to-type money field beside them. A typed value is used exactly, never snapped.
  - An invalid entry is not applied, and the range line shows the bounds.
- **D-72: Empty Decide home cards stay hidden.** Open checks appears once a check is saved, and Changes coming up once a change exists. While there are no changes, one slim "+ Add a change coming up" row sits under the quick-check card. While Open checks is hidden, the same line carries a "Check an investment" link. Purchase checks start from the FAB, and investment checks from that link or the step 1 kind chip. The "No checks open" and "Nothing dated yet" empty blocks are retired.
- **D-73: Clear and Delete, each with Undo; Go ahead's lines are never deleted.**
  - "Clear" in the check header discards the current open check (a soft delete as one undo step, after flushing its pending edit), opens a fresh empty check, and toasts "Check cleared. Nothing was written." with Undo.
  - Saved checks are deleted from Open checks and Past decisions by swipe or the ⋯ menu → Delete, then a confirm sheet, then an Undo toast. This replaces the no-confirm "x" abandon (DCU-04's intent holds) and the word "Remove".
  - Deleting a decided check never removes or edits the lines Go ahead wrote or the transfers tagged to its goal, and the confirm sheet says so.
  - Changes coming up rows follow the same pattern (amended 2026-10-22): swipe or ⋯ → Delete, then a confirm, then the Undo toast "Change deleted". The "x" and the word "removed" are retired.
- **D-74: Step 3 is summary first.**
  - **The verdict card holds:** the state words as the heading, the old title as a one-line reason, and three key figures: Left a month, Cushion (engine `runwayMonths`, in months) and A month (net monthly cost).
  - **Below the card:** one list of folded rows, each a title, a one-line preview and a chevron, with only one open at a time. The rows are What breaks, The month, Cash path, Where it lands, Setbacks, Options, If invested (moved from step 4), With the expected income, Who pays what and Assumptions.
  - **Warnings and "Against your lines"** move into What breaks. It opens by default when warnings exist, so DCU-11 frame 2 still shows two full warnings. When nothing breaks, it starts folded with the preview "Nothing breaks".
  - "Left a month" is the amount left at month end after the purchase (user-confirmed).
- **D-75: Tap-to-reveal is signalled four ways.**
  - Every fold row has a chevron and a preview line.
  - Hidden parts of a block use "Show details" / "Hide details" text links.
  - A one-time hint, "Tap a row to see the detail", shows on the first verdict and is dismissed by the first fold or details tap. It is stored per user and per device in AsyncStorage (`fincwin:decide-hints:{userId}`).
  - Each reveal has a pressed state and a `selectionAsync` haptic (amends the "no haptic on section toggles" rule; `impactAsync` and `selectionAsync` only). A full swipe on a delete row keeps the shipped `hapticLight` (`impactAsync` Light).
- **D-76: No word ever breaks mid-word, overlaps, or is cut off in Decide.**
  - Android text uses `textBreakStrategy="simple"` and `android_hyphenationFrequency="none"`, set **app-wide** as defaults in the shared `src/ui/Text` (user, 2026-10-22).
  - Labels wrap at word boundaries, nothing that holds text has a fixed height, and rows grow with their content.
  - Only one-line money and count figures use `numberOfLines={1}` with `adjustsFontSizeToFit` (minimum scale 0.8). Word values ("Under 1 month", "Not limited", "None") wrap.
  - Chips wrap to new lines rather than squeezing.
  - Side-by-side text stacks below 360 wide, above 1.3x text, or for a value longer than 16 characters. "Where it lands" and "What gets written" use stacked label-over-value rows.
  - System-copy clamps are removed; the caps hold through copy length.
  - Every Decide screen is checked at 402×874 and 320 wide, at text scale 1.0 and 2.0.
- **D-77: The draft and save contract.**
  - **Saving:** a new check is created on its first edit. Later edits debounce 600 ms into the write queue. Leaving, unmounting and app backgrounding flush at once, and leaving never prompts.
  - **Indicator:** the header shows "Saved" / "Saving…" / "Offline, will save" / "Not saved" as its own small Text beside the "Step {n} of 5" eyebrow (never part of the eyebrow string). It is derived per check from the create and save mutations, the debounce and `useSyncStatus`.
  - **Clear:** flushes, then deletes, then disarms the draft so no later save targets the cleared check.
  - **Delete:** queued behind any save in `WRITE_SCOPE`. It never conflicts (WR-A03), and a save that arrives after it never undeletes and never records a failed write.
  - **Verification:** `useCheckDraft`, `useCreateCheck`, `useSaveCheckDraft`, `useAbandonCheck`, `useRemoveDecision`, the `setMutationDefaults` registration, `useSyncStatus` and the undo stack are checked by tests named "D-77".

- **D-78 (user, 2026-10-22): Decide home is trimmed too.** "The main page" means both step 3 (D-74) and Decide home. The home order is: quick check, the add-change row, Your month, Open checks, Changes coming up, Past decisions, Lines you will not cross, sources note.
  - **Quick-check card while idle:** only the amount pill. The Cash / Credit toggle appears once there is a result.
  - **Quick-check card with a result:** the size label is a plain line with an ⓘ. The "Worked out from the figures you entered." footer shows in Credit only, as the last line of the result block, so it never falls below the fold. One button row holds "Run the full check" and a "Clear" text button that resets the card with no toast.
  - **Past decisions:** one row ("Past decisions · {n} decisions"), hidden while there are none.
  - **Lines you will not cross:** one fold row with the preview "{n} of 5 set by you" or "All at their defaults".
  - See UI-SPEC R2b.

- **D-79 (user, 2026-10-22): Step 2 methods are an accordion in place.**
  - Each method (Paid in full, Deposit and loan, Instalment plan, On a card; investments: Lump sum, Monthly contribution) is a white card whose inputs and outputs (strip, payment, interest, implied rate) open directly under its own header, with a chevron. The opened card scrolls into view.
  - One card is open at a time. Tapping a folded card selects and opens it (user-confirmed). The selected card has an `ink` border and radio dot instead of an `ink` fill.
  - A card that cannot be scored shows a "Needs: {fields}" line under its name (replacing "Rate needed"). A folded card shows a one-line summary, e.g. "$2,000 down · 36 months · 6.9%".
  - The Price card and the "How you pay" header are rebuilt with ⓘ.
  - See UI-SPEC R15.1-R15.2.
- **D-80 (user, 2026-10-22): An instalment plan can carry a rate.**
  - An optional "Has a rate?" segmented control. **No** is the default and keeps today's behaviour: amount × count, no interest, the implied-rate note, "Below the price".
  - **Yes** takes the count (1–120) and a user-typed APR (0–999.99, never pre-filled, 04 D-07). The engine works out the payment: an annuity-due at APR ÷ 12 with the first payment on the day (D-49), rounded up to the cent, with the last payment adjusted.
  - A typed "Payment as quoted" overrides it for scoring (user-confirmed), with the note "The rate works out to {x} a month; the quote is {y}."
  - **"First payment: Today / In a month"** (user, 2026-10-22), default Today (D-49), with or without a rate. Today is an annuity-due with the first instalment on the day. In a month is an ordinary annuity: only on-the-day fees are paid on the day.
  - A late-fee ⓘ is added.
  - **Inputs:** `instalment { amount, count, lateFee, hasRate, aprText, firstPayment }`. Old checks default to `hasRate: false` and `'today'`. "Payment" and "Payment as quoted" share `amount`.
  - **Engine outputs:** "Below the price" applies whenever the total paid is under the amount financed, with or without a rate. `Plan.computedPayment` is present only with a rate. The new missing code is `instalment_rate_missing`.
  - **Needs Phase 4 engine change E1** (UI-SPEC R15.7: `amortise`, annuity-due = ordinary ÷ (1 + r), rounded up with a final-payment adjustment).
- **D-81 (user, 2026-10-22): Custom item type.**
  - Step 1's item type becomes chips with "Custom…", a typed name of 1–40 characters (e.g. "Drone") shown wherever the item type appears.
  - It follows General ("Other") rules for card eligibility, the secured default and running-cost prompts, unless an optional "Treat like" picks a built-in type's rules.
  - It is stored in the check inputs JSON as `customItemType { name, treatLike }`, with `itemType` holding the rules type. No migration and no engine change.
- **D-82 (user, 2026-10-22): Optional expected return on investment checks.**
  - "Expected return, % a year (optional)", 0–100, blank by default and never pre-filled, stored as `inputs.investReturnText`.
  - When set, step 2, the verdict card and the Assumptions fold show the projected value at the horizon (the term, or 60 months by default for a lump sum), labelled "Not a forecast".
  - It never changes whether the investment fits and does not feed the net-worth chart or the step 3 rate list. It uses the existing `futureValue`; no engine change.
  - The lump-sum horizon defaults to 60 months, with chips 1 / 5 / 10 / 20 years plus Custom (1–600 months) (user, 2026-10-22).
  - Step 3 fold 7 on investment checks is "What it could grow to": the projection when a return is set, otherwise the preview "No expected return set". The purchase views do not apply there (`investmentViews` is null).
- **D-83 (user, earlier 2026-10-22): The cheaper price is exact.**
  - A typed cheaper price on step 4 is applied as the exact amount, not the nearest whole percent. The slider still steps in 1%, and the percent shown is for display only.
  - A worked-out instalment payment is recomputed on the cheaper financed amount. Only typed figures (deposit, no-rate payment, quoted payment) scale by cheaper ÷ price, rounded half up.
  - The base is `advertised`, and the floor is ceil(30%) in minor units. `cheaperPrice` (minor units) replaces `cheaperRatioPercent`, with old percents converted on parse.
  - **Needs Phase 4 engine change E2** (UI-SPEC R15.7).
- **D-84 (user, 2026-10-22): Every Step 2 header and term has an ⓘ** (extends D-70). There are 24 new `INFO_TERMS` keys (UI-SPEC R15.8), and the existing promo, deferred-interest, variable-rate, card-minimum and running-cost keys are reused. All copy is declarative, at most 3 sentences, with "What this changes", and passes DCU-09 (no "offer", "apply", advice or reassurance).

### Device-walkthrough refinements (user, 2026-10-23)
UI-SPEC R16 carries the layouts, copy, ⓘ entries and engine notes (E3-E5).
- **D-85: Add is always reachable.**
  - The You screen gains a first "Add" group: Add expense, Add income, Transfer, Import statement, New check. It uses the shipped `SettingsGroup` and row styles.
  - Each row closes You, then runs the same handler as the FAB quick action with that `QuickActionId`. A row with no registered handler is not shown.
  - **FAB root cause:**
    - `fabSurface` treats a null navigation location under `(tabs)` as `tabRoot`;
    - a sheet-stack watchdog drops sheet ids whose sheet is no longer mounted, and clears the stack when nothing is visible for more than 1 s, so a leaked id cannot hide the FAB.
- **D-86: Interest saved by the deposit is explained.**
  - The Loan tile caption becomes "Interest saved by the deposit". It is hidden at deposit 0 and shown beside "Interest paid".
  - The inline line reads "{{saved}} less interest than borrowing the full {{price}} with no deposit. The deposit lowers the amount borrowed to {{financed}} over the same {{term}} months at {{apr}}%." (plural keys, no-break spaces).
  - A new ⓘ `interestSaved` explains it; it changes nothing in the verdict.
- **D-87: Running-cost rows show where the amount goes.** Every prompt row (insurance, maintenance, loss of value and the rest) has:
  - a dashed `line4` "Amount" field on the right;
  - "Counted once an amount is typed" under the name;
  - tap-anywhere-to-focus;
  - a checkbox only once an amount exists.

  The screen-reader label is declarative: "{name}, not counted yet; counted once an amount is typed."
- **D-88: Speed and sync.**
  - **Speed:**
    - one shared snapshot per source;
    - autosave patches only its own row (no cache churn), and `settledCore` reuses `core`;
    - full detail only for the selected method on a keystroke;
    - `computeDetails` runs after interactions, with "Updating" on the detail folds;
    - budgets on the Pixel: verdict under 50 ms, details under 300 ms.
  - **Sync:**
    - 15 s read and 20 s write timeouts through a custom fetch;
    - backoff capped at 12 s while online;
    - resume and retry on app focus and NetInfo change;
    - one queued draft save per check;
    - the post-restore invalidate does not wait for writes;
    - NetInfo reachability checks the Supabase endpoint.
  - **Sync line:** shown only for problems or writes older than 5 s: "Saving…" or "{{count}} changes waiting" ("offline · …" when offline). "queued" is retired.
- **D-89: Instalments can be weekly, every 2 weeks, monthly or quarterly** (no semi-monthly), with up to 500 payments (amends D-71's 1–120 for instalments only).
  - The verdict uses the monthly equivalent (×52/12, ×26/12, ×1/3), and the cash path uses the real dates.
  - Go ahead writes the series with that `freq` (no migration).
  - Copy: "{{count}} weekly payments of {{payment}}, about {{monthly}} a month".
  - Loans stay monthly.
  - **Engine change E3:** a periods-per-year `amortise`/`amortiseDue` and dated payment steps.
- **D-90: The no-rate instalment note shows a true APR.**
  - It is the nominal APR solved from the payments, count, frequency and timing by exact bigint bisection (no floats), labelled "worked out from the figures you typed".
  - It replaces the flat-rate note. It is a read-out only: it never fills a field or feeds the verdict (04 D-07).
  - **Engine change E4**, with full tests and 100% coverage.
- **D-91: A card check limit.** `CARD_MAX_PURCHASE` = 100,000 in the home currency.
  - Above it, the rest counts as cash on the day through the dealer-cap mechanism.
  - Note: "Only {{cap}} of this goes on a card in checks. The other {{rest}} is counted as cash on the day.", stated as the app's limit, not the issuer's.
  - **Engine change E5.**
- **D-92: Card rules by item type and region.**
  - New item types, all with suggest keywords, Step 1 chips, `treatLike` choices, running-cost prompts, copy and ⓘ updates:
    - `property`: card blocked, "A property purchase or deposit is not paid by card.";
    - `cash_equivalent`: card blocked;
    - `tuition`: card permitted with a fee note.
  - Tax is region-aware: GB blocked (HMRC, since 2018); US and CA permitted with a processing-fee note.
  - Research sources: Fannie Mae B3-4.3-16, HMRC, Experian / The Points Guy.
  - **Engine change E5.**
- **D-93: Walkthrough fixes.**
  - A tab root never shows a back button.
  - A cushion or runway above 600 months reads "Over 50 years" (a word value).
  - A new expense defaults to the selected account's own currency, or home when the account has none. The walkthrough's GBP case is a verify item.

### Claude's Discretion
- The snapshot builder's query shape and its TanStack Query keys, and how confirmed series, paid-only rows and refunds (04 D-23…D-28) are assembled.
- The table layout for checks, decisions and limits, with RLS per household or user, following the existing migration patterns.
- The exact copy wording, kept to the prototype's voice and DCU-09.
- How the quick check parses text ("car 14500"); port the prototype's parser.
- Item-type pre-fill from the item name (04 D-14 regex suggestion) in step 1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decide UI design source
- `FincWin United.dc.html`, the prototype:
  - 955–1070: Decide home (your month strip, quick check, open checks).
  - 1075–1391: the check flow, steps 1–5, and past decisions.
  - 1960–1990 and 4830–4851: the date picker and its offsets.
  - 4202–4787: Decide logic, verdict strings (4476–4512), warnings (4511–4553), options `adv` (4594–4630) and the alternatives table (4655–4704).
  - 3994–4010: the `DSB` setbacks and the `DSEED` decisions.
  - 6859–6867: FAB rules.
- `BUILD-PROMPT.md`: §2 design tokens (25–90), §4 Decide (178–212), §5 i18n (225–240), §7 copy compliance (289–310), §8 phase scope (326).

### Requirements, launch and pricing
- `.planning/REQUIREMENTS.md`: DCU-01…DCU-11 (204–214) and ANL-06 (59).
- `.planning/ROADMAP.md`: Phase 5 success criteria 1–7 and its launch inputs.
- `.planning/research/LAUNCH-POSITIONING.md` §4–§5: onboarding order, screenshots 1–3, captions, no review prompt after "no".
- `.planning/research/PRICING.md` §2 and §186: Free vs Pro (amended by D-17) and tier-agnostic gating.

### Binding prior decisions
- `.planning/phases/04-decide-engine/04-CONTEXT.md`: the engine contract. In particular D-07, D-11 (amended), D-14, D-15/D-34, D-21, D-23…D-35.
- `.planning/phases/03-shell/03-CONTEXT.md`: D-01…D-04 (Decide is the centre tab and is never hidden by levels), D-09…D-12 (FAB "New check", full-screen step flow), D-20…D-26 (accessibility, reduced motion, backdrop, discard confirm).
- `.planning/phases/02-record/02-CONTEXT.md`: D-22 (import as an optional onboarding step) and D-50 (transfers excluded from Decide totals).
- `.planning/PROJECT.md`: compliance voice, and the allow-listed App Review demo sign-in (line 151).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shell/tabBar/tabs.ts`, `availableTabs.ts` (`decide: false` → true), `TabGlyphs.tsx`: the Decide tab already exists, switched off.
- `src/shell/fab/FabProvider.tsx`, `quickActions.ts` (`newCheck`), `shouldHideFab.ts`: Decide registers "New check".
- `src/features/record/setup/` (`firstAccountGate.ts`, `SetupAccountScreen.tsx`, `SetupHistoryScreen.tsx`) and `app/(app)/setup/*`: where the D-03 steps go.
- `src/db/samples.ts` and `supabase/migrations/20261010000600_sample_data.sql`: sample-data seeding, to extend for the D-19 demo scenario.
- `src/ui/Sheet.tsx`, `ConfirmSheet.tsx`, `DetailSheet.tsx`, `SheetHeader.tsx`: sheets (RN Modal; `@gorhom/bottom-sheet` is not installed).
- `src/features/record/entry/pickers/DateField.tsx`: native date picker with `minDate`.
- `src/services/analytics/catalogue.ts` + `posthog.ts`: typed events with a no-amounts guard.
- `src/i18n/locales/en.ts`, `src/i18n/copyStatus.ts`: copy catalogue and draft tracking.
- `src/db/household.ts`: single household membership (no members yet).
- Phase 02.x undo stack: used by D-09 writes.

### Established Patterns
- Engine purity: Phase 5 code calls `src/engine/decide` through its public barrel only, and the snapshot builder lives outside `engine/`.
- TanStack Query persisted cache plus paused-mutation write queue for every Supabase write.
- Supabase-direct with RLS; migrations go through `npm run supabase:db:push` (production only).

### Integration Points
- Snapshot builder: accounts and balances, full-month flags (04 D-13), paid rows, refunds, confirmed recurring series, debts, cards, limits → engine snapshot.
- Go ahead writes into Record (rows, series, debts) through existing data-layer functions.
- The local notification for Wait uses `expo-notifications`.

</code_context>

<specifics>
## Specific Ideas

- The quick check is the public promise ("FincWin: Can I Afford It?"). It stays free and must answer in one line.
- The verdict must appear within 4 seconds of the store preview video (LAUNCH §5).
- Store captions: "Can I afford it? Ask first." / "See what breaks before you buy" / "Cheaper, later, or skip it".
- Phase 5 carries the roadmap's deepest design-iteration budget. Run `/gsd-ui-phase 5` before planning.

</specifics>

<deferred>
## Deferred Ideas

- Savings goals created by "Wait and save" → Phase 6 (Grow) may adopt Wait decisions.
- Household-scope screenshots and a 2-member demo → after Phase 8.
- Real Free/Pro enforcement and the paywall → Phase 9, with D-17 amending PRICING.
- Level gating of Decide sub-features → Phase 9 (03 D-03: the tab itself is never hidden).
- A province field so Quebec users get the CA-QC market row for card minimum terms. Region is only known at country level today, so Quebec users get the rest-of-Canada row with a note (05 D-40). Deferred 2026-10-16.
- A custom month-grid date picker → not planned. Revisit only if the native picker fails design review.

</deferred>

**Note (2026-10-16):** 04 D-65 — a zero investing floor means not set, so the investing margin never shows the On the edge tag at a zero floor (the demo scenario has `investing_floor` 0).

---

*Phase: 05-decide-ui*
*Context gathered: 2026-10-15*
