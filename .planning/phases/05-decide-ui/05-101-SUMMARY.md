---
phase: 05-decide-ui
plan: 101
subsystem: ui
tags: [decide, loan, running-costs, D-86, D-87, R16.2, R16.3]
requires: [05-88, 05-93, 05-96, 05-103]
provides:
  - loan outputs tile with "Interest saved by the deposit" (ⓘ interestSaved), "Interest paid", "Cash left after", and the comparison line
  - FigureStrip columns top-aligned
  - running-cost rows with a reserved 44-wide checkbox column and a dashed Amount field; row press focuses the field
affects: [05-109]
key-files:
  modified:
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/ui/FigureStrip.tsx
    - src/features/decide/check/steps/step2/RunningCostPrompts.tsx
    - src/features/decide/ui/MoneyInput.tsx
    - src/features/decide/ui/RateInput.tsx
    - src/features/decide/copy/depthInputsCopy.ts
  created:
    - src/features/decide/check/steps/__tests__/step2Loan.test.tsx
    - src/features/decide/check/steps/__tests__/runningCostRows.test.tsx
decisions:
  - "The saving shows only with deposit > 0, a valid typed rate and saved > 0, so 0% and no deposit hide both the tile item and the line"
  - "The strip becomes one group (label lists the three figures) when the saving shows, so the ⓘ stays reachable"
  - "The row is a non-accessible Pressable; the name block carries the 'not counted yet' group label while empty; the checkbox carries 'counted' / 'Not counted' once an amount exists"
requirements: [DCU-29, DCU-20, DCU-25, DCU-27]
metrics:
  tasks: 2
  completed: 2026-10-24
---
# Phase 5 Plan 101: Interest saved and running-cost rows Summary

The loan card now says what the deposit saves against the same loan with no deposit, and every running-cost row shows where its amount goes.

## Tasks
| Task | Commit | Notes |
|------|--------|-------|
| 1. Interest saved by the deposit | 07a06ff1 | tile items, inline plural line (financedNoDeposit = noDeposit.financed, financed = plan.financed, apr from the typed text via percentText), FigureStrip row `alignItems: 'flex-start'` |
| 2. Running-cost rows | 5bc5fd44 | reserved checkbox column, dashed Amount field (112 wide, grows with text scale to 1.3x, full width under rule S), tap-to-focus, loss of value on the same field with no checkbox |

## Verification
- `npx jest src/features/decide src/i18n`: all pass after the fix below (the rule F guard and the copy guards included); 110 tests in the final targeted run.
- Named tests: D-86 (3, step2Loan.test.tsx) and D-87 (4, runningCostRows.test.tsx).
- `npm run typecheck` clean; eslint 0 errors on touched files.

## Deviations from Plan
**1. [Rule 3 - Blocking] MoneyInput and RateInput extended.** The dashed Amount field and a focusable ref need support inside the shared inputs (new `amountField` and `inputRef` props on MoneyInput, `amountField` on RateInput). Not in the plan's file list. Commit 5bc5fd44.
**2. [Rule 3 - Blocking] depthInputsCopy.ts and its tests.** The loss-of-value placeholder read the retired "Add amount"; it now reads `running.amountPlaceholder`. depthStep2.test.tsx and depthInputsCopy.test.ts updated for the new labels. Commit 5bc5fd44.
**3. [Rule 1 - Bug] Rule F guard.** The first cut used fixed `height` on the checkbox target, box and the pill; the D-76 static guard flagged them. Switched to `minHeight` / `aspectRatio`, so the pill is a 44 minHeight field rather than a fixed 44 height.
**4. Old Step2PriceAndPay assertion** for the caption "Interest saved" now reads "Interest saved by the deposit".

## Notes
- `decide.depth.running.addAmount` and the old `amountA11y` keys stay in en.ts (retired, no longer read); 05-109 can drop them (decideCopy.test.ts still lists addAmount).
- User-added costs "while their amount is empty" (R16.3) are not prompt rows and sit outside this plan's files; not changed.
- Accessible names in the rows use the existing formatter (not the spoken-currency form); D-94 spoken names are carried by the field's accessibilityValue.

## Device items
05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-101: dashed field look on a vehicle check, tap on the row text focuses the field, checkbox appears without the field losing focus, the loan tile at 2.0x text scale.

## Known Stubs
None.

## Self-Check: PASSED
