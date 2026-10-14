# Phase 3: Shell - Pattern Map

**Mapped:** 2026-10-13 (replaces the 2026-09-26 map, which predated Phases 2, 2.1, 2.2 and 2.3 and assumed `@gorhom/bottom-sheet`)
**Worktree / base:** `C:/dev/fincwin-p3`, branch `docs/03-context-update` (code as of main `2956c45`)
**Files analyzed:** 52 (31 new, 21 modified)
**Analogs found:** 48 / 52 (4 have no in-repo analog: tab bar, compact header, FAB lift, toast re-homing)

Authority: `03-CONTEXT.md` (2026-10-13 decisions and "Plan impact") wins over `03-RESEARCH.md` where they disagree on sheets. Every line number below was read from the current worktree.

---

## Repo-state facts the planner must know first

1. **No `@gorhom/bottom-sheet`, no `expo-blur`, no `predictiveBackGestureEnabled`.** `package.json` has `expo-haptics ~57.0.3` (L33), `react-native-gesture-handler ~2.32.0` (L47), `react-native-reanimated 4.5.1` (L49), `react-native-worklets 0.10.1` (L54). `expo-blur` is **not installed** (03-01 must still add it). `app.config.ts` has no `predictiveBackGestureEnabled` (03-01 must still add `false`).
2. **No `src/shell/` exists yet.** Navigation code lives in `src/features/navigation/` (`SwipeBack.tsx`, `swipeBackGesture.ts`, tests). Pick one home for the shell (recommended: keep `src/features/navigation/` for back/swipe and add `src/features/shell/` or `src/shell/`; either is fine, but be consistent).
3. **There is no tab navigator.** `app/(app)/_layout.tsx` is a single `Stack` with `screenLayout` wrapping every route in `SwipeBack` (L41-56). The routes are flat siblings: `activity`, `accounts/index`, `accounts/[id]`, `categories`, `category-rules`, `history`, `import`, `setup/account`, `setup/history`, `you`, `consent`.
4. **`MonthTotals.stillToCome` mixes signs.** `src/engine/activity/totals.ts` L67-81 adds every pending row's and every projection's signed `amountHome` (income positive, outflows negative) into one `stillToCome`. It is **not** "unpaid outflows". Home's UNPAID / pending bar / "left after everything" deduction needs a new engine function that splits outflows (UI-SPEC §Home 3 says the planner must confirm this; confirmed here: it mixes).
5. **The `unpaidOnly` filter keeps pending income too, and filtering drops projections.** `src/engine/activity/filters.ts` L97: `if (f.unpaidOnly && row.status !== 'pending') return false;` (no direction check). `useActivityViewModel.ts` L261: `projections: searching || filtering ? [] : monthView.projections`. So "Pay bills" / "See all" landing on `unpaidOnly` would show pending income and hide projected bills, which does **not** match Home's UNPAID figure or Coming up rows. The plan must either set `direction: 'out'` with `unpaidOnly`, or add an outflow-only unpaid mode, and decide whether projections appear under the filter.
6. **Selected month is local state.** `useActivityViewModel.ts` L130: `const [month, setMonth] = useState(() => initialMonth ?? monthOf(rc.today));`. "Home and Activity share one selected-month state" (UI-SPEC Decided #2) needs a shared store; nothing exists yet.
7. **`APP_HOME_HREF` doubles as "the Activity link".** `src/features/auth/appHome.ts` L6 = `'/activity'`. Besides `app/index.tsx` L21 and `ConsentScreen.tsx` L44, `src/features/you/YouScreen.tsx` L35 uses it for the "Activity" row (`{ label: 'you.record.activity', href: APP_HOME_HREF }`) and L90 does `router.dismissTo(APP_HOME_HREF)`. Moving the constant to Home silently retargets You's Activity row. Add a separate Activity href (or tab switch) when 03-13 moves the landing.
8. **`swipeBackGesture.ts` L28 excludes `'activity'` by route name.** Once tab roots move into a `(tabs)` group the route names change; the exclusion set must list every tab root (and Home), or the edge swipe pops a tab root.
9. **Stacked sheets are already nested Modals.** `TransactionSheet.tsx` renders its `ConfirmSheet`s (L1123-1171) *inside* its own `<Sheet>` (L748). A child `Sheet` is a `Modal` mounted inside the parent's Modal tree, so D-28 stacking already works structurally; what is missing is the top-of-stack registry (Android back / drag only on top, toast placement, focus).
10. **`Sheet` returns `null` when `!visible`** (`Sheet.tsx` L71-73), so every close is already instant. A drag slide-out (D-24) needs an internal "closing" phase that keeps the Modal mounted for ~240ms before `onDismiss`.
11. **`Dropdown`'s backdrop is transparent today.** `src/ui/Dropdown.tsx` L91-96 renders `<Pressable style={styles.scrim} ...>` and `styles.scrim` (L161) is only `absoluteFill`, with no colour. UI-SPEC wants it on the shared ink-at-0.38 value.
12. **No `maxFontSizeMultiplier` anywhere in `src/`** (grep, zero hits). D-19 caps are greenfield.
13. **No `RefreshControl` anywhere in `src/`.** The only `BackHandler` use is `src/features/system/UpdateRequiredScreen.tsx` L40.
14. **`Chip` cannot be reused for Home month chips.** `src/ui/Chip.tsx` L21-22 uses `accentTint1` / `accent` when selected. UI-SPEC wants `ink` fill + `surface` text selected, `fill1` + `inkMuted` unselected.

---

## Inventory: current Sheet call sites

**35 call sites in 26 files**, plus `Dropdown` (own `Modal`) in 4 files.

### Direct `<Sheet>` (23 sites, 21 files; excludes the `ConfirmSheet.tsx` L42 and `DetailSheet.tsx` L40 internals)

| File | Line(s) | Kind (for D-25/26/27) |
|---|---|---|
| `src/features/record/entry/TransactionSheet.tsx` | 137 (edit loading shell), 748 (main) | **entry sheet** (D-25 draft; D-27 "Discard list?" on Cancel) |
| `src/features/record/accounts/AccountSheet.tsx` | 211 | edit sheet (D-26 dirty) |
| `src/features/record/categories/CategorySheet.tsx` | 104 | edit sheet (D-26) |
| `src/features/record/categories/RuleSheet.tsx` | 123 | edit sheet (D-26) |
| `src/features/record/activity/FilterSheet.tsx` | 100 | edit sheet (D-26) |
| `src/features/you/components/HomeCurrencyChangeSheet.tsx` | 58 | edit/confirm (classify) |
| `src/features/record/activity/CloneMonthSheet.tsx` | 103 | task sheet (classify) |
| `src/features/record/import/PasteSheet.tsx` | 227 | edit sheet with text input (D-26 candidate) |
| `src/features/record/import/PasswordPromptSheet.tsx` | 45 | prompt |
| `src/features/record/activity/RecurringReviewSheet.tsx` | 76 | review list |
| `src/features/record/activity/MonthSwitcher.tsx` | 106 | picker |
| `src/features/record/activity/ActivityScreen.tsx` | 392 | **Add menu, folded into the FAB quick menu (D-11)** |
| `src/features/record/categories/RemoveCategoryPrompt.tsx` | 126, 149 | confirm |
| `src/features/record/entry/EditScopePrompt.tsx` | 28 | confirm |
| `src/features/record/entry/RepeatsField.tsx` | 64 | picker (stacked over entry) |
| `src/features/record/entry/pickers/AccountPicker.tsx` | 26 | picker (close-then-open hand-off, D-28) |
| `src/features/record/entry/pickers/CategoryPicker.tsx` | 49 | picker |
| `src/features/record/entry/pickers/CurrencyPicker.tsx` | 53 | picker |
| `src/features/record/entry/pickers/DateField.tsx` | 57 | picker |
| `src/features/record/entry/pickers/OptionPicker.tsx` | 21 | picker |
| `src/features/record/samples/SampleClearPrompts.tsx` | 40 | prompt |

### `<ConfirmSheet>` (11 sites, 6 files)

`TransactionSheet.tsx` x4 (L1123, 1132, 1144, 1154; all nested inside the L748 Sheet), `ActivityScreen.tsx` x2 (L365, 410), `AccountRemoveRow.tsx` x2, `OccurrenceActions.tsx` x1, `import/ExtrasDetail.tsx` x1, `samples/SampleBanner.tsx` x1.

### `<DetailSheet>` (1 site)

`src/features/record/activity/TransactionDetailSheet.tsx` (Home's Coming-up row tap reuses this).

### `Dropdown` (own Modal, 4 files)

`activity/ActivityHeader.tsx`, `activity/SortDropdown.tsx`, `activity/ViewDropdown.tsx`, `you/components/WeekStartRow.tsx`.

### Existing Sheet tests (keep, extend; never delete)

| Test | What it pins | Phase 3 action |
|---|---|---|
| `src/ui/__tests__/Sheet.gestureRoot.test.tsx` | `testID="sheet-gesture-root"` wraps the Modal content (Android SwipeRow) | keep unchanged |
| `src/ui/__tests__/Sheet.keyboard.test.tsx` | Android `paddingBottom = sheetPadBottom + insets.bottom + kb`, listeners released | keep; drag must not change `sheet-container`'s `paddingBottom` |
| `src/ui/__tests__/Sheet.scrim.test.tsx` | backdrop `backgroundColor === colors.scrim`; backdrop outside `sheet-container` | **rewrite**: assert ink + opacity 0.38, drop the `colors.scrim` regex test (L32-34), keep the "outside the container" test (L36-46) |
| `src/ui/__tests__/ConfirmSheet.test.tsx`, `DetailSheet.test.tsx`, `Dropdown.test.tsx`, `SwipeRow.test.tsx`, `ToastView.tone.test.tsx` | primitives | keep; extend Dropdown for the ink backdrop |
| `src/features/navigation/__tests__/SwipeBack.test.tsx`, `swipeBackGesture.test.ts` | edge swipe | keep; extend the route-exclusion test for tab roots |
| `src/state/__tests__/undoToast.test.ts` | toast store, timings, queue | keep |

---

## Inventory: what Home reuses (D-32, no new server calls)

| Need | Existing source | Location |
|---|---|---|
| Month rows, projections, totals, loading/error, refetch | `useMonthView(ctx, month)` returning `MonthView` | `src/data/queries/activity.ts` L43-50 (type), L111-196 (hook); `refetch` L190-193 |
| Month list for chips + counts | `useTransactionMonths(householdId, today, horizonMonth)` | `src/data/queries/activity.ts` L201-221 |
| Paid in / paid out / unconverted count | `monthTotals()` → `MonthTotals` | `src/engine/activity/totals.ts` L22-95 (signs: L61-81) |
| Overdue flag per row | `isOverdue()`, mapped in `useMonthView` (`overdue`) | `src/engine/activity/status.ts` L24; `activity.ts` L141 |
| Still-to-come rows (Coming up) | `ActivityRowView` with `status === 'pending'` + `ProjectionView` | `src/data/queries/activity.ts` L24-41; sectioning in `src/features/record/activity/activitySections.ts` L39 `buildActivityItems` |
| Mark paid (Pay button) + toast with Undo | `useRowActions(ctx).pay(row)` | `src/features/record/activity/useRowActions.ts` L22-51 |
| Detail sheet on row tap | `useRowFlow(rowActions, month)` → `detail` props; `TransactionDetailSheet` | `useActivityViewModel.ts` L71-122; `ActivityScreen.tsx` L397 |
| Accounts + balances + standing | `useAccounts(householdId)` + `useAccountBalances(householdId, accounts)` | `src/data/queries/accounts.ts` L6; `src/data/queries/activity.ts` L273-342 |
| Balance text / "waiting for a rate" | `useBalanceSummary`, `AccountBalanceBlock` (compact) | `src/features/record/accounts/AccountBalanceBlock.tsx`; used at `AccountsScreen.tsx` L41, L52 |
| Active vs archived split, order | `accounts.filter((a) => a.archived_at === null)` | `AccountsScreen.tsx` L66 |
| Context: household, user, home currency, today, cents, horizon | `useRecordContext()` | `src/features/record/useRecordContext.ts` L19-32 |
| Money + date formatting | `useMoneyFormatter(showCents)`; `money(amount, currency)` | `src/ui/money/useMoneyFormatter.ts` L25; used in `MonthTotalsBar.tsx` L23 |
| Month label | `formatMonthLabel(month, locale)` | `src/features/record/activity/MonthSwitcher.tsx` (imported at `ActivityScreen.tsx` L36) |
| First-account gate | `needsFirstAccount(...)` | `app/(app)/activity.tsx` L10-16 |
| i18n keys to reuse | `activity.totals.in/out/unconverted_*` (en.ts L641-648), `activity.overdue` (L558), `activity.balance.waiting`, `a11y.close` (L1255), `a11y.dismiss` (L1260) | `src/i18n/locales/en.ts` |

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| **Sheet engine (03-09 rewrite)** |||||
| `src/ui/Sheet.tsx` (M) | component (modal primitive) | event-driven (gesture) | itself + `src/features/navigation/SwipeBack.tsx` (Gesture.Pan) + `src/features/you/components/AnalyticsToggle.tsx` (Reanimated `withTiming`) | exact (extend) |
| `src/ui/sheetDrag.ts` (N, pure: `shouldDismissOnRelease`, `clampDrag`, `SHEET_DRAG_THRESHOLD = 92`) | utility (pure) | transform | `src/features/navigation/swipeBackGesture.ts` | exact |
| `src/state/sheetStack.ts` (N: open-sheet registry, top id, dirty flags) | store | pub-sub | `src/state/undoToast.ts` / `src/state/samplePrompt.ts` | exact |
| `src/ui/ConfirmSheet.tsx` (M) | component | request-response | itself (`onDismiss` vs `onCancel`, L23-24, L42) | exact |
| `src/ui/DetailSheet.tsx` (M, header becomes drag zone) | component | request-response | itself | exact |
| `src/ui/SheetHeader.tsx` (M, drag-zone wrapper + handle) | component | event-driven | itself | exact |
| `src/ui/Dropdown.tsx` (M, ink backdrop) | component | request-response | `Sheet.tsx` backdrop L81-87 | exact |
| `src/theme/tokens.ts` (M, remove `scrim` L39-40, header comment L3) | config | n/a | itself | exact |
| `src/theme/motion.ts` (M, 5 `DURATION` keys) | config | n/a | itself L9-13 | exact |
| `src/theme/layout.ts` (M, `space.cardPadLg = 20`, `radii.toast = 18`) | config | n/a | itself L4-30 | exact |
| `src/ui/__tests__/Sheet.scrim.test.tsx` (M) | test | n/a | itself | exact |
| `src/ui/__tests__/Sheet.drag.test.tsx` (N) | test (RNTL + RNGH jest-utils) | event-driven | `src/features/navigation/__tests__/SwipeBack.test.tsx` | exact |
| `src/ui/__tests__/sheetDrag.test.ts` (N) | test (pure) | transform | `src/features/navigation/__tests__/swipeBackGesture.test.ts` | exact |
| `src/state/__tests__/sheetStack.test.ts` (N) | test | pub-sub | `src/state/__tests__/undoToast.test.ts` | exact |
| **Dismissal rules (03-16 rewrite)** |||||
| `src/features/record/entry/useEntryDraft.ts` (M, form + list in one draft) | utility (device storage) | file-I/O | itself | exact |
| `src/engine/entryList/draft.ts` (M, `parseDraft`/`serialiseDraft` gain the form) | utility (pure) | transform | itself | exact |
| `src/features/record/entry/useEntryList.ts` (M) | hook | file-I/O | itself (L90 load, L104 save, L117 continue, L125 discard) | exact |
| `src/features/record/entry/TransactionSheet.tsx` (M) | component | event-driven | itself L487 `requestCancel`, L748, L1144-1171 | exact |
| `AccountSheet.tsx`, `CategorySheet.tsx`, `RuleSheet.tsx`, `FilterSheet.tsx`, `PasteSheet.tsx` (M, report `dirty`) | component | request-response | `ConfirmSheet` stacked inside `TransactionSheet` (L1154-1171) | role-match |
| `src/ui/DiscardChangesSheet.tsx` (N, or inline `ConfirmSheet` usage) | component | request-response | `src/ui/ConfirmSheet.tsx` | exact |
| **Toast (D-16)** |||||
| `src/features/record/history/UndoToastHost.tsx` (M, re-homes into top sheet, bottom offset by context) | component (host) | pub-sub | itself | exact |
| `src/ui/ToastView.tsx` (M, `radii.toast`) | component | n/a | itself L43 | exact |
| **Navigation shell** |||||
| `src/features/navigation/backHistory.ts` (N, pure 8-deep reducer, direction) | utility (pure) | transform | `swipeBackGesture.ts`, `src/features/system/routeDecision.ts` | exact |
| `src/features/navigation/BackHistoryProvider.tsx` (N) | provider | event-driven | `src/features/auth/AuthProvider.tsx` (Context + throwing hook) | exact |
| `src/features/navigation/useAndroidBack.ts` (N) | hook | event-driven | `src/features/system/UpdateRequiredScreen.tsx` L40 + `useReduceMotion` L21-42 | exact |
| `src/features/navigation/availableTabs.ts` (N, pure) | utility | transform | `swipeBackGesture.ts` `isSwipeBackRoute` L28-32 | exact |
| `src/features/navigation/swipeBackGesture.ts` (M, `NO_SWIPE_BACK` for tab roots) | utility | transform | itself L26-32 | exact |
| `src/features/navigation/SwipeBack.tsx` (M, `router.back` → history `goBack`) | component | event-driven | itself L26-31 | exact |
| `src/features/navigation/TabBar.tsx` (N) | component | request-response | none (no `tabBar` render prop in repo); wiring from `SyncStatusLine.tsx` | no analog (wiring only) |
| `src/features/navigation/TabGlyphs.tsx` (N) | component (SVG) | transform | `src/features/auth/brand/AppleMark.tsx` | exact |
| `src/features/navigation/TabHeader.tsx` (N, large → compact title, avatar, back chevron) | component | event-driven (scroll) | `src/ui/Screen.tsx` + `ActivityScreen.tsx` L222-227 header | role-match |
| `src/features/navigation/fab/FabProvider.tsx`, `Fab.tsx`, `shouldHideFab.ts`, `FabQuickMenu.tsx` (N) | provider / component / pure / sheet | event-driven | `AuthProvider.tsx`; `Pill`; `routeDecision.ts`; `ActivityScreen.tsx` L392-396 Add sheet | exact / role / exact / exact |
| `src/features/navigation/useRefreshScreen.ts` (N, pull-to-refresh + completion toast) | hook | request-response | `useMonthView.refetch` (`activity.ts` L190-193) + `QueryProvider.tsx` `resumeRestoredMutations` + `showToast` | role-match |
| `app/(app)/_layout.tsx` (M) | route/layout | request-response | itself | exact |
| `app/(app)/(tabs)/_layout.tsx` (N) | route/layout | request-response | `app/(app)/_layout.tsx` | role-match |
| `app/(app)/(tabs)/index.tsx` (N, Home) and `activity.tsx` (moved) | route | request-response | `app/(app)/activity.tsx` | exact |
| `src/features/auth/appHome.ts` (M) | config | n/a | itself | exact |
| `src/features/you/YouScreen.tsx` (M, Activity row no longer `APP_HOME_HREF`) | component | n/a | itself L35, L90 | exact |
| `app.config.ts` (M, `android.predictiveBackGestureEnabled: false`) / `package.json` (M, `expo-blur`) | config | n/a | itself | exact |
| **Activity edits (03-12, 03-15)** |||||
| `src/features/record/activity/ActivityScreen.tsx` (M: remove Add Pill L226 and Add Sheet L392-396; remove "You" link L217; accept initial filter; header to `TabHeader`; `RefreshControl` on FlashList) | component | request-response | itself | exact |
| `src/features/record/activity/useActivityViewModel.ts` (M: month from shared store, `initialFilter`) | hook | request-response | itself L124-135 | exact |
| **Home (new plans, D-30…D-32)** |||||
| `src/state/selectedMonth.ts` (N, shared Home/Activity month) | store | pub-sub | `src/state/samplePrompt.ts` | exact |
| `src/engine/activity/monthPosition.ts` (N, pure: `unpaidOutflows`, `leftAfterEverything`, bar shares) | engine (pure) | transform | `src/engine/activity/totals.ts` | exact |
| `src/engine/activity/__tests__/monthPosition.test.ts` (N) | test (fast-check) | transform | `src/engine/activity/__tests__/activity.test.ts` `describe('monthTotals')` L103+ | exact |
| `src/features/home/HomeScreen.tsx` (N) | component (screen) | request-response | `src/features/record/accounts/AccountsScreen.tsx` | role-match |
| `src/features/home/useHomeViewModel.ts` (N) | hook | request-response | `src/features/record/activity/useActivityViewModel.ts` | exact |
| `src/features/home/QuickActions.tsx` (N) | component | request-response | `ActivityScreen.tsx` links row L214-265 | role-match |
| `src/features/home/ThisMonthCard.tsx` (N) | component | transform | `src/features/record/activity/MonthTotalsBar.tsx` | exact |
| `src/features/home/MonthChips.tsx` (N) | component | request-response | `src/ui/Chip.tsx` (shape only; colours differ) | role-match |
| `src/features/home/ComingUpCard.tsx` (N) | component | request-response | `ActivityScreen.tsx` L158-177 row wiring + `useRowActions` | role-match |
| `src/features/home/AccountsCard.tsx` (N) | component | request-response | `AccountsScreen.tsx` `AccountCard` L27-55 | exact |
| `src/i18n/locales/en.ts` (M: `home.*`, `refresh.*`, `shell.*`, `sheet.discard.*`) | config (copy) | n/a | itself, `activity.totals` block L641-648 | exact |
| `src/features/home/__tests__/*.test.tsx` (N) | test (RNTL) | n/a | `src/ui/__tests__/Sheet.keyboard.test.tsx` (ThemeProvider + safe-area mock) | role-match |

---

## Pattern Assignments

### `src/ui/Sheet.tsx` (component, event-driven) — 03-09

**Analog:** itself (keep everything below), plus `SwipeBack.tsx` for the Pan and `AnalyticsToggle.tsx` for Reanimated.

**Keep verbatim** — the Android keyboard hook (L33-52), the `GestureHandlerRootView` with `testID="sheet-gesture-root"` (L77-79, reason in `.planning/debug/resolved/sheet-swipe-android.md`), the iOS-only `KeyboardAvoidingView` (L80), the cap and padding (L95-103):
```tsx
maxHeight: height - insets.top - space.groupGap,
backgroundColor: colors.surface,
borderTopLeftRadius: radii.sheetTop,
borderTopRightRadius: radii.sheetTop,
paddingHorizontal: space.sheetCornerPad,
paddingTop: space.sheetCornerPad,
paddingBottom: space.sheetPadBottom + insets.bottom + keyboardHeight,
```

**Replace** — the slide-in (L60-69, a linear-cubic 250ms RN `Animated.timing` from `height`):
```tsx
const [slide] = useState(() => new Animated.Value(height));
useEffect(() => {
  if (!visible) return;
  slide.setValue(height);
  Animated.timing(slide, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
}, [visible]);
```
with a Reanimated shared value driven by `DURATION.sheetUp` / `EASING` through `useMotion().duration()`. Copy from `AnalyticsToggle.tsx` L25-37:
```tsx
const motion = useMotion();
const progress = useSharedValue(value ? 1 : 0);
useEffect(() => {
  progress.value = withTiming(value ? 1 : 0, { duration: motion.duration(DURATION.entrance), easing: EASING });
}, [value, motion, progress]);
const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * THUMB_TRAVEL }] }));
```

**Replace** — the backdrop (L81-87). Current:
```tsx
<Pressable testID="sheet-backdrop" style={[styles.backdrop, { backgroundColor: colors.scrim }]}
  accessibilityRole="button" accessibilityLabel={t('a11y.close')} onPress={onDismiss} />
```
New: same `testID`, role and label, `backgroundColor: colors.ink`, animated `opacity` 0 → `BACKDROP_OPACITY` (0.38, export it from one place, e.g. `sheetDrag.ts` or `motion.ts`) over `DURATION.backdrop`. Must stay **outside** `sheet-container` (pinned by `Sheet.scrim.test.tsx` L36-46). No `rgba(` literal (`src/theme/__tests__/noRawColours.test.ts` L18 regex `/#[0-9a-fA-F]{3,8}\b|rgba?\(/`).

**Add** — the drag Pan, copied from `SwipeBack.tsx` L18-34 (memoised `Gesture.Pan()`, `.runOnJS(true)` acceptable for the release decision, `.withTestId(...)` so the test can drive it):
```tsx
const gesture = useMemo(
  () =>
    Gesture.Pan()
      .runOnJS(true)
      .hitSlop({ left: 0, width: SWIPE_BACK_EDGE_WIDTH })
      .activeOffsetX(12)
      .failOffsetY([-20, 20])
      .withTestId('swipe-back')
      .onEnd((e) => { /* pure threshold fn decides */ }),
  []
);
```
For the sheet, invert the axes per UI-SPEC: `.activeOffsetY(10)` + `.failOffsetX([-10, 10])` so `SwipeRow` (`ReanimatedSwipeable`, `src/ui/SwipeRow.tsx` L16) keeps horizontal swipes. Follow 1:1 in `onUpdate` (UI thread, `translateY = max(0, e.translationY)`), decide in `onEnd` with the pure `shouldDismissOnRelease(dy)` (92px). Handle + header always drag; body drags only at scroll top (compose with `SheetScroll`'s `ScrollView` L126-134 via `Gesture.Native()` + `simultaneousWithExternalGesture`, executor discretion).

**Add** — closing phase: today `if (!visible) return null;` (L71-73) makes Cancel/Save/backdrop instant, which D-24 wants. Keep that path. Only a drag dismissal plays the `DURATION.sheetDrag` slide-out to 110% and fires `onDismiss` at ~190ms.

**Add** — `hapticSelection()` from `src/ui/haptics.ts` L18-20 on drag dismissal (D-18). Do not import `expo-haptics` directly.

**Add** — a11y escape: `accessibilityViewIsModal`, `onAccessibilityEscape`, and an Android `accessibilityActions=[{ name: 'escape' | custom, label: t('a11y.close') }]` on `sheet-container` (L88-90 already has `accessibilityLabel`).

**Props to add (shape is discretion, CONTEXT):** keep `visible`, `onDismiss`, `children`, `accessibilityLabel` (L26-31) unchanged so all 35 call sites compile untouched; add optional `dirty?: boolean` and `onRequestDiscard?: () => void` (or `dismissPolicy: 'close' | 'draft' | 'confirm'`). Gesture / Android back / backdrop go through the policy; `SheetHeader`'s Cancel still calls the caller's own handler (D-27).

---

### `src/ui/sheetDrag.ts` (utility, pure) — 03-09

**Analog:** `src/features/navigation/swipeBackGesture.ts` (whole file, 32 lines)

Named constants + a sample interface + one pure boolean decision, no React/RN import (L6-24):
```ts
export const SWIPE_BACK_EDGE_WIDTH = 28;
export const SWIPE_BACK_DISTANCE = 80;
export const SWIPE_BACK_MIN_FLICK = 24;
export const SWIPE_BACK_VELOCITY = 600;

export interface SwipeSample { startX: number; translationX: number; translationY: number; velocityX: number; }

export function shouldSwipeBack(s: SwipeSample): boolean {
  if (s.startX > SWIPE_BACK_EDGE_WIDTH) return false;
  ...
  return s.translationX >= SWIPE_BACK_MIN_FLICK && s.velocityX >= SWIPE_BACK_VELOCITY;
}
```
Apply: `SHEET_DRAG_THRESHOLD = 92`, `BACKDROP_OPACITY = 0.38`, `clampDrag(dy) = Math.max(0, dy)`, `shouldDismissOnRelease({ translationY, velocityY })` (velocity rule optional, "Still open" #1). Test file mirrors `swipeBackGesture.test.ts`.

---

### `src/state/sheetStack.ts` (store, pub-sub) — 03-06 / 03-09 / 03-16

**Analog:** `src/state/undoToast.ts` L51-120 (module-level state + `useSyncExternalStore`), `src/state/samplePrompt.ts` (smaller, same shape).

```ts
let toast: ToastState | null = null;
const listeners = new Set<() => void>();
function notify(): void { for (const listener of listeners) listener(); }
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getToast(): ToastState | null { return toast; }
export function useToast(): ToastState | null { return useSyncExternalStore(subscribe, getToast); }
export function resetToastForTests(): void { toast = null; pending = []; nextId = 1; notify(); }
registerWipeHandler({ id: 'undo-toast', wipe: async () => { toast = null; pending = []; notify(); } });
```
Apply: an ordered array of open sheet ids (push on mount while `visible`, remove on close), `useTopSheetId()`, `useIsSheetOpen()` (feeds `shouldHideFab`, D-10), per-id dismiss handler so Android back (D-06 step 1, D-29) closes only the top. Register a wipe handler like L131-138. Rationale for a store over Context: Sheets are separate native windows; a module store is reachable from every window without provider plumbing, exactly why `undoToast.ts` L1-5 chose it.

---

### `src/ui/ConfirmSheet.tsx` / `DiscardChangesSheet` (component, request-response) — 03-16

**Analog:** `src/ui/ConfirmSheet.tsx` (whole file). The dismiss-vs-cancel split D-25/D-26 needs already exists (L23-24, L42):
```tsx
/** Swipe-down or back dismissal; defaults to onCancel so a prompt can treat dismissal differently from Cancel. */
onDismiss?: () => void;
...
<Sheet visible={visible} onDismiss={onDismiss ?? onCancel}>
```
"Discard changes?" is a `ConfirmSheet` stacked inside the dirty edit sheet's children, exactly like `TransactionSheet.tsx` L1154-1171 (the 02.3 "Discard list?" prompt):
```tsx
<ConfirmSheet
  visible={confirmCancel}
  title={t('record.sheet.draft.cancelTitle', { count: list.items.length })}
  body={t('record.sheet.draft.cancelBody')}
  cancelLabel={t('record.sheet.draft.keep')}
  confirmLabel={t('record.sheet.draft.discardList')}
  destructive
  onCancel={() => { setConfirmCancel(false); onClose(); }}
  onConfirm={() => { list.clearAll(); setConfirmCancel(false); onClose(); }}
  onDismiss={() => setConfirmCancel(false)}
/>
```
For D-26: `cancelLabel` "Keep editing" → just hides the prompt; `confirmLabel` "Discard" `destructive` → closes both; `onDismiss` = Keep editing. Note `ConfirmSheet` puts Cancel left / Confirm right (L46-49), matching UI-SPEC.

---

### `src/features/record/entry/useEntryDraft.ts` + `engine/entryList/draft.ts` (file-I/O) — 03-16 (D-25)

**Analog:** itself (whole file, 35 lines). Storage-never-throws pattern and the wipe-safe key (L7-27):
```ts
export function entryDraftKey(userId: string, householdId: string): string {
  return `${STORAGE_PREFIX}entry-draft:v1:${userId}:${householdId}`;
}
export async function saveEntryDraft(userId: string, householdId: string, items: readonly ListItem[]): Promise<void> {
  try {
    const key = entryDraftKey(userId, householdId);
    if (items.length === 0) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, serialiseDraft(items, new Date().toISOString()));
  } catch { /* device storage unavailable: the list simply is not kept */ }
}
```
Apply: bump the key to `v2` (or make `parseDraft` accept v1) and add the in-progress form to the serialised payload; keep `parseDraft` tolerant (it lives in `src/engine/entryList/draft.ts`, pure, keep it engine-clean). Entry sheet's `<Sheet onDismiss={onClose}>` (`TransactionSheet.tsx` L748) becomes "save draft then close" for drag/back/backdrop; `requestCancel` (L487) keeps today's behaviour:
```tsx
const requestCancel = () => (isNew && list.items.length > 0 ? setConfirmCancel(true) : onClose());
```
The resume prompt (L1144-1153) is reused as-is; a form-only draft counts as 1 (UI-SPEC copy row).

---

### `src/features/record/history/UndoToastHost.tsx` (host, pub-sub) — 03-13 (D-16)

**Analog:** itself. Keep the screen-reader subscription (L54-64), the timer keyed on `toastId`/`kind` (L66-74, so re-homing must not reset it — keep the timer in one place, e.g. move it out of the host into a tiny `useToastTimer` mounted once in the app layer), and the local `onUndo` branch (L112-117):
```tsx
const onUndo = () => {
  if (localUndo !== null) {
    dismissToast(toast.id);
    localUndo();
    return;
  }
  ...
```
Change the positioning (L129-140). Today:
```tsx
<View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + space.gapMd }]}>
```
with `left/right: space.screenH` (L143-148). UI-SPEC: sides `space.groupGap` (18); bottom = tab-bar height + `gapMd` with the bar visible, else `insets.bottom + space.sheetPadBottom`. Rendering: the app-layer host renders only when `useTopSheetId() === null`; `Sheet.tsx` renders a host inside its own `GestureHandlerRootView` when it is the top sheet. Mounted today at `app/(app)/_layout.tsx` L58.

---

### `src/ui/ToastView.tsx` (component) — 03-13

**Analog:** itself. One-line change at L43: `borderRadius: radii.pill` → `radii.toast`. Keep the C-CR-02 non-accessible container (L9-14 comment) and the iOS announce (L38-40).

---

### `src/theme/motion.ts`, `layout.ts`, `tokens.ts` (config)

**`motion.ts`** L9-13 — extend the same object; do not create a second constants file:
```ts
export const DURATION = {
  entrance: 220,
  progress: 550,
  fade: 200,
} as const;
```
Add `tabSlide: 260, push: 240, sheetUp: 260, backdrop: 180, sheetDrag: 240`. Plain-JS durations go through `useMotion().duration(ms)` (L50-57).

**`layout.ts`** — add `toast: 18` to `radii` (L4-10) and `cardPadLg: 20` to `space` (L16-30), each with a one-line provenance comment like `sheetTop` (L8).

**`tokens.ts`** — delete L39-40 (`scrim`) and the "(bar the Sheet scrim)" phrase in the header comment L3. Grep after: only `Sheet.tsx` L83 and `Sheet.scrim.test.tsx` reference `colors.scrim`.

---

### `src/features/navigation/backHistory.ts` + `BackHistoryProvider.tsx` + `useAndroidBack.ts` — 03-02 / 03-06 / 03-13

**Pure reducer analog:** `swipeBackGesture.ts` (above) and `src/features/system/routeDecision.ts` (pure, React-free, documented). Entries: `{ kind: 'tab', tab } | { kind: 'detail', tab, route }`; cap 8; back always yields `dir: -1` (D-05).

**Provider analog:** `src/features/auth/AuthProvider.tsx` — typed `*ContextValue`, `createContext<... | null>(null)`, throwing `use*()` hook (shape reproduced in the 2026-09-26 map; unchanged in the file).

**Android back analog:** `src/features/system/UpdateRequiredScreen.tsx` L40:
```tsx
const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
```
inside the subscribe/cleanup effect shape of `useReduceMotion` (`motion.ts` L24-39). Order per D-06: (1) top sheet from `sheetStack` (apply its dismiss policy) → (2) history pop → (3) Home → (4) `return false` (exit). Note: each Sheet's own `Modal onRequestClose` (`Sheet.tsx` L76) receives Android back first while a sheet is open; route it through the same top-sheet policy so behaviour is identical.

**SwipeBack** (`SwipeBack.tsx` L29-31) swaps `router.canGoBack()/router.back()` for the history's `canPop/pop` within the current tab only (D-07: never switches tabs). Its header comment (L1-4) already anticipates this.

---

### `app/(app)/_layout.tsx` (route/layout) — 03-13

**Analog:** itself (64 lines). Must keep:
- consent gate L21-35 (`useConsent`, `loading` → `<Screen>{null}</Screen>`, `<Redirect href="/consent" />`)
- `animation` choice L23-24 (Android `slide_from_right` / `none` under reduced motion)
- `screenLayout` SwipeBack wrapper L43:
```tsx
screenLayout={({ children, route }) => <SwipeBack enabled={isSwipeBackRoute(route.name)}>{children}</SwipeBack>}
```
- the app-layer hosts L57-60: `<SampleBanner />`, `<UndoToastHost />`, `<SampleClearPrompts />`, `<DeviceHomeCurrencyDefault />`
- `export { RouteErrorBoundary as ErrorBoundary }` L18

Change: register `(tabs)` as the first screen with `gestureEnabled: false`; keep `accounts/[id]`, `categories`, `category-rules`, `history`, `import`, `you` as pushed details above it (they cover the tab bar, D-22, because they are outer-Stack siblings of `(tabs)`); move `activity` into `(tabs)`; keep `setup/*` and `consent` excluded from swipe-back. Mount `<Fab />` beside the hosts.

### `app/(app)/(tabs)/_layout.tsx`, `index.tsx`, `activity.tsx` (routes)

**Analog:** `app/(app)/activity.tsx` (whole file): thin route, `useRecordContext` + `useAccounts` + `needsFirstAccount` gate, then the feature screen with navigation callbacks:
```tsx
const gate = needsFirstAccount({ loading: !rc.ready || accounts.isLoading, isError: accounts.isError, accounts: accounts.data });
if (gate) return <Redirect href="/setup/account" />;
return <ActivityScreen onOpenAccounts={() => router.push('/accounts')} onOpenHistory={() => router.push('/history')} onOpenYou={() => router.push('/you')} />;
```
Home's route needs the same first-account gate (it is now the landing). Tabs layout: JS `Tabs` with `tabBar={(props) => <TabBar {...props} />}`, `headerShown: false`, `href: null` for unavailable tabs (from `availableTabs.ts`). The `TabBar` must use the `navigation` prop, not `useNavigation()`.

### `src/features/auth/appHome.ts` (config) — 03-13

Current L6: `export const APP_HOME_HREF = '/activity' as Href;` → Home's href. Add `ACTIVITY_HREF` (or a tab-switch call) and update `YouScreen.tsx` L35/L90 to it; update the comment in `swipeBackGesture.ts` L26 and the set at L28.

---

### `src/features/navigation/TabHeader.tsx` (component) — 03-03 / 03-15

**Analog:** `src/ui/Screen.tsx` (insets: `paddingTop: insets.headerTop`, L41-46) and the current Activity header `ActivityScreen.tsx` L222-227:
```tsx
<View style={styles.header}>
  <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
    {t('activity.title')}
  </Text>
  <Pill label={t('activity.add')} variant="primary" onPress={() => setAddOpen(true)} />
</View>
```
`styles.header` (L434-439): `flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd`. The Pill slot becomes the 42px avatar (D-04). `Screen scroll` mode (L25-38) shows how to keep the status-bar band outside a ScrollView; the large-title header needs the same treatment so the compact header can overlay.

### `src/features/navigation/TabGlyphs.tsx` (SVG)

**Analog:** `src/features/auth/brand/AppleMark.tsx` (`<Svg width height viewBox><Path d fill={color} /></Svg>`, `color` prop). Geometry per UI-SPEC "Glyphs" table; `viewBox="0 0 22 22"`; colour `ink`/`inkMuted`, never `accent`.

### FAB: `FabProvider.tsx`, `Fab.tsx`, `shouldHideFab.ts`, `FabQuickMenu.tsx` — 03-10 / 03-11 / 03-12

- Provider: `AuthProvider.tsx` shape (registration of `{ label, a11yLabel, onPress }` per screen).
- `shouldHideFab`: pure, `routeDecision.ts` style; inputs include `useIsSheetOpen()` from `sheetStack`.
- Haptics: `hapticLight()` exists (`haptics.ts` L13-15) for press. **Medium impact on long-press has no wrapper yet** — add `hapticMedium()` to `src/ui/haptics.ts` in the same swallow-rejection style:
```ts
export function hapticLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
```
- Quick menu: replaces `ActivityScreen.tsx` L392-396 (keep the same `Row` + direction keys):
```tsx
<Sheet visible={addOpen} onDismiss={() => setAddOpen(false)} accessibilityLabel={t('activity.add')}>
  <Row label={t('record.sheet.directionOut')} onPress={() => openNew('out')} />
  <Row label={t('record.sheet.directionIn')} onPress={() => openNew('in')} />
  <Row label={t('record.sheet.directionTransfer')} onPress={() => openNew('transfer')} />
</Sheet>
```
and `openNew` (L153-156) is the close-then-open hand-off to `TransactionSheet` (`mode={{ kind: 'new', direction }}`, L424-428). The entry sheet must be hostable outside Activity now (Home quick action Add, FAB on any tab): lift `TransactionSheet` + its `entryMode` state to a shell-level host, like `UndoToastHost`.

---

### `src/features/navigation/useRefreshScreen.ts` (hook) — new plan (D-17)

**Analogs:** `useMonthView`'s `refetch` (`src/data/queries/activity.ts` L190-193):
```ts
refetch: () => {
  void txQuery.refetch();
  void seriesQuery.refetch();
},
```
`QueryProvider.tsx` `resumeRestoredMutations(queryClient)` (import from `src/data/cache/persister.ts`) for "retries the write queue"; `showToast({ kind: 'info', text: { key: 'refresh.updated' } })` — the same call shape `useActivityViewModel.ts` L326 uses:
```ts
showToast({ kind: 'info', text: { key: 'activity.clone.earliest', params: { month: monthNameOf(month) } } });
```
"Nothing new" = compare each refetched query's `dataUpdatedAt`/structural equality before vs after (executor discretion). Failed refresh: no toast (UI-SPEC). `RefreshControl` `tintColor`/`colors` = `colors.accent`.

---

### `src/state/selectedMonth.ts` (store) — Home plan

**Analog:** `src/state/samplePrompt.ts` (whole file, 59 lines): module state, `notify`/`subscribe`, a `use*` hook via `useSyncExternalStore`, a test reset helper, a wipe handler (L52-59). Default to `monthOf(rc.today)`; `useActivityViewModel.ts` L130 `useState(month)` and `setMonth` (L345 in the returned object) switch to the store, and `onAddMonth`'s `setMonth(addMonth)` (L322) goes through it.

---

### `src/engine/activity/monthPosition.ts` (engine, pure) — Home plan

**Analog:** `src/engine/activity/totals.ts` (whole file). Copy the header-comment discipline (L1-12: what counts, what is excluded, refunds rule) and the single-pass loop with `continue` guards (L48-73):
```ts
for (const row of rows) {
  if (row.isTransfer) { transferCount++; continue; }
  if (row.status === 'skipped') { continue; }
  count++;
  if (row.amountHome === null) { unconvertedCount++; continue; }
  if (row.status === 'paid') {
    if (row.isRefund === true || row.amountHome < 0) { paidOut += row.amountHome; } else { paidIn += row.amountHome; }
  } else {
    stillToCome += row.amountHome;
    pendingCount++;
  }
}
```
New function takes the same `TotalsInput[]` + projections and returns `unpaidOutflows` (pending/projected with `amountHome < 0`, transfers and nulls excluded), `leftAfterEverything = paidIn + paidOut + unpaidOutflows` (paidOut and outflows are negative minor units), and integer-percent bar shares clamped to 100. Export from `src/engine/activity/index.ts` (L1-11 barrel). No `db/`, `state/`, `ui/`, `react` imports (CLAUDE.md boundary). Refund direction: use `flowOf` semantics (`filters.ts` L40-47) so a pending refund is not counted as an outflow by sign alone.

**Test analog:** `src/engine/activity/__tests__/activity.test.ts` — `import fc from 'fast-check'` (L1) and the `describe('monthTotals')` block (L103-170, example cases plus a property at ~L165). Add properties: shares never exceed 100; result unchanged by transfer rows; income-only pending leaves `unpaidOutflows === 0`.

---

### `src/features/home/useHomeViewModel.ts` (hook) — Home plan

**Analog:** `src/features/record/activity/useActivityViewModel.ts` L124-165 (context, formatter, month view, months, accounts), header comment style L1-4 ("All maths is the engine's ... this hook gathers inputs. Read paths never fetch exchange rates"):
```ts
const rc = useRecordContext();
const formatter = useMoneyFormatter(rc.showCents);
const monthView = useMonthView({ householdId: rc.householdId, homeCurrency: rc.homeCurrency, today: rc.today }, month);
const { months, counts } = useTransactionMonths(rc.householdId, rc.today, rc.horizonMonth ?? null);
const accounts = useAccounts(rc.householdId ?? undefined).data;
```
plus `useAccountBalances(rc.householdId, accounts)` (`AccountsScreen.tsx` L61-63) and `useRowActions`/`useRowFlow` for Pay and detail (`ActivityScreen.tsx` L73-81). Same query keys as Activity, so Home mounts no extra server call (UI-SPEC whole-screen contract).

### `src/features/home/HomeScreen.tsx` (screen)

**Analog:** `src/features/record/accounts/AccountsScreen.tsx` L57-103 (Screen + header + ScrollView of cards + a sheet), and its card style L116-121:
```ts
card: { padding: space.cardPad, borderRadius: radii.card, gap: space.gapSm / 2, minHeight: space.touchMin },
```
Home cards use `space.cardPadLg` inner padding, `colors.surface`, `shadows.card` (from tokens). Order: header, Quick actions, This month, Coming up, Accounts (D-30). Hosts `TransactionDetailSheet {...flow.detail} today={rc.today}` as `ActivityScreen.tsx` L397 does.

### `src/features/home/ThisMonthCard.tsx` (component, transform)

**Analog:** `src/features/record/activity/MonthTotalsBar.tsx` (whole file, 71 lines). Copy the cell pattern (L25-42) including the per-cell accessible label:
```tsx
<View key={c.key} style={styles.cell} accessible accessibilityLabel={`${c.label}, ${c.value}`}>
  <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{c.label}</Text>
  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{c.value}</Text>
</View>
```
and the unconverted note (L48-52):
```tsx
{totals.unconvertedCount > 0 ? (
  <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
    {t('activity.totals.unconverted', { count: totals.unconvertedCount })}
  </Text>
) : null}
```
Differences per UI-SPEC: figures in `sheetTitle` role with `maxFontSizeMultiplier={1.3}`; UNPAID from `monthPosition.unpaidOutflows` in `danger`; headline `heading` role; bar width animated with Reanimated (`AnalyticsToggle.tsx` pattern, `DURATION.progress`).

### `src/features/home/MonthChips.tsx`

**Analog:** `src/ui/Chip.tsx` (Pressable, `accessibilityRole="button"`, `accessibilityState={{ selected }}`, `borderRadius: radii.pill`, `minHeight: space.touchMin`). Do **not** reuse `Chip` (selected colours L21-22 are `accentTint1`/`accent`); build a small chip with `ink`/`surface` selected and `fill1`/`inkMuted` unselected, visual padding 5x11 and `hitSlop` to 44.

### `src/features/home/ComingUpCard.tsx`

**Analog:** row wiring in `ActivityScreen.tsx` L158-177 (`onPress={flow.openDetail}`, `onMarkPaid={rowActions.pay}`) and `useRowActions.pay` (toast with Undo is already inside the hook, `useRowActions.ts` L19-20 imports `undoLabelText`/`showToast`). Projections cannot be "paid" through `rowActions.pay` (it takes `ActivityRowView`); decide whether projected bills show Pay (materialise first) or show without a Pay button. Overdue word from `activity.overdue`; source flag `row.overdue` (`activity.ts` L141).

### `src/features/home/AccountsCard.tsx`

**Analog:** `AccountsScreen.tsx` `AccountCard` L27-55 — build the accessible label from what is shown (S-WR-14 comment L23-26), reuse `useBalanceSummary` and the compact `AccountBalanceBlock`:
```tsx
const kindLine = `${t(`accounts.kind.${account.kind}`)} · ${account.currency}`;
const summary = useBalanceSummary(account, balance);
const label = [account.name, kindLine, summary].filter((p): p is string => p !== null && p !== '').join(', ');
```
Row tap → `router.push(`/accounts/${id}`)` as `app/(app)/accounts/index.tsx` does.

### `src/features/home/QuickActions.tsx`

**Analog:** the equal-width links row in `ActivityScreen.tsx` L256-265 and `styles.link` L448-455 (`flex: 1, minWidth: 0, minHeight: space.touchMin`). Pay bills → Activity tab with the outflow-unpaid filter and the shared month (fact 5); Import → `router.push('/import')` (route exists, `app/(app)/import.tsx`).

---

## Shared Patterns

### Theme + i18n + type in every component
**Source:** `src/ui/SyncStatusLine.tsx`, `src/ui/ConfirmSheet.tsx` L38-45, `MonthTotalsBar.tsx` L21-23
**Apply to:** every new component.
```tsx
const t = useT();
const { colors, pairing } = useTheme();
<Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{title}</Text>
```
No raw colours (`noRawColours.test.ts`), no inline JSX strings (i18next lint), sizes only via `textRole` / `fontSize`.

### Module store via `useSyncExternalStore` (cross-window UI state)
**Source:** `src/state/undoToast.ts` L51-128, `src/state/samplePrompt.ts`
**Apply to:** `sheetStack.ts`, `selectedMonth.ts`, any FAB-visibility or entry-host state that must be read from inside a Sheet's native window. Always add `registerWipeHandler` and a `reset*ForTests`.

### Pure decision functions with named constants
**Source:** `src/features/navigation/swipeBackGesture.ts`, `src/engine/activity/totals.ts`
**Apply to:** `sheetDrag.ts`, `backHistory.ts`, `availableTabs.ts`, `shouldHideFab.ts`, `monthPosition.ts`. Engine files: no React/RN/db/state imports.

### Gesture code and its tests
**Source:** `SwipeBack.tsx` L18-34 (memoised `Gesture.Pan`, `.withTestId`), `SwipeBack.test.tsx` L1-33:
```tsx
import 'react-native-gesture-handler/jestSetup';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
fireGestureHandler(getByGestureTestId('swipe-back'), [
  { state: State.BEGAN, absoluteX: 5, translationX: 0 },
  { state: State.ACTIVE, absoluteX: 5 + translationX / 2, translationX: translationX / 2 },
  { state: State.END, absoluteX: 5 + translationX, translationX, translationY, velocityX },
]);
```
**Apply to:** `Sheet.drag.test.tsx` (92px dismiss, 91px snap-back, horizontal pan does not activate, body-scrolled does not drag).

### RNTL sheet test harness
**Source:** `src/ui/__tests__/Sheet.keyboard.test.tsx` L1-13 (`ThemeProvider` wrap, `jest.setTimeout(20000)`, safe-area mock `{ top: 0, bottom: 10, left: 0, right: 0 }`, `StyleSheet.flatten(...props.style)` assertions).
**Apply to:** all new Sheet, toast-host, Home and TabHeader tests.

### Reduced motion
**Source:** `src/theme/motion.ts` (`useMotion().duration`, `EASING`, `DURATION`), root `<ReducedMotionConfig mode={ReduceMotion.System} />` (`app/_layout.tsx` L97), the Android Stack animation switch (`app/(app)/_layout.tsx` L23-24).
**Apply to:** sheet rise, backdrop fade, drag slide-out/snap-back, tab slide, push, FAB rise/lift, toast rise, Home bar.

### Haptics
**Source:** `src/ui/haptics.ts` (only entry point; async API; swallow rejections).
**Apply to:** FAB press (`hapticLight`), long-press (new `hapticMedium`), drag dismissal (`hapticSelection`). Mocked in `jest.setup.ts`.

### Safe-area-derived offsets
**Source:** `useScreenInsets()` (`layout.ts` L45-48), `Screen.tsx` L41-46, `Sheet.tsx` L97/L103.
**Apply to:** tab bar bottom padding, FAB bottom, toast bottom, TabHeader top. Never literal 30 / 96 / 104 / 68.

---

## No Analog Found

| File | Role | Data Flow | Reason / fallback |
|---|---|---|---|
| `src/features/navigation/TabBar.tsx` | component | request-response | No `Tabs`/`tabBar` render prop in the repo. Use RESEARCH.md's tab-bar pattern for structure, `SyncStatusLine.tsx` for wiring, `expo-blur` (to be installed) for the surface. |
| Compact-header fade in `TabHeader.tsx` | component | event-driven (scroll) | No scroll-linked animation exists. Use Reanimated `useAnimatedScrollHandler` + the `AnalyticsToggle.tsx` style/timing conventions. |
| FAB lift above toast (measured) | component | event-driven | No measured-height animation exists. `ToastView` has no `onLayout`; add one in the host. |
| Toast re-homing into the top Sheet window | host | pub-sub | Nothing renders inside another component's Modal today besides children. Pattern: `Sheet.tsx` renders `<UndoToastHost placement="sheet" />` when it is top-of-stack (via `sheetStack`), and the app-layer host renders only when no sheet is open; timer lives once at app level. |

---

## Metadata

**Analog search scope:** `C:/dev/fincwin-p3/src`, `C:/dev/fincwin-p3/app`, `package.json`, `app.config.ts`
**Files read in this pass:** `03-CONTEXT.md`, `03-UI-SPEC.md`, old `03-PATTERNS.md`, `src/ui/{Sheet,ConfirmSheet,DetailSheet,SheetHeader,ToastView,Screen,Chip,haptics}.tsx/ts`, `src/ui/Dropdown.tsx` (L75-135), `src/ui/SwipeRow.tsx` (L1-80), `src/state/{undoToast,samplePrompt}.ts`, `src/features/record/history/UndoToastHost.tsx`, `src/features/navigation/{SwipeBack.tsx,swipeBackGesture.ts}`, `src/theme/{motion,layout}.ts`, `src/theme/tokens.ts` (L30-48), `src/features/auth/appHome.ts`, `app/_layout.tsx`, `app/index.tsx`, `app/(app)/{_layout,activity,you}.tsx`, `app/(app)/accounts/{index,[id]}.tsx`, `src/features/record/activity/{ActivityScreen,useActivityViewModel,MonthTotalsBar}.tsx/ts`, `src/features/record/activity/useRowActions.ts` (L1-80), `src/engine/activity/totals.ts`, `src/engine/activity/filters.ts` (L1-60, L90-103), `src/data/queries/activity.ts` (L20-52, L105-222, L270-345), `src/features/record/accounts/AccountsScreen.tsx`, `src/features/record/entry/useEntryDraft.ts`, `TransactionSheet.tsx` (L700-760, L1120-1180), `src/features/record/useRecordContext.ts` (L15-60), `src/data/QueryProvider.tsx`, `src/features/you/components/AnalyticsToggle.tsx` (L20-50), tests: `Sheet.{scrim,gestureRoot,keyboard}`, `SwipeBack.test.tsx`, `undoToast.test.ts`, `noRawColours.test.ts`, `activity.test.ts` (headers)
**Pattern extraction date:** 2026-10-13
