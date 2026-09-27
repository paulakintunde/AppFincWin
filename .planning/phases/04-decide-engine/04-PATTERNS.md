# Phase 4: Decide Engine - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 29 (14 source + 2 barrels + 13 test/fixture groups)
**Analogs found:** 25 / 29 (bisect.ts and simulateMinimum.ts have no close behavioural analog — noted below with the closest structural fit)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/engine/payoff/amortise.ts` | utility | transform | `src/engine/money/rates.ts` (`convertMinor`/scaled-bigint math) + `src/engine/money/rounding.ts` | role-match (transform math, no prior compound-interest code) |
| `src/engine/payoff/futureValue.ts` | utility | transform | `src/engine/money/rates.ts` | role-match |
| `src/engine/payoff/simulateMinimum.ts` | utility | batch (bounded loop) | `src/engine/money/rounding.ts` (per-op rounding) + `src/engine/split/allocate.ts` (multi-step bigint accumulation) | partial match — no existing looping/simulation code in the repo |
| `src/engine/payoff/types.ts` | model | — | `src/engine/money/types.ts` (branded types + constructors) | role-match |
| `src/engine/payoff/index.ts` | config (barrel) | — | `src/engine/split/index.ts`, `src/engine/time/index.ts` | exact |
| `src/engine/payoff/__tests__/*.test.ts` | test | — | `src/engine/money/__tests__/rounding.test.ts` (fixture `it.each` + fast-check property) | exact pattern match |
| `src/engine/decide/money.ts` (dmoney) | service | transform | `src/engine/money/rounding.ts` (squared-quantity, no-float-sqrt style) | role-match |
| `src/engine/decide/share.ts` (dshare) | service | CRUD-like (resolve one of 4 rules → shares) | `src/engine/split/allocate.ts` | **exact** — `dshare`'s `weight`/`even` rules call `allocate()` directly per RESEARCH's Don't-Hand-Roll table |
| `src/engine/decide/cardRule.ts` (dCardRule) | service | request-response (classify one input → one code) | `src/engine/guards/assertNever.ts` (exhaustive switch) + `src/engine/money/customCurrency.ts` (field-driven classification, no regex) | role-match |
| `src/engine/decide/secured.ts` (dsecured) | service | request-response | `src/engine/money/customCurrency.ts` (reads an explicit field, regex only as an outside-path helper) | role-match |
| `src/engine/decide/plan.ts` (dplan) | service | transform | `src/engine/money/customCurrency.ts` (`{ok:true,value}|{ok:false,errors}` discriminated result, collects reason codes) | **exact** for the `missing`+reason-codes shape |
| `src/engine/decide/assess.ts` (dassess) | service | transform | `src/engine/money/arithmetic.ts` (module composing small pure ops) + `src/engine/guards/assertNever.ts` (exhaustive switch over verdict states/warning codes) | role-match |
| `src/engine/decide/bisect.ts` | utility | transform (search) | `src/engine/money/rounding.ts` (fast-check property-test pattern for a numeric invariant) | no direct behavioural analog — see below |
| `src/engine/decide/options.ts` | service | transform | `src/engine/decide/bisect.ts` (consumes it directly) + `src/engine/money/arithmetic.ts` (composition style) | role-match |
| `src/engine/decide/alternatives.ts` | service | transform | `src/engine/decide/plan.ts`/`assess.ts` (consumes their output, same composition style) | role-match |
| `src/engine/decide/setbacks.ts` | service | transform | `src/engine/decide/assess.ts` (re-invokes the same verdict path under modified inputs) | role-match |
| `src/engine/decide/firstRead.ts` (DEC-16) | service | request-response | `src/engine/money/customCurrency.ts` (small pure classifier returning a typed result + basis marker) | role-match |
| `src/engine/decide/constants.ts` | config | — | `src/engine/money/rates.ts` (`RATE_SCALE` named, documented constant) + `src/engine/money/types.ts` (`MAX_ABS_AMOUNT_MINOR`, comment ties constant to a decision) | exact pattern match |
| `src/engine/decide/marketDefaults.ts` | model / config | — | `src/engine/money/types.ts` (branded type + validating constructor) | role-match |
| `src/engine/decide/types.ts` | model | — | `src/engine/money/types.ts`, `src/engine/money/customCurrency.ts` (discriminated result/error unions) | role-match |
| `src/engine/decide/index.ts` | config (barrel) | — | `src/engine/money/index.ts` (barrel re-exports, stable public surface comment) | exact |
| `src/engine/decide/__tests__/*.test.ts` (unit) | test | — | `src/engine/money/__tests__/rates.test.ts`, `customCurrency.test.ts` | exact pattern match |
| `src/engine/decide/__tests__/golden/*.json` | test fixture | — | `supabase/tests/fixtures/money-conversion-cases.json` (consumed via `it.each(fixtures.x)`) | exact pattern match |
| `src/engine/decide/__tests__/deviations/*.test.ts` | test | — | `src/engine/money/__tests__/rates.test.ts` (named tests citing a WR/decision code, e.g. `WR-B07`) | exact pattern match |

## Pattern Assignments

### `src/engine/payoff/amortise.ts`, `futureValue.ts` (utility, transform)

**Analog:** `src/engine/money/rates.ts`

**Imports pattern** (rates.ts lines 12-16):
```typescript
import { divideHalfUp } from './rounding';
import { minorUnits, type MinorUnits } from './types';

export const RATE_SCALE = 10;
export type ScaledRate = bigint & { readonly __brand: 'ScaledRate' };
```
Mirror this for `engine/payoff/`: import `divideHalfUp` from `../money/rounding`, `minorUnits`/`MinorUnits` from `../money/types`, and reuse (do not redefine) `ScaledRate`/`RATE_SCALE` from `../money/rates` for APR/monthly-rate representation (D-20 explicitly requires this).

**Core scaled-bigint pattern** (rates.ts lines 55-74, `convertMinor`):
```typescript
export function convertMinor(
  amount: MinorUnits,
  fromPerEur: ScaledRate,
  fromExponent: number,
  toPerEur: ScaledRate,
  toExponent: number
): MinorUnits {
  assertValidExponent(fromExponent, 'fromExponent');
  assertValidExponent(toExponent, 'toExponent');

  const numerator = BigInt(amount) * toPerEur * 10n ** BigInt(toExponent);
  const denominator = fromPerEur * 10n ** BigInt(fromExponent);
  const result = divideHalfUp(numerator, denominator);

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (result > maxSafe || result < -maxSafe) {
    throw new RangeError('convertMinor: result exceeds Number.MAX_SAFE_INTEGER');
  }
  return minorUnits(Number(result));
}
```
The shape to copy for `amortisedPayment`/`futureValue`: validate inputs first (throw `RangeError` with a `functionName: message` prefix), do **all** intermediate arithmetic in `bigint`, call `divideHalfUp` exactly once per rounding point, and only call `minorUnits(Number(...))` at the very end with an explicit `MAX_SAFE_INTEGER` overflow guard. RESEARCH.md's Code Examples §1-2 already give the exact `scaledPow`/`amortisedPayment`/`futureValue` bodies to use — treat those as the reference implementation, ported through this file's import/validate/bigint-loop/final-round shape.

**Error handling pattern** (rates.ts lines 49-53, `assertValidExponent`):
```typescript
function assertValidExponent(exponent: number, label: string): void {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) {
    throw new RangeError(`convertMinor: ${label} ${exponent} must be an integer between 0 and 4`);
  }
}
```
Copy this private-guard-helper style for `amortisedPayment`'s `months <= 0` check and any other input guard — one small private function per invariant, named `assertX`, called at the top of the public function, message prefixed with the function name (matches `types.ts`'s `minorUnits`/`currencyCode` style too).

---

### `src/engine/payoff/simulateMinimum.ts` (utility, batch — no direct analog)

**No close analog exists** — this is the first bounded per-month loop in `engine/`. Closest structural precedent is `src/engine/money/rounding.ts`'s single `divideHalfUp` call per operation and `src/engine/split/allocate.ts`'s all-bigint accumulation with a single final cast back to `MinorUnits`. Build the loop exactly as RESEARCH.md's Code Example §3 specifies: `bal`, `totalInterest`, `month` all stay `bigint` through the entire loop; call `divideHalfUp` once per per-month rounding point (interest, percent-portion); cast to `MinorUnits` only at each of the three `return` sites. Follow D-17's explicit-check ordering precisely — the `applied <= interest` never-clears check must be evaluated and can `return` **before** the `month < MONTH_CAP` loop condition is re-tested, so it fires independently of the cap (see Pitfall 2 in RESEARCH.md).

**Shared with:** `divideHalfUp` (rounding.ts) and the `ScaledRate` monthly-rate input from `payoff/amortise.ts`'s sibling pattern.

---

### `src/engine/decide/share.ts` (dshare) — service, CRUD-like

**Analog:** `src/engine/split/allocate.ts` (EXACT — reuse, don't reimplement)

**Core pattern to call, not copy** (allocate.ts lines 19-56):
```typescript
export function allocate(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  if (weights.length === 0) {
    throw new RangeError('allocate: weights must be a non-empty array');
  }
  for (const w of weights) {
    if (!Number.isInteger(w) || w <= 0) {
      throw new RangeError(`allocate: weight ${w} must be a positive integer`);
    }
  }
  // ... largest-remainder bigint split, deterministic tie-break by ascending index
}
```
`dshare`'s job (per D-15 and RESEARCH's Don't-Hand-Roll table) is **only** to resolve which weights/amounts to hand to `allocate()` for the `even` and `weight` rules — never to re-implement the split arithmetic. For `weight`, guard the D-15 "weights summing to zero" case explicitly *before* calling `allocate` (allocate itself requires all-positive weights, so a zero-sum/all-zero weight set must be intercepted and reported as its own guarded case, not passed through). For `amount` (per-person figures typed for this purchase) and `mine` (share of 1), `dshare` returns the given/derived MinorUnits directly — no `allocate()` call needed, but it should still validate through `minorUnits()` so a non-integer/unsafe amount throws the same way.

**Imports pattern:**
```typescript
import { allocate } from '../split/allocate';
import { minorUnits, type MinorUnits } from '../money/types';
```

---

### `src/engine/decide/plan.ts` (dplan) — service, transform

**Analog:** `src/engine/money/customCurrency.ts` (EXACT match for the missing/reason-code shape)

**Result-type pattern to copy** (customCurrency.ts lines 15-45):
```typescript
export type CustomCurrencyError =
  | 'code-missing'
  | 'code-invalid'
  | 'code-exists'
  | 'symbol-invalid'
  | 'decimals-invalid'
  | 'reference-invalid'
  | 'value-invalid';

export type ValidateCustomCurrencyResult =
  | { ok: true; value: ValidatedCustomCurrency }
  | { ok: false; errors: CustomCurrencyError[] };
```
Model `dplan`'s output the same way: a discriminated union with a literal-string reason-code type (e.g. `PlanReasonCode = 'card_not_accepted' | 'card_apr_missing' | 'instalment_terms_missing' | ...`) and `{ status: 'resolved'; plan: Plan } | { status: 'missing'; reasons: PlanReasonCode[] }`. D-05/D-07/D-16 all describe "missing with a reason code" outcomes — this file's `errors: CustomCurrencyError[]` array (collect everything wrong, don't stop at the first) is the direct precedent, though `dplan` will typically have at most one or two reasons rather than customCurrency's many.

**Core validation-and-build pattern** (customCurrency.ts lines 68-132): validate every input field first, pushing reason codes into an array as you go; only construct and return the success value once every check has passed with zero collected errors. Copy this control flow verbatim for `dplan`'s four payment-method branches (`cash`, `card`, `instalment`, `invest`/whatever the discretion item settles on) — each branch is its own guarded case (use `assertNever` in the exhaustive `switch` over payment method, per the Guards pattern below), and each branch either returns a resolved plan or pushes reason codes and returns `missing`.

**Anti-pattern this analog helps avoid:** customCurrency.ts's comment block (lines 52-54, 58-66) documents *why* a bound was chosen and *why* a naive alternative was rejected — copy this commenting discipline for `dplan`'s D-18 vehicle-cap and D-07 no-invented-APR branches, since RESEARCH.md's Anti-Patterns section calls out exactly these as corrections from the prototype that reviewers must be able to see justified in place.

---

### `src/engine/decide/assess.ts` (dassess), `options.ts`, `alternatives.ts`, `setbacks.ts` — service, transform

**Analog:** `src/engine/money/arithmetic.ts` (composition style) + `src/engine/guards/assertNever.ts` (exhaustive switch)

**Composition pattern** (arithmetic.ts lines 15-41): each function is small, pure, and named after exactly one operation; a higher-level function (`sum`) composes the smaller ones (`add`) rather than re-deriving their logic inline:
```typescript
export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: minorUnits(a.amount + b.amount), currency: a.currency };
}
// ...
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, item) => add(acc, item), { amount: minorUnits(0), currency });
}
```
`dassess` should be built the same way: it calls `dmoney`, `dshare`, `dplan` and composes their outputs into the five-ledger check, rather than re-deriving any of their internals. `options.ts`, `alternatives.ts` and `setbacks.ts` sit one layer above `dassess` and should likewise call it (and `bisect.ts`) rather than duplicate its warning logic — `alternatives.ts`'s "suppress rows where money isn't genuinely spare" (D-19/DCU-06) is a filter over `dassess`/`options` output, not a parallel calculation path.

**Exhaustive-switch pattern** (assertNever.ts, full file):
```typescript
export function assertNever(value: never, context = 'value'): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
```
Use this in the `default` branch of every `switch` over `VerdictState` (`fits`/`adjust`/`no`/`missing`), `WarningCode` (`month`/`cash`/`dsr`/`owe`/`inv`), and payment method — this is what keeps the 100%-branch-coverage gate (D-21, Phase 0) honest: a forgotten case becomes a compile error instead of a silent coverage gap. Test it the same way `assertNever.test.ts` does:
```typescript
it('throws with the JSON of the value and the supplied context', () => {
  expect(() => assertNever('unexpected' as never, 'status')).toThrow('Unhandled status: "unexpected"');
});
```

---

### `src/engine/decide/bisect.ts` — utility, transform (no direct analog)

**No existing search/bisection code in the repo.** Build directly from RESEARCH.md's Code Example §5 (`bisectAffordablePrice`), which is already written against this codebase's conventions (uses `MinorUnits`, throws nothing, returns `MinorUnits | null` for the two explicit edge cases). The one reusable pattern from the existing codebase is the **fast-check property-test style** used for `divideHalfUp`'s rounding-error invariant:
```typescript
// src/engine/money/__tests__/rounding.test.ts lines 21-31
it('property: the rounding error never exceeds half the denominator, and negation is symmetric', () => {
  fc.assert(
    fc.property(fc.bigInt(), fc.bigInt({ min: 1n }), (n, d) => {
      const q = divideHalfUp(n, d);
      const error = q * d - n;
      const absError = error < 0n ? -error : error;
      expect(absError * 2n <= d).toBe(true);
      expect(divideHalfUp(-n, d)).toBe(-divideHalfUp(n, d));
    })
  );
});
```
Copy this shape for `bisect.test.ts`'s monotonicity property (RESEARCH.md Pitfall 4): generate prices spanning the dealer-cap discontinuity and assert `dfits`/total-burden is non-decreasing in price for fixed method/term/deposit/APR.

---

### `src/engine/decide/cardRule.ts` (dCardRule), `secured.ts` (dsecured), `firstRead.ts` — service, request-response

**Analog:** `src/engine/money/customCurrency.ts` (field-driven classification, no regex on the verdict path)

Per D-11/D-14, these three functions all share one shape: read an **explicit field** off the input record (`secured: boolean`, an item-type enum, or the rough-figures object for `firstRead`) and classify/branch on it — never infer from a name via regex inside the function that `dassess` calls. `customCurrency.ts`'s own comment (lines 52-54) documents exactly this discipline for its `CODE_PATTERN` regex ("the prototype's regex survives only as a pre-fill suggestion... outside the verdict path" is the same idea D-11/D-14 state for `dsecured`/`dCardRule`). If a regex-based pre-fill helper is kept at all, put it in a clearly separate, non-exported-from-`index.ts` helper so it can never be reached from `dassess`'s call graph — dependency-cruiser's `engine-no-reach-impure` rule won't catch this (it's an internal-to-engine concern, not a boundary violation), so it has to be enforced by not wiring the regex helper into any function `dassess`/`dplan` call.

---

### `src/engine/decide/constants.ts` — config

**Analog:** `src/engine/money/rates.ts` (`RATE_SCALE`) + `src/engine/money/types.ts` (`MAX_ABS_AMOUNT_MINOR`)

**Pattern** (types.ts line 19-20):
```typescript
// Mirrors the DB check `abs(original_amount) <= 10000000000000` (plan 01-02).
export const MAX_ABS_AMOUNT_MINOR = 10_000_000_000_000;
```
Every named constant gets a one-line comment tying it to the decision or external check that justifies its exact value. Per the RESOLVED Open Question in RESEARCH.md, `constants.ts` holds: CV thresholds (`0.06`, `0.22`, as `ScaledRate` or a decide-local scale), the 6-month averaging window (D-09), the 3-full-month minimum (D-12), and the 600-month cap (D-17/`MONTH_CAP`). Each needs its `D-0x` citation in the comment, exactly like `MAX_ABS_AMOUNT_MINOR`'s `plan 01-02` citation above, and each needs a boundary test (e.g. exactly 2 vs. exactly 3 full months) per the RESOLVED note's "with boundary tests" requirement.

---

### `src/engine/decide/marketDefaults.ts` — model / config

**Analog:** `src/engine/money/types.ts` (branded type + validating constructor)

**Pattern** (types.ts lines 22-27):
```typescript
export function minorUnits(n: number): MinorUnits {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`minorUnits: ${n} is not a safe integer`);
  }
  return n as MinorUnits;
}
```
Per the RESOLVED open question (RESEARCH.md line 532), key the per-market table type by market row (`US`, `CA`, `CA-QC`, `UK`), with unknown/unsourced fields as explicit `null` — never borrowed from another market. This is data the engine *receives*, so `marketDefaults.ts` should define the **type** (and, if useful, a narrow validator following the `minorUnits`/`currencyCode` throw-on-invalid style above) but the actual table values are Phase 5/snapshot-builder data, not a constant exported from this file for `dassess`/`dplan` to import directly — keep the file to types + optional validator only, consistent with D-05's "never a constant in engine code."

---

### `src/engine/payoff/index.ts`, `src/engine/decide/index.ts` — config (barrel)

**Analog:** `src/engine/money/index.ts`

**Pattern** (money/index.ts, full file):
```typescript
/**
 * Public API of `engine/money/`. This is the money core Phase 4's Decide
 * engine and Phase 2's Record consume -- keep this barrel's exported
 * surface stable; downstream plans import from here, not from the
 * individual files directly. Later plans in this phase append parse/format/
 * localDate exports to this same barrel.
 */
export * from './types';
export * from './rounding';
// ...
```
Give each new barrel the same header-comment convention (who consumes it, stability expectation) and `export *` per source file (or named re-exports for files with an internal-only helper, matching `customCurrency`'s named-export style in the same barrel). `engine/decide/index.ts`'s comment should note that Phase 5 is the consumer and that Phase 6 reuses `engine/payoff/index.ts` specifically for `amortise`/`futureValue`/`simulateMinimum` (per RESEARCH.md's Architectural Responsibility Map).

---

## Shared Patterns

### Branded integer types + throwing constructors
**Source:** `src/engine/money/types.ts` lines 11-27, 22-27
**Apply to:** every new type in `payoff/types.ts` and `decide/types.ts` that wraps a `number`/`bigint` (prices, terms-in-months, minimum-percent). Always brand with `& { readonly __brand: '...' }` and provide one throwing constructor (`RangeError`, message prefixed with the function name) rather than accepting a raw primitive at public function boundaries.

### One rounding function, called everywhere
**Source:** `src/engine/money/rounding.ts` (full file, `divideHalfUp`)
**Apply to:** `payoff/amortise.ts`, `futureValue.ts`, `simulateMinimum.ts`, `decide/money.ts` (CV), `decide/share.ts`, `decide/bisect.ts` — anywhere D-20 requires half-up rounding. Never write a second rounding implementation; import `divideHalfUp` from `../money/rounding` in every one of these files.

### Scaled-bigint rate representation
**Source:** `src/engine/money/rates.ts` lines 15-16 (`RATE_SCALE`, `ScaledRate`)
**Apply to:** APR, monthly rate, DSR 36% line, card-minimum percent, CV thresholds — reuse the existing `ScaledRate` type and `RATE_SCALE` constant rather than inventing a second scale for this phase (D-20 explicitly requires "consistent with `engine/money/rates.ts`").

### Exhaustive switch via `assertNever`
**Source:** `src/engine/guards/assertNever.ts` (full file)
**Apply to:** every switch over `VerdictState`, `WarningCode`, `ReasonCode`, `BasisMarker`, and payment method across `decide/plan.ts`, `assess.ts`, `options.ts`, `alternatives.ts`. Required for the 100%-branch-coverage gate (D-21) to actually catch a missed case at compile time.

### Fixture-driven golden tests via `it.each`
**Source:** `src/engine/money/__tests__/rates.test.ts` lines 60-72, `rounding.test.ts` lines 6-11; fixture file `supabase/tests/fixtures/money-conversion-cases.json`
**Apply to:** every file under `decide/__tests__/golden/`. Load a JSON fixture array, drive `it.each(fixtures.someKey)('$name', (...) => {...})`, name each case, and assert exact or within-tolerance equality (`expect(Math.abs(got - expectedMinor)).toBeLessThanOrEqual(1)` per D-22's 1-minor-unit tolerance). Put fixtures at `src/engine/decide/__tests__/golden/*.json`, one file per ported prototype function, mirroring `money-conversion-cases.json`'s per-function-key JSON shape (e.g. `{ "dpmt": [...], "dfv": [...] }` or one file per function).

### Named deviation tests citing the decision code
**Source:** `src/engine/money/__tests__/rates.test.ts` lines 127-142 (`WR-B07` test, named and commented with the bug/decision it fixes)
**Apply to:** `decide/__tests__/deviations/*.test.ts`. Each deviation from the prototype (D-02, D-06, D-07, D-08, D-17, D-18, D-20) gets its own `it(...)` (or its own file) whose title and body comment cite the `D-0x` code and explain, in one sentence, what the prototype did differently — exactly how `rates.test.ts` cites `WR-B07` and computes the "old way" result alongside the corrected one for contrast.

### Fast-check property tests for invariants
**Source:** `src/engine/split/__tests__/allocate.test.ts` lines 50-73 (exact-sum + tie-break determinism); `src/engine/money/__tests__/rounding.test.ts` lines 21-31 (rounding-error bound)
**Apply to:** `decide/__tests__/share.test.ts` (allocate reuse — sum-to-total property already covered by allocate's own tests, but `dshare`'s rule-resolution wrapper should still property-test that whatever it hands to `allocate` sums correctly), `decide/__tests__/bisect.test.ts` (monotonicity across the dealer-cap discontinuity, per Pitfall 4), `payoff/__tests__/amortise.test.ts`/`futureValue.test.ts` (payment/FV monotonicity in principal and rate).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/engine/payoff/simulateMinimum.ts` | utility | batch | No existing bounded per-month/iterative simulation loop anywhere in `engine/`; build directly from RESEARCH.md Code Example §3, reusing only `divideHalfUp` and `MinorUnits` at the primitive level |
| `src/engine/decide/bisect.ts` | utility | transform | No existing search/bisection algorithm in the repo; build directly from RESEARCH.md Code Example §5, reusing only the fast-check property-test *style* from `rounding.test.ts` |

## Metadata

**Analog search scope:** `src/engine/money/` (all source + `__tests__`), `src/engine/split/` (source + test), `src/engine/time/`, `src/engine/guards/`, `jest.config.js`, `.dependency-cruiser.cjs`, `supabase/tests/fixtures/money-conversion-cases.json` (fixture-file shape reference).
**Files scanned:** 26 (all pre-existing files under `src/engine/`, plus `jest.config.js` and `.dependency-cruiser.cjs`)
**Pattern extraction date:** 2026-09-26
