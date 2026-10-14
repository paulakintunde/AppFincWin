# Phase 3: Shell - Context

**Gathered:** 2026-09-26
**Updated:** 2026-10-13. Reopened after Phases 2.2 and 2.3 changed the sheet, the entry sheet and the navigation underneath these plans. The user re-decided sheets, backdrop and motion, dismissal, layering and mockup gaps, and added Home content.
**Status:** Ready for targeted re-planning. Plans 03-01…03-16 predate this update: see "Plan impact" at the end.

<domain>
## Phase Boundary

The app's navigation chrome, built to the design system, plus the Home tab's first real content. It covers:
- the tab bar with the bespoke SVG glyphs and a directional slide between tabs
- one app-wide back history, 8 deep
- detail screens that push in over everything and pop back
- drag-to-dismiss on the app's own Sheet
- the sheet backdrop, stacking and dismissal rules
- the context-aware floating action button and its long-press quick menu
- the screen header with its large title
- toast placement, including above open sheets
- the sync-problem line
- pull-to-refresh and its completion toast
- shell haptics
- screen-reader navigation and OS text scaling
- **Home content** (added 2026-10-13): quick actions, the "This month" card, "Coming up" and an Accounts summary, built from data Phase 2 already records

Requirements: NAV-01…NAV-06, DSG-07, and HOME-01…HOME-04 (added 2026-10-13).

Not in this phase:
- the screens inside the other tabs: Activity (Phase 2), Decide (5), Grow (6), Insights (7)
- Home's net-worth hero, range chips and sparkline (INS-01, Phase 7) and the health card (INS-06, Phase 7)
- level gating of features (Phase 9)
- the app-switcher privacy snapshot (DSG-08)
- feature-specific haptics (verdict, cap breach, commit), which belong to their phases
- the backlog items captured below (category split, receipt photo, envelope rollover, Coach, custom types)

</domain>

<decisions>
## Implementation Decisions

Decision numbers are local to this phase. "Phase 2 D-xx" refers to `.planning/phases/02-record/02-CONTEXT.md`. Decisions marked **(revised 2026-10-13)** or **(new 2026-10-13)** override the 2026-09-26 text and every plan written before them.

### Tabs
- **D-01:** **Tab order is Home · Activity · Decide · Grow · Insights.** Decide sits in the centre slot, the most prominent and easiest to reach with a thumb. The store name is "FincWin: Can I Afford It?" (`research/LAUNCH-POSITIONING.md`), so the promise is one tap from anywhere.
  - This is a **deliberate deviation** from the prototype, which orders them Home · Activity · Grow · Decide · Insights.
  - Record the deviation where DSG-01's screenshot parity is checked, so the tab bar isn't flagged as a regression.
  - The glyphs themselves stay exactly as in the prototype.
- **D-02:** **A tab whose phase hasn't shipped is hidden, not shown as a placeholder.** The tab bar renders from a list of available tabs, and each feature phase switches its own tab on as it lands (Decide in 5, Grow in 6, Insights in 7). The slide direction (D-01 order) and the back history must work for any subset of tabs. Home and Activity are available from this phase.
- **D-03:** **Levels never hide a whole tab.** Phase 9 gates features inside screens. Decide is always present. The available-tabs mechanism from D-02 is for build rollout, not for tiers.
- **D-04:** **You stays off the tab bar.** It is a pushed screen opened from the avatar at the top right of **each tab's root header**, not only Home as in the prototype. Activity's current "You" menu item (`ActivityScreen.tsx`) gives way to that avatar.

### Back behaviour
- **D-05 (revised 2026-10-13):** **One app-wide history, 8 deep, spanning tabs and detail screens** (NAV-02 exactly).
  - Tab switches and detail pushes are recorded in a single ordered history. The oldest entry drops off past 8.
  - Back walks the history: a detail screen, then the previous tab, then that tab's detail screen, and so on.
  - This fixes the prototype, whose `hist` records tab switches only and closes details on a tab change.
  - **A back step always slides in the reverse direction, as the prototype's `goBack` does (`dir:-1`, html L4881).** Forward tab changes slide by D-01 order. The 2026-09-26 text ("follows D-01 order") was wrong about the prototype.
- **D-06 (revised 2026-10-13):** **Android hardware and gesture back:**
  1. close the **top** open sheet, applying the dismissal rules D-25…D-27
  2. otherwise pop the history
  3. with the history empty on a non-Home tab, go to Home
  4. on Home with nothing left, exit the app
- **D-07 (revised 2026-10-13):** **Edge swipe-back works on detail and inner screens on both platforms.** iOS uses the native edge swipe. Android keeps the in-app edge swipe-back added by quick task 261010-kpe (`SwipeBack`, `swipeBackGesture.ts`, the `screenLayout` in `app/(app)/_layout.tsx`). It pops to the origin and never switches tabs. Tab-to-tab history uses the header's back chevron. Whatever navigator Phase 3 introduces must carry the SwipeBack wrapper and its route exclusions forward. Because sheets stay separate native windows (D-12), SwipeBack's assumption that its pan cannot fire under an open sheet still holds.
- **D-08:** **Re-tapping the active tab pops to that tab's root.** A second tap scrolls to the top.
- **D-22 (new 2026-10-13):** **Detail screens cover the tab bar.** A pushed detail fills the screen above the tab bar (`inset:0; z-index:70`, html L1994), as in the prototype, and the tab bar returns when the detail pops. This replaces 03-02's claim that the tab bar stays visible over details "as in the prototype".

### Floating action button
- **D-09:** **The button's action follows the screen:**

  | Screen | Label | Action |
  |---|---|---|
  | Home | "Add" | new transaction |
  | Activity | "Add" | new transaction |
  | Decide | "New check" | start a check, as in the prototype |
  | Grow | follows the sub-view: "New goal", "Add debt" or "Add holding" | set by Phase 6 |
  | Insights | "Add" | new transaction |

  The shell exposes a way for any screen to register its button label, accessibility label and action. Screens that register nothing get the default "Add". The accessibility labels follow the prototype's `fabAria` ("Add a transaction", "Start a new affordability check").
- **D-10:** **The button hides** during:
  - detail screens and sheets
  - the entry flow and bulk select
  - onboarding
  - step flows, including the Decide check editor and date pickers
  - the lock screen, and while signed out
  This is the prototype's `fabShow` rule (html ~6866) and satisfies NAV-05.
- **D-11:** **Long-press opens a quick menu sheet:** Add expense · Add income · Transfer · New check · Import statement. The same entries are exposed as named screen-reader actions on the button, so the shortcut is never hidden. Each entry only appears once its feature exists (the same availability idea as D-02). The quick menu is a Sheet (D-12) with the standard backdrop (D-23). Activity's existing Add menu sheet is folded into this menu, so there is one menu, not two.

### Sheets
- **D-12 (revised 2026-10-13):** **The app keeps its own Sheet, behind one shared interface, and gains drag-to-dismiss.**
  - The engine is `src/ui/Sheet.tsx`: an RN `Modal` with its own `GestureHandlerRootView`, the backdrop, a slide-in, and the SDK 57 Android keyboard handling (`useAndroidKeyboardHeight`). It is **not** migrated to `@gorhom/bottom-sheet`.
  - Every sheet in the app (about 35 call sites: `Sheet`, `ConfirmSheet`, `DetailSheet` and their callers) goes through this one interface. A single sheet can later switch to `@gorhom/bottom-sheet` behind the same interface if it ever needs snap points or long nested scrolling, without touching its callers.
  - Short tasks are sheets: add or edit an entry, settle up, a cap, a filter, the Pro gate, the floating button's quick menu. Multi-step flows are full-screen stacks: the Decide five-step check, statement import, onboarding. The floating button hides for these (D-10).
  - CLAUDE.md's stack line ("`@gorhom/bottom-sheet` v5 for ~14 sheets") is amended to match: our Sheet by default, with `@gorhom` allowed per sheet behind the shared interface.
  - User's reason: it keeps every fix since September (gesture root, backdrop, stacking, Android keyboard) with less to maintain. The library's main gain, snap points, isn't wanted (D-12c).
- **D-12a (new 2026-10-13):** **Drag zone:** the grab handle and header always drag. The body drags only while its scroll is at the top. Horizontal swipes inside the body (SwipeRow, e.g. the entry list) keep working; the vertical drag must not steal them.
- **D-12b (new 2026-10-13):** **Drag feel, from the prototype (html L6481–6494):**
  - The sheet follows the finger 1:1.
  - Releasing past **92px** slides it out (about 0.24s) and dismisses.
  - Releasing short of that snaps it back (about 0.24s).
  - No velocity rule is required. A fling may count as past the threshold if research finds that feels right on device.
  - The prototype's 38×4px handle (`#E2DED2`) is drawn from existing tokens.
- **D-12c (new 2026-10-13):** **Heights fit content, capped** (today's behaviour). No snap points. Content beyond the cap scrolls.

### Backdrop and motion
- **D-23 (new 2026-10-13):** **The backdrop is the prototype's ink at 38%: `rgba(20,21,15,.38)`** (html L2119). It is the palette's own ink colour at partial opacity, so the `colors.scrim` black token added on 2026-10-13 (quick 261013-izi) is replaced and the palette is strictly §2 again. One value is used everywhere: sheets, pickers, confirm sheets, the FAB quick menu. A sheet over another sheet adds its own layer, so depth reads as a little darker (D-28). This replaces the planned "ink at 40%" (03-09, 03-14, UI-SPEC line 112).
- **D-24 (new 2026-10-13):** **Motion:**
  - **Open:** the backdrop **fades in over 0.18s** while the sheet rises from below (`fw-up`, 0.26s `cubic-bezier(.2,.8,.3,1)`, html L2123). The backdrop stays fixed in place; only the sheet moves.
  - **Close:** as in the prototype. Cancel, Save and backdrop taps close **instantly**. A drag past the threshold **slides the sheet away** (D-12b) and the backdrop goes with it.
  - All of it goes through `src/theme/motion.ts` (D-21).

### Dismissing with unsaved work
- **D-25 (new 2026-10-13, replaces D-13):** **Entry sheet, accidental dismissal keeps a draft.** A swipe-down or Android back on the entry sheet never asks and never loses input.
  - The single form (amount, description, pickers) and the bulk list are both kept in the device draft (`useEntryDraft`, extended from the list to the form).
  - The next Add offers to continue it, as the list draft does today (02.3-UI-SPEC line 219).
  - One draft covers the form and the list.
- **D-26 (new 2026-10-13):** **Other edit sheets ask "Discard changes?"** This covers account, category, rule, filters and other short forms. A swipe-down or Android back with unsaved changes stops and asks (Keep editing / Discard). An untouched sheet closes at once. Each sheet reports "dirty" through the shared Sheet interface (D-12).
- **D-27 (new 2026-10-13):** **Cancel is deliberate.** Tapping Cancel closes without asking. The one exception is the 02.3 rule: Cancel on the entry sheet with list entries asks "Discard list?" first.

### Layering
- **D-28 (new 2026-10-13):** **Sheets stack on top and return on close.** A sheet opened from another sheet (a confirm over the entry sheet, sheets inside import's extras detail) slides over it, with the first dimmed underneath (its own backdrop layer, D-23). Closing it shows the first sheet unchanged. Picker hand-offs that already close-then-open (picker → Add account, `TransactionSheet` next-frame hand-off) keep that behaviour.
- **D-29 (new 2026-10-13):** **Android back and drag close only the top sheet**, one at a time, as the prototype's `dismissTop` does (html L6999). D-25…D-27 apply to whichever sheet closes.
- **D-16 (revised 2026-10-13):** **Toasts draw above open sheets**, as in the prototype (toast z95 over sheets z90/92, html L2794–2800). Undo, "Rule added" and "Removed · name" stay visible and tappable without closing the sheet. Because each Sheet is its own native window, the toast host must render in the top-most layer: inside the top sheet's window while one is open, otherwise in the app layer.
  - The floating button still lifts above the Undo toast while a toast shows, then settles back (the FAB is hidden while sheets are open, D-10).
  - The toast keeps the prototype's position just above the tab bar (html 2794) and Phase 2 D-31's timings.
  - The local `onUndo` added in quick 261013-kf4 must keep working.

### Header, status and feedback
- **D-14:** **The large title scrolls away and a compact title fades in.** The 26px display-face title scrolls with the content. A compact header showing the title, the back chevron (where there's history) and the avatar (on tab roots) fades in at the top, using the design's type and tokens. It's built in JS, not the native large-title header.
- **D-15:** **The sync line appears only when something is wrong.**
  - When offline, holding queued writes, or holding a failed write, a slim line shows under the header on every screen.
  - When all is well it is absent, and the full "synced x ago" line stays on You, as in the prototype (html 1807).
  - It reuses `useSyncStatus()` and `SyncStatusLine` (Phase 1 D-14).
- **D-17 (revised 2026-10-13):** **Pull-to-refresh uses the native refresh control**, in the design's colours, on the Home, Activity, Grow and Insights roots. It refetches that screen's queries and retries the write queue. **When it finishes, a toast says "Prices and balances up to date", or "Up to date — nothing new to pull" when nothing changed** (prototype html L6846–6853, L6997–6998). The copy goes in the i18n catalogue, in the declarative voice.
- **D-18 (revised 2026-10-13):** **Shell haptics are a minimal set,** through the existing `src/ui/haptics.ts` wrapper. `expo-haptics` ~57.0.3 is already installed and mocked in `jest.setup.ts`; do not reinstall it or add a second wrapper. Async API only:
  - a light impact on a floating-button press
  - a medium impact when the long-press menu opens
  - a selection tick when a sheet closes by drag
  - no haptic on tab change
  All are suppressed when the OS haptics setting is off.

### Home (new 2026-10-13)
- **D-30:** **Home becomes the landing tab, with real content from Phase 2 data.** It follows the prototype's Home (html L53–191) in this order, under the D-14 header (date eyebrow, title, avatar):
  1. **Quick actions** (HOME-01): Add · Pay bills · Import. "Pay bills" opens Activity filtered to Unpaid (prototype L4947). Coach is omitted until it exists (backlog). Each action appears only when its feature exists.
  2. **This month** card (HOME-02): what's left after everything, then IN / OUT / UNPAID, a paid-versus-pending bar and month chips (L127–158). It uses the same monthly figures as Activity's summary, with no new maths.
  3. **Coming up** (HOME-03): upcoming and overdue items, each with a Pay button (Mark paid), and the empty line "Nothing outstanding in {month}." (L160–188).
  4. **Accounts** summary card (HOME-04): accounts with balances, tapping through to the account detail (L112–125).
- **D-31:** **Not on Home in this phase:** the net-worth hero, range chips and sparkline (INS-01, Phase 7) and the health card (INS-06, Phase 7). Those slots are simply absent, not placeholders (the D-02 spirit).
- **D-32:** **Home figures use the existing Phase 2 queries and engine.** Integer minor units, the existing rounding, home-currency conversion with the "waiting for a rate" handling Activity uses. No new server calls or migrations.
  - **Amended at planning (2026-10-13):** "no new maths" in D-30 item 2 is relaxed. The existing `stillToCome` is a signed sum that includes pending income, so it can't supply UNPAID. A new pure function in `src/engine/activity` keeps unpaid outflows separate. It is a pure engine addition at 100% coverage, with no server change.

### Planning answers (new 2026-10-13, from the research open questions)
- **D-33:** **Editing an existing entry: closing with changes asks "Discard changes?"** (D-26). This applies only when something was changed. A new entry keeps the saved-draft behaviour. The entry draft format moves to version 2 with a form snapshot, and version 1 drafts must still parse.
- **D-34:** **Projected recurring bills count in UNPAID and Coming up, with no Pay button.** They add to UNPAID and appear in Coming up, and tapping one opens its detail. Pay (Mark paid) appears only on recorded rows.
- **D-35:** **Activity's Unpaid filter becomes "bills out only".** It shows outflows still due plus projected bills, so that "Pay bills" and "See all" match Home's UNPAID figure. Pending income is excluded.
- **D-36:** **Pending transfers are excluded from UNPAID, Coming up and the Unpaid filter.**
- **D-37:** **Dropdown menus get the same ink-at-38% backdrop as sheets** (D-23). This is a small visible change in the 4 places that use them.
- **D-38:** **After the first account is created, setup lands on Home.** The first-account redirect moves up from `app/(app)/activity.tsx` to the shared layout. YouScreen's "Activity" row gets its own Activity link instead of `APP_HOME_HREF`.

### Accessibility and text scaling
- **D-19:** **Text scaling (DSG-07):**
  - Body text and labels scale up to **200%** of the OS setting (the WCAG 1.4.4 target). Layouts wrap and grow, never clip.
  - **Large display figures** (net worth at 42px, the health score at 32px) and **tab labels** cap at about **1.3×** so the design survives.
  - Test at the largest iOS and Android accessibility sizes.
- **D-20:** **Screen-reader focus (NAV-06):**
  - On a tab change or a push, focus moves to the new screen's title.
  - Sheets hold focus while open and announce their title. With stacked sheets, the top one holds focus (D-28).
  - Toasts are announced politely without taking focus, including over a sheet (D-16). Phase 2 D-31 already stops toasts auto-dismissing under a screen reader.
  - Tab buttons expose the selected state and their position, for example "Decide, tab, 3 of 5".
- **D-21:** **Reduced motion applies to every shell animation.** That means the tab slides (`fw-slideL`/`fw-slideR`), push-in (`fw-push`), sheet rise (`fw-up`), the backdrop fade, the drag slide-out, the floating button's rise (`fw-rise`) and its lift. All go through the existing `src/theme/motion.ts` (`useReduceMotion`, `duration()`).

### Claude's Discretion
- How the unified history (D-05) is built on Expo Router: for example, a history store beside JS `Tabs` with a custom `tabBar` and per-tab stacks. It must meet D-05 to D-08 and D-22 on both platforms, and keep SwipeBack (D-07).
- The per-screen registration API for the floating button (D-09), and the shared Sheet interface's shape for "dirty" reporting (D-26) and stacking (D-28).
- How the drag-to-dismiss gesture is composed with the body ScrollView and SwipeRow (D-12a). Reanimated 4 and gesture-handler are already installed.
- How the toast host reaches the top-most native window (D-16).
- Exact timings and easings not fixed above. Use the prototype's unless research finds a platform reason to differ.
- The floating button's lift distance and animation (D-16).
- The Home cards' internal layout details, within the prototype and the §2 tokens.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prototype (the visual specification)
- `FincWin United.dc.html` lines 1855–1878: the tab bar markup with the five bespoke SVG glyphs, label styling, blur and border.
- `FincWin United.dc.html` lines 1879–1888: the floating button markup (accent pill, 50px, plus glyph, label).
- `FincWin United.dc.html` lines 2117–2125: the sheet backdrop (`rgba(20,21,15,.38)`, 0.18s fade-in), the sheet (`fw-up`, radius 28), the drag handle (38×4 `#E2DED2`) and Cancel.
- `FincWin United.dc.html` lines 6481–6494: drag-to-dismiss (1:1 follow, 92px threshold, 0.24s slide-out and snap-back).
- `FincWin United.dc.html` lines 6999–7003: `dismissTop` (closes the top layer first).
- `FincWin United.dc.html` lines 2794–2800: toast markup and position (z95, above sheets).
- `FincWin United.dc.html` lines 1994: the detail push (`fw-push`, `inset:0; z-index:70`, covers the tab bar).
- `FincWin United.dc.html` lines 53–191: Home (header, quick actions L86–93, Accounts L112–125, This month L127–158, Coming up L160–188).
- `FincWin United.dc.html` lines 4875–4881: `TABS`, `go`, `goBack` (always `dir:-1`), `hist` (8-deep, tab-only; widened per D-05), `tabAnim`.
- `FincWin United.dc.html` lines 4945–4950: Home quick actions, including Pay bills → Activity filtered to Unpaid (L4947).
- `FincWin United.dc.html` lines 6846–6853, 6997–6998: pull-to-refresh and its completion toasts.
- `FincWin United.dc.html` lines 6858–6867: the floating button per-tab table and the `fabShow` rule.
- `FincWin United.dc.html` lines 20–31: the `@keyframes` for the seven named animations and the reduced-motion collapse.

### Brief and requirements
- `BUILD-PROMPT.md` §2 (tokens, type scale, radii, card and floating-button shadows, tab bar spec, seven animations, easing, focus ring) and §5 (Shell & navigation row).
- `.planning/REQUIREMENTS.md`: NAV-01…NAV-06, DSG-07, HOME-01…HOME-04; DSG-01 (screenshot parity, see the D-01 deviation).
- `.planning/ROADMAP.md`: Phase 3 success criteria.
- `CLAUDE.md` Technology Stack: Reanimated 4.5 plus `react-native-worklets`, JS `Tabs` with a custom `tabBar` (not `unstable-native-tabs`), the `expo-haptics` async-only API. The `@gorhom/bottom-sheet` line is amended by D-12.

### Prior decisions
- `.planning/phases/02-record/02-CONTEXT.md` line 164: Record builds its screens as plain routes or sheets for the shell to wrap. D-31 sets toast timings and screen-reader behaviour. D-32 puts the History screen on You.
- `.planning/phases/02.3-record-follow-ups-from-the-02-2-walkthrough-inserted/02.3-UI-SPEC.md` lines 203, 219, 353: the entry list's swipe-remove with Undo, draft-on-close and "Discard list?" on Cancel.
- `.planning/quick/261010-kpe-amount-keypad-returns-after-text-fields-/`: Android edge swipe-back on inner screens (D-07).
- `.planning/quick/261013-izi-transfer-received-amount-prefill-and-she/` and `.planning/quick/261013-kf4-local-undo-toast-for-removing-an-entry-l/`: the current backdrop (replaced by D-23) and the toast's local `onUndo` (kept by D-16).
- `.planning/debug/resolved/sheet-swipe-android.md`: why each Sheet has its own `GestureHandlerRootView`.
- `docs/acceptance/phase-02.3-record-follow-ups.md`: the 02.3 walkthrough fixes that touch sheets.
- `.planning/phases/01-money-core/01-CONTEXT.md` D-14: `useSyncStatus()` and the status line.
- `.planning/phases/00-foundation/00-CONTEXT.md` D-13: the You screen contents.
- `.planning/research/LAUNCH-POSITIONING.md` §1–2: why Decide takes the centre tab.

</canonical_refs>

<code_context>
## Existing Code Insights (as of main 2956c45)

### Reusable Assets
- `src/ui/Sheet.tsx`: the engine D-12 keeps. It has an RN Modal with its own `GestureHandlerRootView`, the backdrop Pressable, a fixed backdrop with an RN Animated slide-in, `SheetScroll`, and the SDK 57 Android keyboard handling. Tests: `Sheet.gestureRoot`, `Sheet.keyboard`, `Sheet.scrim`.
- `src/ui/ConfirmSheet.tsx` (with `onDismiss`), `src/ui/DetailSheet.tsx`, `src/ui/SwipeRow.tsx` (with `activateLabel`), `src/ui/Dropdown.tsx` (its own Modal), `src/ui/Keypad.tsx`.
- `src/state/undoToast.ts` and `src/features/record/history/UndoToastHost.tsx`: the toast, with `stepId` replay and the local `onUndo`.
- `src/features/record/entry/useEntryDraft.ts`: the device draft that D-25 extends from the list to the form.
- `src/ui/haptics.ts`: the haptics wrapper (D-18).
- `src/features/auth/appHome.ts`: `APP_HOME_HREF` (currently `'/activity'`), which moves to Home in this phase. `ConsentScreen.tsx` also uses it.
- `src/theme/motion.ts`: `useReduceMotion()` and `duration()` (D-21).
- `src/ui/Screen.tsx`: the screen wrapper (safe areas), to extend with the D-14 header.
- `src/ui/SyncStatusLine.tsx`, `src/ui/syncStatusLabel.ts`, `useSyncStatus()`: the D-15 line.
- Activity's monthly summary and "Still to come" logic (`useActivityViewModel`, Mark paid) and the account balances: the source for Home's cards (D-32).

### Established Patterns
- Expo Router file-based routes under `app/(app)` and `app/(auth)`. `app/(app)/_layout.tsx` wraps inner screens in SwipeBack through `screenLayout` (D-07).
- Theme context with live accent and font switching.
- The typed i18n catalogue: all shell, Home and toast copy goes in it, in the declarative voice.

### Integration Points
- Installed: `react-native-reanimated` 4.5.1, `react-native-gesture-handler`, `react-native-svg`, `react-native-screens`, `react-native-safe-area-context`, `react-native-worklets` 0.10.1, `expo-haptics` ~57.0.3.
- `@gorhom/bottom-sheet` is **not** installed and is not needed (D-12). `expo-blur` is still needed for the tab bar (03-08).
- About 35 sheet call sites in about 28 files, plus Dropdown. Phases 5, 6 and 7 switch their tabs on (D-02) and register floating-button actions (D-09).

</code_context>

<specifics>
## Specific Ideas

- The Decide glyph (the diamond with a check, html ~1872) moves to the centre slot unchanged.
- The prototype's back chevron is a 36px circular button. Keep it as the compact header's back affordance (D-14).
- Home's empty line for Coming up is "Nothing outstanding in {month}." (prototype).

</specifics>

<deferred>
## Deferred Ideas

- The app-switcher privacy snapshot (DSG-08) is not in this phase. It pairs naturally with Phase 10's lock screen and biometrics.
- Feature haptics (verdict, cap breach, commit) belong to Phases 5, 2 and 8.
- The following are in the prototype but unassigned. They were captured to the roadmap backlog on 2026-10-13, not this phase:
  - split one transaction across categories (prototype L2149–2151, L2572)
  - receipt photo on a transaction (receipt sheet L2747)
  - envelope rollover of unspent caps (L5359)
  - Coach (L2357, L5321)
  - custom payment and account types (L2932, L5930)
- Moving individual sheets to `@gorhom/bottom-sheet` is allowed later behind the shared interface (D-12), only where snap points or long nested scrolling are needed.

</deferred>

<plan_impact>
## Plan impact (for the re-plan)

The 2026-09-26 plans predate this update. The review on 2026-10-13 found:
- **Rewrite** around D-12 (no @gorhom migration), D-12a/b, D-16, D-23…D-29:
  - **03-09:** sheet infrastructure.
  - **03-16:** re-hosting and the discard guard. The `dirty` guard is replaced by D-25…D-27; keep the gesture root and the existing Sheet tests.
- **Revise:**
  - **03-01:** drop the `@gorhom/bottom-sheet` and `expo-haptics` installs and the second haptics wrapper; keep expo-blur and predictive back off.
  - **03-13:** the navigator must keep SwipeBack and the `screenLayout` (D-07). Home becomes the landing route via `APP_HOME_HREF`. Toast host placement follows D-16.
- **Lighter edits:**
  - **03-02:** details cover the tab bar (D-22).
  - **03-05:** the text migration is 68 files, not 12.
  - **03-06:** sheet stack and top-only dismissal (D-29).
  - **03-12:** the quick menu absorbs Activity's Add sheet (D-11).
  - **03-14:** deviation rows for D-01, D-12 and D-23.
  - **03-15:** Activity facts (the avatar replaces the "You" menu item).
- **New plans:** Home content (D-30…D-32, HOME-01…04) and the refresh completion toast (D-17).
- **Docs:**
  - UI-SPEC line 112 (backdrop) and line 222.
  - The ROADMAP Phase 3 success criteria: the sheet count ("~14" is now about 35) and Home added.
  - The CLAUDE.md stack line (D-12).

</plan_impact>

---

*Phase: 03-shell*
*Context gathered: 2026-09-26 · updated 2026-10-13*
