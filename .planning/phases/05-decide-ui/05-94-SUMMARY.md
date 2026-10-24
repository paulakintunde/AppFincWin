---
phase: 05-decide-ui
plan: 94
subsystem: engine
tags: [engine, decide, card-limit, D-91, E5]
requires: [05-93]
provides:
  - CardPayment.cardMaxPurchase (absent = no limit, null = no USD rate)
  - CARD_MAX_PURCHASE_USD = 10_000_000 (USD minor units)
  - CardPlanDetail.capBy 'dealer' | 'check_limit' | null
  - PlanReason card_limit_rate_missing with MISSING_TITLE entry and "Needs: USD rate"
affects: [05-95]
key-files:
  modified:
    - src/engine/decide/types.ts
    - src/engine/decide/plan.ts
    - src/engine/decide/constants.ts
    - src/features/decide/copy/codeMaps.ts
    - src/features/decide/copy/methodCardCopy.ts
    - src/features/decide/copy/__tests__/codeMaps.test.ts
    - src/features/decide/copy/__tests__/methodCardCopy.test.ts
  created:
    - src/engine/decide/__tests__/deviations/d91-card-limit.test.ts
requirements: [DCU-32]
metrics:
  tasks: 2
  completed: 2026-10-23
---

# Phase 5 Plan 94: Engine E5b, card check limit Summary

The card portion is now min(price, dealer cap when capped, cardMaxPurchase); the rest is cash on the day. `capBy` reports which cap bound (a tie reports the dealer cap; no binding cap is null). A card payment with `cardMaxPurchase: null` is missing with `card_limit_rate_missing`, shown as "Needs: USD rate"; an absent limit changes nothing. The engine does no currency conversion (the snapshot does in 05-95).

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1. Card check limit in planCard, with MISSING_TITLE and needsFields bridges | 6d720012 | engine, constant, d91 tests |
| 2. Copy tests for the new reason | 4faabcb5 | codeMaps and methodCardCopy tests |

## Verification

- `npx jest src/engine`: 176 suites pass. Coverage command: engine/decide and engine/payoff at 100% on all four measures (threshold passed). Golden suites (decide, payoff) pass.
- `npx jest src/features/decide/copy`: 13 suites, 184 tests pass.
- `npm run depcruise` clean. eslint: 0 errors on touched files (warnings are pre-existing fast-check ones).
- `npm run typecheck`: clean on the final run. An intermediate run showed an error in `src/features/decide/check/step3Folds.tsx` from another executor; it had cleared by the final run.
- Named tests: "D-91 the check limit caps the card portion and the rest is cash on the day", "D-91 the lower cap wins", "D-91 no converted limit is card_limit_rate_missing", "D-91 an absent limit changes nothing", plus a negative-limit rejection; "D-91 card_limit_rate_missing has its missing title", "D-91 Needs reads USD rate".

## Deviations from Plan

- **NeedsField gains 'usdRate'** (the plan said the 'USD rate' entry; the en key `decide.pay.card.field.usdRate` already existed from 05-88). The existing needs-field catalogue test list was extended.
- **assertMoney on cardMaxPurchase** (Rule 2): a negative or non-integer limit throws, like dealerCap.
- ROADMAP checkbox ticked by a direct one-line edit rather than the gsd-sdk command; only the 05-94 line changed. STATE.md and REQUIREMENTS.md untouched, per instruction. The summary commit includes ROADMAP.md.

## Known Stubs

None. No caller passes `cardMaxPurchase` yet, so it is inert in the app until 05-95 wires the snapshot (converted limit, null when no USD rate).

Device item: 05-EXECUTION-NOTES "05-26 device checklist additions (Decide UX refresh)", entry 05-94.

## Self-Check: PASSED
