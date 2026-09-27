# Phase 3: Shell - Research

**Researched:** 2026-09-26
**Domain:** React Native / Expo Router navigation chrome — custom tab bar, unified back history, bottom sheets, FAB, accessibility
**Confidence:** MEDIUM-HIGH (stack versions and peer-dep chain VERIFIED live against npm; navigation architecture MEDIUM — no single official recipe covers D-05's exact 8-deep cross-tab history, so the design below is synthesized from documented primitives and flagged accordingly)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tabs**
- D-01: Tab order is Home · Activity · Decide · Grow · Insights (Decide centre slot, deliberate deviation from prototype's Home·Activity·Grow·Decide·Insights — record at DSG-01 screenshot-parity check). Glyphs unchanged.
- D-02: A tab whose phase hasn't shipped is hidden, not a placeholder. Tab bar renders from a list of available tabs; slide direction and back history must work for any subset of tabs.
- D-03: Levels (Phase 9) never hide a whole tab. Decide is always present. Availability mechanism is for build rollout only.
- D-04: "You" stays off the tab bar — pushed from the avatar at the top right of **each tab's root header**, not only Home.

**Back behaviour**
- D-05: One app-wide history, 8 deep, spanning tabs and detail screens (NAV-02 exactly). Tab switches and detail pushes recorded in a single ordered history; oldest entry drops past 8. Back walks the history: detail, then previous tab, then that tab's detail, etc. Fixes the prototype's tab-only `hist`. Slide direction on a back step follows D-01 order.
- D-06: Android hardware/gesture back: (1) close an open sheet (with D-13 discard check) → (2) else pop the history → (3) else, on non-Home tab with empty history, go to Home → (4) else exit.
- D-07: iOS edge swipe-back works on detail screens only — pops to origin, never switches tabs. Tab-to-tab back uses the header's back chevron.
- D-08: Re-tapping the active tab pops to that tab's root (first tap); scrolls to top (second tap, already at root).

**Floating action button**
- D-09: Button action follows the screen (table: Home/Activity/Insights → "Add"/new transaction; Decide → "New check"/start a check; Grow → follows sub-view, set by Phase 6). Shell exposes a registration API for any screen to set label/accessibility label/action; unregistered screens get default "Add". Accessibility labels follow prototype's `fabAria`.
- D-10: Button hides during: detail screens and sheets; entry flow and bulk select; onboarding; step flows (Decide check editor, date pickers); lock screen; signed out. Matches prototype's `fabShow` (satisfies NAV-05).
- D-11: Long-press opens a quick menu sheet: Add expense · Add income · Transfer · New check · Import statement. Same entries exposed as named screen-reader actions on the button. Each entry only appears once its feature exists (D-02 availability idea).

**Sheets and full screens**
- D-12: Short tasks are sheets (single-purpose, ~one screen: add/edit entry, settle up, cap, filter, Pro gate, FAB quick menu). Multi-step flows are full-screen stacks (Decide five-step check, statement import, onboarding) — FAB hides for these (D-10). Sheet library is `@gorhom/bottom-sheet` v5 (settled in CLAUDE.md).
- D-13: Dragging down a sheet with unsaved changes snaps it back and asks "Discard changes?" (Discard/Keep editing). Untouched sheet dismisses immediately. Android back (D-06) runs the same check.

**Header, status and feedback**
- D-14: Large title (26px display-face) scrolls with content; compact header (title + back chevron where history exists + avatar on tab roots) fades in at top. Built in JS, not native large-title header.
- D-15: Sync line appears only when something is wrong (offline / queued / failed write) under the header on every screen; absent when synced; You keeps the full "synced x ago" line. Reuses `useSyncStatus()`/`SyncStatusLine`.
- D-16: FAB lifts above the Undo toast while showing, then settles back. Both stay reachable.
- D-17: Pull-to-refresh uses native refresh control, design's colours, on Home/Activity/Grow/Insights roots. Refetches that screen's queries and retries the write queue.
- D-18: Shell haptics are a minimal set — `impactAsync`/`selectionAsync`/`notificationAsync` only: light impact on FAB press, medium impact when long-press menu opens, selection tick when sheet closes by drag, no haptic on tab change. Suppressed when OS haptics setting is off.

**Accessibility and text scaling**
- D-19: Body text/labels scale to 200% of OS setting, wrap not clip. Large display figures (net worth 42px, health score 32px) and tab labels cap at ~1.3×. Test at largest iOS/Android accessibility sizes.
- D-20: On tab change or push, focus moves to the new screen's title. Sheets hold focus while open, announce title. Toasts announced politely without taking focus (Phase 2 D-31 stops auto-dismiss under screen reader). Tab buttons expose selected state + position ("Decide, tab, 3 of 5").
- D-21: Reduced motion applies to every shell animation (`fw-slideL`/`fw-slideR`, `fw-push`, `fw-up`, fade, FAB rise/lift) via existing `src/theme/motion.ts` (`useReduceMotion`, `duration()`).

### Claude's Discretion
- How the unified history (D-05) is built on Expo Router (e.g. history store beside JS `Tabs` with a custom `tabBar` and per-tab stacks). Must meet D-05–D-08 on both platforms.
- Per-screen registration API for the FAB (D-09), and how screens report "unsaved changes" to the sheet guard (D-13).
- Exact timings/easings: use prototype's `.26s cubic-bezier(.2,.8,.3,1)` for tab slides, `.22s` entrances, unless research finds a platform reason to differ.
- FAB's lift distance and animation (D-16).

### Deferred Ideas (OUT OF SCOPE)
- The app-switcher privacy snapshot (DSG-08) — pairs with Phase 10's lock screen/biometrics.
- Feature haptics (verdict, cap breach, commit) — belong to Phases 5, 2 and 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | User can move between five tabs, direction of slide matches direction of travel | Architecture Patterns → "Directional Tab Slide"; Reanimated shared-element transitions confirmed NOT supported on tab navigators — custom worklet-driven enter animation is the correct approach, not `SharedTransition` |
| NAV-02 | User can go back through up to 8 previous screens, across tabs and detail screens | Architecture Patterns → "Unified Back History Store"; this is the phase's hardest, least-precedented problem — flagged MEDIUM confidence, own Open Question |
| NAV-03 | Detail screens push in over the current screen and dismiss back to it | Architecture Patterns → "Outer Stack for Detail Screens" (Expo Router's own documented pattern: keep detail routes out of the Tabs group, push from an outer Stack) |
| NAV-04 | Bottom sheets can be dismissed by dragging them down | Standard Stack → `@gorhom/bottom-sheet` v5; Code Examples → drag-to-dismiss + discard guard |
| NAV-05 | FAB changes action to match current tab, hides during sheets/bulk select/onboarding/step flows | Architecture Patterns → "FAB Registration Context"; Common Pitfalls → focus/registration timing |
| NAV-06 | App is navigable and readable with a screen reader on both platforms | Common Pitfalls → "Accessibility focus on Fabric is unreliable"; Code Examples → focus-management pattern with platform branch |
| DSG-07 | Text scales with OS text-size setting up to a defined maximum without breaking layouts | Common Pitfalls → "`maxFontSizeMultiplier` is unreliable on Fabric"; Code Examples → scaled-font hook fallback |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab bar rendering + glyphs | Browser/Client (RN UI thread) | — | Pure presentational component, no data dependency |
| Directional tab-content animation | Browser/Client (Reanimated UI thread) | — | Must run off the JS thread to stay smooth under load; worklet-driven |
| Unified 8-deep back history | Browser/Client (in-memory JS state/Context) | — | Pure client navigation state, no persistence or server involvement; lost on app restart is acceptable (not a data-integrity concern) |
| Detail screen push/pop | Browser/Client (Expo Router / React Navigation Stack) | — | Navigation library's native responsibility; shell only orchestrates *which* stack a push lands in |
| Bottom sheet container + drag/discard guard | Browser/Client (`@gorhom/bottom-sheet` + Reanimated + gesture-handler) | — | Client-side gesture and animation, no I/O |
| FAB action registration | Browser/Client (Context) | — | Screens register intent; shell reads and renders — no network round-trip |
| Sync-problem line | Browser/Client (reads cached state) | API/Backend (indirectly, via `useSyncStatus`) | Shell only renders; the underlying sync state is owned by Phase 1's data layer, already built |
| Pull-to-refresh | Browser/Client (native `RefreshControl`) | API/Backend (refetch target) | Shell wires the gesture; each screen's own query/mutation layer (built in earlier phases) does the actual refetch/retry |
| Screen-reader focus management | Browser/Client (native accessibility APIs via RN bridge) | — | Platform-specific (iOS `UIAccessibility`, Android `AccessibilityEvent`), no server involvement |
| Text scaling caps | Browser/Client (RN `Text`/`PixelRatio`) | — | Pure rendering concern |

## Summary

Phase 3 is a pure client-side navigation and chrome phase — no new server surface, no new schema. The stack decisions in `CLAUDE.md` mostly hold up against a live npm check, with one important correction: the installed pairing of `react-native-reanimated@4.5.1` + `react-native-worklets@0.10.1` + `react-native@0.86.3` is **already internally consistent** per the registry's own peer-dependency declarations — it does **not** need bumping to "4.5.5 + worklets 0.12.x" as `CLAUDE.md`'s stack note suggests (that pairing is itself wrong: 4.5.5 actually peers with worklets `0.10.x–0.11.x`, not `0.12.x`; `0.12.x` belongs to Reanimated 4.6.0). `@gorhom/bottom-sheet@5.2.14`'s peer range (`react-native-reanimated: ">=3.16.0 || >=4.0.0-"`, `react-native-gesture-handler: ">=2.16.1"`) is satisfied by the currently installed versions with no changes required. `expo-haptics` and `expo-blur` (needed for the tab bar's blur, not yet installed) both have `~57.0.3` as their current SDK-57-line version.

The phase's genuinely hard problem is NAV-02/D-05: one 8-deep history spanning both tab switches and pushed detail screens, with different back-gesture behaviour per platform (D-06 Android hardware/gesture back walks the unified history; D-07 iOS edge-swipe only pops detail screens and never touches tab history). There is no single official Expo Router or React Navigation recipe for this exact shape. Expo's own docs describe the closest primitive: "if you want the back button to return to the screen you came from, keep the detail route out of the tabs and push it from an outer Stack instead" — this is the load-bearing pattern this research recommends: an outer `Stack` (above the `Tabs` group) holds detail routes as siblings of the tab group, which gets native iOS edge-swipe-back for free on those routes (default React Navigation Stack behaviour) while leaving tab-to-tab transitions to a custom `tabBar` + a separate, hand-built history store that the compact header's back chevron and Android's `BackHandler` both drive. This history store is UI-only client state (a Context + reducer), not a routing primitive — it decides *what to call next* (`router.back()`, `router.navigate()`, or a custom tab-switch dispatch) rather than replacing Expo Router's own state.

Two verified, high-impact pitfalls surfaced during research that materially affect the plan: (1) Android's predictive-back-gesture API (enabled by default for new Expo projects since SDK 54, and this project has no override in `app.json`) breaks `BackHandler`'s `hardwareBackPress` listener on Android 13–15 — the exact mechanism D-06's ordering depends on — and remains unfixed as of SDK 57; the documented workaround is to set `android.predictiveBackGestureEnabled: false` in `app.json`, trading away the gesture preview animation for correct back-order behaviour. (2) `maxFontSizeMultiplier`, the standard RN API for D-19's scaling caps, has open, unresolved GitHub issues describing unreliable behaviour on Fabric/New Architecture (which this app runs exclusively, since RN 0.82+ removed the legacy bridge) — the plan should verify the prop's behaviour on-device early (Wave 0) and have a `PixelRatio.getFontScale()`-based manual-scaling fallback ready rather than assume the declarative prop alone is sufficient.

**Primary recommendation:** Build the shell as (a) an outer Expo Router `Stack` holding the `(tabs)` group plus sibling detail routes for native iOS push/swipe-back (NAV-03/D-07), (b) a custom `tabBar` render prop on a JS `Tabs` navigator wrapping Reanimated-driven directional slide animation (NAV-01), and (c) a standalone `BackHistoryProvider` (plain Context + reducer, 8-entry ring buffer) that both the compact header's back chevron and a `BackHandler` listener consult for D-05/D-06 ordering — with `predictiveBackGestureEnabled: false` set in `app.json` so that listener actually fires on Android 13–15.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `expo-router` | `~57.0.22` (installed, verified in `package.json`) | File-based routing, `Tabs`/`Stack` primitives | Already pinned per CLAUDE.md; no phase-specific change needed |
| `react-native-reanimated` | `4.5.1` (installed) | Worklet-driven tab slide, push, sheet-rise, fade, FAB lift animations | `[VERIFIED: npm registry]` peer range `react-native: 0.83 - 0.86`, `react-native-worklets: 0.10.x` — matches the installed RN 0.86.3 + worklets 0.10.1 exactly. **Do not bump** — see Alternatives/State of the Art below |
| `react-native-worklets` | `0.10.1` (installed) | Reanimated 4's separated worklet runtime | `[VERIFIED: npm registry]` required peer of reanimated 4.5.1 (`0.10.x`) — already satisfied |
| `react-native-gesture-handler` | `~2.32.0` (installed) | Sheet drag gesture, tab-bar touch handling | `[VERIFIED: npm registry]` `@gorhom/bottom-sheet@5.2.14` requires `>=2.16.1` — satisfied |
| `react-native-screens` | `~4.26.0` (installed) | Underlying native screen containers for Stack/Tabs | Already installed; no action needed |
| `@gorhom/bottom-sheet` | `5.2.14` | Sheet container for D-12/D-13/NAV-04 | `[VERIFIED: npm registry]` latest 5.x as of 2026-09-26; peers `react-native-reanimated: ">=3.16.0 || >=4.0.0-"`, `react-native-gesture-handler: ">=2.16.1"` — both satisfied by current installs. Depends on `@gorhom/portal@1.0.14` (installed transitively) |
| `expo-haptics` | `~57.0.3` | D-18 minimal haptics set | `[VERIFIED: npm registry]` current SDK-57-line version (57.0.0→57.0.3, then jumps to 58.0.0). **Not yet installed** — add via `npx expo install expo-haptics` |
| `expo-blur` | `~57.0.3` | Tab bar's `blur(14px)` translucent background (UI-SPEC "Container") | `[VERIFIED: npm registry]` current SDK-57-line version. **Not yet installed** — the UI-SPEC calls for a blur effect the codebase has no existing dependency for; add via `npx expo install expo-blur` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-native-svg` | `15.15.4` (installed) | Five bespoke tab glyphs, FAB plus glyph paths | Already used elsewhere in the app; UI-SPEC transcribes exact `<Svg>` shapes |
| `@react-native-community/netinfo` | `12.0.1` (installed) | Feeds the existing `useSyncStatus()` that D-15's sync line reads | No new work — already wired in Phase 1 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom worklet-driven tab-slide animation | Reanimated `SharedTransition` / shared-element transitions | `[CITED: docs.swmansion.com/react-native-reanimated/docs/shared-element-transitions/overview]` shared-element transitions are explicitly **not supported for tab navigators** ("the Tab navigator is not supported yet... using it may result in no animation being run") — ruled out, not a real option here |
| Hand-built `BackHistoryProvider` | React Navigation's built-in per-navigator history | React Navigation's own history is scoped per-navigator (each Tab's Stack has its own independent history; the Tabs navigator itself only remembers the last-focused tab). It has no built-in concept of one 8-deep history spanning tabs *and* a separate outer Stack's detail pushes — this is exactly the gap D-05 exists to fix over the prototype, so a custom store is unavoidable, not a preference |
| `android.predictiveBackGestureEnabled: false` | Leave predictive back enabled and only handle it on Android 16+ | `[VERIFIED: WebSearch, cross-referenced against expo/expo#39092]` the RN→OnBackPressedDispatcher bridge for predictive back only registers on Android 16+; Android 13–15 (a large share of the current install base) would silently exit the app instead of running D-06's ordering. Disabling predictive back is the only reliable fix available today, at the cost of losing the gesture preview animation |
| `maxFontSizeMultiplier` prop alone | Manual `PixelRatio.getFontScale()`-based scaling for capped elements | The prop is the documented, lower-effort path and should be tried first; the manual fallback is a contingency if on-device testing (iPhone XR, Android emulator) shows the prop being ignored, per the open Fabric issues below |

**Installation (new deps only — do not modify package.json/lockfiles in research; this is what the plan should run):**
```bash
npx expo install expo-haptics expo-blur @gorhom/bottom-sheet
```

**Version verification:** confirmed live against the npm registry on 2026-09-26 via `npm view <pkg> versions/peerDependencies --json`:
- `@gorhom/bottom-sheet` latest = `5.2.14`, peers satisfied by installed reanimated/gesture-handler
- `react-native-reanimated@4.5.1` peers = `{ "react-native": "0.83 - 0.86", "react-native-worklets": "0.10.x" }` — installed RN is `0.86.3`, installed worklets is `0.10.1`: **exact match, no bump needed**
- `react-native-reanimated@4.7.0` (current latest stable) peers = `{ "react-native": "0.86 - 0.88", "react-native-worklets": "0.13.x" }` — would require also bumping worklets to 0.13.x; **not recommended mid-phase** unless the team wants to take that upgrade deliberately (see State of the Art)
- `expo-haptics` latest SDK-57-line = `57.0.3`; `expo-blur` latest SDK-57-line = `57.0.3`

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │   app/_layout.tsx (existing, root Stack)     │
                     │   Gate() → Stack.Protected route="app"        │
                     └───────────────────┬───────────────────────────┘
                                          │
                     ┌────────────────────▼────────────────────────┐
                     │  app/(app)/_layout.tsx  — OUTER Stack         │
                     │  (NEW: replaces current single-screen Stack)  │
                     │                                                │
                     │  <BackHistoryProvider>  <FabProvider>          │
                     │  <SheetGuardProvider>                          │
                     │    <Stack screenOptions={{headerShown:false}}> │
                     │      <Stack.Screen name="(tabs)"                │
                     │        options={{ gestureEnabled:false }} />    │  ← D-07: no
                     │      <Stack.Screen name="you" />                │    edge-swipe on
                     │      <Stack.Screen name="[detail routes]"        │    the tab group
                     │        options={{ gestureEnabled:true,          │    itself
                     │          animation:'slide_from_right' }} />      │  ← D-07: native
                     │    </Stack>                                     │    edge-swipe HERE
                     │  </SheetGuardProvider></FabProvider>            │
                     │  </BackHistoryProvider>                         │
                     └────────────────────┬────────────────────────┘
                                          │ pushes detail routes on top of whichever
                                          │ tab is showing; back() returns to it
                     ┌────────────────────▼────────────────────────┐
                     │  app/(app)/(tabs)/_layout.tsx  — Tabs         │
                     │  tabBar={(props) => <TabBar {...props} />}    │
                     │  screenOptions per D-02: href:null for        │
                     │  not-yet-shipped tabs                         │
                     │                                                │
                     │  Home | Activity | Decide | Grow | Insights   │
                     │  (D-01 order; each is ONE root screen route,  │
                     │   detail screens live in the OUTER stack,     │
                     │   not nested inside each tab's own stack)     │
                     └───────────────────────────────────────────────┘

  Cross-cutting client state (Context, no I/O):
    BackHistoryProvider  — 8-entry ring buffer of {type:'tab',id} | {type:'detail',route}
                            written to on every tabPress / router.push; read by the
                            compact header's back chevron AND the Android BackHandler
                            listener (D-05, D-06)
    FabProvider           — current screen's {label, a11yLabel, onPress, onLongPress};
                             screens call useRegisterFab() in a useFocusEffect (D-09)
    SheetGuardProvider    — tracks which open sheet (if any) has reported unsaved
                             changes, exposes requestDismiss() that either closes
                             immediately or triggers the Discard/Keep-editing dialog
                             (D-13), consulted first by the Android back chain (D-06 step 1)

  Data flow for a back press (Android hardware button):
    BackHandler → SheetGuardProvider.hasOpenSheet?
      yes → requestDismiss() [may show dialog, may close] → consume event
      no  → BackHistoryProvider.pop()
              entry is 'detail' → router.back()
              entry is 'tab'    → tabBar's own switch fn (with D-01 direction)
              history empty & not on Home → switch to Home
              history empty & on Home     → return false (system default: exit)
```

### Recommended Project Structure
```
src/
├── shell/                          # NEW this phase
│   ├── backHistory/
│   │   ├── BackHistoryProvider.tsx # Context + reducer, pure — unit-testable without RN
│   │   ├── backHistoryReducer.ts   # pure reducer: push/pop/8-cap logic (engine-adjacent purity)
│   │   └── useAndroidBackHandler.ts
│   ├── tabBar/
│   │   ├── TabBar.tsx              # custom tabBar render prop component
│   │   ├── TabGlyphs.tsx           # 5 bespoke SVGs, per UI-SPEC transcription
│   │   └── availableTabs.ts        # D-02/D-03 tab-availability list (pure)
│   ├── fab/
│   │   ├── FabProvider.tsx
│   │   ├── Fab.tsx
│   │   └── FabQuickMenu.tsx        # D-11 long-press sheet
│   ├── sheet/
│   │   ├── SheetContainer.tsx      # wraps BottomSheetModal, D-12/D-13
│   │   └── DiscardChangesDialog.tsx
│   ├── header/
│   │   └── TabHeader.tsx           # D-14 large→compact
│   └── a11yFocus.ts                # D-20 focus-move helper, platform-branched
├── theme/
│   ├── motion.ts                   # extend: DURATION.tabSlide=260, DURATION.push=240
│   └── layout.ts                   # extend: radii.sheetTop=28, radii.toast=18
└── app/(app)/
    ├── _layout.tsx                 # becomes the OUTER Stack (rewritten this phase)
    └── (tabs)/
        ├── _layout.tsx             # Tabs w/ custom tabBar
        ├── index.tsx                # Home root
        ├── activity.tsx             # Phase 2's screen, wrapped
        ├── decide.tsx                # href:null until Phase 5
        ├── grow.tsx                  # href:null until Phase 6
        └── insights.tsx              # href:null until Phase 7
```

### Pattern 1: Outer Stack for Detail Screens (NAV-03, D-07)
**What:** Detail routes are siblings of the `(tabs)` group in the *outer* `app/(app)/_layout.tsx` Stack, not nested inside each tab's own stack.
**When to use:** Any screen that should push over the current tab and pop back to exactly where it was opened from, with native iOS edge-swipe.
**Example:**
```typescript
// Source: pattern confirmed by Expo Router docs (docs.expo.dev/router/basics/common-navigation-patterns)
// "If you want the back button to return to the screen you came from, keep the detail
// route out of the tabs and push it from an outer stack instead."
// app/(app)/_layout.tsx
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
  <Stack.Screen
    name="account/[id]"
    options={{ gestureEnabled: true, animation: 'slide_from_right' }} // D-07 native swipe-back
  />
</Stack>
```

### Pattern 2: Custom `tabBar` + Directional Slide (NAV-01, D-01, D-08)
**What:** A `tabBar` render prop receives `{ state, descriptors, navigation }` (cannot use `useNavigation()` inside it) and drives a Reanimated worklet on the active screen's container based on comparing tapped-tab index vs. current-tab index in D-01 order.
**When to use:** Every tab switch.
**Example:**
```typescript
// Source: reactnavigation.org/docs/bottom-tab-navigator (tabBar prop + tabPress event), CITED
const TAB_ORDER = ['home', 'activity', 'decide', 'grow', 'insights']; // D-01

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (isFocused) {
            // D-08: re-tap pops to root first, scroll-to-top on the *second* tap at root
            popToRootOrScrollTop(route.key);
            return;
          }
          if (!event.defaultPrevented) {
            const fromIdx = TAB_ORDER.indexOf(state.routeNames[state.index]);
            const toIdx = TAB_ORDER.indexOf(route.name);
            setSlideDirection(toIdx > fromIdx ? 'right' : 'left'); // drives the Reanimated worklet
            navigation.navigate(route.name);
          }
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={t('shell.tab.a11y', { label: t(`tab.${route.name}`), position: index + 1, total: state.routes.length })}
          >
            <TabGlyph name={route.name} color={isFocused ? colors.ink : colors.inkMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}
```
```typescript
// The entering screen's own animation — NOT a shared-element transition (unsupported on
// tab navigators, see Alternatives Considered). Each tab-root screen wraps its content in:
function SlideIn({ direction, children }: { direction: 'left' | 'right'; children: ReactNode }) {
  const { reduced, duration, easing } = useMotion(); // existing src/theme/motion.ts
  const tx = useSharedValue(direction === 'right' ? 22 : -22);
  const opacity = useSharedValue(0);
  useEffect(() => {
    tx.value = withTiming(0, { duration: duration(260), easing });
    opacity.value = withTiming(1, { duration: duration(260), easing });
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
```

### Pattern 3: Unified Back History Store (NAV-02, D-05, D-06)
**What:** A pure reducer (testable with zero RN dependency) tracking an 8-entry ring buffer of `{ type: 'tab'; tabId: string } | { type: 'detail'; route: string }`. This is intentionally analogous to the project's `engine/` purity discipline even though it lives in `src/shell/`, not `src/engine/` (it is UI state, not financial maths, so it does not need to satisfy the dependency-cruiser `engine-only-internal-src` rule — but writing it as a pure function makes it trivially unit-testable).
**When to use:** Every tab switch (`push({type:'tab', tabId})`) and every detail-route push (`push({type:'detail', route})`); every back action (`pop()`).
**Example:**
```typescript
// src/shell/backHistory/backHistoryReducer.ts — pure, no React/RN import
export type HistoryEntry = { type: 'tab'; tabId: string } | { type: 'detail'; route: string };
const MAX_DEPTH = 8; // D-05

export function pushEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...history, entry];
  return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next;
}

export function popEntry(history: HistoryEntry[]): { entry: HistoryEntry | null; rest: HistoryEntry[] } {
  if (history.length === 0) return { entry: null, rest: history };
  return { entry: history[history.length - 1], rest: history.slice(0, -1) };
}
```
```typescript
// src/shell/backHistory/useAndroidBackHandler.ts
useEffect(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    if (sheetGuard.hasOpenSheet) {              // D-06 step 1
      sheetGuard.requestDismiss();
      return true;
    }
    const { entry, rest } = popEntry(history);   // D-06 step 2
    if (entry) {
      applyHistoryEntry(entry);                  // router.back() or tab switch, per D-05
      setHistory(rest);
      return true;
    }
    if (currentTab !== 'home') {                 // D-06 step 3
      switchTab('home');
      return true;
    }
    return false;                                // D-06 step 4: let the system exit the app
  });
  return () => sub.remove();
}, [history, currentTab, sheetGuard]);
```

### Pattern 4: FAB Registration Context (NAV-05, D-09, D-10)
**What:** Screens call a hook inside `useFocusEffect` to register their FAB config; unmounting/unfocusing clears it back to a default.
**Example:**
```typescript
// Source: standard React Navigation useFocusEffect pattern (reactnavigation.org/docs/use-focus-effect), CITED
function DecideScreen() {
  const { registerFab } = useFab();
  useFocusEffect(
    useCallback(() => {
      registerFab({ label: t('fab.decide.label'), a11yLabel: t('fab.decide.aria'), onPress: startCheck });
      return () => registerFab(null); // back to default "Add" when this screen loses focus
    }, [])
  );
  // ...
}
```

### Anti-Patterns to Avoid
- **Nesting each tab's own Stack for detail screens:** would give each tab an independent history and native swipe-back would return within that tab's stack, not honour D-05's single cross-tab history or D-07's "tab-to-tab back uses the chevron" rule. Use the outer-Stack pattern instead.
- **Reaching for Reanimated shared-element transitions for the tab slide:** explicitly unsupported on tab navigators per official docs — will silently no-op.
- **Relying on `usePreventRemove` for the sheet discard guard:** that hook targets *route* removal (stack screens), not a `BottomSheetModal`'s internal pan-gesture dismissal — it has documented inconsistency with back gestures per React Navigation's own docs, and sheets here are gesture-driven components, not routes. Use the bottom-sheet library's own gesture/callback surface (`enablePanDownToClose`, `onChange` watching for index `-1`, or the "let it dismiss, then offer to restore" pattern from the library's own maintainers) instead.
- **Assuming `Text.defaultProps.maxFontSizeMultiplier` is a safe global default:** the `defaultProps` pattern is being phased out in RN generally, and multiple open GitHub issues report the prop being ignored specifically on Fabric. Prefer explicit `maxFontSizeMultiplier` per Text instance for the capped elements (tab labels, big figures), verified on-device.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Bottom sheet drag/snap/backdrop physics | A custom `PanResponder` + `Animated` sheet | `@gorhom/bottom-sheet` v5 | Handles snap points, keyboard avoidance, backdrop, Android back integration, and Fabric-era gesture-handler integration already; a hand-rolled version would need to re-solve velocity-based snapping and keyboard offset, both notoriously fiddly |
| Native iOS edge-swipe-back gesture | A custom `PanGestureHandler` mimicking `UINavigationController`'s interactive pop | Default React Navigation Stack `gestureEnabled: true` on detail routes (Pattern 1) | The platform gesture (including its interruption/cancel physics) is already implemented by `react-native-screens`'s native Stack; reimplementing it in JS would never feel as good and risks fighting the OS's own edge-swipe-to-go-home gesture |
| Blur effect for the tab bar | A custom semi-transparent overlay + manual backdrop blur shader | `expo-blur`'s `<BlurView>` | Cross-platform blur (`UIVisualEffectView` on iOS, a RenderScript/real blur fallback on Android) is exactly what this package exists for; a manual approximation would differ visibly between platforms |
| Screen-reader focus movement on navigation | A bespoke native module | RN's own `AccessibilityInfo` API, platform-branched (see Common Pitfalls) — but do not assume it "just works" | Building a native module for this is disproportionate; the existing API is inconsistent but present and improvable with per-platform handling |

**Key insight:** every piece of this phase that looks like "just some gestures and animation" (sheet drag, edge-swipe, blur) already has a maintained, Fabric-compatible library solving it; the phase's actual novel work is entirely in *orchestration* (the history store, the FAB registration context, the availability-gated tab list) — pure client state with no external library to reach for, which is exactly why it is written as testable pure functions in Pattern 3.

## Common Pitfalls

### Pitfall 1: Android predictive-back gesture breaks `BackHandler` on Android 13–15
**What goes wrong:** D-06's entire ordering (sheet → history → Home → exit) depends on `BackHandler.addEventListener('hardwareBackPress', ...)` firing. With Android's predictive-back-gesture API active, the system routes back events to `OnBackPressedDispatcher` instead of the legacy `Activity.onBackPressed()` path that `BackHandler` hooks into.
**Why it happens:** `[VERIFIED: WebSearch, cross-referenced with expo/expo#39092]` React Native's bridge for the new dispatcher only registers on Android 16+; on Android 13–15 the system falls through to its default action (closing the app) instead of ever reaching JS. Expo enables predictive back by default for **new** projects created on SDK 54+ (this project has no `android.predictiveBackGestureEnabled` key in `app.json`, so the SDK's default — enabled — applies).
**How to avoid:** Set `"android": { "predictiveBackGestureEnabled": false }` in `app.json` (a documented, first-party Expo config key). This restores the classic back-press path that `BackHandler` has always used, at the cost of losing the predictive-back preview animation. This is the only reliable fix as of SDK 57 — flag as a required plan task, not an incidental config tweak.
**Warning signs:** On a physical Android 13–15 device or emulator, the hardware/gesture back action exits the app immediately from a non-Home tab or with an open sheet, instead of following D-06's steps.

### Pitfall 2: `maxFontSizeMultiplier` is unreliable on Fabric/New Architecture
**What goes wrong:** D-19's caps (tab labels and large display figures at ~1.3×, everything else at 200%) are naturally implemented via RN's `maxFontSizeMultiplier` prop on `Text`. Multiple open GitHub issues (`facebook/react-native#47499`, `#35658`) report this prop being ignored on Fabric for both iOS and Android, meaning capped elements could scale unbounded at the OS's largest accessibility text sizes and break the tab bar / net-worth figure layout that D-19 explicitly protects.
**Why it happens:** `[VERIFIED: WebSearch — GitHub issue titles/labels confirmed, e.g. #47499 labeled "Impact: Regression", "Resolution: PR Submitted"]` A regression introduced with the New Architecture rollout; exact fix-and-ship version could not be confirmed from available sources (`[ASSUMED]` that it remains unresolved as of RN 0.86.3 — not independently confirmed against RN 0.86's own changelog in this session).
**How to avoid:** Set `maxFontSizeMultiplier` explicitly on every capped `Text` (don't rely on a global default), but treat this as unverified until confirmed on the actual test devices (iPhone XR, Android emulator) at the largest OS accessibility text size during this phase's acceptance pass (D-19 explicitly calls for this test anyway). If the prop proves unreliable on-device, fall back to computing font size manually: `Math.min(baseSize * PixelRatio.getFontScale(), baseSize * 1.3)` for capped elements, applied via a small `useScaledFontSize(base, cap)` hook, with `allowFontScaling={false}` on that Text and the manual scale baked into the returned `fontSize`.
**Warning signs:** At iOS's largest Dynamic Type accessibility size or Android's largest font-scale setting, the tab bar's five labels wrap, truncate, or overlap, or the net-worth/health-score figures overflow their card.

### Pitfall 3: Directional slide sign convention is easy to invert
**What goes wrong:** The prototype's own `dir`/`slideL`/`slideR` naming is non-obvious (UI-SPEC explicitly flags this: "verify sign convention against the prototype's `dir` computation at implementation, since the prototype's own variable naming (`slideL`/`slideR`) versus its `dir` sign is easy to invert by accident").
**Why it happens:** Naming mismatch between the CSS keyframe name and the direction it visually produces.
**How to avoid:** Write a small unit test (or a Storybook-less manual matrix) enumerating every `(fromTab, toTab)` pair in D-01 order and asserting the computed direction, before wiring it to the actual worklet. Do not trust the prototype's variable names as documentation of behaviour — verify visually on-device for at least one left-moving and one right-moving transition.
**Warning signs:** Tabs to the right of the current one visually slide in from the left (or vice versa) on first on-device check.

### Pitfall 4: `tabBar` custom render prop cannot use `useNavigation()`
**What goes wrong:** A common mistake porting from a screen component to a `tabBar` component is calling `useNavigation()` inside it, which throws or returns the wrong navigator's context.
**Why it happens:** `[CITED: reactnavigation.org/docs/bottom-tab-navigator]` The custom tab bar is not a screen — it receives `navigation` as a prop and must use that reference, not the hook.
**How to avoid:** Thread `navigation` through as a prop everywhere inside `TabBar.tsx`; never call `useNavigation()` in that file.

### Pitfall 5: Bottom sheet dismiss-then-confirm ordering, not intercept-then-block
**What goes wrong:** The natural first instinct for D-13 (drag-with-unsaved-changes snaps back and asks) is to intercept the drag gesture mid-flight and cancel it. Community reports (`gorhom/react-native-bottom-sheet` discussion #1061) found this approach (`onAnimate` + re-snapping) causes rerendering issues with form state and keyboard offset.
**Why it happens:** Bottom-sheet v5's gesture pipeline commits to the dismiss animation before JS gets a clean synchronous chance to veto it without visual glitches.
**How to avoid:** Prefer the pattern the library's own maintainers recommend: let the sheet dismiss visually, then on `onDismiss`/index reaching `-1`, check the "had unsaved changes" flag — if true, immediately re-`present()` the sheet (restoring its content/form state) and show the Discard/Keep-editing dialog on top of it, rather than trying to physically block the drag mid-gesture. This still satisfies D-13's user-facing requirement ("dragging down snaps it back and asks") with a visually equivalent outcome, without fighting the gesture pipeline.
**Warning signs:** Sheet content flashes, jumps, or loses keyboard focus when a discard-guard is attempted via drag interception.

### Pitfall 6: Accessibility focus-on-navigate has no single cross-platform API
**What goes wrong:** D-20 requires focus to move to the new screen's title on tab change/push. The idiomatic `AccessibilityInfo.setAccessibilityFocus(reactTag)` requires the deprecated `findNodeHandle()`, and on Android's Fabric path, `ACTION_ACCESSIBILITY_FOCUS` (the action that actually moves focus) is not exposed to JS at all as of the last confirmed community discussion — only `sendAccessibilityEvent(view, 'focus')`, which fires a *notification* event, not a focus-move.
**Why it happens:** `[VERIFIED: WebSearch — facebook/react-native#37015, closed "not planned"]` This is a known, longstanding gap in RN's accessibility API surface with no official fix committed.
**How to avoid:** Platform-branch: on iOS, `AccessibilityInfo.setAccessibilityFocus(findNodeHandle(titleRef.current))` is reported to work. On Android, the more reliable pattern reported by the community is to briefly set `accessibilityViewIsModal`/mount-order tricks, or use `AccessibilityInfo.sendAccessibilityEvent(reactTag, 'focus')` as a best-effort (undocumented but reported functional in some RN versions) — treat as `[ASSUMED, needs on-device verification]`, not settled fact. Budget explicit TalkBack-on-Android and VoiceOver-on-iOS manual verification time in this phase's acceptance pass; do not assume a single code path covers both.
**Warning signs:** VoiceOver announces the new screen's title correctly but TalkBack stays silent or reads stale content after a tab switch.

## Code Examples

### FAB hide-rule evaluation (D-10)
```typescript
// Source: derived directly from D-10's explicit list, no external API — pure function,
// unit-testable without React
export function shouldHideFab(state: {
  route: 'detail' | 'tab-root';
  sheetOpen: boolean;
  bulkSelectActive: boolean;
  onboardingActive: boolean;
  stepFlowActive: boolean; // Decide check editor, date pickers
  locked: boolean;
  signedOut: boolean;
}): boolean {
  return (
    state.route === 'detail' ||
    state.sheetOpen ||
    state.bulkSelectActive ||
    state.onboardingActive ||
    state.stepFlowActive ||
    state.locked ||
    state.signedOut
  );
}
```

### Hiding a not-yet-shipped tab (D-02)
```typescript
// Source: docs.expo.dev/router/advanced/tabs — "href: null" pattern, CITED
<Tabs.Screen
  name="decide"
  options={{ href: isTabAvailable('decide') ? undefined : null }} // D-02/D-03
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| CLAUDE.md's claim: "Reanimated 4.5.5 pairs with `react-native-worklets` 0.12.x" | `[VERIFIED: npm registry]` Reanimated 4.5.5 actually peers with worklets `0.10.x–0.11.x`; 0.12.x belongs to Reanimated 4.6.0 | Verified live 2026-09-26 | The installed pair (4.5.1 + worklets 0.10.1) is correct and internally consistent for RN 0.86.3 as-is — **no dependency bump is needed for this phase**, correcting the phase brief's stated concern |
| Reanimated 4.5.x line | Reanimated 4.7.0 is current latest stable, requiring RN `0.86–0.88` and worklets `0.13.x` | `[VERIFIED: npm registry]`, published in the 4.7.0 line before 2026-09-26 | Not recommended to adopt mid-phase — would be a deliberate, separately-scoped dependency bump touching `package.json`/lockfiles, out of this research-only session's remit and unnecessary for Phase 3's requirements |
| Predictive back gesture disabled by default (older Expo projects) | Enabled by default for **new** Expo projects since SDK 54 | SDK 54, 2026 | This project (created after SDK 54) inherits the enabled default with no override present in `app.json` — directly causes Pitfall 1 |

**Deprecated/outdated:**
- `expo-haptics`' old `notification()`/`impact()`/`selection()` method names: removed in the SDK 57 line (already correctly called out in CLAUDE.md) — only `notificationAsync`/`impactAsync`/`selectionAsync` exist.
- `unstable-native-tabs`: correctly excluded per project decision; not evaluated further here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `maxFontSizeMultiplier`'s Fabric bug remains unresolved as of RN 0.86.3 / SDK 57 (exact fix version could not be confirmed from available sources) | Common Pitfalls → Pitfall 2 | If actually fixed, the plan could skip the manual-scaling fallback hook and save implementation time — low risk either way since the plan should verify on-device regardless (D-19 already requires this test) |
| A2 | Android's `sendAccessibilityEvent(reactTag, 'focus')` is a viable (if undocumented) way to move TalkBack focus on Android | Common Pitfalls → Pitfall 6 | If it doesn't work in RN 0.86, the plan needs a different Android-specific mechanism (e.g. relying on the new screen's title auto-receiving focus via mount order/`accessible` + `accessibilityElementsHidden` toggling elsewhere) — should be spiked early in the phase, not assumed to work |
| A3 | No official Expo Router recipe exists for an 8-deep history spanning tabs *and* an outer stack's detail pushes (i.e., the custom `BackHistoryProvider` design in Pattern 3 is a synthesis, not a documented pattern) | Architecture Patterns → Pattern 3 | If a simpler built-in mechanism is later discovered, the custom store adds unnecessary complexity — but no such mechanism surfaced across Expo's docs or React Navigation's docs in this research pass |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Exact behaviour of `usePreventRemove`/back-gesture interaction on the *outer* Stack's detail routes, given D-13's separate sheet-guard mechanism**
   - What we know: React Navigation's own docs note "known issues with `usePreventRemove` and the back gesture" and recommend using it sparingly.
   - What's unclear: Whether any detail screen in this app (not just sheets) will ever need its own unsaved-changes guard via `usePreventRemove`, given Record's screens (Phase 2) are described as "plain routes or sheets" — if a future detail screen needs this, the interaction with D-07's native edge-swipe needs a dedicated check.
   - Recommendation: Not blocking for Phase 3 itself (no detail screen in this phase's own scope has unsaved-changes state) — flag for whichever later phase first pushes a detail screen with its own draft state.

2. **Whether the SDK-57-pinned `expo-blur` version (`~57.0.3`) renders an acceptable blur on the Android emulator this project uses for testing**
   - What we know: `expo-blur` wraps native blur APIs that have historically had weaker Android support (falling back to a translucent overlay on older Android versions/emulators without hardware blur support).
   - What's unclear: Whether the specific Android emulator image in use renders a visible blur or a flat translucent fallback.
   - Recommendation: Verify visually during implementation; UI-SPEC's `tabBar` token already includes a plain `rgba(251,250,247,.94)` fallback colour, so a flat-fallback outcome is not a blocker, just a visual-parity note for DSG-01.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@gorhom/bottom-sheet` | NAV-04, D-12/D-13 | ✗ (not installed) | — (`5.2.14` to add) | none needed — install via `npx expo install` |
| `expo-haptics` | D-18 | ✗ (not installed) | — (`~57.0.3` to add) | none needed |
| `expo-blur` | UI-SPEC tab bar blur | ✗ (not installed) | — (`~57.0.3` to add) | plain `tabBar` rgba background already specified as the visual base even with blur |
| `react-native-reanimated` | NAV-01, D-21 | ✓ | `4.5.1` | — |
| `react-native-worklets` | Reanimated 4 runtime | ✓ | `0.10.1` | — |
| `react-native-gesture-handler` | NAV-04, tab bar touch | ✓ | `~2.32.0` | — |
| Android emulator | On-device back-gesture/predictive-back verification | ✓ (per CLAUDE.md, existing dev loop) | — | — |
| iPhone XR (physical) | iOS edge-swipe/VoiceOver verification | ✓ (per CLAUDE.md) | iOS ≤18 | EAS Simulator only if waitlist access arrives (per CLAUDE.md, not certain) |

**Missing dependencies with no fallback:** none — all three missing packages (`@gorhom/bottom-sheet`, `expo-haptics`, `expo-blur`) install cleanly via `npx expo install` against the current SDK 57 / RN 0.86.3 / Reanimated 4.5.1 stack with no version conflicts found.

**Missing dependencies with fallback:** `expo-blur` has a documented visual fallback (the plain `tabBar` translucent colour token) if the emulator's blur rendering proves weak.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `~29.7.0` + `jest-expo ~57.0.5` + `@testing-library/react-native ^14.0.1` (all installed, confirmed in `package.json`) |
| Config file | `jest.config.js` / `jest.setup.ts` (existing, project root) |
| Quick run command | `npm test -- src/shell` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| NAV-01 | Directional slide index comparison (D-01 order) picks correct direction for every tab pair | unit | `npx jest src/shell/tabBar/__tests__/direction.test.ts` | ❌ Wave 0 |
| NAV-02 | `backHistoryReducer` push/pop obeys 8-cap and ordering (D-05) | unit (pure, no RN) | `npx jest src/shell/backHistory/__tests__/backHistoryReducer.test.ts` | ❌ Wave 0 |
| NAV-02 | Android back chain (sheet → history → Home → exit) dispatches in D-06 order | unit (mocked `BackHandler`) | `npx jest src/shell/backHistory/__tests__/useAndroidBackHandler.test.ts` | ❌ Wave 0 |
| NAV-03 | Detail route pushed from outer Stack, `gestureEnabled: true` on detail, `false` on tab group | component/config assertion | `npx jest src/shell/__tests__/layoutConfig.test.tsx` | ❌ Wave 0 |
| NAV-04 | Sheet drag-to-dismiss + discard guard restores content on cancel (D-13) | component (RNTL) | `npx jest src/shell/sheet/__tests__/SheetContainer.test.tsx` | ❌ Wave 0 |
| NAV-05 | `shouldHideFab` pure function covers every D-10 hide condition | unit | `npx jest src/shell/fab/__tests__/shouldHideFab.test.ts` | ❌ Wave 0 |
| NAV-06 | Tab buttons expose `accessibilityRole="tab"`, `accessibilityState.selected`, correct position label | component (RNTL, `getByRole`) | `npx jest src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` | ❌ Wave 0 |
| NAV-06 | Screen-reader focus-move on tab change/push | **manual-only** (VoiceOver on iPhone XR, TalkBack on Android emulator) — no reliable JS-testable seam exists for actual OS focus movement (see Pitfall 6) | — | n/a |
| DSG-07 | Capped `Text` elements respect `maxFontSizeMultiplier` at 200%/1.3× | **manual-only** (largest accessibility text size on both platforms) with a unit test asserting the *prop value* is set correctly as a proxy | `npx jest src/shell/header/__tests__/TabHeader.fontScale.test.tsx` (proxy) + manual device check | ❌ Wave 0 (proxy test) |

### Sampling Rate
- **Per task commit:** `npm test -- src/shell`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the two manual-only rows above executed and recorded (VoiceOver/TalkBack focus-move, largest-accessibility-size layout check) since no automated seam exists for OS-level focus movement or actual rendered font scaling.

### Wave 0 Gaps
- [ ] `src/shell/backHistory/__tests__/backHistoryReducer.test.ts` — covers NAV-02 (pure, highest-value test in the phase — this is the load-bearing, least-precedented logic)
- [ ] `src/shell/tabBar/__tests__/direction.test.ts` — covers NAV-01
- [ ] `src/shell/fab/__tests__/shouldHideFab.test.ts` — covers NAV-05
- [ ] `src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` — covers NAV-06 (the automatable half)
- [ ] `src/shell/sheet/__tests__/SheetContainer.test.tsx` — covers NAV-04, needs a `@gorhom/bottom-sheet` mock or the library's own testing utilities (check `@gorhom/bottom-sheet`'s own docs for a Jest mock helper before hand-rolling one)
- [ ] No shared fixtures beyond the existing `jest.setup.ts` are anticipated, but a `renderWithShellProviders()` helper (wrapping `BackHistoryProvider`/`FabProvider`/theme) will likely be needed across every shell component test — worth creating once in `src/shell/__tests__/testUtils.tsx` rather than per-file

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section is included per policy — but Phase 3 introduces no new authentication, session, or data-access surface; it is pure client-side navigation chrome over screens whose data access was already secured in Phases 0–2.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | No new auth surface — the shell reads existing `useAuth()`/session state from Phase 0 only to decide FAB visibility (D-10: hidden "while signed out") |
| V3 Session Management | No | No session logic introduced |
| V4 Access Control | No | No new data access paths; navigation chrome does not gate data, only visibility of UI affordances (tab availability per D-02 is a build-rollout flag, not an access-control boundary) |
| V5 Input Validation | Marginal | The Discard-changes dialog and quick-menu are UI-only; no new user text input is introduced by this phase itself (entry sheets are Phase 2's) |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack
None identified specific to this phase — it is UI/navigation chrome with no new server-facing surface, no new secrets, and no new data writes. The one adjacent concern (DSG-08, hiding balances in the app-switcher snapshot) is explicitly deferred to Phase 10 per this phase's CONTEXT.md and is out of scope here.

## Sources

### Primary (HIGH confidence)
- `npm view @gorhom/bottom-sheet versions/peerDependencies --json` — live registry check, 2026-09-26
- `npm view react-native-reanimated@4.5.1 / @4.5.5 / @4.6.0 / @4.7.0 peerDependencies --json` — live registry check, 2026-09-26
- `npm view react-native-worklets versions --json` — live registry check, 2026-09-26
- `npm view expo-haptics / expo-blur versions --json` — live registry check, 2026-09-26
- Project files read directly: `package.json`, `app/_layout.tsx`, `app/(app)/_layout.tsx`, `src/theme/motion.ts`, `src/theme/layout.ts`, `src/theme/tokens.ts`, `src/theme/typography.ts`, `src/ui/Screen.tsx`, `src/ui/SyncStatusLine.tsx`

### Secondary (MEDIUM confidence)
- [Expo Router: Common navigation patterns](https://docs.expo.dev/router/basics/common-navigation-patterns/) — outer-Stack-for-detail-routes pattern
- [Expo Router: Tabs](https://docs.expo.dev/router/advanced/tabs/) — `href: null` hide pattern
- [React Navigation: Bottom Tab Navigator](https://reactnavigation.org/docs/bottom-tab-navigator/) — `tabBar` prop, `tabPress`/`tabLongPress` events
- [React Navigation: usePreventRemove](https://reactnavigation.org/docs/use-prevent-remove/) — known back-gesture inconsistency
- [React Native Reanimated: Shared Element Transitions overview](https://docs.swmansion.com/react-native-reanimated/docs/shared-element-transitions/overview/) — tab navigator explicitly unsupported
- [expo/expo#39092](https://github.com/expo/expo/issues/39092) — predictive back gesture breaks Expo Router back navigation on Android
- [gorhom/react-native-bottom-sheet discussion #1061](https://github.com/gorhom/react-native-bottom-sheet/discussions/1061) — dismiss-then-confirm pattern for unsaved-changes guards

### Tertiary (LOW confidence — flagged for validation)
- `maxFontSizeMultiplier` Fabric reliability (`facebook/react-native#47499`, `#35658`) — issue existence and labels confirmed via WebSearch, but exact fix/ship status could not be independently confirmed in this session (see Assumption A1)
- Android `sendAccessibilityEvent(reactTag, 'focus')` as a TalkBack focus-move workaround (`facebook/react-native#37015`, closed "not planned") — reported by community, not an official recommendation (see Assumption A2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version and peer-dependency claim was checked live against the npm registry in this session, not recalled from training data
- Architecture: MEDIUM — the outer-Stack/custom-tabBar/history-store design is assembled from several independently-documented primitives (Expo Router docs, React Navigation docs) rather than one official recipe for this exact 8-deep-cross-tab-history shape; flagged as Assumption A3
- Pitfalls: MEDIUM-HIGH — the two highest-impact pitfalls (predictive-back/BackHandler, maxFontSizeMultiplier on Fabric) are backed by specific, named GitHub issues, but their precise fix status in RN 0.86.3 specifically was not independently reproduced in this session

**Research date:** 2026-09-26
**Valid until:** 30 days for the architecture/pitfalls content (stable unless RN/Expo ship a fix for the two flagged bugs); re-verify package versions at implementation time regardless, per standard practice, since the ecosystem moves in weekly patches
