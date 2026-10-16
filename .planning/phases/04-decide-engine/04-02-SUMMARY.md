---
phase: 04-decide-engine
plan: 02
subsystem: engine/decide
tags: [decide, card-rule, secured, household-share, tdd]
requires: [engine/split/allocate, engine/guards/assertNever, engine/money/types]
provides: [ItemType, cardEligibility, suggestItemType, isSecured, suggestSecured, resolveShare, myPart, memberParts, SOLE_SHARE]
affects: [04-05, 04-06, 04-13, Phase 5 household Who pays what]
tech-stack:
  added: []
  patterns: [explicit field read with regex pre-fill helpers, zero-sum as typed result, single split implementation via allocate]
key-files:
  created:
    - src/engine/decide/cardRule.ts
    - src/engine/decide/secured.ts
    - src/engine/decide/share.ts
    - src/engine/decide/__tests__/cardRule.test.ts
    - src/engine/decide/__tests__/secured.test.ts
    - src/engine/decide/__tests__/share.test.ts
key-decisions:
  - "Zero-weight members are excluded before allocate() and receive 0 in memberParts"
  - "Alabama paradox for 3+ unequal weights documented in share.ts for the 04-09 bisection contract"
requirements-completed: [DEC-08, DEC-10, DEC-11]
duration: ~10 min
completed: 2026-10-16
---

# Phase 4 Plan 02: Card rule, secured, share Summary

Card eligibility and secured-debt classification now read explicit fields (item type, `secured` flag), with the prototype regexes kept only as pre-fill helpers. Household share resolves four split rules (mine, even, weight, amount) into weights, returns typed `split_weights_zero` / `split_amounts_zero` results for zero sums, and delegates all arithmetic to `allocate()` through `memberParts`.

## Commits
- c7fc863 test: card eligibility and secured tests
- 9d1c1b9 feat: card eligibility by item type, secured by field
- 833d18c test: share rules
- 8613a2a feat: household share under four split rules

## Results
- `npx jest src/engine/decide`: 65 tests pass; decide 100% statements/branches/functions/lines.
- `npx tsc --noEmit`: only the known expo-blur error in TabBar.tsx.
- eslint: 0 errors (9 `import/no-named-as-default-member` warnings for the `fc` default import, same style as the allocate tests).
- `npm run depcruise` and `npm run check:ignores`: clean.

## Deviations from Plan
None - plan executed exactly as written.

## Known Stubs
None.

## Self-Check: PASSED
