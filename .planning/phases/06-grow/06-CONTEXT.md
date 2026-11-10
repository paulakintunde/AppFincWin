# Phase 6: Grow - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can track savings goals (including the one safety net and locked goals), investments with hand-typed values and cost-basis lots, and debts with payoff strategies, against their real numbers. Grow owns three connection points that Decide reads (safety net, goal, debt) and they feed Decide's answers in this phase. Requirements GRW-01..GRW-11 plus the Decide fix plan items in the roadmap's success criteria 7-9 (ARC-13..16, FIN-16, APP-28, ENG-24, APP-30, BO-07 Grow part).

Owner context (2026-11-06): Decide is switched on for testers now (separate task: 05.4 merge, then DECIDE_OPEN/DECIDE_V3 on), with the new Decide design following later. Grow must not wait for 05.5 or the reading test; every day costs money.

</domain>

<decisions>
## Implementation Decisions

### Order against 05.5 (shared money model)
- **D-01:** Grow does not wait for 05.5. Grow's first wave writes the three connection points it owns (safety net, goal, debt) to the shape in DECIDE-FIX-PLAN §5 / BO-07, with their contract tests, before Grow's screens. The rest of 05.5 (old engine deletion, one month picture, one bill detector) runs alongside, not before. No double wiring: Decide reads Grow only through these connection points.
- **D-02:** Grow's data reaches Decide's answers in this phase (success criteria 7-9 stay in scope): goals, the safety net and debts feed the v3 engine as soon as Grow ships.
- **D-03:** One release to testers when goals, safety net, debts and investments are all done (not sliced).
- **D-04:** Design source is the clickable prototype's Grow screens G01..G12 and their spec (see canonical refs). They become the UI contract through /gsd-ui-phase 6; no separate boards are drawn.

### Safety net and locked goals
- **D-05:** A goal can be locked. Decide never spends the money already saved in a locked goal; the protected amount is the saved amount and grows as the goal fills ($300 saved of a $500 goal protects $300). Unlocked goals are spare money Decide may count, and the answer says so.
- **D-06:** The safety net stays separate from locked goals: one flagged emergency-fund goal (GRW-02) is the safety net. Answers name both: "Safety net $1,300 and locked goals $640 kept out".
- **D-07:** Migration: each tester's current safety net amount and lock state in `decide_settings` is copied into the flagged Grow goal automatically. The first time they open Grow they see "We moved your safety net here" with the figure to confirm or change. Decide's answers do not change until they change it. Decide's old settings copy is then removed so there is never a second number (ARC-13, FIN-16, APP-28).
- **D-08:** Taking money out of a locked goal or the safety net is allowed (it is their money); the sheet says what it changes in Decide ("Decide will count $200 less as kept safe"). Reaching a goal's target plays the one success moment (success haptic, per the app life plan).

### Investments
- **D-09:** Full cost-basis lots (buys, sells, dividends, fees; GRW-05/06) are built, but a holding starts simple: name, amount paid, value today. Lots appear only when the user opens "Add a buy / sale / dividend". Gain or loss per holding and in total.
- **D-10:** Generic account types in plain words: brokerage, retirement, pension, crypto, other. Region-specific tax wrappers (401(k), ISA, TFSA, RRSP) are deferred to region support.
- **D-11:** Decide never treats investments as money to spend on a purchase. The regular amount going in is a line you will not cross. Net worth includes investments.
- **D-12:** Market values are typed by hand with an as-of date shown wherever the value appears (GRW-10). After 30 days a quiet "Update value?" row appears on the holding and in Grow. No live prices.

### Debts, payoff and contributions
- **D-13:** Payoff strategies side by side with plain names: "Highest rate first" (avalanche) and "Smallest balance first" (snowball), each with payoff date and total interest, plus an extra-payment control. The user picks; FincWin never says which is better (compliance: no advice or recommendation wording).
- **D-14:** An automatic goal contribution (GRW-03) is a repeating transfer in Activity ("$50 a month to Lisbon"); when it happens the goal grows. Counted once (ARC-15), visible in records, read by Decide.
- **D-15:** Credit cards: ask whether the card is paid in full each month. Paid in full: no payoff plan, only the statement due day. Carried balance: rate, minimum and due day, and it joins the payoff plan (GRW-07, ENG-24 due day).
- **D-16:** "I sold what this paid for" (APP-30) is one sheet: sale amount and payoff amount; one save records the sale money in, the final loan payment out, and marks the debt paid off; any leftover shows where it went.

### Calculators (inside Grow)
- **D-17:** Goal calculator on each goal: "Save $X a month -> reach it by <date>" and "Reach it by <date> -> $X a month", the two moving together.
- **D-18:** Debt calculator: an extra payment control showing the new payoff date and interest saved (GRW-08/09).
- **D-19:** Growth illustration for savings and investments that have a rate (GRW-11 APY): "$200 a month at 4% for 10 years", clearly marked as an illustration, not a forecast.
- **D-20:** A calculator result can become the real plan with one tap ("Make this the plan"), after a confirm; nothing changes until then (life changes are user-led).
- **D-21 (owner amendment 2026-11-06, replaces the Phase 06.1 deferral):** The separate Calculators page is built in this phase as its own plan group and ships in the same release (D-03). It holds four calculators usable without any records: loan, savings, compound growth, and debt payoff (both orders side by side plus minimums only). Each shows the result and a "How it was worked out" box, and links to the record-based calculators (goal, debt extra payment, growth illustration). Reached from a "Tools · Calculators" row on Grow home, Debts and Investments. Maths reuses `src/engine/payoff/`; display rule: amounts round half up to the cent, except a "needed each month" amount rounds up so the goal is never a few cents short. Design: prototype screens GC01..GC40 (`design/calculators-screens.js`, maths `design/calc.js`, figures in `design/LEDGER.md` § Calculators). No Phase 06.1 is inserted.

### Owner answers to research questions (2026-11-06, before planning)
- **D-22 (Decide and unlocked goals):** D-05 stands: an unlocked goal's saved money counts as spare in Decide; locked goals and the safety net stay protected. Migration moves every existing goal across as **Locked**, so no tester's answer changes until they unlock a goal themselves. Existing approved right-answer cases must stay unchanged.
- **D-23 (new goals):** The create-goal sheet asks each time whether to keep this goal's money out of Decide (Locked) or not. No silent default. The safety net is always Locked.
- **D-24 (cost basis):** Average cost. Gain or loss is shown as a record, never as a tax figure.
- **D-25 (contributions):** A goal's monthly contribution appears as an **Expected** transfer line in Activity that the user confirms; confirming writes the paired legs. Nothing moves by itself. Implemented with `recurring_series.goal_id`.
- **D-26 (net worth):** Once a holding exists in an investment-kind account, net worth uses the holdings' values and leaves that account's balance out (no double counting).
- **D-27 (G10 "Your money rules"):** Built in Phase 6 from the prototype, using the existing lines store; no new table. Renamed from "Lines you will not cross" by the owner on 2026-11-06; each item is a "rule" ("Your rule is at most 36%", "Change a rule", "Save rule"). Decide uses the same name (06.1 D-19).
- **D-28 (card minimums):** Both. The user can type the statement minimum; when they do, the payoff plan uses it. When they don't, the app works one out from the balance (rule set by the planner from research, e.g. interest + 1% of balance with a floor) and labels it as an estimate the user can replace. Owner approved 2026-11-06: Decide keeps using the stored minimum in Phase 6 (no answer drift); the estimate is for Grow's payoff plan and labels only (see Deferred).
- **D-29 (use an existing goal as the safety net, owner 2026-11-06):** A goal's detail has "Use as my safety net". A confirm sheet states the Decide effect in plain words first (e.g. "This goal becomes Locked. Decide will keep its $800 out of spare money."). On confirm the goal becomes the safety net (is_safety_net, locked and protect all true) and keeps its saved amount, target and monthly amount/series. If a live safety net already exists, the two are swapped atomically: the old one becomes a normal goal and stays Locked. Exactly one live flagged goal per owner holds throughout. One save, one Undo restores both rows. Server path: `set_safety_net` RPC (plan 06-06); hook `useSetSafetyNet` (06-12); UI on goal detail (06-22).

### Claude's Discretion
- Empty states, first-run of Grow, and how Grow's setup steps moved from Decide (loans, saving, emergency, envelopes; ARC-16) are sequenced, following the prototype and the "ask, don't block" rule.
- Table and module structure, as long as engine purity holds (nothing in `engine/` imports db/state/services/ui/react), money is integer minor units, and engine coverage stays at 100%.
- Feature-level gating: lots and growth illustrations sit at higher levels per the prototype (Everything level for lots), but Phase 9 owns the level system; until then show everything to testers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` — Phase 6 goal, success criteria 1-9, dependencies (05.5 dependency relaxed by D-01)
- `.planning/REQUIREMENTS.md` — GRW-01..GRW-11
- `.planning/research/DECIDE-FIX-PLAN.md` §5 (how the features connect), BO-07 (six connection points, Grow owns goal, safety net, debt), the Grow bucket items (ARC-13..16, FIN-16, APP-28, ENG-24, APP-30), and the safety net defaults
- `.planning/PROJECT.md` — compliance wording, money and engine rules

### Design (from the owner's clickable prototype, 2026-11-06)
- Prototype: https://claude.ai/artifact/Jr7VLAStJiDuPxte9vsSgR (Grow tab, screens G01..G12 and sheets G03a..G12c)
- Spec: `.planning/phases/06-grow/design/areas-spec.md` (Grow section; copied from the prototype's spec) and `.planning/phases/06-grow/design/LEDGER.md` (example numbers the screens use, incl. § Calculators)
- Screen sources: `design/grow-screens.js` (G01..G12 and sheets, as built in the prototype) and `design/calculators-screens.js` (GC01..GC40 and the calculator rows patched into G01, G03, G07, G08, G10); maths `design/calc.js`

### Prior phase decisions that apply
- `.planning/phases/05.4-decide-safety-patch/` (on branch phase/05.4-decide-safety-patch until merged) — safety net protected by default, about 1 month of essential costs, can be switched off or resized
- `.planning/phases/05.2-decide-data-and-setup/` — `decide_settings` columns (reserve_account_id, reserve_goal, rough_saving, rough_debt) that D-07 migrates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engine/payoff/` (amortise, simulateMinimum, futureValue, futureValuePath, impliedApr, rateSchedule): payoff dates, total interest, extra-payment effects and growth illustrations (D-13, D-17..D-19). At 100% coverage.
- `src/engine/recurring/` and `src/engine/transfer/`: repeating transfers for goal contributions (D-14).
- `supabase/migrations/20261024000100_pots_and_debt_housing.sql`: existing `debts` and pots tables to extend rather than duplicate.
- `supabase/migrations/20261028000100_decide_settings_v3.sql`: the safety net fields to migrate (D-07).
- The app's Sheet (`src/ui/Sheet.tsx`), tab shell and bespoke glyphs from Phase 3.

### Established Patterns
- Engine purity enforced by lint and CI; integer minor units; TanStack Query reads with the paused-mutation write queue; production schema pushes are human-gated (`npm run supabase:db:push` with preflight).
- Decide v3 reads inputs through its snapshot builder; Grow data enters only via the connection points (D-01).

### Integration Points
- Grow tab route (no Grow screen exists yet in `app/(app)/(tabs)/`).
- Decide v3 engine inputs (safety net, locked goals, debts with due day and minimum).
- Activity: repeating transfers for contributions; sale and final-payment lines for D-16.

</code_context>

<specifics>
## Specific Ideas

- Owner's own idea: locked savings goals whose saved money counts as protected as the goal grows (D-05).
- Calculators the owner wants: goal, debt extra payment, growth illustration (inside Grow), plus a separate Calculators page (in this phase, D-21).
- Example figures for screens come from the prototype ledger: safety net $1,300 of $2,300 (locked), Lisbon $640 of $1,800 at $50 a month, Laptop goal linked to a check, investing $7,690 with $200 a month, auto loan $8,420 at $312 a month (10% of pay).

</specifics>

<deferred>
## Deferred Ideas

- ~~Separate Calculators page (Phase 06.1)~~: moved into this phase by D-21 (owner, 2026-11-06).
- Region-specific investment wrappers (401(k), ISA, TFSA, RRSP): with region support.
- Live market prices: out of v1 (GRW-10).
- Decide using the estimated card minimum for untyped cards — revisit with the next Decide phase. (D-28, owner approved 2026-11-06: in Phase 6 the estimate is used by Grow's payoff plan only; Decide keeps the stored minimum so no answer drifts.)

</deferred>

---

*Phase: 06-grow*
*Context gathered: 2026-11-06*

## Owner device-check feedback (2026-11-07, plan 06-20 Task 3)

Owner checked Grow on the Pixel 9 (dev client): "otherwise it looks mostly good", approved GL-01..GL-05, and asked for the changes below. Research: `06-UI-AUDIT-OWNER.md`, `06-CRUD-UX-RESEARCH.md`, `06-VISUAL-DEPTH-RESEARCH.md`.

- **D-30 Payoff plan reveal:** the debt payoff plan matches the prototype, and its three rows (Minimum only, Extra each month, Once, today) each open on tap (Option B in 06-UI-AUDIT-OWNER.md).
  - The open row holds its own control: a stepper, or $500 / $1,000 / $2,500 / Type chips.
  - It shows the debt-free date with the before value and how much sooner, and the interest with the before value and how much less.
  - The button follows the open row and names its start date.
  - Order columns (2+ debts) follow the stepper.
  - One debt shows the greyed order switch and one note.
  - Dates appear wherever a time is implied. Fixes from the audit: the stepper value is invisible, and "Use extra" ignores the selected row.
  - The same reveal appears on debt detail.
- **D-31 Visual depth, app-wide:**
  - `canvas` becomes #F6F4EE (the §2 `fill6` value).
  - One soft card shadow token goes on every card, Grow included, plus a light `edge` shadow for list-row cards.
  - A new `bodyStrong` (600) role is used for item names and row amounts in cards.
  - `inkFaint` text never sits on `canvas`.
  - CLAUDE.md's design-fidelity rule is amended to match (wording in 06-VISUAL-DEPTH-RESEARCH.md).
  - The Pixel text-fit matrix is re-run.
- **D-32 Grow editing:** all 10 improvements in 06-CRUD-UX-RESEARCH.md go into Phase 6:
  - edit or remove an investment entry;
  - edit a holding;
  - stop a debt's extra payment;
  - past payments on debt detail;
  - tapping a goal or safety-net history row;
  - "1 to confirm" badges and a one-tap Confirm;
  - swipe and ⋯ (more) row actions;
  - change the safety net's account, and a way into the account rate (APY);
  - one remove style and one header Edit style, plus the missing empty-state buttons;
  - "+ Add" rows inside the lists, and "Change in the payoff plan" opening the Debts segment.

  Also:
  - Check that Activity's "Mark paid" on a goal's Expected line goes through the same confirm path as Grow, so the two cannot disagree.
  - Fix the audit bug where a net made in the app (or a goal turned into the net) starts unconfirmed and wrongly shows "We moved your safety net here".
  - The hero label reads "Saved across N goals and the safety net" when the net is counted.
- **D-33 One-off debt payment:** "Once, today" is both a what-if and savable. "Use $1,000 once" records a one-off Expected payment. This needs a new RPC (new migration) and a second owner-approved production push, with the same stop rules as 06-11. The engine's multi-debt strategy gains a lump option, with 100% coverage.
- **D-34 (owner, 2026-11-07):**
  - The planner's payoff rules stand:
    - with 2+ debts and no order picked, the rows prompt for an order;
    - the extra goes to the debt that already has one, otherwise to the first debt in the chosen order;
    - a one-off goes to the first debt in the chosen order, capped at its balance, and stays Expected until paid.
  - "Add money" on goals and the safety net is an outline button.
  - Debt rows show their payoff end date ("· ends Sep 2041"), added to 06-35.
- **D-35 (owner, 2026-11-10): a one-off debt payment counts as a debt payment in Decide.** A line with `transactions.debt_id` is money out once, the same as a regular debt payment. It is never ordinary spending and never counts against a category limit. Raised by 06-30: Decide's month builder only treated transfers into loan or card accounts as debt payments, so one-off lines landed in spending. The change and its test go into 06-37.
- **D-36 (owner, 2026-11-10): "We moved your safety net here" is app-only.** The sheet shows only for a net that existed before the Grow update: it was moved from Decide's settings by migration 20261106000200, pushed 2026-11-07T04:03Z. A net created in the app afterwards never shows it, even with `net_confirmed_at` null. No migration and no third production push. Raised by 06-32: `save_goal_plan` does not set `net_confirmed_at` on insert. Goes into 06-37.
- **D-37 (owner, 2026-11-10), three answers to questions 06-35 raised:**
  - **No order picked yet (2+ debts).** The hero and the card's top line show the later of the two orders' minimum-only debt-free dates, so no order is picked for the user. The rows still prompt for an order.
  - **An extra saved before payoff orders existed.** Each debt's end date assumes highest rate first until an order is picked.
  - **Row word.** The swipe and ⋯ menus on Grow rows (goals, holdings and debts) say "Remove", matching their confirm sheets. This goes into 06-37.
- **D-38 (owner, 2026-11-10), two answers to questions 06-36 raised:**
  - **"See all in Activity"** on a debt's detail screen opens Activity filtered to that debt's lines (`debt_id`, its payment series and its extra series). This needs a small Activity route parameter and goes into 06-37.
  - **A manual debt with no recorded lines** keeps its computed next due payment as a plain Expected row, as built.
