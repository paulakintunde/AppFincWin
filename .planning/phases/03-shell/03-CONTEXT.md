# Phase 3: Shell - Context

**Gathered:** 2026-09-26
**Status:** Ready for UI design contract (`/gsd-ui-phase 3`), then planning

<domain>
## Phase Boundary

The app's navigation chrome, built to the design system. It covers:
- the tab bar with the bespoke SVG glyphs and a directional slide between tabs
- one app-wide back history, 8 deep
- detail screens that push in and pop back
- the bottom-sheet infrastructure, with drag-to-dismiss
- the context-aware floating action button and its long-press quick menu
- the screen header with its large title
- toast placement
- the sync-problem line
- pull-to-refresh
- shell haptics
- screen-reader navigation and OS text scaling

Requirements: NAV-01…NAV-06, DSG-07.

Not in this phase:
- the screens inside the tabs: Home content, Activity (Phase 2), Decide (5), Grow (6), Insights (7)
- level gating of features (Phase 9)
- the app-switcher privacy snapshot (DSG-08)
- feature-specific haptics (verdict, cap breach, commit), which belong to their phases

</domain>

<decisions>
## Implementation Decisions

Decision numbers are local to this phase. "Phase 2 D-xx" refers to `.planning/phases/02-record/02-CONTEXT.md`.

### Tabs
- **D-01:** **Tab order is Home · Activity · Decide · Grow · Insights.** Decide sits in the centre slot, the most prominent and easiest to reach with a thumb. The store name is "FincWin: Can I Afford It?" (`research/LAUNCH-POSITIONING.md`), so the promise is one tap from anywhere.
  - This is a **deliberate deviation** from the prototype, which orders them Home · Activity · Grow · Decide · Insights.
  - Record the deviation where DSG-01's screenshot parity is checked, so the tab bar isn't flagged as a regression.
  - The glyphs themselves stay exactly as in the prototype.
- **D-02:** **A tab whose phase hasn't shipped is hidden, not shown as a placeholder.** The tab bar renders from a list of available tabs, and each feature phase switches its own tab on as it lands (Decide in 5, Grow in 6, Insights in 7). The slide direction (D-01 order) and the back history must work for any subset of tabs.
- **D-03:** **Levels never hide a whole tab.** Phase 9 gates features inside screens. Decide is always present. The available-tabs mechanism from D-02 is for build rollout, not for tiers.
- **D-04:** **You stays off the tab bar.** It is a pushed screen opened from the avatar at the top right of **each tab's root header**, not only Home as in the prototype.

### Back behaviour
- **D-05:** **One app-wide history, 8 deep, spanning tabs and detail screens** (NAV-02 exactly).
  - Tab switches and detail pushes are recorded in a single ordered history. The oldest entry drops off past 8.
  - Back walks the history: a detail screen, then the previous tab, then that tab's detail screen, and so on.
  - This fixes the prototype, whose `hist` records tab switches only and closes details on a tab change.
  - The slide direction on a back step follows D-01 order, as the prototype does.
- **D-06:** **Android hardware and gesture back:**
  1. close an open sheet (with the D-13 discard check)
  2. otherwise pop the history
  3. with the history empty on a non-Home tab, go to Home
  4. on Home with nothing left, exit the app
- **D-07:** **iOS edge swipe-back works on detail screens only.** It pops the detail back to its origin and never switches tabs. Tab-to-tab history uses the header's back chevron.
- **D-08:** **Re-tapping the active tab pops to that tab's root.** A second tap scrolls to the top.

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
- **D-11:** **Long-press opens a quick menu sheet:** Add expense · Add income · Transfer · New check · Import statement. The same entries are exposed as named screen-reader actions on the button, so the shortcut is never hidden. Each entry only appears once its feature exists (the same availability idea as D-02).

### Sheets and full screens
- **D-12:** **Short tasks are sheets, and multi-step flows are full-screen stacks.**
  - Sheets hold single-purpose tasks that fit about one screen: add or edit an entry, settle up, a cap, a filter, the Pro gate, and the floating button's quick menu.
  - Full-screen stacks hold the Decide five-step check, statement import and onboarding. The floating button hides for these (D-10).
  - The sheet library is `@gorhom/bottom-sheet` v5 (settled in CLAUDE.md).
- **D-13:** **Dragging down a sheet with unsaved changes snaps it back and asks "Discard changes?"** (Discard / Keep editing). An untouched sheet dismisses immediately. Android back (D-06) runs the same check.

### Header, status and feedback
- **D-14:** **The large title scrolls away and a compact title fades in.** The 26px display-face title scrolls with the content. A compact header showing the title, the back chevron (where there's history) and the avatar (on tab roots) fades in at the top, using the design's type and tokens. It's built in JS, not the native large-title header.
- **D-15:** **The sync line appears only when something is wrong.**
  - When offline, holding queued writes, or holding a failed write, a slim line shows under the header on every screen.
  - When all is well it is absent, and the full "synced x ago" line stays on You, as in the prototype (html 1807).
  - It reuses `useSyncStatus()` and `SyncStatusLine` (Phase 1 D-14).
- **D-16:** **The floating button lifts above the Undo toast** while a toast is showing, then settles back. Both stay reachable, and Undo is never covered. The toast keeps the prototype's position just above the tab bar (html 2794) and Phase 2 D-31's timings.
- **D-17:** **Pull-to-refresh uses the native refresh control**, in the design's colours, on the Home, Activity, Grow and Insights roots. It refetches that screen's queries and retries the write queue.
- **D-18:** **Shell haptics are a minimal set,** using only `impactAsync`, `selectionAsync` and `notificationAsync` (per the SDK 57 note in CLAUDE.md):
  - a light impact on a floating-button press
  - a medium impact when the long-press menu opens
  - a selection tick when a sheet closes by drag
  - no haptic on tab change
  All are suppressed when the OS haptics setting is off.

### Accessibility and text scaling
- **D-19:** **Text scaling (DSG-07):**
  - Body text and labels scale up to **200%** of the OS setting (the WCAG 1.4.4 target). Layouts wrap and grow, never clip.
  - **Large display figures** (net worth at 42px, the health score at 32px) and **tab labels** cap at about **1.3×** so the design survives.
  - Test at the largest iOS and Android accessibility sizes.
- **D-20:** **Screen-reader focus (NAV-06):**
  - On a tab change or a push, focus moves to the new screen's title.
  - Sheets hold focus while open and announce their title.
  - Toasts are announced politely without taking focus. Phase 2 D-31 already stops toasts auto-dismissing under a screen reader.
  - Tab buttons expose the selected state and their position, for example "Decide, tab, 3 of 5".
- **D-21:** **Reduced motion applies to every shell animation.** That means the tab slides (`fw-slideL`/`fw-slideR`), push-in (`fw-push`), sheet rise (`fw-up`), fade, the floating button's rise (`fw-rise`) and its lift. All go through the existing `src/theme/motion.ts` (`useReduceMotion`, `duration()`).

### Claude's Discretion
- How the unified history (D-05) is built on Expo Router: for example, a history store beside JS `Tabs` with a custom `tabBar` and per-tab stacks. It must meet D-05 to D-08 on both platforms.
- The per-screen registration API for the floating button (D-09), and how screens report "unsaved changes" to the sheet guard (D-13).
- Exact timings and easings. Use the prototype's (`.26s cubic-bezier(.2,.8,.3,1)` for tab slides, `.22s` entrances) unless research finds a platform reason to differ.
- The floating button's lift distance and animation (D-16).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prototype (the visual specification)
- `FincWin United.dc.html` lines 1855–1878: tab bar markup with the five bespoke SVG glyphs, label styling, and the blur and border.
- `FincWin United.dc.html` lines 1879–1888: floating button markup (accent pill, 50px, plus glyph, label).
- `FincWin United.dc.html` line 2117 onward: sheet scrim and sheet markup (`fw-up`, drag handle, Cancel).
- `FincWin United.dc.html` lines 2794–2800: toast markup and position.
- `FincWin United.dc.html` lines 53–62: tab root header (date eyebrow, 26px title, 42px avatar button).
- `FincWin United.dc.html` lines 4875–4881: `TABS`, `go`, `goBack`, `hist` (8-deep, tab-only; widened per D-05), `tabAnim`.
- `FincWin United.dc.html` lines 6858–6867: the floating button per-tab table and the `fabShow` rule.
- `FincWin United.dc.html` lines 20–30: the `@keyframes` for the seven named animations.

### Brief and requirements
- `BUILD-PROMPT.md` §2 (tokens, type scale, radii, card and floating-button shadows, tab bar spec, seven animations, easing, focus ring) and §5 (Shell & navigation row).
- `.planning/REQUIREMENTS.md`: NAV-01…NAV-06, DSG-07; DSG-01 (screenshot parity, see the D-01 deviation).
- `.planning/ROADMAP.md`: Phase 3 success criteria 1–5.
- `CLAUDE.md` Technology Stack: `@gorhom/bottom-sheet` 5.2.x, Reanimated 4.5 plus `react-native-worklets`, JS `Tabs` with a custom `tabBar` (not `unstable-native-tabs`), and the `expo-haptics` async-only API.

### Prior decisions
- `.planning/phases/02-record/02-CONTEXT.md` line 164: Record builds its screens as plain routes or sheets for the shell to wrap. D-31 sets toast timings and screen-reader behaviour. D-32 puts the History screen on You.
- `.planning/phases/01-money-core/01-CONTEXT.md` D-14: `useSyncStatus()` and the status line.
- `.planning/phases/00-foundation/00-CONTEXT.md` D-13: the You screen contents.
- `.planning/research/LAUNCH-POSITIONING.md` §1–2: why Decide takes the centre tab.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/theme/motion.ts`: `useReduceMotion()` and `duration()`, the reduced-motion gate for every shell animation (D-21).
- `src/theme/` tokens, accents and fonts: the tab bar, floating button, sheet and header colours and type all come from here.
- `src/ui/Screen.tsx`: the existing screen wrapper (safe areas), to extend with the D-14 header.
- `src/ui/SyncStatusLine.tsx`, `src/ui/syncStatusLabel.ts`, `useSyncStatus()`: the D-15 sync-problem line.
- `app/(app)/_layout.tsx`: the current signed-in stack (consent redirect, You). The tab navigator mounts inside this group, and the consent redirect must keep working.

### Established Patterns
- Expo Router file-based routes under `app/(app)` and `app/(auth)`.
- Theme context with live accent and font switching.
- The typed i18n catalogue: all shell labels, accessibility labels and floating-button labels go in it.

### Integration Points
- Installed: `react-native-reanimated` 4.5.1, `react-native-gesture-handler`, `react-native-svg`, `react-native-screens`, `react-native-safe-area-context`, `react-native-worklets` 0.10.1.
- **Not yet installed:** `@gorhom/bottom-sheet` and `expo-haptics`. They are added this phase at the versions pinned in CLAUDE.md. Check the Reanimated and worklets pairing against the bottom-sheet peer ranges.
- Phase 2's entry sheet and Activity screen get wrapped by this shell. Phases 5, 6 and 7 switch their tabs on (D-02) and register floating-button actions (D-09).

</code_context>

<specifics>
## Specific Ideas

- The Decide glyph (the diamond with a check, html ~1872) moves to the centre slot unchanged.
- The prototype's back chevron is a 36px circular button. Keep it as the compact header's back affordance (D-14).

</specifics>

<deferred>
## Deferred Ideas

- The app-switcher privacy snapshot (DSG-08) is not in this phase. It pairs naturally with Phase 10's lock screen and biometrics.
- Feature haptics (verdict, cap breach, commit) belong to Phases 5, 2 and 8.

</deferred>

---

*Phase: 03-shell*
*Context gathered: 2026-09-26*
