# Phase 3: Shell - Research

**Researched:** 2026-09-26
**Updated:** 2026-10-13 (targeted re-plan after the 2026-10-13 CONTEXT and UI-SPEC revisions, against branch `docs/03-context-update` at 3512f78, which carries main 2956c45 and Phases 2, 2.1, 2.2 and 2.3)
**Domain:** React Native / Expo Router navigation chrome: custom tab bar, unified back history, the app's own bottom Sheet (drag, backdrop, stacking, dismissal), FAB, toasts over sheets, pull-to-refresh, accessibility, and the Home tab's first content
**Confidence:** MEDIUM-HIGH. Installed versions and the current code were read directly in this session. The drag-in-Modal gesture composition is assembled from documented gesture-handler and Reanimated primitives, not one official recipe, and needs an on-device check.

---

## Update 2026-10-13: what changed and what still holds

**Read this first. Where this file and an older plan disagree, this file, `03-CONTEXT.md` and `03-UI-SPEC.md` win.**

| Area | 2026-09-26 research said | Now (2026-10-13) |
|---|---|---|
| Sheet engine | Install `@gorhom/bottom-sheet` 5.2.14; build `src/shell/sheet/SheetContainer.tsx` over `BottomSheetModal`; dismiss-then-re-present guard | **SUPERSEDED (D-12).** No `@gorhom`. Extend `src/ui/Sheet.tsx` (RN `Modal` + own `GestureHandlerRootView` + Android keyboard padding). Add drag with RNGH `Gesture.Pan` (v2 builder API) driving a Reanimated shared value. Drag past 92px slides out; otherwise snap back (D-12a/b). |
| Backdrop | (UI-SPEC then) ink at 38-40% | `colors.ink` at opacity 0.38 on an animated view. Fades in over 180ms. `colors.scrim` is removed (D-23). |
| Discard guard | D-13: drag on a dirty sheet snaps back and asks | **SUPERSEDED.** D-25: the entry sheet keeps a device draft and never asks. D-26: other edit sheets ask "Discard changes?" on drag, back or backdrop. D-27: Cancel never asks, except "Discard list?". |
| Android back with a sheet open | `BackHandler` checks a sheet registry first | **SUPERSEDED.** While an RN `Modal` is open, `BackHandler` does not fire. The top Modal's `onRequestClose` gets the press, so a nested Modal gives top-only dismissal (D-29) for free. `BackHandler` covers D-06 steps 2-4 only. |
| Toast layer | One host in the app layer | The host renders inside the **top sheet's Modal** while a sheet is open, otherwise in the app layer (D-16). The timer must survive re-homing. |
| Tab bar over details | Per-tab nested stacks (03-13), tab bar visible over details | **SUPERSEDED (D-22).** Details live in the outer `(app)` Stack, above the `(tabs)` group, so they cover the tab bar. Record's routes are already there. |
| SwipeBack | Not covered | Must be carried forward (D-07). `screenLayout` wraps outer-Stack screens. The exclusion set must swap `'activity'` for `'(tabs)'`. |
| `expo-haptics` install | Install it | **SUPERSEDED.** `~57.0.3` is already installed and mocked in `jest.setup.ts`. Use `src/ui/haptics.ts` and add `hapticMedium` there. |
| Text migration | 12 files | **69 non-test files** import `Text` from `react-native` today, plus 11 test files. 11 non-test files import `TextInput`. Method below. |
| Home | Out of scope | **New:** HOME-01..04 (D-30..D-32). Data hooks exist. Three behaviour gaps are listed below: the sign of `stillToCome`, the Unpaid filter, and the shared month. |
| Pull-to-refresh | Native `RefreshControl` | Still holds. Greenfield: no `RefreshControl` exists anywhere today. Adds a completion toast whose "nothing new" check uses TanStack structural sharing (D-17). |
| `Tabs` import | `expo-router` | Use **`expo-router/js-tabs`**. The `Tabs` export from `expo-router` is `@deprecated` in 57.0.22. |

**Still holds unchanged** (not re-researched): the D-01 order and glyphs, the directional slide index rule (except that back steps are always reverse, D-05 revised), the pure `backHistoryReducer` design, the FAB registration context and `shouldHideFab`, the D-14 JS header, the D-15 sync line, Pitfall 1 (predictive back), Pitfall 2 (`maxFontSizeMultiplier` on Fabric), Pitfall 4 (`tabBar` cannot use `useNavigation`), Pitfall 6 (a11y focus), and the Security section.

---

<user_constraints>
## User Constraints (from CONTEXT.md, updated 2026-10-13, copied verbatim)

### Locked Decisions

Decision numbers are local to this phase. "Phase 2 D-xx" refers to `.planning/phases/02-record/02-CONTEXT.md`. Decisions marked **(revised 2026-10-13)** or **(new 2026-10-13)** override the 2026-09-26 text and every plan written before them.

#### Tabs
- **D-01:** **Tab order is Home · Activity · Decide · Grow · Insights.** Decide sits in the centre slot, the most prominent and easiest to reach with a thumb. The store name is "FincWin: Can I Afford It?" (`research/LAUNCH-POSITIONING.md`), so the promise is one tap from anywhere.
  - This is a **deliberate deviation** from the prototype, which orders them Home · Activity · Grow · Decide · Insights.
  - Record the deviation where DSG-01's screenshot parity is checked, so the tab bar isn't flagged as a regression.
  - The glyphs themselves stay exactly as in the prototype.
- **D-02:** **A tab whose phase hasn't shipped is hidden, not shown as a placeholder.** The tab bar renders from a list of available tabs, and each feature phase switches its own tab on as it lands (Decide in 5, Grow in 6, Insights in 7). The slide direction (D-01 order) and the back history must work for any subset of tabs. Home and Activity are available from this phase.
- **D-03:** **Levels never hide a whole tab.** Phase 9 gates features inside screens. Decide is always present. The available-tabs mechanism from D-02 is for build rollout, not for tiers.
- **D-04:** **You stays off the tab bar.** It is a pushed screen opened from the avatar at the top right of **each tab's root header**, not only Home as in the prototype. Activity's current "You" menu item (`ActivityScreen.tsx`) gives way to that avatar.

#### Back behaviour
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

#### Floating action button
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

#### Sheets
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

#### Backdrop and motion
- **D-23 (new 2026-10-13):** **The backdrop is the prototype's ink at 38%: `rgba(20,21,15,.38)`** (html L2119). It is the palette's own ink colour at partial opacity, so the `colors.scrim` black token added on 2026-10-13 (quick 261013-izi) is replaced and the palette is strictly §2 again. One value is used everywhere: sheets, pickers, confirm sheets, the FAB quick menu. A sheet over another sheet adds its own layer, so depth reads as a little darker (D-28). This replaces the planned "ink at 40%" (03-09, 03-14, UI-SPEC line 112).
- **D-24 (new 2026-10-13):** **Motion:**
  - **Open:** the backdrop **fades in over 0.18s** while the sheet rises from below (`fw-up`, 0.26s `cubic-bezier(.2,.8,.3,1)`, html L2123). The backdrop stays fixed in place; only the sheet moves.
  - **Close:** as in the prototype. Cancel, Save and backdrop taps close **instantly**. A drag past the threshold **slides the sheet away** (D-12b) and the backdrop goes with it.
  - All of it goes through `src/theme/motion.ts` (D-21).

#### Dismissing with unsaved work
- **D-25 (new 2026-10-13, replaces D-13):** **Entry sheet, accidental dismissal keeps a draft.** A swipe-down or Android back on the entry sheet never asks and never loses input.
  - The single form (amount, description, pickers) and the bulk list are both kept in the device draft (`useEntryDraft`, extended from the list to the form).
  - The next Add offers to continue it, as the list draft does today (02.3-UI-SPEC line 219).
  - One draft covers the form and the list.
- **D-26 (new 2026-10-13):** **Other edit sheets ask "Discard changes?"** This covers account, category, rule, filters and other short forms. A swipe-down or Android back with unsaved changes stops and asks (Keep editing / Discard). An untouched sheet closes at once. Each sheet reports "dirty" through the shared Sheet interface (D-12).
- **D-27 (new 2026-10-13):** **Cancel is deliberate.** Tapping Cancel closes without asking. The one exception is the 02.3 rule: Cancel on the entry sheet with list entries asks "Discard list?" first.

#### Layering
- **D-28 (new 2026-10-13):** **Sheets stack on top and return on close.** A sheet opened from another sheet (a confirm over the entry sheet, sheets inside import's extras detail) slides over it, with the first dimmed underneath (its own backdrop layer, D-23). Closing it shows the first sheet unchanged. Picker hand-offs that already close-then-open (picker → Add account, `TransactionSheet` next-frame hand-off) keep that behaviour.
- **D-29 (new 2026-10-13):** **Android back and drag close only the top sheet**, one at a time, as the prototype's `dismissTop` does (html L6999). D-25…D-27 apply to whichever sheet closes.
- **D-16 (revised 2026-10-13):** **Toasts draw above open sheets**, as in the prototype (toast z95 over sheets z90/92, html L2794–2800). Undo, "Rule added" and "Removed · name" stay visible and tappable without closing the sheet. Because each Sheet is its own native window, the toast host must render in the top-most layer: inside the top sheet's window while one is open, otherwise in the app layer.
  - The floating button still lifts above the Undo toast while a toast shows, then settles back (the FAB is hidden while sheets are open, D-10).
  - The toast keeps the prototype's position just above the tab bar (html 2794) and Phase 2 D-31's timings.
  - The local `onUndo` added in quick 261013-kf4 must keep working.

#### Header, status and feedback
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

#### Home (new 2026-10-13)
- **D-30:** **Home becomes the landing tab, with real content from Phase 2 data.** It follows the prototype's Home (html L53–191) in this order, under the D-14 header (date eyebrow, title, avatar):
  1. **Quick actions** (HOME-01): Add · Pay bills · Import. "Pay bills" opens Activity filtered to Unpaid (prototype L4947). Coach is omitted until it exists (backlog). Each action appears only when its feature exists.
  2. **This month** card (HOME-02): what's left after everything, then IN / OUT / UNPAID, a paid-versus-pending bar and month chips (L127–158). It uses the same monthly figures as Activity's summary, with no new maths.
  3. **Coming up** (HOME-03): upcoming and overdue items, each with a Pay button (Mark paid), and the empty line "Nothing outstanding in {month}." (L160–188).
  4. **Accounts** summary card (HOME-04): accounts with balances, tapping through to the account detail (L112–125).
- **D-31:** **Not on Home in this phase:** the net-worth hero, range chips and sparkline (INS-01, Phase 7) and the health card (INS-06, Phase 7). Those slots are simply absent, not placeholders (the D-02 spirit).
- **D-32:** **Home figures use the existing Phase 2 queries and engine.** Integer minor units, the existing rounding, home-currency conversion with the "waiting for a rate" handling Activity uses. No new server calls or migrations.

#### Accessibility and text scaling
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

### Deferred Ideas (OUT OF SCOPE)
- The app-switcher privacy snapshot (DSG-08) is not in this phase. It pairs naturally with Phase 10's lock screen and biometrics.
- Feature haptics (verdict, cap breach, commit) belong to Phases 5, 2 and 8.
- The following are in the prototype but unassigned. They were captured to the roadmap backlog on 2026-10-13, not this phase:
  - split one transaction across categories (prototype L2149–2151, L2572)
  - receipt photo on a transaction (receipt sheet L2747)
  - envelope rollover of unspent caps (L5359)
  - Coach (L2357, L5321)
  - custom payment and account types (L2932, L5930)
- Moving individual sheets to `@gorhom/bottom-sheet` is allowed later behind the shared interface (D-12), only where snap points or long nested scrolling are needed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | User can move between five tabs, with the direction of the slide matching the direction of travel | Pattern 2 (custom `tabBar`, `expo-router/js-tabs`). Directional slide by D-01 index going forward; always reverse on a back step (D-05). The built-in `sceneStyleInterpolator` progress is index-based, so it cannot express "back is always reverse": drive direction from shell state. |
| NAV-02 | User can go back through up to 8 previous screens, across tabs and detail screens | Pattern 3 (pure `backHistoryReducer`, unchanged). Updated: with D-22, details sit in the outer Stack and can only be left by back or programmatic navigation, so detail entries are almost always on top. `BackHandler` handles steps 2-4 only (Pattern 8). |
| NAV-03 | Detail screens push in over the current screen and dismiss back to it | Pattern 1 (outer Stack, reinstated for D-22). Record's routes already live there. SwipeBack `screenLayout` carried forward (Pattern 9). |
| NAV-04 | Bottom sheets can be dismissed by dragging them down | Patterns 4-7: own-Sheet drag (RNGH v2 `Gesture.Pan` + Reanimated), scroll composition, backdrop, stacking, dismissal rules, keyboard, reduced motion. Test approach in Validation Architecture. |
| NAV-05 | The FAB changes its action to match the current tab, and hides during sheets, bulk select, onboarding and step flows | Pattern on the FAB registration context (unchanged). "Sheet open" now reads the `sheetStack` store (Pattern 6). |
| NAV-06 | The app is navigable and readable with a screen reader on both platforms | Pitfall 6 (unchanged). New: the sheet's escape action and toasts inside the top Modal (Pattern 6). |
| DSG-07 | Text scales with the OS text-size setting up to a defined maximum without breaking layouts | Text-migration count verified at **69 non-test files** plus 11 `TextInput` files (Text migration inventory). |
| HOME-01 | Quick actions (Add, Pay bills, Import); Pay bills opens Activity filtered to unpaid items | Home data map. **Gap:** `unpaidOnly` keeps pending income, and filtering drops projections (`useActivityViewModel.ts:261`). The month and filter must be shared through a store, because the tab keeps Activity mounted. |
| HOME-02 | This month card: left after everything, in, out, unpaid, paid-versus-pending bar | **Verified:** `MonthTotals.stillToCome` is a signed sum of pending income and outflows. A new pure `unpaidOutflows` / `leftAfterEverything` function goes in `src/engine/activity` (a 100%-coverage folder). |
| HOME-03 | Coming up with one-tap Mark paid and an empty state | `useMonthView` rows (pending, outflow) plus projections. `useRowActions().pay` works only on real rows; projections have no Pay path today (Open Question 2). |
| HOME-04 | Accounts summary with balances, each opening its account | `useAccounts` + `useAccountBalances` + the existing `AccountBalanceBlock` (compact), as in `AccountsScreen.tsx`. Push `/accounts/[id]` on the outer Stack, which covers the tab bar (D-22). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab bar + glyphs | Client (RN UI) | — | Presentational |
| Directional tab slide | Client (Reanimated UI thread) | — | Worklet-driven |
| 8-deep back history | Client (in-memory store/Context) | — | Navigation state; lost on restart is acceptable |
| Detail push/pop (covers tab bar) | Client (Expo Router outer Stack) | — | Native stack owns push and iOS edge swipe; SwipeBack covers Android |
| Sheet drag, backdrop, stacking, dismissal rules | Client (`src/ui/Sheet.tsx`, RNGH + Reanimated, RN `Modal`) | — | Gesture and animation, no I/O |
| Sheet stack registry + toast layer | Client (module store, `useSyncExternalStore`) | — | Same pattern as `src/state/undoToast.ts` |
| Entry form/list draft | Client device storage (AsyncStorage, `fincwin:` prefix) | Engine (pure `parseDraft`/`serialiseDraft`) | Never synced; wiped on sign-out |
| Home figures (left after everything, unpaid outflows) | Engine (`src/engine/activity`, pure, integer minor units) | Client (hooks gather inputs) | Money maths must stay in the engine (CLAUDE.md boundary) |
| Home data | API/Backend via existing TanStack queries (`useMonthView`, `useTransactionMonths`, `useAccounts`, `useAccountBalances`) | — | D-32: no new server calls |
| Pull-to-refresh | Client (`RefreshControl`) | API (refetch), write queue (`resumePausedMutations`) | Shell wires it; the data layer refetches |
| Screen-reader focus, text scaling | Client | — | Platform APIs |

## Summary

The phase is still client-only chrome plus Home content: no schema and no new server calls. The 2026-10-13 decisions remove the riskiest dependency (`@gorhom/bottom-sheet`) and replace it with a contained extension of `src/ui/Sheet.tsx`. The building blocks are installed and consistent: `react-native-gesture-handler` 2.32.0, `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1, `react-native-screens` 4.26.2, `expo-router` 57.0.22, all verified in `package-lock.json`. The codebase already has the test pattern to copy. `SwipeBack` keeps its maths in a pure module (`swipeBackGesture.ts`) and tests the gesture with `fireGestureHandler` / `getByGestureTestId` from `react-native-gesture-handler/jest-utils`. Reanimated's `setUpTests()` and RNGH's `jestSetup` are already in `jest.setup.ts`.

The most useful finding is about RN `Modal`, documented in the RN docs: while a Modal is open, `BackHandler` events are not emitted, and the hardware back press goes to the Modal's `onRequestClose`. Each Sheet is its own Modal, and stacked sheets are rendered as children of the parent sheet. So Android back already reaches only the top sheet (D-29). D-06 step 1 belongs in the Sheet's `onRequestClose` path, which applies D-25..D-27, not in a shell `BackHandler`. The same nesting answers D-16: an RN Modal's children stay in the React tree, so contexts and react-query hooks work inside it. The toast host can therefore render inside the top sheet's Modal, picked by a small sheet-stack store. Two corrections come with this. The toast's auto-dismiss timer lives in the host's effect today and must survive re-homing. And no sheet has a dirty signal yet.

Home needs three behaviour decisions the UI-SPEC flagged, now verified in code. (1) `MonthTotals.stillToCome` is a **signed** sum: pending income plus pending outflows plus projections (`engine/activity/totals.ts:70,80`). UNPAID, the pending share of the bar, and "left after everything" therefore need a new pure `unpaidOutflows` figure. (2) The `unpaidOnly` filter keeps pending rows of **both** directions (`engine/activity/filters.ts:98`), and any active filter drops projections from the list and the totals (`useActivityViewModel.ts:183-190, 261`). So "Pay bills" would land on a list that doesn't match UNPAID. (3) Activity's month and filter are `useState` inside `useActivityViewModel`. Activity stays mounted as a tab, so a route param cannot drive it, and the shared month needs a small store.

**Primary recommendation:** Keep `Sheet`'s public props and add `dirty?`, `dismissible?` and `onCancelIntent`-free semantics. Rebuild the internals on Reanimated shared values with one RNGH v2 `Gesture.Pan` on the container, made simultaneous with a `Gesture.Native()` on `SheetScroll`. Use a pure `sheetDragOutcome()` for the 92px decision. Add a `sheetStack` store that drives top-only behaviour, FAB hiding and the in-sheet toast host. Keep details in the outer `(app)` Stack (D-22) with SwipeBack's `screenLayout`. Build Home from `useMonthView` plus a new engine function, not from `useActivityViewModel`.

## Standard Stack

### Core (all installed; versions from `C:/dev/fincwin-p3/package-lock.json`)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `expo-router` | 57.0.22 | Routing; `Stack`, `expo-router/js-tabs` `Tabs`, `useScrollToTop`, `expo-router/testing-library` `renderRouter` | `[VERIFIED: installed build/exports.d.ts]` `Tabs` from `expo-router` is marked `@deprecated: Use import { Tabs } from 'expo-router/js-tabs'`. React Navigation is **vendored** inside expo-router (`build/react-navigation/*`). There is no `@react-navigation/*` package in the lockfile, so import types such as `BottomTabBarProps` from `expo-router/js-tabs`. |
| `react-native-gesture-handler` | 2.32.0 (`~2.32.0`) | Sheet drag (`Gesture.Pan`), `Gesture.Native` for the sheet scroll, SwipeRow, SwipeBack | `[VERIFIED: npm registry]` the latest is **3.3.0**, with a hook-based API (`usePanGesture`; `onStart`→`onActivate`, `onEnd`→`onDeactivate`). **Do not upgrade, and do not copy v3 examples.** SDK 57 pins ~2.32. Use the v2 builder API: `Gesture.Pan().activeOffsetY().failOffsetX().simultaneousWithExternalGesture()`. |
| `react-native-reanimated` | 4.5.1 | Sheet `translateY`, backdrop opacity, tab slide, FAB lift | `[VERIFIED: installed index.d.ts]` jest utilities `withReanimatedTimer`, `advanceAnimationByTime`, `getAnimatedStyle`, `setUpTests`. The latest is 4.7.1, which needs worklets 0.13 and RN 0.86-0.88. **Do not bump mid-phase.** |
| `react-native-worklets` | 0.10.1 | Worklet runtime | `[VERIFIED: installed]` exports `scheduleOnRN` (preferred) and `runOnJS`. Existing code uses RNGH `.runOnJS(true)` (SwipeBack). |
| `react-native-screens` | 4.26.2 | Native stack | — |
| `expo-haptics` | ~57.0.3 | D-18 | **Already installed.** Mocked in `jest.setup.ts`. Wrap through `src/ui/haptics.ts` and add `hapticMedium()` (Medium impact) for the FAB long-press. |
| `@tanstack/react-query` | ^5.103.2 | Refresh: `refetchQueries`, `resumePausedMutations`, structural sharing | `[CITED: tanstack.com/query/v5/docs/framework/react/guides/render-optimizations]` "React Query will keep the original reference if nothing changed in the data." That gives a reliable "nothing new" signal. |
| `@shopify/flash-list` | installed (Activity) | Activity list; takes `refreshControl` | No change |

### To install
| Library | Version | Purpose |
|---------|---------|---------|
| `expo-blur` | `~57.0.3` `[VERIFIED: npm registry, 57.0.3 latest SDK-57 line]` | Tab bar blur (unchanged from 2026-09-26) |

**Installation:**
```bash
npx expo install expo-blur
```

### SUPERSEDED (do not install)
| Was | Why removed |
|-----|-------------|
| `@gorhom/bottom-sheet@5.2.14` (+ `@gorhom/portal`) | D-12. Not installed, not used. It may be adopted later for a single sheet behind the Sheet interface. |
| `npx expo install expo-haptics` | Already installed (~57.0.3) |

## Architecture Patterns

### System Architecture Diagram

```
app/_layout.tsx  GestureHandlerRootView > SafeArea > Theme > QueryProvider > Auth > Gate > root Stack
        │
        ▼
app/(app)/_layout.tsx  OUTER Stack  (consent gate; screenLayout = SwipeBack per route)
   ├─ (tabs)            ← JS Tabs (expo-router/js-tabs), custom tabBar, FAB, quick menu
   │     ├─ index (Home)       pull-to-refresh → refetch + resumePausedMutations → toast
   │     ├─ activity           (moved from app/(app)/activity.tsx; first-account gate moves up)
   │     └─ decide|grow|insights   href:null until Phases 5/6/7
   ├─ accounts/index, accounts/[id], categories, category-rules, history, import,
   │  setup/*, you, consent     ← details: push OVER the tab bar (D-22), iOS edge swipe,
   │                              Android SwipeBack; tab group itself excluded
   └─ app-layer overlays: SampleBanner, UndoToastHost (renders only when sheetStack empty)

Back press (Android):
   Modal open? ──yes──► top Modal.onRequestClose → Sheet.requestDismiss('back')
       │                    dismissible=false → ignore
       │                    dirty → stacked "Discard changes?" ConfirmSheet
       │                    else → onDismiss (entry sheet: draft already written)
       no
       ▼
   BackHandler (app layout): history.pop → router.back() | tab switch (reverse slide)
       → empty & not Home → Home → empty & Home → return false (exit)

Sheet (each one is its own RN Modal = native window):
   Modal(transparent, animationType none, onRequestClose)
    └ GestureHandlerRootView
       ├ Backdrop  Animated.View bg=colors.ink, opacity 0→0.38 (180ms) + Pressable "Close"
       ├ KeyboardAvoidingView (iOS padding)
       │   └ GestureDetector(pan)  Animated.View container translateY (0.26s rise)
       │        ├ Handle (44px hit, 38×4 line2 bar)
       │        ├ children: SheetHeader, SheetScroll (Gesture.Native, scrollY shared value), …
       │        └ nested child Sheets/ConfirmSheets (stack on top, own backdrop)
       └ ToastLayer (UndoToastHost) — only when this sheet is top of sheetStack
```

### Recommended Project Structure (delta from 2026-09-26)
```
src/
├── ui/
│   ├── Sheet.tsx                 # EXTEND in place: drag, backdrop fade, handle, stack reg, dirty, toast layer
│   ├── sheetDrag.ts              # NEW pure: SHEET_DISMISS_DISTANCE=92, outcome(dy, vy) (mirrors swipeBackGesture.ts)
│   └── haptics.ts                # add hapticMedium()
├── state/
│   ├── sheetStack.ts             # NEW module store: push/remove/top/size, useSheetStack(), wipe handler
│   ├── undoToast.ts              # add shownAt so a re-homed host resumes the remaining time
│   └── activityFocus.ts          # NEW: shared selected month + one-shot filter intent (Home ↔ Activity)
├── engine/activity/
│   └── monthFigures.ts           # NEW pure: unpaidOutflows, leftAfterEverything, paid/pending shares (100% folder)
├── engine/entryList/draft.ts     # v2: optional form snapshot, v1 still parses
├── features/home/                # NEW: HomeScreen, QuickActions, ThisMonthCard, ComingUpCard, AccountsCard
└── shell/                        # as 2026-09-26 (backHistory, tabBar, fab, header, a11yFocus)
    ├── refresh/useShellRefresh.ts  # NEW: refetch + resume + changed? → toast
    └── (no shell/sheet/ folder: SUPERSEDED)
app/(app)/
├── _layout.tsx                   # outer Stack + SwipeBack screenLayout + providers + BackHandler
└── (tabs)/
    ├── _layout.tsx               # Tabs from 'expo-router/js-tabs', tabBar, FAB, first-account gate
    ├── index.tsx                 # Home
    └── activity.tsx              # moved from app/(app)/activity.tsx
```
**Per-tab nested stacks (03-13 `(tabs)/<id>/_layout.tsx`) are SUPERSEDED by D-22.** A detail inside a tab's stack renders inside the tab scene, so the tab bar would stay visible. To hide it you would need `tabBarStyle: { display: 'none' }` toggled per route, which makes the bar vanish instead of being covered. Keep detail routes as outer-Stack siblings of `(tabs)`, which is also where Record's routes already are.

### Pattern 1: Outer Stack for detail screens (NAV-03, D-07, D-22). Reinstated.
Detail routes are siblings of `(tabs)` in `app/(app)/_layout.tsx`. A push covers the whole tabs screen, tab bar and FAB included, so D-22 and part of D-10 come for free. `[CITED: docs.expo.dev/router/basics/common-navigation-patterns]`. A consequence: while a detail is open the tab bar can't be tapped. D-08's "first re-tap pops to root" therefore never happens from the bar; the re-tap only scrolls to top (`useScrollToTop`, exported by expo-router 57). Keep the pop branch for the programmatic case.

### Pattern 2: Custom `tabBar` + directional slide (NAV-01). Unchanged, with two corrections.
- Import `import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs'` `[VERIFIED: installed js-tabs.d.ts re-exports build/layouts/Tabs and react-navigation/bottom-tabs types]`.
- The built-in `animation: 'shift'` / `sceneStyleInterpolator` takes `current.progress` of -1/0/1 **by tab index** `[VERIFIED: installed bottom-tabs/types.d.ts]`. It can't express D-05's "a back step is always reverse". Keep the slide in the shell: a direction value written by the tab-switch function (forward = D-01 comparison, back = reverse of the step being undone), read by each root's `SlideIn`.

### Pattern 3: Unified back history (NAV-02). Unchanged reducer.
The pure `backHistoryReducer` (8-cap ring) stands. With D-22, a detail can only be left by back (which pops its entry) or by programmatic navigation (for example You → "Activity" row, `router.dismissTo`). Re-pushing a popped detail is needed only in the second case. Keep the general reducer and record the detail's href so `router.push(href)` can restore it.

### Pattern 4: Own-Sheet drag-to-dismiss (NAV-04, D-12a/b). NEW.
**What:** one `Gesture.Pan` on the sheet container drives a Reanimated `translateY` shared value 1:1 (`dy = max(0, translationY − startDy)`). On release, a pure `sheetDragOutcome(dy, vy)` decides `'dismiss' | 'snap'`.

**Drag zone (D-12a), without needing the header to cooperate.** `SheetHeader` is a child the Sheet doesn't own, so decide by *where the touch began*. `SheetScroll` reports its layout `y` inside the container into a shared value `bodyTop` (it is a direct child of the container at every call site checked: `TransactionSheet`, `DetailSheet`, `FilterSheet` and others). In `onBegin`: `inBody = e.y >= bodyTop`.
- `!inBody` (handle, header): always drag.
- `inBody`: drag only while `scrollY.value <= 0` and moving down. If the body was scrolled when the touch began, keep updating `startDy = translationY` until `scrollY` reaches 0. Then the drag starts from that point ("does not start a sheet drag until it returns to the top").
- Sheets with no `SheetScroll` (`ConfirmSheet`, short prompts): `bodyTop` stays at `+Infinity`, so the whole sheet drags.

**Horizontal swipes win (D-12a).** `ReanimatedSwipeable` (SwipeRow) activates at `activeOffsetX([-10, 10])` with no Y fail offset `[VERIFIED: installed ReanimatedSwipeable.tsx:506, DEFAULT_DRAG_OFFSET = 10]`. Give the sheet pan `.activeOffsetY(10).failOffsetX([-10, 10])`. A mostly horizontal move fails the sheet pan and activates the row. A mostly vertical move activates the sheet pan first, and RNGH cancels the not-yet-active row pan. There are no other gestures inside sheets: the only other RNGH gesture in `src/` is SwipeBack, which lives on screens, not in Modals.

**Scroll composition.** Wrap `SheetScroll`'s ScrollView in `<GestureDetector gesture={Gesture.Native()}>` and make the container pan `.simultaneousWithExternalGesture(native)` `[VERIFIED: installed RNGH 2.32 typings: NativeGesture, simultaneousWithExternalGesture]`. Track `scrollY` with Reanimated `useAnimatedScrollHandler` on an `Animated.ScrollView`, `scrollEventThrottle={16}`. While the sheet is translated (`translateY > 0`), pin the scroll with Reanimated `scrollTo(ref, 0, 0, false)` in `onUpdate`, so the content doesn't scroll as well. Set `bounces={false}` on iOS (and `overScrollMode="never"` on Android). Without it, iOS rubber-bands the content at top while the sheet also moves.

**Release (prototype L6487-6491).** Dismiss path: `withTiming(height*1.1, {duration: DURATION.sheetDrag (240), easing: EASING})`. Then, **from JS**, `setTimeout(requestDismiss('drag'), duration(190))` via `scheduleOnRN`/`runOnJS`, as the prototype uses a 190ms timer. Snap path: `withTiming(0, {duration: 240, easing})`. Fire `hapticSelection()` on the dismiss path (D-18). Putting the dismissal on a JS timer, not inside the `withTiming` callback, keeps it deterministic in Jest under fake timers and under reduced motion (`duration()` returns 0).

**Fling (open item, D-12b).** Put it in the pure function behind constants, mirroring `swipeBackGesture.ts`: dismiss if `dy > 92`, or if `dy >= 24 && vy >= 1000` px/s. Then the on-device decision is a one-constant change. `[ASSUMED]` 1000 px/s is a starting value; tune it on the Pixel and the iPhone XR.

```typescript
// src/ui/sheetDrag.ts — pure, no RN import (pattern: src/features/navigation/swipeBackGesture.ts)
export const SHEET_DISMISS_DISTANCE = 92;   // prototype L6489
export const SHEET_FLING_MIN = 24;
export const SHEET_FLING_VELOCITY = 1000;   // [ASSUMED] tune on device; set to Infinity to disable
export function sheetDragOutcome(dy: number, vy: number): 'dismiss' | 'snap' {
  'worklet';
  if (dy > SHEET_DISMISS_DISTANCE) return 'dismiss';
  return dy >= SHEET_FLING_MIN && vy >= SHEET_FLING_VELOCITY ? 'dismiss' : 'snap';
}
```
```typescript
// inside Sheet (sketch; RNGH v2 builder API, Reanimated 4)
const pan = useMemo(() => Gesture.Pan()
  .activeOffsetY(10).failOffsetX([-10, 10])
  .simultaneousWithExternalGesture(scrollNative)
  .withTestId('sheet-drag')
  .onBegin((e) => { inBody.value = e.y >= bodyTop.value; startDy.value = 0; })
  .onUpdate((e) => {
    if (inBody.value && scrollY.value > 0) { startDy.value = e.translationY; return; }
    const dy = Math.max(0, e.translationY - startDy.value);
    translateY.value = dy;
    if (dy > 0 && inBody.value) scrollTo(scrollRef, 0, 0, false);
  })
  .onEnd((e) => {
    const dy = Math.max(0, e.translationY - startDy.value);
    if (sheetDragOutcome(dy, e.velocityY) === 'dismiss' && canDragDismiss.value) {
      translateY.value = withTiming(sheetHeight.value * 1.1, { duration: DURATION.sheetDrag, easing: EASING });
      scheduleOnRN(onDragDismiss);          // JS: haptic + setTimeout(requestDismiss('drag'), duration(190))
    } else {
      translateY.value = withTiming(0, { duration: DURATION.sheetDrag, easing: EASING });
      if (dy > SHEET_DISMISS_DISTANCE) scheduleOnRN(onBlockedDismiss); // dirty → Discard prompt
    }
  }), [/* stable shared values */]);
```
`canDragDismiss` is a shared value mirrored from `dismissible && !dirty`. If the sheet is dirty, a drag past 92 snaps back and opens the Discard prompt (D-26, UI-SPEC: "the sheet stays open (a drag snaps back)").

### Pattern 5: Open/close motion and the backdrop (D-23, D-24). NEW.
- Replace the RN `Animated.timing` 250ms slide (`Sheet.tsx:62-69`) with Reanimated. `translateY` goes from the window height to 0 with `withTiming(0, {duration: DURATION.sheetUp (260), easing: EASING})`. Backdrop `opacity` goes from 0 to `BACKDROP_OPACITY = 0.38` with `withTiming(.38, {duration: DURATION.backdrop (180), easing: Easing.ease})`. Export the constant.
- Backdrop: an `Animated.View` with `StyleSheet.absoluteFill`, `backgroundColor: colors.ink` and animated opacity. Put a transparent `Pressable` ("Close", `a11y.close`) over it, or make the Pressable the animated view. Do **not** write `rgba(` anywhere outside `tokens.ts`: `src/theme/__tests__/noRawColours.test.ts` scans `src` and `app` for `/#[0-9a-fA-F]{3,8}\b|rgba?\(/` `[VERIFIED]`.
- Remove `colors.scrim` (`tokens.ts:40`) and the "(bar the Sheet scrim)" wording in its header comment (`tokens.ts:3`). Rewrite `Sheet.scrim.test.tsx`, which asserts `colors.scrim` and a black-rgba regex today.
- **Dropdown fact:** `src/ui/Dropdown.tsx` uses its own `Modal` (`animationType` fade) with a **transparent** scrim (`styles.scrim` is only `absoluteFill`, with no colour). It never read `colors.scrim`. The UI-SPEC says Dropdown reads ink at 0.38. That would add a visible dim to the four dropdown menus (ActivityHeader, Sort, View, WeekStart), which is a visual change the planner should confirm, not a token swap.
- Instant close (Cancel, Save, backdrop) is already today's behaviour: `if (!visible) return null`. Keep it. Reset `translateY` and opacity at the start of every open, because the drag path leaves `translateY` at 110%.
- Drag close: the prototype keeps the backdrop at full strength until `dismissTop()` at 190ms, then removes both (L6490). The UI-SPEC says the backdrop "fades with it". Fade opacity to 0 over the same 190ms. Visually they are nearly the same; follow the UI-SPEC.
- Reduced motion: `<ReducedMotionConfig mode={ReduceMotion.System} />` (app/_layout.tsx) collapses the `withTiming` worklets. The JS 190ms timer must go through `useMotion().duration()`. Both end states are identical.
- Handle: the first child of the container, with a 44px-tall full-width hit area and a centred 38×4 `line2` bar of `radii.pill`. The container's `paddingTop` (22) and the handle's height both add space. Offset the handle with a negative top margin so the header doesn't move down by 44px. The prototype uses `padding:9px 0 10px; margin:-9px 0 8px` (L2124).

### Pattern 6: Sheet stack, top-only dismissal, toast layer, FAB hiding (D-16, D-28, D-29). NEW.
**Stacking already works natively.** Every stacked sheet today is rendered as a **child of the parent sheet's content**. `TransactionSheet` renders its pickers, `EditScopePrompt` and four `ConfirmSheet`s inside its own `<Sheet>` (`TransactionSheet.tsx:748-1173`). A nested RN Modal presents over its parent, and Android sends back only to the focused (top) window. Keep that rule and write it down.

> **Rule:** a sheet opened from a sheet is rendered **inside** the parent `<Sheet>`'s children, never as a sibling. On iOS a sibling Modal shown while another is presented or dismissing is dropped. That is the reason for the existing "Sibling-modal rule: close the picker first, present the AccountSheet on the next frame" (`TransactionSheet.tsx:714-717`; 02.3-RESEARCH Pattern 4).

**`src/state/sheetStack.ts`** (same shape as `undoToast.ts`: module state, `useSyncExternalStore`, `registerWipeHandler`):
- `pushSheet(id)` when a Sheet becomes visible, and `removeSheet(id)` on hide or unmount, in a `useEffect` keyed on `visible`, with `id` from `useId()`.
- `useIsTopSheet(id)`, `useSheetCount()`.
- Consumers: the Sheet renders the toast layer only when it is on top. The FAB hides when `count > 0` (D-10). The app-layer `UndoToastHost` renders only when `count === 0`.
- Open order equals push order equals visual order. The Discard dialog is itself a Sheet, so it pushes on top automatically.

**Toast over sheets (D-16).** `UndoToastHost` only uses hooks (`useToast`, `useUndo`, `useRecordContext`, `useHouseholdMemberNames`). Modal children stay in the React tree, so all of those contexts resolve inside a sheet. Render `<UndoToastHost placement="sheet" />` as the **last child of the sheet's `GestureHandlerRootView`**, **outside** the `KeyboardAvoidingView`, so it doesn't jump with the keyboard. Give it `pointerEvents="box-none"`, absolute, `bottom: insets.bottom + space.sheetPadBottom` (UI-SPEC `toast-inset`).

**Timer survives re-homing.** Today the auto-dismiss timer is a `useEffect` in the host, keyed on `toastId` (`UndoToastHost.tsx:66-72`). Moving from the sheet host to the app host (the top sheet closes) would remount it and restart 3.2s or 6s. Add `shownAt: number` to `ToastState` in `showToast()`. Each host schedules `max(0, ms − (Date.now() − shownAt))`. `toastDurationMs`'s `null` under a screen reader is unchanged. The local `onUndo` (261013-kf4) needs no change: it lives on the toast state, not the host.

**Today's bug this fixes:** the entry-list "Removed · {name}" toast (261013-kf4) is shown by the app-layer host, which sits **under** the entry sheet's Modal. On device it can't be seen while the sheet is open.

### Pattern 7: Dismissal rules and the Sheet interface (D-25, D-26, D-27). NEW.
Today's public interface is `SheetProps { visible; onDismiss; children; accessibilityLabel? }`. Cancel is wired by each caller straight to its own close (`SheetHeader onCancel`), so it already bypasses `onDismiss`. That matches D-27 with no change.

Recommended additions (backward compatible; every one of the 35 call sites keeps compiling):
```typescript
export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;          // backdrop tap, drag past threshold, Android back — the "accidental" paths
  children: ReactNode;
  accessibilityLabel?: string;
  /** D-26: when true, accidental paths stop and show "Discard changes?" (Keep editing / Discard). */
  dirty?: boolean;
  /** false while a sheet must not close (e.g. HomeCurrencyChangeSheet while `pending`). Drag snaps back. */
  dismissible?: boolean;          // default true
}
```
- `requestDismiss(source: 'backdrop' | 'drag' | 'back')`: if `!dismissible`, ignore (snap back). If `dirty`, open the internal Discard `ConfirmSheet` as a nested child (Keep editing = left/default; its backdrop and Android back count as Keep editing; Discard calls `onDismiss`). Otherwise call `onDismiss`.
- **Pitfall avoided:** `HomeCurrencyChangeSheet.tsx:58` passes `onDismiss={pending ? () => undefined : close}`. With drag, a no-op `onDismiss` would leave the sheet slid off-screen and still mounted. Migrate that pattern to `dismissible={!pending}`, and add a safety net: if `visible` is still true a frame after a drag dismissal, snap back to 0.
- **Entry sheet (D-25):** `dirty` stays false. `onDismiss` writes the draft and then closes. `useEntryList` already flushes the list draft on unmount (`useEntryList.ts:74,104`), and the form needs the same. Draft format today: `ENTRY_DRAFT_VERSION = 1`, `{ v, savedAt, items }`, parsed defensively by `engine/entryList/draft.ts` (a 100%-coverage folder). Add `v: 2` with an optional `form` snapshot of the raw `FormState` text and ids (`amountText`, `name`, `direction`, `accountId`, `toAccountId`, `currency`, `categoryId`, `localDate`, `note`, `paymentType`, `automatic`, `refund`). It must be raw, because a half-typed form often isn't a valid `ListItem` (`itemFromForm` needs a valid amount). **`parseDraft` must still accept v1.** A form-only draft counts as 1 in the resume prompt (UI-SPEC). Use `formHasContent()` (`listForm.ts:88`) to decide whether to save the form.
- **Dirty signals: none exist yet** `[VERIFIED: grep of every edit sheet]`. Each sheet holds its initial values in local state, so dirty is a cheap comparison:

| Sheet | File | Dirty = |
|---|---|---|
| Account | `record/accounts/AccountSheet.tsx` | `name`, `openingText`, `limitText`, kind/currency vs. the `account` (or empty for new) |
| Category | `record/categories/CategorySheet.tsx` | `name !== initialName` or `capText` changed |
| Rule | `record/categories/RuleSheet.tsx` | `keyword` vs. `editing?.keyword`, `categoryId !== initialCategoryId` |
| Filters | `record/activity/FilterSheet.tsx` | `draft` vs. `value` (deep-equal on the `ActivityFilter`) |
| Paste | `record/import/PasteSheet.tsx` | `text.trim() !== ''` |
| Password | `record/import/PasswordPromptSheet.tsx` | `hasText` (already tracked) |
| Repeats | `record/entry/RepeatsField.tsx` | count text vs. the incoming `value` |
| Not dirty-capable (display, picker, confirm) | pickers, `MonthSwitcher`, `RecurringReviewSheet`, `CloneMonthSheet`, `DetailSheet`, `ConfirmSheet`, `SampleClearPrompts`, `EditScopePrompt`, `RemoveCategoryPrompt` | always false |

Put a small `useIsDirty(initial, current)` (structural equality) in `src/ui/`, so each sheet adds about one line.

### Pattern 8: Android back ordering (D-06). REVISED.
`[CITED: reactnative.dev/docs/modal]` "`onRequestClose` … is called when the user taps the hardware back button on Android … `BackHandler` events will not be emitted as long as the modal is open." So:
- **Step 1 (top sheet)** is the Sheet's `onRequestClose` → `requestDismiss('back')`. No shell code is needed, and it is top-only by construction.
- **Steps 2-4** are a `BackHandler.addEventListener('hardwareBackPress')` in the `(app)` layout. It fires only when no Modal is open.
- The **Dropdown** Modal already closes itself on back (`onRequestClose={() => setOpen(false)}`).
- Keep `android.predictiveBackGestureEnabled: false` (Pitfall 1). `app.config.ts` doesn't set it today `[VERIFIED]`. How a Modal's Dialog handles the back gesture with predictive back on was not verified; disabling predictive back sidesteps the question `[ASSUMED]`.

### Pattern 9: SwipeBack and `screenLayout` carried forward (D-07). NEW.
Today `app/(app)/_layout.tsx` passes `screenLayout={({children, route}) => <SwipeBack enabled={isSwipeBackRoute(route.name)}>…}` to the outer Stack. `NO_SWIPE_BACK = {'activity','consent','setup/account','setup/history'}` (`swipeBackGesture.ts:28`). After the move:
- `activity` stops being an outer-Stack route; the tab group's route name is `'(tabs)'`. **Replace `'activity'` with `'(tabs)'`** in `NO_SWIPE_BACK`, or the whole tab group becomes edge-swipeable and a swipe on Home calls `router.back()`. Update `swipeBackGesture.test.ts`.
- SwipeBack calls `router.back()` and `router.canGoBack()`. On the outer Stack that pops the detail, which is the D-07 "pops to the origin, never switches tabs". The history store must **observe** the pop, not drive it, so a SwipeBack pop and a chevron pop stay in sync. Its header comment already expects this: "swap router.back for its BackHistory goBack".
- Android stack `animation` stays as today (`slide_from_right`, or `'none'` under reduced motion). iOS stays `'default'` with the native edge swipe.

### Pattern 10: Landing route moves to Home. NEW facts.
- `APP_HOME_HREF = '/activity'` (`src/features/auth/appHome.ts`) is used by `app/index.tsx:21`, `ConsentScreen.tsx:44` and **`YouScreen.tsx:35,90`**. YouScreen's "Activity" row uses `APP_HOME_HREF` as Activity's href (`router.dismissTo(APP_HOME_HREF)`). When the constant becomes Home, give that row an explicit `'/activity'` or it will open Home.
- Literal `'/activity'` replaces: `SetupHistoryScreen.tsx:37,43` and `app/(app)/import.tsx:18`. Group segments don't appear in URLs, so `/activity` still resolves inside `(tabs)`. Decide whether setup should land on Home now.
- **The first-account gate** (`needsFirstAccount` → `<Redirect href="/setup/account" />`) lives in `app/(app)/activity.tsx` only. Move it to `app/(app)/(tabs)/_layout.tsx`, or into both roots, or Home will render for a user with no account. Note that the UI-SPEC "Home empty (no accounts at all)" state can't be reached while the gate exists. Only the error branch (`isError`, where the gate never fires) can show it.

### Pattern 11: Home data map (HOME-01..04, D-32). NEW.
Build Home from the data hooks. **Do not mount `useActivityViewModel`**: it also loads view prefs, search, running balance, series offers and row-flow state.

| Card | Source (existing) | Notes |
|---|---|---|
| Month chips | `useTransactionMonths(householdId, today, horizonMonth)` → `months` (`data/queries/activity.ts:201`) | Same list Activity offers |
| Selected month | **New** `src/state/activityFocus.ts` store. Activity's `useState(() => initialMonth ?? monthOf(rc.today))` (`useActivityViewModel.ts:130`) reads and writes it instead. | Tabs keep Activity mounted, so a route param would not re-seed it. Wipe on sign-out. |
| IN / OUT | `useMonthView(ctx, month).totals.paidIn` / `.paidOut` | **`paidOut` is negative** (signed amounts, `totals.ts:62-64`). Format OUT as the magnitude, as `MonthTotalsBar` does. |
| UNPAID, pending share, deduction | **New pure** `unpaidOutflows(rows, projections)` in `src/engine/activity/monthFigures.ts` | `stillToCome` is signed: `+= row.amountHome` for every pending row and every projection (`totals.ts:70,80`), so it mixes pending income and outflows. The new function sums `-amountHome` over pending, non-transfer, non-skipped rows with `amountHome < 0`, plus projections with `amountHome < 0`. `null` counts go to `unconvertedCount`. 100% branch coverage is required (an `engine/activity` folder). |
| Left after everything | **New pure** `leftAfterEverything(totals, unpaidOutflows) = paidIn + paidOut − unpaidOutflows` | Integer minor units, no rounding step (sums of integers) |
| Bar shares | Pure, in the same module: `paidShare = paidOut/paidIn`, `pendingShare = unpaid/paidIn`, integer percent, clamped so the sum is at most 100, and 0 when `paidIn === 0` | Use the magnitude of `paidOut` |
| Coming up | `useMonthView(...).rows.filter(status==='pending' && transfer_id===null && amountHome<0)` + outflow `projections`, sorted by date ascending (the same order as `buildActivityItems`, `activitySections.ts:40-53`), first 4 | `row.overdue` already exists (`isOverdue`). Pay calls `useRowActions(ctx).pay(row)` (real rows only, shows the `markedPaid` toast with Undo). See Open Question 2 for projections. |
| Accounts | `useAccounts(householdId)` + `useAccountBalances(householdId, accounts)` + `AccountBalanceBlock compact` (`AccountsScreen.tsx:61-73`) | Active means `archived_at === null && deleted_at === null` |
| Unconverted note | `totals.unconvertedCount` | Same `activity.totals.unconverted` copy |

**Pay bills / See all → Activity "Unpaid".** Today `unpaidOnly` keeps every `status === 'pending'` row, income included (`filters.ts:98`). Any active filter also passes `projections: []` to the list and recomputes totals without projections (`useActivityViewModel.ts:183-190, 261`). For the landing list to match UNPAID, the planner must change one of these, both covered by engine tests:
- (recommended) `unpaidOnly` keeps **pending outflows** (`amountHome < 0` or `original_amount < 0`, non-transfer), and the view model keeps **outflow projections** when `unpaidOnly` is the only active narrowing; or
- UNPAID excludes projections, and Coming up shows real rows only.
The filter intent goes through `activityFocus` (one shot: Home sets `{month, filter: {...EMPTY_FILTER, unpaidOnly: true}}`, and Activity consumes it on focus), so the Filter chip shows as active (UI-SPEC).

### Pattern 12: Pull-to-refresh and the completion toast (D-17). NEW.
- No `RefreshControl` exists in `src/` or `app/` today `[VERIFIED: grep]`. Home is a `Screen scroll` with `ScrollView`; add a `refreshControl` prop slot to `Screen`. Activity uses `FlashList`, which accepts `refreshControl` and `onRefresh`/`refreshing` like a ScrollView.
- `useShellRefresh(keys)`:
  1. Snapshot `before = keys.map(k => queryClient.getQueryData(k))`.
  2. `await queryClient.resumePausedMutations()` (the write-queue retry; failed writes stay with the sync line).
  3. `await queryClient.refetchQueries({ queryKey: k, type: 'active' })` for each key.
  4. `changed = keys.some((k, i) => queryClient.getQueryData(k) !== before[i])`. Structural sharing keeps the old reference when nothing changed `[CITED: TanStack render-optimizations]`, and the app's `QueryClient` doesn't disable it `[VERIFIED: data/queryClient.ts]`.
  5. `showToast({ kind: 'info', text: { key: changed ? 'refresh.updated' : 'refresh.nothingNew' } })`. `kind` `'info'` gets the ordinary 3.2s timing (`toastDurationMs`). No error toast: on failure, stop the spinner and let the sync line speak.
- Home keys: `transactionsMonth(hh, month)`, `recurringSeries(hh)`, `fxLatest()`, `transactionMonths(hh)`, `accounts(hh)`, `accountBalances(hh)` (`data/keys.ts`).
- Note for the planner: in the prototype, the "Prices and balances…" versus "nothing new" choice keys off `feed.provider !== 'Manual'` (L6996-6998), not off changed data. D-17 locks "changed data" as the condition. The app has no price feed until Phase 6, so "Prices…" will read slightly broad. The copy is locked; no action is needed.

### Anti-Patterns to Avoid
- **Copying `@gorhom/bottom-sheet` patterns** (dismiss-then-re-present, `BottomSheetModalProvider`, `enablePanDownToClose`). SUPERSEDED.
- **Copying RNGH v3 examples** (`usePanGesture`, `onActivate`). The installed version is 2.32.
- **A shell `BackHandler` that checks for an open sheet.** It never fires while a Modal is open.
- **Rendering a stacked sheet as a sibling** of its parent `<Sheet>`. iOS drops it.
- **Feeding UNPAID or "left after everything" from `stillToCome`.** It is signed and mixes income.
- **Mounting `useActivityViewModel` on Home.** It is heavy, and its month state is private.
- **Putting money maths in Home components.** It belongs in `src/engine/activity` (CLAUDE.md boundary; 100% folder).
- **Writing `rgba(...)` for the backdrop.** `noRawColours` fails it.
- **Restarting the toast timer on re-home.** Use `shownAt`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll-vs-drag arbitration | A `PanResponder` or manual touch tracking | RNGH `Gesture.Native()` on the ScrollView + `simultaneousWithExternalGesture` + `activeOffsetY`/`failOffsetX` | The gesture arena, cancellation and Android native-scroll interop are already solved |
| UI-thread follow and timing | `Animated.event` / JS-thread `setValue` loops | Reanimated shared values + `withTiming` + `scrollTo` | 1:1 follow without bridge jank; reduced motion via `ReducedMotionConfig` |
| Top-only back for stacked sheets | A shell back-press router for sheets | Nested RN `Modal` + `onRequestClose` | The OS sends back to the focused window |
| Detecting "nothing new" after refresh | Deep-diffing payloads or comparing `dataUpdatedAt` | TanStack structural sharing (reference equality) | `dataUpdatedAt` changes on every successful fetch, even with identical data |
| iOS edge swipe-back | A JS pan | Native stack `gestureEnabled` | Unchanged from 2026-09-26 |
| Tab bar blur | An overlay hack | `expo-blur` `BlurView` | Unchanged |

**Key insight:** the sheet work is extending one 150-line file that already solved the Android-specific hard parts (gesture root inside a Modal, keyboard height). The risky part is gesture composition, so keep the decision maths pure (`sheetDragOutcome`) and test the wiring with `fireGestureHandler`, as SwipeBack already does.

## Runtime State Inventory

This is partly a refactor (moving the landing route and re-homing the sheet internals), so the inventory follows.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Device entry draft `fincwin:entry-draft:v1:{user}:{household}` (AsyncStorage). The key includes `v1`; the payload has `v: 1`. | Code edit: `parseDraft` accepts v1 and v2. Keep the key name, or migrate it, and say which. No server data changes. |
| Live service config | None. No server, Supabase or EAS config depends on routes or sheets (D-32: no migrations). Verified by reading the `data/` keys and mutations. | None |
| OS-registered state | Android `predictiveBackGestureEnabled` isn't set in `app.config.ts`, so the platform default applies. Deep links: the `expo-router` scheme resolves `/activity`, which still resolves after the move into `(tabs)`. | Config edit in 03-01, then a dev-client and preview rebuild. A native config change needs a new build (memory: EAS from a real-node_modules checkout). |
| Secrets/env vars | None touched | None |
| Build artifacts | The installed dev client (Pixel; preview dd80bb8d) predates `expo-blur` and the predictive-back flag | Rebuild the dev client after `expo-blur` and the `app.config.ts` change. JS-only sheet work runs on the current client. |

## Common Pitfalls

### Pitfall 1: Predictive back breaks `BackHandler` on Android 13-15. Still holds.
Set `android.predictiveBackGestureEnabled: false`. Not present in `app.config.ts` today `[VERIFIED]`. (Unchanged from 2026-09-26; see expo/expo#39092.)

### Pitfall 2: `maxFontSizeMultiplier` is unreliable on Fabric. Still holds.
03-05 scales manually from `useWindowDimensions().fontScale` in one `Text` primitive. See the text-migration inventory below.

### Pitfall 3: The slide sign convention is easy to invert. Updated.
Forward follows D-01 order. **Back is always reverse** (prototype `goBack` `dir:-1`, L4881). Enumerate both in the direction unit test.

### Pitfall 4: `tabBar` can't use `useNavigation()`. Still holds.

### Pitfall 5 (REPLACED): no-op `onDismiss` plus drag leaves a ghost sheet.
**What goes wrong:** the drag slides the sheet to 110% and then calls `onDismiss`. A caller that refuses (`HomeCurrencyChangeSheet` while pending passes `() => undefined`) leaves an invisible, still-mounted Modal that blocks touches.
**How to avoid:** use `dismissible={false}` so the drag snaps back, plus a post-dismiss check: if `visible` is still true a frame later, animate back to 0.
*(The 2026-09-26 Pitfall 5 about `@gorhom` dismiss-then-confirm is SUPERSEDED.)*

### Pitfall 6: Accessibility focus on navigate. Still holds.
Plus the new sheet items. iOS `onAccessibilityEscape` on the sheet container calls `requestDismiss('back')`. Android `accessibilityActions={[{ name: 'dismiss', label: t('a11y.close') }]}` with `onAccessibilityAction` does the same. A nested Modal is its own window or view controller, so only the top sheet is focusable.

### Pitfall 7: iOS ScrollView bounce fights the sheet drag. NEW.
**What goes wrong:** pulling down at the top of `SheetScroll` rubber-bands the content and translates the sheet at the same time.
**How to avoid:** `bounces={false}` on `SheetScroll` (iOS), plus a `scrollTo(0)` pin while `translateY > 0`.
**Warning sign:** content jitters or double-moves on the iPhone XR only.

### Pitfall 8: The drag zone misreads where the touch began. NEW.
`bodyTop` must be measured relative to the animated container. `SheetScroll`'s `onLayout` gives `y` relative to its parent, which is the container at every current call site. A future sheet that wraps `SheetScroll` in another View would break the header-versus-body test. Document it on `SheetScroll`, or measure with `measure()` in a worklet.

### Pitfall 9: The toast timer restarts when the top sheet closes. NEW.
See Pattern 6. Test by showing a toast in a sheet, advancing 2s, closing the sheet, then advancing 1.3s: the toast must be gone.

### Pitfall 10: Moving Activity into `(tabs)` drops the first-account gate and changes the YouScreen row. NEW.
See Pattern 10. Both regressions are silent.

### Pitfall 11: The SwipeBack exclusion still names `'activity'`. NEW.
After the move, the `(tabs)` group would be edge-swipeable on Android. See Pattern 9.

### Pitfall 12: Draft format change loses users' saved lists. NEW.
Bumping `ENTRY_DRAFT_VERSION` without keeping v1 parsing silently discards an existing list draft (`parseDraft` returns `[]` on a version mismatch, `draft.ts:100`). Add a v1 fixture test.

### Pitfall 13: `jest.config.js` roots exclude `app/`. NEW, minor.
`roots: ['<rootDir>/src', '<rootDir>/supabase/functions']`. Route-level tests must live under `src/` (for example `src/shell/__tests__/shellNavigation.test.tsx`, using `renderRouter` with inline mock routes), not next to the `app/` files.

## Code Examples

### Gesture test (existing project pattern, `src/features/navigation/__tests__/SwipeBack.test.tsx`)
```typescript
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

function drag(dy: number, velocityY = 0) {
  fireGestureHandler(getByGestureTestId('sheet-drag'), [
    { state: State.BEGAN, y: 10, translationY: 0 },          // y < bodyTop → header/handle
    { state: State.ACTIVE, y: 10 + dy / 2, translationY: dy / 2 },
    { state: State.END, y: 10 + dy, translationY: dy, velocityY },
  ]);
}
// jest.useFakeTimers(); render <Sheet visible onDismiss={spy}>; drag(120);
// act(() => jest.advanceTimersByTime(250)); expect(spy).toHaveBeenCalledTimes(1);
// drag(60) → advance → expect(spy).not.toHaveBeenCalled();
// <Sheet dirty> drag(120) → expect(screen.getByText('Discard changes?')).toBeTruthy(); spy not called
```
Requires the pan to call `.withTestId('sheet-drag')`. `react-native-gesture-handler/jestSetup` and Reanimated `setUpTests()` are already global (`jest.setup.ts`). Use `withReanimatedTimer` / `advanceAnimationByTime` or `getAnimatedStyle` from `react-native-reanimated` to assert `translateY` and backdrop opacity `[VERIFIED: installed exports]`.

### Backdrop with no raw colour
```typescript
export const BACKDROP_OPACITY = 0.38; // D-23: prototype rgba(20,21,15,.38) == colors.ink at .38
const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
<Animated.View testID="sheet-backdrop-fill" pointerEvents="none"
  style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink }, backdropStyle]} />
<Pressable testID="sheet-backdrop" style={StyleSheet.absoluteFill}
  accessibilityRole="button" accessibilityLabel={t('a11y.close')} onPress={() => requestDismiss('backdrop')} />
```

### Toast host remaining time
```typescript
// undoToast.ts: showToast sets shownAt: Date.now()
const ms = toastDurationMs(kind, screenReader);
if (ms === null) return undefined;
const timer = setTimeout(() => dismissToast(toastId), Math.max(0, ms - (Date.now() - shownAt)));
```

## Text migration inventory (03-05, DSG-07)

Method (run in the worktree; it parses named imports from `'react-native'`, multi-line included):
```bash
node -e "const fs=require('fs'),p=require('path');let n=0,t=0,ti=0;(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory()){if(e.name!=='node_modules')w(f);continue}if(!/\.tsx?$/.test(e.name))continue;const s=fs.readFileSync(f,'utf8');const re=/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['\"]react-native['\"]/g;let m,T=0,I=0;while((m=re.exec(s))){const x=m[1].split(',').map(v=>v.trim().replace(/^type\s+/,'').split(/\s+as\s+/)[0]);if(x.includes('Text'))T=1;if(x.includes('TextInput'))I=1}const test=/__tests__|\.test\./.test(f);if(T){test?t++:n++}if(I&&!test)ti++}})('src');console.log({nonTestText:n,testText:t,nonTestTextInput:ti})"
```
Result on 3512f78 (`src/` + `app/`; `app/` contributes 0): **69 non-test files** import `Text` (record 39, you 8, auth 4, consent 1, system 1, `src/ui` 16), **11 test files**, and **11 non-test files import `TextInput`** `[VERIFIED]`. CONTEXT's "68" is within one file. Size the plan at about 69, and decide:
- whether the lint rule (`no-restricted-imports` of `Text` from `react-native`) exempts `__tests__` (recommended, since tests use `Text` as fixtures);
- whether `TextInput` gets the same 2× cap. It scales with the OS by default and isn't covered by a `Text` primitive. Recommended: cap it through `maxFontSizeMultiplier={2}` on a shared input, verified on device.
No file uses `Animated.Text`, `maxFontSizeMultiplier` or `allowFontScaling` today `[VERIFIED]`.

## Sheet call-site inventory (D-12)

`[VERIFIED: grep of <Sheet|<ConfirmSheet|<DetailSheet in src/ and app/, excluding tests and the two wrapper files]`: **35 call sites in 26 files**. Plus 4 `Dropdown` users (`ActivityHeader`, `SortDropdown`, `ViewDropdown`, `WeekStartRow`) on Dropdown's own Modal. `SheetScroll` is used in 18 files, and no sheet uses `FlatList` or `FlashList`.

| File | Count | Stacks inside a parent sheet? |
|---|---|---|
| `record/entry/TransactionSheet.tsx` | 6 (1 Sheet + 4 ConfirmSheet + EditScope via child) | Yes: confirms, pickers, scope prompt nested in the entry sheet |
| `record/activity/ActivityScreen.tsx` | 3 | Screen-level (Add menu, which D-11 folds into the FAB quick menu) |
| `record/accounts/AccountRemoveRow.tsx`, `record/categories/RemoveCategoryPrompt.tsx` | 2 each | Confirm flows |
| `record/import/ExtrasDetail.tsx` | 1 ConfirmSheet | Nested in an import detail sheet (D-28 example) |
| `AccountSheet`, `CloneMonthSheet`, `FilterSheet`, `MonthSwitcher`, `RecurringReviewSheet`, `TransactionDetailSheet` (DetailSheet), `CategorySheet`, `RuleSheet`, `EditScopePrompt`, `OccurrenceActions`, `RepeatsField`, the 5 pickers (`Account`, `Category`, `Currency`, `Date`, `Option`), `PasswordPromptSheet`, `PasteSheet`, `SampleBanner`, `SampleClearPrompts`, `HomeCurrencyChangeSheet` | 1 each | Pickers and `RepeatsField` render inside `TransactionSheet` |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import { Tabs } from 'expo-router'` | `import { Tabs } from 'expo-router/js-tabs'` | Deprecated in the expo-router 57 line `[VERIFIED: installed]` | Use the new path in 03-13 and 03-08 |
| RNGH v2 builder `Gesture.Pan()` | RNGH v3 hooks `usePanGesture()` | RNGH 3.x (latest 3.3.0) | **Stay on v2** with SDK 57; online docs now default to v3 |
| Reanimated `runOnJS` | `scheduleOnRN` (react-native-worklets) | Reanimated 4 / worklets 0.5+ | Both exist in 0.10.1. Prefer `scheduleOnRN` in new worklets, or `.runOnJS(true)` on the gesture as SwipeBack does |
| `@gorhom/bottom-sheet` as the planned sheet engine | The app's own `Sheet` + RNGH + Reanimated | 2026-10-13 (D-12) | 03-09 and 03-16 rewritten |

**Deprecated/outdated:** `colors.scrim` (to be removed, D-23); `expo-haptics` sync method names (removed in SDK 57); `unstable-native-tabs` (excluded).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `maxFontSizeMultiplier` is still unreliable on Fabric in RN 0.86.3 | Pitfall 2 | Low; 03-05 scales manually anyway |
| A2 | Android `sendAccessibilityEvent(tag,'focus')` moves TalkBack focus | Pitfall 6 | Spike early; manual verification is budgeted |
| A3 | No official Expo Router recipe exists for one 8-deep history across tabs and an outer stack | Pattern 3 | Low |
| A4 | A fling rule of `dy ≥ 24 && vy ≥ 1000 px/s` feels right | Pattern 4 | Tune on device; a constant change |
| A5 | RNGH cancels a not-yet-active SwipeRow pan once the sheet pan activates first (default exclusive behaviour, with no relation set) | Pattern 4 | If a row also moves, add `blocksExternalGesture` or `requireExternalGestureToFail` between them. Check the entry list on the Pixel. |
| A6 | A Modal's back-press handling under predictive back on Android 13-15 doesn't matter once `predictiveBackGestureEnabled: false` | Pattern 8 | If predictive back stays on, verify `onRequestClose` still fires |
| A7 | `SheetScroll` is a direct child of the sheet container at every call site (so `onLayout.y` gives `bodyTop`) | Pattern 4, Pitfall 8 | Spot-checked in TransactionSheet, DetailSheet and FilterSheet, not in all 18 files. Grep during planning. |

## Open Questions (RESOLVED)

All six were answered at planning on 2026-10-13 and recorded in 03-CONTEXT.md as D-33..D-38.

1. **Entry sheet in edit mode: draft or "Discard changes?"**
   - What we know: D-25 says "entry sheet", and the draft model (`ListItem`, resume prompt) is built for new entries. Edit mode edits an existing row with a `version`.
   - What's unclear: whether an accidental swipe on an edit should keep a device draft of the edit or ask.
   - Recommendation: new-entry mode uses the D-25 draft; **edit mode uses D-26** (`dirty` from form versus the loaded row). Confirm with the user.
   RESOLVED: D-33
2. **Projections in Coming up and UNPAID**
   - What we know: projections (recurring occurrences not yet materialised) are in Activity's "Still to come" and in `stillToCome`. `useRowActions().pay` accepts only real rows, and `ProjectionRow` has no Pay.
   - Recommendation: include outflow projections in UNPAID and Coming up (so they match Activity's unfiltered list), with **no Pay button** on projection rows (the row body opens nothing, or the series). Alternatively, exclude projections everywhere on Home. Planner or user decision; affects HOME-02 and HOME-03 tests.
   RESOLVED: D-34
3. **The Unpaid filter's new meaning** (outflows only, plus projections when it is the only narrowing). It changes Phase 2 Activity behaviour and `engine/activity/filters` tests (100% folder). Recommendation: adopt it. It is required for HOME-01 to land on a list that matches UNPAID.
   RESOLVED: D-35
4. **Pending transfers.** They are excluded from totals, so exclude them from UNPAID and Coming up. Recommended.
   RESOLVED: D-36
5. **Dropdown backdrop.** The UI-SPEC says ink 0.38, but today it is transparent (see Pattern 5). Confirm whether menus should dim.
   RESOLVED: D-37
6. **Where setup lands after first account** (`router.replace('/activity')` today). Home or Activity?
   RESOLVED: D-38

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `react-native-gesture-handler` | Sheet drag | ✓ | 2.32.0 | — |
| `react-native-reanimated` / `-worklets` | Drag, backdrop, slides | ✓ | 4.5.1 / 0.10.1 | — |
| `expo-haptics` | D-18 | ✓ | ~57.0.3 | — |
| `expo-blur` | Tab bar | ✗ | add ~57.0.3 | Flat `tabBar` token |
| `@gorhom/bottom-sheet` | — | not needed | — | — |
| `node_modules` in worktree `C:/dev/fincwin-p3` | Running jest locally | ✗ (absent in this worktree) | — | `npm ci` in the worktree, or execute from a checkout with real `node_modules` (memory: EAS from a real-node_modules checkout) |
| Android device/emulator (Pixel) | Drag feel, back, TalkBack | ✓ | — | — |
| iPhone XR | iOS bounce, VoiceOver, edge swipe | ✓ (Apple enrolment pending for TestFlight) | iOS ≤18 | Android-first verification |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ~29.7.0 + jest-expo ~57.0.5 + @testing-library/react-native ^14.0.1; RNGH `jest-utils` (`fireGestureHandler`, `getByGestureTestId`); Reanimated `setUpTests`, `withReanimatedTimer`, `advanceAnimationByTime`, `getAnimatedStyle`; `expo-router/testing-library` `renderRouter` |
| Config file | `jest.config.js` (roots `src`, `supabase/functions`; per-folder engine coverage, `engine/activity` and `engine/entryList` at 100%), `jest.setup.ts` (AsyncStorage, NetInfo, Reanimated, RNGH jestSetup, expo-haptics mocks) |
| Quick run command | `npx jest src/shell src/ui src/state src/features/home src/features/navigation` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Forward direction by D-01 index; back always reverse | unit | `npx jest src/shell/tabBar/__tests__/direction.test.ts` | ❌ Wave 0 |
| NAV-02 | Reducer 8-cap and order | unit (pure) | `npx jest src/shell/backHistory/__tests__/backHistoryReducer.test.ts` | ❌ Wave 0 |
| NAV-02 | BackHandler steps 2-4 (history, then Home, then exit). Step 1 is not in BackHandler. | unit (mocked BackHandler) | `npx jest src/shell/backHistory/__tests__/useAndroidBackHandler.test.tsx` | ❌ Wave 0 |
| NAV-02/03 | Details on the outer Stack cover tabs; SwipeBack excludes `(tabs)`; landing is Home; first-account gate still redirects | integration (`renderRouter`) | `npx jest src/shell/__tests__/shellNavigation.test.tsx` | ❌ Wave 0 |
| NAV-03 (D-07) | `isSwipeBackRoute('(tabs)') === false` | unit | `npx jest src/features/navigation/__tests__/swipeBackGesture.test.ts` | ✅ (update) |
| NAV-04 | `sheetDragOutcome` thresholds: 92px, fling, at/under 92 snaps | unit (pure) | `npx jest src/ui/__tests__/sheetDrag.test.ts` | ❌ Wave 0 |
| NAV-04 | Drag past 92 dismisses after about 190ms; short drag snaps; body drag ignored while scrolled; selection haptic on drag close | component (`fireGestureHandler`, fake timers) | `npx jest src/ui/__tests__/Sheet.drag.test.tsx` | ❌ Wave 0 |
| NAV-04 (D-23) | Backdrop is `colors.ink` at opacity 0.38, outside the container, tap dismisses; `colors.scrim` gone | component | `npx jest src/ui/__tests__/Sheet.scrim.test.tsx` | ✅ (rewrite) |
| NAV-04 (D-26/27) | Dirty: drag, back and backdrop show "Discard changes?"; Keep editing returns; Discard closes; Cancel never asks; `dismissible={false}` snaps back | component | `npx jest src/ui/__tests__/Sheet.dismissal.test.tsx` | ❌ Wave 0 |
| NAV-04 (D-29) | Android back on nested sheets closes only the top (`onRequestClose` of the inner Modal) | component | `npx jest src/ui/__tests__/Sheet.stack.test.tsx` | ❌ Wave 0 |
| NAV-04 (D-25) | Entry form and list draft v2 round-trip; v1 still parses; malformed input rejected | unit (engine, 100%) | `npx jest src/engine/entryList/__tests__/draft.test.ts` | ✅ (extend) |
| NAV-04 (D-25) | Swipe or back on the entry sheet writes the draft, with no prompt; next Add offers resume | component | `npx jest src/features/record/entry/__tests__/TransactionSheet.draft.test.tsx` | ❌ Wave 0 |
| NAV-04 | Gesture root and keyboard regressions preserved | component | `npx jest src/ui/__tests__/Sheet.gestureRoot.test.tsx src/ui/__tests__/Sheet.keyboard.test.tsx` | ✅ (keep) |
| D-16 | `sheetStack` push/remove/top; wipe | unit | `npx jest src/state/__tests__/sheetStack.test.ts` | ❌ Wave 0 |
| D-16 | Toast renders inside the top sheet, app host hidden while a sheet is open, remaining time preserved on re-home, local `onUndo` works inside the sheet | component | `npx jest src/features/record/history/__tests__/UndoToastHost.layer.test.tsx` | ❌ Wave 0 |
| NAV-05 | `shouldHideFab` covers every D-10 condition, with "sheet open" from `sheetStack` | unit | `npx jest src/shell/fab/__tests__/shouldHideFab.test.ts` | ❌ Wave 0 |
| NAV-06 | Tab a11y role, selected state, "n of total" | component | `npx jest src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` | ❌ Wave 0 |
| NAV-06 | Sheet exposes an escape/dismiss a11y action routed through `requestDismiss` | component | (in `Sheet.dismissal.test.tsx`) | ❌ Wave 0 |
| NAV-06 | Focus moves on tab change or push | manual-only (VoiceOver XR, TalkBack Pixel) | — | n/a |
| DSG-07 | Text primitive clamps 2× / 1.3× | component | `npx jest src/ui/__tests__/Text.test.tsx src/theme/__tests__/fontScale.test.ts` | ❌ Wave 0 |
| DSG-07 | Largest accessibility sizes hold | manual-only | — | n/a |
| HOME-02 | `unpaidOutflows` (pending outflows + outflow projections; income, transfers, skipped and null-rate excluded), `leftAfterEverything`, bar shares clamped, `paidIn` 0 | unit (engine, 100%) | `npx jest src/engine/activity/__tests__/monthFigures.test.ts` | ❌ Wave 0 |
| HOME-01 | `unpaidOnly` keeps pending outflows only (if adopted) | unit (engine, 100%) | `npx jest src/engine/activity/__tests__/filters.test.ts` | ✅ (extend) |
| HOME-01 | Pay bills sets the shared month and Unpaid filter; Activity shows the filter chip active | component | `npx jest src/features/home/__tests__/QuickActions.test.tsx src/state/__tests__/activityFocus.test.ts` | ❌ Wave 0 |
| HOME-02/03/04 | Cards render loading, empty, waiting-for-rate and data states; Pay calls `useRowActions().pay`; at most 4 Coming-up rows; Accounts row pushes `/accounts/[id]` | component | `npx jest src/features/home/__tests__/` | ❌ Wave 0 |
| D-17 | Refresh resumes the queue, refetches, and toasts `refresh.updated` vs `refresh.nothingNew` by reference equality; no toast on error | unit (real `QueryClient`) | `npx jest src/shell/refresh/__tests__/useShellRefresh.test.tsx` | ❌ Wave 0 |
| D-12b | Drag feel, fling, iOS bounce, Android back on stacked sheets, SwipeRow inside entry sheet | manual-only (Pixel + XR) | — | n/a |

### Sampling Rate
- **Per task commit:** the quick run command above (about 10-20s).
- **Per wave merge:** `npm run test:coverage` (engine 100% folders enforced).
- **Phase gate:** full suite green, plus the manual rows recorded: focus, text sizes, drag feel and fling, back chain, iOS edge swipe once enrolment allows.

### Wave 0 Gaps
- [ ] `src/ui/__tests__/sheetDrag.test.ts`, `Sheet.drag.test.tsx`, `Sheet.dismissal.test.tsx`, `Sheet.stack.test.tsx`: NAV-04. No `@gorhom` mock (SUPERSEDED); use RNGH `jest-utils` plus fake timers.
- [ ] `src/ui/__tests__/Sheet.scrim.test.tsx`: rewrite (ink 0.38; drop the `colors.scrim` regex test).
- [ ] `src/state/__tests__/sheetStack.test.ts`, `activityFocus.test.ts`.
- [ ] `src/features/record/history/__tests__/UndoToastHost.layer.test.tsx`.
- [ ] `src/engine/activity/__tests__/monthFigures.test.ts` (100%).
- [ ] `src/features/home/__tests__/*`.
- [ ] `src/shell/refresh/__tests__/useShellRefresh.test.tsx`.
- [ ] `src/shell/__tests__/testUtils.tsx` `renderWithShellProviders()` (unchanged need).
- [ ] The worktree has no `node_modules`; install before executing.

## Security Domain

`security_enforcement` is not disabled. No new auth, session or server surface. Two items are new since 2026-09-26:
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 / V3 / V4 / V6 | No | Unchanged |
| V5 Input Validation | Yes (local) | The entry draft v2 is **untrusted device storage**. Extend `parseDraft`'s defensive parsing (type checks, `MAX_AMOUNT_MINOR`, counts) to the form snapshot. Never `eval` and never trust ids without a lookup. |
| V8 Data Protection | Yes (local) | The form draft holds financial text on the device. Keep it under the `fincwin:` prefix so the sign-out wipe clears it (`STORAGE_PREFIX`, `registerWipeHandler`). The new `sheetStack` and `activityFocus` stores also register wipe handlers. Toasts show only the user's own names (T-02-19-02 unchanged). |

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Malformed or old draft crashes the entry sheet | Denial of service | `parseDraft` returns empty on anything unexpected; v1 and v2 fixture tests |
| Draft survives sign-out to another account | Information disclosure | Key includes `{user}:{household}`; wipe by prefix (existing) |

## Sources

### Primary (HIGH confidence)
- Installed code read in `C:/dev/fincwin-p3`: `src/ui/Sheet.tsx`, `ConfirmSheet.tsx`, `DetailSheet.tsx`, `SheetHeader.tsx`, `Dropdown.tsx`, `ToastView.tsx`, `haptics.ts`, `src/state/undoToast.ts`, `src/features/record/history/UndoToastHost.tsx`, `src/features/navigation/SwipeBack.tsx`, `swipeBackGesture.ts` and test, `src/engine/activity/totals.ts`, `filters.ts`, `status.ts`, `src/features/record/activity/useActivityViewModel.ts`, `activitySections.ts`, `useRowActions.ts`, `src/data/queries/activity.ts`, `src/data/queryClient.ts`, `src/data/QueryProvider.tsx`, `src/data/cache/persister.ts`, `src/features/record/entry/TransactionSheet.tsx`, `useEntryDraft.ts`, `listForm.ts`, `src/engine/entryList/draft.ts`, `app/_layout.tsx`, `app/(app)/_layout.tsx`, `app/(app)/activity.tsx`, `app/index.tsx`, `src/features/auth/appHome.ts`, `app.config.ts`, `jest.config.js`, `jest.setup.ts`, `src/theme/motion.ts`, `src/theme/__tests__/noRawColours.test.ts`, `package.json`, `package-lock.json`
- Installed library typings (a sibling checkout's `node_modules`, the same lockfile versions): expo-router 57.0.22 `build/exports.d.ts`, `js-tabs.d.ts`, `build/react-navigation/bottom-tabs/types.d.ts`, `testing-library.d.ts`; RNGH 2.32.0 `jestUtils`, `nativeGesture.d.ts`, `gesture.d.ts`, `ReanimatedSwipeable.tsx`; Reanimated 4.5.1 `index.d.ts`; worklets 0.10.1 `index.d.ts`
- `npm view` (2026-10-13): `react-native-gesture-handler` 3.3.0, `react-native-reanimated` 4.7.1, `@gorhom/bottom-sheet` 5.2.14, `expo-blur@~57` 57.0.3
- Prototype `FincWin United.dc.html` L2124 (handle only drags), L6481-6491 (drag maths and the 190ms dismissal timer), L6844-6853 and L6994-6998 (pull and refresh copy condition), L6999-7003 (`dismissTop`)
- [React Native Modal docs](https://reactnative.dev/docs/modal): `onRequestClose`; `BackHandler` not emitted while a modal is open

### Secondary (MEDIUM confidence)
- [TanStack Query render optimizations](https://tanstack.com/query/v5/docs/framework/react/guides/render-optimizations): structural sharing keeps the reference
- [RNGH upgrading to 3](https://docs.swmansion.com/react-native-gesture-handler/docs/guides/upgrading-to-3/) and the [Gesture Handler 3 announcement](https://rec-ws.swmansion.com/blog/introducing-gesture-handler-3-0-hook-based-api-deeper-reanimated-integration-more-9185b0c8e305): v3 hook API, so do not follow it on 2.32
- [Expo Router common navigation patterns](https://docs.expo.dev/router/basics/common-navigation-patterns/): details outside tabs
- 02.3-RESEARCH Pattern 4 (sibling-Modal close-then-open precedent); `.planning/debug/resolved/sheet-swipe-android.md` (gesture root inside the Modal)

### Tertiary (LOW confidence)
- Fling constants (A4); Modal back under predictive back (A6); a11y focus on Android (A2); `maxFontSizeMultiplier` fix status (A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Read from the lockfile and installed typings; registry checked.
- Sheet architecture: MEDIUM-HIGH. Primitives verified. Composition (pan + native scroll + swipeable) needs on-device confirmation (A5, A7).
- Home data: HIGH. Read directly from the engine and hooks. Three behaviour decisions are open (Open Questions 2-4).
- Pitfalls: HIGH for the code-derived ones (5, 9-13); MEDIUM for the platform ones (1, 2, 6, 7).

**Research date:** 2026-09-26, updated 2026-10-13
**Valid until:** 2026-11-12 (30 days). Re-check if Expo SDK 58 or RNGH 3 is adopted.
