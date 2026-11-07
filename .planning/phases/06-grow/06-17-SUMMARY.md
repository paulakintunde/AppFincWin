---
phase: 06-grow
plan: 17
subsystem: ui
tags: [grow, debts, payoff, sale, add-debt, expo-router]
requires: ["06-09", "06-14", "06-15"]
provides:
  - "DebtsSegment (G05): hero, debt-payment line card, rows, cards paid in full, payoff plan card, owns its AddDebtSheet"
  - "PayoffPlanCard: Highest rate first / Smallest balance first side by side, unranked; extra stepper; three scenarios"
  - "DebtDetailScreen (G06) and route app/(app)/grow/debt/[id].tsx"
  - "AddDebtSheet (G07, add and edit), SaleSheet (D-16)"
  - "debtLineModel.ts: debtLineModel, aboutTens, firstClearedDate, estimatedMinimumOf, paidPercent, saleOutcome"
  - "debtScreenData.ts: useDebtMonth, useDebtRows, useDebtFormat, debtHref"
affects: [06-22]
key-files:
  created:
    - app/(app)/grow/debt/[id].tsx
    - src/features/grow/debts/PayoffPlanCard.tsx
    - src/features/grow/debts/DebtDetailScreen.tsx
    - src/features/grow/debts/AddDebtSheet.tsx
    - src/features/grow/debts/SaleSheet.tsx
    - src/features/grow/debts/debtLineModel.ts
    - src/features/grow/debts/debtScreenData.ts
    - src/features/grow/debts/__tests__/debtLineModel.test.ts
    - src/features/grow/debts/__tests__/debtScreens.test.tsx
  modified:
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/home/__tests__/GrowHome.test.tsx
requirements-completed: [GRW-07, GRW-08, GRW-09]
completed: 2026-11-06
---

# Phase 6 Plan 17: Debts screens Summary

The Debts side of Grow on screen: the segment with the unranked side-by-side payoff plan, the debt detail with "If you pay more", Add a debt with the D-15 card question and the D-28 estimated minimum, and the D-16 sale sheet that closes a loan in one save.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Debts segment and payoff plan card | b68b8cae | 10 segment tests, 14 line-model tests |
| 2 Debt detail, Add a debt, sale sheet | 67757c10 | Add, detail and sale tests (21 screen tests in all) |

Task 1's commit also contains `AddDebtSheet.tsx`, because the segment imports it and the commit would not compile without it. Task 2 extends it (edit mode) and adds the detail, the sale sheet and the route.

## What was built

- **Payoff plan (D-13).** Two equal-weight columns, each with payoff date and total interest (plus "First debt cleared" with 2+ debts). Neither column is marked until the user taps one; only the user's pick (or an order they saved before) gets the accent border. With one debt both are disabled and the card says "With one debt, both orders are the same." and "The choice is yours." A test asserts neither is `selected` before a tap.
- **What-ifs.** Stepper in $25 steps (44 px, "Extra each month, ..., adjustable", no haptic) re-runs the read model's `buildDebtsModel` with the typed extra, so the three scenario rows update in place. LEDGER: Apr 2029 about $760; Dec 2028 about $640 and 4 months sooner; Dec 2028 about $580. "About" rounds to the nearest ten, half up (`aboutTens`).
- **Use $50 extra.** One `useSaveDebtPlan` call with the user's order (or null), paid from the debt's account, else the first open checking account; light haptic; toast with Undo (the step id the hook recorded).
- **Add a debt.** Type chips; Credit card first shows the required radio. Yes: only statement day and optional balance (saved with rate null and minimum 0). No / Not sure: rate, minimum, due day; blank minimum shows "Estimated minimum $118.65. Type the statement minimum to replace it." for 420000 at 21.9%. Live line against Decide's rule; crossing it shows the warning badge, one warning haptic, and the save still works (T-06-17-03).
- **Sale.** "Sold for", date, "Paid off with" (prefilled with the balance); preview "The $8,420 is paid off and $1,580 is left over" or "$X is still owed"; a payment over the balance is refused with the 06-14 string. One `useRecordDebtSale` call.
- **Detail.** Owed, "Started at ... 42% paid", rate, payment, paid from, ends, interest still to pay, "If you pay more" (+$50: Dec 2028, saves about $110), the next Expected payment, sale and remove actions, footer.
- Month figures (usual pay, left each month) come from Decide's `monthBreakdown` via `useDecideSnapshot`; the rule from `decide_settings.dsr_line`.

## GrowHome wiring that remains (06-22 owns GrowHome.tsx; not edited here)

`DebtsSegment` now opens its own Add a debt sheet from its empty-state button and its "Add a debt" button, so those work with no wiring. What GrowHome still has to do:

1. **FAB.** `onAddDebt` is still a no-op, so the Debts FAB does nothing. Add `const [addDebtOpen, setAddDebtOpen] = useState(false)`, make `onAddDebt` call `setAddDebtOpen(true)`, and render `<DebtsSegment addOpen={addDebtOpen} onAddClosed={() => setAddDebtOpen(false)} />`.
2. The old `onAdd` prop is still accepted (optional) and never called; GrowHome can stop passing it.

## Deviations from Plan

**1. [Rule 3] GrowHome.test.tsx edited.** The Debts segment now reads its own model and the sheet imports pull in Supabase, so the existing "Debts and Investing show their empty states" test needed a `useDebtsRead` stub and a `@/services/supabase` stub (4 lines). 06-22 should expect that file to have changed when it merges.

**2. [Rule 3] Extra files.** `debtScreenData.ts` (shared reads and formatters) is not in the plan's file list; the Decide sheet's `ChipRow`/`Label` helpers pulled in the whole sign-in tree under Jest, so small local versions live in `AddDebtSheet.tsx`.

**3. [Design] "Remove debt" marks the debt paid off today** through the existing `useSetDebtPaidOff` (label `debtPaidOff`). No soft-delete mutation exists for debts: `EditGrowDebtFields` excludes `deleted_at`, and 06-14 built none. Effect: the debt leaves Grow and Decide stops counting it from today, past payments stay, and Undo restores it. A true "removed" record would need a new `deleted_at` mutation and undo label.

**4. [Design] "Over your rule" not "Over your line".** The shipped string is `grow.debts.add.overBadge` = "Over your rule" (and "Your rule is at most 36%"). I used the strings as they are, so the plan's literal "Over your line" is not on screen; tests assert the shipped text.

**5. [Design] "Change in the payoff plan"** calls `router.back()`, because the Grow tab has no path of its own to push to yet (the tab is hidden).

## Known limitations

- **Payments list** shows only the next Expected payment. Past payments need a transactions-by-series read that 06-14 does not provide.
- A debt with no due day shows "rate · payment" without "due the ..." (no string for that row).
- Plan columns show the saved plan (saved extra, or minimum only); the scenario rows move with the stepper.
- `aboutTens` assumes the currency's decimals from an exponent argument; the screens call it with the default 2, which is wrong for a 0-decimal currency.
- Not run on a device. New routes rely on Expo Router auto-registering `grow/debt/[id]` (same assumption as 06-15).

## Missing strings (en.ts untouched)

- Toast for an edited debt (the edit toast reuses the undo-label text "debtEdited").
- Debt row with no due day ("{{rate}} · {{payment}} a month").
- Past payment rows on the detail screen ("{{date}} · {{amount}}" exists as `grow.goals.detail.historyRow`; no source of payments).
- Toast for "Remove debt".
- A "Not found" heading for a debt that is gone (the generic load-error card is used).

## Known Stubs

None. `onAdd` on `DebtsSegment` is accepted and ignored by design (see wiring above).

## Threat Flags

None. T-06-17-01: equal-weight columns, no default pick, "The choice is yours.", forbidden-word grep returns nothing in `src/features/grow/debts/*.tsx`. T-06-17-02: rate pattern and amount bounds checked in the sheet before the hook's own checks. T-06-17-03: over-rule warning shown, save allowed.

## Verification

- `npx jest src/features/grow/debts src/features/grow/home src/features/grow/__tests__/copyLint src/theme`: all pass.
- `npm run typecheck`, `npm run depcruise`, eslint on `src/features/grow/debts` and the route: clean (two `require` warnings in the test, same as sibling tests).
- Undo: the global Undo already invalidates debts, recurring series and transactions, so the plan and sale steps refresh without a call to `refreshDebtReads`.
- Not run: full coverage (per milestone rule).

## Self-Check: PASSED

Files exist; commits b68b8cae and 67757c10 exist.
