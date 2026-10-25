---
phase: 05-decide-ui
plan: 01
subsystem: decide-ui
tags: [contracts, gate, depcruise, analytics, coverage]
requires: [phase-04-decide-engine]
provides: [engine-barrel-gate, decide-ui-contracts, anl-06-events, decide-tooling-guards]
affects: [05-02..05-50]
tech-stack:
  added: []
  patterns: [interface-first contracts, exact barrel surface pinning]
key-files:
  created:
    - src/features/decide/__tests__/engineBarrel.test.ts
    - src/features/decide/snapshot/types.ts
    - src/features/decide/check/stepTypes.ts
  modified:
    - jest.config.js
    - .dependency-cruiser.cjs
    - src/services/analytics/catalogue.ts
    - src/services/analytics/__tests__/catalogue.typecheck.ts
key-decisions:
  - "Contracts written verbatim from the plan; persisted shapes carry no Percent/bigint"
requirements-completed: [ANL-06, DCU-01, DCU-02, DCU-17, DCU-18, DCU-20]
duration: ~25m
completed: 2026-10-16
---

# Phase 5 Plan 01: Barrel gate, contracts and tooling guards Summary

Phase 5 now builds against a jest-pinned Phase 4 barrel (124 decide and 24 payoff runtime exports), one set of shared contract types, dependency-cruiser and coverage guards, and seven enum-only ANL-06 events.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 Phase 4 barrel gate | fab7c15 | Shell gate passed (22 Phase 4 SUMMARYs, 04-VERIFICATION `status: passed`). Test: 51 passed. Exact surface and type-level proofs compile. |
| 2 Shared contracts | 7f38701 | `snapshot/types.ts` and `check/stepTypes.ts`; typecheck and eslint clean. |
| 3 Tooling and ANL-06 | 5a6a026 | 100% coverage for `features/decide/snapshot` and `/journal` (when present); FX door barred from `features/decide`; `decide-engine-barrel-only` rule; seven events and typecheck fixtures. |

## Verification

- `npx jest src/features/decide src/services/analytics --silent`: 59 passed
- `npm run typecheck`: 0 errors
- `npm run depcruise`: no violations (524 modules)
- `npm run lint`: 0 errors (682 pre-existing warnings)

## Deviations from Plan

None - plan executed as written. The barrel surface matched the pinned lists exactly.

## Notes

- Docker not running: no local pgTAP; CI's `rls` job covers it (not relevant to this plan).
- No device or human-verification items.

## Self-Check: PASSED
