# Phase 3 — UI Review

**Audited:** 2026-10-14 (retroactive, after device acceptance 03-14)
**Baseline:** `03-UI-SPEC.md` (approved 2026-10-13), `03-CONTEXT.md` D-01..D-42, CLAUDE.md design-fidelity rule, `docs/design/prototype-deviations.md` (accepted deviations are not penalised)
**Screenshots:** not captured. This is a React Native app, so there is no dev server to screenshot. The audit is code-only, checked against the Pixel 9 device record in `docs/acceptance/phase-03-shell.md`.
**Branch:** `phase/03-shell`

Known gaps that this review does **not** re-score as new: D-39 (Accounts row too wide), D-40 (Android edge swipe), D-41 (no Unpaid banner), D-42 ("Projected" vs "Expected"), WR-01 (Home ignores `isError`). Other 03-REVIEW items that touch UI (CR-01, WR-05, WR-06, WR-08) are listed as already known where they come up.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Voice is clean (no advice/recommend/should). But "This month", "left after everything" and "…yet." stay fixed when a past month is selected, and the visible "Pay" reads as if money is sent |
| 2. Visuals | 2/4 | Two of the three Home cards lose their shadow on iOS (`overflow:'hidden'` + `shadows.card`). The 28px spacer is inside the Accounts card, not after it. The toast has no fw-rise. Plus D-39 |
| 3. Color | 3/4 | Palette is clean: no raw literals, backdrop is ink at 0.38, every accent passes AA. But the cash tile uses the fixed-green `accentTint1` whatever accent the user picked |
| 4. Typography | 3/4 | Only declared sizes and weights (8 sizes, weights 500/600/700). Sibling sub-lines use different weights (600 vs 500), the stacked-figures layout doesn't match the spec, and the specced 2px/4px gaps are missing |
| 5. Spacing | 3/4 | Tokens are used almost everywhere. But the toast geometry ignores the spec (15/16/12 instead of 13/18/14, and 44px controls make it about 74px tall), and there is a 12 vs 13 row-gap drift and a 10 vs 8 header gap |
| 6. Experience Design | 2/4 | The FAB permanently covers the last Activity row's amount (no bottom inset). Activity's sync-problem line is invisible until you scroll. The avatar hit area is 42px. Plus the known A7/A9/WR-01/CR-01 |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **The FAB covers the bottom of every tab-root list (NEW, WARNING-high)**. On Activity, the last row's trailing amount (and swipe target) sits permanently under the 50px FAB pill, because the list can't scroll any further. `ActivityScreen.tsx:332-343` (FlashList) and the calendar `Animated.ScrollView` at `:309` have no `contentContainerStyle` bottom padding. `TabRootScreen.tsx:29` reserves only `space.groupGap` (18). **Fix:** expose the FAB's reserved height from `useFabOffsets()`/`ShellLayoutProvider` (`size.fab + space.fabInset` plus the current `lift`). Apply it as `paddingBottom` on `TabRootScreen`'s content and on Activity's FlashList and calendar scroll.
2. **Activity has no visible sync-problem line at rest (NEW, WARNING-high, needs a device re-check)**. `SyncProblemLine` is mounted only in `TabRootScreen.tsx:32` (Home) and inside `CompactHeader.tsx:75`. On Activity, the compact header has `opacity 0`, is hidden from accessibility and has no pointer events until you scroll. Activity's `listHeader` (`ActivityScreen.tsx:228-231`) renders `chrome.largeHeader` with no sync line under it. So offline, queued and failed-write states go unannounced on Activity until you scroll, which breaks D-15 ("on every screen"). A15 was recorded PASS, so the tester may have scrolled first. **Fix:** put `<SyncProblemLine />` straight after `chrome.largeHeader` in Activity's `listHeader`, or have `useTabRootChrome` return `largeHeader` with the line already attached.
3. **Home cards are inconsistent on iOS, and the Accounts card has a dead band (NEW, WARNING)**. `ComingUpCard.tsx:262-266` and `AccountsCard.tsx:130-135` combine `overflow:'hidden'` with `shadows.card`. On iOS that clips the layer shadow, so Coming up and Accounts render flat while This month (`ThisMonthCard.tsx:180-185`, no overflow) has a shadow. Separately, `AccountsCard.tsx:124` puts the prototype's 28px spacer *inside* the card. The prototype places it after the last card (`FincWin United.dc.html:190`, a sibling `<div style="height:28px">`). The result is a 28px empty white band under the last account row, and no end spacer when the card is absent. **Fix:** wrap each clipped card in an outer `View` that carries `shadows.card` and `borderRadius`, and keep `overflow:'hidden'` on the inner view. Move the 28px spacer to `HomeScreen` after `<AccountsCard/>`, or into `TabRootScreen`'s bottom padding (see fix 1).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Voice check: `grep -niE "advice|recommend|you should"` over `en.ts` matches only the compliance comment at line 34. All shell, sheet, refresh and home strings are declarative. Every specced string exists verbatim (`en.ts:1261-1330`): tab labels, the `"{label}, tab, {position} of {total}"` pattern, FAB "Add" / "Add a transaction", "Quick add", the discard dialog, the refresh toasts, the Home strings and the a11y labels. Label-in-name (WCAG 2.5.3) holds for Add, Pay bills, Import and Pay.

**NEW**
- **WARNING — the copy doesn't follow the selected month.** `ThisMonthCard.tsx:77` always shows "This month" (`home.month.heading`), even when the chips select an earlier month. The empty line `home.month.empty` ("Nothing recorded in {month} yet.", `en.ts`) says "yet" about a closed past month. **Fix:** use "This month" only when `month` is the current month, otherwise the month name, and add a past-month empty variant without "yet".
- **WARNING — month-name form isn't consistent on one screen.** The This-month empty line uses the long name (`ThisMonthCard.tsx:69`, `month:'long'` → "September"). The Coming-up empty line uses the short name (`ComingUpCard.tsx:125` → "Sep"). Both describe the same selected month, stacked one above the other.
- **WARNING — "Pay" may read as a payment.** Coming-up's "Pay" (`home.upcoming.pay`) and the "Pay bills" quick action only *mark* an item paid. CLAUDE.md says the app holds no money and executes nothing, and that this must show in every piece of copy. The a11y label says "mark as paid", but the visible word doesn't. The prototype and spec approved it, so this is a Compliance-phase review item rather than a defect today. Consider "Mark paid" or "Paid" as the visible label.
- **Minor — tablist with button children.** `MonthChips.tsx:43` gives the container `accessibilityRole="tablist"`, but each chip is `accessibilityRole="button"` with `selected`. Use `tab` for each chip, or drop `tablist`.

**Known (not re-scored)**
- D-42: Coming-up rows say "Projected" (`en.ts:1323`, `ComingUpCard.tsx:159`). The detail sheet those rows open says "Expected" in its subtitle (`ProjectionDetailSheet.tsx:46` → `record.recurring.projected` = 'Expected', `en.ts:440`). So the contradiction happens inside one Home tap, as well as between Home and Activity.
- WR-06: offline pull says "Up to date — nothing new to pull".
- The discard body "Changes on this sheet haven't been saved." is still Claude-drafted and pending user review (`copyStatus.ts`).

### Pillar 2: Visuals (2/4)

What passes: the five tab glyphs match the spec geometry exactly (`TabGlyphs.tsx`), are hidden from accessibility, and use ink/inkMuted, never accent. The FAB geometry matches. The quick-action glyphs are hand-drawn bars with no icon font. The focal point ("left after everything" in heading role, in accent or danger) is clear, and the selected tab never competes with it.

**NEW**
- **WARNING — iOS shadows are clipped on Coming up and Accounts.** See Top fix 3 (`ComingUpCard.tsx:265`, `AccountsCard.tsx:134`). It hasn't shown up on device yet because only the Pixel 9 has been tested. Android `elevation` survives `overflow:hidden`.
- **WARNING — the Accounts card has a 28px band inside it.** See Top fix 3 (`AccountsCard.tsx:20,124`).
- **WARNING — the toast has no entrance motion.** The spec (Toast & Sync Line; Animations table) requires fw-rise: 220ms, plain `ease`, a 14px rise plus a fade. `UndoToastHost.tsx:155-168` renders a plain `View` and `ToastView.tsx` has no Animated wrapper, so the toast pops in. Meanwhile the FAB lifts with an animation (`Fab.tsx:50-52`), so the two move out of step.
- **Minor — the avatar can be empty.** `AvatarButton.tsx:16` falls back to `''` when there is neither `full_name` nor `email`, which leaves an empty 42px circle. The spec says "the avatar shows a person glyph drawn from two shapes in `inkDim`".
- **Minor — Coming-up amounts are ragged.** Recorded rows end their amount before the Pay pill. Projected rows have no Pay (`ComingUpCard.tsx:219`), so their amount sits about 60px further right. The amount column doesn't line up from row to row. A same-width spacer on projected rows would fix it.
- **Minor — the large header shows a back button.** `TabHeader.tsx:42` shows a back button whenever `canGoBack`. The spec gives the large state only eyebrow, title and avatar, with the back chevron in the compact state. This is a defensible extra, but it isn't in the contract.
- **Minor — the Pay button never drops below.** Spec: "at large text the Pay button drops under the text block, right-aligned". The row has `flexWrap:'wrap'` (`ComingUpCard.tsx:269`), but the body has `flex:1, minWidth:0`, so it shrinks and Pay never wraps. At 200% the name is squeezed instead, and nothing right-aligns it if it does wrap.

**Known:** D-39 (the compact `AccountBalanceBlock` renders the standing sentence, the home conversion and `RateAttribution` in the row, `AccountBalanceBlock.tsx:107-122`).

### Pillar 3: Color (3/4)

- Raw colour scan over `src/shell`, `src/features/home`, `Sheet.tsx` and `ToastView.tsx`: **0** hex or rgb literals. The backdrop is `colors.ink` + `BACKDROP_OPACITY 0.38` (`Sheet.tsx:276`, `sheetDrag.ts:8`). The pending bar is accent at 0.3 (`ThisMonthCard.tsx:143`). The handle is `line2`. No toast shadow.
- Accent use stays inside the reserved list: the FAB fill, refresh tint, the 3 quick-action glyphs, the paid and pending bar, the headline when ≥ 0, Pay text and pressed fill, "See all", and the cash tile. Tab selection uses ink, so accent never marks it.
- Contrast, computed with the WCAG formula: inkMuted on surface/canvas/fill1 is 5.40/5.18/4.70. danger on surface is 5.42. surface on ink is 18.4. surface on warn1 is 5.90. All four accents pass on surface (7.1–11.5), on fill1 (6.2–10.0) and as surface-on-accent for the FAB. **Text contrast passes for every accent.** There is only a light theme (no dark palette exists in `ThemeProvider`), so "both themes" means the four accents.

**NEW**
- **WARNING — the cash tile tint doesn't follow the accent.** `AccountsCard.tsx:55` uses `colors.accentTint1` (`#EAF1EC`, a fixed tint of the *green* accent) with `colors.accent` text. With navy, rust or slate selected, you get a rust "C" on a mint tile. That contradicts the spec's own reasoning for dropping `#9BC0B2` from the toast ("a tint of the default green … would misrepresent other accents"). The shared `Chip` (`Chip.tsx:22`) has the same flaw, carried over from an earlier phase. **Fix:** use accent at low opacity over `fill1` (the same derivation as the pending bar), or `fill1`/`inkDim` for every account kind.
- **Minor — two decorative shapes are faint.** The quick-action circle border is `line1` on canvas (1.15:1) and the chevron is `inkSoft3` (1.78:1). Both are allowed because the labels carry the meaning, but the circles nearly vanish on canvas. Loading placeholders (`fill1` on `surface`, 1.15:1) are close to invisible, so the loading state reads as an empty card.
- **Info:** Activity's "Paid" section header in accent (`ActivityScreen.tsx:196`) is outside the Phase 3 reserved list. It comes from the 2026-10-07 amendment, so it is noted, not scored.

### Pillar 4: Typography (3/4)

Font sizes in scope: tabLabel 10.5, eyebrow 11.5, meta 12.5, label 13, s13_5, body 15, sheetTitle 16, heading 26. All 8 are declared in `fontSize`. Weights in use are 500, 600 and 700 (700 only in the heading role). No new size, no stray weight. Scale capping: `scale="capped"` is on the headline (`ThisMonthCard.tsx:123`), the IN/OUT/UNPAID figures (`:164`), the date block (`ComingUpCard.tsx:188,199`) and the tab labels (`TabBar.tsx:96`). That matches D-19.

**NEW**
- **WARNING — sibling sub-lines use different weights.** The Accounts sub-line uses the label face at weight 600 (`AccountsCard.tsx:65`, `textRole(pairing,'label').fontFamily`). The Coming-up sub-line, one card above, uses weight 500 (`ComingUpCard.tsx:207`). The spec gives both as `meta` 12.5 `inkMuted`.
- **Minor — the stacked layout doesn't match the spec.** Above 1.3× the spec says the figures stack "caption left, figure right". `ThisMonthCard.tsx:145-149` stacks caption *above* figure in a column. The spec's 4px caption-to-figure gap (`:164`) and the Coming-up 2px name-to-sub-line gap (`ComingUpCard.tsx:204-207`) are both missing.
- **Minor — some inline text skips `lineHeight`.** The eyebrow, chip text, quick-action labels, sub-lines, FAB label and avatar initial are styled inline with `fontSize` but no `lineHeight` (for example `QuickActions.tsx:109`, `MonthChips.tsx:57-63`). At 200% those labels wrap at the font's default leading, not the role's ratio. They should go through `textRole` or set the role's ratio.
- **Info (IN-01, known):** `Text.tsx` forces `allowFontScaling={false}`, so any text without an explicit `fontSize` stops scaling.

### Pillar 5: Spacing (3/4)

Literal scan: 0 untokenised spacing values in `src/shell`. Home literals are named constants matching the declared prototype exceptions. `space.cardPadLg`, `radii.toast`, `radii.sheetTop` and the `size.*` geometry are all used. Tab bar bottom is `Math.max(insets.bottom, 12)`. The toast offset is derived, never 104. The FAB bottom is the measured tab bar + 16.

**NEW**
- **WARNING — the toast geometry doesn't match the spec.** The spec gives padding 13 vertical / 18 horizontal with a 14px gap. `ToastView.tsx:84-86` uses `pillPadV` (15), `cardPad` (16) and `gapMd` (12). Both controls are also `minHeight/minWidth 44` (`:91-95`), so a one-line toast is about 74px tall against the prototype's roughly 45px pill. **Fix:** set the specced padding, and get the 44px targets with `hitSlop` rather than the control's own box.
- **WARNING — the row gap drifts between sibling cards.** The spec gives a 13px gap on Accounts rows. `AccountsCard.tsx:140` uses `space.gapMd` (12), while Coming-up uses 13 (`ComingUpCard.tsx:24`). So the two sibling cards have different tile-to-text rhythm.
- **Minor — the header gap is off.** The This-month header gap is specced at 10px. `ThisMonthCard.tsx:191` uses `space.gapSm` (8).
- **Minor — constants are mislabelled.** `ThisMonthCard.tsx:24-26` calls `HEADLINE_GAP = 12` and `BAR_GAP = 16` "prototype-literal exceptions", but neither is in the declared exception list. They equal `space.gapMd` and `space.cardPad` and should use those tokens. Placeholder sizes `30/160/40` (`:209-210`) are raw, and `placeholderLine` borrows `space.cardPad` as a height and `radii.glyphTile` as a radius (`ComingUpCard.tsx:291`, `AccountsCard.tsx:153`), which is semantic misuse of tokens.
- **Minor — pressed opacity is repeated.** The pressed opacity `0.72` is written out 5 times (`AccountsCard.tsx:51,118`, `ComingUpCard.tsx:184`, `QuickActions.tsx:104`). It belongs in `motion.ts` or `layout.ts`.
- **Minor — month-chip hit slops overlap.** The horizontal `hitSlop` of 4 on each side (`MonthChips.tsx:53`), against a 5px gap, means neighbouring chips' hit areas overlap by 3px.
- Cross-reference: there is no bottom clearance for the FAB (Top fix 1).

### Pillar 6: Experience Design (2/4)

What passes: loading placeholders with `busy` and "Loading overview" on all three cards. Empty states on This month, Coming up and Accounts (Accounts absent). Reduced motion: `ReducedMotionConfig` is in `app/_layout.tsx:99`, `TabSlideIn` checks `reduced`, and the Sheet drag timer goes through `durationRef`. Haptics match D-18. Sheets have a backdrop "Close" button, an escape action, `accessibilityViewIsModal`, and the dirty-guard prompt. Tabs have role, selected state and position. All controls clear 44px except the avatar below.

**NEW**
- **WARNING-high — the FAB hides the last list content.** See Top fix 1.
- **WARNING-high — Activity's sync line is hidden at rest.** See Top fix 2.
- **WARNING — the avatar hit area is under 44px.** `AvatarButton.tsx:22-29` is a 42×42 `Pressable` with no `hitSlop`. The spec says "42px circle (visible size; hit area 44px)". **Fix:** `hitSlop={(space.touchMin - size.avatar) / 2}`, as `BackButton` does.
- **WARNING — Import from Home ends on Activity.** `QuickActions.tsx:92` pushes `/import` with `entry:'you'`, and `app/(app)/import.tsx:18` finishes with `router.replace('/activity')`. A user who starts an import from Home finishes on Activity, which breaks the origin rule the back history otherwise keeps. This compounds WR-08.
- **Minor — the header isn't one reading unit.** The spec says eyebrow and title read together. `TabHeader.tsx:44-55` renders the eyebrow as a separate text stop, and focus lands on the title only, so the date is skipped on arrival.
- **Minor — Accounts heading has no header role.** The Accounts heading (`AccountsCard.tsx:94`) and the This-month heading (`ThisMonthCard.tsx:77`) don't have `accessibilityRole="header"`, but Coming up does (`ComingUpCard.tsx:72`). Heading navigation therefore skips two of the three cards.

**Known (not re-scored)**
- **WR-01 — Home ignores `isError`.** A failed read renders as a real empty month: "£0", "Nothing outstanding" (`HomeScreen.tsx:95-117`). This is the largest correctness gap on Home.
- **CR-01:** the headline shows £0 in muted ink while UNPAID shows expected bills (`ThisMonthCard.tsx:72,105-107`).
- **A7 / D-40:** the Android edge swipe is hard to discover and gives no feedback.
- **A9 / D-41:** arriving on the Unpaid filter has no banner.
- **WR-05:** the drag-dismiss timer is never cleared, so a double `onDismiss` is possible.
- **WR-06:** an offline refresh shows a "nothing new" toast.

---

## Registry Safety

Not applicable. React Native/Expo, with no `components.json` and no shadcn or third-party blocks (as stated in `03-UI-SPEC.md`). Registry audit: 0 third-party blocks checked, no flags.

---

## Files Audited

- `src/shell/tabBar/TabBar.tsx`, `TabGlyphs.tsx`, `TabSlideIn.tsx`, `tabSlide.ts`
- `src/shell/fab/Fab.tsx`, `FabQuickMenu.tsx`, `useShellPositions.ts`
- `src/shell/header/AvatarButton.tsx`, `BackButton.tsx`, `CompactHeader.tsx`, `DetailHeader.tsx`, `SyncProblemLine.tsx`, `TabHeader.tsx`
- `src/shell/screen/TabRootScreen.tsx`, `DetailScreen.tsx`, `useTabRootChrome.tsx`
- `src/ui/Sheet.tsx`, `sheetOverlay.tsx`, `sheetDrag.ts`, `ToastView.tsx`, `Text.tsx`, `TextInput.tsx`
- `src/features/record/history/UndoToastHost.tsx` (toast position and motion)
- `src/features/home/HomeScreen.tsx`, `QuickActions.tsx`, `ThisMonthCard.tsx`, `MonthChips.tsx`, `ComingUpCard.tsx`, `ProjectionDetailSheet.tsx`, `AccountsCard.tsx`
- `src/features/record/activity/ActivityScreen.tsx`, `src/features/record/accounts/AccountBalanceBlock.tsx`
- `app/(app)/(tabs)/_layout.tsx`, `app/(app)/import.tsx`
- `src/theme/tokens.ts`, `accents.ts`, `layout.ts`, `motion.ts`, `typography.ts`, `fontScale.ts`, `ThemeProvider.tsx`
- `src/i18n/locales/en.ts` (shell.*, sheet.*, refresh.*, home.*, activity.totals.*, record.recurring.projected)
- `FincWin United.dc.html` L53-62, L155-192 (to check the Home spacer and Coming-up structure)
