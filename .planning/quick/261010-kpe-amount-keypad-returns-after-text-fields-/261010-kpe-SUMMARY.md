---
phase: quick-261010-kpe
plan: 01
status: complete
branch: fix/amount-keypad-swipe-back
commits: [2588c6a, 015f487, lint-fix commit (latest on branch)]
---

# Quick 261010-kpe: Amount keypad returns after text fields + Android edge swipe-back

Explicit active-field state in TransactionSheet restores the amount keypad after name/note/picker use, and an Android-only left-edge `SwipeBack` wrapper (pure thresholds in `swipeBackGesture.ts`) gives inner (app) screens swipe-back with a slide_from_right animation.

## Task 1 - Bug A (2588c6a)
- `textFocused` replaced by `activeField: 'amount' | 'text'`. `focusAmount` (dismiss keyboard, blur refs, set active amount and field) on both amount Pressables; `openPicker` dismisses the keyboard before opening any picker; `keyboardDidHide` restores the keypad, `keyboardDidShow` sets text mode.
- 5 new tests in `TransactionSheet.keypad.test.tsx` (new + edit mode, hide listener, picker dismiss).

## Task 2 - Bug B (015f487 + lint fix)
- `swipeBackGesture.ts` (28dp edge, 80 dist, 24 flick at 600 velocity, route exclusions), `SwipeBack.tsx` (Android only, canGoBack guard), wired through `<Stack screenLayout>` in `app/(app)/_layout.tsx` with `animation` slide_from_right (none under reduced motion, default on iOS).
- YouScreen Activity row uses `router.dismissTo(APP_HOME_HREF)`; other rows still push.

## Deviations
- [Rule 1] The existing test "hides keypad while text focused" blurs the field and expects the keypad back, so `onBlur` still resets to the amount field (alongside the explicit paths). Blur is no longer the only restore path.
- Test-only: keyboard-hide listener invoked with `await act(async ...)`; sync `act` leaked scope and broke later tests in the file. Picker test placed last in file for the same environment reason.
- Lint fix: `{'x'}` children in SwipeBack tests for i18next/no-literal-string.
- RED step was not run separately for Task 1 tests (tests written alongside implementation).

## Gate (final code state)
typecheck OK; lint 0 errors (373 pre-existing warnings); depcruise OK (361 modules); check:ignores OK; test:coverage 222 suites / 5888 tests passed, thresholds held; verify:gates GATES OK.

## Phase 3 reuse
03-13 should apply `SwipeBack` (or just its `swipeBackGesture.ts` thresholds) per tab native stack on Android only, keep it off tab roots, and route the back through 03-06's BackHistory `goBack` instead of `router.back()`. 03-06's hardwareBackPress handler is unaffected: this handles a gesture, not the back key.

## Self-Check: PASSED
