---
phase: 07-insights
reviewed: 2026-11-23T00:00:00Z
depth: deep
files_reviewed: 46
files_reviewed_list:
  - app/(app)/(tabs)/_layout.tsx
  - app/(app)/(tabs)/insights.tsx
  - jest.config.js
  - stryker.config.mjs
  - scripts/check-stryker-disables.mjs
  - src/data/queries/insights.ts
  - src/data/queries/insightsNetWorth.ts
  - src/engine/grow/index.ts
  - src/engine/grow/netWorth.ts
  - src/engine/grow/netWorthSeries.ts
  - src/engine/health/index.ts
  - src/engine/health/inputs.ts
  - src/engine/health/score.ts
  - src/engine/health/types.ts
  - src/engine/insights/categories.ts
  - src/engine/insights/compare.ts
  - src/engine/insights/index.ts
  - src/engine/insights/range.ts
  - src/engine/month/index.ts
  - src/engine/month/picture.ts
  - src/features/grow/netWorth.ts
  - src/features/grow/ui/LineChart.tsx
  - src/features/home/useFigureScope.ts
  - src/features/insights/InsightsScreen.tsx
  - src/features/insights/charts/CategoryRow.tsx
  - src/features/insights/charts/ChartSummary.tsx
  - src/features/insights/charts/InOutBars.tsx
  - src/features/insights/charts/NetWorthLine.tsx
  - src/features/insights/charts/RangeControl.tsx
  - src/features/insights/format.ts
  - src/features/insights/model/everyday.ts
  - src/features/insights/sections/MoneyInOutSection.tsx
  - src/features/insights/sections/MonthAgainstLastSection.tsx
  - src/features/insights/sections/NetWorthSection.tsx
  - src/features/insights/sections/ScoreCard.tsx
  - src/features/insights/sections/WhereItWentSection.tsx
  - src/features/insights/sections/cardBits.tsx
  - src/features/insights/useInsightsScope.ts
  - src/features/levels/FeaturesScreen.tsx
  - src/features/levels/GatedTabBar.tsx
  - src/features/levels/featureRegistry.ts
  - src/i18n/copyGuard/rules.json
  - src/i18n/locales/insights/index.ts
  - src/services/analytics/catalogue.ts
  - src/shell/tabBar/availableTabs.ts
  - src/theme/tokens.ts
  - src/ui/ProgressBar.tsx
  - src/ui/Row.tsx
  - src/ui/SegmentedControl.tsx
  - src/ui/StatTile.tsx
findings:
  critical: 1
  warning: 4
  info: 7
  total: 12
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-11-23
**Depth:** deep (engine + data layer + screens, cross-checked against the snapshot builder, RLS policies and RPCs)
**Files Reviewed:** 46 source files (test files read only where they bear on correctness)
**Status:** issues_found

## Summary

The pure engine work holds up well. `healthScore` weights are right (35/30/20/15). Each part is rounded once with integer
BigInt maths. The short cap at 74 is applied correctly. `barsInRange` and `monthEndsFor` both give D-26a's "N full months +
this month so far": the snapshot builder makes `inputs.months` a dense list over the lookback window, so slicing by count is
safe. `netWorthSeries` calls `netWorthOf` once per point. The today point reads paid-only balances (`account_balances`
`paid_sum`), and the past points read `account_paid_before` (`status = 'paid'`). Engine imports are clean (relative only, no
db/state/services/ui/react). Debts and holdings are owner-only under RLS (`own debts`, `own holdings`), so a partner's
personal debts cannot leak into Just me net worth.

The main defect is in the net-worth data hook. It reports `ready` while most of its inputs are still loading or have failed,
so the card shows a wrong net-worth figure as if it were final. Four warnings cover scope and thin-data gaps:

- the unconverted note says "accounts" even when it is counting holdings or debts;
- a first-month user sees an empty Insights tab;
- Household (and Just me shared-line) categories cannot resolve a partner's category names;
- Household "In" drops shared income that relied on the series for eligibility.

## Critical Issues

### CR-01: Net worth shows "ready" with debts, holdings, FX rates or today's balances still loading or failed, so the figure is wrong

**File:** `src/data/queries/insightsNetWorth.ts:203-210, 244-245, 271`
**Issue:** `status` comes only from the per-month `paidBefore` reads, `accountsQuery` and `monthsRead`. These are not part of `anyLoading` / `anyError`:
- `useAccountBalances(...).isLoading` (line 205). While loading or on error, `query.data` is undefined, so `buildAccountBalanceView` builds each account from its opening balance alone (`activity.ts:330-345`).
- `debtsQuery` (falls back to `NO_DEBTS`).
- `holdingsQuery` and `lotsQuery` (fall back to `NO_HOLDINGS` / `NO_LOTS`).
- `fx` (falls back to `NO_RATES`).
- `customsQuery`.

Concrete failure: a user with a $12,000 loan (no account) opens Insights offline before the debts query has any cache. `useDebts` errors, `debts = []`, and the card shows net worth $12,000 higher than it is, with status `ready` and no error. On a cold start the same thing happens briefly with today's balances: the "as of today" figure and the "Up/Down X over 6 months" line come from opening balances only. Missing FX rates make every foreign-currency account "unconverted" and leave it out of the figure. This is exactly the "wrong figure shown as trustworthy" case.
**Fix:** Include every input in the status:
```ts
const balancesRead = useAccountBalances(hh, accounts); // keep isLoading
const inputs = [accountsQuery, debtsQuery, holdingsQuery, lotsQuery, fx, customsQuery];
const anyLoading =
  reads.some((r) => r.data === undefined && !r.isError) ||
  monthsRead.isLoading || balancesRead.isLoading ||
  inputs.some((q) => q.isLoading);
const anyError =
  reads.some((r) => r.isError && r.data === undefined) ||
  inputs.some((q) => q.isError && q.data === undefined);
```
`useAccountBalances` should also expose `isError`. Without it, a failed balances read still falls back to opening balances only. Extend `retry` to refetch these queries too.

## Warnings

### WR-01: The "could not be converted" note always says "accounts", but its count also includes holdings and debts

**File:** `src/data/queries/insightsNetWorth.ts:266` (with `buildNetWorthInputs` lines 102-117), `src/i18n/locales/insights/index.ts` (`netWorth.notes.unconverted_*`)
**Issue:** `unconverted = unconvertedIds.size + build.unconverted`. `build.unconverted` counts holdings and debts that could not be converted. The copy always says "{{count}} account(s) could not be converted and is left out." Concrete case: a loan in a currency with no rate is dropped from the figure, so net worth goes *up* by the loan amount. The note then tells the user an *account* was left out, which points them at the wrong thing and hides that a debt is missing.
**Fix:** Return separate counts (`unconvertedAccounts`, `unconvertedHoldings`, `unconvertedDebts`) and add a note key for each, e.g. "1 debt could not be converted and is left out." Run the new keys through the copy guard.

### WR-02: A user in their first month sees an empty Insights tab, even with entries this month

**File:** `src/features/insights/InsightsScreen.tsx:51-64`; root cause `src/features/decide/snapshot/v3/buildInputs.ts:185, 251, 325`
**Issue:** The builder fills `inputs.months` only when `logged` (at least one *full* past month). A new user who has logged income and spending only this month gets `months = []`. Then `recordedMonths(prepared)` is empty, `empty` is true, and the whole tab shows "Nothing to show yet. Add a few entries and your months appear here." This hides the in/out bars, "Where it went", Net worth (which needs only accounts) and the Score. The Score is supposed to name the gap (D-05) instead. The copy asks for entries the user has already added. This contradicts D-26a ("this month so far") and the ask-don't-block rule.
**Fix:** Do not gate the whole tab on `recordedMonths`. Let each section own its empty state, which they already do. At minimum, always render `NetWorthSection` and `ScoreCard` when their features are visible. For the Everyday sections, build this month's bar from the raw rows, or show a copy line that names the real reason ("Insights start after your first full month").

### WR-03: Partner's category ids show as "No category" in Household view and on shared lines

**File:** `src/features/insights/sections/WhereItWentSection.tsx:35-36, 97`, `src/features/insights/sections/MonthAgainstLastSection.tsx:31-32, 103`
**Issue:** Category names come from `useCategories(rc.userId)`. The RLS policy `owner reads own categories` (`20260926000100_categories.sql:112`) returns only the viewer's own categories. In the Household scope, shared lines recorded by the partner carry the partner's category ids. Each one becomes its own row labelled "No category", with a slate letter glyph. The partner's "Groceries" and the viewer's "Groceries" are separate rows, one named and one "No category". So the household breakdown is misleading, and tapping such a row opens Activity filtered by an id the viewer cannot see. The same happens in Just me for the viewer's share of a partner-recorded shared line.
**Fix:** Group by a key both members share (`builtin_key` / `categoryKey`) when the category id is not the viewer's. Or resolve names through a household-readable category lookup. When nothing resolves, show "Partner's category" and drop the Activity tap.

### WR-04: Household "In" leaves out shared income whose eligibility came from its series

**File:** `src/data/queries/figureScope.ts:150-170` (`householdSnapshotSource`: `series: []`, `settings: null`), consumed by `src/engine/month/picture.ts:44-54` / `monthBars`
**Issue:** `monthBars` reads "comes in" through `recordedIncomeByMonth`, which uses `eligibility()` (`incomeProfile.ts:99-121`). A paid income line counts only if its series is a pay series, if it carries its own `incomeKind`/`countsAs` resolving to "available", or if the profile has variable income. The Household source drops all series and settings, so `idx` is empty and `profile` is null. A shared income line that is tied to a pay series and has no `income_kind`/`counts_as` of its own adds 0 to "In". Its matching shared spending still counts in "Out". The Household bars then show a large negative "Left" and the short badge for a month that is not short.
**Fix:** For the Household scope, either keep the shared income series in the household source, or count every paid shared `income` line as money in (Household has no per-person pay plan). Add a unit test: a shared pay-series income line plus shared spending, Household scope, In equals the income.

## Info

### IN-01: When the short cap applies, the listed parts add up to more than the score

**File:** `src/engine/health/score.ts:52-54`, `src/features/insights/sections/ScoreCard.tsx:107-137`
**Issue:** D-25 says the listed parts add up exactly to the score. When `capped`, the score is 74 but the four "x of y" lines can add up to, say, 88. `shortLine` says the score "stays under 75", but no line says how many points the cap removed.
**Fix:** Add a "Short month: −14" line when `capped` (the engine can return `capReduction = sum - 74`), so the figures still reconcile.

### IN-02: Period copy says "last 6 months" while the chart shows 6 full months plus this month

**File:** `src/i18n/locales/insights/index.ts` (`range.periodSixMonths`, `periodOneYear`)
**Issue:** The summary "Money in and out, last 6 months. In X, out Y." sums 7 bars (D-26a). The a11y labels are right, but the visible text is not.
**Fix:** "the last 6 full months and this month so far", or "6 months + this month".

### IN-03: The "Opens Activity" removal depends on English text

**File:** `src/features/insights/charts/CategoryRow.tsx:27-28`
**Issue:** `spoken.replace(/ Opens Activity\.$/, '')` works only for the English string. In any other locale the non-pressable "Everything else" row still announces that it opens Activity.
**Fix:** Use two copy keys (`rowA11y` and `rowA11yStatic`) and pick one by `onPress`.

### IN-04: The net-worth readout keeps a stale point index across range or scope changes

**File:** `src/features/insights/sections/NetWorthSection.tsx:33, 112-118`; `NetWorthLine.tsx:83`
**Issue:** `selected` is an index into `points`. After switching 6M to 1Y, the same index points at a different month, and the readout shows a figure the user never tapped.
**Fix:** Store the selected `date` instead of the index, or reset `selected` when `range` or `scope` changes.

### IN-05: The stored-scope read can override a tap made before it resolves

**File:** `src/features/home/useFigureScope.ts:18-28`
**Issue:** If the user taps "Just me" before `AsyncStorage.getItem` resolves with `'household'`, the late read flips the screen back to Household.
**Fix:** Keep a `touched` ref that `setScope` sets, and ignore the read once it is set.

### IN-06: A deep link to Insights below level 2 shows "Add a few entries"

**File:** `src/features/insights/InsightsScreen.tsx:54-64`
**Issue:** `TAB_AVAILABILITY.insights` is now `true`, so `/insights` is linkable at level 1. The hidden state reuses `emptyHeading`/`emptyBody`, which tells the user to add entries. Adding entries will not unlock the tab.
**Fix:** Add a separate copy key for the level-gated state (for example "Insights opens at Everyday. Change it in Features.") with a link to the Features screen.

### IN-07: A holding in a joint investment account counts in Just me, while Household counts the account's raw balance

**File:** `src/data/queries/insightsNetWorth.ts:80`, `src/engine/grow/netWorth.ts:45-56`
**Issue:** Household passes `holdings: []`. `netWorthOf` therefore no longer skips the joint investment account and counts its ledger balance. Just me counts the holding's value (the holding is owner-only), but the joint account is not in the Just me list. The same money appears in both views on different bases.
**Fix:** In Just me, leave out holdings whose `account_id` is a joint account. Or state the rule in a note. Confirm the intended behaviour with the owner under D-23.

---

_Reviewed: 2026-11-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

## Fixes applied

Applied 2026-11-23 on a fix branch. WR-03 and WR-04 (Household data rules) were not touched; a separate track handles them.

| Finding | Commit | Test |
|---|---|---|
| CR-01 | f6d22b79 | `insightsNetWorth.test.ts` "status (CR-01)": loading while debts or today balances load, error when they fail |
| WR-01 | 23634969 | `netWorthSection.test.tsx` names a debt or holding as such; `insightsNetWorth.test.ts` counts by kind |
| WR-02 | 32f8ee5c | `InsightsScreen.test.tsx` first-month user with entries sees the sections (Just me only; Household keeps its own empty state) |
| IN-01 | 3070e21e | `score.test.ts` parts minus `capReduction` equals the score; `scoreCard.test.tsx` shows the cap line |
| IN-02 | e49e49c6 | `insightsCopy.test.ts` period phrases; `netWorthSection.test.tsx` strings |
| IN-03 | 2b7491c4 | `charts.test.tsx` separate static key |
| IN-04 | f3385046, 35e18eea | `netWorthSection.test.tsx` readout cleared on range change |
| IN-05 | bbede7de | `useFigureScope.test.tsx` late read ignored after a tap |
| IN-06 | d897e40c | `InsightsScreen.test.tsx` locked state offers Open Features |
| IN-07 | e8e65516 | `insightsNetWorth.test.ts` holding in a joint account left out of Just me |

Notes: WR-02 shows each section's own empty state to a first-month user (the in/out section still says "Nothing to show yet"); building this month's bar needs Decide's builder, which was not changed. IN-07 means a holding linked to a joint account no longer counts in Just me; the account's own balance counts in Household.

## Household fixes (D-31..D-34)

Applied 2026-11-23 per owner decisions D-31..D-34 (07-CONTEXT.md).

| Finding / decision | Commit | Tests |
|---|---|---|
| WR-04 (D-31) | d86f0ec4 | `insights.test.ts` "Household money in (D-31)": untagged shared pay (plain and series occurrence) counts in In; a "kept" line stays out; an income-type line keeps its own mark |
| WR-03 (D-32) migration | f0021377 | `supabase/tests/database/118_shared_line_categories.test.sql` (15 checks): shared-line and shared-series categories only; never private or deleted-line ones, never the caller's own, never another household's; non-member and anon get nothing; categories stay owner-only |
| WR-03 / D-33 / D-34 data layer | 5590a223 | `src/data/__tests__/sharedCategories.test.ts`: resolution order, partner Savings line is saving, viewer money rule applies to a partner-categorised shared line, member pick wins, household of one unchanged; `decide.test.tsx` no shared line makes no extra read |
| WR-03 (D-32, D-33) Insights display | d8ac5d92 | `categoryNaming.test.ts`; `everydaySections.test.tsx` "Pets (Sam)" and multi-id taps; `insightsCopy.test.ts` |

Migration: `supabase/migrations/20261125001000_shared_line_categories.sql` — security-definer `shared_line_categories(p_household uuid)`, `search_path = ''`, execute revoked from public/anon and granted to authenticated. Returns id, owner_id, builtin_key, name, color_key, icon_key for categories (not the caller's) on a live shared line or shared series of a household the caller belongs to. No monthly_cap, archived_at or new select policy. Not yet applied to production.

Notes: owner_id was added to the RPC's columns (D-32 named five) so the label names the category's owner, not the line's creator; member ids are already visible to members. Resolution runs once in useDecideSnapshot, so Decide, Insights Just me and Insights Household read the same resolved lines; everyday.ts needed no aliasing of its own. Decide answers move only for members with shared lines categorised by a partner (Savings lines now saving, own money rules covering matched shared lines, member picks honoured). Engine approved cases, golden and crosscheck fixtures did not move.
