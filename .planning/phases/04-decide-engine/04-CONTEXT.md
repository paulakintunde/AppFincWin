# Phase 4: Decide Engine - Context

**Gathered:** 2026-09-26
**Updated:** 2026-10-15 (D-23…D-35; amends D-01, D-03, D-05, D-08, D-11, D-12, D-15, D-16, D-22). D-36 and, for Phase 5 alignment, D-37…D-40 were added the same day.
**Status:** Ready for replanning. The 12 plans dated 2026-09-27 predate the 2026-10-15 update and must be revised before execution.

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
  - **Refined 2026-09-26 (user, at plan-check):** a card cleared in full at the next statement charges no interest, so it needs no APR. The APR is required, and `missing` with `card_apr_missing` returned when it is absent, only for the `months` and `minimum` payoff plans. No rate is ever invented.

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

### Update 2026-10-15: what changed since Record shipped recurring series, refunds and pending lines

Phase 02.2 added recurring series (weekly to yearly, `src/engine/recurring/`), refund flags, transfer pairing and pending/paid/skipped status on rows. None of these existed when D-02 and D-08 were written. Where a decision below amends an earlier one, the later decision wins.

#### Lumpy and scheduled bills
- **D-23:** **Non-monthly recurring bills are smoothed through their series** (amends D-08). For each series, its raw occurrences are removed from the monthly averages and its monthly equivalent is added instead (yearly ÷ 12, quarterly ÷ 3, and so on; weekly and fortnightly convert at 52/12 and 26/12). The verdict therefore no longer depends on whether a yearly bill happened to fall inside the 6-month window. The snapshot passes the series in. The smoothed figure also feeds "a month's costs" (D-02) and so the cushion (D-01).
- **D-24:** **Non-monthly series bills due in the next 90 days are deducted from cash before the cash/cushion test** (amends D-01's cash ledger). `cashAfter = cashOnHand − my day-one cost − my share of series bills due within 90 days of the check date`. Monthly-or-more-frequent series are not deducted, because the month test already covers them. The next due date is the first scheduled occurrence after the last paid occurrence, so a bill already paid this cycle is not deducted.
- **D-25:** **Only confirmed series count** for D-23 and D-24: series the user created or accepted in Record. Unaccepted `detect.ts` suggestions are ignored. The verdict rests only on what the user has confirmed.
- **D-26:** **A series uses its latest scheduled amount**, not an average of past occurrences, so a renewal price rise shows at once.

#### What a month's spending is
- **D-27:** **Refunds are netted against spending in the month they land.** A refund is never income, so it never raises the income basis or affects steadiness. A month's net spending is floored at 0.
- **D-28:** **Only `paid` lines count toward past months' figures.** `pending` and `skipped` lines in past full months are ignored. Upcoming bills are handled by D-24.
- **D-29:** **One-off spikes stay in.** No trimming or outlier handling: the averages and the worst month remain "from your last 6 months", exactly as logged.
- **D-30:** **The engine has no notion of past checks.** A purchase approved by an earlier check enters the snapshot only once it shows up in records (as a debt, a recurring series or logged lines). This keeps the engine stateless. The open-check recompute question stays with Phase 5.

#### Investment-mode checks (previously deferred)
- **D-31:** **Interest-bearing unsecured debt during an invest check yields a neutral fact code, never a warning.** If any unsecured debt has an APR above the projection return (D-06), the verdict carries a non-blocking basis code such as `debt_rate_exceeds_return`, with the highest such APR and the projection rate. It does not change `fits`/`adjust`/`no`. Phase 5 phrases it declaratively; it is not advice (DCU-09).
- **D-32:** **A recorded monthly investment then behaves like existing investing.** It joins `monthlyInvesting`: pausable, excluded from a month's costs (D-02), and counted towards the investing floor.
- **D-33:** **Invest checks never emit the `inv` warning.** Only `month` and `cash` apply (debt lines were already excluded, as in the prototype). New investing squeezing old investing is circular. This is a named deviation test (D-22).

#### Resolving contradictions in D-01…D-22
- **D-34:** **Two separate shares in household scope** (amends D-03 and D-15). My share of the household's *existing* spending (the cushion, the month ledger and the 90-day bills) comes from the household split rule, or from per-category shares the snapshot supplies. Only the *purchase* uses D-15's per-check resolved split. Overriding a purchase to `mine` must not change my share of the household's rent and groceries. Plan 04-07's single `resolveShare(scope)` applied to both is the defect this fixes.
- **D-35:** **Saving and investing are treated as pausable in the verdict, as D-02 already says** (amends DEC-06's state rule and the `inv` ledger). Let `pausable = monthlySaving + monthlyInvesting`.
  - `left ≥ 0` → the month closes; no `month` warning.
  - `left < 0` but `−left ≤ pausable` → state at most `adjust`. The `inv` warning carries the amount that would need to be paused, taken from investing first and then saving. A pause that stays at or above the D-05 floors is still reported, so the user sees it.
  - `−left > pausable` → `no`, with the `month` warning carrying the shortfall that remains after pausing everything.
  - `cashAfter < 0` remains `no`.
  - This replaces the prototype's behaviour, where `inv` could only ever duplicate `month` alongside a `no`. It is a named deviation test (D-22). The `inv` code covers saving too; Phase 5 decides the wording.
- **D-11 amended:** **The first read flags a cash level below the cushion.** The rough cushion is 3 × the rough monthly spending (mirroring D-01). `cashAfter ≥ 0` but below the rough cushion returns `adjust` with a `cash` warning, so the first read agrees with the full verdict once a real month exists. The first read is still cash-level only: no debt lines, steadiness or squeeze. Plan 04-08's "never `adjust`" is superseded.
- **D-12 amended:** **Short history is cautious on both sides.** Below 3 full months, the income basis is the worst (lowest) month *and* the spending basis is the highest-spending month.
- **D-16 clarified:** **The engine sees one currency per check.** The snapshot builder (Phase 5) converts card terms (floor), balances and figures into the check's home currency before calling the engine. The engine rejects mixed currencies rather than converting them.
- **D-36 (added 2026-10-15, from the Phase 5 quick-check discussion):** **The engine returns a purchase size code relative to the user's own money.** There are no dollar thresholds (D-05). The code is computed from the price paid in cash against this context:
  - `from_spare_this_month`: price ≤ `leftBefore` (this month's money left over, after saving and investing).
  - `from_savings`: otherwise, if `cashAfter` (with the D-24 deduction) is still ≥ the reserve.
  - `needs_spreading`: otherwise.
  It is returned on the verdict for every check, whatever the payment method. A first read computes it from the rough figures. It is a named test (D-22).
- **D-22 extended:** D-23, D-24, D-27, D-33, D-34, D-35 and the amended D-11/D-12 each get a named deviation test, in addition to the D-22 list.

#### Phase 5 alignment (added 2026-10-15 for Phase 5 alignment)

Phase 5's quick check and steps 2–5 (05-CONTEXT D-05…D-23, 05-UI-SPEC) render figures the engine did not yet return. These four decisions keep every such figure in the engine, as integer minor units and codes (D-20, D-21). See `04-PHASE5-ALIGNMENT.md`.

**Status: proposed by the alignment review and planned in full, pending the user's confirmation before execution.** The open points are D-37's floor at 0, D-38's pre-pause table, D-39's whole-month runway from cash after the purchase, and D-40's wait target; they are listed in `04-PHASE5-ALIGNMENT.md` "Still open". If the user chooses otherwise, only the named deviation tests and the formulas in 04-06 Task 3, 04-07 Task 4 and 04-10 Tasks 2–3 change.

- **D-37 (added 2026-10-15 for Phase 5 alignment):** **The engine resolves a buy check's price inputs.** This ports the prototype's `dprice` and `downNet`, which no plan had ported.
  - Final price = advertised price + every counted adjustment, floored at 0. "Adds to the price" counts as positive and "takes off the price" as negative.
  - `dayFees` = the counted adjustments that add to the price and are paid on the day (the prototype's rule).
  - Sales tax is a percentage the user types (05 D-23). It is applied to the advertised price with one half-up rounding and becomes a counted, on-the-day adjustment. There is no default tax rate (D-05; never invented, as D-07). Quick-check fees are a counted, on-the-day adjustment too.
  - Running costs net = counted running costs − counted replaced expenses. It may be negative.
  - The resolved figures feed `BuyCheck.price`, `dayFees` and `runningCostsNet` unchanged. So a Credit quick check (a loan with no deposit) pays tax and fees on day one and finances the advertised price.
- **D-38 (added 2026-10-15 for Phase 5 alignment):** **Every assessment returns the month line by line (Now/After) and the five ledgers as numbers.**
  - The month table rows are: money in, living expenses, debt payments, saving and investing, this purchase, and left. "This purchase" is my running costs on a buy check and my contribution on an invest check.
  - The table is **pre-pause**: in each column the rows sum exactly to that column's left (`leftBefore` and `left`). The pause is reported separately, through the `inv` warning and `investingAtRisk`/`savingAtRisk` (D-35). The prototype lowered the After "saving and investing" row by `investAtRisk` but kept the pre-pause left, so its rows did not add up. This is a named deviation test.
  - The five ledgers (income, expenses, debt, cash, investments) each carry Now, After and a direction code (`better`, `worse` or `same`):
    - Debt is the total balance owed, plus my share of the amount financed.
    - Cash Now is the cash left after bills due within 90 days (D-24), so the change shown is the purchase alone.
    - Investments After on a buy check is the monthly investing left after any pause. On an invest check there is no pause relief (D-33), so it is the current monthly investing plus the contribution.
- **D-39 (added 2026-10-15 for Phase 5 alignment):** **Runway is a whole number of months: `floor(max(0, cashAfter) / burn)`, or null when `burn` ≤ 0.**
  - `cashAfter` already has the purchase and the D-24 bills taken off. `burn` is the monthly outgoings after the purchase, without saving or investing (D-02).
  - The prototype divided cash *before* the purchase by burn and showed one decimal. The engine uses cash after the purchase, because the setbacks section tests cash "with this purchase already running". It rounds down, so runway is never overstated.
  - This is a named deviation test.
- **D-40 (added 2026-10-15 for Phase 5 alignment):** **The engine computes the wait-and-save plan** (05 D-10; the prototype's step-5 wait panel).
  - Waiting means buying outright later. So the target on a buy check = max(0, my part of the price − spare cash), where spare cash = max(0, `cashAvailable` − reserve), as in the alternatives (D-24). With the default amount, the months equal the alternatives' wait-and-save `monthsToBuy`. On an invest check the target is the amount.
  - The prototype's target was max(`mineCash`, …). For a cash purchase that made the target the whole price, even when cash above the cushion already covered most of it. It also disagreed with its own wait row. This is a named deviation test.
  - The monthly amount is the user's choice. It defaults to the monthly surplus before the purchase, max(0, `leftBefore`).
  - Months = max(1, ⌈target ÷ amount⌉), or null when the amount is 0.
  - Ready-by = `asOf` + that many calendar months, clamped to the month's end by the recurring-schedule rule.
  - `withinSpare` = amount ≤ max(0, `leftBefore`).
  - The prototype's 25.00 minimum amount and its rounding are currency constants, so they are removed (D-05). The slider's step and bounds are UI.

### Claude's Discretion
- How the snapshot carries series (frequency, latest amount, next due date, which rows each series covers) for D-23 and D-24.
- The exact name and payload of the D-31 basis code.
- The snapshot and verdict types, file layout inside `engine/decide/` and `engine/payoff/`, and the scaled representation of APR and ratios.
- The exact per-market default table values for US, CA and UK (card minimum percent and floor, dealer cap). They must be sourced and cited in research, never invented. D-07 still forbids a default APR.
- How the "cut a named expense line" option picks its candidate lines, given category averages in the snapshot.
- The instalment path. The prototype returns `miss: true` unconditionally, which looks like a bug. The correct behaviour: `missing` only when the instalment amount or count is absent.
- Investment-mode (`dKind === 'invest'`) handling follows the prototype's branch, as amended by D-31…D-33.

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

### Record data the 2026-10-15 update depends on
- `src/engine/recurring/schedule.ts`: `RecurringFreq` and schedule maths, for D-23 smoothing and D-24 next due dates.
- `src/engine/recurring/detect.ts`: suggested series. These are excluded from the verdict (D-25).
- `src/engine/recurring/cloneMonth.ts`: row shape with `status` (`pending`/`paid`/`skipped`), `is_refund`, `transfer_id` and `recurring_series_id`, for D-27 and D-28.
- `src/engine/transfer/`: transfer pairing. Transfer legs are not spending.

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
- Gray areas offered but not discussed: how open checks recompute, and where limits are stored (per user or per check). Both are Phase 5 concerns. Investment-mode checks were settled on 2026-10-15 (D-31…D-33).
- User-marked "one-off, won't recur" lines excluded from averages (considered for D-29, not chosen). This would need a new row field and Record UI.

</deferred>

---

*Phase: 04-decide-engine*
*Context gathered: 2026-09-26*
