# Phase 4: Decide Engine - Research

**Researched:** 2026-09-26
**Domain:** Pure-TypeScript financial affordability engine (amortisation, revolving-debt simulation, verdict assessment, bisection search) on integer minor units
**Confidence:** HIGH on architecture/rounding/testing patterns (built on Phase 0/1 precedent already in this repo); MEDIUM-LOW on per-market default *numbers* (issuer/regulator variance is real and is disclosed per-value below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary:** The pure-TypeScript affordability engine in `src/engine/decide/`, plus `src/engine/payoff/` for amortisation, future value and the minimum-payment simulation. It takes a plain snapshot in and returns a verdict out. There is no React, no I/O and no database access. Covers: payments and projections (`dpmt`, `dfv`, `dSimMin`), plan resolution for the four payment methods (`dplan`), the verdict with up to five ordered warnings (`dassess`), income and spending bases (`dmoney`), household share (`dshare`), largest-affordable-price bisection, card eligibility, and secured-debt classification. Scope widened to include: the options list, the four-way alternatives table (with suppression of money that isn't genuinely spare), the setbacks, and the cash-level "first read" from rough figures (D-11) — recorded as DEC-13...DEC-16. Not in this phase: any screen or copy (Phase 5), persisting checks/limits/decisions (Phase 5), the Supabase snapshot builder (Phase 5), Grow's payoff planner UI (Phase 6, reuses `engine/payoff/`).

**Limits and defaults (no dollar assumptions):**
- **D-01:** The default cash cushion (reserve) is 3 months of the user's own costs, replacing the prototype's fixed $6,000. Editable.
- **D-02:** "A month's costs" = average monthly spending plus minimum debt payments. Saving/investing excluded (can pause in emergency). Feeds D-01.
- **D-03:** In household scope, the cushion uses my share of household costs under the resolved split rule (D-15). Personal scope uses my own costs.
- **D-04:** Debt lines keep the prototype's values, both editable: debt-service ratio 36% of basis income; unsecured-debt line 12x average monthly income. Prototype let the user edit only the 36%.
- **D-05:** No hardcoded currency amounts anywhere in the engine. Investing/saving floors default to what the user already puts in each month (replacing $1,000/$500), editable. Card-minimum floor and dealer card cap become fields on the card record / the check respectively. Where a default is unavoidable, it comes from a small per-market table (US, CA, UK) passed into the engine as input — never a constant in engine code.
- **D-06:** Default projection return is 0%, replacing the prototype's 6.5%. Applies to wait-and-save and investing projections.
- **D-07:** Card APR is never invented. No APR on record -> plan is `missing` with a reason code. Prototype's 22.9% default removed.

**What a month means:**
- **D-08:** Spending comes from the average of recent full months, not the current month. Average/worst basis mirrors income; "worst" for spending means the highest-spending month.
- **D-09:** Averaging window is the last 6 full months, or fewer if fewer exist.
- **D-10:** The current, unfinished month is excluded from all averages. Its actual balances still count toward cash on hand.
- **D-11:** The first read (DCU-10), built here as DEC-16: with no full month, the engine accepts rough figures (cash balance, rough monthly income, rough monthly spending) and returns a cash-level answer only (cash covers day-one cost; month still closes), carrying a basis marker "first read, from the figures you gave". The full five-ledger verdict needs at least one real full month.
- **D-12:** Below 3 full months, steadiness is `insufficient`; income basis defaults to worst month. CV thresholds (< 0.06 Steady, < 0.22 Variable, else Volatile) apply only from 3 full months up. One or two months must never report Steady.
- **D-13:** A month counts as "full" only if data covers it 1st-to-last-day (continuous logging or an import whose statement period spans the month). The snapshot tells the engine which months are full; the engine doesn't infer it.

**Card, item and debt rules:**
- **D-14:** Card eligibility reads an explicit item type on the check: `vehicle`, `rent_bill`, `loan_repayment`, `tax`, `insurance_premium`, `general`. Blocked: rent/bills, loan repayments, tax, premiums. `vehicle` capped. `general` allowed. The prototype's regex survives only as a pre-fill suggestion outside the verdict path.
- **D-15:** Household share uses the resolved split rule (purchase category default -> household rule -> per-check override). Engine implements all four: `even`; `weight` (weights summing to zero is an explicit guarded case); `amount` (per-person figures typed for this purchase); `mine` (share of 1). Prototype handled only `even` and `weight`.
- **D-16:** Minimum-payment terms come from the card record: minimum percent, whether interest is added, floor amount in the card's currency. Pre-filled from per-market defaults (D-05). Missing terms -> `missing` (D-07). Prototype's `max($25, 1% + interest)` is only the US default entry.
- **D-17:** Never-clears is an explicit check every month: balance flagged as soon as a scheduled payment can't cover that month's interest. A balance still open at the 600-month cap is a separate outcome, "does not clear within 50 years" — never inferred from hitting the cap.
- **D-18:** A `vehicle` item paid by card uses the card up to the dealer cap (a field on the check, defaulting from the per-market table); the part above the cap becomes a day-one cash cost, tested like any other cost (prototype marked the whole plan `missing` — corrected here). A blocked item paid by card returns `missing` with reason code `card_not_accepted`.

**Engine scope, rounding, output and testing:**
- **D-19:** The options list, alternatives table and setbacks are built in Phase 4, as pure functions in `engine/decide/` at 100% branch coverage. Options list order: affordable price (bisected), longer term, cut a named expense line, earn more, save first, do without. Four-way alternatives: as planned, cheaper, wait and save, skip — rows suppressed and labelled when money isn't genuinely spare (DCU-06). Four setbacks from `DSB`: unexpected expense, income drops, job or client loss, invoices pay late. Recorded as DEC-13 (options), DEC-14 (alternatives), DEC-15 (setbacks).
- **D-20:** Rounding follows Phase 1 D-21: one mode, half-up. Amortised payments round half-up per month; the final payment absorbs the residual so total paid = principal + interest exactly. All arithmetic in integer minor units; APRs/ratios held as scaled integers, not floats (representation left to the planner, consistent with `engine/money/rates.ts`). Bisection runs on integer minor units to exactness, not 22 float iterations.
- **D-21:** The engine outputs codes and numbers only: verdict state (`fits`/`adjust`/`no`/`missing`), warning codes (`month`, `cash`, `dsr`, `owe`, `inv`) with shortfall amounts, reason codes, basis markers. No English strings. Phase 5 maps codes to the i18n catalogue (DCU-09 enforced there).
- **D-22:** Golden parity tests against the prototype: port Decide scenarios as fixtures, results match within 1 minor unit. Every deliberate deviation gets its own named test and a note. Examples: D-02 costs, D-06 return, D-07 APR, D-08 averages, D-17 cap outcome, D-18 cap remainder, D-20 exact bisection. Known amortisation tables and fast-check property tests cover the rest.

### Claude's Discretion
- The snapshot and verdict types, file layout inside `engine/decide/` and `engine/payoff/`, and the scaled representation of APR and ratios.
- The exact per-market default table values for US, CA and UK (card minimum percent and floor, dealer cap). Must be sourced and cited in research, never invented (see Standard Stack / Per-Market Defaults below). D-07 still forbids a default APR.
- How the "cut a named expense line" option picks its candidate lines, given category averages in the snapshot.
- The instalment path: prototype returns `miss: true` unconditionally (looks like a bug). Correct behaviour: `missing` only when the instalment amount or count is absent.
- Investment-mode (`dKind === 'invest'`) handling, follows the prototype's branch unless research finds a problem.

### Deferred Ideas (OUT OF SCOPE)
- Per-market default values beyond US, CA and UK: add when the app ships to more markets.
- Investment-mode checks, how open checks recompute, where limits are stored (per user or per check) — Phase 5 concerns.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEC-01 | Amortised monthly payment for principal/APR/term incl. zero-rate | Integer Amortisation section, Code Examples §1; reference table cross-check |
| DEC-02 | Future value of monthly contribution + seed incl. zero-rate | Code Examples §2 (integer FV, zero-rate branch) |
| DEC-03 | Minimum-payment simulation, correct never-clears report | dSimMin Rework section, Code Examples §3; the 22.9%/1% fixture |
| DEC-04 | Resolve 4 payment methods into a comparable plan | dplan Rework section (Architecture Patterns), instalment-path correction |
| DEC-05 | Flag plan incomplete when terms unspecified | dplan Rework — `missing` reason codes table |
| DEC-06 | Verdict fits/adjust/no/missing, <=5 warnings ordered by shortfall | dassess Rework section, warning-code ordering example |
| DEC-07 | Income steadiness from CV across logged months | dmoney Rework section — integer CV without float sqrt |
| DEC-08 | Household cost share under active split rule | dshare / allocate() reuse section |
| DEC-09 | Largest affordable price by bisection, both edge cases | Bisection on Integers section — monotonicity argument + termination proof |
| DEC-10 | Card eligibility: blocked/capped/permitted | Card Eligibility section (D-14 explicit field, D-18 capped-remainder) |
| DEC-11 | Secured debt from a field, not name-matching | dsecured Rework — `secured: boolean` field, regex as import default only |
| DEC-12 | No React/I/O/DB; snapshot in, verdict out | Architecture Patterns — module layout, dependency-cruiser boundary |
| DEC-13 | Options list in specified order | Options List section |
| DEC-14 | Four-way alternatives with suppression of non-spare money | Alternatives Table section |
| DEC-15 | Four setbacks re-assess a plan | Setbacks section |
| DEC-16 | Cash-level first read from rough figures | First Read (D-11) section |
</phase_requirements>

## Summary

This phase ports roughly a dozen tightly-coupled pure functions from the prototype's `Component` class (HTML lines 3990-4120 and 4590-4720) into `src/engine/decide/` and `src/engine/payoff/`, replacing every float operation with integer-minor-unit / scaled-bigint arithmetic and replacing every hardcoded dollar default with a value carried on the snapshot. The prototype is unusually good specification material — it is a single, dense, working reference implementation with real behaviour (including a real bug: `dplan`'s instalment path always sets `miss: true`) — so the job here is disciplined, tested translation, not fresh design. Three engineering problems dominate: (1) computing an exact, auditable amortised payment and future value in integer minor units without a bignum library, matching the standard annuity formula; (2) classifying income steadiness from a coefficient of variation without ever taking a float square root of money; and (3) running the largest-affordable-price search as an exact integer bisection over a predicate (`dfits`) that must be shown monotone, including across the `vehicle` dealer-cap discontinuity.

The per-market default table (US/CA/UK card-minimum formulas and floors, and dealer card caps) is the one area where authoritative sources genuinely disagree by issuer and by province, so every number below is cited with its confidence level and the disagreement is disclosed rather than smoothed over — this table is data passed into the engine, never invented inside it (D-05, D-07).

**Primary recommendation:** build `engine/payoff/` (dpmt, dfv, dSimMin, bisection) as the foundation layer on scaled-bigint rates using the existing `ScaledRate`/`divideHalfUp` pattern from `engine/money/rates.ts`, then build `engine/decide/` (dplan, dassess, dmoney, dshare, options, alternatives, setbacks, first-read) on top of it, porting the prototype's control flow function-by-function with golden-fixture tests proving parity within 1 minor unit and named deviation tests for every D-0x correction.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Amortised payment / FV / min-payment simulation (`engine/payoff/`) | Engine (pure TS) | — | No I/O, reused by Phase 6 Grow; must be independently testable |
| Plan resolution, verdict, warnings, share, options/alternatives/setbacks (`engine/decide/`) | Engine (pure TS) | — | DEC-12 mandates zero React/I/O/DB; Phase 5 only renders codes |
| Snapshot construction (months, balances, cards, household, limits) | API/Backend-equivalent (non-engine `src/` layer) | — | Explicitly Phase 5's job; queries Supabase, outside this phase |
| Per-market default table storage/editing | Database / Storage | Engine (consumer only) | Table is data the engine receives as input, never a constant it owns |
| Verdict-code -> copy mapping (i18n) | Frontend (React Native UI layer) | — | DCU-09's no-advice rule is enforced and tested in Phase 5, not here |
| Card/loan record fields (`secured`, min-percent, floor, interest-added flag) | Database / Storage | Engine (consumer only) | Fields live on records built in earlier phases; engine only reads them |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `~6.0.3` (installed, `strict: true`) [VERIFIED: package.json] | Language | Already the project standard; native `bigint` is the only numeric primitive this phase needs |
| Jest | `~29.7.0` pinned via `jest-expo` preset [VERIFIED: package.json, `npm view jest version` returns 30.5.2 as latest but the project pins 29.7.0 through the Expo preset — do not bump independently] | Test runner | Already wired with per-directory coverage thresholds keyed off folder presence (`jest.config.js`); `decide/` and `payoff/` thresholds activate automatically once source exists |
| fast-check | `^4.10.2` [VERIFIED: package.json states `^4.10.2`; `npm view fast-check version` returns `4.10.2` as latest — installed range already covers current] | Property-based testing | Already used in `engine/split/__tests__/allocate.test.ts` for exact-sum and monotonicity-style properties; same pattern applies to payment monotonicity, FV monotonicity, bisection correctness |
| `@fast-check/jest` | `^2.3.0` [VERIFIED: package.json] | Jest integration for fast-check | Already a devDependency; optional convenience wrapper, not required |

No new packages are needed for this phase. It is pure `src/engine/` TypeScript consuming only `bigint`, existing `engine/money/`, `engine/split/`, `engine/time/` and `engine/guards/` primitives, and the two already-installed test libraries above. **Do not modify `package.json` or lockfiles** (per this session's scope) — nothing here requires it.

### Supporting
None. Every primitive this phase needs (rounding, scaled rates, largest-remainder split, exhaustive-switch guard, local-date/month math) already exists in the codebase — see Reusable Assets below.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled bigint fixed-point for `(1+r)^n` | `decimal.js` / `big.js` / `dinero.js` | Would need a new dependency (blocked this session — no package.json edits; also not previously vetted for the engine-purity boundary). The existing `ScaledRate` bigint pattern in `engine/money/rates.ts` already solves the identical problem (FX rates) with no library, so continuing that precedent is the lower-risk, zero-new-dependency path |
| Bisection via `dfits` predicate on integers | A closed-form inverse of `dassess` | `dassess` folds together five non-linear ledgers (cash, dsr, unsecured-debt, investment-squeeze, month-closes) with warnings and a card-cap discontinuity; there is no tractable closed form. Bisection on a monotone predicate is the standard technique here and is what the prototype already does (just on floats) |
| Integer CV comparison via squared quantities (below) | `Math.sqrt` on a float derived from money | Float sqrt is a classification input only (Steady/Variable/Volatile), not a stored money value, so it is not a D-21-forbidden "float on a money path" in the strict sense — but squaring avoids it entirely at negligible extra code, removing any need to argue the exception. Recommended over allowing the sqrt |

**Installation:** none required.

**Version verification:** `jest`, `fast-check`, `@fast-check/jest`, and `typescript` versions above were read directly from the installed `package.json` and cross-checked against `npm view <pkg> version` on 2026-09-26. Note the discrepancy: CLAUDE.md's stack notes assume "Jest 30.x line," but this repo's `jest-expo` preset pins `jest@~29.7.0` — the planner should treat 29.7.0 as ground truth for this phase, not the 30.x assumption, since bumping it independently of `jest-expo` risks preset incompatibility and is out of scope for a research-only, no-lockfile-edit session.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │   Snapshot (plain object)    │
                         │  built by Phase 5, non-engine │
                         │  months[], cards[], loans[],  │
                         │  household, limits, market    │
                         │  defaults, item+payment input │
                         └──────────────┬───────────────┘
                                        │  in
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │                    engine/decide + engine/payoff            │
        │                                                             │
        │  dmoney(snapshot)        → income/spending basis, CV,       │
        │                             steadiness, insufficient flag    │
        │        │                                                    │
        │        ▼                                                    │
        │  dshare(household)      → this-user's cost share (0..1)     │
        │        │                                                    │
        │        ▼                                                    │
        │  dplan(item,payment)  ──uses──▶ dpmt / dfv / dSimMin        │
        │   (payoff/)               (amortise, project, simulate       │
        │        │                   minimum-payment revolving debt)   │
        │        ▼                                                    │
        │  dassess(plan, money, share, limits)                        │
        │        │        → 5-ledger check, up to 5 ordered warnings, │
        │        │           verdict state fits/adjust/no/missing      │
        │        ▼                                                    │
        │  ┌─────────────┬──────────────┬───────────────┐             │
        │  ▼             ▼              ▼               ▼             │
        │ bisect        options()     alternatives()   setbacks()     │
        │ (dfits         (advice        (4-way table,    (re-assess   │
        │  predicate)     order,         suppression      plan under  │
        │                 uses bisect)   of non-spare)    4 scenarios)│
        └───────────────────────────────┬───────────────────────────┘
                                        │  out
                                        ▼
                         ┌─────────────────────────────┐
                         │  Verdict (codes + numbers)    │
                         │  state, warnings[], reasons,   │
                         │  basis markers, options[],      │
                         │  alternatives[], setback results│
                         └─────────────────────────────┘
                                        │
                                        ▼
                          Phase 5 (non-engine): maps codes
                          to i18n copy, renders screens
```

Entry point is always a plain snapshot object; the only branch point that matters architecturally is `dKind` (buy vs invest), which changes what `dplan` and `downNet` compute but not the overall pipeline shape.

### Recommended Project Structure
```
src/engine/
  payoff/
    amortise.ts        # dpmt: integer amortised payment, incl. r=0 branch
    futureValue.ts      # dfv: integer FV of contribution + seed, incl. n=0/r=0
    simulateMinimum.ts  # dSimMin: revolving minimum-payment simulation, never-clears
    types.ts            # ScaledRate reuse, PayoffResult types
    __tests__/
  decide/
    money.ts            # dmoney: CV/steadiness/basis from logged months
    share.ts            # dshare: household split resolution (uses engine/split/allocate)
    cardRule.ts         # dCardRule + D-14 explicit item-type eligibility
    secured.ts          # dsecured -> reads `secured` field; regex as import-default helper only
    plan.ts             # dplan: resolves 4 payment methods into a comparable plan
    assess.ts           # dassess: 5-ledger verdict + up to 5 ordered warnings
    bisect.ts           # integer largest-affordable-price search using dfits
    options.ts          # DEC-13 options list (bisected price, term, cut-line, earn, save, without)
    alternatives.ts     # DEC-14 four-way alternatives table + suppression rule
    setbacks.ts         # DEC-15 four setbacks re-assessment
    firstRead.ts         # DEC-16 cash-level first read (D-11)
    types.ts            # Snapshot, Verdict, WarningCode, ReasonCode, BasisMarker discriminated unions
    __tests__/
      golden/            # ported prototype fixtures (D-22), matched within 1 minor unit
      deviations/         # one named test file per D-0x deviation from the prototype
```

### Pattern 1: Scaled-bigint rate reuse for APR
**What:** Represent APR (and the 1%/2%/5% card-minimum percentages, and the DSR 36% line) as `ScaledRate` bigints using the existing `RATE_SCALE = 10` pattern from `engine/money/rates.ts`, not as floats and not as a new ad-hoc scale.
**When to use:** Any ratio (APR/1200 monthly rate, minimum-payment percent, DSR threshold, CV thresholds) that currently appears as a JS float literal in the prototype.
**Example:**
```typescript
// Source: existing src/engine/money/rates.ts pattern (RATE_SCALE, ScaledRate, divideHalfUp)
import { divideHalfUp } from '../money/rounding';
import type { ScaledRate } from '../money/rates'; // reuse the branded type + RATE_SCALE constant

// apr is a ScaledRate representing e.g. "22.9" as 229000000000n (RATE_SCALE=10)
// monthly rate r = apr / 1200, computed once as a ScaledRate via divideHalfUp
```

### Pattern 2: Golden-fixture parity testing (D-22)
**What:** Extract concrete input/output pairs from running the prototype's own functions (by hand or via a small Node harness that evaluates the relevant prototype JS in isolation) for a representative matrix of month-histories x payment-methods x limit-settings, store as fixture JSON, and assert the ported integer engine matches within 1 minor unit (converting the prototype's float dollars to minor units for comparison).
**When to use:** Every ported function (`dpmt`, `dfv`, `dSimMin`, `dplan`, `dassess`, `dmoney`, `dshare`, bisection).
**Example:**
```typescript
// Pattern already established: src/engine/split/__tests__/allocate.test.ts mixes
// exact-value assertions with a fast-check property block in the same file.
// For Decide, add a third layer: golden fixtures loaded from JSON, e.g.
import fixtures from './golden/dpmt-cases.json';
describe.each(fixtures)('dpmt golden parity: $name', ({ principal, aprBp, months, expectedMinor }) => {
  it('matches the prototype within 1 minor unit', () => {
    const got = dpmt(minorUnits(principal), parseRate(aprBp), months);
    expect(Math.abs(got - expectedMinor)).toBeLessThanOrEqual(1);
  });
});
```

### Pattern 3: Squared-quantity CV comparison (avoids float sqrt on money)
**What:** Compare `cv < threshold` by comparing `variance` against `threshold^2 * mean^2` in bigint, never computing an actual float square root of a money-derived value.
**When to use:** `dmoney`'s steadiness classification (DEC-07).
**Example:** see Code Examples section below.

### Pattern 4: Integer bisection over a monotone predicate
**What:** Replace the prototype's fixed 22-iteration float bisection with an exact integer binary search that terminates when `hi - lo <= 1`, returning `lo` as the largest minor-unit price for which `dfits` holds.
**When to use:** DEC-09's largest-affordable-price search, and internally wherever `options.ts` needs "the bisected affordable price."
**Example:** see Code Examples section below.

### Anti-Patterns to Avoid
- **Re-deriving `never-clears` from hitting the 600-month cap:** D-17 requires an *explicit* per-month check (`payment <= interest that month`). A balance that is merely still open at month 600 without ever triggering that check is a *different*, separate outcome ("does not clear within 50 years"). Conflating the two loses information the UI needs (Phase 5) and contradicts the phase's own success criterion 2.
- **Hardcoding the 22.9% APR or the $25/1%/$6,000/$1,000/$500/6.5% prototype constants anywhere in `engine/decide` or `engine/payoff` source:** D-05/D-06/D-07 forbid this outright; these values may appear only in test fixtures (as explicit fixture data, commented as such) or in the per-market default table the snapshot carries in.
- **Computing `dsecured` by regex on the loan name in the verdict path:** D-11 (this phase's numbering)/DEC-11 require a `secured: boolean` field read from the record; the regex may only exist as an import-time default-suggestion helper called from outside the engine's verdict path (or, if kept in-engine for convenience, never invoked by `dassess`/`dmoney`).
- **Marking the whole card plan `missing` when a `vehicle` item exceeds the dealer cap:** D-18 corrects this prototype behaviour — the excess becomes a day-one cash cost that flows into the normal verdict math, not an automatic `missing`.
- **Unconditional `miss: true` on the instalment path:** the Claude's Discretion item explicitly flags this prototype line as a bug; `missing` should trigger only when the instalment amount or count is absent from the input.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Half-up rounding of any division | A new rounding helper in `engine/decide` or `engine/payoff` | `divideHalfUp` from `engine/money/rounding.ts` | D-20 requires the *one* rounding mode defined once (Phase 1 D-21); a second implementation risks silent divergence and fails the "one mode" contract |
| Scaled-rate representation for APR/percentages | A bespoke fixed-point scale for this phase | `ScaledRate` / `RATE_SCALE` pattern from `engine/money/rates.ts` | Consistency with the FX-rate precedent already reviewed and tested; D-20 explicitly says representation should be "consistent with `engine/money/rates.ts`" |
| Household cost splitting (`weight`, `even`) | A new split function in `engine/decide/share.ts` | `allocate()` from `engine/split/allocate.ts` | Already implements largest-remainder splitting with a deterministic tie-break and 100%-branch-covered tests; `dshare`'s job is only to resolve *which* weights/amounts to pass in per D-15's four rules, not to re-implement splitting arithmetic |
| Month/full-month date math | Ad hoc string slicing on dates inside `dmoney` | `monthOf`, `monthRange`, `isValidLocalDate` from `engine/time/localDate.ts` | Already handles calendar edge cases (Feb 30, leap years) correctly; D-13 says the engine receives full-month flags on the snapshot rather than inferring them, so date math needs are limited to comparison/ordering, which these helpers already support |
| Exhaustive switch over verdict states / warning codes / payment methods | Untyped `if/else` chains with a fallback `else` | `assertNever()` from `engine/guards/assertNever.ts` | Turns a missed case into a compile-time error; directly supports the 100%-branch-coverage gate by making "forgot a case" a build failure rather than a coverage gap discovered late |
| Compound-interest exponentiation `(1+r)^n` on money-scale precision | A new bignum/decimal dependency | Bigint fixed-point exponentiation-by-squaring at `RATE_SCALE` precision, following the `ScaledRate` pattern already used for FX cross-rates in `rates.ts` | No new dependency is possible this session (no package.json edits), and none is actually necessary — the existing scaled-bigint approach in `rates.ts` already solves an equivalent problem (precise ratio arithmetic with one final rounding) |

**Key insight:** almost everything this phase needs already exists in `engine/money/`, `engine/split/`, `engine/time/` and `engine/guards/` from Phases 0-1. The actual new engineering surface is narrow: bigint compound-interest exponentiation, the revolving-minimum-payment simulation loop, the five-ledger `dassess` warning ordering, and the integer bisection — everything else is composition of existing, already-tested primitives.

## Common Pitfalls

### Pitfall 1: Float drift in a 600-month amortisation/simulation loop
**What goes wrong:** The prototype's `dSimMin` and `dpmt`/`dfv` use JS floats throughout; over up to 600 iterations (D-17's 50-year cap), float error compounds and can flip a "just barely clears" case into "never clears" or vice versa.
**Why it happens:** `Math.pow`, float division, and repeated float addition of interest are all lossy at the bit level, and money math has no tolerance for that (this is literally the engine that tells someone whether they can afford a car).
**How to avoid:** All loop state (balance, interest accrued, payment) stays as `MinorUnits`/bigint throughout; only convert to a display number at the very end (Phase 5's job, not this phase's). Round half-up once per month per D-20.
**Warning signs:** A golden-fixture test passes at small balances/short terms but drifts by more than 1 minor unit at large balances or 600-month runs — a sign a float crept back in somewhere in the loop.

### Pitfall 2: Treating "hit the 600-month cap" and "never clears" as the same outcome
**What goes wrong:** Reporting every balance still open at month 600 as "never clears" collapses two genuinely different situations: a balance that mathematically can never clear (payment <= interest, D-17) versus one that would clear eventually but takes longer than the simulation horizon.
**Why it happens:** The prototype's loop only sets `never: true` inside the `real <= i + 0.01` branch, but that condition is checked *inside* the loop before the cap — however, a naive integer port could easily lose this distinction by only checking at the end.
**How to avoid:** Implement the never-clears check as its own explicit per-iteration condition (`payment <= interestThisMonth`) that can fire on any month, independent of the 600-month cap; the cap is a separate, later check ("still open after 600 months and never-clears never fired").
**Warning signs:** A fixture case with `apr = 22.9%`, `minPercent = 1%` — success criterion 2's canonical case — must report `never: true` well before month 600 (the balance grows because the payment is a fixed percent+interest formula whose interest component alone can exceed the payment at high enough rates; verify this arithmetically for the specific fixture chosen, since not every "1% minimum" balance never clears — only ones where minimum-payment growth cannot outpace interest accrual).

### Pitfall 3: Float square root on a CV comparison silently violating "integers everywhere"
**What goes wrong:** Porting `dmoney`'s `Math.sqrt(...)` literally reintroduces a float into a money-derived calculation, which is defensible as "classification only" but is easy to get subtly wrong (float sqrt of a bigint-derived variance requires an unsafe `Number()` cast first) and invites exactly the kind of "one float slipped through" bug D-20/D-21 exist to prevent.
**Why it happens:** Coefficient of variation inherently involves a square root in its textbook definition.
**How to avoid:** Never take the square root at all — compare `variance` (sum of squared deviations, computed and summed as bigint, divided by n) against `threshold^2 * mean^2` instead of comparing `sqrt(variance)/mean` against `threshold`. This is a pure order-preserving algebraic transform for `mean > 0` (see Code Examples §CV below) and needs no float at any point.
**Warning signs:** Any `Math.sqrt(` appearing inside `src/engine/decide/money.ts` should be treated as a review flag.

### Pitfall 4: Bisection non-monotonicity across the dealer-cap discontinuity
**What goes wrong:** `dfits(price)` depends on `dplan(price)` which, for `payment === 'card'` and item type `vehicle`, has a kink at `price === dealerCap` (below the cap, the whole amount goes through the card's minimum-payment/instalment math; above it, the excess becomes a 1:1 day-one cash cost). If the transition were ever non-monotone, integer bisection would silently return a wrong "largest affordable price."
**Why it happens:** Piecewise-defined cost functions are the classic bisection failure mode; the prototype never proved monotonicity, it just ran fixed 22 float iterations and accepted whatever came out.
**How to avoid:** Reason through both sides of the discontinuity (see Bisection section below) and, critically, add a fast-check property test that generates prices spanning the cap and asserts the total "monthly + day-one" burden from `dplan`/`dassess` is non-decreasing in `price` for fixed payment method/term/deposit/APR — this is a computationally-checked substitute for a full proof, appropriate given the property is plausible but not formally proven here.
**Warning signs:** A fast-check counterexample where `dfits(midpoint)` is `true` but `dfits(midpoint - 1)` is `false` for the same inputs.

### Pitfall 5: Per-market default numbers are genuinely disputed across sources
**What goes wrong:** Treating any single issuer's or single secondary source's minimum-payment formula as "the" US/CA/UK default bakes in an assumption that is one of several defensible answers, and D-05's per-market table is explicitly meant to be editable, sourced data — not a hidden opinion.
**Why it happens:** Real card issuers differ (Chase: $40 floor; Capital One/Citi: $25 floor; Discover/Bank of America: $35 floor — all "1% + interest+fees, or floor, whichever is greater"), and Canada's Quebec-vs-rest-of-Canada split is a real regulatory divergence, not noise.
**How to avoid:** Store the chosen default with its citation in code comments/fixtures, expose it as editable per D-05, and — per this research — flag Quebec as an open question rather than silently picking a national Canadian default that is wrong for a fifth of the country's population.
**Warning signs:** A support ticket or product review disputing "why is my card's minimum $25 when my statement says $35" — this is expected and by design (D-05 makes it editable), not a bug.

## Code Examples

### 1. Integer amortised payment (`dpmt`) with zero-rate branch and final-payment reconciliation (DEC-01)
```typescript
// Adapted from the standard annuity-payment formula (see State of the Art below for
// verification against a reference calculator), reimplemented on ScaledRate bigints
// per D-20. Source pattern: src/engine/money/rates.ts (ScaledRate, RATE_SCALE, divideHalfUp).
import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import type { ScaledRate } from '../money/rates';
import { RATE_SCALE } from '../money/rates';

const SCALE = 10n ** BigInt(RATE_SCALE);

// (1 + r)^-n computed as a ScaledRate via exponentiation by squaring on the
// *reciprocal* base (1/(1+r)), never as a float Math.pow.
function scaledPow(base: bigint, exponent: number): bigint {
  let result = SCALE; // 1.0 in fixed point
  let b = base;
  let e = exponent;
  while (e > 0) {
    if (e & 1) result = divideHalfUp(result * b, SCALE);
    b = divideHalfUp(b * b, SCALE);
    e >>= 1;
  }
  return result;
}

/** DEC-01: amortised monthly payment. `monthlyRate` is r = apr/1200 as a ScaledRate; 0 is valid. */
export function amortisedPayment(
  principal: MinorUnits,
  monthlyRate: ScaledRate | 0n,
  months: number
): MinorUnits {
  if (months <= 0) throw new RangeError('amortisedPayment: months must be positive');
  if (monthlyRate === 0n) {
    return minorUnits(Number(divideHalfUp(BigInt(principal) * SCALE, BigInt(months) * SCALE)));
  }
  const onePlusR = SCALE + monthlyRate;
  const invFactor = divideHalfUp(SCALE * SCALE, scaledPow(onePlusR, months)); // (1+r)^-n scaled
  const denominator = SCALE - invFactor;
  const numerator = BigInt(principal) * monthlyRate;
  return minorUnits(Number(divideHalfUp(numerator * SCALE, denominator * SCALE / SCALE)));
}
// Final-payment reconciliation (D-20): run the loop with `amortisedPayment` for months 1..n-1,
// then set month n's payment = remaining balance + that month's interest exactly, so
// sum(payments) === principal + totalInterest with no residual. This mirrors dSimMin's own
// per-month loop structure below rather than trusting the closed form for the last cent.
```

### 2. Integer future value (`dfv`) with zero-rate and zero-months branches (DEC-02)
```typescript
/** DEC-02: FV of a monthly contribution plus a seed. r = 0 and n = 0 are both valid inputs. */
export function futureValue(
  monthlyContribution: MinorUnits,
  monthlyRate: ScaledRate | 0n,
  months: number,
  seed: MinorUnits
): MinorUnits {
  if (months <= 0) return seed; // n <= 0 -> just the seed, matching the prototype's dfv(mo,apr,n,seed)
  if (monthlyRate === 0n) {
    return minorUnits(Number(BigInt(seed) + BigInt(monthlyContribution) * BigInt(months)));
  }
  const onePlusR = SCALE + monthlyRate;
  const growthFactor = scaledPow(onePlusR, months); // (1+r)^n scaled
  const seedGrown = divideHalfUp(BigInt(seed) * growthFactor, SCALE);
  const contribGrown = divideHalfUp(
    BigInt(monthlyContribution) * (growthFactor - SCALE) * SCALE,
    monthlyRate * SCALE
  );
  return minorUnits(Number(seedGrown + contribGrown));
}
```

### 3. Revolving minimum-payment simulation with explicit never-clears check (DEC-03, D-16, D-17)
```typescript
/** Card-record minimum-payment terms (D-16): never a hardcoded default inside the engine. */
export interface CardMinimumTerms {
  readonly minimumPercent: ScaledRate; // e.g. 1% as a ScaledRate
  readonly interestIsAddedToFloor: boolean; // whether the floor already includes interest+fees
  readonly floor: MinorUnits; // in the card's own currency
}

export interface MinimumPaymentResult {
  readonly months: number; // months to clear, or 600 if never/cap
  readonly totalInterest: MinorUnits | null; // null when never (unbounded)
  readonly firstPayment: MinorUnits;
  readonly outcome: 'cleared' | 'neverClears' | 'exceedsFiftyYearCap';
}

const MONTH_CAP = 600; // D-17: the 50-year cap is a separate, later outcome from never-clears

export function simulateMinimumPayments(
  balance: MinorUnits,
  monthlyRate: ScaledRate,
  terms: CardMinimumTerms
): MinimumPaymentResult {
  let bal = BigInt(balance);
  let totalInterest = 0n;
  let month = 0;
  let firstPayment: bigint | null = null;

  while (bal > 0n && month < MONTH_CAP) {
    const interest = divideHalfUp(bal * monthlyRate, SCALE);
    const percentPortion = divideHalfUp(bal * terms.minimumPercent, SCALE);
    const base = terms.interestIsAddedToFloor ? percentPortion + interest : percentPortion;
    const payment = base > BigInt(terms.floor) ? base : BigInt(terms.floor);
    const applied = payment < bal + interest ? payment : bal + interest;

    if (month === 0) firstPayment = applied;

    // D-17: explicit, per-month never-clears check -- fires as soon as the scheduled
    // payment cannot even cover this month's interest, independent of the 600-month cap.
    if (applied <= interest) {
      return {
        months: MONTH_CAP,
        totalInterest: null,
        firstPayment: minorUnits(Number(firstPayment)),
        outcome: 'neverClears',
      };
    }

    bal = bal + interest - applied;
    totalInterest += interest;
    month += 1;
  }

  if (bal > 0n) {
    // Balance survived to the cap without ever tripping the never-clears check above --
    // a distinct outcome per D-17, not to be reported as "never clears".
    return {
      months: MONTH_CAP,
      totalInterest: null,
      firstPayment: minorUnits(Number(firstPayment ?? 0n)),
      outcome: 'exceedsFiftyYearCap',
    };
  }

  return {
    months: month,
    totalInterest: minorUnits(Number(totalInterest)),
    firstPayment: minorUnits(Number(firstPayment ?? 0n)),
    outcome: 'cleared',
  };
}
```

### 4. CV / steadiness classification without a float square root (DEC-07, D-12)
```typescript
// cv = sd/mean < threshold  <=>  variance < threshold^2 * mean^2   (for mean > 0)
// This is an order-preserving algebraic transform (both sides squared, all positive),
// so it needs no Math.sqrt anywhere. Thresholds .06 / .22 become ScaledRate constants
// carried on the snapshot's limits input, not hardcoded engine constants (D-05 spirit,
// though CV thresholds are behavioural constants, not currency amounts -- confirm with
// the planner whether these are also snapshot inputs or may stay as named engine constants
// since D-05 text is scoped to "currency amounts", not statistical thresholds).
function isBelowCvThreshold(deviations: readonly bigint[], mean: bigint, thresholdScaled: bigint): boolean {
  if (mean === 0n) return false; // avoid div-by-zero; matches prototype's `avg?sd/avg:0` (cv=0 when avg=0)
  const n = BigInt(deviations.length);
  const sumSquares = deviations.reduce((acc, d) => acc + d * d, 0n);
  const varianceScaled = divideHalfUp(sumSquares * SCALE, n); // variance * SCALE
  const thresholdSquaredMeanSquared = divideHalfUp(thresholdScaled * thresholdScaled * mean * mean, SCALE);
  return varianceScaled < thresholdSquaredMeanSquared;
}
```

### 5. Integer bisection for largest affordable price (DEC-09)
```typescript
/**
 * Exact integer bisection (D-20 replaces the prototype's fixed 22 float iterations).
 * Assumes `fits` is non-increasing in price (true for small prices, false for large --
 * see Bisection on Integers below for the monotonicity argument, including across the
 * dealer-cap discontinuity). Handles both edge cases explicitly per DEC-09:
 *   - "nothing is affordable": fits(0) is false -> returns null
 *   - "the full price already fits": fits(fullPrice) is true -> returns fullPrice
 */
export function bisectAffordablePrice(
  fullPrice: MinorUnits,
  fits: (price: MinorUnits) => boolean
): MinorUnits | null {
  if (!fits(minorUnits(0))) return null; // nothing is affordable, even price 0
  if (fits(fullPrice)) return fullPrice; // the full price already fits
  let lo = 0;
  let hi = fullPrice as number;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (fits(minorUnits(mid))) lo = mid; else hi = mid;
  }
  return minorUnits(lo);
}
// Termination proof: hi - lo strictly halves (integer floor division) each iteration and
// both are bounded integers, so the loop runs in O(log2(fullPrice)) steps and always
// terminates with hi - lo <= 1, at which point lo is exactly the largest integer minor-unit
// price satisfying `fits` (by the loop invariant fits(lo) === true, fits(hi) === false,
// maintained from the initial fits(0)=true/fits(fullPrice)=false setup after the two
// edge-case returns above have already ruled out the boundary cases).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Prototype: `dpmt`/`dfv`/`dSimMin` on JS floats, `Math.pow`, hardcoded `22.9`/`$25`/`$6,000`/`$1,000`/`$500`/`6.5%` | Integer minor units + `ScaledRate` bigints throughout; every dollar default replaced by a snapshot-carried value (D-01/D-02/D-05/D-06/D-07) | This phase (D-20) | Removes float drift risk and removes every hidden currency assumption from engine code; values become editable, auditable data instead of constants |
| Prototype: 22-iteration fixed float bisection | Exact integer bisection terminating on `hi - lo <= 1` (D-20) | This phase | Deterministic, exact result on minor units rather than an approximation that happens to be "close enough" at typical price magnitudes |
| Prototype: `dsecured(name)` regex match | `secured: boolean` field on the loan record; regex survives only as an import-time default suggestion (D-11/DEC-11) | This phase | Removes the `forester` seed-data-artefact class of bug entirely; a user can correct a misclassified debt without renaming it |
| Prototype: never-clears inferred implicitly by the loop's own internal check, conflated in practice with hitting 600 months by callers | Explicit, separately-reported `neverClears` vs `exceedsFiftyYearCap` outcomes (D-17) | This phase | Phase 5 can show a materially different message for "mathematically can never clear" versus "would clear, just not within the simulation horizon" |
| Prototype: whole card plan `missing` when a vehicle purchase exceeds the dealer cap | Excess above cap becomes a day-one cash cost, tested normally (D-18) | This phase | A user financing a $30k car with $5k on a card and $25k cash no longer gets a blanket "missing" — they get a real verdict on the $25k cash portion |
| Prototype: instalment path always `miss: true` | `missing` only when instalment amount or count is absent (Claude's Discretion, confirmed bug) | This phase | Instalment plans with complete terms now correctly resolve to a real plan instead of always reporting incomplete |

**Deprecated/outdated:**
- The prototype's fixed `dlim` defaults (reserve 6000, dsr .36 as the *only* editable one, minInv 1000, minSave 500) are replaced wholesale per D-01 through D-06; only the DSR 36% and 12x-income lines survive as literal editable defaults (D-04), and even those are inputs, not engine constants.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CV thresholds (0.06, 0.22) are behavioural/statistical constants outside D-05's "no hardcoded currency amounts" scope, and may stay as named constants in `engine/decide/money.ts` rather than snapshot inputs | Code Examples §4 | Low-medium: if the planner/user intends *all* magic numbers (not just currency) to be snapshot-supplied, these three thresholds and the 3-full-month cutoff (D-12) would need to move to input too. Recommend confirming with the planner/user; the CONTEXT.md text scopes D-05 to "currency amounts," which supports treating CV thresholds as engine constants, but this is an inference, not a quoted decision |
| A2 | The `never-clears` fixture chosen for D-22/success-criterion-2 ("22.9% APR, 1% minimum") genuinely never clears under the *interest-added* minimum formula, not just under some formulas | dSimMin Rework, Pitfall 2 | Medium: depends on which of the sourced US formulas (Chase 1%+interest+fees+$40 floor vs. Capital One 1%+interest+$25 floor) the fixture uses; both should be checked arithmetically at implementation time rather than assumed to both never-clear, since a higher floor clears faster than a pure-percent formula at the same rate |
| A3 | US/CA/UK per-market default *values* recommended below (see table) are reasonable representative defaults for a first cut of the table, not the only defensible choices | Per-Market Defaults section | Medium: issuer variance is real (see Pitfall 5); the planner should treat these as a starting, user-editable table per D-05, not as verified "the" answer |
| A4 | Bisection monotonicity across the dealer-cap discontinuity holds in all cases (argued in Pitfall 4, not formally proven) | Bisection on Integers / Pitfall 4 | Medium: if a fast-check property test at implementation time finds a counterexample, the bisection approach needs a documented fallback (e.g., evaluate `dfits` at the cap boundary explicitly and bisect separately on each side) |
| A5 | Canada's per-market default table entry should represent "rest of Canada" (2% or $10, whichever greater) rather than Quebec's 5% rule, with Quebec flagged as an open question rather than silently folded into the national default | Per-Market Defaults section | Low-medium: if a Quebec user is expected in the launch demographic, defaulting to the rest-of-Canada formula understates their actual regulatory minimum; this is disclosed, not hidden, but the product decision on whether to sub-divide by province is not this phase's to make |

## Open Questions (RESOLVED)

1. **Do CV thresholds and the 3-full-month cutoff count as "hardcoded currency amounts" under D-05, or are they exempt as statistical/behavioural constants?**
   - What we know: D-05's text says "No hardcoded currency amounts anywhere in the engine," specifically calling out investing/saving floors, card-minimum floor, and dealer cap as the currency-amount examples that must move to input.
   - What's unclear: whether the CV thresholds (0.06/0.22), the 3-full-month insufficient-history cutoff (D-12), the 6-month averaging window (D-09), and the 22.9%-style rate constants used only in fixtures are in scope for the same "never a constant in engine code" treatment.
   - Recommendation: keep CV thresholds, the 6-month window, and the 3-month cutoff as named, documented `const`s in `engine/decide/` (they are behavioural rules from CONTEXT.md's own decisions D-09/D-12, not currency amounts) — but flag this explicitly for the planner/user to confirm at plan-check time, since D-05's own text is easy to read either way.
   - RESOLVED (user, 2026-09-26): these are behaviour constants, not money, so D-05 does not apply. Keep them as named, documented constants in one file (e.g. `engine/decide/constants.ts`) with boundary tests. That covers CV thresholds 0.06/0.22, the 6-month window, the 3-month minimum and the 600-month cap.

2. **Should the per-market default table be typed as one row per market with fixed fields, or a more general key-value structure that can add a fourth market later without a type change?**
   - What we know: CONTEXT.md's Deferred Ideas explicitly anticipates adding markets beyond US/CA/UK later.
   - What's unclear: whether Phase 5's snapshot-builder will want to look up this table by the user's device region, by an explicit user-set "country" field, or by currency code — which affects whether the type should key on ISO country code, currency code, or both.
   - Recommendation: leave this to the planner's discretion per CONTEXT.md's existing "Claude's Discretion" grant, but design the type so adding a market is a data change (new table row), never a code change.
   - RESOLVED (user, 2026-09-26): key the table by market, with rows `US`, `CA`, `CA-QC` and `UK`. Canada is split because Quebec's 5% minimum (Bill 134, effective 1 Aug 2025) differs from about 2%/$10 elsewhere. Phase 5's snapshot builder picks the row from the user's region preference and falls back to `CA`. Adding a market is a data change. Values with no source are explicit `null` (unknown), never borrowed from another market.

3. **Does the never-clears fixture for success criterion 2 need to be parameterised by which US formula is used (Chase vs. Capital One vs. a fixture-only synthetic formula), given Pitfall 2/Assumption A2?**
   - What we know: the phase's own CONTEXT.md specifics section calls this "the single most important test in the app" and treats the 22.9%/1% combination as fixture data (not a live default) under D-07.
   - What's unclear: whether the fixture should use one of the real, cited formulas above or a simplified synthetic one (`pay = max(floor, balance*1% + interest)`, matching the prototype's original literal formula) for auditability against the prototype's own D-22 golden test.
   - Recommendation: use the prototype's own literal formula (`max($25, 1%*balance + interest)`) for the D-22 golden-parity fixture specifically (since that test's job is proving parity with the prototype, not proving real-world accuracy), and use one or more of the cited real issuer formulas separately for any "does this look like a real card" sanity fixtures.
   - RESOLVED: adopt the recommendation. The golden-parity never-clears fixture uses the prototype's literal `max(25, 1%·balance + interest)` at 22.9%. Separate realism fixtures use the cited issuer formulas.

## Environment Availability

Skipped — this phase has no external dependencies. It is pure TypeScript running under the already-installed, already-verified Jest/fast-check toolchain (confirmed present via `package.json` above); nothing new needs to be provisioned, installed, or reachable over a network.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `~29.7.0` (via `jest-expo` preset) [VERIFIED: package.json] |
| Config file | `C:\dev\fincwin-04p\jest.config.js` — per-directory coverage thresholds auto-activate for `src/engine/decide/` and `src/engine/payoff/` once source files exist (100% branches/functions/lines/statements, per D-21 Phase 0) |
| Quick run command | `npx jest src/engine/decide src/engine/payoff` |
| Full suite command | `npx jest --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEC-01 | Amortised payment incl. r=0, n=1, n=600, known-table cross-check | unit + golden fixture | `npx jest src/engine/payoff/__tests__/amortise.test.ts` | ❌ Wave 0 |
| DEC-02 | FV incl. r=0, n=0 | unit + golden fixture | `npx jest src/engine/payoff/__tests__/futureValue.test.ts` | ❌ Wave 0 |
| DEC-03 | Never-clears explicit check; 600-month cap as separate outcome | unit (the canonical 22.9%/1% case) | `npx jest src/engine/payoff/__tests__/simulateMinimum.test.ts` | ❌ Wave 0 |
| DEC-04 | 4 payment methods resolve to a comparable plan | unit, matrix over method x card-plan | `npx jest src/engine/decide/__tests__/plan.test.ts` | ❌ Wave 0 |
| DEC-05 | `missing` flag correctness (incl. instalment-path fix) | unit, boundary on missing terms | `npx jest src/engine/decide/__tests__/plan.test.ts` | ❌ Wave 0 |
| DEC-06 | Verdict states + <=5 ordered warnings | unit, one-warning-at-a-time then combinations | `npx jest src/engine/decide/__tests__/assess.test.ts` | ❌ Wave 0 |
| DEC-07 | CV-derived steadiness, incl. <3-month `insufficient` | unit, boundary at each CV threshold | `npx jest src/engine/decide/__tests__/money.test.ts` | ❌ Wave 0 |
| DEC-08 | Household share, all 4 rules | unit, incl. zero-sum weights guard | `npx jest src/engine/decide/__tests__/share.test.ts` | ❌ Wave 0 |
| DEC-09 | Bisection, both edge cases | unit + fast-check monotonicity property | `npx jest src/engine/decide/__tests__/bisect.test.ts` | ❌ Wave 0 |
| DEC-10 | Card eligibility blocked/capped/permitted | unit, matrix over item types | `npx jest src/engine/decide/__tests__/cardRule.test.ts` | ❌ Wave 0 |
| DEC-11 | `secured` field read, not name-matched | unit | `npx jest src/engine/decide/__tests__/secured.test.ts` | ❌ Wave 0 |
| DEC-12 | No React/I/O/DB reachable from `engine/decide` or `engine/payoff` | static/lint | `npm run depcruise` (existing `engine-only-internal-src` + `engine-no-reach-impure` rules already cover new folders automatically) | ✅ (rule already exists, applies once files exist) |
| DEC-13 | Options list order and content | unit | `npx jest src/engine/decide/__tests__/options.test.ts` | ❌ Wave 0 |
| DEC-14 | 4-way alternatives + suppression rule | unit | `npx jest src/engine/decide/__tests__/alternatives.test.ts` | ❌ Wave 0 |
| DEC-15 | 4 setbacks re-assess a plan | unit | `npx jest src/engine/decide/__tests__/setbacks.test.ts` | ❌ Wave 0 |
| DEC-16 | Cash-level first read from rough figures | unit | `npx jest src/engine/decide/__tests__/firstRead.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest src/engine/decide src/engine/payoff` (quick run, targeted to the two new folders)
- **Per wave merge:** `npx jest --coverage` (full suite; also run `npm run depcruise` since this phase is exactly what that rule exists to protect)
- **Phase gate:** Full suite green at 100% branch coverage on `src/engine/decide/` and `src/engine/payoff/` (jest.config.js's `FULL` threshold) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/engine/payoff/__tests__/amortise.test.ts`, `futureValue.test.ts`, `simulateMinimum.test.ts` — cover DEC-01, DEC-02, DEC-03
- [ ] `src/engine/decide/__tests__/plan.test.ts`, `assess.test.ts`, `money.test.ts`, `share.test.ts`, `bisect.test.ts`, `cardRule.test.ts`, `secured.test.ts`, `options.test.ts`, `alternatives.test.ts`, `setbacks.test.ts`, `firstRead.test.ts` — cover DEC-04 through DEC-16
- [ ] `src/engine/decide/__tests__/golden/*.json` — ported prototype fixtures (D-22), one set per function
- [ ] `src/engine/decide/__tests__/deviations/*.test.ts` — one named test per D-0x deviation (D-02, D-06, D-07, D-08, D-17, D-18, D-20 at minimum, per CONTEXT.md's own list)
- [ ] No new Jest config or framework install needed — `jest.config.js`'s dynamic threshold logic (`hasSource('src/engine/decide')`) already activates the 100% folder threshold the moment any source file lands there

## Security Domain

This phase is a pure computation module with no network, storage, or user-identity surface, so most ASVS categories do not apply. It is included per the "absent = enabled" default rather than because the domain is rich.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No identity concept in a pure function taking a snapshot |
| V3 Session Management | No | No session state; engine is stateless per call |
| V4 Access Control | No | No access-control decision is made here (that is Phase 5/8's RLS concern) |
| V5 Input Validation | Yes | Every public engine function should validate its inputs the same way `minorUnits()`/`currencyCode()`/`allocate()` already do — throw `RangeError` on invalid snapshot shape (negative months, non-integer weights, missing required card terms) rather than silently producing a wrong verdict. This is also what keeps the 100%-branch-coverage gate honest (every guard clause needs a covering test) |
| V6 Cryptography | No | No secrets, no encryption surface in this phase |

### Known Threat Patterns for this stack
Not applicable in the STRIDE sense (no network boundary, no auth, no stored secrets). The one "safety" concern that matters here is domain-specific, not a security vulnerability: a wrong verdict is real financial harm to the user, which is why D-22's golden-parity testing and the 100%-branch-coverage gate exist — treat "assessment correctness" as this phase's actual risk surface, tracked through the Validation Architecture table above rather than through ASVS.

## Per-Market Defaults (research detail supporting D-05/D-16, Claude's Discretion)

All figures below are **data to pass into the engine as snapshot/card-record defaults**, never engine constants (D-05, D-07). Every issuer figure disagrees somewhat; this is disclosed rather than resolved into one false-precision number.

### US credit-card minimum payment — issuer survey
| Issuer | Formula | Floor | Confidence |
|--------|---------|-------|------------|
| Chase | greater of $40 or (1% of statement balance + interest + late fees) | $40 | MEDIUM [CITED: chase.com/personal/credit-cards/education/basics/how-to-calculate-your-minimum-credit-card-payment] |
| Bank of America | greater of $35 or (1% of balance + interest + fees) | $35 | LOW-MEDIUM [WebSearch via wallethub.com, single secondary source, not fetched from BofA directly] |
| Citi | greater of $25 or (1% of balance + interest + fees) [Citi also offers a 1.5%-of-balance variant on some cards] | $25 | LOW-MEDIUM [WebSearch via wallethub.com/creditcardminimumpaymentcalculator.com, secondary sources] |
| Discover | greater of $35 or (2% of new balance) or (interest + late fee + $20) | $35 | LOW-MEDIUM [WebSearch via wallethub.com, secondary source] |
| Capital One | greater of $25 or (1% of balance + interest + late fees); if balance < $25, minimum = balance | $25 | LOW-MEDIUM [WebSearch via wallethub.com, secondary source] |

**Recommended US default for the per-market table:** `minimumPercent = 1%`, `interestIsAddedToFloor = true` (i.e., interest/fees are added on top of the percent portion, matching every issuer above), `floor = $25` (matches Capital One and Citi's base tier — the lower, more conservative end of the $25-$40 range found). This is the single most-recommended default across the systemically largest issuers in the sample and is the same floor the prototype itself hardcoded (`max($25, ...)`), which supports continuity, but flag as **MEDIUM confidence overall for the exact floor number** — a $35 or $40 floor is equally defensible and should be treated as user-editable (D-05 already mandates this).

### UK credit-card minimum payment — regulatory
- **FCA Handbook CONC 6.7.5R** [CITED: handbook.fca.org.uk/handbook/CONC/6/7.html, HIGH confidence — primary regulatory source]: "A firm must set the minimum required repayment... at an amount equal to at least that amount which repays the interest, fees and charges that have been applied to the customer's account, plus one percentage of the amount outstanding." This is a *regulatory floor on the formula itself* (1% of balance + all interest/fees), not a fixed-currency floor.
- Secondary consumer sources (NerdWallet UK, Commsave) [WebSearch, MEDIUM confidence] commonly summarise the practical minimum as "1% of balance + interest and charges, or £5 — whichever is greater," implying a common £5 fixed-currency floor layered on top of the regulatory formula by individual issuers, though this £5 figure is not itself in the FCA rule text.

**Recommended UK default:** `minimumPercent = 1%`, `interestIsAddedToFloor = true`, `floor = £5`. The 1%-plus-interest formula is HIGH confidence (direct regulatory text); the £5 floor specifically is MEDIUM confidence (secondary sources, not found in the FCA rule itself — issuers may set a higher practical floor).

### Canada credit-card minimum payment — regulatory/issuer split
- **Rest of Canada (outside Quebec):** major banks (TD, RBC, Scotiabank, BMO cited) commonly use "greater of $10 or 2% of balance" [WebSearch via ratehub.ca/nerdwallet.ca/cardnorth.ca, MEDIUM confidence — multiple consistent secondary sources, no single federal regulator rule found equivalent to Quebec's]. Some sources cite 3% instead of 2% as a rounder "typical" figure; the more specific major-bank citation (2%) is preferred here.
- **Quebec specifically:** regulated by Bill 134 (Quebec's *Consumer Protection Act* amendments); minimum payment reached **5% as of 1 August 2025** for all cards, after a phase-in from 2% starting 2019 [CITED: ratehub.ca/blog/quebec-increases-credit-card-minimum-payments, money.ca/credit-cards/quebec-minimum-creditcard-payments — HIGH-MEDIUM confidence, consistent across multiple sources citing the same statutory phase-in schedule, though the underlying Quebec statute/regulation text itself was not directly fetched in this session].

**Recommended Canada default for a single national market-table row:** `minimumPercent = 2%`, `interestIsAddedToFloor = false` (the "2% of balance" figure found is described as inclusive, not "2% + interest" — this should be re-verified against a specific bank's cardholder agreement at implementation time, flagged LOW confidence on the interest-inclusion question specifically), `floor = $10 CAD`. **Open question A5 above:** Quebec's 5% is a materially different, statutorily mandated figure; representing all of Canada with one row understates Quebec's true minimum. Recommend the planner decide whether the per-market table needs a Quebec-specific override or whether this is accepted as a known v1 simplification (consistent with CONTEXT.md's Deferred Ideas tone toward market-table granularity).

### Dealer card cap for vehicle purchases (D-18)
- Multiple consumer-finance secondary sources [WebSearch via choosefi.com, remitly.com, nationaldebtrelief.com, autostoday.com — LOW confidence, no regulator or industry-body primary source found] converge on car dealerships in the US typically capping credit-card payment on a vehicle purchase somewhere in the **$2,000-$5,000** range, driven by the dealer's own interchange-fee exposure (typically 1.5%-3.5% per transaction), not by any law.
- No UK or Canada-specific dealer-cap figures were found in this session; this is disclosed as **unknown**, not defaulted by inference from the US figure.

**Recommendation:** default the US dealer cap to **$5,000** (top of the commonly-cited range, and identical to the prototype's own hardcoded `Math.min(price,5000)` — preserves continuity for the D-22 golden-parity tests while making the number an editable per-market/per-check field going forward per D-05/D-18). For CA and UK, **represent the dealer cap as explicitly unknown/unset** in the per-market table (e.g. `null`, or a sentinel the snapshot-builder must treat as "no default available, user must supply") rather than reusing the US figure — there is no sourced basis for assuming the same numeric cap applies in a different currency and market, and D-18 already requires the cap to be an editable field on the check regardless.

## Sources

### Primary (HIGH confidence)
- [FCA Handbook CONC 6.7](https://handbook.fca.org.uk/handbook/CONC/6/7.html) — UK minimum-payment regulatory formula (CONC 6.7.5R), fetched directly, WebFetch
- `C:\dev\fincwin-04p\src\engine\money\rates.ts`, `rounding.ts`, `types.ts`, `arithmetic.ts` — existing, tested, code-reviewed engine primitives — VERIFIED by direct Read
- `C:\dev\fincwin-04p\src\engine\split\allocate.ts` and its test file — VERIFIED by direct Read
- `C:\dev\fincwin-04p\jest.config.js`, `.dependency-cruiser.cjs` — VERIFIED by direct Read (coverage thresholds, engine-boundary rules)
- `C:\dev\fincwin-04p\package.json` — VERIFIED installed versions of jest/fast-check/@fast-check/jest/typescript via direct Read + `npm view` cross-check
- `FincWin United.dc.html` lines 3990-4120, 4590-4720 — VERIFIED by direct Read, the actual prototype implementation being ported
- `BUILD-PROMPT.md` §4 and §6 — VERIFIED by direct Read, the function-by-function port table and architecture rules
- `.planning/phases/04-decide-engine/04-CONTEXT.md` — VERIFIED by direct Read, all locked decisions D-01..D-22

### Secondary (MEDIUM confidence)
- [Chase: How to Calculate Your Minimum Credit Card Payment](https://www.chase.com/personal/credit-cards/education/basics/how-to-calculate-your-minimum-credit-card-payment) — WebFetch, direct issuer source
- [Ratehub.ca: Quebec increases minimum payment on credit cards](https://www.ratehub.ca/blog/quebec-increases-credit-card-minimum-payments/) — WebSearch, consistent with money.ca and Yahoo Finance Canada coverage of the same Bill 134 phase-in
- [money.ca: Quebec Sets 5% Credit Card Minimum Payment](https://money.ca/credit-cards/quebec-minimum-creditcard-payments) — WebSearch, cross-verifies Ratehub.ca
- [NerdWallet Canada / CardNorth.ca / Ratehub.ca: Canadian minimum-payment explainers](https://www.nerdwallet.com/ca/p/article/credit-cards/minimum-payment-credit-card) — WebSearch, converging on "2%/$10 whichever greater" for major Canadian banks outside Quebec

### Tertiary (LOW confidence)
- [WalletHub: Bank of America / Citi / Discover / Capital One minimum-payment pages](https://wallethub.com/answers/cc/) — WebSearch aggregation, single secondary source per issuer, not cross-verified against each issuer's own cardholder agreement in this session
- [choosefi.com, remitly.com, nationaldebtrelief.com, autostoday.com: dealer credit-card-payment-limit articles](https://choosefi.com/article/buy-car-with-credit-card) — WebSearch, consumer-finance blogs, no primary regulator/industry-body source found for the $2,000-$5,000 dealer-cap figure
- [Commsave: minimum-repayment consumer explainer](https://www.commsave.co.uk/education/commsave-educates/only-making-minimum-repayments-on-your-credit-card-you-need-to-read-this) — WebSearch, secondary source for the UK £5 practical floor (not present in the FCA rule text itself)

## Metadata

**Confidence breakdown:**
- Standard stack / testing tooling: HIGH — directly verified against installed `package.json` and existing, already-reviewed code in the repo
- Architecture / rounding / integer patterns: HIGH — direct extension of Phase 0/1's already-implemented and CI-enforced `ScaledRate`/`divideHalfUp`/dependency-cruiser precedent
- Bisection monotonicity: MEDIUM — reasoned through, not formally proven; recommend a fast-check property test as the practical substitute
- Never-clears / 600-month-cap distinction: HIGH — directly required by D-17's explicit text and the prototype's own (if slightly ambiguous) loop structure
- Per-market default table (US/CA/UK numbers): LOW-MEDIUM — genuine issuer/regulator disagreement, disclosed rather than resolved; UK regulatory formula itself is HIGH confidence, the accompanying floors are MEDIUM-LOW; dealer-cap figures are LOW across all three markets

**Research date:** 2026-09-26
**Valid until:** Regulatory/issuer figures (per-market defaults) should be re-verified before this table is relied on for a real launch decision — recommend 90 days for the UK regulatory citation (stable primary source) and 30 days for the issuer-floor and dealer-cap figures (secondary sources, more likely to have drifted or been found wrong on closer inspection). The engineering/architecture findings (integer amortisation, bisection, CV-without-sqrt) are stable indefinitely — they follow from the existing codebase's own already-committed patterns, not from external, time-sensitive sources.
