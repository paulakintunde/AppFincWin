---
phase: 05-decide-ui
plan: 93
subsystem: engine
tags: [engine, decide, card-rules, item-types, D-92, E5]
requires: [05-88, 05-91]
provides:
  - cardEligibility(itemType, region) returns { eligibility, note }
  - ITEM_TYPES gains property, cash_equivalent, tuition
  - phrase-only suggestItemType with the M5 negatives
  - running-cost prompts for property and tuition
affects: [05-94]
key-files:
  modified:
    - src/engine/decide/cardRule.ts
    - src/engine/decide/runningCostPrompts.ts
    - src/engine/decide/types.ts
    - src/engine/decide/plan.ts
    - src/features/decide/check/steps/step2/MethodPanels.tsx
    - src/features/decide/copy/codeMaps.ts
    - src/features/decide/copy/depthInputsCopy.ts
    - src/features/decide/check/commitMutations.ts
  created:
    - src/engine/decide/__tests__/deviations/d92-card-rules.test.ts
decisions:
  - "New RunningCostCategory names: property_tax, home_insurance, utilities, service_charge, books_materials, travel, accommodation"
  - "RUNNING_COST_BUILTIN: property_tax -> Tax, home_insurance -> Insurance, utilities -> Utilities, service_charge and accommodation -> Housing, travel -> Transport; books_materials stays unmapped (no Education built-in)"
  - "'down payment' is the one weak property phrase: a vehicle signal wins over it; every other property phrase wins outright"
requirements: [DCU-32, DCU-20, DCU-02]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 93: Engine E5a, card rules by item type and region Summary

Property and cash-like items are never counted on a card, tuition is permitted with a fee note, and tax is blocked only in GB (permitted with a processing-fee note everywhere else, including no region). `suggestItemType` matches whole words and normalised phrases in the R16.8 order, and the property and tuition item types list their running costs.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. cardRule, suggestions, running-cost prompts, typecheck bridges | bdfb2e07 | engine plus planCard, MethodPanels, label maps |
| 2. Running-cost category mapping | 5d78dd7b | RUNNING_COST_BUILTIN and its test |

## Verification

- `npx jest src/engine` with the coverage command: 175 suites pass; engine/decide and engine/payoff at 100% on all four measures (cardRule.ts and runningCostPrompts.ts 100%).
- Golden suites (decide and payoff) pass. `npm run typecheck` and `npm run depcruise` clean; eslint clean on touched files.
- Named tests "D-92" in d92-card-rules.test.ts (card rules, tax by region, tuition note, phrase suggestions with the M5 negative table, new running costs, the card plan reading the region) and codeMaps.test.ts and runningCostCategoryIds.test.ts.

## Deviations from Plan

**1. [Rule 3 - Blocker] Label for the new running costs.** The 05-88 copy keys are camelCase (`decide.depth.running.propertyTax`), while categories are snake_case, so `runningPromptCopy` could no longer build the key by interpolation. Added `RUNNING_COST_LABEL` (exhaustive over RunningCostCategory) in codeMaps.ts and used it in depthInputsCopy.ts. Commit bdfb2e07.

**2. [Rule 1 - Bug] Existing tests that encoded the old rules.** plan.test.ts "blocks tax" now lists property and cash_equivalent instead of tax; Step2PriceAndPay "Not accepted" uses loan_repayment (tax is permitted without GB); engineBarrel ITEM_TYPES list and the runningCostCategoryIds "no longer has" case (home_insurance shares Insurance) updated. Commit bdfb2e07 and 5d78dd7b.

**3. MethodPanels passes a null region.** The DecideSource has no country field yet, so the card panel reads `cardEligibility(inputs.itemType, null)`; tax therefore shows as permitted in the UI until the snapshot plan wires the RD-02 country. The engine plan already reads `p.region`.

## Known Stubs

- MethodPanels region is `null` until the snapshot builder passes the RD-02 country (see deviation 3). The fee notes (`decide.pay.cardNote.*`) are not yet rendered; that is UI work for a later plan.

## Out of scope, not fixed

- `step2Instalment.test.tsx` (D-80) and `Step2PriceAndPay.test.tsx` instalment tests failed in a full run because another executor is editing instalmentCopy and the instalment panel in the same worktree (uncommitted changes in those files). Unrelated to this plan.

Device item: 05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-93 (chips Property, Tuition, Cash-like; card box states; per-type running-cost rows).

## Self-Check: PASSED
