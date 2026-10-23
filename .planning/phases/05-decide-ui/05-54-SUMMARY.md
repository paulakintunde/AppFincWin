---
phase: 05-decide-ui
plan: 54
subsystem: copy
tags: [copy, i18n, decide, info-terms, plurals, undo-labels, D-70..D-78]
requires: [05-25]
provides:
  - decide.info (31 explanations) and infoCopy/INFO_KEYS
  - fold, verdict.key, details, infoButton, slider, custom, clear, delete, save, home and quick catalogue keys
  - six R3 plural keys as _one/_other with U+00A0
  - undo labels checkCleared, checkDeleted, decisionDeleted, changeDeleted
affects: [05-55, 05-77, 05-80]
key-files:
  created:
    - src/features/decide/copy/infoTerms.ts
    - src/features/decide/copy/__tests__/infoTerms.test.ts
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/__tests__/decideCopy.test.ts
    - src/engine/undo/types.ts
    - src/features/decide/copy/__tests__/helpers/enKeys.ts
    - src/features/decide/quick/__tests__/QuickCheckForm.test.tsx
    - src/features/decide/check/steps/__tests__/Step2PriceAndPay.test.tsx
    - src/features/decide/check/sections/__tests__/tableSections.test.tsx
decisions:
  - "infoCopy returns the cushion reason as a separate CopyRef (`reason`) for the screen to resolve with refText, because keyParams are translated without params and the reason carries its own"
  - "Old retired keys (quick.clear, pastNone, checkAbandoned and friends) stay; 05-77 removes them"
requirements: [DCU-25, DCU-09, DCU-26, DCU-28]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 54: Decide refresh copy Summary

The full copy catalogue for the Decide UX refresh exists before any component plan runs: 31 typed INFO_TERMS explanations, the fold, key-figure, custom-value, clear, delete and save-status strings, the six R3 plural keys, and four new undo labels, all passing the DCU-09 guard.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. INFO_TERMS and infoTerms.ts | 506ef926 | `INFO_KEYS` (31, R3 order), `infoCopy` with the cushion line and the provisional-rate fallback; en.ts additions for the whole refresh sit in the same commit because the file is shared |
| 2. Other strings, plurals, undo vocabulary, guard entries | 78fb7cfe | `UNDO_LABEL_KEYS` +4, `ACTION_LABELS` +2, three reworded-string tests updated |

A previous executor died after writing most of the en.ts additions and the `undo/types.ts` change; both were inspected, kept, and completed (plurals, `verdict.key`, home, quick, ledgerA11y, tests).

## Verification

- `npx jest src/features/decide src/i18n src/engine/undo --silent`: 13369 of 13370 pass. The one failure is `textFit.test.tsx` "D-76 Seg" (SegmentedToggle at fontScale 2), uncommitted work of a parallel 05-5x executor in the same worktree, not touched by this plan.
- `npx jest src/engine/undo src/i18n/__tests__/recordPolishCopy.test.ts`: 115 passed.
- typecheck (`tsc --noEmit`) clean; `npm run lint` 0 errors (721 pre-existing warnings).
- Engine change is a const list only; engine coverage unaffected.

## Deviations from Plan

**1. [Rule 1 - DCU-09] "is offered" and "invest now" reworded**
- `size.changes` and `coolingOff.body` use "available" instead of "offered" (as the plan directs; the UI-SPEC text differs only there). In this implementation they read "Cooling-off appears only for purchases that need spreading" and "It appears for purchases that need spreading", which carry no banned word.
- `investingFloor.body` "what you invest now" tripped the investing-phrase guard; it now reads "the amount invested at present".

**2. [Rule 3 - Blocking] `pay.monthsShort` does not exist**
- The string "{{count}} mo" is rendered by `decide.pay.cardMonthsValue`; that key was converted to `_one/_other` instead (Step2PriceAndPay test updated to `12 mo`).

**3. [Rule 3 - Blocking] `resolvesInEn` test helper**
- `copy/__tests__/helpers/enKeys.ts` now accepts a plural base (`key_one` and `key_other`), as its docstring already claimed; `quickCopy.test.ts` resolves the converted caption keys through it.

**4. Other tests**
- `loanTermNote` reads "At 600 months the payment is …" (R15.9); QuickCheckForm and tableSections follow the new wording.
- `infoCopy` signature adds an optional `reason` on the result (see decisions).

**5. Process incident**
- A `git stash` taken during triage briefly removed a parallel executor's uncommitted `FigureStrip.tsx`, `SegmentedToggle.tsx` and `textFit.test.tsx` edits. They were restored byte for byte from the stash (textFit with the other executor's newer mock change re-applied) and the stash dropped. Those files are not in this plan's commits.

## Known Stubs

None.

## Device items

05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-54: no UI yet; copy is exercised once the component plans land.

## Self-Check: PASSED
