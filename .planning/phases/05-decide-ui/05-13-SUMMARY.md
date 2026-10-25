---
phase: 05-decide-ui
plan: 13
subsystem: decide-ui
tags: [decide, ui, quick-check, a11y]
requires: [05-07, 05-08, 05-09, 05-10, 05-12, 05-15, 05-28, 05-31, 05-36]
provides: [useQuickCheck, quickStateOf, QuickCheckForm, QuickResult]
affects: [05-21, 05-23, 05-27]
key-files:
  created:
    - src/features/decide/quick/useQuickCheck.ts
    - src/features/decide/quick/QuickCheckForm.tsx
    - src/features/decide/quick/QuickResult.tsx
    - src/features/decide/quick/__tests__/useQuickCheck.test.ts
    - src/features/decide/quick/__tests__/QuickCheckForm.test.tsx
    - src/features/decide/quick/__tests__/helpers/otherCheck.ts
metrics:
  tasks: 2
  files: 6
completed: 2026-10-16
---

# Phase 5 Plan 13: Quick check form and result Summary

The reusable quick check: a hook that parses, bounds and recomputes live through computeQuick (stacked with every open check by default), plus a Cash | Credit form and a result block that serve both Decide home and the onboarding first read.

## Commits
- 0cf4797 feat(05-13): useQuickCheck hook with live computation and stacked-check combine
- b9983c9 feat(05-13): QuickCheckForm and QuickResult

## What was built
- `useQuickCheck(source, surface)`: state, `submit`/`submitFields`, per-field setters, `tryCredit`, `clear`, `toCheckInputs`, session-only `combine`, `stack` (from `useOtherChecks(null)`). `quick_check_run` fires with the state word only, once per Check it, home surface only. Exports `quickStateOf` (none, cash_only and unconverted map to `missing`).
- `QuickResult`: name, state chip, size, one line, Credit monthly figure with cents and its caption (zero-rate and paid-off variants come from quickResultCopy), Try on credit, footer. Polite live region through `useSettledLabel` and `joinSentences`. The combine pill shows only with `openCount >= 2`; with one open check the footer reads the `quickWith` line when the decision applied it.
- `QuickCheckForm`: amount pill or two first-read fields, Cash | Credit, result above the Credit controls, Annual rate (`isValidAprText`, trailing dot kept as a local draft) and term radio chips, collapsed `+ Tax, fees`, Run the full check (home only, disabled when a rate is missing, hidden for `none`), Add rough figures, Clear the check, loading skeleton and error state.

## Deviations from Plan
- Duration chips are a local radio-role Pressable (checked state, accent tint like `Chip`) rather than the shipped `Chip`, because the plan requires a radiogroup with "12 checked" and `Chip` has the button role. Shared `Chip` untouched.
- The result live-region label is built with `joinSentences([chip, size, line])` instead of the `decide.quick.resultA11y` template, which would read ". ." when the chip or size is empty (same fix as the verdict card). The `resultA11y` key is left in en.ts unused.
- An unparseable or over-bound price edited after submit sets the price to null (result returns to incomplete) instead of keeping a stale answer; an over-bound fee is ignored.
- The collapsed Tax, fees row folds its `+{amount}` summary into the button's accessibility label so a screen reader hears it.
- Test helper `__tests__/helpers/otherCheck.ts` added for the one-open-check test.
- No engine edits, no migrations, no new i18n keys.

## Verification
- `npx jest src/features/decide/quick`: 32 passed (13 hook, 19 form/result)
- `npx jest src/features/decide src/i18n`: 9066 passed
- noRawColours 2 passed; `npm run typecheck` clean; `npm run lint` 0 errors; `npm run depcruise` clean; greps (`9.4`, `'48'` = 0; MAX_INPUT_MINOR, isValidAprText, CREDIT_TERMS, paidOffMonth, openCount >= 2, CombineToggle present)

## Human/device items
- MoneyInput commits on blur: confirm on a device that the first-read Price commits before tapping Check it (same item as 05-14).
- DCU-11 fold budget on the Decide home at 402x874, and the screen-reader read of the live region and the radio chips.

## Known Stubs
None.

## Self-Check: PASSED
