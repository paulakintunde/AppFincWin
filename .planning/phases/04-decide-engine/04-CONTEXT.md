# Phase 4: Decide Engine - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The pure-TypeScript affordability engine in `src/engine/decide/`, plus `src/engine/payoff/` for amortisation, future value and the minimum-payment simulation. It takes a plain snapshot in and returns a verdict out. There is no React, no I/O and no database access.

It covers:
- payments and projections (`dpmt`, `dfv`, `dSimMin`)
- plan resolution for the four payment methods (`dplan`)
- the verdict with up to five ordered warnings (`dassess`)
- income and spending bases (`dmoney`)
- household share (`dshare`)
- largest-affordable-price bisection
- card eligibility, and secured-debt classification

**Scope widened in this discussion (D-19):** the options list, the four-way alternatives table (with its suppression of money that isn't genuinely spare) and the setbacks are built here as engine functions, and Phase 5 only renders them. So is the cash-level "first read" from rough figures (D-11), which Phase 5's DCU-10 consumes. These are recorded as requirements DEC-13…DEC-16.

Requirements: DEC-01…DEC-16.

Not in this phase:
- any screen or copy (Phase 5)
- persisting checks, limits or decisions (Phase 5)
- the snapshot builder that queries Supabase (Phase 5, in a non-engine layer)
- Grow's payoff planner UI (Phase 6), which will reuse `engine/payoff/`

</domain>

<decisions>
## Implementation Decisions

Decision numbers are local to this phase. "Phase 0 D-21" and "Phase 1 D-21" refer to those phases' CONTEXT.md files.

### Limits and defaults (no dollar assumptions)
- **D-01:** **The default cash cushion (reserve) is 3 months of the user's own costs**, replacing the prototype's fixed $6,000. The user can edit it.
- **D-02:** **"A month's costs" means average monthly spending plus minimum debt payments.** Saving and investing are excluded, because they can pause in an emergency. The same figure feeds the D-01 cushion.
- **D-03:** **In household scope, the cushion uses my share of household costs** under the resolved split rule (D-15). Personal scope uses my own costs.
- **D-04:** **Debt lines keep the prototype's values, and both are editable.**
  - Debt-service ratio: 36% of basis income.
  - Unsecured-debt line: 12 × average monthly income.
  - The prototype let the user edit only the 36%.
- **D-05:** **No hardcoded currency amounts anywhere in the engine.**
  - The investing floor and saving floor default to what the user already puts in each month. They replace the prototype's $1,000 and $500, and both are editable.
  - The card-minimum floor and the dealer card cap become fields on the card record and on the check respectively.
  - Where a default is unavoidable, it comes from a small per-market table (US, CA, UK) passed into the engine as input. It is not a constant in engine code.
- **D-06:** **The default projection return is 0%**, replacing the prototype's 6.5%. It applies to wait-and-save and to investing projections. Money set aside earns nothing unless the user enters a rate. This avoids implying a market return, which could read as a promise or as advice.
- **D-07:** **Card APR is never invented.** If a card payment has no APR (no card on record, or the card record has no rate), the plan is `missing` with a reason code. The prototype's 22.9% default is removed.

### What a month means
- **D-08:** **Spending comes from the average of recent full months**, not the current month (the prototype used `this.items`, the current month only). The average/worst basis the prototype offers for income is mirrored for spending, where "worst" means the highest-spending month.
- **D-09:** **The averaging window is the last 6 full months**, or fewer if fewer exist.
- **D-10:** **The current, unfinished month is excluded from all averages.** Its actual balances still count toward cash on hand.
- **D-11:** **The first read (DCU-10), built here as DEC-16:**
  - With no full month available, the engine accepts rough figures: a cash balance, rough monthly income and rough monthly spending.
  - It returns a **cash-level answer only**: whether cash covers the day-one cost, and whether the month still closes.
  - The answer carries a basis marker meaning "first read, from the figures you gave".
  - The full five-ledger verdict (debt lines, steadiness, investing squeeze) needs at least one real full month.
  - This settles the open Core Value question noted in ROADMAP Phase 5.
- **D-12:** **Short history.**
  - Below 3 full months, steadiness is `insufficient` ("not enough history yet").
  - In that case the income basis defaults to the worst month.
  - The coefficient-of-variation thresholds (under 0.06 Steady, under 0.22 Variable, else Volatile) apply only from 3 full months up.
  - One or two months must never be reported as Steady.
- **D-13:** **A month counts as "full" only if the data covers it from the 1st to the last day.** That coverage comes from continuous logging, or from an import whose statement period spans the month. Partial edge months from imports still count toward cash and records, but never toward the averages. The snapshot tells the engine which months are full. The engine doesn't infer it.

### Card, item and debt rules
- **D-14:** **Card eligibility reads an explicit item type on the check.** Suggested set: `vehicle`, `rent_bill`, `loan_repayment`, `tax`, `insurance_premium`, `general`. Blocked types are rent and bills, loan repayments, tax and premiums; `vehicle` is capped; `general` is allowed. The prototype's regex survives only as a pre-fill suggestion from the item name, outside the verdict path. This mirrors DEC-11, where `secured` is a field with the regex as an import default.
- **D-15:** **Household share uses the resolved split rule.** The rule is the purchase category's split default, falling back to the household rule, and it can be overridden per check. The engine receives the resolved rule and implements all four:
  - `even`
  - `weight`: weights summing to zero are an explicit guarded case
  - `amount`: per-person figures typed for this purchase
  - `mine`: share of 1
  The prototype handled only `even` and `weight`.
- **D-16:** **Minimum-payment terms come from the card record**: the minimum percent, whether interest is added, and a floor amount in the card's currency. They are pre-filled from the per-market defaults (D-05). Missing terms make the plan `missing` (D-07). The prototype's `max($25, 1% + interest)` is only the US default entry.
- **D-17:** **Never-clears is an explicit check every month.** The balance is flagged as never clearing as soon as a scheduled payment can't cover that month's interest (success criterion 2). A balance still open at the 600-month cap is reported as a separate outcome, "does not clear within 50 years". It is never inferred from hitting the cap.
- **D-18:** **Capped and blocked card payments.**
  - A `vehicle` item paid by card uses the card up to the dealer cap (a field on the check, defaulting from the per-market table). The part above the cap becomes a **day-one cash cost**, and the verdict tests it like any other. The prototype marked the whole plan `missing`.
  - A blocked item paid by card returns `missing` with reason code `card_not_accepted`, so the UI can explain it and offer another method.

### Engine scope, rounding, output and testing
- **D-19:** **The options list, the alternatives table and the setbacks are built in Phase 4.** They are pure functions in `engine/decide/` at 100% branch coverage (Phase 0 D-21). This covers:
  - The options list, in the brief's order: affordable price (bisected), longer term, cut a named expense line, earn more, save first, do without.
  - The four-way alternatives table: as planned, cheaper, wait and save, skip. Rows are **suppressed and labelled when the money isn't genuinely spare** (the brief's ethical rule, DCU-06).
  - The four setbacks, from the prototype's `DSB`: unexpected expense, income drops, job or client loss, invoices pay late.
  They are recorded as DEC-13 (options), DEC-14 (alternatives) and DEC-15 (setbacks).
- **D-20:** **Rounding follows Phase 1 D-21: one mode, half-up.**
  - Amortised payments round half-up per month, and the **final payment absorbs the residual**, so the total paid equals principal plus interest exactly.
  - All arithmetic is in integer minor units. APRs and ratios are held as scaled integers, not floats. The representation is left to the planner, consistent with `engine/money/rates.ts`.
  - Bisection runs on integer minor units to exactness, not 22 float iterations.
- **D-21:** **The engine outputs codes and numbers only.** That means a verdict state (`fits` / `adjust` / `no` / `missing`), warning codes (`month`, `cash`, `dsr`, `owe`, `inv`) with shortfall amounts, reason codes, and basis markers. It emits no English strings. Phase 5 maps the codes to the i18n catalogue, which is where DCU-09's no-advice rule is enforced and tested.
- **D-22:** **Golden parity tests against the prototype.**
  - Port the prototype's Decide scenarios as fixtures. Results must match within 1 minor unit.
  - Every deliberate deviation gets its own named test and a note in the test file. Examples: D-02 costs, D-06 return, D-07 APR, D-08 averages, D-17 cap outcome, D-18 cap remainder, and D-20 exact bisection.
  - Known amortisation tables and fast-check property tests cover the rest (brief §4 test focus).

### Claude's Discretion
- The snapshot and verdict types, file layout inside `engine/decide/` and `engine/payoff/`, and the scaled representation of APR and ratios.
- The exact per-market default table values for US, CA and UK (card minimum percent and floor, dealer cap). They must be sourced and cited in research, never invented. D-07 still forbids a default APR.
- How the "cut a named expense line" option picks its candidate lines, given category averages in the snapshot.
- The instalment path. The prototype returns `miss: true` unconditionally, which looks like a bug. The correct behaviour: `missing` only when the instalment amount or count is absent.
- Investment-mode (`dKind === 'invest'`) handling, which follows the prototype's branch unless research finds a problem.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decide engine specification
- `BUILD-PROMPT.md` §4: the function-by-function port table, test focus, the two required corrections, the five steps, and the alternatives and advice order.
- `FincWin United.dc.html` lines 3990–4120: `DSB` setbacks, `dshare`, `dpmt`, `dfv`, `dsecured`, `dseries`, `dmoney`, `dCardRate`, `dCardRule`, `dSimMin`, `dprice`, `downNet`, `dplan`, `dassess`, `dfits`.
- `FincWin United.dc.html` line 3466: the prototype's `dlim` defaults (reserve 6000, dsr .36, minInv 1000, minSave 500), replaced per D-01…D-05.
- `FincWin United.dc.html` lines 4596–4700: bisection, the options list (`adv`) and the alternatives table.

### Requirements and roadmap
- `.planning/REQUIREMENTS.md`: DEC-01…DEC-16; DCU-05, DCU-06, DCU-09 and DCU-10 (Phase 5 consumers of D-11, D-19 and D-21).
- `.planning/ROADMAP.md`: Phase 4 success criteria 1–5, and Phase 5 launch inputs (the first-read question, now settled by D-11).

### Prior decisions that bind this phase
- `.planning/phases/00-foundation/00-CONTEXT.md` D-21: 100% branch coverage on `engine/decide/`, `engine/payoff/`, `engine/money/` and `engine/split/`. Any ignore comment needs a stated reason.
- `.planning/phases/01-money-core/01-CONTEXT.md` D-21: one rounding mode (half-up, symmetric), with largest-remainder splits.
- `.planning/PROJECT.md` Constraints: engine purity (no imports from db, state, services, ui or react, enforced by dependency-cruiser), integer money, and the compliance voice.
- `.planning/research/LAUNCH-POSITIONING.md` §4: why the first read matters (the store name "FincWin: Can I Afford It?").

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engine/money/types.ts`: `Money`, `MinorUnits` and `CurrencyCode` brands. Constructors throw on non-integers.
- `src/engine/money/arithmetic.ts`: `add`, `subtract`, `negate`, `multiplyByInteger`, `sum`, `compare`, `isZero`.
- `src/engine/money/rounding.ts`: `divideHalfUp(bigint, bigint)`, the D-21 rounding primitive for amortisation and ratios.
- `src/engine/money/rates.ts`: the `ScaledRate` bigint pattern (`RATE_SCALE`), a model for scaled APRs and ratios.
- `src/engine/split/allocate.ts`: largest-remainder `allocate(total, weights)`, for `dshare`'s weight and even rules.
- `src/engine/time/localDate.ts`: local-date helpers for month boundaries and full-month detection inputs.
- `src/engine/guards/assertNever.ts`: exhaustive switches over payment methods, verdict states and warning codes.

### Established Patterns
- Engine modules are pure. dependency-cruiser gates CI and eslint-plugin-boundaries gives editor feedback.
- `jest.config.js` builds per-directory coverage thresholds from D-21. The `decide` and `payoff` folders are picked up automatically once they have source.
- fast-check property tests are already used in `engine/money` and `engine/split`.

### Integration Points
- Phase 5 builds the snapshot (months, balances, debts, cards, household, limits) outside `engine/` and renders the verdict codes.
- Phase 6 Grow reuses `engine/payoff/` (avalanche and snowball payoff projections).
- Phase 2 imports carry statement periods that feed D-13's full-month flag.

</code_context>

<specifics>
## Specific Ideas

- The never-clears test ("a card at 22.9% APR with a 1% minimum payment never clears") stays the single most important test. Under D-07 the 22.9% is test-fixture data, not a default.
- Record every deviation from the prototype in its golden test (D-22). The Phase 5 team and reviewers must be able to see why an answer differs from the design mock.

</specifics>

<deferred>
## Deferred Ideas

- Per-market default values beyond US, CA and UK: add them when the app ships to more markets.
- Other gray areas offered but not discussed: investment-mode checks, how open checks recompute, and where limits are stored (per user or per check). The last two are Phase 5 concerns.

</deferred>

---

*Phase: 04-decide-engine*
*Context gathered: 2026-09-26*
