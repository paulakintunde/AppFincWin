---
phase: 05-decide-ui
plan: 08
subsystem: decide-helpers
tags: [decide, quick-parse, offsets, entitlements, date-field, tdd]
requires: [05-01]
provides:
  - parseQuick (src/features/decide/quickParse.ts)
  - OFFSETS / offsetDate / awayFrom / isPastDate (src/features/decide/offsets.ts)
  - canUse / PRO_CANDIDATES (src/features/decide/entitlements.ts)
  - compareEstimate / scheduleMatch (src/features/decide/journal/estimateActual.ts)
  - DateField minDate guard (src/features/record/entry/pickers/DateField.tsx)
affects: [05-09, 05-12, 05-15]
key-files:
  created:
    - src/features/decide/quickParse.ts
    - src/features/decide/offsets.ts
    - src/features/decide/entitlements.ts
    - src/features/decide/journal/estimateActual.ts
    - src/features/decide/__tests__/quickParse.test.ts
    - src/features/decide/__tests__/offsets.test.ts
    - src/features/decide/__tests__/entitlements.test.ts
    - src/features/decide/journal/__tests__/estimateActual.test.ts
    - src/features/record/entry/pickers/__tests__/DateField.test.tsx
  modified:
    - src/features/record/entry/pickers/DateField.tsx
    - src/features/record/entry/__tests__/recurringControls.test.tsx
key-decisions:
  - "occurrenceDate n is 0-based (n = 0 is the anchor), so n = 1 is one period after; OFFSETS use n 1, 1, 3 as specified"
  - "Not-yet-reached checkpoints carry zero actuals and diffs with tone 'at'; callers must read `reached` first"
  - "`skipped` counts paid lines with a null home amount inside the 90-day window, once per input"
requirements-completed: []
duration: ~25 min
completed: 2026-10-16
---

# Phase 5 Plan 08: Decide helpers and DateField guard Summary

Four small pure helpers (quick parse, calendar offsets, estimate-vs-actual, canUse) with tests, plus a DateField guard that refuses a picked day earlier than minDate.

## Verification

- decide + journal jest: 213 passed; offsets, quickParse, entitlements and journal at 100% statements/branches
- Record tests through DateField (pickers, recurringControls, TransactionSheet.addAccount, ShellEntryHost): 46 passed
- `npm run typecheck` clean; `npm run lint` 0 errors (pre-existing warnings only)
- Grep gates: no parseFloat or toISOString in the new code

## Deviations from Plan

**1. [Rule 1 - Behaviour change] Existing recurringControls test updated**
- **Found during:** Task 3
- **Issue:** "refuses an end date before the entry date" relied on the picker accepting an earlier day and the form validation then showing a reason. With the new guard (RepeatsField passes minDate = entry date) the earlier day is refused at the picker, so the validation message never appears.
- **Fix:** Test renamed and rewritten to assert the earlier day is never applied to any write. The form-level validation remains as a defence in depth.
- **Files modified:** src/features/record/entry/__tests__/recurringControls.test.tsx
- **Commit:** 3c8762d

No engine edits. No migrations.

## Commits

- 1583ce1 feat(05-08): parseQuick, calendar offsets, canUse entitlement hook
- 74b88b9 feat(05-08): estimate-vs-actual comparison for the decision journal
- 3c8762d feat(05-08): DateField refuses days before minDate (DCU-08)

## Human verification

None required for this plan. Requirement IDs (DCU-01, DCU-07, DCU-08) span later plans and are left pending.

## Self-Check: PASSED
