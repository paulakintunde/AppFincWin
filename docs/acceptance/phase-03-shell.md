# Phase 3: shell device acceptance record

Plan 03-14. Manual-only checks from 03-VALIDATION.md, run on the physical Android phone (Pixel 9). iOS rows wait for an iOS development build (Apple enrolment). No account emails or personal identifiers are recorded here.

- Phase: 03-shell
- Date: 2026-10-14
- Device: Pixel 9 (Android), development build with expo-blur and the predictive-back flag
- Build id: local `npx expo run:android` build from phase/03-shell (HEAD 06ac01d at install, 2026-10-14, after uninstalling a differently-signed older build; 3-button navigation, secure navigation_mode 0)

## A1 Back chain and top-only dismissal (NAV-02, D-06, D-29)

1. Accounts > Add account, type a name, press back.
2. Press back again, then back, then Discard.
3. Home > Activity > avatar (You); back; back; back.

Expected: first back shows "Discard changes?"; back again closes the prompt and keeps the name; back then Discard closes both. You > back returns to Activity; back returns to Home (slides from the left); back exits the app.

Result: PASS

## A2 Drag feel (NAV-04, D-12a/b, D-18)

1. Drag the Filter sheet 1:1 from its handle and from its header.
2. Release past ~92px, then release short.
3. With a scrolled body, drag down; then scroll back to the top and drag.
4. Fling down quickly (record whether it closes; tuning is SHEET_FLING_VELOCITY, 1000 px/s, in src/ui/sheetDrag.ts; handle margins -22 are also on trial).
5. In the entry sheet's list, do a horizontal REMOVE swipe.

Expected: sheet follows the finger; past ~92px closes with a selection tick, short snaps back; with a scrolled body the drag waits until the list is at the top; fling outcome recorded; REMOVE swipe still works.

Result: PASS (fling and handle margins felt fine; no tuning requested)

## A3 Backdrop and motion (D-23, D-24, D-28, D-37)

1. Open a sheet; watch the backdrop fade over the rising sheet.
2. Open a confirm over the entry sheet.
3. Press Cancel and Save.
4. Open dropdown menus (Activity view/sort, week start).

Expected: backdrop fades in; the confirm darkens a little more; Cancel and Save close instantly; dropdown menus dim the same way.

Result: PASS

## A4 Entry draft and edit guard (D-25, D-27, D-33)

1. New entry, type an amount, swipe down.
2. Add; "You have 1 unsaved entry"; Continue list.
3. With list entries, Cancel.
4. Open an existing entry, change the name, swipe down.
5. Open an existing entry, change nothing, swipe down.

Expected: swipe down closes with no prompt; Continue list restores the amount; Cancel asks "Discard list?"; changed existing entry asks "Discard changes?"; untouched existing entry closes at once.

Result: PASS

## A5 Toast over sheets (D-16)

1. In the entry list remove an item.
2. Tap Undo.
3. Save an entry.

Expected: "Removed · {name}" with Undo shows above the sheet and Undo restores it; after save the Undo toast sits just above the tab bar and the FAB rises above it, then settles.

Result: PASS

## A6 Tabs and slide (NAV-01, D-01, D-02, D-05, D-08, D-18)

1. Look at the tab bar.
2. Home > Activity; then back.
3. Tap the active tab a second time.

Expected: only Home and Activity show; Home > Activity slides in from the right; back slides in from the left; second tap scrolls to top; no haptic on tab change.

Result: PASS

## A7 Details cover the tab bar (NAV-03, D-07, D-22)

1. Open an account from Home's Accounts card.
2. Left-edge swipe.
3. Left-edge swipe on Home and on Activity.

Expected: detail covers the tab bar and FAB; the swipe pops it; the same swipe on Home or Activity does nothing.

Result: FAIL. User: "Swipe from the edge on the left does not work as started; not sure if the swipe works on screen." Diagnosis: the phone uses 3-button navigation, so the only edge swipe is the in-app SwipeBack (src/features/navigation/SwipeBack.tsx + swipeBackGesture.ts): 28dp start zone, 80dp distance, fires only on release, no visual follow. Easy to miss and gives no feedback. Closure: D-40.

## A8 FAB and quick menu (NAV-05, D-09, D-10, D-11, D-18)

1. Look at Home and Activity.
2. Tap the FAB; then long-press it.
3. Enter bulk select; open any sheet; open a pushed screen.

Expected: an "Add" pill above the tab bar on Home and Activity; tap gives a light haptic and the new-transaction sheet; long-press gives a medium haptic and "Quick add" with Add expense, Add income, Transfer, Import statement (no New check); FAB hidden in bulk select, while any sheet is open and on pushed screens; Activity has no Add pill or Add sheet.

Result: PASS

## A9 Home (HOME-01..04, D-30..D-36)

1. Read Home top to bottom; compare IN/OUT with Activity's totals.
2. Compare UNPAID with the sum of Activity's Unpaid list.
3. Pay a bill; Undo. Open a projected bill.
4. Tap Pay bills and See all. Change the month chip on Home.
5. Tap an account row.

Expected: order is quick actions, This month, Coming up, Accounts; no net worth or health card; IN/OUT match Activity; UNPAID equals Activity's Unpaid list (bills only, projected bills included, no income, no transfers); Pay marks paid with Undo; projected bill has no Pay and opens a read-only detail; Pay bills and See all open Activity on Unpaid with the Filter chip active; month chip change on Home changes Activity's month; account row opens the account.

Result: FAIL. When Activity opens with the Unpaid filter on, nothing makes it obvious, so entries look like they disappeared. The only cue is the highlighted Filter chip. Also, projected bills are labelled "Projected" and tappable (read-only) on Home but "Expected", faded and not tappable in Activity (inconsistent). Tapping a recorded unpaid bill showed Mark as paid and Activity rows swipe to pay/delete, confirmed correct. Closure: D-41 and D-42.

## A10 Refresh (D-17)

1. Pull down on Home and on Activity.
2. Make a change from another session, then pull.
3. Airplane mode, pull.

Expected: accent spinner, then "Up to date — nothing new to pull"; after a change elsewhere "Prices and balances up to date"; offline: no toast, the sync line shows.

Result: PASS

## A11 TalkBack (NAV-06, D-20)

1. Turn TalkBack on; swipe through the tab bar.
2. Change tab; push a detail.
3. Open a sheet; trigger a toast over it.

Expected: tabs read "Home, tab, 1 of 2" / "Activity, tab, 2 of 2" with selected state; tab change and push move focus to the title; a sheet announces its title, keeps focus, and offers a "Close" action; a toast over a sheet is announced without moving focus.

Result: PASS (2026-10-14, Pixel 9, TalkBack on: tab semantics, focus moves, sheet Close action and toast announcement as expected)

## A12 Largest text (DSG-07, D-19)

1. Settings > font size max.
2. Visit Home, Activity, You and the entry sheet; type in inputs (TextInput relies on maxFontSizeMultiplier=2, unverified on device, plan 03-05).

Expected: body text about 2x and wrapping, no clipping; tab labels and Home's figures about 1.3x; typed text in inputs capped.

Result: PASS

## A13 Haptics setting (D-18)

1. Turn touch feedback off.
2. Tap the FAB; drag-close a sheet.

Expected: the FAB and drag-close haptics do not fire. If they still fire, record "D-18 gap: expo-haptics impactAsync/selectionAsync ignore the Android touch-feedback setting" for a decision.

Result: PASS (haptics respect touch feedback; no D-18 gap)

## A14 Reduced motion (D-21)

1. Turn Remove animations on.
2. Switch tabs, push, open and drag-close a sheet, watch the FAB and Home bar.

Expected: tab slide, push, sheet rise, backdrop fade, drag slide-out, FAB rise and Home bar are instant; end states identical.

Result: PASS

## A15 Header and sync line (D-14, D-15)

1. Scroll Home and Activity (including Activity's Calendar view, which uses its own scroll view).
2. Go offline or queue writes.
3. Return to all well.

Expected: the large title scrolls away and the compact header fades in on both, including the Calendar path; the slim sync line shows on every screen while offline or queued; absent when all well (You keeps "synced x ago").

Result: PASS

## A16 First account lands on Home (D-38)

1. Create a fresh account and finish setup.

Expected: setup ends on Home, not Activity.

Result: PASS

## I1 Native edge swipe (iPhone XR, D-07)

Native edge swipe pops details only.

Result: pending: Apple enrolment

## I2 VoiceOver (iPhone XR, D-20)

VoiceOver focus and sheet escape.

Result: pending: Apple enrolment

## I3 Largest Dynamic Type (iPhone XR, D-19)

Caps at the largest Dynamic Type setting.

Result: pending: Apple enrolment

## I4 Scroll-bounce while dragging (iPhone XR, Pitfall 7)

Dragging a sheet whose body is at the top does not rubber-band the content.

Result: pending: Apple enrolment

## Additional finding: Accounts row too wide (found on Home)

The Accounts card row for a USD account "Main" at -740 is too wide and spacious. Cause: AccountBalanceBlock `compact` (src/features/record/accounts/AccountBalanceBlock.tsx) still renders the standing/overdraft sentence, the home-currency conversion and RateAttribution under the figure, with no width cap. The same block is used compact on AccountsScreen. Closure: D-39.

## Gaps for closure

- A7 (edge swipe-back not discoverable, no feedback) -> D-40
- A9 (Unpaid filter not obvious; Home/Activity inconsistent on projected bills) -> D-41 (banner) and D-42 ("Expected" everywhere, tappable in Activity)
- Accounts row too wide -> D-39

No app code was changed by plan 03-14; these are gap work for a later plan. Still pending: I1-I4 (Apple enrolment). A11 TalkBack passed later on 2026-10-14.

## Gap re-check (03-38)

Plan 03-38. Re-check on the Pixel 9 of the rows that failed or that the audits doubted, after gap plans 03-25..03-37.

- Date: 2026-10-14
- Device: Pixel 9 (Android, 3-button navigation), same development build as above (no native change since 06ac01d), JS reloaded from Metro
- Build id: phase/03-shell HEAD 7e52bb2
- Gate before the session: tsc, eslint, depcruise clean; jest 337 suites / 8128 tests pass with coverage thresholds met

### R1 A7 edge swipe (G7, D-40)

Result: pending

### R2 A9 Unpaid banner (G8, D-41)

Result: pending

### R3 A9 Expected wording and tap (G9, D-42)

Result: pending

### R4 A15 sync line at rest (G5)

Result: pending

### R5 Accounts row (G6, D-39)

Result: pending

### R6 Import from Home returns to Home (G3)

Result: pending

### R7 Double tap (H7)

Result: pending

### R8 FAB clearance (H8)

Result: pending

### R9 Toast and headline (M3, G1)

Result: pending
