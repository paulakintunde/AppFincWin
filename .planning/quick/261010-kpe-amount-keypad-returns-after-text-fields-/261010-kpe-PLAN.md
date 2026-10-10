---
phase: quick-261010-kpe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/record/entry/TransactionSheet.tsx
  - src/features/record/entry/__tests__/TransactionSheet.keypad.test.tsx
  - src/features/navigation/swipeBackGesture.ts
  - src/features/navigation/__tests__/swipeBackGesture.test.ts
  - src/features/navigation/SwipeBack.tsx
  - src/features/navigation/__tests__/SwipeBack.test.tsx
  - app/(app)/_layout.tsx
  - src/features/you/YouScreen.tsx
  - src/features/you/__tests__/YouScreen.test.tsx
autonomous: true
requirements: [QUICK-261010-KPE]

must_haves:
  truths:
    - "After focusing the name or note field, tapping the amount display hides the keyboard, shows the keypad, and keypad digits change the amount (new and edit mode)"
    - "Hiding the keyboard with Android system back brings the keypad back"
    - "Opening a category/account/payment/currency picker row dismisses the keyboard"
    - "On Android, a fast rightward swipe from the left edge of any inner (app) screen goes back one page"
    - "The swipe never fires on Activity (main page), consent, or setup screens, nor on short/vertical/mid-screen swipes, nor when router.canGoBack() is false"
    - "iOS keeps its native swipe-back and is not double-handled"
    - "You -> Activity returns to the existing Activity instead of stacking a duplicate"
  artifacts:
    - path: "src/features/navigation/swipeBackGesture.ts"
      provides: "pure shouldSwipeBack threshold function + constants"
      exports: ["shouldSwipeBack", "SWIPE_BACK_EDGE_WIDTH", "SWIPE_BACK_DISTANCE", "SWIPE_BACK_VELOCITY", "isSwipeBackRoute"]
    - path: "src/features/navigation/SwipeBack.tsx"
      provides: "Android edge-pan wrapper calling router.back()"
      exports: ["SwipeBack"]
  key_links:
    - from: "app/(app)/_layout.tsx"
      to: "SwipeBack"
      via: "Stack screenLayout prop wrapping each screen"
      pattern: "screenLayout"
    - from: "src/features/navigation/SwipeBack.tsx"
      to: "router.back"
      via: "Pan gesture onEnd -> shouldSwipeBack -> router.canGoBack() && router.back()"
      pattern: "router\\.back\\(\\)"
    - from: "src/features/record/entry/TransactionSheet.tsx"
      to: "Keyboard"
      via: "keyboardDidHide/keyboardDidShow listeners + Keyboard.dismiss on amount/picker press"
      pattern: "keyboardDidHide"
---

<objective>
Fix two Phase 02.2 device-walkthrough bugs (Pixel 9, Android, 3-button nav — no system edge-swipe):

A. The TransactionSheet amount becomes uneditable once a text field (name/note) has been focused: the keypad is hidden while `textFocused` is true, and nothing on the amount path ever clears it.
B. No swipe-back on Android inner screens. Add an in-app left-edge swipe-back for the (app) stack (Android only), slide_from_right page animation, and stop YouScreen stacking duplicate Activity entries.

Output: fixed TransactionSheet + tests; a reusable `SwipeBack` wrapper + pure gesture logic + tests; (app) layout wiring; YouScreen navigation fix.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/dev/fincwin-w1/CLAUDE.md
@C:/dev/fincwin-w1/.planning/STATE.md
Repository root for ALL paths: C:/dev/fincwin-w1 (worktree, branch fix/amount-keypad-swipe-back). Never touch C:/dev/fincwin, fincwin-p2, fincwin-d1.

<interfaces>
TransactionSheet.tsx (current, line numbers approximate):
- :6  `import React, { useMemo, useState } from 'react';`  :8 `import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';`
- :177 `const [picker, setPicker] = useState<PickerKey>(null);` — there is also `textFocused`/`setTextFocused` and `activeAmount`/`setActiveAmount` ('out' | 'in') state.
- :472 `const keypadVisible = !textFocused;`
- :476 `const textFocusProps = { onFocus: () => setTextFocused(true), onBlur: () => setTextFocused(false) };`
- :517-525 first amount Pressable `onPress={() => setActiveAmount('out')}`; :534 second (cross-currency) amount `onPress={() => setActiveAmount('in')}`
- :537 `{keypadVisible ? <Keypad value=... onChange=... /> : null}`
- :545 name TextInput `{...textFocusProps}`; :649 note TextInput (multiline) `{...textFocusProps}`
- Rows calling `setPicker(...)`: category (:557), account/fromAccount/toAccount (:563-570), payment (:582), currency (:589)
- src/ui/Sheet.tsx:111 SheetScroll uses `keyboardShouldPersistTaps="handled"` (do NOT change — other sheets rely on it). Sheet.tsx:42-43 already shows the Keyboard.addListener pattern (`const sub = Keyboard.addListener('keyboardDidHide', ...); return () => sub.remove();`).
- Existing test harness to copy mocks from: src/features/record/entry/__tests__/TransactionSheet.test.tsx (mocks expo-router, mutations, queries, safe-area; wraps in ThemeProvider). Keypad digit keys: see src/ui/__tests__/Keypad.test.tsx for how digits are pressed.

expo-router 57:
- `router.back()`, `router.canGoBack()`, `router.dismissTo(href)` (exported from expo-router; dismissTo pops back to an existing route in the stack, pushing it only if absent), `router.navigate(href)`.
- `<Stack screenLayout={({ children, route }) => ReactNode} />` is supported (expo-router/build/fork/native-stack/createNativeStackNavigator.d.ts). `route.name` is the file route name: 'activity', 'accounts/index', 'accounts/[id]', 'categories', 'history', 'import', 'setup/account', 'setup/history', 'you', 'consent'.
- native-stack screen options: `animation: 'slide_from_right' | 'none' | ...`, `animationDuration`, `gestureEnabled`.

react-native-gesture-handler ~2.32 (installed; GestureHandlerRootView already mounted in app/_layout.tsx:8):
- `import { Gesture, GestureDetector } from 'react-native-gesture-handler';`
- `Gesture.Pan().runOnJS(true).hitSlop({ left: 0, width: EDGE })` restricts activation to a left strip; `.activeOffsetX(12)` (rightward only), `.failOffsetY([-20, 20])`, `.onEnd((e) => ...)` with e.translationX, e.translationY, e.velocityX, e.absoluteX; `.withTestId('swipe-back')`.
- Jest: `import 'react-native-gesture-handler/jestSetup'` (not in jest.setup.ts today — import it in the test file) and `import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'`; `fireGestureHandler(getByGestureTestId('swipe-back'), [{ state: State.BEGAN, absoluteX: 5, translationX: 0 }, { state: State.ACTIVE, translationX: 60 }, { state: State.END, translationX: 120, velocityX: 900 }])`.

src/theme/motion.ts: `export function useReduceMotion(): boolean`.
src/features/auth/appHome.ts: `export const APP_HOME_HREF = '/activity' as Href;`
src/features/you/YouScreen.tsx:29-35 MONEY_ROWS (Activity, Accounts, Categories, Import, History hrefs); :89 `onPress={() => router.push(row.href)}`. YouScreen.test.tsx:66 mocks `router: { push: ... }`, :326-338 asserts all five rows push.

Phase 3 compatibility (do not implement, keep compatible): 03-06-PLAN adds src/shell/backHistory/useAndroidBackHandler.ts (hardwareBackPress: sheet -> history -> Home) and 03-13-PLAN moves to JS Tabs with native stacks per tab using `animation: 'slide_from_right'` (240ms) and makes the tab group swipe-back-disabled. Keep SwipeBack self-contained in src/features/navigation/ so Phase 3 can reuse it per tab stack and route it through its BackHistory goBack instead of router.back.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bug A — keypad returns after text fields (explicit active-field state)</name>
  <files>src/features/record/entry/TransactionSheet.tsx, src/features/record/entry/__tests__/TransactionSheet.keypad.test.tsx</files>
  <behavior>
    - Test 1 (new): focus name TextInput (fireEvent(input, 'focus')) -> keypad not rendered; press the amount display -> keypad rendered, Keyboard.dismiss called; press digits -> amount display text reflects them.
    - Test 2 (new): focus name -> press the category Row (picker opens) -> close the picker -> press amount -> keypad visible and digits edit the amount.
    - Test 3 (new): focus note -> simulate keyboardDidHide (capture the listener via jest.spyOn(Keyboard, 'addListener') and invoke the 'keyboardDidHide' callback inside act) -> keypad visible without pressing anything.
    - Test 4 (new): edit mode with an existing transaction (reuse the edit-mode fixture from TransactionSheet.test.tsx): focus name -> press amount -> keypad visible, a digit/backspace changes the amount, Save sends the new amount_minor.
    - Test 5 (new): pressing a picker Row while a text field is focused calls Keyboard.dismiss.
    - Existing TransactionSheet.test.tsx and pickers tests still pass unchanged.
  </behavior>
  <action>
RED first: create TransactionSheet.keypad.test.tsx copying the mock block/render helper from TransactionSheet.test.tsx (keep it a separate file so the big suite stays readable); run it and confirm Tests 1-4 fail on current code.

GREEN in TransactionSheet.tsx:
1. Replace the `textFocused` boolean with `const [activeField, setActiveField] = useState<'amount' | 'text'>('amount');` and `const keypadVisible = activeField === 'amount';`.
2. Add refs `nameRef`, `noteRef` (`useRef<TextInput>(null)`) and pass `ref` to the name and note TextInputs. Replace textFocusProps with `{ onFocus: () => setActiveField('text') }` only — do NOT reset on blur (blur alone is unreliable on Android; restoration is driven by the explicit paths below).
3. Add `const focusAmount = (which: 'out' | 'in') => { Keyboard.dismiss(); nameRef.current?.blur(); noteRef.current?.blur(); setActiveAmount(which); setActiveField('amount'); };` and use it in both amount Pressables (:517-525 with 'out', :534 with 'in'). Keep the first Pressable's accessibilityRole logic, but it must be pressable in all modes (it already has onPress) — confirm a non-cross-currency press also triggers focusAmount.
4. `useEffect` subscribing to `Keyboard.addListener('keyboardDidHide', ...)` -> blur both refs and `setActiveField('amount')`; and `'keyboardDidShow'` -> `setActiveField('text')` (covers re-tapping an already-focused input on Android, where onFocus does not re-fire). Cleanup with `sub.remove()` for both. Pattern mirrors src/ui/Sheet.tsx:42-43.
5. Add `const openPicker = (key: Exclude<PickerKey, null>) => { Keyboard.dismiss(); setPicker(key); };` and route every Row `onPress={() => setPicker(...)}` through it (category, account, fromAccount, toAccount, payment, currency). The keyboardDidHide listener then restores the keypad.
6. Add `Keyboard` and `useEffect`/`useRef` to the existing imports. Do NOT change Sheet.tsx's keyboardShouldPersistTaps.
No new copy, no new styles/tokens. Add a one-line comment at the state declaration: "Keypad vs keyboard is driven by an explicit active field (261010-kpe): blur is unreliable on Android with keyboardShouldPersistTaps='handled'."
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-w1 && npx jest src/features/record/entry --ci</automated>
  </verify>
  <done>All five new tests pass and every existing src/features/record/entry test passes; `grep -c "textFocused" src/features/record/entry/TransactionSheet.tsx` returns 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Bug B — Android edge swipe-back for inner (app) screens, slide animation, no duplicate Activity</name>
  <files>src/features/navigation/swipeBackGesture.ts, src/features/navigation/__tests__/swipeBackGesture.test.ts, src/features/navigation/SwipeBack.tsx, src/features/navigation/__tests__/SwipeBack.test.tsx, app/(app)/_layout.tsx, src/features/you/YouScreen.tsx, src/features/you/__tests__/YouScreen.test.tsx</files>
  <behavior>
    - shouldSwipeBack (pure): true for startX <= 28 with translationX >= 80; true for startX <= 28 with translationX >= 24 and velocityX >= 600 (fast flick); false for startX > 28 (mid-screen — SwipeRow/sliders own those); false for translationX < 24 even when fast; false when |translationY| > translationX (vertical/diagonal); false for leftward (negative) translation.
    - isSwipeBackRoute (pure): false for 'activity', 'consent', 'setup/account', 'setup/history'; true for 'accounts/index', 'accounts/[id]', 'categories', 'history', 'import', 'you'.
    - SwipeBack component (Platform.OS mocked 'android'): qualifying fired gesture with router.canGoBack() true -> router.back() called once; canGoBack false -> not called; short swipe -> not called; vertical swipe -> not called; enabled={false} -> renders children only, no gesture detector (getByGestureTestId throws / back never called).
    - SwipeBack with Platform.OS 'ios' -> renders children only, back never called (native swipe owns iOS).
    - YouScreen: pressing the Activity row calls router.dismissTo('/activity') and never router.push('/activity'); the other four rows still push their hrefs.
  </behavior>
  <action>
RED first: write swipeBackGesture.test.ts, SwipeBack.test.tsx and update YouScreen.test.tsx (mock `router: { push, dismissTo }`; change the :326-338 expectation so push receives the four non-Activity hrefs and dismissTo receives '/activity'). Run, confirm failures.

GREEN:
1. `src/features/navigation/swipeBackGesture.ts` (pure, no react imports): export `SWIPE_BACK_EDGE_WIDTH = 28` (dp — narrow so it does not fight SwipeRow rows, horizontal ScrollViews or sliders), `SWIPE_BACK_DISTANCE = 80`, `SWIPE_BACK_MIN_FLICK = 24`, `SWIPE_BACK_VELOCITY = 600`, `export interface SwipeSample { startX: number; translationX: number; translationY: number; velocityX: number }`, `export function shouldSwipeBack(s: SwipeSample): boolean` implementing the behaviour above, and `export function isSwipeBackRoute(routeName: string): boolean` (exclusion set: 'activity' — the main page per APP_HOME_HREF, 'consent', and the linear onboarding 'setup/account', 'setup/history'). Header comment: what it is, why the edge is 28dp, and that Phase 3 (03-06/03-13) should reuse these thresholds per tab stack.
2. `src/features/navigation/SwipeBack.tsx`: `export function SwipeBack({ enabled, children }: { enabled: boolean; children: ReactNode })`. If `Platform.OS !== 'android' || !enabled` return `<>{children}</>`. Otherwise build the gesture with `useMemo`: `Gesture.Pan().runOnJS(true).hitSlop({ left: 0, width: SWIPE_BACK_EDGE_WIDTH }).activeOffsetX(12).failOffsetY([-20, 20]).withTestId('swipe-back').onEnd((e) => { if (shouldSwipeBack({ startX: e.absoluteX - e.translationX, translationX: e.translationX, translationY: e.translationY, velocityX: e.velocityX }) && router.canGoBack()) router.back(); })` and render `<GestureDetector gesture={gesture}><View style={{ flex: 1 }} collapsable={false}>{children}</View></GestureDetector>`. (startX derivation: if the test util does not supply absoluteX, also accept the BEGAN event's x — keep the derivation in the component and the decision in the pure function.) Modals/Sheets render in separate windows, so the gesture cannot fire under an open sheet; note that in a comment. No visual overlay, no new colours.
3. `app/(app)/_layout.tsx`: add `screenLayout={({ children, route }) => <SwipeBack enabled={isSwipeBackRoute(route.name)}>{children}</SwipeBack>}` to the Stack, and extend `screenOptions` with `animation: Platform.OS === 'android' && !reduceMotion ? 'slide_from_right' : (Platform.OS === 'android' ? 'none' : 'default')` using `useReduceMotion()` from '@/theme/motion' (call it at the top of AppLayout, before the early returns, to respect hook order). Leave iOS gestureEnabled at its default (native swipe), keep consent's `gestureEnabled: false`.
4. `src/features/you/YouScreen.tsx`: give MONEY_ROWS entries an optional `home?: true` flag on Activity (or compare `row.href === APP_HOME_HREF` imported from '@/features/auth/appHome'); the onPress becomes `row.href === APP_HOME_HREF ? router.dismissTo(APP_HOME_HREF) : router.push(row.href)`, so returning to the main page pops back to the existing Activity instead of stacking a duplicate.
5. Also make SetupAccountScreen etc. untouched; do not change other router.replace calls.

If the rendered `screenLayout` type or `fireGestureHandler` behaves differently than documented, read the d.ts in node_modules (paths in <interfaces>) once and adapt — do not drop the behaviour.

Write the SUMMARY with a "Phase 3 reuse" note: 03-13 should apply `SwipeBack` (or its thresholds) per tab native stack on Android only, keep it off on tab roots, and route the back through 03-06's BackHistory `goBack` instead of `router.back()`; 03-06's hardwareBackPress handler is unaffected (this handles a gesture, not the back key).
  </action>
  <verify>
    <automated>cd C:/dev/fincwin-w1 && npx jest src/features/navigation src/features/you --ci</automated>
  </verify>
  <done>All new navigation tests and the updated YouScreen tests pass; `grep -c "screenLayout" "app/(app)/_layout.tsx"` >= 1; `grep -c "router.back()" src/features/navigation/SwipeBack.tsx` >= 1; `grep -v '^\s*//' src/features/you/YouScreen.tsx | grep -c "dismissTo"` >= 1.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user gesture -> navigation | Touch input triggers route pops; no data or network crosses |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kpe-01 | Tampering (data loss) | SwipeBack over a screen with unsaved sheet input | mitigate | Sheets/Modals are separate windows so the edge pan cannot fire under them; gesture is disabled on consent/setup routes; tested via enabled=false and route exclusion |
| T-kpe-02 | Tampering (wrong amount saved) | TransactionSheet keypad edits the wrong amount field | mitigate | focusAmount sets activeAmount and activeField together; Test 4 asserts the saved amount_minor in edit mode |
| T-kpe-03 | Denial of service (stuck navigation) | router.back with empty history | mitigate | router.canGoBack() guard; test asserts no call when false |
</threat_model>

<verification>
Run in C:/dev/fincwin-w1 — all must pass:
- `npm run typecheck`
- `npm run lint` (0 errors)
- `npm run depcruise` (engine/ untouched; no engine import of react/ui)
- `npm run check:ignores`
- `npm run test:coverage` (thresholds hold)
- `npm run verify:gates`
</verification>

<success_criteria>
- Amount is editable after visiting name/note/picker fields, in new and edit mode, with keyboard hidden by tap or system back.
- Android inner (app) screens pop on a fast left-edge rightward swipe; Activity/consent/setup never do; iOS uses native swipe only.
- Android (app) stack uses slide_from_right (none under reduced motion).
- You -> Activity no longer stacks a duplicate Activity.
- Full gate green.
</success_criteria>

<output>
After completion, create `C:/dev/fincwin-w1/.planning/quick/261010-kpe-amount-keypad-returns-after-text-fields-/261010-kpe-SUMMARY.md` including the "Phase 3 reuse" note.
</output>
