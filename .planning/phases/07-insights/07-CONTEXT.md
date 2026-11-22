# Phase 7: Insights - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can see the shape of their finances over time on the Insights tab: net worth over time (INS-01), money in and out per month as bars (INS-02) with a comparison mode (INS-03), spending by category for a period (INS-04), a month against the previous one (INS-05), and a financial health score with the figures behind it (INS-06).

**Success criterion 5 (Activity's week / split / balance / calendar views) is already met.** ACT-06 moved to Phase 2.2 on 2026-10-07 and is complete there. This phase builds nothing for it. The verifier should cite ACT-06 / Phase 2.2 as the evidence.

Not in this phase: Home changes (D-17), a household health score (D-19), Share/Blocks chart styles, a free date-range picker, saved net-worth snapshots.

</domain>

<decisions>
## Implementation Decisions

### Health score (INS-06, ARC-21)
- **D-01:** Keep the prototype's four-part recipe and weights (prototype `FincWin United.dc.html` ~4921-4930): share of income kept, capped at 30% → 35 points; months of emergency cover, capped at 3 → 30; debt against yearly income, capped at 0.6 → 20; unpaid ratio, capped at 0.6 → 15. Round and clamp to 0-100. It lives in the pure engine (`src/engine/health/`), in integer/rational maths with stated rounding.
- **D-02:** ARC-21: every input comes from the Decide engine's own month figures (the v3 month model, the month picture, Decide's funds). The score module works out no income, spending or cover of its own. "Months of emergency cover" reads Decide's emergency money (`src/engine/decide/v3/funds/emergency.ts`), never a goal seed id.
- **D-03:** The exit gate is extra to the recipe: a month Decide calls short (left after plans below zero, or Decide's short state) cannot score in the top band (75+). Cap it below 75 and prove it with a property test.
- **D-04:** No band word. The display is the number only: "Score 72 out of 100, from these figures", then the four parts listed with their own figures. "Strong / Steady / Tight" are dropped. No grade words ("healthy", "poor", "good", "bad"). The shared copy guard covers Insights copy.
- **D-05:** Thin data shows "—" and one plain line naming what is missing (for example "Add this month's income and the score appears."). It follows the owner's ask-don't-block rule: name the gap. No partial score.
- **D-06:** The score describes **this month, live**: the same month Decide is reading today, so the two always agree. No trend line of past scores.

### Net worth over time (INS-01)
- **D-07:** Past points are worked back from records: account opening balances plus recorded lines up to each month-end, plus holding values that have a date on or before it. Debts and holdings without dated history are held at their current figure, with a short note saying so. No new snapshot table.
- **D-08:** Each point is through `netWorthOf` (`src/features/grow/netWorth.ts`, the 06-14 / D-26 single rule). Do not write a second sum. The planner decides whether the time-series helper moves into `engine/` (it must stay pure).
- **D-09:** One point per month-end, plus today as the last point.
- **D-10:** Ranges are **6M / 1Y / All**, defaulting to 6M. No 1M.
- **D-11:** Every point uses today's exchange rates, with a note: "At today's exchange rates." Figures that can't be converted are left out, as Grow does now, and the screen says so.

### Money in and out, comparison, categories (INS-02..05)
- **D-12:** The bars mode shows money in and money out side by side per month. The comparison mode (INS-03) shows one bar per month for what was **left** (in minus out), drawn up or down from zero. The source is `pastMonthBars` (`src/engine/month/picture.ts`), with the current month from the same rule. The figures match Decide's Month-by-month sheet.
- **D-13:** Month against previous month (INS-05): pick a month and see in / out / left totals at the top. Below that, each category's spending next to the month before, with the change as an arrow, a word and an amount, sorted by biggest change.
- **D-14:** Spending by category (INS-04): the period is one month (picked like Activity's month list) or the last 6 months or year added up. It uses the same range control as net worth, so there is one way to pick a period on the tab.
- **D-15:** The category breakdown is drawn as ranked rows: category icon, name, amount, share of total, and a thin bar (Row + ProgressBar). No donut or treemap. Share and Blocks stay out, matching the owner's 2026-11-19 answer.

### Who sees Insights, and where
- **D-16:** The Insights tab turns on at **Everyday (level 2)**. Money in and out bars, the comparison mode, spending by category, and month against month are at Everyday. **Net worth over time and the health score are at Full picture (level 3).** Add feature rows to `featureRegistry.ts` **and** to `.planning/phases/09-tiers-onboarding/09-LEVEL-MAP.md` (a test parses it). This replaces the owner's 2026-11-19 "No" answers 4/5/8/9 in that file, which were "not built yet" answers. `availableTabs.insights` becomes true only through the level gate.
- **D-17:** Home is unchanged. No net-worth hero and no health row on Home, which keeps 06.2 D-02's card order. Net worth and the score live on Insights only.
- **D-18:** One Just me / Household switch at the top of Insights changes every chart, using the existing household scope (`useHouseholdScope`). Just me counts through `countsForMe` (the same rule as Decide). Household counts shared money once. A partner's personal lines never show in either view (ARC-22).
- **D-19:** The health score is **Just me only**. In the Household view its row reads "Your score is in Just me". The score reads Decide, which answers per person (pool rule: pooled money is held back from the member's own answers).

### Owner answers after research (2026-11-22)
- **D-20:** Health score part 4 keeps Decide's own figure (`month.billsDue` over `month.moneyOut`, every bill still unpaid this month) and is named "Bills still to pay this month". No new Decide month figure. The score may rise through the month as bills are paid; that is expected.
- **D-21:** "All" for the money in/out bars, the comparison mode and spending by category stops at Decide's window: up to 12 past months plus this month, with a plain line saying so. No second read path. Net worth "All" may go further back (it reads balances, not Decide's lines).
- **D-22:** In past net-worth points, a holding appears from the month of its first dated value and is left out before that (no hold-flat for holdings). Debts are still held flat per D-07.
- **D-23:** Just me net worth counts the user's own personal accounts in full; joint/shared accounts count only in the Household view. Household counts shared money once.

### Chart colour exception (owner, 2026-11-22, after planning)
- **D-24:** Charts and the lines within charts are an exception to the design-fidelity colour rule (CLAUDE.md amended). They may use vibrant colour: (a) existing theme and Decide state colours at full strength where colour carries meaning (money in vs out, below-zero "left" bars in the short colour, net-worth line in the theme colour); (b) a new bright chart-only palette (`chartPalette`, about 6 colours in `src/theme/tokens.ts`, each tested for contrast against `surface` in `src/theme/contrast.ts`) for series like categories (category row bars). Colour is never the only signal: each bar/point keeps its spoken label and the chart its summary line. Insights uses `SignedBars`' default (state) tone; no neutral tone is needed. Non-chart UI (rows, tiles, cards) keeps the normal rule.

### Claude's Discretion
- The range for the money in/out bars and comparison mode: the same 6M / 1Y / All control, defaulting to 6M.
- Section order on the Insights screen, empty screens (06.2 empty-state pattern: icon + one line + button), and loading and offline states.
- How charts read to screen readers (each bar and point has a spoken label; a summary line per chart).
- How bars animate (06.2 motion kit: bars grow once, calm, reduced-motion respected).
- How transfers, refunds, settlements and moves between envelopes count in categories. Follow `pastMonthBars` and ARC-18 (settlements are neither spending nor income) so Insights never disagrees with Decide or Activity.
- Whether the net-worth time-series and category totals are new `engine/` modules or thin adapters over existing ones.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and gates
- `.planning/ROADMAP.md` § "Phase 7: Insights": goal, success criteria, the 2026-11-22 amendments.
- `.planning/REQUIREMENTS.md`: INS-01..INS-06; ACT-06 (criterion 5 already met).
- `.planning/ROADMAP.md` § Phase 11, criterion 12: the final audit signs the score off (short month never in the top band; "Score 72 out of 100, from these figures").
- `.planning/research/DECIDE-FIX-PLAN.md`: ARC-21 (lines ~274-276, 317, 649, 1459) and the standing exit lines S1-S6 (line ~140: copy guard, no hard-typed text, no amounts in analytics, data-map entries).

### Prototype and brief
- `FincWin United.dc.html` ~4905-4940: net-worth range and the health score recipe (band words dropped, per D-04); ~6782: chart modes (not adopted).
- `.planning/PROJECT.md` lines ~63-65 (Insights scope) and ~135 (health score belongs in `engine/health/`, no seed ids).
- `BUILD-PROMPT.md` § Insights (line ~224).

### Prior phase decisions that bind here
- `.planning/phases/06.2-app-life/06.2-CONTEXT.md`: D-02 (Home card order locked), the Insights tiles / one date range / bar motion note, the icon set, the six spacing steps.
- `.planning/phases/09-tiers-onboarding/09-LEVEL-MAP.md`: the level map to extend (D-16); §5 holds the owner answers this replaces.
- `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CONTEXT.md`: Decide figures the score reads; household scope in Decide.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engine/month/picture.ts`: `monthPicture`, `pastMonthBars` (in / out / left per recorded month), `homeReading`.
- `src/features/decide/screens/engine/useMonthPicture.ts`: how the app already gets `prepared` → picture + bars.
- `src/features/grow/netWorth.ts`: `netWorthOf`, the single net-worth rule.
- `src/engine/month/countsForMe.ts`: the "my share" rule for Just me.
- `src/features/household/useHouseholdScope.ts`, `src/features/household/decide/scopeSource.ts`: the scope switch.
- UI: `StatTile`, `StackedBar`, `ProgressBar`, `Row`, `SegmentedControl` / `SegmentedToggle`, `EmptyState`, `AmountDisplay`, `CategoryGlyph`, `src/ui/motion`, `src/ui/icons`. Typography has `netWorth` and `healthScore` display roles (`src/theme/typography.ts`).
- `src/features/decide/screens/answer/detail/MonthByMonthSheet.tsx`: an existing in/out/left bar presentation to stay consistent with.

### Established Patterns
- Engine purity: nothing in `engine/` imports db/state/services/ui/react. Integer minor units and BigInt sums. Branch-coverage gate on engine changes.
- Feature gating: `src/features/levels/featureRegistry.ts` (mirrors 09-LEVEL-MAP.md, drift test) and `src/shell/tabBar/availableTabs.ts` (`insights: false` today).
- Copy is in the i18n catalogue with the compliance-voice guard. No "advice", "recommendation", "you should", or grade words.

### Integration Points
- A new `app/(app)/(tabs)/insights.tsx` route (the tab order already includes `insights`, `src/shell/tabBar/tabs.ts`), and tab glyphs in `TabGlyphs.tsx`.
- Data hooks under `src/data/queries/` reusing the Decide v3 inputs (`decideV3.ts`) so the score and bars share one prepared input.
- Features screen: the "Insight" section label already exists (`src/i18n/locales/features/index.ts`), and an empty section is hidden today.

</code_context>

<specifics>
## Specific Ideas

- The score's wording is fixed by the fix plan: "Score 72 out of 100, from these figures".
- Net-worth notes in plain words: "At today's exchange rates", plus a note when a debt or holding has no past values and is held flat.
- The owner's standing preference: plain grade-10 English in all copy, and short sentences first.

</specifics>

<deferred>
## Deferred Ideas

- Monthly net-worth snapshots (exact history going forward): not now. Reconsider if worked-back figures prove unreliable.
- Health score trend (past months' scores), and a household-level score (needs a household Decide month).
- Net-worth figure and health row on Home (needs a new Home layout sign-off against 06.2 D-02).
- Share (donut) and Blocks (treemap) chart styles; a year-against-year comparison; a free date-range picker.

</deferred>

---

*Phase: 07-insights*
*Context gathered: 2026-11-22*
