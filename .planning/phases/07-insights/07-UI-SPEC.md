---
phase: 7
slug: insights
status: approved
reviewed_at: 2026-11-22
shadcn_initialized: false
preset: none
created: 2026-11-22
---

# Phase 7 (Insights) - UI Design Contract

> Visual and interaction contract for the Insights tab. Built only from the app's own tokens (`src/theme/*`) and primitives (`src/ui/*`). Follows the 06-UI-SPEC and 08.1-UI-SPEC format. Sources: 07-CONTEXT D-01..D-19 (locked), 06.2-CONTEXT (motion, icons, empty screens), CLAUDE.md design-fidelity and compliance rules, prototype `FincWin United.dc.html` (range note, health recipe). Where this file and the prototype differ, this file wins on tokens; 07-CONTEXT wins on behaviour. Band words (Strong / Steady / Tight) and the Share / Blocks chart modes are NOT used.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (React Native; shadcn gate not applicable) |
| Preset | not applicable |
| Component library | The app's own `src/ui/*`: `Screen`, `Row`, `StatTile`, `StackedBar` (not used for categories), `ProgressBar`, `SegmentedControl`, `SegmentedToggle`, `EmptyState`, `AmountDisplay`, `CategoryGlyph`, `StateBadge`, `SectionHeader`, `Sheet`, `ToastView`, `FadeIn`, `FadeSwap`, `RiseIn` |
| Icon library | FincWin's own set (`src/ui/icons`, `npm run check:icons`). Used: category glyphs via `CategoryGlyph`, `stateUp`, `stateDown`, `stateFits`, `stateShort`, `info`, `history`, `household`, `profile`, `health`, `calendar`, `categories`, `savedOffline`, `connected`. The Insights tab glyph already exists in `TabGlyphs.tsx`. No third-party icons, no emoji |
| Font | Active pairing via `textRole(pairing, role)` and `src/theme/fonts.ts` |

New components to build (own tokens only; the only new colours are the six chart-only `chartPalette` hexes, D-24): `RangeControl` (a `SegmentedControl` wrapper, 6M / 1Y / All), `LineChart` (react-native-svg, the net-worth line), `InOutBars` (react-native-svg paired bars), `ScoreCard`, `ChartSummary` (one-line text under each chart, also the screen-reader summary). The left-per-month chart reuses `SignedBars` from `src/features/decide/screens/answer/detail/detailKit.tsx` (move or re-export it; do not draw a second copy), so Insights and Decide's Month-by-month sheet look the same (D-12).

---

## Spacing Scale

The app uses the six named steps from `src/theme/layout.ts` (06.2 D-08). No other gaps.

| Token | Value | Usage in Insights |
|-------|-------|-------|
| `step.hair` | 4 | Icon to its word, amount to its change line |
| `step.tight` | 8 | Gaps between range segments, between paired StatTiles, legend items |
| `step.row` | 12 | Inside a card, icon tile to text, row to row |
| `step.card` | 16 | Card padding |
| `step.edge` | 22 | Horizontal screen padding (`space.screenH`) |
| `step.section` | 28 | Between sections and cards (`space.groupGap`) |

Row heights: 52 (one line) and 64 (two lines, e.g. category rows with a bar). They are min-heights and grow with text scale. Icon tiles: 36 (category rows) and 48 (empty state tile). Touch targets never below `space.touchMin` 44 (range segments, month picker, scope switch, bar tap targets).

Exceptions: chart plot heights (net-worth line 160, bars 140, matching `SignedBars`) are chart geometry, not spacing. `StatTile` min-height 88 is its existing value.

---

## Typography

Only the app's existing sizes and roles; no new size or weight. Three weights appear, all existing: 500 (body), 600 (label, bodyStrong, sheetTitle), 700 (heading, the existing screen-title role). `heading`, `sheetTitle`, `body`, `bodyStrong` and `label` are `TextRole` values (use `textRole(pairing, role)`). `netWorth`, `healthScore` and `meta` are **`fontSize` entries, not roles**: use `fontSize.netWorth`, `fontSize.healthScore`, `fontSize.meta` directly with the display face; the planner pins `meta`'s weight to what existing chart labels use (Grow, MonthByMonthSheet) and the 1.0 line height for the two figures is this spec's choice, not a code value.

| Role | Token | Size | Weight | Line height | Insights use |
|------|-------|------|--------|-------------|--------------|
| Net-worth figure | `netWorth` | 42 | display face | 1.0 | Current net worth at top of the net-worth card (existing large-figure exception) |
| Score figure | `healthScore` | 32 | display face | 1.0 | The score number, or "—" (existing exception) |
| Heading | `heading` | 26 | 700 | 1.16 | Screen title "Insights" |
| Section title | `sheetTitle` | 16 | 600 | 1.2 | Card titles ("Net worth", "Money in and out", "Where it went", "This month against last", "Score") |
| Body | `body` | 15 | 500 | 1.5 | Explainer and gap lines, row names |
| Strong body | `bodyStrong` | 15 | 600 | 1.5 | Category names and row amounts (06.2) |
| Label | `label` | 13 | 600 | 1.4 | Notes ("At today's exchange rates."), row sublabels, change words |
| Meta | `meta` | 12.5 | existing | 1.4 | Chart axis month labels, legend, chart summary line |

`display` 34 is used for the in/out/left totals inside `StatTile` only if StatTile already renders it; otherwise StatTile's own value style stands. All amounts use tabular figures (`AmountDisplay`, `useMoneyFormatter`).

---

## Color

Only `src/theme/tokens.ts`. No gradients, no extra shadows. **Chart exception (D-24, owner 2026-11-22):** charts and the lines within charts may use vibrant colour: (a) the theme and Decide state colours at full strength where colour carries meaning, and (b) one new chart-only palette, `chartPalette` (six hexes, below), for series such as category bars. These six are the only new hexes; they live only in `tokens.ts`, are in `noRawColours.test.ts`'s allow-list, and are contrast-tested. Colour is never the only signal: every bar and point keeps its spoken label and every chart its summary line. Non-chart UI (rows, tiles, cards, change rows, notes) keeps the normal rule.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | Page tone: the theme colour's `pageTint` (`canvas` #F6F4EE fallback) | Screen background |
| Secondary (30%) | `surface` #FFFFFF cards with `shadows.card`; `fill1` for chart plot wells and the range track | Cards, rows, chart wells |
| Accent (10%) | User accent (`colors.accent`) | Listed below |
| Destructive | none | Nothing on this tab deletes anything |

Accent reserved for: the selected range segment, the net-worth line and its last-point dot (theme colour at full strength, D-24), Left bars at or above zero (SignedBars default), the selected month chip in the month picker, the selected scope segment. Nothing else.

Chart palette (`chartPalette` in `src/theme/tokens.ts`, D-24 b; chart-only; each tested at 3:1 or better, WCAG 1.4.11, on `surface`, `canvas`, `fill1` and all four page tints in `src/theme/__tests__/contrast.test.ts`):

| Index | Name | Hex | Contrast on surface / page tints / fill1 |
|-------|------|-----|------------------------------------------|
| 0 | Blue | #1F6FEB | 4.63 / 4.17-4.21 / 4.03 |
| 1 | Orange | #D9531E | 4.03 / 3.63-3.67 / 3.51 |
| 2 | Green | #00876C | 4.49 / 4.03-4.08 / 3.90 |
| 3 | Magenta | #C2409A | 4.67 / 4.20-4.25 / 4.06 |
| 4 | Violet | #6B3FCB | 6.57 / 5.91-5.97 / 5.71 |
| 5 | Olive | #7F7A00 | 4.48 / 4.03-4.07 / 3.89 |

Pairwise CIEDE2000 18.8 or more with normal vision; closest pair under simulated colour-vision deficiency is Orange/Olive (6.6 deuteranopia, 4.5 protanopia). Labels and summaries carry the meaning, so the residual overlap is accepted.

| Mark | Token | Rule |
|------|-------|------|
| Money in bars | `stateColors.fits.stroke` #1B4D3E (full strength, same in every theme) | Left bar of each pair (D-24 a) |
| Money out bars | `chartPalette[1]` Orange #D9531E | Right bar of each pair; never the short colour (money out is not a shortfall). Position, legend shape (filled vs ringed) and words carry the meaning, so colour is not the only signal |
| Left bar, at or above zero | as `SignedBars` default (accent) | Reuse unchanged |
| Left bar, below zero | as `SignedBars` default (`stateColors.short.stroke`) | Reuse unchanged (D-24 a: below zero in the short colour, as in Decide); the word "short" is spoken and printed beside the amount |
| Net-worth line and last dot | `colors.accent` (theme colour, full strength) | D-24 a |
| Zero line, gridlines, axis ticks | `line2` / `line1` | `line4` is too faint for a non-text mark, so it is not used for data |
| Plot well | `fill1` | Behind all three charts |
| Category share bar | `ProgressBar` thin, `chartColor = chartPalette[rank % 6]`; Everything else in `ink` | Track on `fill1`; a chart (D-24 b). Row text stays ink / inkMuted |
| Change arrow beside a category | `inkDim` text with `stateUp` / `stateDown` glyph and a word | Neutral. "More" is not bad and "less" is not good, so no green or red. State colours are not used for change |
| Score figure | `ink` | No tint, no badge colour. The score is not a verdict |
| Notes (exchange rate, held flat, left out) | `inkMuted` on page/card | `inkFaint` never sits on the page tone |
| "Just me only" and gap lines | `inkDim` on `fill1` info card with `info` glyph | |

State colours inside charts follow D-24: fits green for money-in bars and the short colour for below-zero Left bars, each with its spoken label and the chart's summary line. Outside charts, state colours appear on this tab only as the `StatTile` status glyph + word for a below-zero Left total and the `StateBadge` (symbol and word) in the score's "short month" line (see ScoreCard). Change rows, tiles, the score figure and notes never use state or chart colours.

---

## Layout and Screen Contracts

One route: `app/(app)/(tabs)/insights.tsx`. Tab screen: date eyebrow, title "Insights", avatar (opens You), no back chevron. `Screen` wrapper, scrolls, safe-area aware. Footer note in `label` / `inkMuted`: "Insights are worked out from your own records. FincWin holds no money and moves none." (owner choice 2026-11-22; the word "advice" is not used anywhere on Insights.)

### Section order, top to bottom

1. **Scope switch** (D-18): `SegmentedControl` "Just me" / "Household" via `useHouseholdScope`. Shown only when the user is in a household (otherwise hidden and Just me implied). Switching changes every chart; no navigation, no haptic. Cross-fade charts with `FadeSwap` (0.15 s).
2. **Range control** (D-10, D-14): `RangeControl`, 3 segments "6M" "1Y" "All", default 6M, 44 px tall. One control for the whole tab: it sets the net-worth line, the in/out bars, the comparison bars and the category period (when "range" is chosen). Switching does not navigate or haptic.
3. **Money in and out** (Everyday, level 2): card, title "Money in and out". Mode toggle `SegmentedToggle` "In and out" / "Left each month" (INS-02 / INS-03). `ChartSummary` under the chart.
4. **Where it went** (Everyday): category period + ranked rows (INS-04).
5. **This month against last** (Everyday): month picker, three StatTiles, change rows (INS-05).
6. **Net worth** (Full picture, level 3): card with figure, range line chart, notes (INS-01).
7. **Score** (Full picture, level 3): ScoreCard (INS-06).

**Focal point:** for a level-2 user, the Money in and out chart with its totals strip; for a level-3 user, the same chart stays first and the net-worth figure (`fontSize.netWorth`) is the second anchor. The score is never the focal point.

Rationale: Everyday sections come first so a level-2 user sees a complete tab; level-3 sections append below, so turning on Full picture adds sections without reordering any (matches the app's "reveal gradually" rule). Net worth sits above Score because Score is the most state-sensitive card and is read last. Sections the user's level hides are not rendered and leave no gap.

### 3. Money in and out (INS-02, INS-03)
- **In and out mode:** `InOutBars`: for each month in range, two adjacent bars (in = `stateColors.fits.stroke` on the left, out = `chartPalette[1]` Orange on the right, D-24), bar width 10, pair gap 4, month gap 12, x labels `meta` ("Jun", then "Jun '26" when range spans years). Plot height 140, zero line `line2`. 6M shows 6 pairs and fits at 320 dp; 1Y shows 12 pairs and scrolls horizontally if the width cannot fit 12 pairs at font scale 1.0 (never shrinks bars below 8). All shows all recorded months, horizontal scroll, newest at the right edge on first show. Legend below: swatch + "Money in" and swatch + "Money out" (swatch shapes differ: filled square for in, ringed square for out, so colour is not the only signal).
- **Left each month mode:** `SignedBars` (default tone, D-24) fed by `pastMonthBars` (current month from the same rule). Up for left at or above zero (accent), down for below in the short colour, with "short" in words under a below-zero month. Same figures as Decide's Month-by-month sheet.
- **Tap a bar or pair:** opens a small inline readout line under the chart (not a sheet): "June: in $3,200, out $2,950, left $250." Tap targets are the full column height (>= 44 wide via hit slop). Selected bar gets a 2 px `ink` underline marker.
- **Totals strip** above the chart for the whole range: three `StatTile`s "In" "Out" "Left" (D-12). "Left" below zero reads "-$120" with `stateShort` glyph and "short" in `StatTile.statusText`.
- Motion: bars grow from the zero line once per session (0.55 s ease-out, `useOncePerSession`); switching range or mode does not replay the grow, it cross-fades. Reduce Motion: bars appear drawn, cross-fade 0.15 s, no grow.

### 4. Where it went (INS-04, D-14, D-15)
- Period control: `SegmentedToggle` "A month" / "The range". "A month" shows a horizontal month chip list (like Activity's month list, newest first, selected chip accent). "The range" adds up the range from the range control (6M or 1Y; All adds up everything recorded).
- Header line: total spent (`bodyStrong`, `AmountDisplay`) + period name ("June" or "Last 6 months").
- Ranked rows, biggest first, `Row` 64 px: `CategoryGlyph` tile 36, name (`bodyStrong`), amount right (`bodyStrong`, `ink`), share sublabel ("34% of spending", `label` / `inkMuted`), thin `ProgressBar` full row width under the text, percent = share, fill `chartPalette[rank % 6]` (D-24; "Everything else" in `ink`). At most 8 rows shown then a text row "Show all N" (44 px) that expands in place. Categories under 1% of the total are grouped into one row "Everything else".
- **Tapping a category row opens Activity filtered to that category for the same period** (owner choice 2026-11-22). Rows show a chevron and read "Opens Activity" to screen readers. If Activity's route cannot yet take a category and a month or range, the planner adds that filter input (a read-only filter, cleared by Activity's existing filter clear); for 6M / 1Y / All it opens the search-all-months view where that level allows it, otherwise the latest month of the range.
- Transfers, refunds, settlements and envelope moves follow `pastMonthBars` and ARC-18 (settlements are neither spending nor income; transfers are not spending). A short note under the list when any were left out: "Moves between your own accounts and settlements are not counted as spending."
- Bars grow once (0.55 s, `ProgressBar animate`); Reduce Motion: filled.

### 5. This month against last (INS-05, D-13)
- Month picker: month chip list as above, one selected month (default the latest month with records). The "previous month" is the calendar month before it; if it has no records the comparison reads "Nothing recorded in May to compare with." and only the totals show.
- Three `StatTile`s side by side: "In" "Out" "Left" for the picked month, each with a `statusText` line giving the change on last month ("$120 more than May"). Stack to one column at font scale > 1.3.
- Change rows (`Row` 64): `CategoryGlyph` tile, name, this month's amount right, and under it the change: `stateUp` or `stateDown` glyph + word "More" or "Less" + amount ("More · $85") in `label` / `inkDim`. Equal: "Same". Sorted by absolute change, biggest first, max 6 then "Show all". New category this month: "New this month". Category with none this month: "None this month" with the prior amount. Never red or green.
- A11y label per row: "Groceries, 420 dollars in June, 85 dollars more than May."

### 6. Net worth (INS-01, D-07..D-11) - level 3
- Card title "Net worth". Current figure `netWorth` role via `AmountDisplay`, with the line "as of today". Below it the change over the range in `label`: "Up $4,200 over 6 months" with `stateUp`, or "Down ..." with `stateDown`. Ink, never red or green.
- `LineChart`: one point per month-end plus today as the last point (D-09), 2 px accent line, 5 px dots on points (last point 8 px, filled accent with a 2 px `surface` ring), no area fill (no gradients), plot height 160, zero line shown only when the values cross zero. 3 y-axis ticks and month x labels in `meta`. All range: if over 24 points, label every third month.
- Tap or drag along the chart: readout line under the chart "June 30: $18,400" (`bodyStrong`), moved by `onPress` per point (>= 44 hit slop); drag is not required, tapping a point is enough.
- Notes under the chart (always shown when true), `label` / `inkMuted`, each with `info` glyph: "At today's exchange rates." (always); "Debts and holdings without dated history are held at today's figure." (when any are held flat); "N accounts could not be converted and are left out." (when any, naming the count; tapping opens the account list). Wording is fixed here; planner adds the i18n keys.
- Net worth is Just me by default; in Household view it counts shared money once (D-18). Title does not change.
- Motion: line draws left to right once per session (0.6 s, stroke-dash), last dot fades in; Reduce Motion: drawn complete.
- Fewer than 2 points: the figure shows but the chart is replaced by the line "The line appears after your second month of records." (D-05 style gap line).

### 7. Score (INS-06, D-01..D-06, D-19) - level 3
- `ScoreCard` (surface card): title "Score". Large `healthScore` figure "72" next to "out of 100" (`body` / `inkMuted`). Under it exactly: "Score 72 out of 100, from these figures" (`bodyStrong`; this is the fixed wording and doubles as the figure's `accessibilityLabel`). No band word, no colour tint, no grade word. Eyebrow in `meta`: "This month, as Decide sees it".
- Four part rows below (`Row` 64, no chevron): name, the figure behind it, and a thin `ProgressBar` showing how much of that part's points were earned. Order and wording:
  1. "Share of income kept": "18% kept" ; bar = points / 35; sublabel "Counts up to 30%."
  2. "Months of cover": "2.1 months" ; bar = points / 30; sublabel "Counts up to 3 months."
  3. "Debt against yearly income": "0.2 of a year's income" ; bar = points / 20; sublabel "Counts up to 0.6. Less counts for more."  (planner to make this plain: if debt is zero the row reads "No debt recorded".)
  4. "Bills paid on time": "0.1 unpaid" ; bar = points / 15; sublabel "Counts up to 0.6. Less counts for more." (planner: the unpaid ratio's plain name must match the engine's definition.)
  Each row's right side shows "27 of 35" (points earned of the part's maximum) in `label`.
- A short month (D-03): when Decide calls this month short, a `StateBadge` `stateShort` + "Short" is shown beside the eyebrow and the card carries one line: "Decide shows this month as short, so the score stays under 75." Short colour only in the badge (symbol + word).
- Thin data (D-05): figure shows "—", no part bars, one line naming the gap: "Add this month's income and the score appears." Variants name the missing piece: "Add this month's spending and the score appears." / "Add an account balance and the score appears." Info card style, with a text button (44 px) to the place that fixes it ("Add income", opens the entry sheet). No partial score.
- Household view (D-19): the whole card is replaced by one `Row` "Your score is in Just me" with a text button "Switch to Just me" (switches the scope switch above). No figure.
- Loading: the score never shows a stale cached number as live; offline with a cache shows it with the "Offline · as of <time>" line.
- Footer line under the part rows (`label` / `inkMuted`): "A way to read your own figures. Not a rating." (no "advice" word, per owner choice 2026-11-22.)
- Motion: figure fades in (`FadeIn`); part bars grow once (0.55 s); Reduce Motion: static. The figure does not count up (no number animation).

---

## Empty States

06.2 pattern: `EmptyState` (36 px tile -> 48 for full-screen, one line, one button) inside the section card.

| Place | Heading | Body | Action |
|-------|---------|------|--------|
| Whole tab, no records at all | Nothing to show yet | Add a few entries and your months appear here. | Add an entry |
| In and out, one recorded month | One month so far | Bars need a second month to compare. Here is the one you have. | (none; the single pair is drawn) |
| Where it went, empty period | No spending in June | Pick another month, or add spending for this one. | (none) |
| Against last month, no earlier month | Nothing recorded in May | Add records for the month before to compare. | Add an entry |
| Net worth, no accounts | No accounts yet | Add an account and your net worth appears. | Add an account |
| Net worth, one point | The line needs a second month | The figure above is today's. The line appears after your second month of records. | (none) |
| Score, thin data | — | See ScoreCard gap lines above | Add income / spending / balance |
| Household, no shared records | Nothing shared yet | Shared money you add appears here for the household. | Add a shared entry |

---

## Error, Loading and Edge States

- **Loading:** `fill1` card-shaped blocks at the chart and row heights, no shimmer loop; charts appear once the prepared input is ready (D-09 of the Decide kit: one prepared input shared by the score and bars).
- **Couldn't load:** one card per failed section (sections load independently): `info` glyph, title "Couldn't load this right now", body "Your records are safe. Check your connection and try again.", text button "Try again".
- **Offline with a cached copy:** show the figures with a quiet "Offline · as of <time>" line (`SyncStatusLine`). Offline with no cache: the card above with body "You're offline. This shows once you're back online."
- **Figures that can't be converted** (net worth): see net-worth notes. Never silently dropped.
- **Many months** (All, 5+ years): the net-worth line subsamples labels, not points; in/out bars scroll horizontally.
- **Huge or negative values:** amounts never truncate (label wraps); a negative net worth shows "-$1,200" with the plain word "owed more than owned" in the change line; the line chart keeps the zero line visible.
- **Currencies:** all figures in the user's main currency via `useMoneyFormatter`; multi-currency rule is the net-worth rate note.
- **Level gate:** Everyday user never sees Net worth or Score sections. A Basics user never sees the tab (tab hidden until level 2, `availableTabs.insights` via the gate).

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Tab title | Insights |
| Primary CTAs | "Add an entry" (empty tab), "Add income" (score gap), "Add an account" (net-worth empty), "Switch to Just me" (Household score row), "Try again" |
| Section titles | Money in and out; Where it went; This month against last; Net worth; Score |
| Range segments | 6M, 1Y, All |
| Mode toggle | In and out / Left each month |
| Category period toggle | A month / The range |
| Score | "Score 72 out of 100, from these figures" (fixed; the number varies) |
| Score parts | Share of income kept; Months of cover; Debt against yearly income; Bills paid on time |
| Change words | More / Less / Same / New this month / None this month |
| Notes | "At today's exchange rates." / "Debts and holdings without dated history are held at today's figure." / "N accounts could not be converted and are left out." / "Moves between your own accounts and settlements are not counted as spending." |
| Empty state heading + body | See Empty States table (always with a next step) |
| Error state | "Couldn't load this right now" + "Your records are safe. Check your connection and try again." |
| Destructive confirmation | none (this tab has no destructive action; the screen is read-only) |

Compliance voice (hard rules): declarative not prescriptive. Never "advice" (not even in a negation), "recommend", "you should", "better", "best", "healthy", "poor", "good", "bad", "Strong", "Steady", "Tight". No score band words. No instruction to the user about what to do with money. The change line says what changed ("More · $85"), never whether that is good. Every number states what it is from ("from these figures", "at today's exchange rates", "as of today"). FincWin holds no money and moves none.

---

## Interaction and Motion

- Calm, one motion at a time (06.2 kit): bars and the net-worth line grow or draw once per session (`useOncePerSession`), never loop. Switching range, mode, month or scope cross-fades (0.15 s `FadeSwap`) without replaying the grow.
- Reduce Motion (`useReduceMotion` / `useMotion`): everything appears drawn, cross-fade only.
- Haptics: none on Insights (read-only screen). No success or warning haptic.
- Selection: tapping a bar, pair or point shows an inline readout and moves the marker; it also moves screen-reader focus order only if the user drags focus there.
- Scroll position and selected range/mode persist for the session; leaving the tab and coming back does not replay the grow.

---

## Accessibility

- Every chart is an `accessibilityRole="image"` group with a one-line summary label and the bars/points reachable as children for swipe navigation.
  - In/out: "Money in and out, last 6 months. June: in 3,200 dollars, out 2,950 dollars. May: ..." Each pair is one focus stop with label "June: in 3,200 dollars, out 2,950 dollars, left 250 dollars."
  - Left chart: each bar "June: 250 dollars left." and below zero "June: 120 dollars short."
  - Net-worth line: summary "Net worth, last 6 months, from 14,200 to 18,400 dollars, up 4,200 dollars, at today's exchange rates." Each point "June 30: 18,400 dollars."
  - Category rows: "Groceries, 420 dollars, 34 percent of spending."
  - Score: "Score 72 out of 100, from these figures." Each part: "Share of income kept, 18 percent, 27 of 35 points."
- `ChartSummary` text is visible on screen too (not hidden-only), `meta` size, so sighted and screen-reader users read the same sentence.
- Roles: range control and scope switch are `tablist`/`tab` (as `SegmentedControl` default); month chips are `radio` in a group "Month".
- Targets >= 44 x 44 via hit slop on bars and points.
- Text scaling: tested at 320 dp and font scale 200% (Pixel text-fit matrix). Rows grow from one to two lines before truncating; amounts never truncate. StatTile triplets and the in/out totals strip stack to one column at font scale > 1.3. Bars and line keep fixed plot heights; axis labels thin out (every second or third month) rather than overlap. Horizontal chart scroll at 1Y and All.
- Colour never the only signal (D-24): in vs out distinguished by position in the pair, swatch shape and legend word; every bar/point has a spoken label and every chart a summary line; category bars sit under the named row; change arrows carry glyph + word; Short carries glyph + word. Contrast: all text tokens used are already tested in `src/theme/contrast.ts`; chart colours (`chartPalette`, fits green, short stroke, accent) are 3:1 or better on every chart ground; `inkFaint` is never placed on the page tone.
- Live regions: none needed (no values change without a user action). On range or mode switch, post `AccessibilityInfo.announceForAccessibility` with the new chart summary once, debounced 600 ms (reuse `useSettledLabel`).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (not used) | not applicable |
| third-party | none | not applicable |

New npm dependencies: none. Charts use `react-native-svg` 15 and Reanimated 4 already in the stack. No chart library.

---

## Level Gating (feeds D-16)

| Feature row (add to `featureRegistry.ts` and `09-LEVEL-MAP.md`) | Level |
|------|-------|
| Insights tab, money in and out bars, left-each-month mode, spending by category, month against last month | Everyday (2) |
| Net worth over time, health score | Full picture (3) |

---

## Owner decisions (2026-11-22)

Answered by the owner after the draft; these replace the former open list.

1. **Score part names:** "Debt against yearly income" and "Bills paid on time" (as drafted). The planner confirms the engine's unpaid ratio means this month's bills not yet paid before the copy is final.
2. **Money out bars:** superseded by D-24 (owner, 2026-11-22, later the same day): charts may use vibrant colour. Money in = fits green, money out = chart Orange, below-zero Left bars in the short colour, net-worth line in the theme colour, category bars from `chartPalette`.
3. **Category rows open Activity** filtered to that category and period (section 4).
4. **Footer:** "FincWin holds no money and moves none." The word "advice" is not used on Insights.
