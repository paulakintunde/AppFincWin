---
status: resolved
trigger: "Swipe-to-remove does not work inside bottom sheets on Android (Phase 02.3 device walkthrough, step 6, Pixel 9 dev client)"
created: 2026-10-13
updated: 2026-10-13
---

# Debug: swipe inside sheets does nothing on Android

## Symptoms

<!-- DATA_START -->
- Expected: in the entry sheet's bulk list (Add to list), swiping a listed item left reveals Remove and, past the threshold, removes it from the list. This works the same as SwipeRow on the Activity screen.
- Actual: swiping a listed item left does nothing. No Remove action is revealed and nothing is removed.
- Errors: none reported on screen.
- Timeline: first exercised in the 02.3 device walkthrough on 2026-10-13. EntryList is new in 02.3-18 and was wired in 02.3-19. SwipeRow on the Activity screen (not in a sheet) works.
- Reproduction: Pixel 9, Android dev client loading merged main ede43d5 from Metro. Tap Add, Money out, enter an amount and description, tap Add to list (repeat for 3 items), then swipe one list row left.
<!-- DATA_END -->

## Evidence

- src/ui/Sheet.tsx rendered every sheet in an RN `<Modal transparent>`. On Android a Modal is a separate native window.
- The only `GestureHandlerRootView` was in app/_layout.tsx:91, outside every Modal, so react-native-gesture-handler gestures inside a sheet (the `ReanimatedSwipeable` in SwipeRow) never received touches.
- The same SwipeRow on the Activity screen, which is not in a Modal, worked. That matches the hypothesis.

## Eliminated

- Gesture thresholds or `activeOffsetX` on SwipeRow: unchanged, and swipe works once the root is present.
- The vertical ScrollView or the Pressable wrapper taking the touch: unchanged, and swipe works once the root is present.

## Resolution

- root_cause: no GestureHandlerRootView inside the RN Modal that hosts every sheet, so RNGH gestures in sheets got no touches on Android.
- fix: 4d77161 wraps the sheet's KeyboardAvoidingView in `<GestureHandlerRootView testID="sheet-gesture-root">`. jest.setup.ts loads `react-native-gesture-handler/jestSetup`. The regression test is src/ui/__tests__/Sheet.gestureRoot.test.tsx.
- verification: `npx jest src/ui src/features/record` passed 82 suites and 1104 tests, and typecheck was clean. On 2026-10-13 the user confirmed on the Pixel 9 that a swipe removes a list item, as part of the 02.3 walkthrough approval.
- follow_up: the user then asked for an Undo on list removal. That is quick task 261013-kf4.
- files_changed: src/ui/Sheet.tsx, jest.setup.ts, src/ui/__tests__/Sheet.gestureRoot.test.tsx
