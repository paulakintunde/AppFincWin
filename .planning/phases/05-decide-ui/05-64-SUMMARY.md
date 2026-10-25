---
phase: 05-decide-ui
plan: 64
subsystem: ui
tags: [decide, folds, warnings, info, D-74, D-70, D-76]
requires: [05-54, 05-55, 05-58, 05-59, 05-80]
provides:
  - foldCopy.ts (FOLD_ORDER, FOLD_TITLE, FOLD_INFO, investment variants, ten previews, joinPreview)
  - WarningRows, warnCardsOf, and a notices-only WarningList
  - EveryLineRows with an info button per row
  - WhatBreaksBody (fold 1 body)
affects: [05-65, 05-66, 05-74, 05-78]
key-files:
  created:
    - src/features/decide/copy/foldCopy.ts
    - src/features/decide/copy/__tests__/foldCopy.test.ts
    - src/features/decide/check/InfoTitle.tsx
    - src/features/decide/check/sections/WhatBreaksSection.tsx
    - src/features/decide/check/__tests__/whatBreaks.test.tsx
  modified:
    - src/features/decide/check/WarningList.tsx
    - src/features/decide/check/sections/LinesSection.tsx
    - src/features/decide/check/sections/__tests__/tableSections.test.tsx
    - src/features/decide/check/sections/__tests__/depthSections.test.tsx
decisions:
  - "A preview is a CopyRef or a list of them; joinPreview joins with ' · ' and appends the edge suffix as is"
  - "InfoTitle (new) places the button from useInfoSheet().button(), so closing the sheet returns focus to it"
  - "WarningRows draws first-read warnings (month, cash) through the same warn.* copy"
  - "LinesSection stays as a thin wrapper over EveryLineRows until 05-78"
metrics:
  tasks: 2
  completed: 2026-10-23
requirements: [DCU-11, DCU-14, DCU-25, DCU-27]
---

# Phase 5 Plan 64: What breaks fold and fold previews Summary

Fold 1 now has a body: every warning (card reasons included, engine order) as a dot, coloured title, value and description row that stacks the value under rule S, followed by "Every line" with its info buttons, behind Show details when anything breaks. foldCopy.ts holds the titles, info keys and all ten previews for 05-74 to compose.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. foldCopy.ts and tests | 2d322de6 | 4 tests: R2 table, 44-char fit, order, investment fold 7 |
| 2. WarningRows, WarningList notices mode, EveryLineRows, WhatBreaksBody | 4226259b | 7 tests in whatBreaks.test.tsx |

## Verification

- `npx jest src/features/decide/check src/features/decide/copy`: 40 suites, 603 tests pass.
- `npm run typecheck`: clean. eslint on every touched file: clean.
- Full `npm run lint` not run (other executors are editing the worktree).

## Deviations from Plan

**1. [Rule 2 - a11y] InfoTitle instead of InfoLabel** - InfoLabel cannot take the ref owned by `useInfoSheet`, so focus would not return to the button after the sheet closes. A small `InfoTitle` (same rule I layout) places `info.button()` instead. Row groups also expose the 'about' action.

**2. [Rule 3 - Blocking] Local line row** - `TableRow` takes a string label and is shared with other plans' sections, so EveryLineRows uses a local `LineView` with the same layout rather than editing `sectionUi.tsx`.

**3. 44-character preview cap** - the R2 wording "Needs adjustment with the expected {amount} a month" is 49 characters at $1,234 (and "Does not fit..." 45). The test holds every other preview to 44 and this one to 50; FoldRow previews wrap (05-59).

**4. Test edits to shared section tests** - tableSections gains the five-ⓘ assertion on the six lines; depthSections renders `EveryLineRows` in place of `LinesSection`. The LinesSection wrapper kept every other assertion passing unchanged.

Otherwise as written. No migrations, no Supabase calls.

## Known Stubs

None. `LinesSection` is a deliberate wrapper until 05-78.

## Notes for 05-74

- Fold previews take plain data (formatted strings, counts); 05-74 formats them and calls `joinPreview(t, preview)`.
- `warnCardsOf(verdict, firstRead, fmt, fmtDate).length` is the What breaks count for `whatBreaksPreview`.
- Out-of-range investment projection reads `decide.alt.reasonTooLarge`.
- Pre-existing, not mine: Step3Verdict and verdictDepth tests flickered while another executor edited VerdictCard; they passed on rerun.

## Device items

05-EXECUTION-NOTES entry 05-64: a warning row's value drops under its title at 320 wide and at 2.0x; the info button on a debt, owe or investing row is reachable and TalkBack offers 'about'; Every line stays behind Show details when something breaks.

## Self-Check: PASSED
