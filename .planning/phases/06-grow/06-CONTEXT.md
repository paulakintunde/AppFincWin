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

</deferred>

---

*Phase: 06-grow*
*Context gathered: 2026-11-06*
