---
phase: 05-decide-ui
plan: 109
subsystem: decide-ui
tags: [copy, cleanup, text-fit, running-costs, D-87, D-89, D-76]
requires: [05-98, 05-99, 05-101, 05-103, 05-104, 05-106, 05-108]
provides:
  - R16 copy retired from en.ts, the next_month member gone from the engine and snapshot unions
  - AmountRow (shared R16.3 running-cost row) and UserCostRow (user-added costs with an empty amount)
  - R16 count-string and fold-preview guards in decideCopyFit.test.ts, R16 files in the text-fit walk
affects: [05-26]
key-files:
  created:
    - src/features/decide/check/steps/step2/AmountRow.tsx
    - src/features/decide/check/steps/step2/UserCostRow.tsx
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/copyStatus.ts
    - src/engine/decide/types.ts
    - src/engine/decide/plan.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/snapshot/checkInputs.ts
    - src/features/decide/check/steps/Step2PriceAndPay.tsx
    - src/features/decide/check/steps/step2/RunningCostPrompts.tsx
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/check/steps/__tests__/runningCostRows.test.tsx
    - src/i18n/__tests__/decideCopyFit.test.ts
    - src/i18n/__tests__/decideCopy.test.ts
    - src/features/decide/__tests__/decideTextFit.test.ts
    - src/features/decide/copy/__tests__/infoTerms.test.ts
decisions:
  - "A stored raw 'next_month' is read as 'next_period' by parseCheckInputs (readFirstPayment); the types no longer have it"
  - "cardBlockedBody drops 'tax' (tax is region-aware); the GB block is carried by the tax_gb card note"
  - "A user-added cost that begins empty stays an Amount row while mounted, so the field keeps focus as the amount is typed; one that begins with an amount stays the plain checkbox row"
metrics:
  tasks: 2 plus 2 additions
  completed: 2026-10-24
---

# Phase 5 Plan 109: Retire R16 copy, drop the alias, guard R16 Summary

R16 is closed: replaced copy and the `next_month` alias are gone, user-added costs with no amount follow R16.3, and the copy-fit and text-fit guards cover R16.

## Commits

| Step | Commit | Notes |
|------|--------|-------|
| Task 1a. Alias removal | d0b214e1 | `'today' \| 'next_period'` in engine and snapshot unions; `parseCheckInputs` still maps a raw `'next_month'`; typed test values moved to `next_period`; the engine "next_month is read as next_period" test dropped (no longer a typed value) |
| Task 1b. Retire copy | dfc91427 | see "Keys retired" |
| Addition 1. Retired 05-101 keys | 07215770 | `running.addAmount` and `running.amountA11y` out of en.ts; `addAmount` out of the decideCopy.test.ts button list |
| Addition 2. User-added costs (R16.3) | 183e1b00 | `AmountRow`, `UserCostRow`, test `D-87 a user-added cost with no amount ...` (4 tests) |
| Task 2. Guards | c0e0237f, b206110d | `R16 count strings use a no-break space and have plural forms`, `R16 the fold previews fit the 44-character cap`, text-fit R16 test; b206110d fixes two regexes where a backspace byte had replaced `\b` |

## Keys retired (each grep-checked: no reader outside en.ts and the guards)

- `sync.queued_one/_other`, `sync.offlineQueued_one/_other` (also out of `copyStatus.ts`; the infoTerms test now asserts they are gone). `sync.pendingRow` ("queued" tag on an Activity row) is still read by ActivityRow and stays.
- `decide.pay.loanInterestSaved` ("Interest saved"; the tile reads `loanInterestSavedByDeposit`)
- `decide.pay.instalmentNote`, `instalmentNoteFees` (flat-rate implied-rate notes)
- `decide.pay.instalmentRateNote_*`, `instalmentRateNoteMonth_*` (R15 notes)
- `decide.pay.summaryInstalmentNoRate`, `summaryInstalmentRate`, `summaryFirstInMonth`, `summaryTimes`
- `decide.pay.instRateBelow`, `decide.pay.instalmentInMonth`
- `you.record.importCsv` (the Add group holds "Import statement")
- `decide.depth.running.addAmount`, `decide.depth.running.amountA11y` (addition 1). `record.sheet.keypad.amountA11y` is a different key and is still read.
- Reworded, not deleted: `decide.pay.cardBlockedBody` is still read by the blocked card box; it now reads "Rent, bills, loan repayments and premiums are not card payments. ..." (no "tax").
- "Type an amount to count it" and "Add amount" (placeholder) were already gone; `decide.pay.instalmentCalcNote` stays (the monthly row of `instalmentCalcNoteBy`). Only en.ts exists as a locale.

## Additions to the plan

1. Retired 05-101 keys (commit 07215770), as asked.
2. R16.3 for user-added costs (commit 183e1b00). User-added costs render in Step2PriceAndPay's plain list. 05-101's PromptRow markup moved into a shared `AmountRow` (reserved 44 checkbox column, "Counted once an amount is typed", dashed field via `amountField`/`inputRef`, row press focuses the field, R16.3 labels, optional remove control); `PromptRow` now uses it with no behaviour change (the existing D-87 tests pass unmodified). `UserCostRow` wraps each plain-list cost: a cost that starts with no amount renders as `AmountRow` with its remove control and stays one while mounted (the field keeps focus; the checkbox appears once an amount exists; clearing the field makes it uncounted, amount 0). A cost with an amount at first render is the old `CheckRow`.

## Deviations from Plan

- **[Rule 3 - Blocking] text-fit allowlist:** `AmountRow.tsx` has three `height:` styles (44 remove target and its dash glyph, no text); added `check/steps/step2/AmountRow.tsx` to the rule F geometry allowlist with a reason. No other allowlist change.
- **[Rule 1 - Bug, own mistake] backspace bytes in decideCopyFit.test.ts:** my first edit wrote two `\b` as backspace characters; the tests still passed. Found while reading, fixed in b206110d. No other file contains one.
- The engine test "D-89 next_month is read as next_period" was removed rather than converted: the engine no longer accepts the value; the parse-level test `D-89 a stored next_month still reads as next_period` carries it.
- Plan file lists `src/engine/decide/plan.ts`, `instalmentCopy.ts`, `methodCardCopy.ts` for dropped `next_month` branches. They had none (they test `=== 'today'`); only comments changed in plan.ts. The tests that passed `next_month` in `instalmentCopy.test.ts`, `methodCardCopy.test.ts`, `computeCheck.test.ts` and `decideGoAhead.test.tsx` now pass `next_period`.

## Verification

- `npm run typecheck`: clean.
- eslint on all touched .ts/.tsx files: 0 errors (16 pre-existing `import/no-named-as-default-member` warnings in fast-check tests).
- `npm run depcruise`: no dependency violations.
- `npx jest src/features/decide src/i18n src/data`: 178 suites, 16071 tests pass.
- Snapshot and `src/engine/decide` coverage run (npx jest on those folders with coverage): 100% in every file, 111 suites pass.
- Named tests: `D-89 a stored next_month still reads as next_period`, `R16 count strings use a no-break space and have plural forms`, `D-87 a user-added cost with no amount ...` all pass.
- Not run: full `npx jest` suite, `npm run test:coverage`, `npm run verify:gates` (outside the verify list given for this run).

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-109: no retired R16 string appears; on the Pixel, add a cost under Costs that follow it with an empty amount (reachable from a draft or after item-type change) and check the dashed field, the empty checkbox column, tap-row-to-focus and the Remove control. Whole Decide pass at the text-fit matrix for the R16 screens.

## Self-Check: PASSED
