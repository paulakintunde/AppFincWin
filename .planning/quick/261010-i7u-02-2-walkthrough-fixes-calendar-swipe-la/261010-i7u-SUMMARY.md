---
phase: quick-261010-i7u
plan: 01
status: complete
requirements: [ACT-17, REC-23, REC-24, REC-25, MON-06]
commits: [860ecbb, 8ae741f, a4ba4ac, "type-fix commit after a4ba4ac"]
completed: 2026-10-10
---

# Quick 261010-i7u: Phase 02.2 walkthrough fixes

Fixed the eight Pixel 9 walkthrough defects and recorded REC-26, REC-27 and ACC-14 under a new Phase 02.3.

## What changed

- **Calendar (860ecbb):** header and each week are their own row container with `flex: 1` cells, so seven columns fit at any width (tested at 360 and 411.43). Category-colour dots are gone. A day with activity gets a `fill1` tile and one dot (accent for net > 0, danger for net < 0, inkFaint for zero); empty days are plain. The selected day keeps its accent ring. The calendar branch of ActivityScreen sits in a ScrollView and scrolls to the detail y reported by `onDetailLayout`.
- **Swipe labels (860ecbb):** label is `numberOfLines={1}`, zone padding is `space.gapSm`, and the zone width is `max(88, measured label + 2*padding)`. That width also drives `leftThreshold`/`rightThreshold`; `SWIPE_ACTION_WIDTH` stays exported as the minimum.
- **Android keyboard (8ae741f):** `Sheet` tracks `keyboardDidShow`/`keyboardDidHide` on Android only and adds the height to the container's bottom padding. iOS keeps KeyboardAvoidingView `padding`. `SheetScroll` gets `automaticallyAdjustKeyboardInsets`.
- **Amber cap toast (8ae741f):** `tone: 'default' | 'warning'` on `ToastState`/`showToast`/`ToastView`. Only `useCapCrossing` sets `warning` (warn1 background, surface text, about 5.9:1, asserted >= 4.5 in a test).
- **Archive account (8ae741f):** outlined bounded button (border `line4`, pill radius, 44 min height), `ConfirmSheet` first, then `doArchive`, toast "Account archived · {name}" with Undo.
- **EUR home currency (8ae741f):** `fetchRatesForHomeChange` treats EUR as covered and, for any other code the ensure call did not report, accepts a `fetchFxLatest(client, date)` row dated within 7 days on or before the date (matches `change_home_currency`'s `rate_date >= p_today - 7`). A null chunk still returns `failed`.
- **Docs (a4ba4ac):** REC-26, REC-27 (Recording) and ACC-14 (Account & Access) added unticked with traceability rows to Phase 2.3; coverage 234 total / 75 ticked (ticked count verified by grep, unchanged). ROADMAP gets the Phase 02.3 section, list bullet and progress row; the 02.1, 02.2, 02.3, 3 headings are intact and in order. STATE records the walkthrough outcome and the quick-task row (commit column "-", the orchestrator fills it in).

## Decisions and notes

- **Month footer: skipped.** ActivityHeader already shows the month totals (`vm.totals`) above every view, so a second In/Out footer in the calendar would duplicate it.
- **Categories sub-label stays `warn1`.** It is already the brightest warn token (about 5.9:1 on surface) and no new colours are allowed.
- **Sheets outside SheetScroll:** every sheet containing a TextInput (AccountSheet, FilterSheet, CategorySheet, RepeatsField, TransactionSheet, PasteSheet) already uses `SheetScroll`. No sheet needed restructuring.
- Stored undo-step label for an archive remains `accountEdited` (server history shows "Account edited"); only the toast uses `accountArchived`.

## Deviations from Plan

**1. [Rule 3 - Blocking] Added `accountArchived` to `UNDO_LABEL_KEYS`** (`src/engine/undo/types.ts`, not in the plan's file list). `UndoToastHost` only offers Undo for toast keys listed there, so without it the new toast would have had no Undo. The label key is free text server-side (regex check only), so no migration.

**2. [Rule 1 - Bug] Misplaced i18n keys.** First insertion of the `archiveConfirm*` keys landed in the wrong `archive:` block; moved to `accounts.remove`. Caught by the AccountRemoveRow tests.

**3. [Rule 1 - Bug] Test helper typing.** `Sheet.keyboard.test.tsx` helper typed `render` as sync; fixed to `Awaited<ReturnType<typeof render>>`. Fixed in a follow-up commit.

No edge function or migration changes; Supabase MCP not used.

## Verification (final gate, in C:/dev/fincwin-w1)

- `npm run typecheck`: clean
- `npm run lint`: 0 errors, 0 warnings output
- `npm run depcruise`: no violations (358 modules, 1947 dependencies)
- `npm run check:ignores`: OK
- `npm run test:coverage`: **219 suites passed, 5860 tests passed**; coverage thresholds held (exit 0)
- `npm run verify:gates`: GATES OK
- The coverage run began before the one-line type-only fix to the keyboard test; typecheck, lint and the test itself were re-run after it.

## Known Stubs

None.

## Self-Check: PASSED

Commits 860ecbb, 8ae741f, a4ba4ac exist on fix/walkthrough-02.2; new files `src/ui/__tests__/Sheet.keyboard.test.tsx` and `src/ui/__tests__/ToastView.tone.test.tsx` exist.
