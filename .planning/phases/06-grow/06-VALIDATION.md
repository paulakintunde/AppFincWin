---
phase: 6
slug: grow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 06-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (jest-expo preset) + fast-check + `@fast-check/jest`; pgTAP for SQL; Stryker for engine mutation (existing) |
| **Config file** | `jest.config.js` (thresholds), `jest.engine.config.js` (engine only, node env) |
| **Quick run command** | `npx jest <single test file for the task>` (engine: `npm run test:engine -- src/engine/grow`) |
| **Full suite command** | `npm test` then `npm run test:coverage` at milestones only (owner rule: quick checks per plan, full suite at milestones) |
| **Other gates** | `npm run typecheck`, `npm run lint`, `npm run depcruise`, `npm run lint:migrations`, `npm run check:right-answers`, `npm run check:cache-version`, `npm run check:money-mirror` |
| **Estimated runtime** | ~5–30 s per file; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the single named test file for that task, plus `npm run typecheck` when types change.
- **After every plan wave:** `npx jest src/engine src/features/grow src/features/decide/snapshot` + `npm run lint` + `npm run depcruise` + `npm run check:right-answers`.
- **Before `/gsd-verify-work`:** `npm run test:coverage`, `npm run lint:migrations`, pgTAP suite, `npm run check:cache-version`, `npm run check:money-mirror` all green.
- **Max feedback latency:** 60 seconds per task.

---

## Per-Requirement Verification Map

Task IDs are filled in by the planner (each plan's tasks reference the row they satisfy).

| Req / Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------------|----------|-----------|-------------------|-------------|--------|
| GRW-01 | Goal with or without target; two-way plan, ceiling rule ($48.34, $82.86) | unit + property | `npx jest src/engine/grow/__tests__/goalPlan` | ❌ W0 | ⬜ pending |
| GRW-01 | Open-ended goal insert passes shape check | pgTAP | `supabase test db` (file 89) | ❌ W0 | ⬜ pending |
| GRW-02 | Exactly one live flagged safety-net goal per owner; second insert fails | pgTAP | file 89 | ❌ W0 | ⬜ pending |
| GRW-03 / D-25 | Series linked to goal produces one Expected line; confirm writes paired legs; counted once in Decide month | unit + contract | `npx jest src/features/grow/connect src/features/decide/snapshot/v3` | ❌ W0 | ⬜ pending |
| GRW-04 | Holding type set; value and as-of required | unit + pgTAP | `npx jest src/db/__tests__/holdings`; file 91 | ❌ W0 | ⬜ pending |
| GRW-05 / D-24 | Lots: buy, sell (average cost), dividend, fee; basis never negative; sells ≤ units held | unit + property | `npx jest src/engine/grow/__tests__/lots` | ❌ W0 | ⬜ pending |
| GRW-06 | Gain per holding = value − basis; total = sum; LEDGER (+650, +40, 690) | unit | `npx jest src/engine/grow/__tests__/gain` | ❌ W0 | ⬜ pending |
| GRW-07 / D-28 | Loan/card fields saved; typed minimum used, else estimated minimum labelled; paid-in-full excluded | unit | `npx jest src/features/grow/debts` | ❌ W0 | ⬜ pending |
| GRW-08 | Strategy results match calc.js (114,868 / 128,030 / 218,434 cents); one debt both orders equal | unit + property | `npx jest src/engine/payoff/__tests__/strategies` | ❌ W0 | ⬜ pending |
| GRW-09 | Auto loan 30 payments, 75,636 interest, last 12,836; +50 gives 26 / 64,491 | unit | `npx jest src/engine/payoff/__tests__/fixedPayoff` | ❌ W0 | ⬜ pending |
| GRW-10 | As-of shown beside every value; stale at day 31 not 30 | unit + RNTL | `npx jest src/features/grow/investing` | ❌ W0 | ⬜ pending |
| GRW-11 | APY illustration: 4% $200/month 10y = $29,449.98; start 7,690 = $40,914.44 | unit | `npx jest src/engine/payoff/__tests__/compoundSteps` | ❌ W0 | ⬜ pending |
| D-05 / D-06 / D-22 | Locked goals + safety net kept out; unlocked counted and named; existing right-answer cases unchanged | right-answers + golden | `npx jest src/engine/decide/v3/__tests__/rightAnswers`; `npm run check:right-answers` | ❌ W0 (new cases) | ⬜ pending |
| D-07 / D-22 | Migration copies safety net, all existing goals Locked; answers byte-identical before/after | pgTAP + parity jest | file 90; `npx jest src/features/grow/connect/parity` | ❌ W0 | ⬜ pending |
| D-16 | Sale closes debt in one save (atomic, one undo) | unit (mutation) + pgTAP | `npx jest src/data/mutations/__tests__/growSale` | ❌ W0 | ⬜ pending |
| D-21 | Typed calculators reproduce GC10/20/30/40 | unit | `npx jest src/features/grow/calculators` | ❌ W0 | ⬜ pending |
| D-26 | Net worth uses holdings, skips investment-account balance once a holding exists | unit | `npx jest src/features/grow/netWorth` | ❌ W0 | ⬜ pending |
| D-27 | G10 "Lines you will not cross" reads/writes existing lines store | RNTL | `npx jest src/features/grow/lines` | ❌ W0 | ⬜ pending |
| Criterion 8 | Adding a debt never raises the lowest point | property over `evaluate` | `npx jest src/engine/decide/v3/__tests__/invariants` | partial (extend) | ⬜ pending |
| Compliance | No forbidden words in Grow copy (recommend, advice, should, best, better, optimal) | unit string scan | `npx jest src/features/grow/__tests__/copyLint` | ❌ W0 | ⬜ pending |
| Integer money | Engine results are safe integers | property | in each engine test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Property-test invariants (fast-check)
- `fixedPayoff`/`strategy`: totalInterest ≥ 0; sum of payments = principal + totalInterest exactly; months ≤ 600; more extra never increases months or interest; `never_clears` iff first-month interest ≥ payment (single debt). Do not assert "rate order is always cheaper"; assert both orders equal for one debt.
- `lots`: deterministic replay; selling all units leaves basis 0; conservation (realised + unrealised + remaining basis = proceeds + value − bought).
- `goalPlan`: ceiling is tight (`need*n ≥ left` and `(need−1)*n < left`); `monthsToReach` agrees with a naive loop.

---

## Wave 0 Requirements

- [ ] `src/engine/payoff/__tests__/fixedPayoff.test.ts`, `strategies.test.ts`, `compoundSteps.test.ts` (+ golden JSON from `design/calc.js` outputs)
- [ ] `src/engine/grow/` folder + tests; `'grow'` added to the 100% list in `jest.config.js`
- [ ] `src/features/grow/connect/` contract + parity tests and threshold entry
- [ ] pgTAP `89_grow_goals`, `90_grow_safety_net_migration`, `91_grow_holdings` (first check: Docker / local Supabase available for `supabase test db`)
- [ ] Right-answer cases `goals.json` (+ safety-net additions) with owner approval status
- [ ] Grow copy lint test
- [ ] Shared `growFixtures.ts` built from `design/LEDGER.md`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grow screens match the clickable prototype | all GRW | Visual fidelity | Compare device screens against prototype Jr7VLAStJiDuPxte9vsSgR (#i01 onward) on Pixel 9 / iPhone XR |
| Production schema push | GRW-01..07 | Human-gated prod push | From main checkout env: `npm run supabase:db:push` (runs preflight) |
| Expected-line confirm flow end to end | GRW-03 / D-25 | Needs real recurring materialiser + device | Create goal with monthly amount; next month confirm the Expected line; check both legs + goal saved |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
