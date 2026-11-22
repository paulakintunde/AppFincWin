# Phase 7: Insights - Research

**Researched:** 2026-11-22
**Domain:** Internal integration. Pure engine modules (health score, month and category figures, net-worth series) over Decide's existing month model, plus one new tab screen, level gating, and chart components in react-native-svg.
**Confidence:** HIGH on codebase facts (all read in `C:\dev\fincwin-07ctx` at this commit). MEDIUM on three design calls tagged `[ASSUMED]` (the unpaid ratio, "short" detection, joint-account net worth). No new library is needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Health score (INS-06, ARC-21)**
- **D-01:** Keep the prototype's four-part recipe and weights (prototype `FincWin United.dc.html` ~4921-4930): share of income kept, capped at 30% -> 35 points; months of emergency cover, capped at 3 -> 30; debt against yearly income, capped at 0.6 -> 20; unpaid ratio, capped at 0.6 -> 15. Round and clamp to 0-100. It lives in the pure engine (`src/engine/health/`), in integer/rational maths with stated rounding.
- **D-02:** ARC-21: every input comes from the Decide engine's own month figures (the v3 month model, the month picture, Decide's funds). The score module works out no income, spending or cover of its own. "Months of emergency cover" reads Decide's emergency money (`src/engine/decide/v3/funds/emergency.ts`), never a goal seed id.
- **D-03:** The exit gate is extra to the recipe: a month Decide calls short (left after plans below zero, or Decide's short state) cannot score in the top band (75+). Cap it below 75 and prove it with a property test.
- **D-04:** No band word. The display is the number only: "Score 72 out of 100, from these figures", then the four parts listed with their own figures. "Strong / Steady / Tight" are dropped. No grade words ("healthy", "poor", "good", "bad"). The shared copy guard covers Insights copy.
- **D-05:** Thin data shows "—" and one plain line naming what is missing (for example "Add this month's income and the score appears."). It follows the owner's ask-don't-block rule: name the gap. No partial score.
- **D-06:** The score describes **this month, live**: the same month Decide is reading today, so the two always agree. No trend line of past scores.

**Net worth over time (INS-01)**
- **D-07:** Past points are worked back from records: account opening balances plus recorded lines up to each month-end, plus holding values that have a date on or before it. Debts and holdings without dated history are held at their current figure, with a short note saying so. No new snapshot table.
- **D-08:** Each point is through `netWorthOf` (`src/features/grow/netWorth.ts`, the 06-14 / D-26 single rule). Do not write a second sum. The planner decides whether the time-series helper moves into `engine/` (it must stay pure).
- **D-09:** One point per month-end, plus today as the last point.
- **D-10:** Ranges are **6M / 1Y / All**, defaulting to 6M. No 1M.
- **D-11:** Every point uses today's exchange rates, with a note: "At today's exchange rates." Figures that can't be converted are left out, as Grow does now, and the screen says so.

**Money in and out, comparison, categories (INS-02..05)**
- **D-12:** The bars mode shows money in and money out side by side per month. The comparison mode (INS-03) shows one bar per month for what was **left** (in minus out), drawn up or down from zero. The source is `pastMonthBars` (`src/engine/month/picture.ts`), with the current month from the same rule. The figures match Decide's Month-by-month sheet.
- **D-13:** Month against previous month (INS-05): pick a month and see in / out / left totals at the top. Below that, each category's spending next to the month before, with the change as an arrow, a word and an amount, sorted by biggest change.
- **D-14:** Spending by category (INS-04): the period is one month (picked like Activity's month list) or the last 6 months or year added up. It uses the same range control as net worth, so there is one way to pick a period on the tab.
- **D-15:** The category breakdown is drawn as ranked rows: category icon, name, amount, share of total, and a thin bar (Row + ProgressBar). No donut or treemap. Share and Blocks stay out, matching the owner's 2026-11-19 answer.

**Who sees Insights, and where**
- **D-16:** The Insights tab turns on at **Everyday (level 2)**. Money in and out bars, the comparison mode, spending by category, and month against month are at Everyday. **Net worth over time and the health score are at Full picture (level 3).** Add feature rows to `featureRegistry.ts` **and** to `.planning/phases/09-tiers-onboarding/09-LEVEL-MAP.md` (a test parses it). This replaces the owner's 2026-11-19 "No" answers 4/5/8/9 in that file, which were "not built yet" answers. `availableTabs.insights` becomes true only through the level gate.
- **D-17:** Home is unchanged. No net-worth hero and no health row on Home, which keeps 06.2 D-02's card order. Net worth and the score live on Insights only.
- **D-18:** One Just me / Household switch at the top of Insights changes every chart, using the existing household scope (`useHouseholdScope`). Just me counts through `countsForMe` (the same rule as Decide). Household counts shared money once. A partner's personal lines never show in either view (ARC-22).
- **D-19:** The health score is **Just me only**. In the Household view its row reads "Your score is in Just me". The score reads Decide, which answers per person (pool rule: pooled money is held back from the member's own answers).

### Claude's Discretion
- The range for the money in/out bars and comparison mode: the same 6M / 1Y / All control, defaulting to 6M.
- Section order on the Insights screen, empty screens (06.2 empty-state pattern: icon + one line + button), and loading and offline states.
- How charts read to screen readers (each bar and point has a spoken label; a summary line per chart).
- How bars animate (06.2 motion kit: bars grow once, calm, reduced-motion respected).
- How transfers, refunds, settlements and moves between envelopes count in categories. Follow `pastMonthBars` and ARC-18 (settlements are neither spending nor income) so Insights never disagrees with Decide or Activity.
- Whether the net-worth time-series and category totals are new `engine/` modules or thin adapters over existing ones.

### Deferred Ideas (OUT OF SCOPE)
- Monthly net-worth snapshots (exact history going forward): not now. Reconsider if worked-back figures prove unreliable.
- Health score trend (past months' scores), and a household-level score (needs a household Decide month).
- Net-worth figure and health row on Home (needs a new Home layout sign-off against 06.2 D-02).
- Share (donut) and Blocks (treemap) chart styles; a year-against-year comparison; a free date-range picker.

Success criterion 5 (Activity's week / split / balance / calendar views) is already met by ACT-06 in Phase 2.2. Build nothing for it; the verifier cites ACT-06 / Phase 2.2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INS-01 | Net worth over time with a selectable range | `netWorthOf` is pure and movable to `engine/grow/`; month-end balances need no migration: `account_paid_before(p_before)` RPC + `accounts.opening_balance` through the existing `accountBalance()`; holdings via dated `holding_lots` (`kind='value'`); debts held flat. Section "Net worth worked back". |
| INS-02 | Money in and out per month as bars | `pastMonthBars(prepared)` (`engine/month/picture.ts`) gives in/out/left per month for the up-to-12 months Decide reads. Current month needs a small `engine/month` extension. Gap: "All" is capped at Decide's 12-month window (Open Question 2). |
| INS-03 | Switch between bars and a comparison mode | Same series; left-per-month mode reuses `SignedBars` (`detailKit.tsx`) unchanged. |
| INS-04 | Spending by category for a period | New pure `engine/insights` category totals over `prepared.inputs.months[].lines` (V3Line has `categoryId`, `role`, `status`); no existing multi-month category aggregation exists (only single-month `categoryUsage` for caps, which counts pending and ignores settlements). |
| INS-05 | Compare a month against the previous one | Same category totals per month + bars for in/out/left; change rows sorted by absolute change. |
| INS-06 | Financial health score with the figures behind it | New `engine/health/` reading `Prepared` via `homeReading`, `monthPicture().leftAfterPlans`, `reading.funds.emergency`, `reading.net.starter`, `inputs.debts`, `month.typicalIncome`, `month.billsDue`. Section "Health score inputs". |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Engine purity:** nothing in `engine/` imports `db/`, `state/`, `services/`, `ui/`, `data/`, `features/` or `react`. Enforced by eslint (`eslint.config.js` boundaries, `eslint/enginePurity.cjs` also bans clock, randomness, Intl, `toLocaleString`) and `.dependency-cruiser.cjs` (`engine-only-internal-src`, `engine-no-reach-impure`).
- **Money:** integer minor units, explicit rounding, never floats. BigInt inside functions, back through `minorFromBigInt`. Ratios leave the engine as integers (basis points or tenths), never floats.
- **Quality gate:** engine branch coverage below threshold fails CI. `jest.config.js`: 100% for folders in an explicit list (`money, decide, payoff, split, recurring, csv, categorize, undo, activity, ofx, statement, transfer, accounts, paste, entryList, grow, month, household`), 95% for the rest of `engine/`.
- **Compliance voice:** declarative, never "advice", "recommend", "you should", no grade words. Footer: "FincWin holds no money and moves none."
- **Design fidelity:** tokens only (`noRawColours.test.ts`), six spacing steps, own icon set, state colours only with symbol + word. Insights charts use no state colours (UI-SPEC), except `SignedBars` reuse (see Pitfall 9).
- **Do not use the Supabase MCP connector** on this project. This phase needs no migration, so no Supabase access is needed.
- **Workflow:** work starts through a GSD command; the orchestrator commits.

## Summary

Phase 7 is an integration phase. Almost every number Insights shows already exists in Decide's `Prepared` object (`engine/decide/v3/prepare.ts`): each `Reading` carries the month model (`moneyIn`, `moneyOut`, `monthLeft`, `billsDue`, `typicalIncome`, notices), the funds (`funds.emergency`), and the resolved safety net (`net.saved`, `net.starter`). `monthPicture()` already owns "left after the month's plans" (`leftAfterPlans`, pinned to `homeFigure` by a property test) and `pastMonthBars()` already gives in/out/left per recorded month under the same rules Decide's Month-by-month sheet uses. The health score therefore becomes a thin pure module that reads those figures and applies the owner's recipe in rational arithmetic; it computes no income, spending or cover (ARC-21).

Four real gaps, none needing a migration: (1) `pastMonthBars` excludes the current month and covers only Decide's 12-month lookback (`DECIDE_LOOKBACK_MONTHS = 12`, buildInputs `LOOKBACK_MONTHS = 12`), so "All" for bars and categories cannot go further back without a second read path (Open Question 2); (2) no multi-month category aggregation exists, so a small pure module over `V3Line`s is needed; (3) the net-worth time series has no existing source of month-end balances except the already-deployed `account_paid_before` RPC, which is exactly what is needed; (4) the Insights tab visibility must become level-driven, which today's static `TAB_AVAILABILITY` and module-level `tabRoutes()` do not support (D-03 in the tab-bar file says the opposite of D-16, and D-16 is the newer owner decision).

**Primary recommendation:** Build three pure engine folders (`engine/health/`, `engine/insights/`, and move `netWorthOf` plus a new series helper into `engine/grow/`), all three added to the 100% coverage list and the Stryker `mutate` list; extend `engine/month/picture.ts` with one `monthBars(prepared, {throughCurrent})` function whose `pastMonthBars` wrapper stays identical; feed every chart from one shared `Prepared` per scope; gate the tab through `useFeatureAccess` inside a small wrapper around the existing `TabBar` `availability` prop.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Health score arithmetic (weights, caps, rounding, short cap) | Engine (`engine/health`) | — | Core-value-adjacent money maths; must be property-testable in isolation (ARC-21). |
| Reading Decide figures for the score | Engine (`engine/health/inputs.ts`, takes `Prepared`) | — | The single place that touches Decide outputs, so the score can never compute income/spend of its own. |
| Month bars incl. current month | Engine (`engine/month/picture.ts`) | — | Same owner as `pastMonthBars`; Decide's sheet and Insights share one rule. |
| Category totals, month-vs-month changes, shares | Engine (`engine/insights`) | — | Pure aggregation over V3 lines, uses integer maths and the ARC-18 rules already baked into the lines. |
| Net worth rule and month-end series | Engine (`engine/grow/netWorth*.ts`) | Data layer supplies balances, FX | `netWorthOf` has no imports, so it moves unchanged; conversion at today's rates stays in `data/queries/fxConvert`. |
| Month-end balances | Database (existing RPC `account_paid_before`) | Data hook (`useQueries`) | Sums done server-side as text/BigInt-safe; no new table. |
| Scope (Just me / Household) | Data layer (choose which `Prepared`) | Persisted device pref via `useFigureScope` | Household `Prepared` built from `householdSnapshotSource`; same engine path. |
| Level gating | Features (`featureRegistry`, `useFeatureAccess`) | Shell (`TabBar` availability) | Registry mirrors the signed LEVEL-MAP; tab bar reads access. |
| Charts (`LineChart`, `InOutBars`, `SignedBars`) | UI components (react-native-svg) | — | Presentational; figures come in as props, nothing computes money. |
| Copy and guard | i18n catalogue + `rules.json` | — | A new `insights.` rule set is needed (Pitfall 6). |

## Standard Stack

### Core
No new dependencies. Everything already installed.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-native-svg | 15.15.5 (CLAUDE.md) | Line and bar charts | Already used by `SignedBars`, Grow `LineChart` `[CITED: CLAUDE.md stack table]` |
| react-native-reanimated | 4.5.1 (+ worklets 0.10.1) | Once-per-session bar grow and line draw | Pattern in `src/features/grow/ui/LineChart.tsx`, `ProgressBar` `[VERIFIED: codebase]` |
| @tanstack/react-query | 5.x | `useQueries` for per-month-end paid-before reads | Existing `usePaidBefore` pattern in `src/data/queries/pendingSplit.ts` `[VERIFIED: codebase]` |
| fast-check | 4.10.1 | Property tests for the engine modules | Existing convention (`fcRuns`, `inputsArb`) `[CITED: CLAUDE.md]` |
| jest (jest-expo) | 30.x line | Tests | `jest.config.js`, `jest.engine.config.js` `[VERIFIED: codebase]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `LineChart` in Insights | Extend `src/features/grow/ui/LineChart.tsx` (has `linePath`, `lineLength`, stroke reveal) | UI-SPEC lists a new `LineChart` (dots, ticks, readout). Reuse `linePath`/`lineLength` helpers from the Grow file; do not copy the geometry. |
| Per-month `account_paid_before` calls | One new batched RPC | New RPC = migration. Not needed: reads are cheap; keys are shared with Activity's running balance. |

**Installation:** none.

**Version verification:** no package added; versions are the ones in CLAUDE.md and `package.json`. `[VERIFIED: codebase]`

## Architecture Patterns

### System Architecture Diagram

```
 records (Supabase, RLS)                      user taps range / scope / mode
      |                                                 |
 useDecideSnapshot (12-month rows, balances, debts, FX) |
      |                                                 v
      +--> preparedV3(source)  ---- Just me -------> Prepared (mine)  -+
      |                                                                 |
      +--> householdSnapshotSource(rawSource, hhCurrency)               |
           --> preparedV3  ---- Household ------> Prepared (household) -+
                                                                        |
                         +----------------------------------------------+
                         v
  engine/month  monthBars(prepared,{throughCurrent}) --> bars  (INS-02/03)
  engine/insights  categoryTotals / compareMonths(prepared.inputs.months) (INS-04/05)
  engine/health  healthInputsOf(prepared) -> healthScore(...) -> {score, parts, thin?}  (INS-06, mine only)

 account_paid_before(month-end+1) x N  --useQueries-->  legs per month-end
 accounts.opening_balance, holdings + holding_lots(kind='value'), debts, FX latest
      |  convertLatest (data layer) -> home minor units
      v
  engine/grow  netWorthSeries(points) -> netWorthOf per point  (INS-01, level 3)

 level gate: useFeatureAccess('insights' | netWorth | healthScore) --> sections shown, tab shown
 category row tap: requestActivityFocus({month, filter}) + navigate('/activity')
```

### Recommended Project Structure
```
src/engine/health/            # score.ts (rational maths), inputs.ts (reads Prepared), index.ts, __tests__/
src/engine/insights/          # categories.ts, compare.ts, range.ts, index.ts, __tests__/
src/engine/grow/              # + netWorth.ts (moved), netWorthSeries.ts, holdingValueOn.ts
src/engine/month/picture.ts   # + monthBars(); pastMonthBars becomes a wrapper
src/data/queries/insights*.ts # useInsightsPrepared(scope), useNetWorthSeries(range, scope)
src/features/insights/        # InsightsScreen, RangeControl, LineChart, InOutBars, ScoreCard, ChartSummary, sections
src/i18n/locales/insights/    # wired into en.ts like household/features
app/(app)/(tabs)/insights.tsx # route (tab id and glyph already exist)
```
`src/features/grow/netWorth.ts` stays as a one-line re-export so `HoldingDetailScreen.tsx` and `features/grow/__tests__/netWorth.test.ts` keep importing it unchanged (or move the test with the module).

### Pattern 1: One reader of Decide, one scorer (ARC-21)
**What:** `engine/health/inputs.ts` is the only file allowed to read a `Prepared`; `score.ts` takes plain `MinorUnits` fields and never imports Decide.
**When:** always for the score.
**Example:**
```typescript
// Source: this codebase (engine/month/picture.ts homeReading + monthPicture; engine/decide/v3/prepare.ts Reading)
export function healthInputsOf(p: Prepared): HealthInputs {
  const r = homeReading(p);                 // the reading homeFigure reads
  const pic = monthPicture(p);              // leftAfterPlans === homeFigure(p), pinned by property test
  return {
    moneyIn: r.month.moneyIn,
    left: pic.leftAfterPlans,
    emergency: r.funds.emergency,           // emergencyOf(inputs.emergency).amount, live (withLiveEmergency)
    monthlyEssential: r.net.starter,        // one month of essential costs (ARC-07), rounded up
    debtTotal: sumLiveDebts(r.inputs.debts),
    typicalIncome: r.month.typicalIncome,
    billsDue: r.month.billsDue,
    moneyOut: r.month.moneyOut,
    short: pic.leftAfterPlans < 0 || hasShortNotice(r.month.notices),
  };
}
```

### Pattern 2: Rational score with stated rounding
**What:** each part is an exact fraction, rounded half-up once (`divideHalfUp` from `engine/money/rounding`), score = sum of the rounded parts clamped to 0..100, then the short cap `min(score, 74)`.
**Why part-wise:** the card prints "27 of 35" beside each part; summing rounded parts keeps the printed figures adding to the headline. This can differ from the prototype's single end rounding by 1-2 points; state it in the plan and in tests `[ASSUMED: owner has not been asked; CONTEXT only says "round and clamp"]`.
```typescript
// part 1: 35 * min(max(left,0)/moneyIn, 3/10) / (3/10) = 35 * min(10*left+, 3*in) / (3*in)
const p1 = divideHalfUp(35n * min(10n * posLeft, 3n * inn), 3n * inn);
// part 2: 30 * min(cover, 3) / 3 with cover = emergency / monthlyEssential
const p2 = divideHalfUp(30n * min(emergency, 3n * essential), 3n * essential);
// part 3: 20 * (1 - min(debt/(12*typicalIncome), 3/5) / (3/5)) = 20 * (1 - min(5*debt, 36*inc)/(36*inc))
// part 4: 15 * (1 - min(5*billsDue, 3*moneyOut)/(3*moneyOut))
```
Display figures leave the engine as integers: kept in basis points, cover in tenths of a month, debt ratio in hundredths, unpaid in hundredths (same pattern as `gainPercentTenths` in `engine/grow/gain.ts`).

### Pattern 3: Household view = same engine, other source
`src/data/queries/figureScope.ts` already has `householdSnapshotSource(source, currency)` (shared lines only at household amounts, joint accounts only, no personal plans, debts, goals) and `householdLeftAfterPlans`. Neither is used by any screen today (Home chose a row-based path), so Insights is the first consumer. Run `preparedV3(householdSnapshotSource(rawSource, reportingCurrency), null).prepared` and feed the same `monthBars`/`categoryTotals`. Pass the **raw** `useDecideSnapshot().source`, not the `source` from `useDecideV3()`, which has Decide's `household` layer attached (it would lay joint slices into the household inputs). Figures are in the household reporting currency (`useHousehold(id).data.reporting_currency`); the formatter currency must follow, as `useHomeViewModel` does with `figureCurrency`.

### Pattern 4: Level-driven tab through the existing `availability` prop
`TabBar` already accepts `availability` (default `TAB_AVAILABILITY`) and filters routes with it. The tabs layout builds `TAB_SCREENS` once at module load from static `tabRoutes()`. Plan: flip static `insights: true` (route always declared, so no remount and `tabsLayoutStable.test.tsx` stays valid), and pass a dynamic availability into `TabBar` through a small wrapper component that calls `useFeatureAccess('insights')` (a hook cannot be called inside the `tabBar={(props) => ...}` render prop itself). The screen also guards deep links: if the feature is not visible, render the empty/redirect state. This supersedes the "never derived from a user setting" comment in `availableTabs.ts` (D-16 is newer and explicit) and updates `availableTabs.test.ts` (which pins `insights: false` and 4 visible tabs).

### Anti-Patterns to Avoid
- **Score working out its own income/spend/cover.** Read the reading; test that `engine/health/score.ts` imports nothing from `decide/` or `month/`.
- **A second net-worth sum.** Always call `netWorthOf` per point.
- **Computing bars from Activity rows.** Use `prepared`, so Decide and Insights agree by construction.
- **Using `categoryUsage` for categories.** It counts pending lines, mixes income rows, ignores settlements; it serves caps.
- **Building the Household `Prepared` from `useDecideV3().source`** (carries the household layer).
- **Storing amounts in analytics.** No event needed; if one is added, literal unions only (see Security).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Net-worth sum | New sum over accounts, holdings, debts | `netWorthOf` (moved to `engine/grow/`) | Handles investment-account double count and debt-linked-to-account double count |
| Account balance from legs | New balance maths | `accountBalance({openingBalance, currency, legs})` (`engine/activity/balance.ts`) | BigInt, overflow flag, other-currency legs separated |
| Money in/out per month | Re-sum rows | `pastMonthBars` / new `monthBars` | Income eligibility rule, refunds net, ARC-18, figures match Decide's sheet |
| "Left after plans", short | Own month maths | `monthPicture().leftAfterPlans`, `homeReading` | Pinned identity with `homeFigure` |
| Settlement exclusion | New filter | Already applied in `buildInputs` (`isSettlement` rows `continue`) and `monthTotals` | ARC-18 |
| Rounding | `Math.round` | `divideHalfUp` (`engine/money/rounding`), `ceilDivide`, `minorFromBigInt` | Float ban, explicit rule |
| Currency conversion | New FX code | `convertLatest` (`src/data/queries/fxConvert.ts`) | Today's stored rates, custom currencies, returns null when unconvertible (matches D-11 "left out") |
| Bars for "left" | A second SignedBars | `SignedBars` from `detailKit.tsx` (move or re-export) | UI-SPEC D-12 |
| Open Activity filtered | New route params | `requestActivityFocus({month, filter})` (`src/state/activityFocus.ts`) then `router.navigate('/activity')` | Existing one-shot filter intent; Activity has `categoryIds` and `direction` filters. No Activity change for a single month |
| Month list | New month source | `useTransactionMonths` + `monthsForSwitcher` (`data/queries/activity.ts`) | Same list Activity uses |
| Scope persistence | New storage | `useFigureScope(screen)` (extend `FigureScreen = 'home' \| 'insights'`) | `fincwin:` key is wiped by `wipeDeviceData` |
| Level checks | Own level logic | `useFeatureAccess(id)` | Plan, household, level order (D-35) |

**Key insight:** Insights agrees with Decide and Activity only if every figure flows through the same objects. Anything computed from raw rows in the feature layer will drift from Decide's rules the first time a rule changes.

## Findings by focus area

### 1. Health score inputs from Decide (D-01..D-06, ARC-21)

All from `homeReading(prepared)` (lower `monthLeft` of the readings, first on a tie) and `monthPicture(prepared)`:

| Recipe input | Decide source | Type / notes | Gap |
|---|---|---|---|
| Share of income kept | `monthPicture(p).leftAfterPlans` over `homeReading(p).month.moneyIn` | `MinorUnits`. `leftAfterPlans` already has carried overdraft taken off (`withCarried`) and is the figure Home and Decide show. `moneyIn` = received plus still due this month (`IncomeThisMonth.total`) | none |
| Months of emergency cover | `reading.funds.emergency` (`MinorUnits \| null`, from `emergencyOf(inputs.emergency).amount`, live via `withLiveEmergency` in `prepare`) over `reading.net.starter` (one month of essential costs, ARC-07, rounded up to a whole unit) | `null` = "emergency not set" (notice `emergency_not_set`) | **No exported "months of cover" exists.** Denominator choice: use essential costs, because that is Decide's own definition of a month for the safety net (the prototype divided by total monthly out) `[ASSUMED]`. `net.saved` can differ from `funds.emergency` when a `safetyNet` record exists (it carries its own `saved`); D-02 names `emergency.ts`, so use `funds.emergency`. Zero essential costs => thin data. Not set => cover 0 (a recorded fact, not a gap) `[ASSUMED]` |
| Debt against yearly income | sum of `inputs.debts[].balance` (`V3Debt`, live debts only) over `12 * month.typicalIncome` | `typicalIncome` is Decide's usual monthly income, stable for variable earners. Prototype used this month's income; typical is a Decide-owned figure `[ASSUMED]` | no existing total; sum in `inputsOf` only. Zero typical income => thin data |
| Unpaid ratio | `month.billsDue` over `month.moneyOut` | `billsDue` = every bill occurrence this month no paid line settled, **however far in the future** (`thisMonth.ts`). Prototype: all pending lines over all out | **Meaning mismatch with the owner's label "Bills paid on time"** (Open Question 1). Also high early in the month by construction |
| "Short" (D-03) | `leftAfterPlans < 0` OR `homeReading(p).month.notices` contains `month_heading_short` or `typical_short` | notices are `Notice {code, values}` | `[ASSUMED]` set of codes. See note below |

**Important finding for D-03:** the recipe already gives part 1 = 0 whenever left is below zero, so the maximum total is 0+30+20+15 = 65, below 75. The explicit cap therefore only bites for a Decide short state that is not `left < 0` (a short usual month via `typical_short`). Keep the cap anyway (it is the exit gate, and cheap), and write the property test over arbitrary `HealthInputs` with `short: true`, asserting `score <= 74`, plus a second property tying `short` to `leftAfterPlans < 0` through `healthInputsOf(prepare(inputsArb))`.

**Thin data (D-05):** missing codes recommended: `income` when `moneyIn <= 0`; `spending` when `moneyOut <= 0`; `balance` when `inputs.accounts` is empty/undefined (the engine's `inputs.accounts` is optional) `[ASSUMED]`. `prepared.noFullMonth` and `readiness` are about other Decide flows and should not block the score (it describes this month live). Engine returns `{ kind: 'thin', missing: 'income' | 'spending' | 'balance' }` or `{ kind: 'score', score, parts[], capped }`; copy lives in i18n keyed by the code.

**Rounding and display units:** see Pattern 2. Parts expose `points`, `max`, and an integer display figure (kept: basis points; cover: tenths; debt ratio: hundredths; unpaid: hundredths).

### 2. Net worth worked back from records (D-07..D-11)

**`netWorthOf`** (`src/features/grow/netWorth.ts`, 65 lines): pure, no imports, integer in and out, throws `RangeError` beyond safe integer. It can move to `src/engine/grow/netWorth.ts` unchanged. `engine/grow` is already a 100% folder (hence its test `src/features/grow/__tests__/netWorth.test.ts` imports `@/engine/grow/__tests__/fixtures/ledger`; move it to `src/engine/grow/__tests__/` with the module, or keep the re-export and leave the test). Today the only caller is `HoldingDetailScreen.tsx` ("net worth drops by"); **no screen shows a total net worth yet**, so Insights is the first.

**Inputs available without a migration** `[VERIFIED: migrations and db modules]`:
- Account balance at a month-end: `accountBalance({ openingBalance: account.opening_balance, currency, legs })` where `legs` come from RPC `account_paid_before(p_household_id, p_before date)` (migration `20261010000400_record_polish_reads.sql`; security invoker, RLS only; returns paid sum strictly **before** `p_before`, per account and original currency, as text). For the month-end of M pass the 1st of M+1. For today use the existing `account_balances` (`useAccountBalances`). Wrapper exists: `fetchAccountPaidBefore` / `usePaidBefore` (`src/data/queries/pendingSplit.ts`, key `queryKeys.paidBefore(hh, before)`), so use `useQueries` over the month-end dates and share cache with Activity. 6M = 6 calls, 1Y = 12, All = one per recorded month.
- Other-currency legs: `accountBalance` returns them separately (`otherCurrencies`); convert each with `convertLatest(amount, currency, home, rates, customs, today)` and **leave out** what returns `null` (count them for the "N accounts could not be converted" note, D-11).
- Holdings: `holdings` row (`value`, `value_as_of`, `currency`, `account_id`) is the **current** typed value only (`guard_holding` freezes value unless the sync flag is on). Dated history is `holding_lots` rows with `kind = 'value'` (amount = value, `local_date`), the same rows `HoldingDetailScreen` reads for its history line. Value at month-end = latest `value` lot with `local_date <= month end`. (Buys and sells are cost-basis entries and do not give a value.)
- Debts: `debts.balance` is current only; `started_balance` and `paid_off_on` exist. Debts linked to an account are already inside that account's (negative) balance and `netWorthOf` skips them; only unlinked debts matter, held flat per D-07.
- Past rates: not available per month; D-11 chose today's rates for every point.

**Month-end generation, ranges:** one point per completed month-end in range plus today (so 6M = 6 month-ends + today). "All" starts at the oldest month in `transaction_months` (`useTransactionMonths`) or the earliest holding lot or holding value date, whichever is earlier.

**Account presence rule (needed, not in CONTEXT):** an account must not count in a month-end before it existed, or its opening balance inflates every earlier point. Recommended rule: an account counts at month-end M if `account_paid_before(M+1)` returned a leg for it **or** `created_at` date <= M end `[ASSUMED]`. The RPC returns no row for an account with no paid line yet, which is what makes this rule possible without extra data.

**Holding presence rule:** a holding with no value lot (or `value_as_of`) on or before M is absent from M (not held flat). Holdings with exactly one dated value count from that date at that value. Mark `heldFlat` when a holding or debt contributes a figure that has no dated history before the point, to drive the note "Debts and holdings without dated history are held at today's figure." `[ASSUMED]` reading of D-07's two sentences (Open Question 3).

**Paid-off debts:** `netWorthOf` excludes `paid_off`/`paid_off_on` debts; a debt paid off last month would vanish from every earlier point. Recommend counting a debt with `paid_off_on > month end` at `started_balance ?? balance`; otherwise early points are overstated. Flag in the note.

**Household view:** `householdSnapshotSource` keeps joint accounts only and drops debts; mirror that: joint accounts (`accounts.is_shared`), no holdings, no debts. **Just me with a joint account** is undecided (Open Question 4): Decide's own rule is "only the viewer's slice of joint money" (`engine/household/jointMoney.ts`), which is defined for today's cash, not for historical month-ends.

**Engine surface (recommended):**
```typescript
// engine/grow/netWorthSeries.ts  (pure)
export interface SeriesPoint { date: string; balances: ReadonlyMap<string, number>; holdings: NetWorthHolding[]; debts: NetWorthDebt[]; heldFlat: boolean }
export function monthEnds(today: string, firstMonth: string, count: number | null): string[];
export function holdingValueOn(valueLots: readonly {date:string; amount:number}[], date: string): number | null;
export function netWorthSeries(points: readonly SeriesPoint[]): { date: string; value: number; heldFlat: boolean }[]; // calls netWorthOf per point
```

### 3. Month bars and category totals (D-12..D-15, ARC-18)

**`pastMonthBars(prepared)`** (`engine/month/picture.ts`): over `prepared.inputs.months` where `month < asOf month`, sorted oldest first; for each month, paid lines only: `OUT_ROLES = spending, debt_payment, saved_invested, other_out` add to out, `refund` subtracts; `comesIn` = `recordedIncomeByMonth` (the typical-month eligibility rule, every month treated as full); `left = comesIn - out`, sign kept. `own_transfer`, `envelope_deposit`, `envelope_withdrawal`, `emergency_move` count as neither. Settlements are already dropped upstream (`buildInputs`: `r.isSettlement === true` => `continue`, skipped rows dropped, Savings-category outflows folded away). Decide's `MonthByMonthSheet` shows `bars.slice(-6)` (`PAST_MONTHS_SHOWN`) of `useMonthPicture().bars`, as `left` through `SignedBars`.

**Findings and gaps:**
- **Current month is excluded** (`m.month < ym` and `recordedIncomeByMonth` skips `m.month >= current`). D-12 says "current month from the same rule". Add to `engine/month/picture.ts`: `monthBars(prepared, { throughCurrent })` sharing one `barOfMonth` helper; make `pastMonthBars(p) = monthBars(p, {throughCurrent:false})` so Decide is unchanged; give `recordedIncomeByMonth` an optional `through` or include-current flag. This edits a **100% covered, Stryker-mutated** folder: add tests and a property test (`monthBars(p,{throughCurrent:false})` equals old behaviour; goesOut = comesIn - left). The current month is partial: label it "so far" in the spoken summary (Pitfall 4).
- **Leading empty months:** `inputs.months` has one entry for each of the 13 months in the lookback even with no lines, and `pastMonthBars` returns zero bars for them (`recorded.get(...) as bigint`). Trim months before the first month that has any line (or a `transaction_months` entry) in the Insights adapter; otherwise a new user sees a row of zeros. Also `inputs.months` is `[]` until Decide has one full month (`if (logged)` in `buildInputs`), so a brand-new user gets no bars: the "Whole tab, no records" or "One month so far" empty states cover it.
- **History depth:** `DECIDE_LOOKBACK_MONTHS = 12` (`data/queries/decide.ts`) and `LOOKBACK_MONTHS = 12` (`buildInputs.ts`). So 6M and 1Y fit (12 past + current); **"All" cannot exceed 13 months through `prepared`** (Open Question 2).
- **Category totals, no existing aggregator** `[VERIFIED: grep]`: `categoryUsage` (caps) counts paid **and pending**, includes income rows in the net, no settlement handling. Create `engine/insights/categories.ts`: for the months in range, over `V3Line` with `status === 'paid'`: `role === 'spending'` adds `amount`, `role === 'refund'` subtracts (refund lines carry their own `categoryId`, matching Activity's "netted off the category"); group by `categoryId` (`null` = uncategorised); clamp each category at 0 for ranking and note refunds-exceed. Debt payments, saving, transfers, envelope moves, settlements and income are not spending. Shares as integer basis points via `divideHalfUp`; categories under 1% grouped into "Everything else" (UI-SPEC). `compareMonths(a, b)` returns per-category `{this, last, change}` sorted by absolute change with `new` / `none` markers.
- **Totals will not reconcile to bars' "out"**: bars' out = spending + debt payments + saving + other out - refunds; categories = spending - refunds. Label them differently ("Spent" vs "Out") and write a property test: `sum(category totals incl. uncategorised) <= bar.goesOut`.
- **Lines Decide drops** (`buildInputs`): rows of series "covered elsewhere" (series carried by a debt, a loan check, or Savings) are not lines, and unconvertible rows are left out. Installment payments of a Decide plan therefore do not appear as spending. Same omission as Decide; note it, do not fix it here.
- **Scope:** Just me = `prepared` from `useDecideV3()` (mine rows through `mineSnapshotRows`, joint slice laid in). Household = Pattern 3. Both give `inputs.months[].lines`, so one engine path serves both.
- **Pitfall for D-18:** `countsForMe` (`engine/month/countsForMe.ts`) is applied upstream in the Mine scope adapters (`engine/household/countsForMeInput`, `mineSnapshotRows`), not in the engine month functions; Insights must not call it again on Mine lines (double counting). It matters only if someone builds a row-based path.

### 4. Household scope (D-18, D-19)

- `useHouseholdScope()` (`src/features/household/useHouseholdScope.ts`) returns who and which household (`userId`, `householdId`, `members`, `online`...). It is **not** the Mine/Household figure switch. The figure switch is `useFigureScope(screen)` (`src/features/home/useFigureScope.ts`): `'mine' | 'household'`, persisted per screen under `fincwin:figureScope.<screen>`, hidden when the household has fewer than 2 members (`useHomeViewModel`: `showScope = members.length >= 2`). Extend `FigureScreen` to include `'insights'` and reuse the `showScope` rule.
- Decide always reads the Mine scope. Joint accounts are sliced for the viewer inside `buildInputs` when a household source is attached (`withHouseholdSource`, A-CR-01 fail-closed).
- Household score rule (D-19): in Household scope the ScoreCard is replaced by the "Your score is in Just me" row; do not call `healthInputsOf` with the household `Prepared`.
- Partner personal lines never appear because the household source is built from shared lines only and database rules gate reads (ARC-22). Insights adds no query that could bypass RLS: the RPCs used are security invoker.

### 5. Level gating (D-16)

- `src/features/levels/featureRegistry.ts`: `FeatureArea = 'Recording' | 'Accounts' | 'Planning' | 'Grow' | 'System' | 'Sharing'`; `FeaturesScreen.tsx` has `AREA_ORDER` without Insight. i18n already has `features.areas.insight: 'Insight'` (hidden today because the section is empty). Add `'Insight'` to `FeatureArea` and `AREA_ORDER`.
- Recommended rows (UI-SPEC lists two; three lets each level-3 part be switched separately). `[ASSUMED]` choice, either is fine if both tests are updated: `insights` (area `Insight`, level 2, glyph e.g. `categories`/`history`), `netWorthTrend` (level 3), `healthScore` (level 3, glyph `health`). Ids must match `^[a-z][a-zA-Z0-9.]{1,40}$` (the `feature_switches.feature_id` check in `20261124000100_plans_core.sql`), **so no migration**.
- Counts become Basics 5, Everyday 20, Full picture 31, Everything 34 with three rows (or 5/20/30/33 with two). Update in lockstep: `09-LEVEL-MAP.md` section 2 table rows (the test regex needs `| id | Area | label | sub | minLevel | needsHousehold | ...`, cells[5] a digit), section 3 counts text ("N features are listed", the four "- Name: X of Y on" lines), section 5 owner answers 4, 5, 8, 9 amended; `featureRegistry.test.ts` (`toHaveLength(32)`, `[5, 19, 29, 32]`); `plansCopy.test.ts` (`>= 32 * 2` is a floor, still passes); `features.items.<id>.label|sub` copy for each new id; `Phase9FeatureId` union in `src/services/analytics/catalogue.ts` ("keep in step").
- `holdsData` probe: `null` for all three (nothing to hold).
- Tab visibility: see Pattern 4. `TAB_AVAILABILITY.insights: true`; `availableTabs.test.ts` pins the old map and positions (`{ position: 2, total: 4 }`): rewrite the expectations. `TabGlyphs.tsx` already draws the `insights` glyph; `shell.tab.insights = 'Insights'` already exists in `en.ts`. New route `app/(app)/(tabs)/insights.tsx` following `grow.tsx` (thin route over a feature screen, `TabRootScreen` wrapper). `BUILT_TABS` in `availableTabs.ts` becomes unnecessary for insights once it is declared visible.
- Section gating inside the screen: `useFeatureAccess('netWorthTrend')`, `useFeatureAccess('healthScore')`; a user who has a feature switched on below their level sees it (evaluateAccess), and a missing level reads as 4.

### 6. UI primitives, i18n, copy guard, analytics

- **Available:** `Screen`/`TabRootScreen`, `Row`, `StatTile`, `StackedBar`, `ProgressBar` (`animate`, `tone: accent|blue|ink`, thin 4), `SegmentedControl`, `SegmentedToggle` (`haptic` prop), `EmptyState` (heading, body, icon, action), `AmountDisplay`, `CategoryGlyph`, `StateBadge`, `SectionHeader`, `SyncStatusLine`, `useSettledLabel`, motion kit (`FadeIn`, `FadeSwap`, `RiseIn`, `useOncePerSession`, `useReduceMotion` in `@/theme/motion`), icons `stateUp`, `stateDown`, `stateShort`, `info`, `health`, `history` (all present in `iconData.ts`). Typography: `fontSize.netWorth` (42), `fontSize.healthScore` (32), `fontSize.meta` (12.5) are `fontSize` entries, not roles.
- **Gaps in primitives (small edits, each with tests):**
  - `StatTileRow` renders **at most two** tiles (`Children.toArray(children).slice(0, 2)`). The In / Out / Left strip needs three: add a `columns` prop or a `StatTileTriplet`; keep the stack-at-large-text rule (`useShouldStack`).
  - `SegmentedControl` always fires `hapticTick()` on change; UI-SPEC says no haptic for range, mode, scope. Add `haptic?: boolean` (default true) as `SegmentedToggle` has.
  - `Row` has no slot under its text for a `ProgressBar`; add an optional `footer` prop or build a small `CategoryRow` composite.
  - `SignedBars` draws the down bar in `stateColors.short.stroke` and the zero line in `colors.line4`; UI-SPEC says "reuse unchanged" and also "no state colours / not line4". Reuse unchanged for Decide parity and record the exception in the plan (Pitfall 9).
  - Grow's `LineChart` exposes `linePath`/`lineLength`; reuse them for the Insights chart.
- **i18n:** catalogue is `src/i18n/locales/en.ts` composed from sub-folders (`household`, `features`, `appLife`, `decideScreens`...). Add `src/i18n/locales/insights/index.ts` and wire `insights` into `en.ts`; use curly apostrophes only (house convention, e.g. `householdCopy.test.ts`). Add an `insightsCopy.test.ts` like `householdCopy.test.ts`.
- **Copy guard gap (important):** `src/i18n/copyGuard/rules.json` has three sets: `decide` (prefix list), `grow` (`grow.`), and `general` (prefix `""`, bans only "you should", "recommend", "we suggest"). A new `insights.` namespace would fall into `general` only, so grade words would not be caught, contrary to D-04 and the fix plan's "the guard covers Insights copy". Add a set `{"name":"insights","prefixes":["insights."],"banned":["\\b(advice|advise|recommend\\w*|should|best|better|optimal|healthy|unhealthy|poor|good|bad|strong|steady|tight|great|excellent)\\b"]}`. (`src/i18n/__tests__/copyGuard.test.ts` walks every `en` leaf and also fails on stale allowlist entries.) Mind that "short" is allowed. The UI-SPEC's bans (no "advice" even in a negation) mean copy must not say "This is not advice".
- **Hard-typed text:** `eslint.config.js` has a hard-text rule (`ignores: ['src/ui/Text.tsx', ...]` near line 164); all Insights strings go through `t()`.
- **Analytics:** `src/services/analytics/catalogue.ts` is a closed, finite catalogue (`AssertAll`/`CATALOGUE_IS_FINITE` rejects loose string/number properties). Insights needs no event. If a view event is wanted later: `insights_viewed: { range: '6m'|'1y'|'all'; mode: ... }` with literal unions, no amounts.
- **Data map (S5):** no new table, so no `docs/compliance/data-map.md` row is required. If the range/mode/scope is persisted, use the `STORAGE_PREFIX` key (`fincwin:`), already covered by DM-21 and wiped by `wipeDeviceData`.

### 7. Test infrastructure

- Frameworks: Jest 30 (`jest-expo` preset) for everything; engine-only slim config `jest.engine.config.js` (`npm run test:engine`, roots `src/engine`, no coverage); `jest.config.js` carries the coverage thresholds. Engine tests live in `src/engine/<folder>/__tests__/`. Fixtures: `src/engine/decide/v3/__tests__/helpers/fixtures.ts` (`inputsOf`, `monthOf`, `v3Line`, `v3Series`), `fcRuns.ts`, `invariants/arbitraries.ts` (`inputsArb`). Property tests use `fc.assert(fc.property(...), { numRuns: fcRuns(200), seed })` (see `engine/month/__tests__/picture.property.test.ts`); Stryker runs cap runs at 10.
- **Coverage gate edit:** add `'health'`, `'insights'` to the 100% folder list in `jest.config.js` (the list is explicit; `grow` and `month` are already in). New folders otherwise fall under the 95% `src/engine/` rule.
- **Mutation config:** `stryker.config.mjs` `mutate` covers `decide/v3`, `month` and five shared leaf files only. `engine/health` and `engine/insights` should be added (the score is the one place a wrong number reaches the user); `scripts/check-stryker-disables.mjs` `TARGETS` lists the folders whose Stryker-disable comments must carry a reason, add them too. Mutation is deferred to pre-launch (memory: milestone test runs), so add config now, run at the milestone.
- **Lint/arch:** `npm run depcruise`, `npm run lint`, `npm run typecheck`; `src/test/lint/enginePurity.test.ts` proves ENG-16.
- Existing tests that will break and must be updated: `featureRegistry.test.ts`, `availableTabs.test.ts`, `Phase9FeatureId` typecheck, `FeaturesScreen.test.tsx` (new area section), possibly `tabsLayoutStable.test.tsx` fixtures and `TabBar.*` tests if `availability` plumbing changes.

### 8. Supabase

**No migration needed** `[VERIFIED: migrations and db modules]`. Reads use already-deployed security-invoker RPCs (`account_paid_before`, `account_balances`, `transaction_months`) and existing tables (`holdings`, `holding_lots`, `debts`, `accounts`). Feature ids pass the existing `feature_switches` regex. The only path that would need a migration is a new batched server aggregation for "All" beyond 12 months (Open Question 2, option B) - flag if chosen; the research recommendation avoids it.

## Common Pitfalls

### Pitfall 1: The unpaid ratio is not "paid on time"
**What goes wrong:** `billsDue / moneyOut` counts every unpaid bill this month, including ones not yet due, so on the 1st the score loses up to 15 points for a user who has done nothing wrong, and the row label "Bills paid on time" says something the figure does not.
**Why:** `billsDue` is "every occurrence this month that no paid line settled, however long ago its date was" (`thisMonth.ts`).
**How to avoid:** Owner decision (Open Question 1). Either rename the part ("Bills still to pay") or build a past-due variant, which needs a new exported figure from the month model (100% covered folder).
**Warning signs:** score drops on payday-eve then jumps as bills are marked paid.

### Pitfall 2: Short month vs score disagree with Decide
**What goes wrong:** Insights shows 80 while Decide Home says the month ends short (fix-plan row 12).
**How to avoid:** use `leftAfterPlans` (the `homeFigure` identity) and the same reading (`homeReading`); keep the property test tying `short` to the picture.

### Pitfall 3: Part rounding does not add up
**What goes wrong:** card prints "27 + 18 + 16 + 11" next to "Score 72".
**How to avoid:** round each part once, total = sum of rounded parts (Pattern 2); test `sum(parts.points) === score` when not capped.

### Pitfall 4: Current month is partial
**What goes wrong:** "Left" for this month reads as a loss because paid in so far is small, and differs from Decide's "left after plans".
**How to avoid:** label "so far" in text and a11y; keep month-against-last tiles on whole months where the picked month is complete, and say so when the picked month is the current one.

### Pitfall 5: Opening balances before an account existed
**What goes wrong:** net-worth line shows a step up for accounts opened recently.
**How to avoid:** the account presence rule in section 2; test with an account created mid-range.

### Pitfall 6: Copy guard does not cover `insights.`
Add the rule set (Section 6) before writing copy, and a failing test first.

### Pitfall 7: Household source built from the wrong snapshot
Pass raw `useDecideSnapshot().source` to `householdSnapshotSource` (Pattern 3). A test should show the household `Prepared` has no personal debts and only joint accounts.

### Pitfall 8: `inputs.months` window and empty leading months
Trim leading empty months; do not promise "All" beyond 13 months (Open Question 2); handle `months: []` before the first full month.

### Pitfall 9: SignedBars colours contradict the UI-SPEC colour table
`SignedBars` uses `stateColors.short.stroke` for down bars and `line4` for the zero line. Reusing it unchanged keeps Decide parity but breaks "no state colours in charts". Decision for the plan: keep unchanged (spec says so, "short" is also in words) and note it in the compliance note.

### Pitfall 10: Tab visibility change can remount the navigator
`TAB_SCREENS` is built once at module load so a cache change cannot remount the Tabs (06.1-78 H-15, `tabsLayoutStable.test.tsx`). Keep the insights route always declared; only the bar's availability is dynamic.

### Pitfall 11: Long-range reads and cache size
`All` net worth = one RPC per month. A user with 8 years has 96 calls; each is small, but cap concurrency and rely on `useQueries` with stable keys; show the line as it loads (sections load independently, UI-SPEC).

### Pitfall 12: Floats sneaking into shares and ratios
Keep shares in basis points, cover in tenths. Formatting to "2.1 months" happens in UI with integer division by 10 for display.

## Code Examples

### Month-end balance for one account (existing pieces)
```typescript
// Source: src/engine/activity/balance.ts, src/db/recordReads.ts (fetchAccountPaidBefore), src/data/queries/pendingSplit.ts
const legs = paidBefore.filter((l) => l.accountId === a.id).map((l) => ({ currency: l.currency, paidSum: l.paidSum }));
const own = accountBalance({ openingBalance: a.opening_balance, currency: a.currency, legs });
// own.balance (account currency) -> convertLatest(...) -> home minor units; null => left out and counted
```

### Open Activity on a category and month (existing intent)
```typescript
// Source: src/state/activityFocus.ts, src/engine/activity/filters.ts
requestActivityFocus({ month, filter: { ...EMPTY_FILTER, categoryIds: [categoryId], direction: 'out' } });
router.navigate('/activity' as Href);
```
For 6M / 1Y / All there is no multi-month Activity filter; open the latest month in the range (the UI-SPEC fallback). The `categoryIds` entry for uncategorised is `null`.

### Level-driven tab availability
```typescript
// Source: src/shell/tabBar/TabBar.tsx (availability prop), src/features/levels/useFeatureAccess.ts
function GatedTabBar(props: BottomTabBarProps) {
  const insights = useFeatureAccess('insights').visible;
  return <TabBar {...props} availability={{ ...TAB_AVAILABILITY, insights }} />;
}
```

## State of the Art

| Old approach | Current approach | Impact |
|--------------|------------------|--------|
| Prototype computed score from goal seed `s1` and `S.items` | Score reads Decide's reading (ARC-21) | No seed ids; agrees with Decide |
| Prototype used floats and band words | Rational maths, number only | D-01, D-04 |
| Old Decide engine | v3 only; old engine deleted (05.5-19) | Import from `engine/decide/v3` internals only from inside `engine/` (depcruise `decide-engine-barrel-only` allows `engine/` importers); features use the barrel |

**Deprecated/outdated:** do not use the `useHouseholdScope` name for the Mine/Household figure switch (it is a membership hook); the figure switch is `useFigureScope`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Months of cover = `funds.emergency / net.starter` (one month of essential costs), not total monthly out as in the prototype | Findings 1 | Score differs from owner's expectation; copy "Counts up to 3 months" must name which month |
| A2 | Emergency not set counts as 0 months (not thin data) | Findings 1 | Users with no safety net see "—" instead of a low score |
| A3 | Debt ratio denominator = `12 * month.typicalIncome` | Findings 1 | Variable earners get a different ratio than the prototype |
| A4 | "Short" = `leftAfterPlans < 0` or notice `month_heading_short`/`typical_short` | Findings 1 | Top-band exit gate (Phase 11 criterion 12) could miss a state Decide calls short |
| A5 | Part-wise rounding (sum of rounded parts) | Pattern 2 | Differs from prototype by up to 2 points |
| A6 | Thin-data codes: income, spending, balance as listed | Findings 1 | Copy variants in UI-SPEC may need another trigger |
| A7 | Account presence rule (leg exists or created_at <= month end) | Findings 2 | Net-worth line steps or gaps for new accounts |
| A8 | Holding absent before its first dated value; held flat only when no dated history | Findings 2 | D-07 reading differs from owner's intent (Open Question 3) |
| A9 | Paid-off debts count before `paid_off_on` at `started_balance ?? balance` | Findings 2 | Early points overstated if skipped |
| A10 | Three feature rows (`insights`, `netWorthTrend`, `healthScore`) instead of two | Findings 5 | Counts in LEVEL-MAP differ (5/20/31/34 vs 5/20/30/33); trivial to switch |
| A11 | `StatTileRow`, `SegmentedControl`, `Row` need small additions | Findings 6 | UI-SPEC deviations if skipped |

## Open Questions (owner questions, genuinely blocking; plain English)

1. **"Bills paid on time" or "bills still to pay"?**
   - What we know: Decide's figure is the share of this month's money out that is still unpaid bills, including bills not yet due. Early in the month it is high for everyone.
   - What's unclear: the owner chose the label "Bills paid on time" (UI-SPEC owner decision 1), which means overdue bills only.
   - Recommendation: keep the figure from Decide and rename the part "Bills still to pay" (no engine change). The alternative (overdue only) needs a new Decide month figure and tests in a 100% folder. Ask as a popup with these two options.

2. **How far back should "All" go for the bars and categories?**
   - What we know: Decide reads 12 months back (13 with this month). Net worth can go further because it reads balances by date.
   - What's unclear: whether "All" for bars and categories may stop at those 13 months.
   - Recommendation: stop at what Decide holds and say so in the label ("Last 12 months and this one"), with the net-worth line going all the way back. A longer history needs a separate read path later (a migration or a second client fetch) and risks disagreeing with Decide.

3. **A holding with no dated value before a month: leave it out or hold it flat?**
   - What we know: D-07 says holdings with a date on or before the month-end count; holdings without dated history are held at today's figure.
   - What's unclear: a holding added this month with one value. Held flat, it appears in every earlier point and inflates old net worth.
   - Recommendation: it appears from its first dated value; "held flat" is only for debts and for holdings with no date at all.

4. **Just me net worth with a joint account.**
   - What we know: Decide counts only the viewer's slice of joint money today; slices are not defined for past month-ends.
   - What's unclear: whether Just me net worth counts a joint account whole, by slice, or not at all.
   - Recommendation: Just me counts personal accounts whole and joint accounts not at all; Household counts joint accounts once; the net-worth card says which. Confirm with the owner because it changes the headline number for couples.

(Non-blocking, planner may decide: two vs three feature rows; whether the current month appears in the "left" chart as "so far".)

## Environment Availability

Step 2.6: no new external dependencies. Verified in the repo: Node/Jest via `package.json` scripts, the three RPCs and tables are already in migrations. No Docker, Supabase CLI or device is needed to build or unit-test this phase. Device checks (Pixel text-fit at 320 dp, font scale 200%) happen at the milestone per memory notes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 via `jest-expo`; fast-check 4.10.1 for properties; React Native Testing Library for components |
| Config file | `jest.config.js` (thresholds), `jest.engine.config.js` (engine only, no coverage) |
| Quick run command | `npx jest src/engine/health src/engine/insights src/engine/grow src/engine/month --coverage=false` |
| Engine suite | `npm run test:engine` |
| Full suite command | `npm test` (CI: `npm run test:coverage`); plus `npm run typecheck`, `npm run lint`, `npm run depcruise`, `npm run check:icons` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INS-06 | Recipe weights and caps, part rounding, clamp 0..100 | unit + property | `npx jest src/engine/health --coverage=false` | Wave 0 |
| INS-06 / D-03 | Short month never scores 75+ (property over `HealthInputs` and over `healthInputsOf(prepare(inputsArb))`) | property | same | Wave 0 |
| INS-06 / D-02 | `engine/health/score.ts` imports nothing from `decide/` or `month/` (import-graph test); score equals sum of parts | unit | same | Wave 0 |
| INS-06 / D-05 | Thin data returns the missing code, no partial score | unit | same | Wave 0 |
| INS-01 | `netWorthSeries` calls `netWorthOf` per point; month-end generation; `holdingValueOn`; account presence; held-flat flag; unconverted left out | unit + property | `npx jest src/engine/grow --coverage=false` | Wave 0 (+ move `netWorth.test.ts`) |
| INS-01 | Hook builds points from RPC legs, FX, holdings, lots, debts; range 6M/1Y/All | hook/integration | `npx jest src/data/queries/__tests__/insightsNetWorth.test.ts --coverage=false` | Wave 0 |
| INS-02 / INS-03 | `monthBars(p,{throughCurrent:false})` equals `pastMonthBars`; current month bar; `goesOut = comesIn - left` | unit + property | `npx jest src/engine/month --coverage=false` | extend existing |
| INS-02 / INS-03 | Insights bars equal Decide's `useMonthPicture().bars` for shared months | integration | `npx jest src/features/insights --coverage=false` | Wave 0 |
| INS-04 | Category totals: paid only, refunds net, settlements/transfers/envelope moves excluded, uncategorised row, shares in bp, "Everything else" under 1% | unit + property | `npx jest src/engine/insights --coverage=false` | Wave 0 |
| INS-04 | `sum(categories) <= bar.goesOut` per month | property | same | Wave 0 |
| INS-05 | `compareMonths` change, sort by absolute change, new/none markers, missing previous month | unit | same | Wave 0 |
| D-16 | Registry rows match LEVEL-MAP (drift test), counts, area `Insight`, analytics `Phase9FeatureId` | unit | `npx jest src/features/levels src/services/analytics --coverage=false` | extend existing |
| D-16 | Tab hidden below level 2, shown at 2; route stays declared | component | `npx jest src/shell/tabBar --coverage=false` | extend existing |
| D-18 / D-19 | Household `Prepared` has joint accounts only, no personal debts; score row replaced in Household | integration | `npx jest src/features/insights src/data/queries --coverage=false` | Wave 0 |
| D-04 / S1 | Copy guard over `insights.` (grade words, advice), curly apostrophes, no hard-typed text | unit/lint | `npx jest src/i18n --coverage=false` and `npm run lint` | Wave 0 (+ `rules.json` set) |
| UI | Range control, StatTile triplet stacks at font scale > 1.3, chart a11y labels, Reduce Motion, empty and error states | component | `npx jest src/features/insights src/ui --coverage=false` | Wave 0 |
| Gate | Engine coverage 100% for `health`, `insights`, `grow`, `month` | CI | `npm run test:coverage` | config edit |

### Sampling Rate
- **Per task commit:** the quick run command for the touched folder.
- **Per wave merge:** `npm run test:engine` plus `npm run typecheck` and `npm run depcruise`.
- **Phase gate:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run depcruise`, `npm run check:icons` green before `/gsd-verify-work`. Mutation run (`npm run test:mutation`) deferred to the pre-launch milestone per owner decision; config added now.

### Wave 0 Gaps
- [ ] `src/engine/health/__tests__/{score,inputs,short.property}.test.ts`
- [ ] `src/engine/insights/__tests__/{categories,compare}.test.ts`
- [ ] `src/engine/grow/__tests__/{netWorthSeries,holdingValueOn}.test.ts` (and `netWorth.test.ts` moved)
- [ ] `src/engine/month/__tests__/monthBars.test.ts`
- [ ] `jest.config.js` 100% list: add `'health'`, `'insights'`
- [ ] `stryker.config.mjs` `mutate` and `scripts/check-stryker-disables.mjs` `TARGETS`: add the two folders
- [ ] `src/i18n/copyGuard/rules.json` `insights` set; `src/i18n/__tests__/insightsCopy.test.ts`
- [ ] `src/features/insights/__tests__/*` and `src/data/queries/__tests__/insights*.test.ts`

## Security Domain

`security_enforcement` is absent in `.planning/config.json`, so it applies.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no auth change |
| V3 Session Management | no | unchanged |
| V4 Access Control | yes | RLS on `transactions_active`, `holdings` (owner-private), `accounts`; Insights adds only security-invoker RPC reads. Household view built from shared lines only (ARC-22). A test must show a partner's personal line cannot reach either view |
| V5 Input Validation | yes | Any new route/intent input validated like `monthParamOf` (YYYY-MM regex) and uuid checks (`debtParamOf` pattern). Category ids come from the user's own data, not from params |
| V6 Cryptography | no | none |
| V8 Data Protection | yes | No amounts in analytics (closed catalogue); device prefs under `fincwin:` wiped on sign-out/deletion; no new table, so no data-map row or deletion path |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Household chart leaks a partner's personal spending | Information disclosure | Household source = shared lines only; database rules gate reads; no client-side filter relied on |
| Amount or category in an analytics event | Information disclosure | Catalogue type rejects non-literal properties; add no event or literal unions only |
| Wrong score read as regulated advice | Spoofing/compliance | Number only, "from these figures", guard set `insights.`, footer line |
| Stale cached figure shown as live | Tampering (integrity) | Score never shown from a stale cache as live; "Offline · as of" line (UI-SPEC) |

Compliance note for the merge request (S6): no new table or data category; reads only; copy guard extended; score is a declarative reading of the user's own figures.

## Sources

### Primary (HIGH confidence, read in `C:\dev\fincwin-07ctx`)
- `src/engine/month/picture.ts`, `types.ts`, `countsForMe.ts`, `model/thisMonth.ts`, `model/incomePattern.ts`
- `src/engine/decide/v3/{prepare,afterBuy,safetyNet,essentialCosts,types,constants,index}.ts`, `funds/{emergency,build}.ts`, `debts.ts`
- `src/features/grow/netWorth.ts` and test, `HoldingDetailScreen.tsx`, `src/features/grow/ui/LineChart.tsx`
- `src/data/queries/{decide,decideV3,figureScope,pendingSplit,activity}.ts`, `src/db/{recordReads,holdings,holdingLots,debts}.ts`, `src/engine/activity/{balance,totals,monthFigures,filters}.ts`, `src/engine/categorize/usage.ts`
- `src/features/decide/screens/answer/detail/{MonthByMonthSheet,detailKit}.tsx`, `engine/useMonthPicture.ts`
- `src/features/home/{useFigureScope,useHomeViewModel}.ts`, `src/features/household/useHouseholdScope.ts`, `decide/snapshot/v3/{buildInputs,householdScope}.ts`, `snapshot/fullMonths.ts`
- `src/features/levels/{featureRegistry,evaluateAccess,useFeatureAccess,FeaturesScreen}.ts*`, `__tests__/featureRegistry.test.ts`, `09-LEVEL-MAP.md`
- `src/shell/tabBar/{availableTabs,tabs,TabBar,TabGlyphs}.ts*`, `app/(app)/(tabs)/_layout.tsx`, `grow.tsx`, `activity.tsx`
- `src/state/activityFocus.ts`, `src/features/record/activity/{monthFilter,debtFilter}.ts`
- `src/ui/{StatTile,SegmentedControl,SegmentedToggle,Row,EmptyState,ProgressBar}.tsx`, `src/ui/motion/useOncePerSession.ts`
- `src/i18n/copyGuard/rules.json`, `src/i18n/__tests__/{copyGuard,householdCopy}.test.ts`, `src/i18n/locales/features/index.ts`, `en.ts` structure
- `src/services/analytics/catalogue.ts`, `docs/compliance/data-map.md`
- `jest.config.js`, `jest.engine.config.js`, `stryker.config.mjs`, `.dependency-cruiser.cjs`, `eslint/enginePurity.cjs`, `scripts/check-stryker-disables.mjs`
- Migrations: `20261010000400_record_polish_reads.sql`, `20260926000600_record_read_rpcs.sql`, `20261106000100_grow_schema.sql`, `20261124000100_plans_core.sql`
- `.planning/phases/07-insights/07-CONTEXT.md`, `07-UI-SPEC.md`, `.planning/research/DECIDE-FIX-PLAN.md` (ARC-21 lines 274-276, 317, 649, 1459), `FincWin United.dc.html` 4905-4940

### Secondary / Tertiary
- None. No web sources were needed: the phase adds no external library or API.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new dependencies, all versions from CLAUDE.md and the repo.
- Architecture: HIGH for integration points (read directly); MEDIUM for the choices tagged `[ASSUMED]`.
- Pitfalls: HIGH for items 1-3, 5-10 (traced in code); MEDIUM for item 11 (performance not measured).

**Research date:** 2026-11-22
**Valid until:** until Decide's month model or `buildInputs` lookback changes (30 days for the rest).
