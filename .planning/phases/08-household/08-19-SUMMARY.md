---
phase: 08-household
plan: 19
subsystem: household-ui
tags: [household, sharing, split, entry-sheet, activity, stale-write, bulk-share]
requires: [08-03, 08-12, 08-15, 08-16]
provides: [SharedGroup, useSharedEntry, SplitSheet, splitPreview, PaidByPicker, ShareSeriesPrompt, SharedLineDetail, StaleWriteCard, SharedRowCue, BulkShare]
affects: [08-20, 08-21]
key-files:
  created:
    - src/features/household/sharing/splitPreview.ts
    - src/features/household/sharing/SplitSheet.tsx
    - src/features/household/sharing/PaidByPicker.tsx
    - src/features/household/sharing/SharedGroup.tsx
    - src/features/household/sharing/ShareSeriesPrompt.tsx
    - src/features/household/sharing/SharedLineDetail.tsx
    - src/features/household/sharing/StaleWriteCard.tsx
    - src/features/household/sharing/SharedRowCue.tsx
    - src/features/household/sharing/BulkShare.tsx
    - src/features/household/sharing/sharedLineState.ts
    - src/features/household/sharing/useSharingMoney.ts
  modified:
    - src/features/record/entry/TransactionSheet.tsx
    - src/features/record/activity/ActivityRow.tsx
    - src/features/record/activity/TransactionDetailSheet.tsx
    - src/features/record/activity/BulkBar.tsx
    - src/features/record/activity/ActivityScreen.tsx
    - src/i18n/locales/household/sharing.ts
requirements: [HH-04, HH-05]
completed: 2026-11-15
---

# Phase 8 Plan 19: Marking money shared Summary

Sharing from the entry sheet, a split sheet whose preview is the engine's `splitLine` and nothing else, a paid-by picker, the "Share every month" prompt, a shared-line detail with change history, a stale-write card that names who changed the line first, Activity cues, and bulk share with an explicit count.

## What was built

- **splitPreview.ts** maps the sheet's state onto `engine/household/lineSplit.splitLine` and back (rows in join order, `addsUp`, `leftToAssign`, over-assigned amount, refusal reason). There is no second split maths in `src/features/household` (`grep "allocate("` prints nothing).
- **SplitSheet** ("How this is split"): `SplitRuleList`, a Who's-in-it `CheckRow` list, a `fill1` result card with "Adds up to {{amount}}", By amount `MoneyInput` rows with "Left to assign" in `warn1` and the `stateTight` glyph, By weight read-only with a "Change weights" link to `WeightsSheet`, "Save split". Save while not adding up gives `hapticWarn` and saves nothing. Totals sit in a polite live region debounced 600 ms with `useSettledLabel`. By amount is offered only when the line is in the household currency.
- **PaidByPicker**: members through the resolver, default "You", the D-18 helper when someone else is chosen.
- **SharedGroup / useSharedEntry** in the entry sheet (household of 2 or more, plain expenses): Shared switch with helper; Paid by and Split rows with the rule and each person's amount; the household or category default shows before save (HH-06); the rule is only sent when the person changed it by hand. Joint accounts show the badge and notes, no switch. Debt and goal lines show "Debt and goal payments stay personal." and no switch. Non-creators get the split row only. A covering settle-up disables the switch with the reason. The writes (`shareLine`, `setLineSplit`, `setPaidBy`, `makeLinePrivate`) are enqueued after the line's own save. Make-private shows "Line made private" with Undo (re-share with the stored split).
- **ShareSeriesPrompt**: "Share every month of this bill?" (every month / just this one).
- **SharedLineDetail**: people on the line, Shared badge, Logged by, Paid by, creator-only explanation, Settled or Waiting `StatusBadge`, editable split row (Undo from `splitUndoVars`), own-category row (`setMyLineCategory`), "Changes" list of `ChangeLine`s, and the stale-write card. Edit and Delete in the detail sheet are hidden for people who may not use them.
- **StaleWriteCard**: reads the parked conflict for the line, says "{{name}} changed this first" through the resolver and `updated_by`, with "See their change" (refetch) and "Make my change again"; `hapticWarn`.
- **Activity**: `SharedRowCue` under shared rows (Settled, then the row's own status, then Shared; "logged by" when the viewer is the named payer); settle-up records read "Settled", not as spending. **BulkShare** in `BulkBar`: counts what can be shared, asks "Share {{count}} lines?", calls `bulk_share_transactions`, toasts the server's `shared_count`.

## Deviations from Plan

1. **[Rule 3] New helper files outside `files_modified`**: `sharedLineState.ts` (cover, stored split, default rule), `useSharingMoney.ts`, `SharedRowCue.tsx`, `BulkShare.tsx`. They keep the listed files readable and let ActivityRow and BulkBar load household code lazily.
2. **[Rule 3] One-line wiring in `ActivityScreen.tsx`** (passes `selectedRows` and `onShared` to `BulkBar`); the plan lists only BulkBar but the screen owns the selection.
3. **[Rule 3] Existing tests got a one-line mock each** so they do not pull the household data layer (supabase env, Google sign-in native module) into their import graph: eight `TransactionSheet*`/`recurringControls` tests mock `SharedGroup`; six Activity screen tests mock `BulkShare`. `ActivityRow` and `TransactionDetailSheet` load their household parts with a lazy `require` the first time a shared line is drawn, so their tests needed no change.
4. **Own-category row reads once** (no cache key): `fetchMyLineCategories` on open. Stored splits are read the same way, without a new query key, so the cache-shape lock is untouched.
5. **Undo on "Changes"** is offered only for the latest split change when the event carries a `before` snapshot (`params.before`); the server has no household undo RPC wrapper in 08-15.
6. **Stale-write detail**: the failed write keeps only `updated_by`, so the card gives "{{name}} changed this first. Your change wasn't saved." Field, before, after and time ("changed the amount from $80 to $84 at 14:05") show when a caller passes them (`change` prop); nothing supplies them yet.
7. **Limits**: the multi-line entry list save does not share lines; a new repeating line is shared after its series is created and the series scope follows the prompt.

## Known Stubs

None. The `change` detail on `StaleWriteCard` is optional and has a plain-sentence fallback.

## Verification

See the report returned with this plan: tsc, targeted jest (sharing, record/entry, record/activity, householdCopy, hapticNames, noRawColours, the screens that import the entry sheet or Activity), eslint on touched folders.
