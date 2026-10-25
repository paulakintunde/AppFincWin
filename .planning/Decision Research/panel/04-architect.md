# Panel seat 4: architect for financial calculation engines

Branch `phase/05-decide-ui` (PR #82), worktree `C:\dev\fincwin-p5`. Read: `src/engine/decide/*` (37 files, 6,251 lines), `src/features/decide/snapshot/*` (2,707 lines), `src/features/decide/copy/*`, FINANCE-AUDIT.md, LANGUAGE-AUDIT.md. Nothing was edited.

## Summary (plain English)

1. The maths is careful and exact. The problem is the shape. One answer goes through about 20 shared numbers, and several of them mean different things at different steps.
2. The app works out the month in three ways ("this month", "worst", "average"). The headline uses one of them. A card further down uses the other two, later. That is why "It fits" can sit above "Doesn't fit".
3. The headline chip and the sentence under it come from different rules. That is why "Not from cash" can sit beside "Cash covers it".
4. The fix is a small core with two steps. Step 1 reads your past months, splits regular costs from big one-off buys, and gives an allowance for big buys. Step 2 compares the purchase with a typical month and with a tight month.
5. Every message comes from one result code, through one table. Two lines of text can then never disagree.
6. The extras (cash path, cheaper options, wait plan, total cost, setbacks) plug into the core result. They can add facts or make the answer stricter. They can never change it in secret.
7. Build the new core next to the old one. First set it to copy the old answers exactly and prove they match. Then change one rule at a time, and review each change against saved examples.
8. No database change is needed. Stored states keep their four values (fits, adjust, no, missing). The new codes map onto them.
9. Effort: about 8 to 10 weeks for one engineer, or 5 to 6 weeks for two. Fixing the copy table first takes about 3 days and can ship on its own.
10. The biggest risk is getting the sort of "big buy" against "regular spending" wrong. Test it against real past months before it reaches users.

---

## 1. The engine as it is

### 1.1 Data flow

```
 Supabase rows (transactions, series, accounts, debts, pots, settings)
        │  src/data/queries/decide.ts  (+ device judgeOn store, decideHints.ts)
        ▼
 buildDecideSnapshot()  snapshot/buildSnapshot.ts:182 ── FX conversion, full-month flags (:346),
        │                basisOverride = monthFallback ? 'worst' : judgeOn ?? settings (:726-728)
        ▼  SnapshotResult {logged | rough | none}
 ┌───────────── computeCore()  snapshot/computeCheck.ts:225 ─────────────┐   computeChip() :406 (home rows, assess())
 │ toEngineCheck (checkInputs.ts) → resolvePlan ×4 methods (plan.ts)     │   computeQuick() :366 (quick check)
 │ decide()  decision.ts:121                                             │   homeCardModel.ts:86/127 → prepareContext()
 │   prepareContext()  assess.ts:136                                     │
 │     deriveMoney() money.ts:211 ── mean / min / max over ≤6 full months│
 │     'month'? overlay expectedMonthMoney() expectedMonth.ts:122 (:182) │
 │     leftBefore = income − spending − debt − pausable − pots (:203)    │
 │     cash ×3 (cashAvailable, cashAfterBills, ledgerCash) (:224-226)    │
 │     cashPathForSnapshot() cashPath.ts:149 (90 days)                   │
 │   positionContext() position.ts:183 ── stack open checks, then        │
 │     applyChanges(): leftBefore := worst of next 12 months (:141-162)  │
 │   assessPlan() assess.ts:331 ── dsr/housing/owe, pause, 7 warnings,   │
 │     state (:428), month table, 5 ledgers, size (:299)                 │
 │   lineMargins, stressTest, withExpectedIncome (decision.ts:159-202)   │
 └───────────────────────────────┬───────────────────────────────────────┘
                                 ▼  idle time
 computeDetails()  computeCheck.ts:325 ── options, alternatives, setbacks, wait, investmentViews,
        │          totalCost, incomeAtRisk, basisOutcomesOf() = 2 more full decide() runs (:311-322)
        ▼
 copy/*  (verdictCopy, quickCopy, warningCopy, keyFiguresCopy, basisKey …) → i18n keys → screens
```

### 1.2 Modules (C = core question "what is left at month end, and does this fit?", D = depth, X = duplicate or parallel path)

| File | Lines | Job | Tag |
|---|---|---|---|
| types.ts | 1,130 | every engine type (141 exported types) | C, swollen |
| plan.ts | 633 | payment shapes → dayOne, monthly, financed | C (input), keep |
| assess.ts | 605 | context + verdict + month table + ledgers + size | C, hotspot |
| cashPath.ts | 361 | 90-day dated cash path, dip classification | D (can tighten) |
| money.ts | 341 | summariseMonth, deriveMoney, steadiness CV | C |
| investmentViews.ts | 257 | "invested instead" views | D |
| alternatives.ts | 231 | cheaper / wait / skip rows | D |
| expectedMonth.ts | 219 | this month logged + still due | C |
| position.ts | 213 | stack open checks; D-45 future month | C (stack) + D (future) |
| decision.ts | 204 | Decision report: margins, stress, expected income | D wrapper |
| series.ts | 204 | bill and pay schedules, smoothing | C |
| constants.ts | 171 | behaviour constants | C |
| options.ts / bisect.ts | 160 / 62 | affordable price, longer term, cut a line | D |
| checkInputs.ts / share.ts / pots.ts | 145 / 141 / 83 | inputs, household share, pots set-aside | C |
| setbacks.ts / stress.ts / incomeAtRisk.ts | 106 / 58 / 58 | what-ifs | D |
| futureChanges.ts | 102 | worst of next 12 months | D |
| firstRead.ts | 84 | rough-figures verdict, its own state machine | X |
| the rest (13 files) | ~800 | card rules, market defaults, payback, estimate bias, wait, ownership, margins, reserve, confidence, currency | mostly D |

Roughly 3,900 lines serve the core question and 2,350 are depth. Types and the decision comments carry about 107 Phase-5 and 60+ Phase-4 decision IDs. Each comment is correct. Together they hide the main line.

### 1.3 Complexity hotspots

- **`AssessContext` changes meaning partway through** (types.ts:477-517). `leftBefore` starts as this month's surplus (assess.ts:203). After `positionContext` it becomes the worst of the next 12 months (position.ts:159, types.ts:494). `leftThisMonth` is a copy kept so that `purchaseSize` can still read the old value (assess.ts:264, :301). `monthIncome` moves with future changes, but `money.incomeBasis` does not (position.ts:137-138). A reader has to know the current step to know what a field means.
- **Three cash figures** (assess.ts:224-226), each read by a different consumer: the `cash` check, the spare-money figures, the ledger row. The comment that explains them is 10 lines long (types.ts:500-509).
- **`assessPlan` is 230 lines** (assess.ts:331-561). It mixes limit tests, the pause rule, path stress, the month table, the ledgers and the confidence.
- **Performance scaffolding** for an engine run that costs too much: method plans carried over and narrowed (computeCheck.ts:206-245, D-88), the WeakMap of rated snapshots (:71), idle-time basis outcomes (:311). A cheap core would remove most of it.

### 1.4 Where the three bases fork

1. money.ts:317-333: the default basis is `average` when income is steady and `worst` otherwise. Worst means the lowest income and the highest spending, taken from different months (:284-286). Average is the mean (:291-292).
2. assess.ts:146 and :182-185: `'month'` first asks for `worst`, then writes the expected month over `incomeBasis` and `spendingBasis`. Everything that reads `spendingAverage` (monthCosts :196, the cushion :230) stays on history. Everything that reads `spendingBasis` moves.
3. expectedMonth.ts:180-196: `'month'` counts what is logged plus series still due, with no estimate of ordinary spending still to come (audit 4.1).
4. The understatement spreads: cashPath.ts:184 (undated spread = spendingBasis − series), wait.ts:30 and alternatives.ts:99 (saving rate = leftBefore), futureChanges via position.ts:147-153 (the next 12 months are built from the partial month), setbacks.ts:44 and options.ts:106 (incomeBasis).
5. Copy forks too: basisKey.ts:27 (`…Month` variant keys), verdictCopy.ts:92-96, warningCopy.ts:29, MonthSection.tsx:45, YourMonthCard.tsx:113/139, homeCardModel.ts:134.
6. computeCheck.ts:311-322 re-runs `decide()` for the other two bases in idle time. The headline and the outcome card are computed at different times, from different runs.

### 1.5 Duplicated logic

- firstRead.ts:57-67 re-implements the state precedence in assess.ts:428-429, with its own warnings and cushion rule.
- expectedMonth.ts:200-218 re-implements the leftBefore formula (assess.ts:203). The comment admits this.
- position.ts:80-127 (`stackCheck`) repeats how a purchase is applied in assess.ts:337-344.
- verdictCopy.ts:45-50 (`noLead`) works out the engine's precedence again, in the copy layer ("in assess.ts's precedence").
- homeCardModel.ts:86 and :127 each call `prepareContext` for the same snapshot.

### 1.6 Where contradictory text comes from (verified in code)

| Seen | Cause |
|---|---|
| "Not from cash" chip + "Cash covers it. Even with saving paused, the month would end … overspent" | The chip key depends on the **surface**, not the cause: verdictCopy.ts:27 maps every `no` on quickCash to `noCash`. The body follows the cause (`noLead` = month, quickCopy.ts:148-150). |
| "Out of savings" beside a red `no` | `purchaseSize` (assess.ts:299-303) is a separate axis that reads `leftThisMonth` and `cashAvailable`, not the state. |
| "It fits / Nothing breaks" over "Worst month: Doesn't fit" | The headline is one basis from the fast path. `BasisOutcomeCard` comes from idle-time runs (computeCheck.ts:356). No rule makes the headline aware of the other rows. |
| "Cushion: Over 50 years / A month: None" | Not wait-plan fields, as the audit guessed. "Cushion" is the **runway** (`runwayMonthsOf(cashAfterBillsAndPurchase, burn)`, keyFiguresCopy.ts:85), and "None" is a new monthly cost of 0 (:60-61). Both are labelling faults. |
| Body "in $X" ≠ month table "in" | verdictCopy.ts:109 reads `money.incomeBasis`. The month table reads `context.monthIncome` (assess.ts:477). These differ once a future change applies. |
| Home "free" ≠ the check's "before" | The home card reads `prepareContext().leftBefore` (homeCardModel.ts:96). The check is judged after stacking and D-45. |

The root cause is the same in every row: **state, cause, size and copy are worked out separately, and nothing makes them agree.**

---

## 2. Target architecture

### 2.1 Shape

```
 DecideSnapshot (unchanged)
        ▼
 [1] MonthModel  engine/decide/month/   (pure, one pass, cached per snapshot)
       classify lines → regular | everyday | bigBuy | oneOff
       past months → income, regular, bigBuys, left, kind (typical|good|tight) + reasons
       allowance = average bigBuys per month
       scenarios: typical (median), tight (2nd-lowest income, 2nd-highest regular), thisMonth (projected)
        ▼
 [2] Position adapters (optional, run before judging): stack open checks, planned future changes,
       cash-path low point. Each returns modified figures. Monotone: it can only lower `left` or cash.
        ▼
 [3] Judge  engine/decide/judge/   judge(scenario, cash, purchase, limits) → ScenarioOutcome   (O(1), no I/O)
       run for [thisMonth, typical, tight] → combine() → VerdictCode + leadScenario + before/after split
        ▼
 [4] CoreResult ──► copy/verdictTable.ts: one Record<VerdictCode, CopyRow>  → chip, title, body, tone
        │
        └─► [5] Depth plug-ins (lazy): lines, cashPath detail, alternatives, wait, options/bisect,
             TCO, setbacks, stress, investmentViews, incomeAtRisk. They read CoreResult. They may
             call judge() again with a changed purchase. They return facts. They never return a VerdictCode.
```

Rules:
- **One judge function.** firstRead becomes a MonthModel built from the three rough figures: one scenario, typical = tight, confidence rough. It uses the same judge and the same table. firstRead.ts's own state machine goes away.
- **All scenarios are judged in the fast path.** That is 3 calls to an O(1) function, not 3 runs of `decide()`. The headline always knows about the tight row.
- **Every number has one meaning.** `left` exists for each scenario, `before` and `after`. No field changes meaning between steps.
- **Functional core, imperative shell.** Snapshot building, FX and the database stay in `features/decide/snapshot`. The engine stays pure. The depcruise rule is unchanged.

### 2.2 Core types

```ts
// engine/decide/month/types.ts — MinorUnits stays the branded integer; bigint inside, one minorFromBigInt per output.
export type LineClass = 'regular' | 'everyday' | 'big_buy' | 'one_off';
// regular = a confirmed series (smoothed, D-23/D-60); one_off = flagged by the user (D-47, kept out of everything);
// big_buy = a non-series out line ≥ BIG_BUY_SHARE of the median month's everyday spending (named constant, set by back-test);
// everyday = everything else.

export type MonthReason =
  | { code: 'big_buy'; lineId: string; amount: MinorUnits }      // "one bad expense" made it tight
  | { code: 'income_low'; by: MinorUnits }                         // vs median income
  | { code: 'income_high'; by: MinorUnits }
  | { code: 'bills_bunched'; seriesIds: readonly string[] }
  | { code: 'everyday_high'; by: MinorUnits };

export interface PastMonth {
  readonly month: string;                 // 'YYYY-MM', full months only, newest first, ≤ 6
  readonly income: MinorUnits;            // mine, pay smoothed
  readonly regular: MinorUnits;           // my share, bills smoothed
  readonly everyday: MinorUnits;
  readonly bigBuys: MinorUnits;
  readonly oneOffs: MinorUnits;           // shown, never counted
  readonly left: MinorUnits;              // income − regular − everyday − bigBuys − committed (signed)
  readonly kind: 'good' | 'typical' | 'tight';   // left vs median left ± one MAD (exact integers)
  readonly reasons: readonly MonthReason[];
}

export interface Committed {
  readonly debtMinimums: MinorUnits;
  readonly committedSaving: MinorUnits;   // treated as a cost (audit 4.9); today's data has none, so 0
  readonly flexibleSaving: MinorUnits;    // today's monthlySaving + monthlyInvesting (pausable, D-35)
  readonly pots: MinorUnits;              // D-101 set-aside
}

export interface MonthFigures {           // one scenario
  readonly scenario: 'this_month' | 'typical' | 'tight';
  readonly income: MinorUnits;
  readonly regular: MinorUnits;
  readonly everyday: MinorUnits;          // this_month: max(logged, typical everyday): what is still to come is projected
  readonly allowance: MinorUnits;         // room for big buys: in typical and tight; this_month uses max(allowance − bigBuysLogged, 0)
  readonly committed: Committed;
  readonly left: MinorUnits;              // income − regular − everyday − allowance − debt − committedSaving − flexibleSaving − pots
  readonly source: { readonly months: readonly string[]; readonly rule: 'median' | 'second_extreme' | 'extreme' | 'logged_plus_due' };
}

export interface MonthModel {
  readonly past: readonly PastMonth[];
  readonly allowance: MinorUnits;         // divideHalfUp(Σ bigBuys, n): an allowance is an average on purpose
  readonly typical: MonthFigures;
  readonly tight: MonthFigures;           // n ≥ 5: 2nd-lowest income + 2nd-highest regular+everyday; n 3–4: extremes, flagged
  readonly thisMonth: MonthFigures;
  readonly steadiness: Steadiness;        // unchanged CV rule (money.ts:294-315)
  readonly confidence: Confidence;        // unchanged rule (confidence.ts); reasons now listed in full
}

// engine/decide/judge/types.ts
export interface CashPosition {
  readonly spendable: MinorUnits;   // the one cash figure: cashOnHand − protected pots − bills due ≤ 90 d − outflows due now
  readonly cushion: MinorUnits;     // user's, or monthCosts × halfMonths/2 (reserve.ts, unchanged)
  readonly monthCosts: MinorUnits;  // for months-of-cover
  readonly lowestAhead: MinorUnits | null;  // from the cash-path adapter; null with no confirmed pay
}
export interface PurchaseEffect {   // from plan.ts, my share applied once
  readonly dayOne: MinorUnits; readonly monthly: MinorUnits; readonly running: MinorUnits;
  readonly financed: MinorUnits; readonly kind: 'buy' | 'invest'; readonly addsHousing: boolean;
}
export type Standing = 'room' | 'thin' | 'short';     // thin = within EDGE_PERCENT of 0 (margins.ts)
export interface ScenarioOutcome {
  readonly scenario: MonthFigures['scenario'];
  readonly before: { readonly left: MinorUnits; readonly standing: Standing };
  readonly after:  { readonly left: MinorUnits; readonly standing: Standing };
  readonly pauseNeeded: MinorUnits;                    // flexible saving only (D-35 kept)
}
export type PaidFrom = 'month_room' | 'big_buy_allowance' | 'savings_above_cushion' | 'into_cushion' | 'not_covered';
export type LimitCode = 'dsr' | 'housing' | 'owe' | 'cushion' | 'cash_low_ahead' | 'saving_floor' | 'investing_floor';
export interface LimitResult { readonly code: LimitCode; readonly passed: boolean; readonly by: MinorUnits; readonly grade: 'none' | 'light' | 'heavy' }
export type VerdictCode =
  | 'fits'                    // typical and tight both room/thin after, no limit passed
  | 'fits_not_tight'          // typical fine, tight month short after: names the tight month
  | 'fits_over_limit'         // month fine, a limit passed (lead = limits[0])
  | 'fits_with_pause'         // closes only by pausing flexible saving (D-105)
  | 'into_cushion'            // cash after < cushion, graded light/heavy (audit 4.6)
  | 'month_short'             // the purchase makes the typical month short
  | 'already_short'           // typical month short before; purchase adds X (or adds nothing)
  | 'cash_short';             // day-one cost > spendable cash, or the lowest point ahead < 0
export interface CoreResult {
  readonly model: MonthModel;
  readonly outcomes: readonly [ScenarioOutcome, ScenarioOutcome, ScenarioOutcome];  // this_month, typical, tight
  readonly purchase: PurchaseEffect & { readonly paidFrom: PaidFrom; readonly cashAfter: MinorUnits;
                                        readonly coverMonthsAfter: number | null; readonly rebuildMonths: number | null };
  readonly limits: readonly LimitResult[];   // sorted by `by`, then a fixed order
  readonly code: VerdictCode;
  readonly lead: 'typical' | 'tight' | 'this_month' | LimitCode;   // what decided it: named in the headline
  readonly legacyState: 'fits' | 'adjust' | 'no';                  // for stored columns, see 3.4
  readonly confidence: Confidence;
}
```

`paidFrom` replaces `purchaseSize` and the wait-plan arithmetic with one figure people can follow. Money comes first from the typical month's room. Next it comes from the big-buy allowance: price ≤ allowance + max(typical.left, 0). Next from cash above the cushion, with `rebuildMonths = ceil(excess / (allowance + max(typical.left,0)))`. After that it goes into the cushion, and finally "not covered". This is the product owner's "I still have an allowance" turned into one rule.

### 2.3 combine(): fixed precedence, one place

```
cash_short     if purchase.dayOne > cash.spendable or (lowestAhead !== null and lowestAhead − dayOne-path < 0)
already_short  if typical.before.standing = 'short'
month_short    if typical.after.standing = 'short' and pauseNeeded cannot close it
fits_with_pause   if typical.after closes only through pauseNeeded > 0
into_cushion   if cashAfter < cushion           (grade heavy → legacy 'no' when < 1 month of costs; else 'adjust')
fits_over_limit if any limit passed
fits_not_tight if tight.after.standing = 'short'
fits
```

`legacyState`: cash_short, already_short and month_short map to `no`. Heavy into_cushion also maps to `no`. fits_with_pause, light into_cushion, fits_over_limit and fits_not_tight map to `adjust`. fits maps to `fits`. `fits_not_tight` is the new middle ground: today it reads green on one basis and red on another. "This month" is never the lead for a `no`. It appears as the line "right now", which fixes audit 4.1 without making the right-now view the judge.

### 2.4 One state-to-copy table

```ts
// features/decide/copy/verdictTable.ts
export const VERDICT_COPY = {
  fits:            { tone: 'fits',   chip: 'decide.v.fits.chip',        title: 'decide.v.fits.title',        body: 'decide.v.fits.body' },
  fits_not_tight:  { tone: 'adjust', chip: 'decide.v.fitsNotTight.chip', title: 'decide.v.fitsNotTight.title', body: '…' },
  // … one row per VerdictCode; no surface column for chip/title/tone
} as const satisfies Record<VerdictCode, CopyRow>;
```

- The surface (full, quickCash, quickCredit, home row) can only pick a **body variant**. It cannot change the chip, the title or the tone.
- The title always names `lead`, as the language audit asks: "Fits a typical month. Short in a tight month."
- The before/after split (audit 4.4) is two lines on every surface. One line says "Your month before this" (`typical.before`). The other says "This purchase" (`after − before`, `paidFrom`).
- **No-contradiction test:** for every `VerdictCode` × surface × lead × paidFrom, check that the tone of the chip, the title and the size label agree, using a small claims table: `claims(key) ⊆ {cash_ok, cash_not_ok, month_ok, month_not_ok}` must be consistent with the code. Use fast-check to generate CoreResults and assert that `copyFor(core)` never holds two opposite claims.

### 2.5 Depth plug-ins

```ts
export interface DepthModule<T> { readonly id: string; run(core: CoreResult, input: DepthInput): T }
```

Plug-ins are lines/margins, cashPath detail, alternatives, wait, options/bisect, TCO, setbacks, stress, investmentViews, incomeAtRisk and payback. They re-judge by calling `judge()` with a changed `PurchaseEffect`. Bisect does the same, and it gets faster because it no longer goes through `assessPlan`. A plug-in that could make the answer stricter (the cash-path low point, stacking, future changes) runs as a **position adapter before the judge** and can only lower figures. Everything else runs after the judge and returns facts.

---

## 3. Migration plan

Method: a strangler fig around `decide()`, characterization (golden-master) tests, then a parallel run. The trick that keeps it safe is **legacy knobs**. The new core takes a config, and with `LEGACY` set it must reproduce today's numbers exactly:

```ts
type CoreConfig = { centre: 'mean' | 'median'; tight: 'extreme' | 'second_extreme'; bigBuys: 'off' | 'on';
                    projectEveryday: boolean; cushionGrading: boolean };
const LEGACY = { centre: 'mean', tight: 'extreme', bigBuys: 'off', projectEveryday: false, cushionGrading: false };
```

Parity is proven with LEGACY. Then one knob changes per PR, each with a reviewed golden diff.

### 3.1 Keep, rewrite, delete

| Keep as is | Rewrite | Delete at the end |
|---|---|---|
| plan.ts, engine/payoff, series.ts, share.ts, pots.ts, reserve.ts, confidence.ts, currency.ts, cardRule, marketDefaults, estimateBias, runningCostPrompts; `summariseMonth` (money.ts:95) extended to return line classes; the stillDue matching in expectedMonth.ts:83-119; buildSnapshot (snapshot side unchanged) | deriveMoney (money.ts:211), prepareContext, assessPlan → month/ + judge/ + combine; position.ts → adapters; copy/verdictCopy, quickCopy, warningCopy, basisKey → verdictTable; keyFiguresCopy labels (runway ≠ cushion) | the 'month' overlay (assess.ts:146, :182-185); `leftThisMonth`; two of the three cash fields; `basisOutcomesOf` (computeCheck.ts:311-322) and `EngineRun`; firstRead's state machine; `…Month` copy variants; most of the D-88 carry-over scaffolding; the parts of types.ts that only exist for AssessContext |

### 3.2 Slices

| # | Slice | Contents | Tests | Days |
|---|---|---|---|---|
| S0 | Characterize | Freeze current outputs: the 18+ prototype scenarios (`__tests__/golden/prototype-decide.json`), plus ~300 seeded fast-check snapshots, plus 10 hand-built "life" fixtures (gig worker, a $150M windfall month, an early-month payday, a pre-existing deficit, a household). Record state, warning codes, left, cashAfter and size for each of the 3 bases. | golden JSON + `__tests__/golden/current-engine.json` | 2 |
| S1 | **Copy table now** | `verdictCode(assessment, basisOutcomes)` adapter from today's Assessment, plus VERDICT_COPY. The chip comes from the cause (fixes verdictCopy.ts:27). Rename "Cushion" to runway in the key figures. **Ships alone, no engine change.** | no-contradiction property test; update `decideCopy` guards | 3 |
| S2 | MonthModel | `engine/decide/month/{classify,past,scenarios,thisMonth}.ts`. Not wired in. | property tests: classes sum to the old spending (parity with summariseMonth); median ≤ max; a big-buy line moves from regular to allowance, so the tight month never gets worse by adding a flagged line; integer-exact; 100% branches | 5 |
| S3 | Judge + combine | `judge/`; pull dsr/housing/owe/pause/cushion out of assessPlan as small pure functions | **parity**: under LEGACY, for every S0 fixture and basis, `legacyState`, left, cashAfter and the sorted warning codes equal today's `assess()`; precedence property tests | 6 |
| S4 | Shadow run | computeCore runs both. Dev builds log diffs as codes only (Sentry breadcrumb, no amounts). A CI diff report runs over the corpus. | diff budget = 0 under LEGACY | 2 |
| S5 | Turn the knobs | One PR each: (a) projectEveryday (audit 4.1), (b) median (4.3), (c) bigBuys + allowance (the owner's point), (d) second_extreme tight (4.2), (e) cushion grading (4.6). | each PR commits a golden diff with a one-line reason per changed fixture | 8 |
| S6 | UI on the core | headline from code+lead; the "your month / this purchase" lines; BasisOutcomeCard reads `outcomes` in the fast path; "Judge on" becomes "Check against" (strictness), see 3.4 | RNTL: quick, full and home show the same code for the same inputs (extends D-01) | 7 |
| S7 | Plug-ins | First a `toLegacyContext(core)` shim so options, alternatives, setbacks and the rest run unchanged. Then port them one at a time to `DepthModule`. wait uses `rebuildMonths`. | each port keeps its deviation tests (`__tests__/deviations/*`) or retires them with a reason | 8 |
| S8 | Delete | remove the old prepareContext/assessPlan paths, the 'month' overlay, firstRead's machine, the shim and the knobs (LEGACY lives on only in the S0 fixtures) | coverage stays 100% on engine/decide and snapshot | 3 |

Total: about 44 engineer-days, so 8 to 10 calendar weeks for one person. S2 and S3 can run in parallel with S1 and S6, which brings it to 5 to 6 weeks for two people. S1 can land inside or right after PR #82. S2 onward fits best as an inserted phase (05.1), because it supersedes D-36, D-45 (in part), D-106/D-107 and D-12.

### 3.3 Testing approach

- **Golden master (characterization):** S0 freezes behaviour before anything moves. A change only enters the golden file with a written reason (Feathers' characterization tests).
- **Parity:** old against new under LEGACY must be exact to the minor unit, not within ±1. Both are integer engines, so any difference is a bug.
- **Property tests (fast-check 4.10):** money is preserved across classification; the result does not depend on line order or month order; tight.left ≤ typical.left; adding a purchase never raises any `left`; position adapters only lower figures; `combine` is monotone (a stricter input never gives a looser code); copy has no contradictions.
- **Back-test (audit L1) as the acceptance gate for S5c/d:** replay each fixture's month k−1 as "now" and compare the typical and tight predictions with month k's actual left. The BIG_BUY_SHARE constant is chosen here, not by guessing.

### 3.4 Database and stored checks

**No schema change.**
- `decide_checks.last_seen_state` / `verdict_at_decision` (check constraint fits|adjust|no|missing, `20261016000100_decide_tables.sql:18,22`): written from `legacyState`. `verdict_at_decision` is a historical record and is never recomputed. The journal (estimate against actual) does not change.
- **One-time re-baseline.** Moving to the new engine will flip some open checks' state, and that would light up "Changed since you looked" (homeRowsModel.ts:33-36, 77-81) for reasons the user did not cause. Add `seenEngine: 2` to the device hints record (decideHints.ts). While it is lower than the current version, the first computation calls `markSeen` without showing the marker, and then the version goes up. If the team prefers, a one-line in-app note can explain the change instead.
- `last_seen_basis` (logged_months | first_read_rough_figures) is about source kind, not month type, so it is unaffected.
- `settings.basis_override` ('average' | 'worst', `:109`) is reinterpreted as strictness: 'average' leads with typical, 'worst' leads with tight (stricter headline). The device-only `judgeOn: 'month'` becomes "show This month first" on the home figure. It no longer changes the verdict. These are product calls for D-107.
- `broke_line` stays as "a limit was passed": `limits.some(l => !l.passed)`.
- CheckInputs (v: 1) and paused mutations are untouched. Computations are never persisted (D-15), so no TanStack persister buster is needed.
- The only change that could later need a column is a per-line user override ("this is normal spending, not a big buy"). Defer it. Until then the existing `one_off` flag covers the "leave it out" case.

---

## 4. Risks

| Risk | Likelihood / harm | Mitigation |
|---|---|---|
| The big-buy classifier mislabels lines (a big grocery shop, rent paid outside a series) | medium / high: it moves the typical month | series lines are always regular; set the threshold by back-test; show the "big buys" list in Month details; per-line override later |
| Users see verdicts change when S5 ships | high / medium (trust) | a release note in the app; re-baseline seen states; ship the knobs over several builds, not all at once |
| The parity knobs leave temporary complexity behind | certain / low | delete in S8; LEGACY lives only in the fixtures |
| Allowance under a short history (n < 3) | medium / medium | confidence is already rough; allowance = 0 and say so ("not enough months to see your big-buy pattern") |
| Household share applied twice or missed | low / high | reuse `summariseMonth` and `shareForCategory` without changes; keep the d34 deviation test |
| 100% branch gate slows the work | certain / low | the new modules are small; the gate is a feature here |
| The decision record drifts (D-36, D-45, D-106/107, D-12 superseded) | high / medium | each slice's PR updates 05-CONTEXT (or 05.1-CONTEXT) with "supersedes D-x" |
| Compliance copy regressions in the new table | low / high | the DCU-09 guard tests run over VERDICT_COPY keys; no "should" or "recommend" |
| Effect on PR #82 timing | medium | land only S1 in #82 and keep S2+ in 05.1 |

## 5. References (from memory, not re-fetched this session)

- Gary Bernhardt, "Boundaries" / functional core, imperative shell. This repo's engine/ rule already applies it.
- Michael Feathers, *Working Effectively with Legacy Code*: characterization tests.
- Martin Fowler, "StranglerFigApplication"; GitHub's Scientist library for parallel runs (experiment, compare, publish mismatches).
- Fowler, "Money" pattern (integer minor units with explicit allocation). The repo's branded integer plus divideHalfUp already beats Dinero.js-style wrappers for this use, so keep it.
- JPMorgan Chase Institute, *Weathering Volatility 2.0*, as cited in FINANCE-AUDIT [JPMCI-2]: income and spending shocks are weakly correlated, which supports a second-extreme tight month over a min/max pair.
