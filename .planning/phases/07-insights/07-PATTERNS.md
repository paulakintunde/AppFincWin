# Phase 7: Insights - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 27 new/modified
**Analogs found:** 27 / 27 (2 are partial)
**Root:** `C:\dev\fincwin-07ctx` (all paths below are relative to it)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/engine/month/picture.ts` (add `monthBars`, keep `pastMonthBars` as wrapper) | engine utility | transform | itself (`pastMonthBars`, lines 95-114) | exact |
| `src/engine/health/score.ts` | engine utility | transform (rational) | `src/engine/grow/gain.ts` | role-match |
| `src/engine/health/inputs.ts` (only reader of `Prepared`) | engine adapter | transform | `src/engine/month/picture.ts` (`homeReading`, `monthPicture`) | exact |
| `src/engine/health/index.ts`, `src/engine/insights/index.ts` | barrel | - | `src/engine/grow/index.ts` | exact |
| `src/engine/insights/categories.ts`, `compare.ts`, `range.ts` | engine utility | transform (aggregate) | `pastMonthBars` loop (picture.ts 100-113) + `gain.ts` | role-match |
| `src/engine/grow/netWorth.ts` (moved), `netWorthSeries.ts`, `holdingValueOn.ts` | engine utility | transform | `src/features/grow/netWorth.ts` (move) + `gain.ts` | exact (move) |
| `src/features/grow/netWorth.ts` (becomes re-export) | re-export | - | n/a | - |
| `src/engine/**/__tests__/*` (health, insights, grow, month `monthBars`) | test (unit + property) | - | `src/engine/month/__tests__/picture.property.test.ts`, `src/features/grow/__tests__/netWorth.test.ts` | exact |
| `src/data/queries/insights*.ts` (`useInsightsPrepared`, `useNetWorthSeries`) | hook | request-response, multi-query | `src/data/queries/pendingSplit.ts` (`usePaidBefore`), `src/features/decide/screens/engine/useMonthPicture.ts`, `src/data/queries/figureScope.ts` | role-match |
| `src/features/home/useFigureScope.ts` (extend `FigureScreen`) | hook (device pref) | CRUD (AsyncStorage) | itself | exact |
| `app/(app)/(tabs)/insights.tsx` | route | request-response | `app/(app)/(tabs)/grow.tsx` | exact |
| `app/(app)/(tabs)/_layout.tsx` (gated TabBar wrapper) | layout | event-driven | itself (tabBar render prop line ~64) | exact |
| `src/shell/tabBar/availableTabs.ts` (+ `.test.ts`) | config | - | itself | exact |
| `src/features/insights/InsightsScreen.tsx` + section components | component | request-response | `src/features/home/useHomeViewModel.ts` (scope), `GrowHome` | role-match |
| `src/features/insights/LineChart.tsx` | component | streaming (draw once) | `src/features/grow/ui/LineChart.tsx` | exact |
| `src/features/insights/InOutBars.tsx` | component | transform | `SignedBars` in `src/features/decide/screens/answer/detail/detailKit.tsx` (135+) | role-match |
| Left-each-month chart | component | transform | `SignedBars` reused (move/re-export) | exact |
| `RangeControl`, scope switch | component | event-driven | `src/ui/SegmentedControl.tsx` (add `haptic?`) | exact |
| In/Out/Left strip | component | - | `src/ui/StatTile.tsx` (`StatTileRow` caps at 2, line 63) | partial |
| Category rows (Row + ProgressBar) | component | - | `src/ui/Row.tsx` (props 19-41; no footer slot), `src/ui/ProgressBar.tsx` | partial |
| `ScoreCard`, `ChartSummary` | component | - | `StatTile` + `Row` + `StateBadge` | role-match |
| `src/features/levels/featureRegistry.ts` (+ `FeaturesScreen.tsx` `AREA_ORDER`, `09-LEVEL-MAP.md`, `Phase9FeatureId`) | config | - | itself | exact |
| `src/i18n/locales/insights/index.ts` + `en.ts` wiring | config (copy) | - | `src/i18n/locales/household/index.ts` + `en.ts:53,3279` | exact |
| `src/i18n/copyGuard/rules.json` (new `insights` set) | config | - | `decide` set lines 3-40 | exact |
| `src/i18n/__tests__/insightsCopy.test.ts` | test | - | `src/i18n/__tests__/householdCopy.test.ts` | exact |
| `jest.config.js` (100% list), `stryker.config.mjs`, `scripts/check-stryker-disables.mjs` | config | - | `jest.config.js:39` | exact |

## Pattern Assignments

### `src/engine/month/picture.ts` - add `monthBars(prepared, { throughCurrent })`
**Analog:** itself, `pastMonthBars` lines 95-114. Extract the per-month loop into `barOfMonth`, make `pastMonthBars(p) = monthBars(p, { throughCurrent: false })` so Decide's sheet is unchanged.
```typescript
const ym = yearMonthOf(prepared.inputs.asOf);
const recorded = incomeByMonth(prepared);
return prepared.inputs.months
  .filter((m) => m.month < ym)            // throughCurrent => m.month <= ym
  .sort((a, b) => (a.month < b.month ? -1 : 1))
  .map((m) => {
    let out = 0n;
    for (const l of m.lines) {
      if (l.status !== 'paid') continue;
      const amount = BigInt(Math.abs(l.amount));
      if (OUT_ROLES.has(l.role)) out += amount;
      else if (l.role === 'refund') out -= amount;
    }
    const comesIn = recorded.get(m.month) as bigint; // every month before this one is read
    return { month: m.month, comesIn: minorFromBigInt(comesIn, FN), goesOut: minorFromBigInt(out, FN), left: minorFromBigInt(comesIn - out, FN) };
  });
```
**Gotcha:** `incomeByMonth` (lines 40-48) -> `recordedIncomeByMonth` skips `month >= current`; it needs a flag for the current month, and the `as bigint` cast (line 111) would be undefined for current otherwise. Folder `month` is 100% + Stryker: add tests. File header style: block comment with decision ids, `const FN = 'month/picture'`, `minorFromBigInt(x, FN)`.

### `src/engine/health/score.ts` (utility, rational transform)
**Analog:** `src/engine/grow/gain.ts` - BigInt inside, `divideHalfUp`, `minorFromBigInt`, ratios leave as integers (tenths).
```typescript
import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
/** Gain as tenths of a percent (112 = 11.2%), half-up; null when nothing was put in. */
export function gainPercentTenths(gain: MinorUnits, putIn: MinorUnits): number | null {
  if (putIn <= 0) return null;
  return Number(divideHalfUp(BigInt(gain) * 1000n, BigInt(putIn)));
}
```
Copy: one-line `/** ... */` per exported fn stating rounding; return `null`/tagged union on missing data (here `{ kind: 'thin', missing }`). `score.ts` must import nothing from `decide/` or `month/` (ARC-21; import-graph test). Round each part once (`divideHalfUp(35n * min(10n*posLeft, 3n*inn), 3n*inn)`), sum, clamp 0..100, short cap `min(score, 74)`.

### `src/engine/health/inputs.ts` (only reader of `Prepared`)
**Analog:** `src/engine/month/picture.ts` lines 33-37 and 66-82.
```typescript
type PictureInput = Pick<Prepared, 'inputs' | 'readings'>;
export function homeReading(p: PictureInput): Reading { ... lower monthLeft, first on tie ... }
// monthPicture(p).leftAfterPlans === homeFigure(p)   (pinned by property test)
```
Imports to copy: `import { openFlowsOf, type Prepared, type Reading } from '../decide/v3/prepare';` (engine-internal relative paths, not the barrel). Use `homeReading(p)`, `monthPicture(p).leftAfterPlans`, `r.funds.emergency`, `r.net.starter`, `r.month.{moneyIn,typicalIncome,billsDue,moneyOut,notices}`, `r.inputs.debts`.

### `src/engine/health/__tests__/*.property.test.ts` and `month/__tests__/monthBars.test.ts`
**Analog:** `src/engine/month/__tests__/picture.property.test.ts` (whole file, 35 lines)
```typescript
import * as fc from 'fast-check';
import { prepare } from '../../decide/v3/prepare';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { inputsArb } from '../../decide/v3/__tests__/invariants/arbitraries';
const SEED = 0x0555;
fc.assert(fc.property(inputsArb, (inputs) => { const p = prepare(inputs); expect(...); }), { numRuns: fcRuns(200), seed: SEED });
```
Use for: short month never `>= 75` (also over `healthInputsOf(prepare(inputsArb))`), `sum(parts) === score` uncapped, `monthBars(p,{throughCurrent:false})` equals old, `goesOut = comesIn - left`, `sum(categories) <= bar.goesOut`.

### `src/engine/grow/netWorth.ts` (move) + `netWorthSeries.ts`
**Analog:** `src/features/grow/netWorth.ts` (65 lines, no imports; interfaces `NetWorthAccount/Holding/Debt/Input` lines 15-40; header says "import netWorthOf, do not write another sum"). Move unchanged, leave `src/features/grow/netWorth.ts` as `export * from '@/engine/grow/netWorth'` (callers: `HoldingDetailScreen.tsx`, `features/grow/__tests__/netWorth.test.ts`). Add `export * from './netWorth*'` to `src/engine/grow/index.ts` (existing barrel: `goalPlan, lots, gain, asOf`). `netWorthSeries` calls `netWorthOf({accounts, balances, holdings, debts})` per point. Test fixtures: `@/engine/grow/__tests__/fixtures/ledger` (`netWorth.test.ts` lines 1-20).

### `src/data/queries/insights*.ts` (hooks)
**Analog A (multi-month paid-before):** `src/data/queries/pendingSplit.ts` lines 29-42 - convert to `useQueries` with the same key so Activity's cache is shared.
```typescript
const query = useQuery({
  queryKey: queryKeys.paidBefore(householdId ?? '', before ?? ''),
  queryFn: () => fetchAccountPaidBefore(supabase, householdId as string, before as string),
  enabled: Boolean(householdId) && before !== null,
});
```
Imports: `fetchAccountPaidBefore` from `@/db/recordReads`, `supabase` from `@/services/supabase`, `queryKeys` from `../keys`. Month-end of M = pass 1st of M+1. Convert with `convertLatest` (`src/data/queries/fxConvert.ts`), leave out nulls and count them.

**Analog B (one Prepared per scope):** `src/features/decide/screens/engine/useMonthPicture.ts`
```typescript
const { prepared } = useDecideV3();
return useMemo(() => (prepared === null ? {...empty} : {...from prepared}), [prepared]);
```
Household: `preparedV3(householdSnapshotSource(rawSource, currency), null).prepared` (imports at `figureScope.ts` lines 15-16: `preparedV3` from `@/features/decide/snapshot/v3/computeV3`; `householdSnapshotSource` at line 150). Pass the RAW `useDecideSnapshot().source`, not `useDecideV3().source` (Pitfall 7). Do not apply `countsForMe` again on Mine.

### `src/features/home/useFigureScope.ts` - extend
**Analog:** itself. Change line 10 only: `export type FigureScreen = 'home' | 'insights';`. Show-scope rule from `useHomeViewModel.ts` lines 91-94:
```typescript
const [chosenScope, setScope] = useFigureScope('home');
const showScope = (members?.length ?? 0) >= 2;
const scope: FigureScope = showScope ? chosenScope : 'mine';
```
(`members` from `useHouseholdMembers`, household currency from `useHousehold`.) NOTE: `useHouseholdScope` (CONTEXT D-18 wording) is a membership hook, not the switch.

### `app/(app)/(tabs)/insights.tsx` (route)
**Analog:** `app/(app)/(tabs)/grow.tsx` (6 lines)
```tsx
import { GrowHome } from '@/features/grow/home/GrowHome';
export default function GrowRoute() { return <GrowHome />; }
```
Add `// 07-xx:` header comment; thin route over `InsightsScreen`; guard deep links when `useFeatureAccess('insights').visible` is false.

### Level-gated tab: `_layout.tsx` + `availableTabs.ts`
**Analog:** `_layout.tsx` lines 59-70 (`tabBar={(props) => (<><SampleBar /><TabBar {...props} /></>)}`) and `TabBar.tsx` line 23-30 `availability?: Readonly<Record<TabId, boolean>>` prop (default `TAB_AVAILABILITY`). A hook cannot run in the render prop, so add a wrapper component:
```tsx
function GatedTabBar(props: BottomTabBarProps) {
  const insights = useFeatureAccess('insights').visible;
  return <TabBar {...props} availability={{ ...TAB_AVAILABILITY, insights }} />;
}
```
`availableTabs.ts`: flip `insights: true` (route stays declared so `TAB_SCREENS` built once at module load, lines 33-35, never remounts; `tabsLayoutStable.test.tsx`), drop the now-wrong "never derived from a user setting" comment (lines 7-9 D-03), update `availableTabs.test.ts` (pins `insights: false` and `{position: 2, total: 4}`).

### `src/features/levels/featureRegistry.ts` rows
**Analog:** itself, e.g. lines 51-52:
```typescript
{ id: 'growthIllustration', area: 'Grow', minLevel: 3, needsHousehold: false, holdsData: null, glyph: 'stateUp' },
```
Add `'Insight'` to `FeatureArea` (line 7) and to `AREA_ORDER` (`FeaturesScreen.tsx:32`). Rows: `insights` (level 2), `netWorthTrend` (3), `healthScore` (3, glyph `health`), all `holdsData: null`, `needsHousehold: false`. Lockstep: `09-LEVEL-MAP.md` section 2 table, section 3 counts, section 5 answers 4/5/8/9; `featureRegistry.test.ts` (`toHaveLength(32)`, `[5,19,29,32]`); `features.items.<id>.label|sub` copy; `Phase9FeatureId` in `src/services/analytics/catalogue.ts`. Gate with `useFeatureAccess(id)` (`src/features/levels/useFeatureAccess.ts`).

### `src/features/insights/LineChart.tsx`
**Analog:** `src/features/grow/ui/LineChart.tsx` - import and reuse `linePath(points,w,h)` and `lineLength` (do not copy); copy the once-per-session reveal skeleton:
```tsx
const first = useOncePerSession(sessionKey ?? `line-chart:${accessibilityLabel}`);
const drawn = useSharedValue(first ? 0 : 1);
const draws = first && !motion.reduced && points.length > 1;
useEffect(() => { if (!draws) { drawn.value = 1; return; }
  drawn.value = withTiming(1, { duration: DURATION.fill, easing: EASING, reduceMotion: ReduceMotion.System }); }, [draws, drawn]);
const reveal = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.value) }));
// <View accessible accessibilityRole="image" accessibilityLabel=... onLayout=...><Svg importantForAccessibility="no-hide-descendants">
```
Imports: `Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'`, `Svg, { Circle, Line, Path } from 'react-native-svg'`, `{ DURATION, EASING, useMotion } from '@/theme/motion'`, `useTheme`, `useOncePerSession from '@/ui/motion/useOncePerSession'`. Colours only via `colors.*` (`noRawColours.test.ts`).

### Left-each-month chart and `InOutBars`
**Analog:** `SignedBars` (`detailKit.tsx` 128-143): props `{ items: BarItem[], currency, chartLabel, testID }`; `MonthByMonthSheet.tsx:56` feeds it
```typescript
bars.slice(-PAST_MONTHS_SHOWN).map((b) => ({ key: `p${b.month}`, label: f.month(b.month), value: b.left }))
```
Move/re-export `SignedBars`, `BarItem`, `useDetailFormat` (money/spoken/month formatters) rather than redraw. `InOutBars` follows its Svg Rect + `barGeometry` + accessibilityElementsHidden chart / spoken-labels-below structure. Reuse unchanged despite state-colour exception (Pitfall 9).

### `RangeControl` / scope switch
**Analog:** `src/ui/SegmentedControl.tsx` props lines 12-25: `{ options: {key,label,a11yLabel?}[], value, onChange, accessibilityLabel, itemRole? }`. Add `haptic?: boolean` (default true; line ~40 calls `hapticTick()`); `SegmentedToggle` already has `haptic`. `RangeControl` = thin wrapper with options `6m|1y|all`.

### `StatTile` triplet
**Analog:** `src/ui/StatTile.tsx` line 63 `Children.toArray(children).slice(0, 2)`; `StatTileProps {label, value, status?, statusText?, testID?}`, stacking via `useShouldStack` from `@/ui/textFit`. Add `columns` prop or triplet keeping the stack rule.

### Category rows (INS-04/05)
**Analog:** `src/ui/Row.tsx` props: `label, amount, amountTone, sublabel, leading, chevron, onPress, emphasis, accessibilityLabel`; `ProgressBar` `{ percent, variant: 'thin', tone, animate }`. Row has no footer slot: add optional `footer` or a `CategoryRow` composite. Tap opens Activity: `requestActivityFocus({ month, filter: { ...EMPTY_FILTER, categoryIds: [id], direction: 'out' } }); router.navigate('/activity' as Href);` (`src/state/activityFocus.ts`, `src/engine/activity/filters.ts`).

### i18n: `src/i18n/locales/insights/index.ts`
**Analog:** `src/i18n/locales/household/index.ts` (one file per area, `export const household = { home, members, ... } as const;`), wired in `en.ts` line 53 `import { household } from './household';` and line 3279 `household: household,`. Curly apostrophes only. Header comment names UI-SPEC source and the guard test.

### `src/i18n/copyGuard/rules.json` - add `insights` set
**Analog:** the `decide` set (lines 3-40: `{ "name", "prefixes": [...], "banned": ["\\badvice\\b", ...] }`). Add
`{"name":"insights","prefixes":["insights."],"banned":["\\b(advice|advise|recommend\\w*|should|best|better|optimal|healthy|unhealthy|poor|good|bad|strong|steady|tight|great|excellent)\\b", "you should", "we suggest"]}`. Without it `insights.` falls into `general` (no grade words). `copyGuard.test.ts` also fails on stale allowlist entries.

### `src/i18n/__tests__/insightsCopy.test.ts`
**Analog:** `householdCopy.test.ts` lines 1-30: `collect(node, prefix)` walker, "is wired into en.ts" (`expect(en.insights).toBe(insights)`), advice-word regex, `includes("'")` apostrophe check, per-area `it.each`.

### Coverage and mutation config
**Analog:** `jest.config.js:39` `for (const f of ['money','decide',...,'grow','month','household'])` - append `'health'`, `'insights'`. Add folders to `stryker.config.mjs` `mutate` and `scripts/check-stryker-disables.mjs` `TARGETS`.

## Shared Patterns

### Engine purity and money
**Source:** `src/engine/month/picture.ts` lines 1-30; `src/engine/grow/gain.ts`. **Apply to:** everything in `src/engine/health|insights|grow|month`. Relative imports only (no `@/` UI/data/features/react), no clock/Intl/`toLocaleString`, BigInt inside, `minorFromBigInt(x, FN)` out, `divideHalfUp` for rounding, ratios as integers (bp, tenths). Enforced by `eslint/enginePurity.cjs`, `.dependency-cruiser.cjs`, `src/test/lint/enginePurity.test.ts`.

### Once-per-session motion and Reduce Motion
**Source:** `src/features/grow/ui/LineChart.tsx` (`useOncePerSession`, `useMotion`, `ReduceMotion.System`). **Apply to:** all bars, line, ProgressBar rows. Range/mode switch cross-fades (`FadeSwap`), no replay.

### Chart accessibility
**Source:** `LineChart.tsx` wrapper `accessible accessibilityRole="image" accessibilityLabel=...` + hidden Svg; `SignedBars` `accessibilityElementsHidden` chart with spoken labels. **Apply to:** all charts plus visible `ChartSummary`.

### Formatting
**Source:** `useDetailFormat` (`detailKit.tsx` 33-52) / `useMoneyFormatter` (`@/ui/money/useMoneyFormatter`). Household view must use the household reporting currency (as `useHomeViewModel` `figureCurrency`).

### Copy, guard, tokens
All text via `useT()`/`t()` (hard-text lint rule in `eslint.config.js`); colours only from `useTheme().colors`; spacing from `@/theme/layout` (`step`, `space`); typography `textRole(pairing, role)` and `fontSize.netWorth|healthScore|meta`.

### Level gate
**Source:** `useFeatureAccess` (`src/features/levels/useFeatureAccess.ts`). **Apply to:** tab wrapper, Net worth and Score sections.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| Multi-month category aggregation (`engine/insights/categories.ts`) | engine | `categoryUsage` (`engine/categorize/usage.ts`) counts pending and income and ignores settlements; only `pastMonthBars`' loop is a structural template. Use RESEARCH Findings 3 rules |
| Net-worth month-end builder (account presence, holding-value-on-date) | engine + hook | No existing time series; pieces exist (`accountBalance` in `engine/activity/balance.ts`, `fetchAccountPaidBefore`, `holding_lots` kind='value' read in `HoldingDetailScreen`) |
| `InOutBars` paired bars + `ScoreCard` | component | Only `SignedBars` (single series) exists |

## Metadata

**Analog search scope:** `src/engine/{month,grow}`, `src/features/{grow,home,levels,decide/screens,household}`, `src/data/queries`, `src/shell/tabBar`, `src/ui`, `src/i18n`, `app/(app)/(tabs)`, jest config.
**Files scanned:** ~35
**Pattern extraction date:** 2026-11-22
