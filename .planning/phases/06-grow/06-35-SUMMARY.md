---
phase: 06-grow
plan: 35
subsystem: grow-debts
tags: [grow, debts, payoff-plan, d-30, d-32, d-33, d-34, gap-closure]
requires:
  - "06-24 read model scenarios (PlanScenarios, savedExtraPlan)"
  - "06-26 grow.debts copy"
  - "06-30 useRecordDebtOneOff, extraStartDate, oneOffDate"
provides:
  - "PayoffPlanCard Option B reveal (three rows, one open, dated buttons)"
  - "DebtsSegment saves extra / stop / one-off with dated toasts and Undo"
  - "DebtLine.endDate (per-debt payoff end date) and minimumOnlyFor / savedPlanFor helpers"
  - "DebtFormat.monthYearLong for spoken dates"
affects:
  - src/features/grow/debts
tech-stack:
  added: []
  patterns:
    - "Card formats only: every figure from buildDebtsModel scenarios; aboutTens for 'about' figures"
    - "No order picked for the user: 2+ debts and no order gate the rows and the button; minimum-only shows the later date"
key-files:
  created: []
  modified:
    - src/features/grow/debts/PayoffPlanCard.tsx
    - src/features/grow/debts/DebtsSegment.tsx
    - src/features/grow/debts/useDebtsRead.ts
    - src/features/grow/debts/debtScreenData.ts
    - src/features/grow/debts/__tests__/debtScreens.test.tsx
decisions:
  - "With 2+ debts and no order chosen, the minimum-only date (hero and card top line) is the later of the two orders, so no order is quietly picked"
  - "Debt row end date: under a saved extra, the saved plan's strategy (saved order; 'rate' only for an extra saved before any order existed); otherwise each debt on its own minimum"
  - "With no debt rule set, the line card uses the 36% default (same figure GrowLinesScreen shows), labelled '(default)', with its tick"
  - "Row Remove uses DeletableRow's shared Delete wording and confirm sheet (D-32 one remove style) with the debt remove copy"
metrics:
  duration: "about 75 min"
  completed: 2026-11-10
  tasks: 2
  files: 5
---

# Phase 6 Plan 35: Payoff plan reveal and Debts segment wiring Summary

The Debts payoff plan now matches the prototype (Option B): Minimum only / Extra each month / Once, today, one row open at a time with its own control, the debt-free date and interest against the minimum ("was", "4 months sooner", "about $110 less"), and a button that follows the open row and names its start date ("Use $50 extra from Nov 15", "Use $1,000 once on Nov 5", "Stop the extra from Nov 15"). The segment saves the extra on the right debt, stops it, and records a one-off Expected payment through `useRecordDebtOneOff`; debt rows show their end date.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | PayoffPlanCard reveal (Option B) | c722c9e2 | PayoffPlanCard.tsx, useDebtsRead.ts, debtScreenData.ts, DebtsSegment.tsx (prop wiring), debtScreens.test.tsx |
| 2 | DebtsSegment wiring: saves, one-off, stop, hero, rows | f4173748, 7c730fd5 (refactor) | DebtsSegment.tsx, debtScreens.test.tsx |

## What was built

**PayoffPlanCard (Task 1)**
- Top line "Debt-free by Apr 2029 on the minimum." from `minimumOnlyFor(scenarios, order)`.
- One debt: greyed (0.6) two-part order switch, both parts `disabled`, one note "With one debt, both orders are the same."; no columns.
- 2+ debts: two equal columns (Debt-free by / Interest / First debt cleared) worked at the stepper's extra (`scenarios[order].withExtra`), the same border and type, neither selected before a tap, then "The choice is yours.". With no order picked or saved, rows show no figures, one note "Pick an order above to see what changes." and the button is off.
- Rows: radio header per row (accessibilityState selected + expanded); closed rows read "Debt-free by {date} · about {interest} interest". The open row's control and reveal sit beside the header (not inside it), so screen readers reach the stepper and chips. Open row a11y label uses `revealA11y` with the long month.
- Extra row: label above the $25 stepper. Once row: $500 / $1,000 / $2,500 / Type chips (Type shows a boxed MoneyInput "One-off amount"); "It goes to {name} first." with 2+ debts; disabled with `onceMoreThanOwed` when the amount is above that debt's balance.
- `soonerText`: under 24 months "N months sooner"; else "4 years sooner" / "3 years 2 months sooner"; 0 reads "Same as the minimum".
- Whole dollars throughout; "about" figures via `aboutTens`.

**DebtsSegment (Task 2)**
- Use extra: saved on the debt already carrying an extra, else the first debt in the order shown (`lumpFirstDebtId`); never a second debt. Toast `planSavedToastFrom` with the start date and Undo, light haptic.
- Stop: `useSaveDebtPlan` with extra 0 on the carrying debt; toast `stopToast`. Shown from Minimum only, or Extra each month with the stepper at $0, when an extra is saved. The old `extra <= 0` early return is gone.
- Once: `useRecordDebtOneOff` on the first debt in the order, name `oneOffLineName`, toast `onceToast` with Undo.
- Hero: `display` with `scale="capped"`; second line "With your $50 extra: debt-free by Dec 2028." from `savedExtraPlan`.
- Line card: with no rule set, "Your rule is at most 36% (default)." with the tick (D14).
- Section headers use the muted eyebrow style of Goals and Investing (D8).
- "+ Add a debt" is the last row in the Debts card; the full-width Pill is gone (D12).
- Record row "Extra payments on {largest debt}" / "Payoff date and interest saved" opens `/grow/calculators/debt/{id}` (D9).
- Debt rows (open and paid in full) use `DeletableRow`: swipe and ⋯ with Edit (opens AddDebtSheet in edit mode) and Delete (confirm with the debt remove copy, `useRemoveDebt`, destructive toast with Undo).
- Owner addendum: each open debt row ends with "· ends Sep 2041" (`rowEnds*` variants); cards paid in full show none.

**Read model**
- `DebtLine.endDate`: the saved plan's per-debt clear month when an extra is saved, else the debt's own minimum (`fixedPayoff`), dated with the due day (today's day when none).
- `minimumOnlyFor` / `savedPlanFor`: the order's figure, or with no order the later of the two.

## Verification

- `npx jest src/features/grow/debts src/features/grow/__tests__/copyLint src/i18n`: pass.
- `npx jest src/features/grow`: 33 suites, 1821 tests pass (GrowHome and createFromDecide needed no new mocks: they render the empty model).
- `npm run typecheck`: clean. `npm run depcruise`: no violations (1042 modules). ESLint on changed files: 0 errors (2 pre-existing `require()` warnings in the test's DetailScreen mock).
- `grep -niE "recommend|advice|should|best|better|optimal" PayoffPlanCard.tsx`: nothing. A test also renders the card (one and two debts, Once open) and checks no rendered text or label contains those words.
- `grep -c useRecordDebtOneOff DebtsSegment.tsx` = 2; `grep -c "extra <= 0" DebtsSegment.tsx` = 0.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 3 - Blocking] Task 1 commit carries the card's prop wiring in DebtsSegment**
- The new card props would not compile against the old segment, so the save/stop/once handlers and start dates were wired in Task 1; Task 2 holds the layout (hero, line card, headers, rows, add row, record row) and its tests.

**2. [Rule 2 - Missing] Per-debt end date added to the read model**
- The owner addendum needs a per-debt payoff date "under the saved plan"; the 06-24 model had only plan-wide dates. Added `DebtLine.endDate` in `useDebtsRead.ts` (pure, engine figures) rather than working it out in the segment.

**3. [Rule 2 - Missing] `DebtFormat.monthYearLong`**
- `revealA11y` speaks "September 2037"; the formatter had only "Sep 2037".

**4. Test figures corrected from the plan's examples**
- On the LEDGER auto loan the "less interest" lines are worked from exact values, as the audit requires: $50 extra saves 75,636 - 64,491 = 11,145 → "about $110 less" (not $120 from rounded figures); the $1,000 one-off saves 17,432 → "about $170 less".

**5. Remove wording**
- The plan names the ⋯ items "Edit, Remove". `DeletableRow` always appends its shared "Delete" item and confirm sheet (the D-32 one-remove-style pattern Goals and Investing use); the confirm uses the debt copy "Remove {name}?" and its body.

### en.ts
No keys added: every key needed (including the owner addendum's `rowEnds`, `rowEndsNoRate`, `rowEndsNoDay`, `rowEndsNoDayNoRate`) was already present from 06-26. en.ts is unchanged.

## Known Stubs

None.

## Threat Flags

None. T-06-35-01 (equal columns, no default pick, order gate, forbidden-word test), T-06-35-02 (one debt carries the extra; test), T-06-35-03 (once button disabled above the balance with a note; hook RangeError stays) and T-06-35-04 (figures only from the read model) are mitigated.

## Owner questions

1. With 2+ debts and no order chosen, the hero and the card's top line show the later of the two orders' minimum-only dates. Is that the reading you want, or should both lines wait for an order like the rows do?
2. An extra saved before any order existed (legacy rows with `payoff_order` null and 2+ debts) dates the row end dates with the highest-rate order. Fine as a fallback?
3. The ⋯ menu reads "Edit" and "Delete" (shared row pattern), while the confirm reads "Remove Auto loan?". Keep, or change the shared word for debts?

## Self-Check: PASSED

- Files: PayoffPlanCard.tsx, DebtsSegment.tsx, useDebtsRead.ts, debtScreenData.ts, debtScreens.test.tsx all present.
- Commits: c722c9e2, f4173748, 7c730fd5 found in git log.
