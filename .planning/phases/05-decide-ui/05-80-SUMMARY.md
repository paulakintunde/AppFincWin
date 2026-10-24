---
phase: 05-decide-ui
plan: 80
subsystem: copy
tags: [copy, i18n, decide, info-terms, plurals, D-79..D-84]
requires: [05-54, 05-81]
provides:
  - INFO_KEYS at 55 (24 R15.8 entries)
  - R15.9 strings under decide.pay, decide.customType, decide.fold
  - R15 plural keys as _one/_other with U+00A0
  - decide.verdict.missing.instalment_rate_missing
affects: [05-84, 05-85, 05-86, 05-87, 05-64, 05-67, 05-74]
key-files:
  modified:
    - src/i18n/locales/en.ts
    - src/features/decide/copy/infoTerms.ts
    - src/features/decide/copy/codeMaps.ts
    - src/features/decide/copy/__tests__/infoTerms.test.ts
    - src/features/decide/copy/__tests__/codeMaps.test.ts
decisions:
  - "Key names: decide.pay.price.*, decide.pay.howYouPay.*, decide.pay.card.* (+ .field.*), decide.pay.summary*, decide.pay.instalment*, decide.customType.*, decide.fold.noReturn.*, decide.fold.title.grow, decide.pay.assumptionReturn*"
  - "The old decide.pay.head/sub and decide.price.* keys stay; the UI plans switch over and 05-77 retires them"
requirements: [DCU-25, DCU-29, DCU-09]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 80: R15 copy Summary

The 24 R15.8 explanations, every R15.9 string and the R15 plural keys now exist, all passing the DCU-09 guard, and `instalment_rate_missing` has its own 64-character title.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. 24 R15.8 entries | 632fed0f | INFO_KEYS 55; copied verbatim, apr body keeps "Before any interest" |
| 2. R15.9 strings, plurals, missing title | 3361af41 | MISSING_TITLE repointed; new case "D-80 instalment_rate_missing has its own missing title" |

## Key names

Plural bases (all `_one`/`_other`): `decide.pay.summaryLoan`, `summaryCardMonths`, `summaryContribution`, `instalmentRateNote`, `instalmentRateNoteMonth`, `projection`, `horizonYears`; `decide.verdict.projection`; `decide.fold.investPreview`.

## Deviations from Plan

None in wording: no string needed rewording to pass the DCU-09 guard. Text is verbatim from R15.8/R15.9. `decide.pay.noteCash` ("Leaves {{cash}} in cash...") and `noteInvestMonthly` already existed, so no duplicate was added. ACTION_LABELS unchanged.

## Verification

- `npx jest src/features/decide src/i18n`: 14443 pass; 2 fail in `hints/__tests__/decideHints.test.tsx`, uncommitted work of a parallel executor (untracked `src/features/decide/hints/`), not this plan.
- `npm run typecheck`: only `decideHints.test.tsx` errors (same parallel work). `npx eslint src/i18n src/features/decide/copy`: 0 errors.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-80: no UI yet; strings are exercised by 05-84..05-87.

## Known Stubs

None.

## Self-Check: PASSED
