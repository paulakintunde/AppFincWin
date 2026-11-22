---
phase: 7
slug: insights
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-22
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 via `jest-expo`; fast-check 4.10.1 (properties); React Native Testing Library (components) |
| **Config file** | `jest.config.js` (thresholds), `jest.engine.config.js` (engine only) |
| **Quick run command** | `npx jest <touched folder> --coverage=false` (e.g. `npx jest src/engine/health src/engine/insights src/engine/grow src/engine/month --coverage=false`) |
| **Full suite command** | `npm test` (CI `npm run test:coverage`) plus `npm run typecheck`, `npm run lint`, `npm run depcruise`, `npm run check:icons` |
| **Estimated runtime** | quick ~30 s; engine suite ~2 min; full ~8 min |

---

## Sampling Rate

- **After every task commit:** quick run for the touched folder.
- **After every plan wave:** `npm run test:engine`, `npm run typecheck`, `npm run depcruise`.
- **Before `/gsd-verify-work`:** full suite green. Full local coverage only at the phase milestone (owner rule: quick checks per plan). Mutation run deferred to pre-launch; config added now.
- **Max feedback latency:** 120 seconds.

---

## Per-Task Verification Map

Filled in by the planner per task. Requirement-level map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| INS-06 | Recipe weights/caps, part rounding, clamp 0..100, parts add to headline | unit + property | `npx jest src/engine/health --coverage=false` | ❌ W0 | ⬜ pending |
| INS-06 / D-03 | Short month never scores 75+ | property | same | ❌ W0 | ⬜ pending |
| INS-06 / D-02 | Score module imports nothing from `decide/` or `month/`; inputs only via adapter over Decide figures | unit | same | ❌ W0 | ⬜ pending |
| INS-06 / D-05 | Thin data returns a missing code, no partial score | unit | same | ❌ W0 | ⬜ pending |
| INS-01 | `netWorthSeries` uses `netWorthOf` per point; month-ends + today; holdings from first dated value (D-22); debts held flat; accounts absent before they exist; unconverted left out | unit + property | `npx jest src/engine/grow --coverage=false` | ❌ W0 | ⬜ pending |
| INS-01 / D-23 | Just me counts personal accounts only; Household counts joint once | integration | `npx jest src/data/queries src/features/insights --coverage=false` | ❌ W0 | ⬜ pending |
| INS-02 / INS-03 | `monthBars(p,{throughCurrent:false})` equals `pastMonthBars`; current month bar; leading empty months trimmed; window ≤ 12 + current (D-21) | unit + property | `npx jest src/engine/month --coverage=false` | extend | ⬜ pending |
| INS-04 | Category totals: paid only, refunds net, settlements/transfers/envelope moves excluded, shares sum, sum ≤ out | unit + property | `npx jest src/engine/insights --coverage=false` | ❌ W0 | ⬜ pending |
| INS-05 | `compareMonths` change, sort by absolute change, new/none markers, missing previous month | unit | same | ❌ W0 | ⬜ pending |
| D-16 | Registry ↔ LEVEL-MAP drift test, counts, area `Insight`; tab hidden below level 2 | unit + component | `npx jest src/features/levels src/shell/tabBar src/services/analytics --coverage=false` | extend | ⬜ pending |
| D-18 / D-19 / ARC-22 | Partner's personal line never reaches either view; score row replaced in Household | integration | `npx jest src/features/insights src/data/queries --coverage=false` | ❌ W0 | ⬜ pending |
| D-04 / S1 | Copy guard `insights.` set (grade words, advice); no hard-typed text | unit + lint | `npx jest src/i18n --coverage=false`; `npm run lint` | ❌ W0 | ⬜ pending |
| UI | Range control, three tiles stack at large font, chart a11y labels, Reduce Motion, empty/error/offline states | component | `npx jest src/features/insights src/ui --coverage=false` | ❌ W0 | ⬜ pending |
| Gate | 100% coverage for `health`, `insights`, `grow`, `month` engine folders | CI | `npm run test:coverage` | config edit | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Per-task map (planner, 2026-11-22)

| Task | Plan | Wave | Requirement | Automated Command | Status |
|------|------|------|-------------|-------------------|--------|
| 07-01-T1 | 01 | 1 | INS-06 (D-01, D-03, D-05, D-20) | `npx jest src/engine/health --coverage=false` | ⬜ pending |
| 07-01-T2 | 01 | 1 | INS-06 (D-02, ARC-21) | `npx jest src/engine/health` with 100% threshold | ⬜ pending |
| 07-02-T1 | 02 | 1 | INS-02, INS-03 (D-12) | `npx jest src/engine/month --coverage=false` | ⬜ pending |
| 07-02-T2 | 02 | 1 | INS-04, INS-05 (D-13..D-15, D-21) | `npx jest src/engine/insights src/engine/month --coverage=false` | ⬜ pending |
| 07-03-T1 | 03 | 1 | INS-01 (D-08) | `npx jest src/engine/grow src/features/grow --coverage=false` | ⬜ pending |
| 07-03-T2 | 03 | 1 | INS-01 (D-07, D-09, D-10, D-22) | `npx jest src/engine/grow --coverage=false` | ⬜ pending |
| 07-04-T1 | 04 | 1 | INS-01..06 copy (D-04, S1) | `npx jest src/i18n --coverage=false` | ⬜ pending |
| 07-04-T2 | 04 | 1 | Gate (coverage + mutation config) | `node scripts/check-stryker-disables.mjs` | ⬜ pending |
| 07-05-T1 | 05 | 1 | D-16 registry | `npm run typecheck` | ⬜ pending |
| 07-05-T2 | 05 | 1 | D-16 level map drift | `npx jest src/features/levels src/services/analytics src/i18n --coverage=false` | ⬜ pending |
| 07-06-T1 | 06 | 1 | INS-03 neutral left bars | `npx jest src/features/decide/screens/answer/detail --coverage=false` | ⬜ pending |
| 07-06-T2 | 06 | 1 | UI primitives | `npx jest src/ui --coverage=false` | ⬜ pending |
| 07-07-T1 | 07 | 2 | D-18, D-19, ARC-22 | `npx jest src/data/queries/__tests__/insights.test.ts src/features/insights src/features/home --coverage=false` | ⬜ pending |
| 07-07-T2 | 07 | 2 | INS-01 (D-11, D-23) | `npx jest src/data/queries/__tests__/insightsNetWorth.test.ts --coverage=false` | ⬜ pending |
| 07-08-T1 | 08 | 2 | INS-04 rows, range control | `npx jest src/features/insights --coverage=false` | ⬜ pending |
| 07-08-T2 | 08 | 2 | INS-01, INS-02 charts | `npx jest src/features/insights src/ui --coverage=false` | ⬜ pending |
| 07-09-T1 | 09 | 3 | INS-02, INS-03 (Decide parity) | `npx jest src/features/insights --coverage=false` | ⬜ pending |
| 07-09-T2 | 09 | 3 | INS-04, INS-05 | `npx jest src/features/insights --coverage=false` | ⬜ pending |
| 07-10-T1 | 10 | 3 | INS-01 | `npx jest src/features/insights/sections --coverage=false` | ⬜ pending |
| 07-10-T2 | 10 | 3 | INS-06 (D-03, D-04, D-05, D-19) | `npx jest src/features/insights/sections --coverage=false` | ⬜ pending |
| 07-11-T1 | 11 | 4 | INS-01..06 screen | `npx jest src/features/insights --coverage=false` | ⬜ pending |
| 07-11-T2 | 11 | 4 | D-16 tab gate | `npx jest src/shell/tabBar src/features/levels --coverage=false` | ⬜ pending |
| 07-12-T1 | 12 | 5 | Phase gate | `npm run typecheck && npm run lint && npm run depcruise && npm run check:icons && npm run check:stryker-disables && npm run test:coverage` | ⬜ pending |
| 07-12-T2 | 12 | 5 | Sign-off, ACT-06 citation | `grep -c "nyquist_compliant: true" 07-VALIDATION.md` | ⬜ pending |

Criterion 5 (ACT-06) is already met in Phase 2.2 (`.planning/phases/02.2-record-polish/02.2-VERIFICATION.md`); no task builds it.


---

## Wave 0 Requirements

- [ ] `src/engine/health/__tests__/` (score, inputs, short property)
- [ ] `src/engine/insights/__tests__/` (categories, compare)
- [ ] `src/engine/grow/__tests__/` (netWorthSeries, holdingValueOn; move `netWorth.test.ts`)
- [ ] `src/engine/month/__tests__/monthBars.test.ts`
- [ ] `jest.config.js` 100% list: add `health`, `insights`
- [ ] `stryker.config.mjs` `mutate` and `scripts/check-stryker-disables.mjs` targets: add both folders
- [ ] `src/i18n/copyGuard/rules.json` `insights` set and its test
- [ ] `src/features/insights/__tests__/*`, `src/data/queries/__tests__/insights*.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bars grow once, calm; Reduce Motion respected | UI | Motion feel on device | Pixel device: open Insights twice; toggle Remove animations |
| TalkBack reads each bar/point label and the chart summary | UI | Screen reader on device | Pixel + TalkBack swipe through each chart |
| Score agrees with Decide on the same day | INS-06 / D-06 | Cross-screen check on real data | Open Decide, then Insights; parts match Decide's month figures |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
