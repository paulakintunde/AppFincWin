---
phase: 03-shell
type: consolidated-findings
created: 2026-10-14
sources: [03-VERIFICATION.md, 03-REVIEW.md, 03-REVIEW-R2.md, 03-UI-REVIEW.md, 03-SECURITY.md, docs/acceptance/phase-03-shell.md]
counts: { blocker: 9, high: 9, medium: 9, low: 13 }
---

# Phase 3: consolidated findings for gap closure

One deduplicated list from the device check, the two code reviews, the UI audit and the security audit. IDs in brackets are the source findings: R1 = 03-REVIEW.md, R2 = 03-REVIEW-R2.md, UI = 03-UI-REVIEW.md, SEC = 03-SECURITY.md, V = 03-VERIFICATION.md gap number, A = device row. Line numbers and fixes are in the source reports.

Device checks: 14 of 16 Android rows pass (A7 and A9 fail). A11 TalkBack passed on 2026-10-14. I1–I4 wait on Apple enrolment.

## Blockers (wrong figure, lost input, broken navigation, decided device fixes)

| # | Finding | Sources | Requirement |
|---|---|---|---|
| G1 | This month headline shows "£0 left" when the month has only expected bills; `empty` ignores projections. | R1 CR-01, R2 CR-02, SEC T-03-22-01, V1 | HOME-02 |
| G2 | Discard in the Repeats field keeps the new occurrence count, so Save writes it. Snapshot on open, restore on discard. | R1 CR-02, R2 CR-03, SEC EF-02, V2 | NAV-04 |
| G3 | `router.replace('/activity')` after import mounts a second `(tabs)` navigator: duplicate FAB, quick menu and entry host, two TransactionSheets on the same draft. Use `canDismiss() ? dismissTo(ACTIVITY_HREF) : replace(ACTIVITY_HREF)`. Import started from Home should finish where it started. | R1 WR-08, R2 CR-01, UI #11 | NAV-02 |
| G4 | Home ignores load errors and the paused-offline state: a failed or offline-without-cache read shows a real-looking empty month and drops expected bills from UNPAID. | R1 WR-01, R2 WR-01, SEC T-03-22-01, V7 | HOME-02 |
| G5 | Sync-problem line missing at scroll 0 on Activity, and on every pushed screen (no route uses DetailScreen). D-15. A15 needs a device re-check. | R2 WR-06, UI #2, SEC T-03-10-02 | NAV-01 |
| G6 | D-39: account rows show the figure plus one short line; overdraft sentence and rate source only on the account screen. | Device finding, V6 | HOME-04 |
| G7 | D-40: Android edge swipe-back about 40dp wide and follows the finger. Device re-check. | A7, V3 | NAV-03 |
| G8 | D-41: "Showing unpaid bills · Clear" banner on Activity while the Unpaid filter is on. | A9, V4 | HOME-01 |
| G9 | D-42: "Expected" everywhere (Home row currently says "Projected", its own detail sheet says "Expected"); Activity expected rows tappable to the same read-only detail. | A9, V5, UI known-gap | HOME-03 |

## High (the app says or does something untrue)

| # | Finding | Sources |
|---|---|---|
| H1 | Draft restore loses `repeats`, lets the category guess overwrite a restored category, and overwrites a typed received amount on cross-currency transfers. | R1 WR-03, R2 WR-03, SEC T-03-24-02 |
| H2 | Editing an uncategorised entry becomes "dirty" on its own when the category guess lands, so an untouched sheet asks "Discard changes?" (D-33) and Save writes the guess. | R1 WR-02, R2 WR-02 |
| H3 | Pull-to-refresh offline says "Up to date — nothing new to pull"; D-17 says no toast on a failed refresh. | R1 WR-06, R2 WR-05 |
| H4 | Restored draft `currency`, `toCurrency` and `status` are not validated (`skipped` accepted on a new entry, direction rules not reapplied, payment types not checked per direction). Server rejects unknown currencies. | R1 WR-04, SEC EF-01 |
| H5 | Drag-dismiss 190ms timer is never cleared; backdrop or Android back during the slide-out calls `onDismiss` twice. | R1 WR-05, R2 WR-04, SEC EF-03 |
| H6 | A 24–92px downward flick on a dirty sheet neither closes it nor asks "Discard changes?" (D-26). | R2 WR-07 |
| H7 | Double tap pushes duplicate screens (avatar → You, Accounts card, Import quick action, Activity links). | R2 WR-08 |
| H8 | The FAB covers the last list row: Activity list and calendar have no bottom padding; Home reserves 18px. | UI #1 |
| H9 | Amount-range filter compares native minor units with home-currency bounds when no rate is known (partly pre-phase). | R1 WR-07, SEC EF-05 |

## Medium (visual and consistency)

| # | Finding | Sources |
|---|---|---|
| M1 | Coming up and Accounts cards lose their shadow on iOS (`overflow: hidden` with `shadows.card`). | UI #3 |
| M2 | The 28px spacer sits inside the Accounts card, leaving a white band under the last row. | UI #4 |
| M3 | Toast has no rise-in animation; padding is 15/16/12 against the specced 13/18/14, so it is about 74px tall. | UI #5 |
| M4 | Cash account tile uses a fixed green tint, wrong with navy, rust or slate accents (same flaw in `Chip.tsx`). | UI #6 |
| M5 | Avatar hit area is 42px with no hitSlop; with no name or email it shows an empty circle instead of the person glyph. | UI #7 |
| M6 | This month card keeps "This month" and "…yet" for past months; the two empty lines use different month forms. | UI #8 |
| M7 | Sibling cards drift: Accounts row gap 12 vs 13, sub-line weight 600 vs 500. | UI #10 |
| M8 | Activity refresh keys omit `accountBalances`. | R1 IN-07, R2 IN-03 |
| M9 | Text with no explicit `fontSize` never scales; `TextInput` relies on `maxFontSizeMultiplier`, which Fabric ignores (A12 passed on device, so confirm before changing). | R1 IN-01, R2 IN-02 |

## Low (polish and housekeeping)

| # | Finding | Sources |
|---|---|---|
| L1 | `tabSlide.ts` module state has no wipe handler; back-step flags can stay set. | R2 IN-01 |
| L2 | MonthChips marked as a tab list but its chips are buttons; hit areas overlap by 3px. | R2 IN-04, UI minor |
| L3 | Month names are cut to 3 characters and upper-cased, which breaks other locales. | R2 IN-05, R-22 deviation |
| L4 | The shared selected month never moves on when a new month starts. | R2 IN-06 |
| L5 | Input typed before the stored draft finishes loading can be lost. | R2 IN-07 |
| L6 | `barShares` uses `Math.abs(paidOut)`, so net refunds show as a paid share. | R1 IN-02 |
| L7 | `toCurrency` uses the 64-character id cap instead of the currency cap. | R1 IN-03, SEC EF-01 |
| L8 | `useRegisterFab` cleanup can wipe the next screen's config (no callers yet). | R1 IN-04 |
| L9 | `DiscardPrompt` can reopen on its own after `dirty` flips. | R1 IN-08 |
| L10 | Mixed `runOnJS` and `scheduleOnRN`; file-level eslint-disables wider than needed. | R1 IN-05, IN-06 |
| L11 | Pay button never wraps under the text at large sizes; Coming up amounts don't line up across rows with and without Pay. | UI minor |
| L12 | Accounts and This month headings lack the header role; TabHeader eyebrow is a separate screen-reader stop; loading placeholders nearly invisible (1.15:1). | UI minor |
| L13 | Stale comment, literal `'/activity'` instead of `ACTIVITY_HREF`, five unused catalogue keys, pressed opacity 0.72 repeated instead of a token. | R2 IN-08, UI minor |

## For the Compliance phase (not gap work)

- "Pay" and "Pay bills" only mark an item paid; they can read as making a payment in an app that executes nothing (UI #9).
- Account deletion with a full purge is not in this phase; re-check wipe coverage then (SEC).
