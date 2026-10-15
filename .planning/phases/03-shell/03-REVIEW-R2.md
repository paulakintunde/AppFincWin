---
phase: 03-shell
round: 2
reviewed: 2026-10-14T19:30:00Z
depth: deep
files_reviewed: 148
files_reviewed_list:
  - app/(app)/(tabs)/_layout.tsx
  - app/(app)/(tabs)/activity.tsx
  - app/(app)/(tabs)/home.tsx
  - app/(app)/_layout.tsx
  - app/(app)/import.tsx
  - app/_layout.tsx
  - src/engine/activity/filters.ts
  - src/engine/activity/index.ts
  - src/engine/activity/monthFigures.ts
  - src/engine/entryList/draft.ts
  - src/features/auth/appHome.ts
  - src/features/consent/ConsentScreen.tsx
  - src/features/home/AccountsCard.tsx
  - src/features/home/ComingUpCard.tsx
  - src/features/home/HomeScreen.tsx
  - src/features/home/MonthChips.tsx
  - src/features/home/ProjectionDetailSheet.tsx
  - src/features/home/QuickActions.tsx
  - src/features/home/ThisMonthCard.tsx
  - src/features/home/comingUp.ts
  - src/features/home/useHomeViewModel.ts
  - src/features/navigation/swipeBackGesture.ts
  - src/features/record/accounts/AccountSheet.tsx
  - src/features/record/activity/ActivityScreen.tsx
  - src/features/record/activity/FilterSheet.tsx
  - src/features/record/activity/useActivityViewModel.ts
  - src/features/record/categories/CategorySheet.tsx
  - src/features/record/categories/RuleSheet.tsx
  - src/features/record/entry/RepeatsField.tsx
  - src/features/record/entry/ShellEntryHost.tsx
  - src/features/record/entry/TransactionSheet.tsx
  - src/features/record/entry/draftForm.ts
  - src/features/record/entry/entryHost.ts
  - src/features/record/entry/formDirty.ts
  - src/features/record/entry/useEntryDraft.ts
  - src/features/record/entry/useEntryList.ts
  - src/features/record/history/UndoToastHost.tsx
  - src/features/record/import/PasswordPromptSheet.tsx
  - src/features/record/import/PasteSheet.tsx
  - src/features/record/setup/SetupAccountScreen.tsx
  - src/features/record/setup/SetupHistoryScreen.tsx
  - src/features/you/YouScreen.tsx
  - src/features/you/components/HomeCurrencyChangeSheet.tsx
  - src/i18n/locales/en.ts
  - src/shell/a11yFocus.ts
  - src/shell/backHistory/BackHistoryProvider.tsx
  - src/shell/backHistory/backHistoryReducer.ts
  - src/shell/backHistory/navLocation.ts
  - src/shell/backHistory/useAndroidBackHandler.ts
  - src/shell/fab/Fab.tsx
  - src/shell/fab/FabProvider.tsx
  - src/shell/fab/FabQuickMenu.tsx
  - src/shell/fab/quickActions.ts
  - src/shell/fab/shouldHideFab.ts
  - src/shell/fab/useShellPositions.ts
  - src/shell/header/AvatarButton.tsx
  - src/shell/header/BackButton.tsx
  - src/shell/header/CompactHeader.tsx
  - src/shell/header/DetailHeader.tsx
  - src/shell/header/SyncProblemLine.tsx
  - src/shell/header/TabHeader.tsx
  - src/shell/header/syncProblem.ts
  - src/shell/layout/ShellLayoutProvider.tsx
  - src/shell/refresh/useShellRefresh.ts
  - src/shell/screen/DetailScreen.tsx
  - src/shell/screen/TabRootScreen.tsx
  - src/shell/screen/useTabRootChrome.tsx
  - src/shell/tabBar/TabBar.tsx
  - src/shell/tabBar/TabSlideIn.tsx
  - src/shell/tabBar/availableTabs.ts
  - src/shell/tabBar/direction.ts
  - src/shell/tabBar/tabSlide.ts
  - src/shell/tabBar/tabs.ts
  - src/state/activityFocus.ts
  - src/state/sheetStack.ts
  - src/state/undoToast.ts
  - src/theme/FontScaleProvider.tsx
  - src/theme/fontScale.ts
  - src/theme/layout.ts
  - src/theme/motion.ts
  - src/theme/tokens.ts
  - src/ui/ConfirmSheet.tsx
  - src/ui/DetailSheet.tsx
  - src/ui/Dropdown.tsx
  - src/ui/Sheet.tsx
  - src/ui/SwipeRow.tsx
  - src/ui/Text.tsx
  - src/ui/TextInput.tsx
  - src/ui/ToastView.tsx
  - src/ui/haptics.ts
  - src/ui/sheetDrag.ts
  - src/ui/sheetOverlay.tsx
  - src/ui/useIsDirty.ts
  - "(plus the remaining ~55 mechanical Text/TextInput codemod files and the tests, skimmed)"
findings:
  critical: 3
  warning: 8
  info: 8
  total: 19
status: issues_found
---

# Phase 03: Code Review Report, Round 2

**Reviewed:** 2026-10-14
**Depth:** deep (cross-file: expo-router and TanStack query-core sources in node_modules checked for two findings)
**Files Reviewed:** 148 non-test source files in `git diff origin/main...HEAD -- src app` (mechanical codemod files and tests skimmed)
**Status:** issues_found

## Summary

I reviewed the code blind first, then read `03-REVIEW.md` (round 1). No source has changed since round 1 (the newest commits are docs only), so every round-1 finding is still live.

Checks run: `tsc --noEmit` is clean. `eslint` on engine/shell/ui/home/state/entry/app has 0 errors (474 warnings, mostly in tests). The typed `t()` means no i18n key is missing at compile time.

What holds:
- **Engine boundary.** `monthFigures.ts`, `filters.ts` and `draft.ts` import only engine modules.
- **Money.** All figures are integer minor units and percentages use integer half-up. UNPAID excludes pending income, transfers and refunds (D-34..D-36). Home's Coming up uses the same `isUnpaidBill` as Activity's Unpaid filter.
- **Back history.** The reducer and the `goBack` loop are bounded. Top-sheet-only Android back relies on the Modal's `onRequestClose`.
- **Toasts.** The toast timer schedules the remaining time from `shownAt`.
- **Palette.** The `scrim` token was removed, and backdrops use `colors.ink` at 0.38.
- **Copy.** No "advice", "recommend" or "you should".

Main concerns:
1. Import's `router.replace('/activity')` creates a second `(tabs)` navigator. I checked this against the installed expo-router. It duplicates the app-wide entry host, so two entry sheets open. Round 1 filed this as a "verify on device" warning; it is a blocker.
2. Two money/consent falsehoods round 1 also found: the `£0` headline, and Repeats "Discard" that keeps the change.
3. Several dismissal and draft edge cases in the Sheet and the entry sheet.
4. Activity's tab root never shows the D-15 sync-problem line under its large header.

## Critical Issues

### CR-01: Import "done" REPLACEs the outer stack with a new `(tabs)` route, so the shell and the entry sheet are duplicated

**File:** `app/(app)/import.tsx:18`
**Issue:** Import is an outer-stack screen pushed above `(tabs)` from Home's Import action, the FAB's "Import statement" (`ShellEntryHost.tsx:23`), the account detail and You. `onDone={() => router.replace('/activity')}` resolves like this in expo-router (`build/global-state/stateUtils.js` `findDivergentState`): the focused outer route `import` differs from the target `(tabs)`, so the action targets the outer stack as `REPLACE {name: '(tabs)'}`. `StackRouter` REPLACE (`build/react-navigation/routers/StackRouter.js:154-175`) always creates a new route with a new key; it never reuses the existing `(tabs)` underneath. The outer stack becomes `[(tabs)#1, …, (tabs)#2]`.

`(tabs)/_layout.tsx` then mounts twice. That means two `FabProvider`s, two `FabQuickMenu`s and, worst, two `ShellEntryHost`s, both subscribed to the module-level `entryHost` store. The next Add, FAB press or quick-menu entry renders two `TransactionSheet` Modals, each running `useEntryList` against the same draft key. On top of that, the second `TabBar` overwrites the back-history tab switcher, and Android back from `(tabs)#2` never reaches `(tabs)#1`.

The bug is new in this phase. Before it, `/activity` was a plain outer-stack screen, so replace was harmless.
**Fix:**
```tsx
import { ACTIVITY_HREF } from '@/features/auth/appHome';
// pops back to the existing (tabs) and jumps to Activity; replaces only when (tabs) is absent (onboarding path)
onDone={() => (router.canDismiss() ? router.dismissTo(ACTIVITY_HREF) : router.replace(ACTIVITY_HREF))}
```
Add a navigation test that pushes import from a tab and finishes it, then asserts the root state holds exactly one `(tabs)` route.

### CR-02: Home headline reads "£0 left after everything" when the month only has expected bills

**File:** `src/features/home/ThisMonthCard.tsx:72,107`
**Issue:** `empty = totals.count === 0`, but `monthTotals` (`engine/activity/totals.ts`) counts recorded rows only, never projections. A month with nothing logged yet but recurring bills expected takes the empty branch. That covers the start of any month and every future month chip. The headline then shows `fmt(0)` in muted ink with "Nothing recorded in {month} yet.", while the UNPAID cell and the pending bar in the same card show the projected bills. `position.left` is correctly negative but hidden.
**Fix:** `const empty = totals.count === 0 && position.unpaidCount === 0 && position.unconvertedUnpaid === 0;` Add a test with zero rows plus one projection: the headline shows -£X in danger.

### CR-03: Repeats sheet "Discard changes?" → Discard keeps the new occurrence count

**File:** `src/features/record/entry/RepeatsField.tsx:36-38,76,126-130`
**Issue:** Each keystroke in the count field calls `setEnd({kind:'count', …})`, which pushes the value to the parent's `repeats` immediately. `dirty` compares only `countText` with `openingCount`, and Discard is the Sheet's `onDismiss`, which is `setOpen(false)`. Nothing is reverted. The user is told the edit was discarded, but Save writes the new schedule.
**Fix:** Snapshot `{value, countText}` on open. On discard, call `onChange(snapshot.value)` and `setCountText(snapshot.countText)`. This needs a Sheet `onDiscard` distinct from `onDismiss`. Alternatively, apply the count only when the sheet closes normally.

## Warnings

### WR-01: Home renders failed or not-yet-fetched data as a real empty month

**File:** `src/features/home/useHomeViewModel.ts:129-131`, `src/features/home/HomeScreen.tsx:95-117`
**Issue:** `vm.isError` is returned but never read. There is a second case round 1 did not cover. `loading` is `monthView.isLoading`, and in TanStack v5 `isLoading` is `isPending && isFetching`. Offline with no cache, the fetch is paused, so `isLoading` is false. Home then shows "+£0 / Nothing recorded / Nothing outstanding" as fact, both on a 4xx/5xx/RLS error and while the first read is merely paused.
**Fix:** Derive `loading` from `isPending` (data undefined), not `isLoading`. When `isError`, or when pending with fetchStatus `paused`, render a "couldn't load" or offline state in ThisMonthCard and ComingUpCard instead of figures.

### WR-02: Opening an uncategorised entry for edit becomes "dirty" without user input

**File:** `src/features/record/entry/TransactionSheet.tsx:225-237,284-286`; `categorySuggest.ts:11`
**Issue:** For an edit row with no category, `initialOrigin` returns `'empty'`. The 250 ms guess effect then sets `categoryId` if a rule matches the name. `editDirty` compares against the snapshot taken at mount, so an untouched open followed by a swipe-down asks "Discard changes?" (against D-33), and Save writes a category the user never chose.
**Fix:** Skip auto-guess in edit modes, or exclude a `'suggested'` category the user has not touched from `isFormDirty`.

### WR-03: Restoring a draft clobbers parts of the restored form

**File:** `src/features/record/entry/TransactionSheet.tsx:273-282,200,221,303-319`
**Issue:** `onRestoreForm` only calls `setState`. Two things go wrong after it:
- (a) `origin` stays `'empty'`, so the guess effect replaces a restored hand-picked category 250 ms later whenever the name matches a rule.
- (b) `amountInManual` was fixed at mount from an empty form (false). For a restored cross-currency transfer, the prefill effect overwrites the received amount the user typed with the rate figure. With no rate it blanks the field (`receivedPrefill.ts:18-23` returns `''`). That is a silent change to a money field.
**Fix:** In `onRestoreForm`, also run `setOrigin(form.categoryId ? 'picked' : 'empty')` and `setAmountInManual(form.amountInText !== '')`. Add a test: restore a transfer with a manual received amount, advance timers, and check the amount is unchanged.

### WR-04: Drag-dismiss timer is uncleared, and dismissal can fire twice

**File:** `src/ui/Sheet.tsx:185-196,268,283`
**Issue:** `setTimeout(…, 190)` has no handle, no unmount cleanup and no in-flight guard. During the slide-out, the backdrop `Pressable` and `onRequestClose` are still live, so a tap or Android back runs `onDismiss` a second time. For the entry sheet that is `keepForm` twice; for an owner that navigates or answers a prompt, the action runs twice. If the owner unmounts the Sheet in that window, the timer still calls the owner's callback.
**Fix:** Keep the timer in a ref and clear it on unmount. Add a `dismissingRef` that `requestDismiss` checks and that resets on the next open.

### WR-05: Pull-to-refresh offline toasts "Up to date — nothing new to pull"

**File:** `src/shell/refresh/useShellRefresh.ts:17-29`
**Issue:** Verified in `@tanstack/query-core/build/modern/queryClient.js:324-334`: `refetchQueries` returns `Promise.resolve()` for queries whose `fetchStatus === 'paused'`, and `resumePausedMutations` is a no-op offline. No query errors and no data reference changes, so the user gets a success toast for a refresh that fetched nothing. D-17 says a failed refresh shows no toast.
**Fix:** Return `'failed'` when `!onlineManager.isOnline()`, or when any key's `fetchStatus` is `'paused'` after the refetch.

### WR-06 (NEW): Activity's tab root has no sync-problem line under its large header (D-15)

**File:** `src/features/record/activity/ActivityScreen.tsx:228-231`
**Issue:** `TabRootScreen` (Home) renders `<SyncProblemLine />` directly under the large header. Activity builds its own chrome from `useTabRootChrome` and puts `chrome.largeHeader` straight into `listHeader`, with no `SyncProblemLine`. Only `CompactHeader` carries it, and that is invisible until the user scrolls. On Activity, the screen where writes are made, "offline / N changes queued / failed write" is hidden at the top of the list. Grep confirms that no Activity component renders `SyncStatusLine` or `SyncProblemLine`.
**Fix:** Render `<SyncProblemLine />` right after `{chrome.largeHeader}` in `listHeader`. Better, have `useTabRootChrome.largeHeader` include it, so TabRootScreen and Activity cannot drift apart.

### WR-07 (NEW): A downward fling on a dirty sheet is swallowed with no prompt

**File:** `src/ui/Sheet.tsx:227-234`, `src/ui/sheetDrag.ts:16-19`
**Issue:** `sheetDragOutcome` treats a fling (dy ≥ 24 at ≥ 1000 px/s) as `'dismiss'`. On a dirty sheet `canDragDismiss` is false, so it snaps back, and `onBlockedDismiss` fires only when `dy > SHEET_DISMISS_DISTANCE` (92). A fling between 24 and 92 px therefore does nothing visible: no close and no "Discard changes?". The same gesture on a clean sheet dismisses it. D-26 says a swipe-down with unsaved changes "stops and asks".
**Fix:** In the else branch, call `onBlockedDismiss` when `sheetDragOutcome(dy, e.velocityY) === 'dismiss'` (not only when `dy > distance`).

### WR-08 (NEW): Push targets have no re-entry guard, so a double tap stacks duplicate screens

**File:** `src/shell/header/AvatarButton.tsx:21`, `src/features/home/AccountsCard.tsx:47,114`, `src/features/home/QuickActions.tsx:92`, `src/features/record/entry/ShellEntryHost.tsx:23`, `app/(app)/(tabs)/activity.tsx:8-9`
**Issue:** These handlers call `router.push(...)` directly. A fast double tap, which is common on the 42px avatar and on Home's tiles, pushes two You, Accounts or Import screens. The back history then records both, and the user needs two backs. The Import duplicate also makes CR-01 easier to hit.
**Fix:** Use `router.navigate` for the singleton routes (`/you`, `/accounts`, `/import`), which reuses an existing route, or add a small shared "push once per frame" guard.

## Info

### IN-01 (NEW): `tabSlide` module state is not wiped, and back-step flags can stick

**File:** `src/shell/tabBar/tabSlide.ts:6-7`, `src/shell/backHistory/BackHistoryProvider.tsx:91-95`
**Issue:** `last` and `backPending` are module state with no `registerWipeHandler`. It is cosmetic only (the first slide after a re-sign-in), but round 1's claim that "every new module store" is wiped is not quite true. Separately, `markBackStep()` and `pendingBackRef = true` are set before `navigate`. If the switch does not produce an observed change, both flags stay set, and the next forward tab tap is recorded as a back step (wrong slide direction, no history push).
**Fix:** Register a wipe handler, and clear the pending flags on the next frame if no transition was observed.

### IN-02: Text wrapper and TextInput scaling gaps (D-19)

**File:** `src/ui/Text.tsx:17-23`, `src/ui/TextInput.tsx:11-15`
**Issue:** Same as round-1 IN-01: Text without an explicit `fontSize` never scales. There is a new part too. `TextInput` relies on `maxFontSizeMultiplier` for its 2x cap, but `fontScale.ts:3-4` itself says that prop is "reported ignored on Fabric". If so, inputs scale without limit at the largest accessibility sizes.
**Fix:** Apply the same manual `scaleTextStyle` to TextInput, or confirm the cap on device (03-14).

### IN-03: Activity's refresh keys omit `accountBalances`

**File:** `src/features/record/activity/ActivityScreen.tsx:86-96`
**Issue:** Same as round-1 IN-07. Home's list includes it (`useHomeViewModel.ts:118-121`). Share one key builder.

### IN-04 (NEW): MonthChips declares `tablist` but its children are `button`

**File:** `src/features/home/MonthChips.tsx:41,49`
**Issue:** A screen reader announces a tab list with no tabs. Use `accessibilityRole="tab"` with the selected state on each chip, or drop the `tablist` role.

### IN-05 (NEW): Locale-unsafe month and date shortening

**File:** `src/features/home/ComingUpCard.tsx:50`, `src/features/home/MonthChips.tsx:64`, `src/features/home/HomeScreen.tsx:44`, `src/features/home/AccountsCard.tsx:60`
**Issue:**
- `.slice(0, 3)` truncates localised short month names (for example fr "juil." becomes "jui", and ambiguous with "juin").
- `.toUpperCase()` ignores the locale (Turkish dotted i).
- `charAt(0)` splits emoji and surrogate pairs in account names.

**Fix:** Use the `Intl` `month: 'short'` output as is, `toLocaleUpperCase(locale)`, and `Array.from(name)[0]`.

### IN-06 (NEW): The shared selected month never follows a month rollover

**File:** `src/state/activityFocus.ts:9,32-35`
**Issue:** Once Activity or Home sets `selectedMonth`, `fallback` (`monthOf(today)`) is ignored for the whole session. An app left open across the 1st keeps showing last month on Home's This month card.
**Fix:** Store whether the user picked the month explicitly, or reset `selectedMonth` when `monthOf(today)` changes.

### IN-07 (NEW): Input typed before the stored draft finishes loading can be lost or overwritten

**File:** `src/features/record/entry/useEntryList.ts:96-108,202-207`
**Issue:** While `loadEntryDraft` is in flight, `resolved` is false and `keepForm` returns without saving. A dismiss in that window drops the typed form (D-25). If the stored draft then resolves and the user taps Continue, `onRestoreForm` overwrites what was typed. The window is small (one AsyncStorage read).
**Fix:** In `keepForm`, merge with the pending draft instead of returning. On Continue, skip `onRestoreForm` when the live form already has content.

### IN-08 (NEW): Small consistency nits

**File:** `src/features/record/setup/SetupAccountScreen.tsx:5-6`, `src/features/home/HomeScreen.tsx:48`, `src/features/home/QuickActions.tsx:85`, `src/i18n/locales/en.ts` (shell.fab.newCheck/newCheckA11y, shell.title.decide/grow/insights)
**Issue:**
- The SetupAccountScreen header comment still says the first-account gate is "on Activity"; it moved to the tabs layout (D-38).
- Home navigates with the literal `'/activity'` instead of `ACTIVITY_HREF`.
- Five catalogue keys are unused in this phase. They are fine as forward declarations, but they are not marked as such in copyStatus.

**Fix:** Update the comment, use the constant, and note the forward keys.

## Round 1 cross-check

| Round-1 ID | Verdict | Note |
|---|---|---|
| CR-01 Home £0 headline | **CONFIRMED** | Same as R2 CR-02. Round 1 cites `ThisMonthCard.tsx:198,231-233`, but the lines are actually 72 and 107. |
| CR-02 Repeats Discard keeps change | **CONFIRMED** | Same as R2 CR-03. |
| WR-01 Home ignores isError | **CONFIRMED, extended** | R2 WR-01 adds the paused-offline-no-cache case (`isLoading` is false while paused). |
| WR-02 Edit dirty via guess | **CONFIRMED** | Same as R2 WR-02. |
| WR-03 Draft restore loses input | **CONFIRMED** | (b) and (c) are R2 WR-03. (a), repeats not in DraftForm, is confirmed by reading `DraftForm`. |
| WR-04 Draft currency/toCurrency/status unvalidated | **CONFIRMED** (low practical risk) | Verified that `fromDraftForm` spreads `currency`/`toCurrency` unchecked and that `currencyExponent` defaults to 2. The draft is device-local, so the risk is corruption more than attack. |
| WR-05 Drag-dismiss timer | **CONFIRMED** | Same as R2 WR-04. |
| WR-06 Offline refresh toast | **CONFIRMED** | Same as R2 WR-05; independently re-verified in query-core. |
| WR-07 Amount range compares native units | **CONFIRMED** | Pre-existing in `matchesAmountRange`, copied into `filterProjections`. I had noted it as pre-existing and did not raise it. |
| WR-08 Import replace → second (tabs) | **CONFIRMED, severity raised to BLOCKER** | Same as R2 CR-01. Verified in the expo-router `findDivergentState` and `StackRouter` REPLACE sources: a new `(tabs)` key is always created. The consequence is a duplicated `ShellEntryHost`, so two entry sheets. Round 1's `dismissTo` fix also needs a `replace` fallback for the onboarding path, where `(tabs)` is absent. |
| IN-01 Text without fontSize | **CONFIRMED** | Same as R2 IN-02, which adds the TextInput/Fabric point. |
| IN-02 barShares Math.abs(paidOut) | **CONFIRMED** | Net-refund month shows a "paid" share. |
| IN-03 toCurrency bound | **CONFIRMED** | |
| IN-04 useRegisterFab cleanup | **CONFIRMED (latent)** | No callers exist yet (grep). |
| IN-05 runOnJS vs scheduleOnRN | **CONFIRMED** | |
| IN-06 File-level eslint-disables | **CONFIRMED** (style) | |
| IN-07 Activity refresh keys | **CONFIRMED** | Same as R2 IN-03. |
| IN-08 DiscardPrompt mounted only while dirty | **CONFIRMED (latent)** | No current path drops `dirty` while the prompt is open. |

Tallies: **18 CONFIRMED** (1 with severity raised, 1 extended, 3 latent), **0 DISPUTED**, **0 already-known-gap**. None of the R2 findings overlap D-39..D-42.

**New in round 2 (not in round 1):** WR-06 (Activity sync line), WR-07 (dirty-sheet fling swallowed), WR-08 (double-tap duplicate pushes), IN-01 (tabSlide wipe / stuck back-step flags; partly disputes round 1's "every new module store wiped"), IN-02's TextInput part, IN-04, IN-05, IN-06, IN-07, IN-08, plus the paused-offline extension of WR-01. That is 3 new warnings and 6 new infos.

---

_Reviewed: 2026-10-14_
_Reviewer: Claude (gsd-code-reviewer), round 2_
_Depth: deep_
