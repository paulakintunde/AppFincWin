# Phase 3.1: Activity header device acceptance record

Plan 03.1-15. Manual-only checks from 03.1-UI-SPEC.md (Verification hooks) and 03.1-CONTEXT.md that jest cannot make: layout, gestures, TalkBack and glyph rendering. Run on the physical Android phone (Pixel 9). iOS rows wait for an iOS development build (Apple enrolment). No account emails or personal identifiers are recorded here.

- Phase: 03.1-activity-header-redesign
- Date: to fill
- Device: Pixel 9 (Android), development build
- Build id: to fill (development build from branch phase/03.1-activity-header, HEAD 67113d9 or later)

Labels below are the English strings in src/i18n/locales/en.ts. Month names come from Intl, so the exact short form depends on the phone locale (for example "Sept 2026" in en-GB, "Sep 2026" in en-US).

Setup for the whole run: use a month that has entries and a recurring-offer card ("... also ran in {month} at about the same amount. Mark it monthly?"), and at least two categories and two accounts. Start with no filter, view By day, sort Newest, default font and display size.

## B1 Above the fold (D-43, D-46; UI-SPEC "Above-the-fold acceptance")

1. Open Activity at default font size and display size, on the month prepared above (offer card showing, no filter).
2. Without scrolling, look for the first entry row.

Expected: the first entry row is fully visible (not cut off by the screen bottom or the tab bar) without scrolling. If it fails, record how much is hidden; the fix is to trim card padding, never below 44pt targets.

Result: PENDING

## B2 Four bands and nothing lost (D-43, D-44, D-45, D-53)

1. Read Activity top to bottom.
2. Tap the More icon and read the menu.
3. Use each item in turn: Select entries, Clone {previous month}, Paste a list, Accounts, History.
4. Tap the month name and read the month list.

Expected: band 1 is the "Activity" title and the avatar with no date eyebrow above it; band 2 is Previous month, the month name, Next month, then Search, Filter, More; band 3 is the summary card; band 4 is the Display chip. The More menu (title "More") shows Select entries; then Clone {month} ("Lines that aren’t repeating") and Paste a list ("One line per item"); then Accounts and History, in three groups with dividers. Each item works. The month list shows per-month entry counts and "Add {next month}" as its bottom row (not repeated in More).

Result: PENDING

## B3 Card parity with Home (D-47, D-49, D-70)

1. Note Home's This month figure and caption for the current month.
2. Open Activity on the same month and compare the figure.
3. Apply a category filter on Activity; read the card again.
4. Remove the filter. Open Display, choose Running balance, close, and read the card.
5. If the month has lines waiting for a rate, note the "{n} lines waiting for a rate" line.

Expected: the Activity figure string equals Home's for the same month. The caption reads "left after everything · {n} entries" (singular "1 entry"); with a filter on, the figure is unchanged and the caption reads "{shown} of {count} entries". "{amount} still to come" sits in the top corner when there is something unpaid and is absent when zero. The line under the figure is "In {amount} · Out {amount}"; in Running balance it becomes "Balance across all accounts" (or "Waiting for a rate"), with the figure unchanged. The card is one TalkBack stop, not a button.

Result: PENDING

## B4 Tight space (D-54, D-55)

1. Settings > Display > Display size and text: set the font size to the largest, then repeat with the smallest Display size / narrowest width the phone allows (or the Android emulator at 320dp width).
2. Open Activity with a long month name (for example September or November) and watch band 2.

Expected: the month name shortens first (Intl short form, never a 3-letter slice); if it still does not fit, the three icons drop to their own right-aligned row under the month row and the month cluster takes the full width. Nothing in the month name ellipsises. Search and Filter never move into More. Every target stays 44pt (screenshot with Show layout bounds if in doubt). Restore the settings afterwards.

Result: PENDING

## B5 Glyph parity with the tab glyphs (D-56; UI-SPEC "Acceptance check")

1. Screenshot the month row (Search, Filter, More) above the tab bar at the default size, on the canvas background; repeat inside a fill1 context (the 36 circle itself) at 1x and at the phone's 3x density by zooming the screenshot.
2. Compare each new glyph against the Activity, Insights and Decide tab glyphs.
3. Record the screenshot file paths below (outside the repo, no personal data in them).

Expected: (a) the Search ring reads the same stroke weight as the Insights ring, the Filter bars the same thickness as the Activity bars; (b) the glyphs sit in the same optical box (3 to 4 unit margin); (c) the faded element (Search handle, outer Filter bar, outer More dots at 0.45) is clearly secondary but visible; (d) no glyph looks heavier or thinner than a tab glyph.

Screenshot paths: to fill

Result: PENDING

## B6 Filter badge and chips (D-57, D-65, D-66, D-67)

1. Tap Filter (label "Filter" when none active) and set one category, one account and a direction (Money out); apply.
2. Read the Filter icon and the band 4 row.
3. Tap a chip label; tap the x on one chip.
4. Add a third filter again, so three chips show; scroll the chip row sideways.
5. Turn on Unpaid only from the Filter sheet (or arrive via Home Pay bills) with the other filters still on; tap Clear all.
6. Clear everything, then arrive with Unpaid alone.

Expected: badge shows the number of active filters (category, account, amount, direction; amount min and max count as one), "9+" at ten or more; TalkBack reads "Filter, 3 active". Chips follow the Display chip in the order category, account, amount, direction, in the accent-selected look with a trailing x. Tapping the label area opens the Filter sheet (TalkBack: "Filter: {label}. Opens filters."); tapping the x removes just that filter ("Remove filter {label}") and focus moves to the next chip, or to the Display chip when none remain. With three or more chips the row scrolls sideways on a single line (no wrap) and ends with "Clear all". Clear all removes the non-Unpaid filters and keeps Unpaid. Unpaid alone shows the "Showing unpaid bills" banner (with Clear) under band 4, no chip, and a plain "Filter" icon with no badge.

Result: PENDING

## B7 Search (D-59, D-60, D-61, D-62)

1. Tap the Search icon.
2. Type a term; switch the scope to Every month and back.
3. Tap Cancel.
4. Repeat with Settings > Accessibility > Remove animations switched on.
5. With a Home Pay bills intent (Unpaid banner) arriving while search is open, if reachable, note what happens.

Expected: the month row is replaced by the search field ("Search {month}" / "Search every month") with a Cancel button at its trailing edge, the keyboard comes up and the field has focus; the scope switch shows This month selected (it always opens on This month). Bands 3 and 4, the Unpaid banner and the recurring-offer card are hidden; the first list line is the results count ("{n} transactions"). Cancel (TalkBack: "Cancel search") clears the term, resets scope to This month, restores the month row and returns focus to the Search icon. The swap is a cross-fade of about 150 ms with no list jump; with Remove animations on it is instant. A Home intent that arrives while searching closes search and lands on the month with the banner.

Result: PENDING

## B8 Select mode and long-press (D-63)

1. More > Select entries.
2. Observe the header and the bottom bar. Tick two rows.
3. With nothing selected (tap None), tap Mark paid in the bottom bar.
4. Tap Done. Then long-press one row.
5. With select mode off, swipe a row left and right (pay / delete), then long-press the same row. Try a slow drag that starts as a press.
6. With TalkBack on, check a row's custom actions.

Expected: a select bar replaces band 4 (band 3 stays): "{n} selected" on the left, then Select all, None and Done. "{n} selected" appears exactly once, in that select bar; the bottom bulk bar shows only Mark paid, Mark unpaid and Delete, with no count (changed after plan 14, commit 67113d9). Display and filter chips are hidden in select mode and return on Done. With nothing selected, tapping Mark paid shows the hint "Select some rows first." in the bulk bar, and TalkBack announces it (polite live region) without moving focus. Long-press on a row enters select mode with that row already ticked and no extra haptic; the swipe gestures still work with select off, and a long-press does not trigger a swipe nor a swipe a long-press. Each row exposes a named custom action "Select" in TalkBack. The FAB is hidden while selecting.

Result: PENDING

## B9 Calendar view (D-68)

1. Display chip > Calendar > Done.
2. Open More. Scroll the Calendar view.
3. Switch back to By day.

Expected: the chip reads "Calendar" with no sort; the Display sheet shows no "Sort by" section while Calendar is chosen; More has no "Select entries"; the card is unchanged; filter chips and badge still work; the compact header appears on scroll (see B10). Leaving Calendar restores the previously stored sort.

Result: PENDING

## B10 Compact header (D-58)

1. On Activity (By day), scroll until the large title has gone.
2. Read the compact header. Tap Filter and More there.
3. Tap Search there.
4. View a month from another year and scroll again.
5. Repeat the scroll in Calendar view.
6. Look at Home's compact header.

Expected: the compact header reads "Activity · {short month}" (for a month in another year it adds the year, for example "Activity · Oct 2025") with the back chevron when history exists and the three icons at the trailing edge; no avatar while scrolled. Filter and More behave as in the month row. Search scrolls the list to the top and then opens search mode with the field visible. The same header appears in Calendar view. At 320dp or the largest text the title ellipsises first and icons keep 44pt targets. Home's compact header is unchanged (avatar present).

Result: PENDING

## B11 TalkBack order (D-69, Phase 3 D-20)

1. Turn TalkBack on and swipe right from the top of Activity.
2. Change tab and come back; push Accounts from More and go back.
3. Open the Display, More and Filter sheets and read each.

Expected, in this order: title "Activity"; Previous month; "{Month Year}, choose month"; Next month; Search; Filter (with "{n} active" when filtered); "More actions. Opens a menu."; the summary card as a single stop reading "{figure} left after everything, {n} entries. In {amount}. Out {amount}." (plus "{amount} still to come" when present); the Display chip reading "{view} · {sort}, display options" ("Calendar, display options" in Calendar); each filter chip left to right, then Clear all; then the Unpaid banner, offer card and list. Tab change and push move focus to the title (the compact title once visible). Sheets announce their title, keep focus, and offer a Close action. Every icon-only control has a spoken name and role button.

Result: PENDING

## B12 No regressions (Phase 3 G5, H8, L3; D-41)

1. Go offline (airplane mode) with Activity at scroll 0; return online.
2. Scroll to the last row of a long month.
3. Switch the phone language/region to one with different month names (or confirm a localised month name), and read the month row and compact header.
4. From Home tap Pay bills (and See all).

Expected: the slim sync line shows at scroll 0 while offline and is gone when back online (G5); the last row clears the Add pill (H8); month names are localised from Intl, long and short (L3); Pay bills lands on Activity with the "Showing unpaid bills" banner, search closed, and the Filter icon with no badge (D-41).

Result: PENDING

## Sign-off

Exceptions: none recorded yet

Overall: PENDING
