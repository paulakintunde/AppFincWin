# Phase 6: Grow - Research

**Researched:** 2026-11-06
**Domain:** Savings goals and safety net, investment holdings with cost-basis lots, debt payoff (avalanche/snowball), calculators, and the three Grow-to-Decide connection points (BO-07)
**Confidence:** HIGH on codebase facts (all read in this worktree), MEDIUM on the cost-basis and contribution design (two real decisions are open for the owner)

## Questions for the owner (ask before building)

Plain English, grade-10 level. Each has a default the planner can use if the owner says "your call".

1. **Unlocked goals and Decide.** Today Decide keeps every goal's money out of its answers except for the goal that the purchase is for. The new rule (D-05) says an unlocked goal is "spare money Decide may count". That makes Decide's answers more generous than they are now for testers who already have goals. Do you want that change? *Default: yes, as D-05 is written, but every goal that exists today is moved across as Locked, so no tester's answer changes until they unlock something.*
2. **New goals: locked or unlocked to start?** *Default: unlocked for new goals, with the "Lock this goal" switch on step 3 and a short line under it saying what it does. The safety net is always locked.*
3. **Selling part of an investment: which cost counts as paid?** When someone bought a fund in three batches and sells some, the app has to decide what the sold part cost. Two plain options: "Average cost" (add up everything paid, divide by units held) or "Oldest bought first". *Default: average cost. It works in every country and needs no tax rules. We say it is a record of gain or loss, not a tax figure.*
4. **Automatic goal contributions: does money move by itself?** The prototype says "$50 on the 15th, recorded for you to confirm". D-14 says it is a repeating transfer. *Default: each month an "Expected" line appears in Activity and the goal grows when the user confirms it (matches the prototype and "the app suggests, never auto-applies").*
5. **Investments the user already added as an "investment" account.** Accounts can already be of kind Investment. Holdings are a new thing. To avoid counting the same money twice in net worth, do you want holdings to stand alone and net worth to count holdings only, with investment-kind account balances left out of net worth? *Default: yes, holdings stand alone; an investment-kind account's own balance stays visible on the Accounts screen but is not added to net worth once a holding exists.*
6. **"Your money rules" screen (G10).** It is in the prototype but not in GRW-01..11. Decide already stores lines (debt share, investing at least, saving at least) in its settings. Is the screen in Phase 6, or does Decide keep owning it until 08.1? *Default: in Phase 6, as a screen that reads and writes the existing lines store (no new table).*
7. **Cards that carry a balance: minimum.** For the payoff plan, use the minimum amount the user types (fixed), not a percent-of-balance rule. *Default: fixed typed minimum. The percent rule stays in Decide's card check.*

Non-owner details the planner can settle: snowball ordering uses the original balance as in the prototype (the LEDGER numbers depend on it); the Lottie question (OQ-3) defaults to an SVG tick.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Grow does not wait for 05.5. Grow's first wave writes the three connection points it owns (safety net, goal, debt) to the shape in DECIDE-FIX-PLAN §5 / BO-07, with their contract tests, before Grow's screens. The rest of 05.5 (old engine deletion, one month picture, one bill detector) runs alongside, not before. No double wiring: Decide reads Grow only through these connection points.
- **D-02:** Grow's data reaches Decide's answers in this phase (success criteria 7-9 stay in scope): goals, the safety net and debts feed the v3 engine as soon as Grow ships.
- **D-03:** One release to testers when goals, safety net, debts and investments are all done (not sliced).
- **D-04:** Design source is the clickable prototype's Grow screens G01..G12 and their spec. They become the UI contract through /gsd-ui-phase 6; no separate boards are drawn.
- **D-05:** A goal can be locked. Decide never spends the money already saved in a locked goal; the protected amount is the saved amount and grows as the goal fills ($300 saved of a $500 goal protects $300). Unlocked goals are spare money Decide may count, and the answer says so.
- **D-06:** The safety net stays separate from locked goals: one flagged emergency-fund goal (GRW-02) is the safety net. Answers name both: "Safety net $1,300 and locked goals $640 kept out".
- **D-07:** Migration: each tester's current safety net amount and lock state in `decide_settings` is copied into the flagged Grow goal automatically. The first time they open Grow they see "We moved your safety net here" with the figure to confirm or change. Decide's answers do not change until they change it. Decide's old settings copy is then removed so there is never a second number (ARC-13, FIN-16, APP-28).
- **D-08:** Taking money out of a locked goal or the safety net is allowed (it is their money); the sheet says what it changes in Decide ("Decide will count $200 less as kept safe"). Reaching a goal's target plays the one success moment (success haptic, per the app life plan).
- **D-09:** Full cost-basis lots (buys, sells, dividends, fees; GRW-05/06) are built, but a holding starts simple: name, amount paid, value today. Lots appear only when the user opens "Add a buy / sale / dividend". Gain or loss per holding and in total.
- **D-10:** Generic account types in plain words: brokerage, retirement, pension, crypto, other. Region-specific tax wrappers (401(k), ISA, TFSA, RRSP) are deferred to region support.
- **D-11:** Decide never treats investments as money to spend on a purchase. The regular amount going in is a line you will not cross. Net worth includes investments.
- **D-12:** Market values are typed by hand with an as-of date shown wherever the value appears (GRW-10). After 30 days a quiet "Update value?" row appears on the holding and in Grow. No live prices.
- **D-13:** Payoff strategies side by side with plain names: "Highest rate first" (avalanche) and "Smallest balance first" (snowball), each with payoff date and total interest, plus an extra-payment control. The user picks; FincWin never says which is better (compliance: no advice or recommendation wording).
- **D-14:** An automatic goal contribution (GRW-03) is a repeating transfer in Activity ("$50 a month to Lisbon"); when it happens the goal grows. Counted once (ARC-15), visible in records, read by Decide.
- **D-15:** Credit cards: ask whether the card is paid in full each month. Paid in full: no payoff plan, only the statement due day. Carried balance: rate, minimum and due day, and it joins the payoff plan (GRW-07, ENG-24 due day).
- **D-16:** "I sold what this paid for" (APP-30) is one sheet: sale amount and payoff amount; one save records the sale money in, the final loan payment out, and marks the debt paid off; any leftover shows where it went.
- **D-17:** Goal calculator on each goal: "Save $X a month -> reach it by <date>" and "Reach it by <date> -> $X a month", the two moving together.
- **D-18:** Debt calculator: an extra payment control showing the new payoff date and interest saved (GRW-08/09).
- **D-19:** Growth illustration for savings and investments that have a rate (GRW-11 APY): "$200 a month at 4% for 10 years", clearly marked as an illustration, not a forecast.
- **D-20:** A calculator result can become the real plan with one tap ("Make this the plan"), after a confirm; nothing changes until then (life changes are user-led).
- **D-21 (owner amendment 2026-11-06, replaces the Phase 06.1 deferral):** The separate Calculators page is built in this phase as its own plan group and ships in the same release (D-03). It holds four calculators usable without any records: loan, savings, compound growth, and debt payoff (both orders side by side plus minimums only). Each shows the result and a "How it was worked out" box, and links to the record-based calculators (goal, debt extra payment, growth illustration). Reached from a "Tools · Calculators" row on Grow home, Debts and Investments. Maths reuses `src/engine/payoff/`; display rule: amounts round half up to the cent, except a "needed each month" amount rounds up so the goal is never a few cents short. Design: prototype screens GC01..GC40. No Phase 06.1 is inserted.

### Claude's Discretion
- Empty states, first-run of Grow, and how Grow's setup steps moved from Decide (loans, saving, emergency, envelopes; ARC-16) are sequenced, following the prototype and the "ask, don't block" rule.
- Table and module structure, as long as engine purity holds (nothing in `engine/` imports db/state/services/ui/react), money is integer minor units, and engine coverage stays at 100%.
- Feature-level gating: lots and growth illustrations sit at higher levels per the prototype (Everything level for lots), but Phase 9 owns the level system; until then show everything to testers.

### Deferred Ideas (OUT OF SCOPE)
- Separate Calculators page (Phase 06.1): moved into this phase by D-21.
- Region-specific investment wrappers (401(k), ISA, TFSA, RRSP): with region support.
- Live market prices: out of v1 (GRW-10).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRW-01 | Savings goal with target or open-ended | Extend existing `savings_goals` (already has nullable `target`, `monthly_amount`, `ready_by`, `opening_saved`, `bucket`, `account_id`); new `engine/grow/goalPlan` for the two-way calculator |
| GRW-02 | Exactly one emergency-fund goal | New `is_safety_net` column with a partial unique index (one live row per household/owner); connection point 3 |
| GRW-03 | Automatic contribution to a goal | New `recurring_series.goal_id` link + expected-line flow (Open question 4); counted once (ARC-15) |
| GRW-04 | Holdings across account types | New `holdings` table, generic type set (D-10) |
| GRW-05 | Cost-basis lots (buy, sell, dividend, fee) | New `holding_lots` table; pure `engine/grow/lots` (average cost default) |
| GRW-06 | Gain/loss per holding and total | Pure `engine/grow/gain`; realised vs unrealised |
| GRW-07 | Loans and revolving credit with balance, rate, minimum | Existing `debts` table already has all fields incl. `due_day`, `pays_in_full`; add `paid_off_at`/`link` fields as needed; Grow owns the forms (ARC-14) |
| GRW-08 | Avalanche vs snowball with optional extra | New `engine/payoff/strategies` (multi-debt, fixed budget, freed minimums roll over) |
| GRW-09 | Projected payoff date and total interest | Same module returns months, per-debt done month, interest; date helper in engine/time |
| GRW-10 | Hand-typed value with as-of date | `holdings.value` + `value_as_of`, history in `holding_values` (or lots of kind `value`) |
| GRW-11 | APY on savings/investments | `rate` text on holdings and on goals (optional); reuse `futureValuePath` for the illustration |
</phase_requirements>

## Summary

Most of the machinery Grow needs already exists and should be extended, not rebuilt. `savings_goals` already stores the goal shape (target, monthly amount, ready-by, opening saved, bucket, kept-in account) and Decide v3 already consumes goals as `Envelope[]`, the safety net as `SafetyNet`/`EmergencyFund`, and debts as `V3Debt[]` through `buildV3Inputs.ts`. `debts` already has balance, apr (text percent), minimum, term, `due_day`, `pays_in_full`, `paid_in_full`. `engine/payoff` already has level-payment amortisation (bigint, half-up interest, ceiling payment), future value with a monthly contribution, and a card-minimum simulation, all at 100% coverage. [VERIFIED: codebase read]

What is genuinely new: (a) a pure `engine/payoff` extension for a fixed user-typed payment, multi-debt avalanche/snowball with rollover, and never-pays-off detection; (b) a pure `engine/grow` folder for goal planning (two-way calculator, ceiling rule), lots (average cost, realised/unrealised) and gain/loss; (c) three new tables (`holdings`, `holding_lots`, plus a value-history source) and a handful of columns on existing tables; (d) the Decide engine change for D-05/D-06 (locked goals kept out; unlocked goals counted and named), which needs a new input, a new fact code, copy and right-answer cases; (e) the Grow tab and screens.

Three traps stand out. First, `apply_patches` (the undo and optimistic-write RPC) has a hard-coded entity allow-list and column allow-lists, and it has been re-issued in full by almost every recent migration; any new table or column Grow wants patchable must re-issue it from the newest definition (`20261103000200`). Second, "repeating transfer" does not exist: `recurring_series` materialises single-leg rows. Third, a safety-net saved amount today is an account balance (`reserve_account_id`), but the ledger puts the safety net and Lisbon in the same account, so per-goal saved must come from `opening_saved` plus goal-tagged lines. The migration must compute that starting figure.

**Primary recommendation:** Build in this order: (1) pure engines (`payoff` extension, `grow/*`) with fixtures from `LEDGER.md` and `calc.js`; (2) connection-point contracts and migration (schema push as a [BLOCKING] human-gated task), with the Decide engine change and right-answer cases; (3) Grow data layer; (4) Grow screens; (5) Calculators group. Do not copy anything out of `decide_settings` interim columns; read them once for the D-07 migration and then drop them in a separate, later migration.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Amortisation, payoff strategies, goal plan, lots, gain/loss | `src/engine/` (pure TS) | — | CLAUDE.md: engine isolation; 100% coverage, property tests |
| Goal/debt/holding storage, RLS, uniqueness of the safety-net flag | Database (Supabase) | — | Constraints (one flagged goal) must hold regardless of client |
| Safety-net migration from `decide_settings` (D-07) | Database migration | App first-open sheet | Deterministic, pgTAP-testable, runs once per row |
| Connection points (goal, safety net, debt) | `src/features/grow/connect/` (pure mapping, 100% folder) | engine `V3Inputs` | Maps rows to `Envelope`, `SafetyNet`, `V3Debt`; Decide only reads these |
| Locked goals kept out of answers | `src/engine/decide/v3` | — | The only place a wrong answer causes harm (Core Value) |
| Queries, paused-mutation writes, undo | `src/data/` + `src/db/` | — | Existing TanStack Query + `apply_patches` pattern |
| Screens, sheets, calculators UI | `src/features/grow/` + `app/(app)/(tabs)/grow` | `src/ui` primitives | Prototype G01..G12, GC01..GC40 |
| Contribution expected lines | Database (series materialiser) | Activity UI | Single source: a series linked to its goal (ARC-15) |

## Standard Stack

No new dependencies are required. [CITED: 06-UI-SPEC.md "Registry Safety"; verified against package.json]

### Core (all already installed)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| Expo SDK / RN | ~57.0.24 / 0.86.3 | App | Locked by CLAUDE.md |
| `@supabase/supabase-js` | 2.117.0 | Data | Installed version (CLAUDE.md lists 2.116.0; repo is newer) [VERIFIED: package.json] |
| `@tanstack/react-query` + persister | ^5.103.2 | Cache + paused-mutation write queue | Existing pattern |
| `react-native-svg` | 15.15.4 | Charts (`LineChart`, `BarChart`, `StackedBar`) | Hand-rolled charts per design fidelity |
| `react-native-reanimated` | 4.5.1 (+ worklets 0.10.1) | Bar fill 0.55 s, sheet slide | Existing |
| `fast-check` + `@fast-check/jest` | per package.json | Property tests | Existing engine tests use them |
| Jest (jest-expo preset) | per package.json | Tests | `npm test`, `npm run test:engine` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Own `src/ui/Sheet` | `@gorhom/bottom-sheet` | Not installed; CLAUDE.md amendment says Sheet is the standard. Do not add |
| Lottie tick | SVG stroke draw once | UI-SPEC OQ-3 default is SVG; no new dependency |

**Installation:** none.

## Architecture Patterns

### System Architecture Diagram

```
 user input (sheets / calculators)
        |
        v
 src/features/grow/*  (screens, pure view-models)
        |  reads                          |  writes
        v                                 v
 src/data/queries/grow*.ts          src/data/mutations/grow*.ts
 (TanStack Query, persisted)        (paused-mutation queue, optimistic cache,
        |                            apply_patches / insert via src/db/*)
        |                                 |
        v                                 v
 src/db/{savingsGoals,debts,holdings,holdingLots}.ts  -->  Supabase (RLS, guards, partial unique index)
        |
        +--> src/features/grow/connect/  (PURE, 100% coverage)
        |        goalToEnvelope / safetyNetOf / lockedGoalsOf / debtToV3Debt
        |                |
        |                v
        |      src/features/decide/snapshot/v3/buildV3Inputs.ts  --> V3Inputs { safetyNet, envelopes, lockedGoals, debts }
        |                                                                   |
        |                                                                   v
        |                                              src/engine/decide/v3  (answers; names safety net + locked goals kept out)
        |
        +--> src/engine/payoff (amortise, fixedPayoff, strategies, futureValue)   <-- Grow screens + Calculators call these
        +--> src/engine/grow   (goalPlan, lots, gain)                              <-- Grow screens + Calculators call these
```

### Recommended Project Structure
```
src/engine/payoff/
├── fixedPayoff.ts        # NEW: one debt, fixed payment (+extra, +lump), never_clears/cap outcomes
├── strategies.ts         # NEW: N debts, one budget, 'rate' | 'balance' order, rollover, per-debt done month
└── (existing files untouched)
src/engine/grow/          # NEW folder -> add to the 100% list in jest.config.js
├── goalPlan.ts           # monthsToReach, neededEachMonth (ceil), reachedOn, two-way pair
├── lots.ts               # average-cost position from buys/sells/fees/dividends
├── gain.ts               # per-holding and total; realised vs unrealised; as-of staleness (30 days)
└── index.ts
src/features/grow/
├── connect/              # NEW 100% folder: the three BO-07 contracts + tests
├── goals/ debts/ investing/ calculators/ safetyNet/ lines/
app/(app)/(tabs)/grow.tsx  # + pushed routes (goal/[id], debt/[id], holding/[id], calculators/*)
src/db/holdings.ts, holdingLots.ts   # row types, *_COLUMNS, insert/patch key lists
src/data/{queries,mutations}/grow*.ts
supabase/migrations/2026110600xx00_grow_*.sql
supabase/tests/database/89_*.test.sql ...
```

### Pattern 1: Pure engine functions on bigint, one rounding rule
**What:** Interest each month is `divideHalfUp(bal * apr, MONTHLY_RATE_DENOMINATOR)`; `apr` is a `Percent` (scaled 10^10). Payments clamp to `bal + interest`. Output `MinorUnits` through `minorFromBigInt`.
**Why it matches the prototype:** `calc.js` `interest = rhu(bal*bp/120000)` is the same rounding as `divideHalfUp` (bp = apr x 100). Verified by running `calc.js`: loan 20,000 at 7.5% x 60 -> level payment 40,076 cents (exact 40,075.897 -> ceiling 40,076, same as engine `amortise`), totalInt 404,551, last 40,067. [VERIFIED: ran design/calc.js]
**Example (shape for `fixedPayoff`):**
```typescript
// Source: pattern of src/engine/payoff/simulateMinimum.ts and design/calc.js payoff()
export type PayoffOutcome = 'cleared' | 'never_clears' | 'exceeds_month_cap';
export interface FixedPayoffResult {
  outcome: PayoffOutcome;
  months: number;            // payments made (cleared) | month check fired | SIMULATION_MONTH_CAP
  lastPayment: MinorUnits;
  totalInterest: MinorUnits | null;   // null only for never_clears
  remainingBalance: MinorUnits;
}
export function fixedPayoff(
  balance: MinorUnits, apr: Percent, payment: MinorUnits,
  opts?: { extra?: MinorUnits; lump?: MinorUnits },   // lump comes off before month 1 interest (prototype once)
): FixedPayoffResult;
```
`never_clears` fires on the first month `payment + extra <= interest` (same explicit check as `simulateMinimum` D-17, independent of the cap); the cap is `SIMULATION_MONTH_CAP` (600) and is its own outcome. The prototype loops to 1200 and has no never-clears branch, so do not port its cap. [VERIFIED: simulateMinimum.ts]

### Pattern 2: Multi-debt strategy simulation (port of `calc.js strategy()`)
Per month: (1) add each live debt's interest (half-up); (2) pay each live debt `min(minimum, balance)` and subtract from the budget; (3) hand the remaining budget to live debts in strategy order, one at a time (`'rate'`: highest APR first; `'balance'`: smallest original balance first); (4) record each debt's `done` month when it hits zero. The budget is **constant** (sum of starting minimums + extra), so a cleared debt's minimum rolls over automatically. Results to reproduce (from `calc.js`, equal to LEDGER GC40):

| Order | Months | Total interest (cents) | First cleared |
|---|---|---|---|
| Highest rate first (card 4,200 at 21.9% min 120; loan 1,500 at 9.5% min 75; extra 100) | 24 | 114,868 | Personal loan, month 22 |
| Smallest balance first | 24 | 128,030 | Personal loan, month 9 |
| Minimums only (extra 0) | 41 | 218,434 | Personal loan, month 22 |

[VERIFIED: ran design/calc.js; matches LEDGER.md §Calculators]

Single-debt Auto loan (8,420 at 6.9%, 312/month): 30 payments, interest 75,636 cents, last payment 12,836 -> Apr 2029. +50: 26 payments, 64,491 interest. [CITED: LEDGER.md; payoff() reproduced]

**Edge rules the planner must give tasks for:**
- Termination: per-debt and whole-plan. Whole-plan `never_clears` when budget cannot cover the first month's total interest and total balance does not fall; otherwise stop at 600 months with `exceeds_month_cap`. Property test: the result is never an infinite loop and `never_clears` implies total balance after 12 months >= start. [ASSUMED: rule shape; owner-free engine decision]
- Minimum larger than balance+interest pays only what is owed (prototype `Math.min`).
- Zero-balance debts are skipped; zero-rate debts allowed (`ZERO_PERCENT`).
- One debt: both orders must return identical results (LEDGER says so; the UI disables the order control). Make this a property.
- Revolving credit: a carried card joins the plan with its typed minimum (Open question 7). Cards paid in full are excluded (D-15).
- `paid_off` debts and `deleted_at` debts are excluded before the engine is called.

### Pattern 3: Goal plan, two ways
`neededEachMonth(left, n) = ceilDivide(left, n)` (existing `ceilDivide`), never half-up (D-21; LEDGER: by Oct 2028, 24 deposits, left 116,000 -> 4,834 = $48.34; $82.86 by Dec 2027 with 14 deposits). `monthsToReach(have, target, add, apr?)` is the prototype `saveTo`: deposits at end of month, interest first (half-up) then deposit. Goal maths counts deposits only (no interest) for goals whose account has no rate, as in the ledger. The date of the k-th deposit uses `occurrenceDate(anchor, 'monthly', k)` (existing, month-end clamped). [VERIFIED: LEDGER.md rows; recurring/schedule.ts]

LEDGER fixtures for the goal calculator (Lisbon, 116,000 to go from Nov 16, 2026): $25 -> 47 deposits, Sep 2030; $50 -> 24, Oct 2028; $75 -> 16, Feb 2028; $100 -> 12, Oct 2027; Laptop 350,000: $292 -> 12 deposits Oct 2027; $150 -> 24 Oct 2028. [CITED: LEDGER.md]

### Pattern 4: Cost-basis lots (recommended, pending Open question 3)
Position state `{ units?: number-or-scaled, costBasis: MinorUnits, realisedGain: MinorUnits, dividends: MinorUnits, fees: MinorUnits }`. Buys add cost (+ fee if folded into cost). A sell of fraction `f = unitsSold / unitsHeld` removes `divideHalfUp(costBasis * unitsSold, unitsHeld)` of basis and realises `proceeds - basisRemoved - fee`. Without units (the simple holding, D-09), a sale is by amount: reduce basis in proportion to the value at sale. Unrealised gain = `value - costBasis`. Units are decimal text/scaled bigint, never JS float (crypto needs 8 dp). Gain % shown as whole or one-decimal percent via `divideHalfUp`. Dividends and fees are income/expense lines, shown separately, not folded into unrealised gain. [ASSUMED: design; needs owner confirm on method]

Simple holding (D-09): `paid` (amount put in) + `value` + `value_as_of`. Model it as an implicit opening buy lot so one engine path serves both; "Put in so far" = sum of buys minus basis removed by sells. LEDGER: Retirement fund value 645,000, put in 580,000 -> +65,000 (11.2%); Index fund value 124,000, +4,000; total invested 769,000, "$690 above put in". Note: 650+40 = 690 exact. [CITED: LEDGER.md/areas-spec]

### Pattern 5: Connection points (BO-07 items 2, 3, 4)
These are the contract between Grow and Decide. Put them in `src/features/grow/connect/` (pure, `FULL` coverage threshold added in jest.config.js like `src/features/decide/snapshot`) and have `buildV3Inputs.ts` import only them.

| Point | Shape (from DECIDE-FIX-PLAN BO-07 + existing engine types) | Mapped to |
|---|---|---|
| 2 Goal | `{ id, name, target\|null, saved, monthlyAmount\|null, readyBy\|null, locked, upFrontOnly, linkedCheckId\|null, accountId\|null, done }` | `Envelope` (existing: id, kind, target, monthlyAmount, readyBy, saved, purposeId, accountId, bucket, name) plus new `locked` |
| 3 Safety net | exactly one flagged goal: `{ size, saved, protect, locked }`; no row = no record (starter size, protection on) | `SafetyNet` (existing: protect, size, saved, locked) and `EmergencyFund` |
| 4 Debt | `{ id, balance, apr, minimum, dueDay, payoffDate, paidInFull, linkedCheckId, paidOff }` | `V3Debt` (existing: id, kind, balance, minimum, apr, secured, isHousing, dueDay, joint, paidThisMonth, seriesId) |

Contract tests: (a) round-trip fixtures per point; (b) "adding a debt never raises the lowest point" (success criterion 8) as a property over `evaluate`; (c) "a contribution counts exactly once" (criterion 9): a goal-tagged series occurrence and its Activity line produce one saving amount in Decide's month, not two; (d) safety-net answers unchanged before/after the D-07 migration for the existing `safety-net.json` right-answer cases. [VERIFIED: engine types read; DECIDE-FIX-PLAN §BO-07]

### Anti-Patterns to Avoid
- **Reading `decide_settings.safety_net_*`, `reserve_*`, `rough_*` from new Grow code.** DECIDE-FIX-PLAN "Do not copy or build on". Only the one-off D-07 migration reads them, then a later migration drops them.
- **Computing goal progress inside Decide.** Saved is computed once in `connect/` from `opening_saved` plus goal-tagged paid lines (the `resolvePotAmounts` pattern in `usePots.ts`), then passed in.
- **A second payoff calculation in a screen.** All payoff dates and interest come from `engine/payoff`; screens format only.
- **Floats anywhere.** The prototype's `Math.pow` loan payment is for the prototype only. Use `amortise()`.
- **"Recommend/better/best/should" wording** in any payoff, growth or calculator copy (compliance; copy contract tests in `src/engine/decide/v3/copy/__tests__/copyContract.test.ts` pattern; add a Grow copy lint test).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Level-payment loan | `Math.pow` annuity formula | `amortise()` / `amortiseDue()` | Bigint, ceiling payment, residual absorbed in last payment, proven |
| Future value with monthly deposit | Loop with floats | `futureValue()` / `futureValueExact` / `futureValuePath` | Exact rational, one rounding |
| Half-up division | `Math.round` | `divideHalfUp` (mirrored in SQL as `div_half_up`) | The one rounding rule; parity fixture with SQL |
| Round up a needed amount | `Math.ceil(a/b)` on floats | `ceilDivide` | Exact on bigint |
| Monthly dates, month-end clamp | `Date` arithmetic | `occurrenceDate`, `engine/time` | No drift, no time-zone bugs |
| Optimistic write + undo + replay | Custom queue | `buildStep` / `inverseOfPatches` / `apply_patches`, `guardSession`, `versionChain` (see `src/data/mutations/debts.ts`) | Already handles version conflicts, offline replay, failed-writes sheet |
| Percent text to engine rate | Own parse | `percent()` (`'^\d{1,4}(\.\d{1,10})?$'`, same check on DB columns) | Same validation both sides |
| Sheets, toasts, confirm | New components | `Sheet`, `ConfirmSheet`, `ToastView`, `Keypad`, `ToggleRow`, `Pill` | Design fidelity |
| Live-region debounce | New timer | `useSettledLabel` (Phase 5 D-56) | Specified in UI-SPEC |

## Runtime State Inventory

> Included because D-07 moves the safety net out of `decide_settings` (a migration of stored data).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `decide_settings.reserve_account_id`, `reserve_goal`, `safety_net_protect`, `safety_net_size`, `safety_net_locked` per tester; `rough_saving`, `rough_debt`, `rough_invest` (setup rough figures); existing `savings_goals` rows of kind `pot` and `wait` | **Data migration:** create one flagged goal per tester who has a net record. **Code edit:** reads move to the connection point. Existing pots map to locked goals (Open question 1 default) |
| Live service config | None in Grow's scope (no external service holds the strings). Production Supabase is the only project and is the only environment (CLAUDE.md) | Human-gated push only |
| OS-registered state | None — verified: Grow adds no scheduled jobs. (A contribution uses the existing series materialiser cron, nothing new registered.) | None |
| Secrets/env vars | None — no new keys. Supabase push needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROD_PROJECT_REF` from `C:\dev\fincwin\.env.local` (not worktree) | Export per command, never print |
| Build artifacts | Persisted TanStack cache on devices holds `savings_goals`, `debts`, `decide_settings` shapes; `scripts/cache-shape.lock.json` hashes `*_COLUMNS` | Bump `CACHE_SCHEMA_VERSION` and run `npm run check:cache-version -- --update` when `SAVINGS_GOAL_COLUMNS`/`DEBT_COLUMNS` change; the `DECIDE_SETTINGS_COLUMNS` change when interim columns drop |

**Canonical question answered:** After the repo is updated, the interim `decide_settings` columns still exist in production until the later drop migration, and old app builds on tester phones still read them. So: migration copies, new build reads the goal, old builds keep working until the drop, and the drop waits for a `min_supported_version` floor bump (migration gate, below).

## Supabase: conventions, tables, RLS, push

### Conventions observed [VERIFIED: migrations read]
- File names `YYYYMMDDNNNNNN_name.sql`; newest is `20261103001000`. Use `20261106000100` onward.
- Additive style: `add column if not exists`, named check constraints (`drop constraint if exists` then `add`), column-level `grant insert (...)` / `grant update (...)` to `authenticated` (never table-wide); a `guard_*` trigger (security definer, `set search_path = ''`, `revoke execute ... from public, anon, authenticated`) that fixes immutable fields (`id`, `household_id`, `created_at`, `is_sample`), stamps `updated_at`, and validates cross-row membership (account in same household) with errcode `42501`; a `set_version` trigger; RLS policy `for all to authenticated` with `user_household_ids()`.
- `savings_goals` policy "own savings goals" is owner-private (`created_by = auth.uid()` and household member). `debts` policy "household debts" is household-scoped. Household phase 8 owns the sharing rule; Phase 6 should stay owner-private for new tables (consistent with `savings_goals`, avoids a sharing decision) [ASSUMED].
- `squawk` lint via `npm run lint:migrations`; destructive changes need a `-- contract-ok: min_version >= X` marker, and a floor bump ships in an earlier, separate migration (dropping `decide_settings` interim columns is destructive: bump first, drop later).
- pgTAP tests in `supabase/tests/database/NN_name.test.sql` (latest 88); the next free number is 89.
- Production schema push: `npm run supabase:db:push` (preflight chained) from the main checkout's env. **Never use the Supabase MCP connector** (different account). Schema push must be a `[BLOCKING]`, human-gated task; Jest and pgTAP run against a local database first.

### Proposed schema changes
| Change | Detail |
|---|---|
| `savings_goals` | add `is_safety_net boolean not null default false`; `locked boolean not null default false`; `up_front_only boolean not null default false` (BO-07 flag); `rate text` (APY, same regex check); `paid_from_account_id`/reuse `account_id` ("Kept in"). Partial unique index `on (created_by) where is_safety_net and deleted_at is null` = exactly one (GRW-02). Shape check: safety-net goal is `kind='pot'`, `locked` forced true by guard, never removable (delete blocked in guard; set size 0 instead per UI-SPEC). Today's `pot_shape` check demands target+ready_by OR bucket; Grow's open-ended goal (no target, no date) needs the check relaxed (GRW-01) |
| `recurring_series` | add `goal_id uuid references savings_goals(id) on delete set null` + guard that goal and series share household; the materialiser copies it to `transactions.goal_id` (the existing guard `guard_transaction_goal` already validates). Re-issue `materialise_series` and create/edit RPCs from newest definitions |
| `debts` | add `paid_off_at timestamptz` (a `20261028001200` migration already added a series_end_reason/debt paid-off concept: read it first and reuse, do not duplicate); `started_balance bigint` (for "Started at $14,500 · 42% paid"); `payoff_extra bigint` and `payoff_order text check in ('rate','balance')` if the chosen plan is stored (the "Use $50 extra" button); link to the sale transaction for D-16 |
| `holdings` (new) | `id, household_id, created_by, name, type check in ('brokerage','retirement','pension','crypto','other'), currency, value bigint, value_as_of date, rate text, monthly_amount, day smallint, account_id (paid from), is_sample, deleted_at, version, created_at, updated_at` + guard + policy + grants |
| `holding_lots` (new) | `id, holding_id, household_id, created_by, kind check in ('buy','sell','dividend','fee','value'), amount bigint, units text (decimal), local_date, note, deleted_at, version, ...`. `kind='value'` rows are the hand-typed value history for the chart and GRW-10 (single table, one "Entries" list as in G09) |
| `decide_settings` | no change in Phase 6 except a one-time `safety_net_confirmed_at` (UI-SPEC §3) which belongs on the flagged goal row instead; do not add to `decide_settings` |
| Data migration | one `insert ... select` that creates the flagged goal from each `decide_settings` row that has a net record: size = `safety_net_size` (null -> starter size is computed in the app, so store null and let the connection point apply the starter), `locked = safety_net_locked`, `protect = safety_net_protect` (see below), `account_id = reserve_account_id`, `opening_saved` = current balance of that account computed in SQL (opening_balance + sum of paid, non-deleted transactions). Idempotent (`where not exists` flagged goal). |

`safety_net_protect` (on/off) and "size 0" are Decide-visible switches (G04a "Size", Decide keeps the "protect my safety net" switch per DECIDE-FIX-PLAN setup table). Recommendation: store `protect` on the flagged goal as `protect boolean not null default true` so Decide reads one row; the Decide settings switch becomes a write to that row. [ASSUMED]

### The `apply_patches` constraint (largest hidden cost)
`apply_patches` hard-codes the entity list in three places (replayed-step lookup, entity validation, and the owner-scoping branch) and a `v_allowed` column list and column-type map per entity. Every migration that changed patchable columns re-issued it in full (e.g. `20261103000200`). Grow must re-issue it from `20261103000200_overdraft_rate_and_debt_due_day.sql` (newest) once, adding: `holdings`, `holding_lots`, and the new `savings_goals`/`debts` columns. Put all Grow patchable-column additions in a **single** migration to re-issue the function only once. Any later Grow migration touching it must copy this one. pgTAP test 69 (`apply_patches_v3`) is the template. [VERIFIED: migration read]

## Decide integration (what Grow must provide, exactly)

Current state [VERIFIED: code read]:
- `V3Inputs` already carries `emergency`, `envelopes`, `debts`, `safetyNet`. `buildV3Inputs.ts` builds envelopes from `savings_goals` + goal-tagged lines, and debts from the snapshot's debt list; `settingsSource.ts` passes `safety_net_protect/size/locked` straight from `decide_settings`.
- `safetyNet.ts`: protected floor = `min(saved, size)`; locked (D-61) leaves the net up to its size out entirely; money above size is "extra savings" (spare).
- Envelopes are **only usable for their own purpose** (`funds/envelopes.ts`). That is stricter than D-05's "unlocked goals are spare money".

What Grow changes in the engine (D-05, D-06; Core Value territory):
1. New input `lockedGoals` (or `Envelope.locked`): protected amount = saved of each locked goal; kept out of usable money.
2. Unlocked goals' saved: counted as spare (a new funding source alongside `extra_savings`, named in the answer). Gated on Open question 1.
3. New fact code (e.g. `locked_goals_kept { amount }`) and the combined line "Safety net $X and locked goals $Y kept out" (D-06). Adding a `FactCode` has ripple tests: `copyContract.test.ts`, `outputs-are-codes.test.ts`, `public-api.test.ts`, `barrel.test.ts`, and the `check:right-answers` guard (existing approved cases' expected outputs must not change; new cases are added, not edited).
4. Right-answer cases: add Grow cases to `rightAnswers/cases/` (`goals.json`: locked fully saved, locked partly saved, unlocked counted, withdrawal from locked; `safety-net.json` additions already drafted) and turn on the `household.json`-style "to do" cases that depend on Grow. New cases need owner approval (`status: approved`) per the existing page workflow.
5. Debts: add nothing to the engine; map `due_day` and payoff date. ENG-24 "one payoff module": `engine/decide` currently owns `amortiseSchedule` use; Decide's debt-payoff reads must call the same `engine/payoff/strategies`. Grep for a second payoff implementation in `engine/decide/v3/debts.ts` and replace with a call into `engine/payoff` (task for the connection-point wave).
6. Goal contribution counted once (ARC-15, criterion 9): `buildV3Inputs.ts` currently classifies a goal-tagged transfer leg as `envelope_deposit` (D-22 stand-in). Once a contribution is a series linked to a goal, its occurrences must not also count as a recurring saving line in the month. Add a failing test first.

Order inside the phase (D-01): connection-point types and contract tests (red), schema + migration, mapping code, Decide engine change with right-answer cases (green), then screens.

## Data layer and UI patterns to reuse
- Reads: `src/data/queries/*` + `src/data/keys.ts` (`queryKeys`, `mutationKeys`, `WRITE_SCOPE`); persisted via `src/data/cache/persister.ts`. New Grow queries add keys there (hashed by `check-cache-version`, so bump the version).
- Writes: copy the shape of `src/data/mutations/debts.ts` and `decidePots.ts`: `useMutation` with `shouldRetryWrite`, `guardSession`, `recordWrittenVersion`, optimistic `upsertRow`, `buildStep` undo, `recordFailedWrite` on conflict. Multi-row saves (D-16 sale + final payment + mark paid off; goal "Add money" = transfer pair + goal tag) should be one `apply_patches` call with several ops or a dedicated RPC, so the undo is one step and the save is atomic. `boughtWrite.ts` / `decideGoAhead.ts` are the nearest examples of multi-entity atomic writes.
- Transfers: `engine/transfer/pair.ts` `buildTransferLegs` for "Add money / Take some out" (two legs sharing a `transfer_id`, goal tag on the goal-side leg). DB trigger `check_transfer_pair` enforces pairs.
- Tabs: `TAB_AVAILABILITY.grow` is `false` in `src/shell/tabBar/availableTabs.ts`; flip to `true` as the last task (one release, D-03). The route file `app/(app)/(tabs)/grow.tsx` does not exist yet. `Tabs.Screen` entries are generated from `availableTabs()`, so a missing route with `true` breaks the shell: add the route first.
- Existing pot UI (`src/features/decide/pots/*`: `PotsScreen`, `PotSheet`, `potsModel.ts`, `usePots.ts`) is the nearest code. It is Decide-owned and "Do not copy or build on" per the fix plan for Decide-made pots; reuse only its pure helpers (`resolvePotAmounts`, `wholePercent`) by moving them into `features/grow`.
- Net worth: any existing net-worth code (`Home` AccountsCard) sums accounts. Holdings must be added to the net-worth source in one place (Open question 5).
- Level gating: no level system exists until Phase 9; show everything (CONTEXT). Put a single `growFeatureFlags()` helper returning all-on so Phase 9 has one seam, and test the Basics-level state with an injected flag (UI-SPEC).
- Export and delete: new tables must be added to `EXPORT_MANIFEST` (the guard test `exportManifest.test.ts` fails otherwise) and be covered by account deletion cascade (`on delete cascade` from `households`; add to pgTAP erasure test like `70_decide_v3_erasure`).

## Calculators group (D-21)
`design/calc.js` functions map to engine functions; the prototype file is a **fixture oracle**, not code to ship:

| Prototype | Becomes | Notes |
|---|---|---|
| `loan(principal, bp, n)` | existing `amortise()` | LEDGER GC10: 20,000 at 7.5% x 60 -> 40,076 payment, last 40,067, interest 404,551 |
| `payoff(bal, bp, pay, extra, once)` | new `fixedPayoff()` | Auto loan fixtures above |
| `grow(start, add, bp, months)` | existing `futureValue()` + `futureValuePath()` (per-year points) | GC30: $200 a month, 4%, 10 years -> $29,449.98; with $7,690 start -> $40,914.44 |
| `saveTo(have, target, add, bp)` | new `goalPlan.monthsToReach` | GC20: target 5,000, saved 500, 250/month, 3% -> 18 months, interest $119.90 |
| `needEach` | `ceilDivide` | ceiling rule (D-21) |
| `strategy(debts, extra, order)` | new `strategies()` | GC40 table above |

Verify `futureValue` against `grow()`: `grow` adds interest then deposit at month end, equal to `futureValue(monthly, apr, months, seed)` closed form but rounded once, while `grow()` rounds each month. These can differ by cents. The LEDGER numbers come from the per-month rounding of `grow()`. **Decision for the planner:** either (a) use per-month stepping in a new `compoundSteps` function (matches LEDGER and the displayed year-by-year bars exactly) or (b) use closed-form `futureValue` and regenerate the fixtures. Recommend (a) for the illustration and calculator because the "How it was worked out" box shows month-by-month rounding; keep `futureValue` for Decide. [VERIFIED: both methods exist; difference is an open check task — write a test that asserts equality on the LEDGER rows and records any cent difference]

Calculator UI contracts (typed): results update with a 150 ms debounce; never persisted; the four typed calculators need no network. "Make this the plan" (D-20) is a confirm sheet then a write of the same fields the plain edit writes (`monthly_amount`/`ready_by`, debt `payoff_extra`), with one Undo step.

## Common Pitfalls

### Pitfall 1: `apply_patches` allow-list forgotten
**What goes wrong:** New table or column works on insert but every optimistic edit and Undo fails with "unknown entity" or a disallowed key.
**How to avoid:** One migration re-issues `apply_patches` from `20261103000200`; a pgTAP case per new entity patches and undoes one row.
**Warning signs:** `apply_patches: op N has an unknown entity`.

### Pitfall 2: Two safety-net stores during rollout
**What goes wrong:** New build reads the goal, old build reads `decide_settings`; testers on mixed builds see different numbers.
**How to avoid:** Migration copies; do not write to the interim columns from the new build; drop only after the floor bump (separate migration). Keep the old read path working until then. The shadow runs (BO-08) can compare old vs new inputs; add a parity test: for every `safety-net.json` case, interim-column input and goal-row input give the same `SafetyNet`.

### Pitfall 3: Locked goals change answers silently
**What goes wrong:** Mapping existing envelopes to unlocked flips answers for testers.
**How to avoid:** Migrate existing pots as locked (Open question 1/2); golden test that existing right-answer cases are byte-identical (`npm run check:right-answers`).

### Pitfall 4: Savings-account balance is not a per-goal saved amount
**What goes wrong:** Safety net and Lisbon live in one Savings account ($1,940 = 1,300 + 640). Using the account balance double counts.
**How to avoid:** Saved per goal = `opening_saved` + goal-tagged paid lines (existing pattern). Account balance is used only once, to seed `opening_saved` for the migrated safety net.

### Pitfall 5: Repeating transfer does not exist
**What goes wrong:** The materialiser inserts one leg per occurrence; a "transfer" series would break `check_transfer_pair` or create unpaired money.
**How to avoid:** Pick the Open question 4 default: the series produces an *Expected* single-leg line tagged with `goal_id` in the source account; confirming it is the action that creates the paired legs (reuse `buildTransferLegs`). Alternatively extend the materialiser to emit pairs (bigger SQL, needs re-issue of `materialise_series` and the pgTAP recurring suite). Estimate the first as S-M, the second as L.

### Pitfall 6: Float and cap traps ported from the prototype
`calc.js` uses `Math.floor(x + 0.5 + 1e-9)` and a 1200-month cap. Engine rule is bigint `divideHalfUp` and a 600-month cap with explicit never-clears.

### Pitfall 7: Coverage config silently skips the new folder
`jest.config.js` adds a 100% threshold only for folders in a hard-coded list; a new `src/engine/grow/` sits under the 95% "rest" rule until `'grow'` is added to that list. Add `'grow'` in the same task that creates the folder. Also add `src/features/grow/connect` to the pure-feature `FULL` list. `payoff` is already 100%.

### Pitfall 8: Haptics API and compliance wording
Use `hapticLight/Success/Warning` wrappers in `src/ui/haptics.ts`; SDK 57 `expo-haptics` dropped the old method names. Payoff copy: "Highest rate first" / "Smallest balance first", never "best", "optimal", "recommend", "should".

### Pitfall 9: Stale persisted cache after column changes
`check-cache-version` fails CI if `*_COLUMNS` or `rows.ts`/`keys.ts` change without bumping `CACHE_SCHEMA_VERSION` and updating `scripts/cache-shape.lock.json`.

### Pitfall 10: Worktree and branch hygiene
Work only in `C:\dev\fincwin-g6`; do not touch the shared checkout; the prod token lives only in `C:\dev\fincwin\.env.local` (schema push executes from there with env exported per command).

## Code Examples

### Strategy engine signature (target API)
```typescript
// Source: port of .planning/phases/06-grow/design/calc.js strategy(); rounding per engine/payoff
export type PayoffOrder = 'rate' | 'balance';
export interface PlanDebt { id: string; balance: MinorUnits; apr: Percent; minimum: MinorUnits }
export interface StrategyResult {
  outcome: PayoffOutcome;
  months: number;
  totalInterest: MinorUnits | null;
  budget: MinorUnits;                                  // sum of minimums + extra, constant
  debts: ReadonlyArray<{ id: string; doneMonth: number | null; interest: MinorUnits }>;
}
export function strategy(debts: readonly PlanDebt[], extra: MinorUnits, order: PayoffOrder): StrategyResult;
```

### Locked-goal protected amount (connection point)
```typescript
// Source: D-05, D-06; maps to V3Inputs (new field)
export function lockedGoalsKept(goals: readonly GoalPoint[]): MinorUnits {
  // safety net is separate (D-06) and handled by safetyNetOf()
  return goals.filter(g => g.locked && !g.isSafetyNet && !g.done).reduce((s, g) => minorUnits(s + g.saved), minorUnits(0));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Safety net stored in `decide_settings` (interim 05.4 columns) | One flagged Grow goal | This phase | Single store; interim columns dropped after floor bump |
| Goals tied to Decide checks (`kind` `wait`/`pot`) | Goals independent, optional "linked to a decision" label | BO-07 | `check_id` kept as origin only |
| Debt sim inside Decide | One `engine/payoff` module | ENG-24 this phase | Decide reads Grow's debt data and the same maths |
| Variants A/B | Variant C chosen 2026-11-01 | 05.4 | Grow handoff screens follow C |

**Deprecated/outdated:** `expo-haptics` `notification()/impact()/selection()` names (SDK 57). Prototype 1200-month cap.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Average cost is the right default for sales | Pattern 4, Q3 | Gain figures differ from what a user's broker/tax shows; wording must say "record, not tax figure" |
| A2 | Whole-plan never-clears rule (budget cannot cover first-month interest and total balance does not fall) | Pattern 2 | A case that clears slowly flagged as never; mitigated by 600 cap and property tests |
| A3 | New tables owner-private, matching `savings_goals` | Supabase | Household phase 8 needs a read-rule change on these tables |
| A4 | `protect` stored on the flagged goal row | Supabase | Decide settings switch needs a new write path |
| A5 | Expected-line contributions rather than paired legs by the materialiser | Pitfall 5, Q4 | If paired legs are required, add an L-size SQL task |
| A6 | Existing pots migrate as locked | Q1/Q2, Pitfall 3 | If unlocked, tester answers change on first release |
| A7 | Per-month compound stepping (not closed form) for the illustration | Calculators | Fixture drift of a few cents vs `futureValue` |
| A8 | Phase 5 pot `pot_shape` check must be relaxed for open-ended goals | Supabase | Insert of an open-ended goal fails with 23514 |
| A9 | Cannot confirm `rate`/APY should live on goals; GRW-11 could be limited to holdings and accounts | GRW-11 | UI-SPEC says "savings and investments that have a rate"; a savings goal inherits its account's rate |

## Open Questions (technical, for the planner)

1. **Where does the APY for a savings account live?** `accounts` has no rate column (only `overdraft_rate`). Options: `savings_goals.rate` (per goal) or a new `accounts.interest_rate`. Recommend `accounts.interest_rate` (text percent, same regex), because the rate belongs to the account, and goal maths reads it via `account_id`. Needs a patchable-column addition in the single `apply_patches` re-issue.
2. **Debt "payoff date" for a card that carries a balance with no stored minimum?** Use `minimum_payment` if > 0, else ask ("ask, don't block"): show "Add a minimum to see a payoff date".
3. **Is the Grow screens' `rough_*` setup data (Loans, Saving, Emergency, Envelopes steps, ARC-16) deleted or kept for users without records?** Keep reads for users with no records until 05.5 deletes the old builder; Grow forms write real records only.
4. **Starter size of the safety net** is derived in the engine from essential costs (`NET_STARTER_MONTHS`); the migration stores `null` size and the connection point preserves "null = starter". Confirm G04a's "what you set" row handles null.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm | Jest, scripts | yes | repo toolchain | — |
| Jest + jest-expo | Tests | yes | per package.json | — |
| Supabase CLI + prod token | Schema push (human-gated) | token only in `C:\dev\fincwin\.env.local` | — | Push from main checkout with env exported |
| Local Postgres / `supabase test db` for pgTAP | DB tests | not probed here | — | Run in the main checkout where Supabase tooling is configured; flagged |
| Android emulator / Pixel devices | Device checks | per owner memory (Pixel 9, Pixel 6) | — | Jest + Maestro |

Not probed in this session: Docker/local Supabase availability. The planner should include a first task that runs `npx supabase --version` and the local DB start, and treat failure as "run pgTAP in CI only".

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (jest-expo preset) + fast-check + `@fast-check/jest`; pgTAP for SQL; Stryker for engine mutation (existing) |
| Config file | `jest.config.js` (thresholds), `jest.engine.config.js` (engine only, node env) |
| Quick run command | `npx jest src/engine/payoff src/engine/grow src/features/grow -x` (engine only: `npm run test:engine -- src/engine/grow`) |
| Full suite command | `npm test` then `npm run test:coverage` at milestones (owner: no full local coverage per plan; quick checks per plan, full suite at milestones) |
| Other gates | `npm run typecheck`, `npm run lint`, `npm run depcruise`, `npm run lint:migrations`, `npm run check:right-answers`, `npm run check:cache-version`, `npm run check:money-mirror` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRW-01 | Goal with or without target; two-way plan, ceiling rule ($48.34, $82.86) | unit + property | `npx jest src/engine/grow/__tests__/goalPlan` | Wave 0 |
| GRW-01 | Open-ended goal insert passes shape check | pgTAP | `supabase test db` (file 89) | Wave 0 |
| GRW-02 | Exactly one live flagged goal per owner; second insert fails 23514/23505 | pgTAP | file 89 | Wave 0 |
| GRW-03 | Series linked to goal produces one expected line; counted once in Decide month | unit + contract | `npx jest src/features/grow/connect src/features/decide/snapshot/v3` | Wave 0 |
| GRW-04 | Holding type set; value and as-of required | unit + pgTAP | `npx jest src/db/__tests__/holdings` | Wave 0 |
| GRW-05 | Lots: buy, sell (average cost), dividend, fee; basis never negative; sells <= units held | unit + property | `npx jest src/engine/grow/__tests__/lots` | Wave 0 |
| GRW-06 | Gain per holding = value - basis; total = sum; LEDGER (+650, +40, 690) | unit | `npx jest src/engine/grow/__tests__/gain` | Wave 0 |
| GRW-07 | Loan/card fields saved; carried card joins plan; paid-in-full excluded | unit | `npx jest src/features/grow/debts` | Wave 0 |
| GRW-08 | Strategy results match calc.js (114,868 / 128,030 / 218,434); one debt both orders equal | unit + property | `npx jest src/engine/payoff/__tests__/strategies` | Wave 0 |
| GRW-09 | Auto loan 30 payments, 75,636 interest, last 12,836; +50 gives 26 / 64,491 | unit | `npx jest src/engine/payoff/__tests__/fixedPayoff` | Wave 0 |
| GRW-10 | As-of shown beside every value; 30-day stale row at day 31 not 30 | unit + RNTL | `npx jest src/features/grow/investing` | Wave 0 |
| GRW-11 | APY illustration: 4% $200/month 10y = $29,449.98; start 7,690 = $40,914.44 | unit | `npx jest src/engine/payoff/__tests__/compoundSteps` | Wave 0 |
| D-05/D-06 | Locked goals kept out; answer names safety net and locked goals; unlocked counted and named | engine right-answers + golden | `npx jest src/engine/decide/v3/__tests__/rightAnswers` | Wave 0 (new cases) |
| D-07 | Migration copies safety net; answers byte-identical before/after | pgTAP + parity jest | file 90; `npx jest src/features/grow/connect/parity` | Wave 0 |
| D-16 | Sale closes debt in one save (3 ops atomic, one undo) | unit (mutation) + pgTAP | `npx jest src/data/mutations/__tests__/growSale` | Wave 0 |
| D-21 | Typed calculators reproduce GC10/20/30/40 | unit | `npx jest src/features/grow/calculators` | Wave 0 |
| Criterion 8 | Adding a debt never raises the lowest point | property over `evaluate` | `npx jest src/engine/decide/v3/__tests__/invariants` | partial (extend) |
| Compliance | No forbidden words in Grow copy (recommend, advice, should, best, better, optimal) | unit (string scan of en.ts Grow keys) | `npx jest src/features/grow/__tests__/copyLint` | Wave 0 |
| Integer money | No float reaches a money field (typecheck + engine property: results are safe integers) | property | in each engine test | Wave 0 |

### Property-test invariants (fast-check)
- `fixedPayoff`/`strategy`: totalInterest >= 0; sum of payments = principal + totalInterest exactly; payment month never exceeds balance + interest; months <= 600; more extra never increases months or interest; `never_clears` iff first-month interest >= payment (single debt).
- `strategy`: budget constant; each debt's `doneMonth` strictly set when cleared; total interest(rate order) <= total interest(balance order) is **not** an invariant to assert (snowball can tie or, with equal rates, equal); instead assert both orders equal for one debt and for equal APRs with equal balances. Do not encode "avalanche is cheaper" as a product claim in copy.
- `lots`: replaying lots in date order is deterministic; selling all units leaves basis 0; realised + unrealised + remaining basis = total proceeds + value - total bought (conservation).
- `goalPlan`: `neededEachMonth(left, n) * n >= left` and `(neededEachMonth - 1) * n < left` (ceiling is tight); `monthsToReach` agrees with a naive loop; two-way round trip never lands later than requested date.
- Coverage: `src/engine/grow` and `src/engine/payoff` at 100% branches (jest.config.js list update is a Wave 0 task).

### Sampling Rate
- **Per task commit:** the single named test file for that task (`npx jest <path>`), plus `npm run typecheck` when types change.
- **Per wave merge:** `npx jest src/engine src/features/grow src/features/decide/snapshot` + `npm run lint` + `npm run depcruise` + `npm run check:right-answers`.
- **Phase gate:** `npm run test:coverage`, `npm run lint:migrations`, pgTAP suite, `npm run check:cache-version`, `npm run check:money-mirror`, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/engine/payoff/__tests__/fixedPayoff.test.ts`, `strategies.test.ts`, `compoundSteps.test.ts` (+ golden JSON from `calc.js` outputs)
- [ ] `src/engine/grow/` folder, tests, and `'grow'` added to the 100% list in `jest.config.js`
- [ ] `src/features/grow/connect/` contract + parity tests and `FULL` threshold entry
- [ ] pgTAP `supabase/tests/database/89_grow_goals.test.sql`, `90_grow_safety_net_migration.test.sql`, `91_grow_holdings.test.sql`
- [ ] Right-answer cases `goals.json` (and safety-net additions) with owner approval status
- [ ] Copy lint test for Grow strings
- [ ] Fixtures: a shared `growFixtures.ts` built from LEDGER.md (accounts, goals, auto loan, holdings) so engine, connection-point and screen tests use the same numbers

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (existing) | Supabase Auth, unchanged |
| V3 Session Management | no | unchanged |
| V4 Access Control | yes | RLS on every new table (`user_household_ids()` plus owner check), guard triggers verifying that referenced accounts, goals and series belong to the same household (errcode 42501), column-level grants |
| V5 Input Validation | yes | DB check constraints (amount range `<= 10^13`, name length 1..80, percent regex, type enums); client uses the engine parsers (`parseAmount`, `percent`) |
| V6 Cryptography | no | none added |
| V7/V8 Data protection | yes | Erasure: `on delete cascade`, export manifest entry for each table, pgTAP erasure case (GDPR right to erasure and portability, CLAUDE.md) |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-household goal/series link | Tampering / Elevation | Guard triggers check `household_id` equality (existing pattern in `guard_savings_goal`, `guard_debt`) |
| Client writes `is_safety_net`/`locked` out of rule | Tampering | Partial unique index; guard fixes safety-net locked; column grants limited |
| SQL injection via patch keys | Tampering | `apply_patches` allow-lists, `format('%I')` (existing) |
| Financial-advice claim in copy | Repudiation / compliance | Copy lint test; declarative voice; "FincWin is a planning tool, not a bank" footers |
| Prod data change by mistake | Tampering | Human-gated push, preflight `project_id` assertion, idempotent migration data step |

## Sources

### Primary (HIGH confidence, read in this session)
- `jest.config.js`, `jest.engine.config.js`, `package.json` scripts, `.dependency-cruiser.cjs`
- `src/engine/payoff/*` (amortise, simulateMinimum, futureValue, types, constants, index), `src/engine/money/{types,rounding}.ts`, `src/engine/recurring/schedule.ts`, `src/engine/transfer/pair.ts`
- `src/engine/decide/v3/{types,safetyNet}.ts`, `funds/*`, `src/features/decide/snapshot/v3/{buildV3Inputs,settingsSource}.ts`, `src/features/decide/pots/*`
- `supabase/migrations/20261016000100, 20261016000110, 20261024000100, 20261028000100/0500/0700, 20261103000200/0300/0800`, `20260926000400`
- `src/data/exportManifest.ts`, `scripts/check-cache-version.mjs`, `scripts/check-migration-compat.mjs`, `src/shell/tabBar/*`, `app/(app)/(tabs)/_layout.tsx`
- `.planning/phases/06-grow/{06-CONTEXT,06-UI-SPEC}.md`, `design/{LEDGER.md,areas-spec.md,calc.js}`; `.planning/research/DECIDE-FIX-PLAN.md` §5, BO-07; ROADMAP Phase 6; REQUIREMENTS GRW-01..11
- Executed `design/calc.js` to confirm fixtures (loan, strategy, payoff)

### Secondary (MEDIUM)
- Prior 05.4 plan texts for interim columns and right-answer workflow

### Tertiary (LOW)
- None. No web sources were needed; this phase is codebase-bound. Context7 was not used for the same reason (no new library).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new dependencies.
- Engine design (payoff, goal plan): HIGH, ported from a prototype whose outputs were re-run and match the ledger and the existing engine's rounding.
- Cost-basis method and contribution flow: MEDIUM, owner decisions pending (Q3, Q4).
- Decide change (D-05 unlocked-as-spare): MEDIUM, conflicts with today's envelope rule; Q1 must be answered before the engine wave.
- Supabase/apply_patches pitfalls: HIGH, read from the newest migrations.

**Research date:** 2026-11-06
**Valid until:** 2026-11-20 (the repo is moving fast: 05.4 merge and 05.5 run in parallel; re-check `apply_patches` newest definition and `decide_settings` columns before the migration task)

## Suggested plan groups (for the planner, not a mandate)

1. **Wave 1 (engines + contracts, no UI):** `payoff/fixedPayoff`, `strategies`, `compoundSteps`; `grow/goalPlan|lots|gain`; connection-point types and contract tests (red); jest threshold updates; shared LEDGER fixtures.
2. **Wave 2 (schema, [BLOCKING] push):** single migration for goals/series/debts/holdings/lots + `apply_patches` re-issue + D-07 data step + pgTAP; local pass; human-gated `npm run supabase:db:push`; cache version bump. Interim-column drop is a later migration after a floor bump.
3. **Wave 3 (Decide feed):** mapping in `buildV3Inputs`, engine change for locked/unlocked goals, new fact code and copy, right-answer cases, ENG-24 single payoff module, ARC-15 once-counted test.
4. **Wave 4 (data layer):** `src/db/*`, queries, mutations (goal money moves via transfer pairs, sale-closes-loan atomic write, value updates), export manifest, erasure test.
5. **Wave 5 (screens):** Grow tab shell and segments, goals + safety net + first-open sheet, debts + payoff plan, investing + lots, lines screen (per Q6).
6. **Wave 6 (Calculators group, D-21):** page + four typed calculators + three record-based calculators + "Make this the plan" sheet.
7. **Wave 7 (release):** flip `TAB_AVAILABILITY.grow`, copy lint, accessibility pass (font-scale matrix), device check on Pixel, preview-only OTA per release gates.
