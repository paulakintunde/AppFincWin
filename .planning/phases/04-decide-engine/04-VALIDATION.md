---
phase: 4
slug: decide-engine
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-26
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 (jest-expo preset), fast-check 4.10.x with @fast-check/jest |
| **Config file** | `jest.config.js`. Its 100% per-folder thresholds switch on for `src/engine/decide/` and `src/engine/payoff/` once source exists (Phase 0 D-21) |
| **Quick run command** | `npx jest src/engine/decide src/engine/payoff` |
| **Full suite command** | `npm run test:coverage` plus `npm run depcruise` and `npm run check:ignores` |
| **Golden reproducibility** | `node scripts/decide-golden/generate-golden.mjs --check` |
| **Estimated runtime** | Under 15 seconds for the quick run; about 60 seconds for the full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/engine/decide src/engine/payoff`
- **After every plan wave:** Run `npm run test:coverage`, `npm run depcruise` and `npm run check:ignores`
- **Before `/gsd-verify-work`:** The full suite must be green at 100% branch coverage on `engine/decide` and `engine/payoff`, and the golden `--check` must pass
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are `{plan}-T{n}`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | DEC-01, DEC-02 (contracts) | T-04-01-03 | Overflow → RangeError | unit | `npx jest src/engine/payoff/__tests__/types.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | DEC-01, DEC-02 | T-04-01-01, T-04-01-02 | Exact rationals, bounded n | unit + known tables + property | `npx jest src/engine/payoff` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-02-T1 | 04-02 | 1 | DEC-10, DEC-11 | T-04-02-01 | Explicit fields, regex off the verdict path | unit matrix | `npx jest src/engine/decide/__tests__/cardRule.test.ts src/engine/decide/__tests__/secured.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-02-T2 | 04-02 | 1 | DEC-08 | T-04-02-02, T-04-02-03 | Zero-sum weights guarded | unit + property | `npx jest src/engine/decide/__tests__/share.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-03-T1 | 04-03 | 1 | DEC-01..04, 06..09 (D-22 reference) | T-04-03-01 | Reference evaluated from prototype text | generator | `node scripts/decide-golden/generate-golden.mjs --check` | ❌ W0 | ⬜ pending |
| 04-03-T2 | 04-03 | 1 | same | T-04-03-01 | Scenario matrix coverage asserted | generator + node check | `node scripts/decide-golden/generate-golden.mjs --check` | ❌ W0 | ⬜ pending |
| 04-04-T1 | 04-04 | 2 | DEC-03 (SC-2) | T-04-04-01, T-04-04-02 | Explicit never-clears; 600 cap | unit + property | `npx jest src/engine/payoff/__tests__/simulateMinimum.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-04-T2 | 04-04 | 2 | DEC-01..03 (D-22) | T-04-04-03 | Named deviations D-17, D-20 | golden + deviation | `npx jest src/engine/payoff` | ❌ W0 | ⬜ pending |
| 04-05-T1 | 04-05 | 2 | DEC-12 | T-04-05-03 | No default APR; unsourced = null | unit | `npx jest src/engine/decide/__tests__/constants.test.ts src/engine/decide/__tests__/marketDefaults.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-05-T2 | 04-05 | 2 | DEC-07 | T-04-05-01, T-04-05-02, T-04-05-04 | Exact CV; full months only | unit boundaries | `npx jest src/engine/decide/__tests__/money.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-06-T1 | 04-06 | 3 | DEC-04, DEC-05, DEC-10 | T-04-06-01..03 | Missing terms → reason codes | unit matrix | `npx jest src/engine/decide/__tests__/plan.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-06-T2 | 04-06 | 3 | DEC-04, DEC-05 | T-04-06-01 | Named deviations D-07, D-18, instalment | deviation | `npx jest src/engine/decide/__tests__/deviations` | ❌ W0 | ⬜ pending |
| 04-07-T1 | 04-07 | 4 | DEC-06 (limits) | T-04-07-02, T-04-07-03 | Defaults from user figures | unit | `npx jest src/engine/decide/__tests__/assess.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-07-T2 | 04-07 | 4 | DEC-06 | T-04-07-01 | Ordered warnings; exact boundaries | unit + property | `npx jest src/engine/decide/__tests__/assess.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-08-T1 | 04-08 | 4 | DEC-16 | T-04-08-01, T-04-08-02 | Basis marker; cash-level only | unit | `npx jest src/engine/decide/__tests__/firstRead.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-09-T1 | 04-09 | 5 | DEC-09 | T-04-09-01, T-04-09-02 | Exact boundary; monotone across cap; 3+ unequal-weight household error bounded vs linear scan | unit + property + deviation | `npx jest src/engine/decide/__tests__/bisect.test.ts src/engine/decide/__tests__/deviations/d20-exact-bisection.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-09-T2 | 04-09 | 5 | DEC-13 | T-04-09-03 | 0% default return; no currency thresholds | unit + deviation | `npx jest src/engine/decide/__tests__/options.test.ts src/engine/decide/__tests__/deviations/d05-option-thresholds.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-10-T1 | 04-10 | 5 | DEC-14 | T-04-10-01, T-04-10-02 | Non-spare rows suppressed | unit + deviation | `npx jest src/engine/decide/__tests__/alternatives.test.ts src/engine/decide/__tests__/deviations/d06-projection-return.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-10-T2 | 04-10 | 5 | DEC-15 | T-04-10-03 | Bounded setback params | unit | `npx jest src/engine/decide/__tests__/setbacks.test.ts` | ❌ W0 (TDD RED in task) | ⬜ pending |
| 04-11-T1 | 04-11 | 5 | DEC-04, 06..09 (D-22) | T-04-11-01 | Parity within 1 minor unit | golden | `npx jest src/engine/decide/__tests__/golden.test.ts` | ❌ W0 | ⬜ pending |
| 04-11-T2 | 04-11 | 5 | DEC-06, DEC-07 | T-04-11-02 | Named deviations D-02, D-08, D-12 | deviation | `npx jest src/engine/decide/__tests__/deviations` | ❌ W0 | ⬜ pending |
| 04-12-T1 | 04-12 | 6 | DEC-12 | T-04-12-01 | No I/O reachable; verdict path isolated | static + unit | `npx jest src/engine/decide/__tests__/public-api.test.ts && npm run depcruise` | ❌ W0 | ⬜ pending |
| 04-12-T2 | 04-12 | 6 | DEC-12 (D-21) | T-04-12-02, T-04-12-03 | Codes-only outputs; 100% coverage | unit + gate | `npm run test:coverage && npm run depcruise && npm run check:ignores && npm run lint && npm run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every test file below is created by the RED step of the TDD task that owns it (the test is written and committed failing before the implementation), so no separate Wave 0 plan is needed.

- [ ] `src/engine/payoff/__tests__/{types,amortise,futureValue}.test.ts` (04-01), `simulateMinimum.test.ts`, `golden.test.ts`, `deviations/*.test.ts` (04-04): DEC-01 to DEC-03.
- [ ] `src/engine/decide/__tests__/{cardRule,secured,share}.test.ts` (04-02), `{constants,marketDefaults,money}.test.ts` (04-05), `plan.test.ts` (04-06), `assess.test.ts` (04-07), `firstRead.test.ts` (04-08), `{bisect,options}.test.ts` (04-09), `{alternatives,setbacks}.test.ts` (04-10), `golden.test.ts` (04-11), `{public-api,outputs-are-codes}.test.ts` (04-12): DEC-04 to DEC-16.
- [ ] Golden fixtures `src/engine/payoff/__tests__/golden/prototype-payoff.json` and `src/engine/decide/__tests__/golden/prototype-decide.json` (04-03), reproducible with `--check` (D-22).
- [ ] Named deviation tests: D-17, D-20 (04-04); D-07, D-18, instalment path (04-06); D-20 bisection, D-05, D-06 (04-09); D-06, D-05 spare floor (04-10); D-01/D-02/D-03, D-08/D-09/D-10, D-12 (04-11).

---

## Manual-Only Verifications

All phase behaviours have automated verification. This is a pure engine with no UI or I/O.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (TDD RED steps)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-09-26 — pending execution
