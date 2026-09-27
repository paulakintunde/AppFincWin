---
phase: 4
slug: decide-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-26
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 (jest-expo preset), fast-check 4.10.1 with @fast-check/jest |
| **Config file** | `jest.config.js`. Its 100% per-folder thresholds switch on for `src/engine/decide/` and `src/engine/payoff/` once source exists (Phase 0 D-21) |
| **Quick run command** | `npx jest src/engine/decide src/engine/payoff` |
| **Full suite command** | `npx jest --coverage` plus `npm run depcruise` |
| **Estimated runtime** | Under 15 seconds for the quick run; about 60 seconds for the full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/engine/decide src/engine/payoff`
- **After every plan wave:** Run `npx jest --coverage` and `npm run depcruise`
- **Before `/gsd-verify-work`:** The full suite must be green at 100% branch coverage on `engine/decide` and `engine/payoff`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are filled in by the planner. Each row maps a requirement to its automated check (from `04-RESEARCH.md` § Validation Architecture).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DEC-01 | — | N/A | unit + golden | `npx jest src/engine/payoff/__tests__/amortise.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-02 | — | N/A | unit + golden | `npx jest src/engine/payoff/__tests__/futureValue.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-03 | — | N/A | unit | `npx jest src/engine/payoff/__tests__/simulateMinimum.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-04 | — | N/A | unit matrix | `npx jest src/engine/decide/__tests__/plan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-05 | — | N/A | unit | `npx jest src/engine/decide/__tests__/plan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-06 | — | N/A | unit | `npx jest src/engine/decide/__tests__/assess.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-07 | — | N/A | unit boundaries | `npx jest src/engine/decide/__tests__/money.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-08 | — | N/A | unit + property | `npx jest src/engine/decide/__tests__/share.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-09 | — | N/A | unit + property | `npx jest src/engine/decide/__tests__/bisect.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-10 | — | N/A | unit matrix | `npx jest src/engine/decide/__tests__/cardRule.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-11 | — | N/A | unit | `npx jest src/engine/decide/__tests__/secured.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-12 | — | Engine purity: no I/O reachable | static | `npm run depcruise` | ✅ | ⬜ pending |
| TBD | TBD | TBD | DEC-13 | — | N/A | unit | `npx jest src/engine/decide/__tests__/options.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-14 | — | N/A | unit | `npx jest src/engine/decide/__tests__/alternatives.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-15 | — | N/A | unit | `npx jest src/engine/decide/__tests__/setbacks.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEC-16 | — | N/A | unit | `npx jest src/engine/decide/__tests__/firstRead.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engine/payoff/__tests__/amortise.test.ts`, `futureValue.test.ts`, `simulateMinimum.test.ts`: DEC-01 to DEC-03.
- [ ] `src/engine/decide/__tests__/{plan,assess,money,share,bisect,cardRule,secured,options,alternatives,setbacks,firstRead}.test.ts`: DEC-04 to DEC-16.
- [ ] `src/engine/decide/__tests__/golden/*.json`: prototype parity fixtures (D-22), within ±1 minor unit.
- [ ] `src/engine/decide/__tests__/deviations/*.test.ts`: one named test per deviation (D-02, D-06, D-07, D-08, D-17, D-18, D-20 at minimum).

---

## Manual-Only Verifications

All phase behaviours have automated verification. This is a pure engine with no UI or I/O.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
