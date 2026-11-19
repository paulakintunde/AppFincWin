---
phase: 9
slug: tiers-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-18
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `09-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + RNTL (app), pgTAP (Postgres), `deno test` (Edge Functions), fast-check 4.x (properties) |
| **Config file** | `jest.config.*` (existing), `supabase/tests/database/*.test.sql`, `deno.json` per function |
| **Quick run command** | `npx jest src/features/plans src/features/levels src/features/onboarding src/data/sync` |
| **Full suite command** | `npm run lint && npm run typecheck && npm test && npm run test:deno` plus the rls CI job (pgTAP) |
| **Estimated runtime** | quick ~60 s; full suite runs at milestones only |

---

## Sampling Rate

- **After every task commit:** quick run for the touched folder (project rule: quick checks per plan, full suite at milestones)
- **After every plan wave:** lint + typecheck + Jest + `test:deno`; pgTAP when migrations change
- **Before `/gsd-verify-work`:** full suite green; pgTAP on a local stack
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Filled by the planner per task. Requirement-level map:

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| TIER-01 | answers → level (skip-all = Everyday) | unit + property | `npx jest src/features/levels/__tests__/levelFor` | ❌ W0 | ⬜ pending |
| TIER-02/03 | access order plan > household > level; holds-data never hides | unit | `npx jest src/features/levels/__tests__/featureAccess` | ❌ W0 | ⬜ pending |
| TIER-04 | re-run pre-fills; "Keep what I have" changes nothing | RNTL | `npx jest src/features/onboarding` | ❌ W0 | ⬜ pending |
| TIER-05 | weekly cap, 30-day snooze, never on Decide | unit | `npx jest src/features/levels/__tests__/offers` | ❌ W0 | ⬜ pending |
| TIER-06 | household feature needs sharing, not level | unit | `npx jest src/features/household/__tests__/useFeature` | ✅ extend | ⬜ pending |
| TIER-07 | webhook → plan record; cross-device read | deno + pgTAP | `deno test supabase/functions/plan-webhook`; pgTAP `plans_*` | ❌ W0 | ⬜ pending |
| TIER-08 | restore path, transfer rule | RNTL with store adapter mock | `npx jest src/features/plans` | ❌ W0 | ⬜ pending |
| TIER-09 | LockedSheet names the tapped action | RNTL | `npx jest src/features/plans/__tests__/lockedSheet` | ❌ W0 | ⬜ pending |
| TIER-10 | Subscription row one level from You; Manage opens store | RNTL | `npx jest src/features/you/__tests__` | ✅ extend | ⬜ pending |
| D-10/D-21/D-39 | seats 1/2/6/12, payer approval, switch rule (unknown country = no rule) | pgTAP | `npm run test:rls` | ❌ W0 | ⬜ pending |
| D-02/D-40 | every records table refuses writes when locked; bypasses work | pgTAP | pgTAP `plans_lock` | ❌ W0 | ⬜ pending |
| D-40 client | 402 → `locked`, kept on phone, replayed | Jest | `npx jest src/data/sync` | ✅ extend | ⬜ pending |
| D-03 export | simple CSV export works when locked | Jest | `npx jest src/features/export` | ❌ W0 | ⬜ pending |
| ANL-07 | consent once, last step, equal weight | RNTL | `npx jest src/features/consent src/features/onboarding` | ✅ extend | ⬜ pending |
| ANL-08 | typed level events, consent-gated, no money | Jest + typecheck fixture | `npx jest src/services/analytics` | ✅ extend | ⬜ pending |
| ENV-12 | RevenueCat project, products, webhook live | manual | HUMAN-UAT | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Per-plan task map (planner, 2026-11-18)

| Plan | Wave | Task(s) | Automated command | Covers |
|------|------|---------|-------------------|--------|
| 09-01 | 1 | 1-3 | banned-word node script over 09-WORDING.md; `grep Signed:` | D-32 map, wording sign-off (owner gate) |
| 09-02 | 1 | 1-2 | `npx supabase test db supabase/tests/database/111_plans_core.test.sql` (+102, 104) | TIER-07 data model, D-10, D-13, D-16, D-30 |
| 09-03 | 2 | 1-2 | `npx supabase test db` (112 + full suite) | D-02, D-40 server lock, D-29 backfill |
| 09-04 | 2 | 1-2 | `npx supabase test db` (113, 114) | D-10, D-21, D-39, D-41, D-42 |
| 09-05 | 3 | 1-2 | `npx supabase test db` (115) | D-13, D-16, D-19 |
| 09-06 | 2 | 1-2 | `npm run test:deno` (subscriber, verify, sync) | TIER-07 webhook |
| 09-07 | 3 | 1-2 | `npm run test:deno` (refresh, grant) | TIER-07/08, D-29 grants |
| 09-08 | 4 | 1-4 | gate + `grep` push log; owner checkpoints | ENV-12, schema push [BLOCKING] |
| 09-09 | 1 | 1-2 | `npx jest src/data/sync` | D-40 client |
| 09-10 | 1 | 1-3 | `npx jest src/features/plans` | TIER-07/08, D-08, D-16 |
| 09-11 | 2 | 1 (TDD) | `npx jest src/features/levels` | TIER-01/02 |
| 09-12 | 2 | 1-2 | `npx jest src/i18n src/services/analytics src/ui/status` | ANL-08, copy guard |
| 09-13 | 3 | 1-3 | `npx jest src/features/levels src/features/grow src/features/household` | TIER-02/03/06 |
| 09-14 | 3 | 1-2 | `npx jest src/features/plans` | TIER-07/08/09, D-22, D-44 |
| 09-15 | 4 | 1-2 | `npx jest src/features/you src/features/plans` | TIER-10, D-14, D-23 |
| 09-16 | 3 | 1-2 | `npx jest src/features/plans` | TIER-09, D-03 |
| 09-17 | 4 | 1-2 | `npx jest src/features/plans/__tests__/writeGateWiring.test.tsx` (+touched folders) | TIER-09, D-04 |
| 09-18 | 4 | 1-2 | `npx jest src/features/export` | D-03 export, D-40 notice |
| 09-19 | 5 | 1-2 | `npx jest src/features/plans/notices` | D-18, D-19, D-21a |
| 09-20 | 4 | 1-2 | `npx jest src/features/household` | D-17, D-20, D-21, D-39, D-43 |
| 09-21 | 4 | 1-2 | `npx jest src/features/onboarding src/features/consent` | TIER-01/04, ANL-07/08 |
| 09-22 | 4 | 1-2 | `npx jest src/features/levels` | TIER-03/05/06 |
| 09-23 | 5 | 1-2 | `npx jest src/features/onboarding src/features/household/join` | TIER-01/04, D-28, D-30 |
| 09-24 | 5 | 1-2 | `npx jest src/features/onboarding` | D-17b, D-28 |
| 09-25 | 6 | 1-3 | full suite + owner device pass | all |


---

## Wave 0 Requirements

- [ ] pgTAP files for plan state, seats, lock (all records tables), invites, switch rule, backfill
- [ ] `supabase/functions/plan-webhook/*.test.ts` and recorded RevenueCat payload fixtures (`_fixtures/revenuecat/`)
- [ ] Jest fixtures: fake store adapter, plan-state provider, level answer matrix
- [ ] `test:deno` script extended to the new functions
- [ ] Analytics catalogue typecheck fixture rows for the new level events

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RevenueCat project, 8 Google + 12 Apple products, webhook secret | ENV-12 | Store consoles | Checklist in HUMAN-UAT |
| Real Android purchase, trial, upgrade, restore | TIER-07/08 | Needs Play account + internal track (owner: not active yet) | License-tester run once the Play account is live; open item, does not block close |
| iOS purchase, trial, DeviceCheck | TIER-07/08, D-16 | Apple enrolment pending (D-24) | Sandbox/TestFlight later; open item |
| First-run flow on device (questions → look-around → plans) | TIER-01, D-28 | Store sheet not scriptable | Pixel device pass with checklist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
