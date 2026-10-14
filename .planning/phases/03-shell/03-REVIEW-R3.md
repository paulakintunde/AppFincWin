---
phase: 03-shell
reviewed: 2026-10-14T00:00:00Z
depth: standard
files_reviewed: 57
files_reviewed_list:
  - app/(app)/(tabs)/activity.tsx
  - app/(app)/accounts/index.tsx
  - app/(app)/import.tsx
  - src/data/queries/activity.ts
  - src/data/queries/monthDataState.ts
  - src/engine/activity/filters.ts
  - src/engine/activity/monthFigures.ts
  - src/engine/entryList/draft.ts
  - src/features/home/AccountsCard.tsx
  - src/features/home/ComingUpCard.tsx
  - src/features/home/HomeScreen.tsx
  - src/features/home/MonthChips.tsx
  - src/features/home/QuickActions.tsx
  - src/features/home/ThisMonthCard.tsx
  - src/features/home/useHomeViewModel.ts
  - src/features/navigation/SwipeBack.tsx
  - src/features/navigation/swipeBackGesture.ts
  - src/features/record/accounts/AccountBalanceBlock.tsx
  - src/features/record/accounts/AccountDetailScreen.tsx
  - src/features/record/accounts/AccountsScreen.tsx
  - src/features/record/accounts/standingText.ts
  - src/features/record/activity/ActivityRow.tsx
  - src/features/record/activity/ActivityScreen.tsx
  - src/features/record/activity/UnpaidBanner.tsx
  - src/features/record/activity/refreshKeys.ts
  - src/features/record/categories/CategoriesScreen.tsx
  - src/features/record/categories/RulesScreen.tsx
  - src/features/record/entry/RepeatsField.tsx
  - src/features/record/entry/ShellEntryHost.tsx
  - src/features/record/entry/TransactionSheet.tsx
  - src/features/record/entry/draftForm.ts
  - src/features/record/entry/useEntryList.ts
  - src/features/record/history/HistoryScreen.tsx
  - src/features/record/import/ImportScreen.tsx
  - src/features/record/import/importReturn.ts
  - src/features/record/setup/SetupAccountScreen.tsx
  - src/features/record/setup/SetupHistoryScreen.tsx
  - src/i18n/locales/en.ts
  - src/shell/backHistory/BackHistoryProvider.tsx
  - src/shell/fab/FabProvider.tsx
  - src/shell/fab/useShellPositions.ts
  - src/shell/header/AvatarButton.tsx
  - src/shell/header/SyncProblemLine.tsx
  - src/shell/header/TabHeader.tsx
  - src/shell/navigation/pushOnce.ts
  - src/shell/refresh/useShellRefresh.ts
  - src/shell/screen/TabRootScreen.tsx
  - src/shell/screen/useTabRootChrome.tsx
  - src/shell/tabBar/tabSlide.ts
  - src/state/activityFocus.ts
  - src/theme/layout.ts
  - src/theme/tokens.ts
  - src/ui/Chip.tsx
  - src/ui/Sheet.tsx
  - src/ui/Text.tsx
  - src/ui/TextInput.tsx
  - src/ui/ToastView.tsx
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 3: Code Review Report (round 3, gap closure 03-25..03-38)

**Reviewed:** 2026-10-14
**Depth:** standard
**Files Reviewed:** 57
**Status:** issues_found

## Summary

The gap-closure fixes are real and complete for G1-G9 and H1-H9. The engine boundary holds (no new imports into `engine/`), money stays in integer minor units, and verdict copy is clean. The changes I traced end to end:

- G1: `empty` now requires no recorded rows and no unpaid or unconverted projections.
- G2: the Repeats snapshot restores on Discard through `Sheet.onDiscard`.
- G3: `finishImport` uses `canDismiss() ? dismissTo : replace`.
- G4: `monthDataState` separates error, offline and loading.
- H1/H4: draft `repeats` round-trips, `skipped` coerces to `paid`, and the currency fields are checked against the codes on offer.
- H5/H6: the Sheet timer is cleared, double dismiss is guarded, and a blocked flick asks.
- H9: an unconverted amount is excluded from a range.

No blockers. The remaining defects are robustness edges and a few quality items.

## Warnings

### WR-01: Back-switch no-op detector can clear live back-step flags on a slow device

**File:** `src/shell/backHistory/BackHistoryProvider.tsx:95-107`
**Issue:** L1 assumes a real tab switch updates `currentRef` within two animation frames (about 33 ms). If the navigator commits later, for example while the destination tab mounts heavy content, `sameLocation(now, before)` is still true. The code then sets `pendingBackRef.current = false` and calls `clearBackStep()` while the switch is still in flight. The arrival is then recorded as a forward navigation, so back history grows instead of popping, and the slide direction is wrong. The test only covers an instant switcher.
**Fix:** Do not use a frame-count timeout as the signal. Clear the flags when the switcher reports it did nothing, for example if the tab switcher returns a boolean or the target tab equals the current tab. If a timeout is kept, make it generous (about 300 ms) and cancel it on the next location change and on unmount.

### WR-02: `keepForm` merge silently drops the user's live entries when over the cap, and has no `.catch`

**File:** `src/features/record/entry/useEntryList.ts:213-221`
**Issue:** In the L5 branch, when `merged` exceeds `LIST_CAP_PER_TYPE` the code saves `stored.items` and discards `live`. The user's just-typed list entries are lost with no signal. `loadEntryDraft(...).then(...)` has no rejection handler, so a storage failure becomes an unhandled promise rejection. It also races with `discardDraft` (`clearEntryDraft`): a late write can resurrect a draft the user discarded.
**Fix:** Keep the live items on overflow (`fits ? merged : live`, or trim the stored items). Add `.catch(() => undefined)`. Skip the late write if the draft was cleared since, for example by checking an epoch ref.

### WR-03: `pushOnce` guard is global, not per target

**File:** `src/shell/navigation/pushOnce.ts:9-17`
**Issue:** One timestamp covers every caller. Any two pushes within 600 ms are dropped, even to different routes, such as avatar then Import, or a quick Back then a tap on another card. The tap does nothing and gives no feedback. It is a silent dropped input in an app that treats lost input as a defect.
**Fix:** Key the guard on the serialised href: `if (href === lastHref && now - lastAt < PUSH_GUARD_MS) return;`.

### WR-04: Import return from a stack with screens but no `(tabs)` underneath pushes `(tabs)` instead of replacing

**File:** `src/features/record/import/importReturn.ts:20-24`
**Issue:** `router.canDismiss()` is true whenever the stack has more than one screen, not only when `(tabs)` is beneath it. Where the stack holds other outer screens and no `(tabs)` (the test mounts `/import` as the sole entry), `dismissTo` falls back to a push. Back from Activity then returns to the import screen or setup screens. The current onboarding path uses `router.replace` in `SetupHistoryScreen`, so this is latent rather than live. The test only covers a single-entry stack.
**Fix:** Decide from the navigation state whether `(tabs)` is in the stack, not from `canDismiss()`. Add a test with `[setup/account, import]` and no `(tabs)`.

### WR-05: Gesture end ignores cancellation in SwipeBack

**File:** `src/features/navigation/SwipeBack.tsx:55-80`
**Issue:** `.onEnd((e) => ...)` ignores the `success` argument. A gesture cancelled by the system after activation (an incoming call, or the navigation gesture taking over) is still evaluated by `shouldSwipeBack`, so it can trigger `router.back()`. If `translateX` was left at `width` and the back does not occur, the screen stays blank, because nothing resets it other than the next gesture.
**Fix:** Take `(e, success)` and treat `!success` as snap-back. Add `.onFinalize` to reset `translateX` to 0 when no navigation is pending.

## Info

### IN-01: Dead code left after the compact refactor in AccountBalanceBlock

**File:** `src/features/record/accounts/AccountBalanceBlock.tsx:38, 163, 167, 187`
**Issue:** `useBalanceSummary` is now unused (zero callers outside tests). After the early `if (compact) return`, the later `compact ? null : ...` and `compact ? 'body' : 'heading'` branches are unreachable. The compact rendering logic is also duplicated between `useCompactBalance` and the component's compact branch.
**Fix:** Remove `useBalanceSummary` and the unreachable ternaries. Have the compact branch consume `useCompactBalance`.

### IN-02: Formatting churn: double quotes and misindent in files that otherwise use single quotes

**File:** `src/features/home/AccountsCard.tsx` (whole file), `src/ui/Text.tsx:46`, `src/ui/Chip.tsx:23`
**Issue:** `AccountsCard.tsx` was rewritten with double quotes, and `withNesting` uses double quotes. `Chip.tsx` has a misindented `const textColor`. This hides the real diff and breaks the repo's convention.
**Fix:** Run the repo formatter and restore single quotes.

### IN-03: Toast control hit areas overlap

**File:** `src/ui/ToastView.tsx:23, 70-84`
**Issue:** The padding-based 44px minimum was replaced by `hitSlop` left/right 8 on two adjacent controls separated by a 14px gap. The slop regions overlap by 2px. The close glyph control is narrower than 44px horizontally.
**Fix:** Use horizontal slop of 6 or less and give the controls `minWidth: space.touchMin`.

### IN-04: Hard-coded comma in the TabHeader accessibility label

**File:** `src/shell/header/TabHeader.tsx:61`
**Issue:** `` `${title}, ${eyebrow}` `` is not localised, unlike the other labels, which go through i18n.
**Fix:** Add an i18n key such as `shell.header.a11y` with `{{title}}` and `{{eyebrow}}`.

### IN-05: L4 selected-month reset depends on a hook having mounted

**File:** `src/state/activityFocus.ts:31-35`
**Issue:** If `setSelectedMonth` or `requestActivityFocus` runs before any `useSelectedMonth` has set `lastFallback`, `anchor` is `null` and the pick never resets at month rollover. The reset also compares against the fallback held by whichever hook ran last.
**Fix:** Let `anchor` default to the current month computed at call time, or pass `fallback` into the setter.

### IN-06: Month chip short names no longer truncated

**File:** `src/features/home/MonthChips.tsx:66`
**Issue:** Removing the 3-character cut (L3) fixes other locales. Some locales' `short` month is longer (for example `sept.` or `Sept`), and the chip has no `numberOfLines` or width guard.
**Fix:** Add `numberOfLines={1}` and confirm the strip scrolls at 2x font scale.

---

_Reviewed: 2026-10-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
