---
phase: 09-tiers-onboarding
plan: 11
subsystem: levels
tags: [tiers, onboarding, pure-logic, fast-check]
requires: [09-01]
provides: [FEATURES registry, levelFor, applyOnb, onboarding answer types]
affects: [09-12, 09-13]
tech-stack:
  added: []
  patterns: [pure seam like growFeatureFlags.ts, test parses signed doc]
key-files:
  created:
    - src/features/levels/featureRegistry.ts
    - src/features/levels/onboardingAnswers.ts
    - src/features/levels/levelFor.ts
    - src/features/levels/applyOnb.ts
    - src/features/levels/__tests__/featureRegistry.test.ts
    - src/features/levels/__tests__/levelFor.test.ts
    - src/features/levels/__tests__/applyOnb.test.ts
key-decisions:
  - "applyOnb takes an optional third argument { homeCurrency } (default USD) for the multiCurrency rule"
  - "Option keys follow the plan (debt none/card/loan/several, share household, watch closely/normally/lightly/none), not the prototype short keys"
metrics:
  tasks: 1
  files: 7
completed: 2026-11-18
---

# Phase 9 Plan 11: Level registry, levelFor, applyOnb Summary

Pure, property-tested level logic: a 32-row feature registry that a test checks against the signed 09-LEVEL-MAP.md, `levelFor` (answers to level 1..4, skip lands on Everyday) and `applyOnb` (answers to feature overrides for built features only).

## Commits
- 2843372b test(09-11): failing tests (RED)
- 610ed750 feat(09-11): implementation (GREEN)
- A follow-up fix commit corrects one glyph name (`somethingChanged`) found by typecheck.

## Deviations from Plan

**1. [Rule 1 - Bug] Registry test parse** The plan's row regex also matches the section 1 header row ("level | name"). The test skips rows without a numeric minLevel column.

**2. [Rule 1 - Bug] Property as written is false** "Setting inv to some/lots never returns a lower level" fails when the base has inv=lots (lots to some drops 4 to 3). The property now compares against a baseline with no debt, no investments and steady income, which is the intended meaning (owing or investing never lowers the level).

**3. [Rule 3] applyOnb signature** Added optional `{ homeCurrency }` third argument because the multiCurrency rule needs the device home currency and the plan signature had none.

## Verification
- `npx jest src/features/levels`: 3 suites, 28 tests pass (counts 5/19/29/32 match the signed lines).
- eslint: 0 errors (13 `import/no-named-as-default-member` warnings for the `fc` default import in levelFor.test.ts, matching the plan's `fc.assert` wording).
- depcruise: no violations.
- tsc: no errors in src/features/levels. Pre-existing errors exist elsewhere (`react-native-purchases` module missing in this worktree's node_modules), out of scope.

## Known Stubs
None. `holdsData` probe ids are plain labels for plan 09-12/13 to wire to real queries.

## Threat Flags
None.

## Self-Check: PASSED
