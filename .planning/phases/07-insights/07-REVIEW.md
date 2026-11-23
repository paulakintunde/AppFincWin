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

## Re-review (fixes)

**Reviewed:** 2026-11-23 · **Scope:** `git diff 49106b3f..68f573d4 -- src app supabase` (fix commits f6d22b79..d8ac5d92) · **Depth:** deep
**Ran:** `sharedCategories.test.ts`, `queries/__tests__/insights.test.ts` (`--coverage=false`): 23/23 pass.

### Verdict per finding

| Finding | Verdict | Notes |
|---|---|---|
| CR-01 | **not fixed (partly)** | The new gate checks the non-month inputs with `isLoading`. Offline it does not fire (NR-01). The tests mock `isLoading: true` directly, so they never hit the paused case. |
| WR-01 | fixed | Separate counts by kind and separate notes. The test fails without the split. |
| WR-02 | fixed (Just me) | A first-month user with entries sees the sections. Household keeps the whole-tab empty state, as noted. |
| WR-03 / D-32 / D-33 | fixed | The RPC is sound (see below). Resolution order is pick, then own builtin match, then partner category. "Pets (Sam)" is named through `useMemberLabel`. An Activity tap gathers every source id. |
| WR-04 / D-31 | fixed, new issue | Untagged shared line income now counts. A series-level "not money to spend" tag is lost (NR-02). |
| D-34 | fixed, new issue | Resolution runs in the data layer before the builder, and `src/engine` is untouched apart from IN-01's `capReduction`. A household of one never runs the reads and keeps its arrays. The Retry and deploy-order gaps are NR-03. |
| IN-01 | fixed | `capReduction` and the cap line. The engine test checks that parts minus the reduction equal the score. |
| IN-02 | fixed | |
| IN-03 | fixed | Separate `rowA11yStatic` key. |
| IN-04 | fixed | The selection is keyed by `range/scope`. |
| IN-05 | fixed | A `touched` ref. |
| IN-06 | fixed | Locked copy with an Open Features action. |
| IN-07 | fixed | Holdings in a joint account are left out of Just me. |

### Migration `20261125001000_shared_line_categories.sql`: safe to apply to production

- It is `security definer` with `set search_path = ''`. Every name is fully qualified (`public.*`, `auth.uid()`).
- It revokes execute from `public, anon` and grants it to `authenticated` only.
- It is gated on `p_household in (select public.user_household_ids())`. A non-member gets nothing.
- It excludes `c.owner_id = auth.uid()`. It returns only categories on a shared line (`is_shared`, `deleted_at is null`) or a shared series (`is_shared`, `deleted_at is null`) in that household.
- It returns only id, owner_id, builtin_key, name, color_key and icon_key. It never returns `monthly_cap`, `archived_at` or `is_sample`, and it adds no select policy.
- A member cannot use it to name an arbitrary category. The transaction and series guards (`20260926000200`:79-85, `20261122000500`:285-291, `20260926000300`:86-93) require the category's owner to be the writer or the line's `created_by`. Insert pins `created_by = auth.uid()`, and update applies only to own or shared lines. So a partner's private category only comes back if it already sits on a shared line.
- It is additive: one new function, no DDL on tables, no data change. `create or replace` plus revoke/grant can be re-run.
- pgTAP 118 covers shared line, shared series, private line, deleted line, own, other household, non-member, anon and the `search_path` config.

### New findings

#### NR-01 (BLOCKER): CR-01 still shows a net-worth figure as final when debts, holdings, FX or today's balances have no cache and the device is offline

**File:** `src/data/queries/insightsNetWorth.ts:259-265`, `src/data/queries/activity.ts:348`
**Issue:** The gate uses `q.isLoading`, and `useAccountBalances` returns `query.isLoading`. In TanStack v5, `isLoading = isPending && fetchStatus === 'fetching'` (`query-core/queryObserver.js:375-378`). The app runs queries with `networkMode: 'offlineFirst'` and `retry: 2` (`src/data/queryClient.ts:81-82`). Offline, the first attempt fails, the retryer pauses (`canContinue` is false), and the query sits at `fetchStatus: 'paused'` with `data === undefined` and `isError === false`. Then `isLoading` and `isError` are both false.

This is the exact CR-01 scenario. A user with a $12,000 loan opens Insights offline with no cached debts. `debts = NO_DEBTS`, status is `'ready'`, and net worth shows $12,000 too high with no note. The same happens with `balancesLoading` (opening balances only) and `fx` (accounts in a foreign currency dropped). The per-month `reads` already use the correct `data === undefined && !isError` test. The CR-01 tests pass only because they mock `isLoading: true`.
**Fix:**
```ts
const waiting = (q: { data?: unknown; isError?: boolean; fetchStatus?: string }) =>
  q.data === undefined && q.isError !== true && q.fetchStatus !== 'idle'; // pending, fetching or paused; not disabled
const anyLoading = reads.some(...) || monthsRead.isLoading || balancesWaiting || inputReads.some(waiting);
```
In `useAccountBalances`, expose `isLoading: query.data === undefined && !query.isError && query.fetchStatus !== 'idle'` (or a separate `isWaiting`). Add a test with a query mocked as `{ data: undefined, isLoading: false, isError: false, fetchStatus: 'paused' }` that expects `'loading'`.

#### NR-02 (WARNING): D-31 counts a shared series occurrence in Household "In" even when its series is marked "not money to spend"

**File:** `src/data/queries/figureScope.ts:139-150` (with `householdSnapshotSource`, `series: []`)
**Issue:** `householdCountsAs` looks only at the row's own `counts_as` / `income_kind`. Occurrences do not carry their series' tag: the materialiser does not copy `counts_as` (no migration writes it onto occurrences), and the builder reads the series as the fallback (`buildInputs.ts:347-348`). The Household source drops all series, so an occurrence of a shared series tagged `counts_as = 'kept'` is stamped `'available'` and counts in Household "In". The same applies to an occurrence whose series carries a "not money to spend" `income_kind`.

Scenario: a shared monthly "Rent share from lodger, kept for repairs" series marked "not money to spend". Before the fix it counted 0. Now it inflates Household In every month, against D-31's "lines a member marked not money to spend stay out". The D-31 tests set the tag only on the row.
**Fix:** In `householdSnapshotRows`, pass `source.series`. Treat a row as tagged when its series (`recurring_series_id`) carries `counts_as` or `income_kind`, and copy the series tag onto the row instead of stamping `'available'`:
```ts
const s = r.recurring_series_id ? seriesById.get(r.recurring_series_id) : undefined;
const tag = r.counts_as ?? r.income_kind ?? s?.counts_as ?? s?.income_kind ?? null;
if (tag !== null) return s && r.counts_as == null && r.income_kind == null ? { counts_as: s.counts_as ?? null, income_kind: s.income_kind ?? null } : null;
```
Add a test: a shared series with `counts_as: 'kept'`, an untagged occurrence, Household In = 0.

#### NR-03 (WARNING): Decide's Retry never refetches the two new shared-category reads, so their failure leaves Decide stuck in error (and the app must not ship before the migration)

**File:** `src/data/queries/decide.ts:424-438, 573-582`
**Issue:** `sharedFailure` makes Decide `'error'` (line 429). But `refetches` and `failedFlags` list only `reads` and `splitsQuery`, so tapping Retry does nothing for `partnerCatsQuery` or `picksQuery`. Decide stays in its error state until a remount or a background refetch.

The worst case is deploy order. If the client (including a preview OTA) reaches a device before `shared_line_categories` is in production, the RPC returns PGRST202 on every call. Then every household member with a shared line in the window gets a permanent Decide error, and Insights shows one in both scopes, since it reads the same snapshot. Decide is the core value.
**Fix:** Append the two reads to both arrays:
```ts
const refetches = [...reads.map((q) => q.refetch), splitsQuery.refetch, partnerCatsQuery.refetch, picksQuery.refetch];
const failedFlags = [...reads.map((q) => q.isError), splitsFailed,
  needsShared && partnerCatsQuery.data === undefined && partnerCatsQuery.isError,
  needsShared && picksQuery.data === undefined && picksQuery.isError].join(',');
```
Apply `20261125001000` to production (`npm run supabase:db:push`) before merging or publishing any OTA that carries 5590a223.

---

_Re-reviewed: 2026-11-23 · Reviewer: Claude (gsd-code-reviewer) · Depth: deep_

## Re-review fixes (NR-01..NR-03)

**Fixed:** 2026-11-23 · **Base:** 42030fad (origin/feat/07-build)

| Finding | Commit | Fix | Tests |
|---|---|---|---|
| NR-01 | dff42416 | `useNetWorthSeries` no longer reads `isLoading`. An input counts as waiting when it has no data, no error and is not idle (`inputWaiting`), so a query paused offline is never "loaded". When any required input (per-month reads, month list, today's balances, accounts, FX, custom currencies, and in Just me debts, holdings, lots) is paused with no cache, status is the new `'offline'`. The card then shows `insights.states.offlineNoCache` (new `OfflineCard`) and no figure. `useAccountBalances` and `useTransactionMonths` gain `isWaiting` / `isPaused` (additive). | `insightsNetWorth.test.ts`: debts, FX, balances and month list mocked as `{ data: undefined, isLoading: false, isError: false, fetchStatus: 'paused' }` give `'offline'`; a fetching read without `isLoading` gives `'loading'`; a real `QueryClient` offline with `networkMode: 'offlineFirst'` shows the paused/pending state with `isLoading` false, and the predicates catch it. `netWorthSection.test.tsx`: offline shows the line and no figure. |
| NR-02 | db5d405a | `householdSnapshotRows` now gets the source's live series. An untagged money-in line whose series carries `counts_as` or `income_kind` takes that series tag instead of the `'available'` stamp. Only a line untagged on both line and series is stamped. The series is read only where the data layer has it (the viewer's own or a shared series). An occurrence of a partner's private series that the viewer cannot read counts as untagged, which matches D-31 ("untagged as far as the viewer can see"). | `insights.test.ts`: a shared series with `counts_as: 'kept'` keeps its untagged occurrence out of Household In (0); a series `income_kind` is carried onto the line; an untagged series still counts (300,000); a deleted series' tag no longer applies. |
| NR-03 | 363830ed | Decide's `refetches` and `failedFlags` include `partnerCatsQuery` and `picksQuery` (flagged only when needed, failed and uncached). Retry now refetches a failed shared-category read, and Decide answers once that read succeeds. | `decide.test.tsx` (the shared reads are now real queries over mocked fetchers): for each read, a shared line plus a failed read gives `'error'`; Retry refetches the read, the second call succeeds, and the status is `'ready'` with a source. Both tests failed before the fix. |

**Checks:** eslint on the changed files is clean. `npx tsc --noEmit` is clean. `npm run depcruise` found no violations (1385 modules). Jest over `src/data/queries src/features/insights src/features/decide` (`--coverage=false`): 167 suites and 2510 tests pass.

**Owner, still open:** NR-03's deploy-order point stands. Apply `20261125001000_shared_line_categories.sql` to production before merging or publishing any OTA that carries the shared-category reads. Until then, Retry recovers only after the RPC exists. No database was touched in this fix pass.
