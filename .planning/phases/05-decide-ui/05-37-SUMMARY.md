---
phase: 05-decide-ui
plan: 37
subsystem: decide-copy
tags: [copy, dcu-09, depth, pure]
requires: [05-09, 05-31, 05-33]
provides: [depthVerdictCopy (11 functions + edgeOn, edgeChipA11y), depthInputsCopy (11 functions)]
affects: [05-41..05-49 depth screens]
tech-stack: {added: [], patterns: [CopyRef key plus params, integer and bigint maths only]}
key-files:
  created:
    - src/features/decide/copy/depthVerdictCopy.ts
    - src/features/decide/copy/depthInputsCopy.ts
    - src/features/decide/copy/__tests__/depthVerdictCopy.test.ts
    - src/features/decide/copy/__tests__/depthInputsCopy.test.ts
  modified: [src/i18n/locales/en.ts]
decisions: []
metrics: {tasks: 2, files: 5}
completed: 2026-10-16
requirements: [DCU-02, DCU-09, DCU-11, DCU-13, DCU-14, DCU-15, DCU-17, DCU-18, DCU-19, DCU-20, DCU-21, DCU-23]
---

# Phase 5 Plan 37: Depth copy maps Summary

Two pure copy modules turn engine codes and numbers into `decide.depth.*` catalogue keys plus formatted params: verdict-side (combined line, worst month, basis row, cushion, margins and edge chip, confidence, cash path, conversion) and input-side (promo, stress, late fees, investing views with holding fee and too-large figures, expected income, runway, running costs, loss of value, estimate gap, goal, dated changes).

## Commits
- 0d36151 feat(05-37): depth verdict copy maps
- ffacb54 feat(05-37): depth inputs copy maps

## Deviations from Plan
1. [Rule 3 - missing key] Added `decide.depth.edge.chipA11yFact` ('{{state}}, on the edge: {{fact}}') to en.ts. The plan needs the edge chip label to carry the D-59 fact in place of 'holds by {x}', and no existing key could. `edgeChipA11y` returns `{ label, fact }`; the screen translates `fact` and passes the text as the label's `fact` param.
2. Return shapes the plan left open (screens in 05-41..49 consume these): `stressCopy` returns `{ line, stateKey }[]`; `runwayCopy.perSetback` is `{ code, line }[]`; `changeRowCopy` returns `{ name: string | CopyRef, from, until }`; `investViewCopy` returns `{ price, payments, pause, netWorth }` sections whose rows are `{ label, figure, caption }`; `promoCopy` returns `{ summary, results, showDeferredToggle, notice }`. `investViewCopy` takes an optional third `rateLabel` (default percentText).
3. `invest.paymentsLine` uses one `months` param for both the payment run and the horizon; the copy passes `horizonMonths` and the amount as first payment plus monthly running costs. If a payment run is shorter than the horizon the line is slightly loose; a catalogue split would fix it (UI-SPEC review item).
4. Estimate-gap and income-line words (higher/lower, likelihood, state) go through `keyParams`, the house pattern, rather than literal params.

No engine edits, no migrations.

## Verification
`npx jest src/features/decide/copy` (115 tests) and `src/i18n` (8389) green; typecheck clean; `npm run lint` 0 errors; depcruise clean. Branch coverage on the two new files 95 to 97 percent (defensive fallbacks only).

## Human verification
None.

## Known Stubs
None.

## Self-Check: PASSED
