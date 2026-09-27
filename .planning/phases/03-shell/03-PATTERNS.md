# Phase 3: Shell - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 24 (new) + 3 (modified)
**Analogs found:** 20 / 24 direct, 4 no-analog (genuinely new shapes, RESEARCH.md's Code Examples are the fallback)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shell/backHistory/backHistoryReducer.ts` | utility (pure reducer) | transform | `src/ui/syncStatusLabel.ts` + `src/features/system/routeDecision.ts` | role-match (pure fn, no React/RN import) |
| `src/shell/backHistory/BackHistoryProvider.tsx` | provider | event-driven | `src/features/auth/AuthProvider.tsx` | exact (Context + Provider + hook-with-throw shape) |
| `src/shell/backHistory/useAndroidBackHandler.ts` | hook | event-driven | `src/theme/motion.ts` (`useReduceMotion`) | role-match (subscribe/unsubscribe hook pattern) |
| `src/shell/tabBar/TabBar.tsx` | component | request-response (render prop) | `src/ui/SyncStatusLine.tsx` (theme/i18n wiring) + RESEARCH.md Pattern 2 (no in-repo `tabBar` prop precedent) | role-match |
| `src/shell/tabBar/TabGlyphs.tsx` | component (SVG) | transform | `src/features/auth/brand/AppleMark.tsx` / `GoogleMark.tsx` | exact (same `<Svg><Path>` prop shape) |
| `src/shell/tabBar/availableTabs.ts` | utility (pure) | transform | `src/features/system/routeDecision.ts` | exact (pure decision function, unit-tested alone) |
| `src/shell/tabBar/direction.ts` (pure fn RESEARCH.md flags for testing) | utility (pure) | transform | `src/ui/syncStatusLabel.ts` | role-match |
| `src/shell/fab/FabProvider.tsx` | provider | event-driven | `src/features/auth/AuthProvider.tsx` | exact |
| `src/shell/fab/shouldHideFab.ts` | utility (pure) | transform | `src/features/system/routeDecision.ts` | exact |
| `src/shell/fab/Fab.tsx` | component | request-response | `src/ui/SyncStatusLine.tsx` | role-match |
| `src/shell/fab/FabQuickMenu.tsx` | component (sheet content) | request-response | none in-repo (Phase 2 not yet executed) | no-analog — use UI-SPEC + RESEARCH.md D-11/D-13 |
| `src/shell/sheet/SheetContainer.tsx` | component (wraps 3rd-party) | event-driven | none in-repo (`@gorhom/bottom-sheet` not yet installed) | no-analog — RESEARCH.md Pattern/Pitfall 5 is the reference |
| `src/shell/sheet/DiscardChangesDialog.tsx` | component | request-response | none in-repo | no-analog — small, follow `Fab.tsx`/dialog conventions once built |
| `src/shell/header/TabHeader.tsx` | component | request-response | `src/ui/Screen.tsx` + `src/ui/SyncStatusLine.tsx` | role-match (composes `useScreenInsets`, `textRole`) |
| `src/shell/a11yFocus.ts` | utility (platform-branched) | transform | `src/theme/motion.ts` (`useReduceMotion`, `AccessibilityInfo` usage) | role-match (same `AccessibilityInfo` API family) |
| `src/theme/motion.ts` (extend) | config/utility | transform | itself (existing file, additive edit) | exact |
| `src/theme/layout.ts` (extend) | config/utility | transform | itself (existing file, additive edit) | exact |
| `app/(app)/_layout.tsx` (rewrite) | route/layout | request-response | itself (existing file, current single-`Stack` version) | exact (extend the same file) |
| `app/(app)/(tabs)/_layout.tsx` (new) | route/layout | request-response | `app/(app)/_layout.tsx` (existing `Stack` + `useConsent` gating pattern) | role-match |
| `app/(app)/(tabs)/index.tsx` (Home root) | route/screen | request-response | `app/(app)/you.tsx` | role-match (need to read for wrapper conventions — see note) |
| `app/(app)/(tabs)/activity.tsx` | route/screen | request-response | `app/(app)/you.tsx` | role-match |
| `app/(app)/(tabs)/decide.tsx`, `grow.tsx`, `insights.tsx` (href:null stubs) | route/screen | request-response | `app/update-required.tsx` (minimal placeholder screen) | role-match |
| `src/shell/__tests__/testUtils.tsx` (shared render helper) | test utility | transform | `src/ui/__tests__/Screen.safeArea.test.tsx` (inline `ThemeProvider` wrap) | role-match |
| `src/shell/backHistory/__tests__/backHistoryReducer.test.ts` | test | transform | `src/theme/__tests__/reducedMotion.test.tsx` (structure) + engine-style pure-fn tests | role-match |
| `src/shell/tabBar/__tests__/TabBar.a11y.test.tsx` | test (RNTL) | request-response | `src/ui/__tests__/Screen.safeArea.test.tsx` | role-match |

**Note on tab-root screens:** `app/(app)/you.tsx` was not read in full (out of this phase's write scope) but is confirmed to exist and is the only other screen-level route in the codebase today — planner/executor should open it once at implementation time to confirm whether it already wraps itself in `<Screen>` directly or expects the shell to do so, since Phase 3's `TabHeader`/`Screen` composition must not double-apply safe-area padding.

## Pattern Assignments

### `src/shell/backHistory/backHistoryReducer.ts` (utility, transform)

**Analog:** `src/features/system/routeDecision.ts` (pure-function shape) + `src/ui/syncStatusLabel.ts` (pure-function-with-helpers shape)

**Purity contract** (routeDecision.ts lines 1-13):
```typescript
// FND-09 / D-25: the single, pure, tested function that decides which route the root layout
// shows. Kept free of any React/Expo Router import so it stays trivially testable and so the
// version gate is provably enforced ahead of every other routing concern.

export type Route = 'splash' | 'update-required' | 'welcome' | 'app';
export type GateStatus = 'checking' | 'ok' | 'blocked';
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface RouteInput {
  gate: GateStatus;
  auth: AuthStatus;
}
```

**Core transform pattern** (syncStatusLabel.ts lines 30-58 — private helper + public entry point):
```typescript
function primaryLabel(status: SyncStatus, now: number): SyncLabel {
  if (!status.isOnline) {
    return status.queued > 0 ? { key: 'sync.offlineQueued', count: status.queued } : { key: 'sync.offline' };
  }
  // ...ordered if-chain, each branch documented by why it wins
}

export function syncStatusLabel(status: SyncStatus, now: number): SyncStatusLabelResult {
  return { primary: primaryLabel(status, now), failed: status.failed, conflicts: status.conflicts };
}
```

**Apply to `backHistoryReducer.ts`:** write `pushEntry`/`popEntry` (RESEARCH.md Pattern 3 already gives the exact signatures) as top-level exported pure functions with a leading comment block explaining the 8-cap and ordering rule, exactly matching `routeDecision.ts`'s doc-comment style ("Kept free of any React/Expo Router import so it stays trivially testable"). No React, no RN, no Expo Router import in this file — the same discipline the project already applies to `routeDecision.ts` and `syncStatusLabel.ts`.

---

### `src/shell/backHistory/BackHistoryProvider.tsx` (provider, event-driven)

**Analog:** `src/features/auth/AuthProvider.tsx`

**Full Context + Provider + throwing-hook shape** (lines 1-79, imports 1-13 elided, structure lines 15-79):
```typescript
export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signInWithApple(): Promise<SignInResult>;
  signInWithGoogle(): Promise<SignInResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    // subscribe on mount, unsubscribe in cleanup
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => { /* ... */ });
    return () => { subscription.unsubscribe(); };
  }, []);

  const value: AuthContextValue = { status, session, user: session?.user ?? null, signInWithApple, signInWithGoogle };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

**Apply to `BackHistoryProvider.tsx` / `FabProvider.tsx` / `SheetGuardProvider.tsx`:** same three-part shape exactly — a typed `*ContextValue` interface, a null-default `createContext`, a `*Provider` component holding the actual state (here: the 8-entry ring buffer via `useReducer(backHistoryReducer...)` rather than `useState`, since the pure reducer already exists), and a `use*()` hook that throws if called outside its provider. `ThemeProvider.tsx` is the second reference for the `useMemo`-wrapped context value if the value object has many fields (avoids re-render storms on every consumer).

---

### `src/shell/backHistory/useAndroidBackHandler.ts` (hook, event-driven)

**Analog:** `src/theme/motion.ts`'s `useReduceMotion()` (subscribe/cleanup hook shape)

**Subscribe-in-effect, cleanup-in-return pattern** (motion.ts lines 21-42):
```typescript
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
      setReduced(value);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
```

**Apply to `useAndroidBackHandler.ts`:** replace `AccessibilityInfo.addEventListener('reduceMotionChanged', ...)` with `BackHandler.addEventListener('hardwareBackPress', ...)`, same "subscribe on mount, `.remove()` in cleanup" shape. RESEARCH.md's own Pattern 3 code example already gives the D-06-ordered body (`sheetGuard.hasOpenSheet → popEntry → home fallback → return false`) — combine that body with this file's subscribe/cleanup skeleton. **Critical dependency, not optional:** confirm `app.config.ts`'s `android` block gets `predictiveBackGestureEnabled: false` added in the same phase (currently absent — verified by reading `app.config.ts` directly), or this hook's listener will not fire on Android 13–15 per RESEARCH.md Pitfall 1.

---

### `src/shell/tabBar/TabGlyphs.tsx` (component, transform)

**Analog:** `src/features/auth/brand/AppleMark.tsx` (and `GoogleMark.tsx`, same shape)

**`<Svg>`/`<Path>` prop-driven glyph component** (AppleMark.tsx lines 34-45):
```typescript
export interface AppleMarkProps {
  size?: number;
  color?: string;
}

export function AppleMark({ size = 18, color = '#FFFFFF' }: AppleMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 73 73">
      <Path d={APPLE_LOGO_PATH} fill={color} />
    </Svg>
  );
}
```

**Apply to `TabGlyphs.tsx`:** one exported component per glyph (or a single `TabGlyph({ name, color })` dispatcher, per UI-SPEC's five-glyph table), each taking `color` as a prop resolved by the caller from `ink`/`inkMuted` (UI-SPEC: "tab selection does NOT use accent" — never default `color` to `colors.accent`). Use `<Rect>`/`<Path>`/`<Circle>` per UI-SPEC's exact per-glyph shape table (Home = 4 rounded rects, Decide = diamond outline path + check path, etc.), `viewBox="0 0 22 22"`, `aria-hidden` on the `<Svg>` itself per UI-SPEC (the parent `Pressable`/button carries the accessible name, mirroring how `AppleMark`/`GoogleMark` are themselves wrapped by an accessible button one level up in `AppleSignInButton.tsx`/`GoogleSignInButton.tsx` — check those two files' wrapping convention at implementation).

---

### `src/shell/tabBar/availableTabs.ts` / `src/shell/fab/shouldHideFab.ts` (utility, transform)

**Analog:** `src/features/system/routeDecision.ts`

Same exact pattern as `backHistoryReducer.ts` above (see that section) — a single pure exported function taking a small typed input object and returning a decision, doc-commented with the "kept free of React/RN import" discipline. RESEARCH.md's Code Examples section already provides the exact body for `shouldHideFab` (lines "export function shouldHideFab(state: {...}): boolean") and the `href: isTabAvailable('decide') ? undefined : null` usage for `availableTabs.ts` — both should be written in this pure-function house style, not inlined into components.

---

### `src/shell/tabBar/TabBar.tsx` / `src/shell/fab/Fab.tsx` / `src/shell/header/TabHeader.tsx` (components, request-response)

**Analog:** `src/ui/SyncStatusLine.tsx` (theme/i18n/layout wiring shape — the most complete example of a themed, translated, token-driven shell-adjacent component already in the repo)

**Full wiring pattern** (SyncStatusLine.tsx lines 1-49):
```typescript
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { syncStatusLabel } from './syncStatusLabel';

export function SyncStatusLine() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const status = useSyncStatus();
  // ...
  const labelStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  return (
    <View style={styles.column}>
      <Text style={labelStyle}>{t(primary.key, { count: primary.count })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ column: { gap: 2 } });
```

**Apply to `TabBar.tsx`/`Fab.tsx`/`TabHeader.tsx`:** import `useTheme()` for `colors`/`pairing`, `useT()` for every label (never inline JSX text — DSG-04, enforced by `eslint-plugin-i18next`), `textRole(pairing, role)` + `fontSize.*` for every text style (never a hand-rolled font size — the declared-exception sizes like `fontSize.tabLabel`/`fontSize.s13_5` are already in `typography.ts`, see that file). For `TabHeader.tsx` specifically, also compose `useScreenInsets()` from `src/theme/layout.ts` exactly as `Screen.tsx` does (see next section) rather than re-deriving safe-area math.

**`TabBar.tsx`'s render-prop constraint (Pitfall 4, RESEARCH.md):** unlike every other component above, `TabBar` receives `navigation` as a prop from React Navigation's `tabBar` render prop and must never call `useNavigation()` internally — thread the prop through instead.

---

### `src/shell/header/TabHeader.tsx` composing `Screen.tsx`'s insets convention

**Analog:** `src/ui/Screen.tsx`

**Safe-area-derived offset, never hardcoded** (layout.ts lines 36-44 + Screen.tsx lines 22-49):
```typescript
// src/theme/layout.ts
export function useScreenInsets(): ScreenInsets {
  const i = useSafeAreaInsets();
  return { top: i.top, headerTop: i.top + space.headerExtra, bottom: i.bottom, left: i.left, right: i.right };
}
```
```typescript
// src/ui/Screen.tsx
const { colors } = useTheme();
const insets = useScreenInsets();
const paddingStyle: ViewStyle = {
  backgroundColor: colors.canvas,
  paddingTop: insets.headerTop,
  paddingBottom: insets.bottom,
  paddingHorizontal: space.screenH,
};
```

**Apply to `TabHeader.tsx`:** the large-title block's top offset must be `insets.headerTop` (`insets.top + space.headerExtra`), exactly the DSG-03 discipline `Screen.tsx` already encodes — never a literal like the prototype's reference-device `68`. Same discipline applies to the tab bar's own bottom padding (UI-SPEC: `max(insets.bottom, 12)`) and the FAB's `bottom` offset (UI-SPEC: computed from tab-bar height + 16px gap, not the prototype's literal `96`) — none of these three shell measurements may hardcode a device-specific pixel value; all three route through `useScreenInsets()` or a runtime-measured height, matching this file's existing convention.

---

### `app/(app)/_layout.tsx` (rewrite — outer Stack)

**Analog:** itself, current version (full file, 29 lines)

**Current file, to be extended not replaced wholesale:**
```typescript
import { Redirect, Stack, usePathname } from 'expo-router';
import { useConsent } from '@/features/consent/useConsent';
import { Screen } from '@/ui/Screen';

export default function AppLayout() {
  const { loading, needsPrompt } = useConsent();
  const pathname = usePathname();

  if (loading) {
    return <Screen>{null}</Screen>;
  }
  if (needsPrompt && pathname !== '/consent') {
    return <Redirect href="/consent" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="you" />
      <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
```

**Apply:** keep the `useConsent()`/`loading`/`needsPrompt`/`<Redirect>` gate exactly as-is (D-04/CONTEXT.md canonical refs require "the consent redirect must keep working") — wrap the returned `<Stack>` with `<BackHistoryProvider><FabProvider><SheetGuardProvider>` (RESEARCH.md's diagram), rename the `you` screen registration to live inside the new `(tabs)` group's per-tab avatar push target instead of a direct sibling (D-04: "You... pushed from the avatar at the top right of each tab's root header, not only Home"), and add `<Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />` per RESEARCH.md Pattern 1, with any future detail routes as additional siblings with `gestureEnabled: true`.

---

### `app/(app)/(tabs)/_layout.tsx` (new — Tabs with custom tabBar)

**Analog:** `app/(app)/_layout.tsx` (existing `Stack` + gating idiom, one level up) — no existing `Tabs` usage in-repo, so RESEARCH.md's Pattern 2/Code Examples ("Hiding a not-yet-shipped tab") is the primary source, with the existing `_layout.tsx`'s import/structure conventions (named default export, `screenOptions={{ headerShown: false }}`) carried over:
```typescript
// existing convention to preserve: named default export, headerShown: false at the navigator level
export default function AppLayout() { /* ... */ }
```
```typescript
// RESEARCH.md Code Examples — D-02/D-03 tab-availability pattern
<Tabs.Screen
  name="decide"
  options={{ href: isTabAvailable('decide') ? undefined : null }}
/>
```

---

## Shared Patterns

### Context + Provider + throwing hook (BackHistoryProvider, FabProvider, SheetGuardProvider)
**Source:** `src/features/auth/AuthProvider.tsx` (lines 25-79), secondary `src/theme/ThemeProvider.tsx` (lines 22-84 — use this one for the `useMemo`-wrapped value if the context has many fields, to avoid needless consumer re-renders)
**Apply to:** all three new shell providers.
```typescript
const XContext = createContext<XContextValue | null>(null);
export function XProvider({ children }: { children: React.ReactNode }) {
  // state via useState/useReducer
  const value = useMemo<XContextValue>(() => ({ /* ... */ }), [/* deps */]);
  return <XContext.Provider value={value}>{children}</XContext.Provider>;
}
export function useX(): XContextValue {
  const ctx = useContext(XContext);
  if (!ctx) throw new Error('useX must be used within an XProvider');
  return ctx;
}
```

### Pure decision/transform functions, no React/RN import
**Source:** `src/features/system/routeDecision.ts` (whole file), `src/ui/syncStatusLabel.ts` (whole file)
**Apply to:** `backHistoryReducer.ts`, `availableTabs.ts`, `shouldHideFab.ts`, `direction.ts` — every file RESEARCH.md's Wave 0 test plan calls out as unit-testable-without-RN. Doc-comment each with an explicit "why this stays free of React/RN/Expo Router imports" note, matching `routeDecision.ts`'s own comment.

### Theme + i18n + typography wiring in a shell component
**Source:** `src/ui/SyncStatusLine.tsx` (whole file, 49 lines)
**Apply to:** `TabBar.tsx`, `Fab.tsx`, `TabHeader.tsx`, `FabQuickMenu.tsx`, `DiscardChangesDialog.tsx` — always `useTheme()` for colour, `useT()` for every string, `textRole(pairing, role)` + `fontSize.*` for type, never a raw hex or literal font size (DSG-02/DSG-04, enforced respectively by `src/theme/__tests__/noRawColours.test.ts` and the i18next eslint rule).

### Safe-area-derived, never-hardcoded layout offsets
**Source:** `src/theme/layout.ts`'s `useScreenInsets()` (lines 36-44) + `src/ui/Screen.tsx`'s usage (lines 22-49)
**Apply to:** `TabHeader.tsx` (large-title top offset), `TabBar.tsx` (bottom padding), `Fab.tsx` (bottom offset) — DSG-03 discipline, explicitly called out per-element in `03-UI-SPEC.md`'s Spacing Scale table (`tab-bar-pad`, `fab-bottom`, `toast-inset` all say "not the prototype's literal Npx").

### Reduced-motion-gated duration for any plain-JS timing
**Source:** `src/theme/motion.ts` (whole file, `useReduceMotion`/`useMotion`/`DURATION`/`EASING`)
**Apply to:** every one of the seven named shell animations plus the FAB-lift-above-toast animation (D-21) — extend `DURATION` with `tabSlide: 260` and `push: 240` in this same file (UI-SPEC's explicit required addition) rather than creating a second motion-constants file.

### RNTL component test with an inline `ThemeProvider` wrap and a mocked native module
**Source:** `src/ui/__tests__/Screen.safeArea.test.tsx` (whole file) — `jest.mock('react-native-safe-area-context', ...)` + `render(<ThemeProvider><Component /></ThemeProvider>)` + `toJSON()`/`StyleSheet.flatten` assertions
**Apply to:** `TabBar.a11y.test.tsx`, `TabHeader` tests, any shell component test needing insets or theme. Build the RESEARCH.md-flagged `renderWithShellProviders()` helper (`src/shell/__tests__/testUtils.tsx`) as a thin wrapper composing `ThemeProvider` + the three new shell providers, following this file's inline-wrap style rather than a heavier custom render utility.

### Hook test with a mocked subscribe/unsubscribe native API
**Source:** `src/theme/__tests__/reducedMotion.test.tsx` (whole file) — `jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(...)`, capture the listener, `act()` + `fire()` to simulate an event, assert via `renderHook`/`waitFor`
**Apply to:** `useAndroidBackHandler.test.ts` — same shape, substituting `BackHandler.addEventListener('hardwareBackPress', ...)` for `AccessibilityInfo.addEventListener('reduceMotionChanged', ...)`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/shell/sheet/SheetContainer.tsx` | component (wraps `@gorhom/bottom-sheet`) | event-driven | `@gorhom/bottom-sheet` is not yet installed and Phase 2 (which would own the first sheet usage) has not been executed in this worktree — no in-repo bottom-sheet code exists at all. Use RESEARCH.md's Architecture Patterns → Pattern 5/Pitfall 5 (dismiss-then-confirm, not intercept-then-block) as the primary reference, plus the library's own docs for `BottomSheetModal`/`enablePanDownToClose`/`onChange` wiring. |
| `src/shell/fab/FabQuickMenu.tsx` | component (sheet content) | request-response | Depends on `SheetContainer` existing first; no analog until that's built. Compose it from `SheetContainer` + the `SyncStatusLine.tsx`-style theme/i18n wiring (Shared Patterns above) once available. |
| `src/shell/sheet/DiscardChangesDialog.tsx` | component | request-response | Same dependency — first dialog-style component in the shell; no existing dialog/modal component in-repo to copy from. Build from UI-SPEC's exact copy table ("Discard changes?" / "Discard" danger / "Keep editing" default) plus the theme/i18n Shared Pattern. |
| `app/(app)/(tabs)/index.tsx`, `activity.tsx` (content) | route/screen | request-response | This phase only creates thin wrapper routes (Home/Activity *content* is Phase 1/2's own scope per `03-CONTEXT.md`'s "Not in this phase" list) — there is nothing to pattern-match against yet beyond the route-file skeleton convention already covered by `app/(app)/_layout.tsx` and `app/update-required.tsx`. |

## Metadata

**Analog search scope:** `src/`, `app/`, `app.config.ts`, `package.json` (entire repo except `node_modules`)
**Files scanned directly (Read):** `03-CONTEXT.md`, `03-RESEARCH.md`, `03-UI-SPEC.md`, `src/theme/motion.ts`, `src/theme/layout.ts`, `src/theme/tokens.ts`, `src/theme/typography.ts`, `src/theme/ThemeProvider.tsx`, `src/ui/Screen.tsx`, `src/ui/SyncStatusLine.tsx`, `src/ui/syncStatusLabel.ts`, `src/ui/__tests__/Screen.safeArea.test.tsx`, `src/theme/__tests__/reducedMotion.test.tsx`, `src/features/consent/useConsent.ts`, `src/features/auth/AuthProvider.tsx`, `src/features/auth/brand/AppleMark.tsx`, `src/features/system/routeDecision.ts`, `src/data/sync/useSyncStatus.ts`, `src/i18n/index.ts`, `src/i18n/locales/en.ts` (partial), `app/(app)/_layout.tsx`, `app/_layout.tsx`, `app.config.ts`, `package.json` (partial)
**Key repo-state fact for the planner:** this worktree has Phase 2 ("Record") **not yet executed** — `src/features/` has no `record`/`entry` directory, and no bottom-sheet code exists anywhere. Every sheet-shaped file in this phase (`SheetContainer`, `FabQuickMenu`, `DiscardChangesDialog`) is a true first-of-its-kind in the codebase; do not expect Phase 2 sheet code to exist as a reference during Phase 3 execution unless Phase 2 has landed by then.
**Pattern extraction date:** 2026-09-26
