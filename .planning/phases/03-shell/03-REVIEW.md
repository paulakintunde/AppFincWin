---
phase: 03-shell
reviewed: 2026-10-14T17:24:01Z
depth: standard
files_reviewed: 148
files_reviewed_list:
  - app/(app)/(tabs)/_layout.tsx
  - app/(app)/(tabs)/activity.tsx
  - app/(app)/(tabs)/home.tsx
  - app/(app)/_layout.tsx
  - app/_layout.tsx
  - src/engine/activity/filters.ts
  - src/engine/activity/index.ts
  - src/engine/activity/monthFigures.ts
  - src/engine/entryList/draft.ts
  - src/features/auth/AppleSignInButton.tsx
  - src/features/auth/GoogleSignInButton.tsx
  - src/features/auth/RecentAccountTile.tsx
  - src/features/auth/WelcomeScreen.tsx
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
  - src/features/record/accounts/AccountBalanceBlock.tsx
  - src/features/record/accounts/AccountDetailRows.tsx
  - src/features/record/accounts/AccountDetailScreen.tsx
  - src/features/record/accounts/AccountRemoveRow.tsx
  - src/features/record/accounts/AccountSheet.tsx
  - src/features/record/accounts/AccountsScreen.tsx
  - src/features/record/activity/ActivityRow.tsx
  - src/features/record/activity/ActivityScreen.tsx
  - src/features/record/activity/BulkBar.tsx
  - src/features/record/activity/CloneMonthSheet.tsx
  - src/features/record/activity/FilterSheet.tsx
  - src/features/record/activity/GroupHeader.tsx
  - src/features/record/activity/MonthSwitcher.tsx
  - src/features/record/activity/MonthTotalsBar.tsx
  - src/features/record/activity/RecurringReviewSheet.tsx
  - src/features/record/activity/SearchBar.tsx
  - src/features/record/activity/SeriesOfferCard.tsx
  - src/features/record/activity/TransactionDetailSheet.tsx
  - src/features/record/activity/useActivityViewModel.ts
  - src/features/record/activity/views/CalendarView.tsx
  - src/features/record/categories/CategoriesScreen.tsx
  - src/features/record/categories/CategorySheet.tsx
  - src/features/record/categories/RemoveCategoryPrompt.tsx
  - src/features/record/categories/RuleSheet.tsx
  - src/features/record/categories/RulesScreen.tsx
  - src/features/record/entry/AmountField.tsx
  - src/features/record/entry/EditScopePrompt.tsx
  - src/features/record/entry/EntryList.tsx
  - src/features/record/entry/EntryListFooter.tsx
  - src/features/record/entry/EntryNotes.tsx
  - src/features/record/entry/OccurrenceActions.tsx
  - src/features/record/entry/RepeatsField.tsx
  - src/features/record/entry/ShellEntryHost.tsx
  - src/features/record/entry/TransactionSheet.tsx
  - src/features/record/entry/draftForm.ts
  - src/features/record/entry/entryHost.ts
  - src/features/record/entry/formDirty.ts
  - src/features/record/entry/pickers/CurrencyPicker.tsx
  - src/features/record/entry/useEntryDraft.ts
  - src/features/record/entry/useEntryList.ts
  - src/features/record/history/HistoryScreen.tsx
  - src/features/record/history/UndoToastHost.tsx
  - src/features/record/import/ClosingBalancePrompt.tsx
  - src/features/record/import/MatchesStep.tsx
  - src/features/record/import/PasswordPromptSheet.tsx
  - src/features/record/import/PasteSheet.tsx
  - src/features/record/import/importUi.tsx
  - src/features/record/samples/SampleBanner.tsx
  - src/features/record/samples/SampleClearPrompts.tsx
  - src/features/record/setup/SetupAccountScreen.tsx
  - src/features/record/setup/SetupHistoryScreen.tsx
  - src/features/system/UpdateRequiredScreen.tsx
  - src/features/you/YouScreen.tsx
  - src/features/you/components/ConnectionStatus.tsx
  - src/features/you/components/DevSyncProbe.tsx
  - src/features/you/components/FontPairingSwitcher.tsx
  - src/features/you/components/HomeCurrencyChangeSheet.tsx
  - src/features/you/components/HomeCurrencyRow.tsx
  - src/features/you/components/SettingsGroup.tsx
  - src/features/you/components/WeekStartRow.tsx
  - src/i18n/copyStatus.ts
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
  - src/shell/tabBar/TabGlyphs.tsx
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
  - src/ui/AmountDisplay.tsx
  - src/ui/CategoryGlyph.tsx
  - src/ui/Chip.tsx
  - src/ui/ConfirmSheet.tsx
  - src/ui/DetailSheet.tsx
  - src/ui/Dropdown.tsx
  - src/ui/EmptyState.tsx
  - src/ui/Keypad.tsx
  - src/ui/Pill.tsx
  - src/ui/RateAttribution.tsx
  - src/ui/Row.tsx
  - src/ui/Sheet.tsx
  - src/ui/SheetHeader.tsx
  - src/ui/SwipeRow.tsx
  - src/ui/SyncStatusLine.tsx
  - src/ui/Text.tsx
  - src/ui/TextInput.tsx
  - src/ui/ToastView.tsx
  - src/ui/ToggleRow.tsx
  - src/ui/haptics.ts
  - src/ui/sheetDrag.ts
  - src/ui/sheetOverlay.tsx
  - src/ui/useIsDirty.ts
findings:
  critical: 2
  warning: 8
  info: 8
  total: 18
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-10-14T17:24:01Z
**Depth:** standard
**Files Reviewed:** 148 (non-test source; tests and the Text/TextInput import codemod skimmed)
**Status:** issues_found

## Summary

Scope: `git diff origin/main...HEAD -- src app` on `phase/03-shell`. I read the new engine code (monthFigures, filters, draft v2), the Sheet stack (Sheet, sheetDrag, sheetOverlay, sheetStack, undoToast and UndoToastHost), the shell (back history, Android back, TabBar, FAB, refresh, tab-root chrome), the Home feature and the entry draft/dirty path in full. I also checked the TanStack Query core source for refresh behaviour.

What holds up:
- **Engine import boundary:** clean. `monthFigures.ts` imports only `./status`, `filters.ts` imports nothing, and `draft.ts` imports only engine modules.
- **Money maths:** integer-only, with integer half-up percentages. UNPAID excludes pending income, transfers and refunds, as D-34..D-36 require.
- **Back history:** the reducer and goBack loop are bounded and correct. Top-only Android back relies on native Modal `onRequestClose`, which is correct.
- **Toast timer:** the `shownAt` remaining-time scheduling is correct.
- **Wipe handlers:** registered for every new module store.
- **Colours and copy:** no raw colours were added (the `scrim` token was removed). No "advice", "recommend" or "you should" copy. No logging was added.
- **File-level eslint-disables** (Sheet.tsx, TabRootScreen.tsx, ActivityScreen.tsx): I found no `.current` read during render hidden by them.

The real problems:
- Two figures or prompts that tell the user something false: Home's "£0 left after everything" when only expected bills exist, and the Repeats sheet's "Discard" that does not discard.
- Home never surfaces a read error.
- Edit-mode dirtiness can trip without user input.
- The D-25 draft restore drops part of the form's state.
- A drag-dismiss timer that is never cleared.

## Critical Issues

### CR-01: Home headline shows "£0 left after everything" while UNPAID shows expected bills

**File:** `src/features/home/ThisMonthCard.tsx:198,231-233`
**Issue:** `empty = totals.count === 0`. `MonthTotals.count` counts only recorded, non-transfer, non-skipped rows, never projections. A month with nothing logged yet but recurring bills expected (any future month, or the start of a month before the series is materialised) therefore takes the `empty` branch. It renders `figure = fmt(0)` in muted ink with the caption "left after everything" and the line "No entries in {month}". In the same card, the UNPAID cell shows `position.unpaid` (the projected bills, D-34) and the bar shows a pending share. `position.left` is correctly negative (`0 + 0 - unpaid`), but it is hidden. The headline money figure is wrong, and the card contradicts itself.
**Fix:** Treat the month as empty only when there is nothing at all to show, and otherwise always render `position.left`:
```ts
const empty = totals.count === 0 && position.unpaidCount === 0 && position.unconvertedUnpaid === 0;
```
Add a ThisMonthCard test: zero rows plus one projected bill -> the headline is `-£X` in danger colour.

### CR-02: Repeats sheet "Discard changes?" keeps the change

**File:** `src/features/record/entry/RepeatsField.tsx:37-38,76,126-129`
**Issue:** The count field's `onChangeText` calls `setEnd({ kind: 'count', count })` on every keystroke, so the parent's `repeats` value is updated live. `dirty` compares `countText` with `openingCount`, so a drag or back after typing opens "Discard changes?". But Discard only calls `onDismiss`, which is `setOpen(false)`. Neither `countText` nor the parent's `value.end` is reverted. The user is told the edit was discarded, the summary row and the saved series still carry the new occurrence count, and Save writes a recurring schedule the user believes they threw away.
**Fix:** Snapshot the whole `value` on open and restore it on discard. One way is to give `Sheet` an `onDiscard` callback distinct from `onDismiss`:
```tsx
const [opening, setOpening] = useState<{ value: RepeatsValue; countText: string } | null>(null);
// on open: setOpening({ value, countText });
<Sheet ... dirty={dirty} onDismiss={() => setOpen(false)}
  onDiscard={() => { if (opening) { onChange(opening.value); setCountText(opening.countText); } setOpen(false); }} />
```
The alternative is to stop applying the count to `value` until the sheet closes normally.

## Warnings

### WR-01: Home ignores `isError`: a failed read renders as a real, empty month

**File:** `src/features/home/useHomeViewModel.ts:131`, `src/features/home/HomeScreen.tsx:95-117`
**Issue:** `useHomeViewModel` returns `isError`, but HomeScreen never reads it. If the month read fails with no cache, `rows` is `[]` and `isLoading` is false. Home then says "No entries", "£0", and Coming up says nothing is due. If only `recurringSeries` fails, UNPAID silently drops every projected bill. The sync line covers offline only, not 4xx/5xx or RLS errors. This is a confident wrong money figure with no disclosure.
**Fix:** When `vm.isError`, render an error or retry state in ThisMonthCard and ComingUpCard instead of figures. At minimum, show a "couldn't load" line and suppress the headline.

### WR-02: Editing an uncategorised entry becomes "dirty" with no user input

**File:** `src/features/record/entry/TransactionSheet.tsx:225-236,284-286`
**Issue:** `initialOrigin` returns `'empty'` for an edit whose row has no category, so the category-guess effect runs 250 ms after mount. If a rule or guess matches the name, it sets `state.categoryId`. `editDirty` compares against the mount snapshot, so it flips to true. A plain open-then-swipe-down then asks "Discard changes?", which contradicts D-33 ("only when something was changed"). Separately, Save on that untouched edit would write the guessed category.
**Fix:** Either exclude an untouched `'suggested'` category from the dirty comparison, or do not auto-guess in edit mode. Then add a test: an edit of an uncategorised row matching a rule, swiped down untouched, closes without a prompt.

### WR-03: Draft restore loses part of the input (D-25 "never loses input")

**File:** `src/features/record/entry/TransactionSheet.tsx:273-282,289-292`, `src/engine/entryList/draft.ts:24-41`
**Issue:**
- (a) `repeats` is not part of `DraftForm`, so an accidental dismiss of a new recurring entry loses the frequency and end.
- (b) A restored `categoryId` keeps `origin` at `'empty'`, so the guess effect overwrites a hand-picked category 250 ms after Continue whenever the name matches a rule.
- (c) `amountInManual` was initialised from the pre-restore state (`''`), so for a cross-currency transfer the prefill effect (line 303) recomputes and overwrites the restored received amount the user typed.

**Fix:** Add `repeats` to the v2 form snapshot, validated in `parseForm`. In `onRestoreForm`, also run `setOrigin(form.categoryId ? 'picked' : 'empty')` and `setAmountInManual(form.amountInText !== '')`.

### WR-04: Restored draft fields `currency`, `toCurrency` and `status` are not validated against allowed values

**File:** `src/features/record/entry/draftForm.ts:34-44`, `src/engine/entryList/draft.ts:146-158`
**Issue:** The draft is documented as untrusted (T-03-24-01), but only ids are resolved. `currency` and `toCurrency` are any string up to 12 or 64 characters and are spread straight into form state. `status: 'skipped'` is accepted for a new entry, even though the new-entry UI only offers paid or pending (lines 929/939). A corrupted or tampered draft can therefore produce a new skipped entry, or a save with a currency code the app does not know. `currencyExponent` silently defaults to 2 for an unknown code.
**Fix:** In `fromDraftForm`, keep `currency` only if it equals the resolved account's currency or is in the currency picker's option set; otherwise fall back to the account currency. Do the same for `toCurrency`. Coerce `status === 'skipped'` to `'paid'` for new entries.

### WR-05: Sheet drag-dismiss timer is never cleared, and the sheet stays interactive during the slide-out

**File:** `src/ui/Sheet.tsx:185-196,268,283`
**Issue:** `onDragDismiss` schedules `setTimeout(..., 190ms)` with no handle and no unmount cleanup. During that window the backdrop `Pressable` and the Modal's `onRequestClose` are still live. A tap or Android back calls `requestDismiss` again, so `onDismiss` runs twice: for a new entry sheet, `keepForm` writes twice; any owner whose `onDismiss` navigates would navigate twice. If the owner unmounts the Sheet in the window, the timer still calls `onDismissRef.current()` and runs `withTiming` on a dead component.
**Fix:** Keep the timer in a ref, clear it in an unmount effect, and guard with a `dismissingRef`:
```ts
const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);
// in requestDismiss: if (dismissingRef.current) return;
```

### WR-06: Pull-to-refresh while offline says "Up to date — nothing new to pull"

**File:** `src/shell/refresh/useShellRefresh.ts:17-29`
**Issue:** Offline, `QueryClient.resumePausedMutations()` resolves immediately. `refetchQueries` also resolves immediately for paused queries (query-core `refetchQueries`: `fetchStatus === "paused" ? Promise.resolve()`). No query reaches the error state, the data is unchanged, and the toast claims the app is up to date when nothing was fetched. D-17 says a failed refresh shows no toast.
**Fix:**
```ts
if (!onlineManager.isOnline()) return 'failed';
// or, after refetch: if (keys.some((k) => qc.getQueryState(k)?.fetchStatus === 'paused')) return 'failed';
```

### WR-07: The amount-range filter compares foreign minor units with home-currency bounds

**File:** `src/engine/activity/filters.ts:254-256` (new); also `:208` (pre-existing `matchesAmountRange`)
**Issue:** `Math.abs(p.amountHome ?? p.amount)` falls back to the native amount when there is no rate. `amountMin` and `amountMax` are home-currency minor units (line 11). A JPY or KWD projection, with exponents 0 and 3, is then compared on the wrong scale and wrongly kept or dropped from the Unpaid list. The new `filterProjections` copies the flaw instead of reusing `matchesAmountRange`.
**Fix:** When a range is active and `amountHome === null`, exclude the item (or keep it and flag it as unconverted) rather than comparing native units. Share one helper between rows and projections.

### WR-08: Import's `router.replace('/activity')` now targets a tab inside `(tabs)`

**File:** `app/(app)/import.tsx:18` (interacts with this phase's move of Activity into `app/(app)/(tabs)/`)
**Issue:** Import is an outer-stack screen above `(tabs)`. Replacing it with `/activity` issues a REPLACE on the outer stack for the `(tabs)` group, which can create a second `(tabs)` instance with a new key instead of returning to the existing one. That would double the tab bar and FAB providers and confuse BackHistory's depth. YouScreen already avoids this with `router.dismissTo(ACTIVITY_HREF)` (YouScreen.tsx:97). Verify on device.
**Fix:** `onDone={() => router.dismissTo(ACTIVITY_HREF)}`.

## Info

### IN-01: The Text wrapper turns off OS scaling for Text without an explicit `fontSize`

**File:** `src/ui/Text.tsx:15-23`
**Issue:** It always sets `allowFontScaling={false}`, and `scaleTextStyle` only scales a `fontSize` that is present. Any Text styled without `fontSize`, or relying on the default, no longer follows the OS setting (D-19). Current call sites mostly use `textRole`, which carries a size, so the risk is latent.
**Fix:** If the flattened style has no numeric `fontSize`, leave native scaling on with `maxFontSizeMultiplier={FONT_SCALE[scale]}`.

### IN-02: `barShares` uses `Math.abs(paidOut)`

**File:** `src/engine/activity/monthFigures.ts:94`
**Issue:** A month whose paid refunds exceed its paid outflows has `paidOut > 0`, and the bar then shows that net refund as a "paid" share. Clamp with `Math.max(0, -paidOut)`.

### IN-03: `toCurrency` is bounded by `DRAFT_ID_MAX`

**File:** `src/engine/entryList/draft.ts:153`
**Issue:** `toCurrency` uses `DRAFT_ID_MAX` (64) where `currency` uses `DRAFT_CURRENCY_MAX` (12). Use the currency bound for both.

### IN-04: `useRegisterFab` cleanup can clobber the next screen's config

**File:** `src/shell/fab/FabProvider.tsx:166-176`
**Issue:** The cleanup calls `setScreenFab(null)` unconditionally. If B's focus effect runs before A's blur cleanup, B's config is wiped. There are no callers yet, so this is latent. Clear only if the current config is the one this screen set (an id or token comparison).

### IN-05: Mixed Reanimated cross-thread APIs

**File:** `src/shell/screen/useTabRootChrome.tsx:78,159`
**Issue:** It uses `runOnJS`, which is deprecated in the Reanimated 4 line, while `Sheet.tsx` uses `scheduleOnRN`. Standardise on `scheduleOnRN`.

### IN-06: File-level eslint-disables are broader than needed

**File:** `src/ui/Sheet.tsx:1`, `src/features/record/activity/ActivityScreen.tsx:1`, `src/shell/screen/TabRootScreen.tsx:1`
**Issue:** `react-hooks/refs` and `react-hooks/immutability` are disabled across whole files (Sheet.tsx is about 470 lines). Nothing is hidden today, but future ref reads during render will go unflagged. Narrow them to line-level disables at the Gesture or shared-value sites.

### IN-07: Activity's refresh keys omit `accountBalances`

**File:** `src/features/record/activity/ActivityScreen.tsx:86-95`
**Issue:** Home includes `queryKeys.accountBalances(hh)`; Activity does not. Pull-to-refresh on Activity can report "nothing new" while balances are stale. Share one key list between the two screens.

### IN-08: DiscardPrompt is mounted only while `dirty`

**File:** `src/ui/Sheet.tsx:340-349`
**Issue:** If `dirty` drops to false while `discardOpen` is true, the prompt unmounts but `discardOpen` stays true, so it reappears as soon as the sheet becomes dirty again. Reset `discardOpen` when `dirty` becomes false, or always mount the prompt.

---

_Reviewed: 2026-10-14T17:24:01Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
